"""``scripts/fetch_assets.py``: the art the client looks for, fetched under the wiki's rules,
never over a file that is there, never a body that is not the image, never committed."""

import json
import math
import os
import sys
import urllib.parse
from pathlib import Path
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.random_events import RANDOM_EVENTS
from tests.test_wiki import FakeClock

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import fetch_assets  # noqa: E402
import wiki  # noqa: E402

MANIFEST = fetch_assets.load_manifest(fetch_assets.MANIFEST)
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 16
AGENT = "quiz-importer - Zezima on Discord"


class FakeWiki:
    """The wiki's API and upload server, answering from ``files`` by title."""

    def __init__(self, files: dict[str, bytes], redirects: dict[str, str] | None = None) -> None:
        self.files = files
        self.redirects = redirects or {}
        self.clock = FakeClock()
        self.sent: list[tuple[str, str | None, float]] = []

    def queries(self) -> list[str]:
        return [url for url, _, _ in self.sent if url.startswith(fetch_assets.API)]

    def answer(self, url: str) -> bytes:
        parsed = urllib.parse.urlsplit(url)
        if url.startswith(fetch_assets.API):
            asked = urllib.parse.parse_qs(parsed.query)["titles"][0].split("|")
            assert len(asked) <= fetch_assets.BATCH
            hops = [{"from": t, "to": self.redirects[t]} for t in asked if t in self.redirects]
            pages = []
            for title in {self.redirects.get(t, t) for t in asked}:
                name = title.removeprefix("File:")
                if name in self.files:
                    upload = urllib.parse.quote(name.replace(" ", "_"))
                    info = [{"url": f"https://oldschool.runescape.wiki/images/{upload}?ab12"}]
                    pages.append({"ns": 6, "title": title, "imageinfo": info})
                else:
                    pages.append({"ns": 6, "title": title, "missing": True})
            return json.dumps({"query": {"redirects": hops, "pages": pages}}).encode()
        name = urllib.parse.unquote(parsed.path.rsplit("/", 1)[1]).replace("_", " ")
        return self.files[name]

    def urlopen(self, request: Any, timeout: float) -> Any:
        self.sent.append((request.full_url, request.get_header("User-agent"), self.clock.now))
        body = self.answer(request.full_url)

        class Response:
            def __enter__(self) -> Response:
                return self

            def __exit__(self, *exc: object) -> None:
                pass

            def read(self, size: int = -1) -> bytes:
                return body

        return Response()


@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """A test that reaches for the network without a fake fails instead."""

    def refuse(*args: object, **kwargs: object) -> None:
        raise AssertionError("a test tried to reach the network")

    monkeypatch.setattr(wiki.urllib.request, "urlopen", refuse)


@pytest.fixture(autouse=True)
def builds(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """Each time a run went on to build the pictures, which here touches nothing."""
    calls: list[int] = []
    monkeypatch.setattr(fetch_assets, "build_pictures", lambda: calls.append(1) or 0)
    return calls


@pytest.fixture
def assets(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """An empty asset folder in place of the client's, every target in it ignored, and an
    empty staging folder for the pictures beside it."""
    folder = tmp_path / "assets"
    monkeypatch.setattr(fetch_assets, "ASSETS", folder)
    monkeypatch.setattr(fetch_assets, "PICTURES", tmp_path / "pictures")
    monkeypatch.setattr(fetch_assets, "git_ignored", lambda paths: set(paths))
    return folder


@pytest.fixture
def agent(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(wiki, "ENV_FILE", tmp_path / ".env")
    monkeypatch.setenv("WIKI_USER_AGENT", AGENT)


def fake_wiki(monkeypatch: pytest.MonkeyPatch, fake: FakeWiki) -> FakeWiki:
    """``fake`` serving every request, throttled on its own clock."""
    monkeypatch.setattr(wiki.urllib.request, "urlopen", fake.urlopen)
    monkeypatch.setattr(
        wiki, "THROTTLE", wiki.Throttle(clock=fake.clock.clock, sleep=fake.clock.sleep)
    )
    return fake


def every_file() -> dict[str, bytes]:
    return {title: PNG for title in MANIFEST.values()}


def written(folder: Path) -> set[str]:
    return {str(path.relative_to(folder)) for path in folder.rglob("*") if path.is_file()}


# --- the User-Agent -------------------------------------------------------------------


def test_a_live_run_without_a_user_agent_fails_before_its_first_request(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, assets: Path
) -> None:
    monkeypatch.delenv("WIKI_USER_AGENT", raising=False)
    monkeypatch.setattr(wiki, "ENV_FILE", tmp_path / ".env")
    fake = fake_wiki(monkeypatch, FakeWiki(every_file()))
    assert fetch_assets.main([]) == 1
    assert fake.sent == []
    assert not assets.exists()


def test_dry_run_and_from_dir_need_no_user_agent(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    assets: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("WIKI_USER_AGENT", raising=False)
    monkeypatch.setattr(wiki, "ENV_FILE", tmp_path / ".env")
    assert fetch_assets.main(["--dry-run"]) == 0
    assert not assets.exists()
    out = capsys.readouterr().out
    count = len(MANIFEST)
    assert f"{count} file(s) to fetch, at least {count + math.ceil(count / 50)} s" in out
    assert "npcs/examiner_chathead.png  <-  File:Examiner (1) chathead.png" in out

    saved = tmp_path / "saved"
    saved.mkdir()
    for title in MANIFEST.values():
        # Saved as a browser names a download: underscores for spaces.
        (saved / title.replace(" ", "_")).write_bytes(PNG)
    assert fetch_assets.main(["--from-dir", str(saved)]) == 0
    assert written(assets) == set(MANIFEST)


# --- a full run -----------------------------------------------------------------------


@pytest.mark.usefixtures("agent")
def test_a_full_run_writes_every_entry_and_a_second_writes_and_sends_nothing(
    monkeypatch: pytest.MonkeyPatch, assets: Path
) -> None:
    fake = fake_wiki(monkeypatch, FakeWiki(every_file()))
    assert fetch_assets.main([]) == 0
    assert written(assets) == set(MANIFEST)
    assert all((assets / target).read_bytes() == PNG for target in MANIFEST)
    titles = len(set(MANIFEST.values()))
    assert len(fake.sent) == titles + math.ceil(titles / fetch_assets.BATCH)
    assert {agent for _, agent, _ in fake.sent} == {AGENT}

    stamps = {target: (assets / target).stat().st_mtime_ns for target in MANIFEST}
    fake.sent.clear()
    assert fetch_assets.main([]) == 0
    assert fake.sent == []
    assert {target: (assets / target).stat().st_mtime_ns for target in MANIFEST} == stamps


@pytest.mark.usefixtures("agent")
def test_the_throttle_spaces_the_query_and_every_download_a_second_apart(
    monkeypatch: pytest.MonkeyPatch, assets: Path
) -> None:
    fake = fake_wiki(monkeypatch, FakeWiki(every_file()))
    assert fetch_assets.main([]) == 0
    times = [at for _, _, at in fake.sent]
    assert fake.sent[0][0].startswith(fetch_assets.API)
    assert times == [1000.0 + n for n in range(len(times))]
    assert fake.clock.slept == [1.0] * (len(times) - 1)


def test_fifty_titles_go_in_one_query_and_the_fifty_first_in_another(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    files = {f"Npc {n} chathead.png": PNG for n in range(51)}
    fake = fake_wiki(monkeypatch, FakeWiki(files))
    source = fetch_assets.WikiSource(wiki.Wiki(AGENT, wiki.THROTTLE))
    located = source.locate(sorted(files))
    assert len(fake.queries()) == 2
    assert set(located.where) == set(files)
    assert located.missing == []


@pytest.mark.usefixtures("agent")
def test_only_fetches_the_categories_it_names(
    monkeypatch: pytest.MonkeyPatch, assets: Path
) -> None:
    fake_wiki(monkeypatch, FakeWiki(every_file()))
    assert fetch_assets.main(["--only", "trophies"]) == 0
    assert written(assets) == {t for t in MANIFEST if t.startswith("trophies/")}


# --- what it refuses ------------------------------------------------------------------


@pytest.mark.usefixtures("agent")
def test_a_body_that_is_not_an_image_is_refused_and_not_written(
    monkeypatch: pytest.MonkeyPatch, assets: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    files = every_file()
    files["Thurgo chathead.png"] = b"<!DOCTYPE html><title>502 Bad Gateway</title>"
    fake_wiki(monkeypatch, FakeWiki(files))
    assert fetch_assets.main([]) == 1
    assert written(assets) == set(MANIFEST) - {"npcs/thurgo_chathead.png"}
    assert "refused: npcs/thurgo_chathead.png" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("body", "ext", "image"),
    [
        (PNG, "png", True),
        (b"\xff\xd8\xff\xe0rest", "jpg", True),
        (b"RIFF\0\0\0\0WEBPVP8 ", "webp", True),
        (b"\0\0\0\x1cftypavif", "avif", True),
        (b'\xef\xbb\xbf<?xml version="1.0"?>\n<svg xmlns="x"/>', "svg", True),
        (PNG, "jpg", False),
        (b"<html><body>Not found</body></html>", "svg", False),
        (b"", "png", False),
    ],
)
def test_a_body_must_be_the_format_its_target_names(body: bytes, ext: str, image: bool) -> None:
    assert fetch_assets.looks_like(body, ext) is image


@pytest.mark.usefixtures("agent")
def test_a_missing_title_is_named_the_rest_still_fetch_and_the_run_fails(
    monkeypatch: pytest.MonkeyPatch, assets: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    files = every_file()
    del files["Ned chathead.png"]
    fake_wiki(monkeypatch, FakeWiki(files))
    assert fetch_assets.main([]) == 1
    assert written(assets) == set(MANIFEST) - {"npcs/ned_chathead.png"}
    assert "missing: npcs/ned_chathead.png: the wiki has no File:Ned chathead.png" in (
        capsys.readouterr().out
    )


@pytest.mark.usefixtures("agent")
def test_a_title_the_wiki_redirects_is_fetched_and_named_for_correcting(
    monkeypatch: pytest.MonkeyPatch, assets: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    files = every_file()
    files["Ned (Draynor) chathead.png"] = files.pop("Ned chathead.png")
    redirects = {"File:Ned chathead.png": "File:Ned (Draynor) chathead.png"}
    fake_wiki(monkeypatch, FakeWiki(files, redirects))
    assert fetch_assets.main([]) == 0
    assert (assets / "npcs/ned_chathead.png").read_bytes() == PNG
    assert "File:Ned chathead.png is File:Ned (Draynor) chathead.png" in capsys.readouterr().out


# --- what it never destroys -----------------------------------------------------------


@pytest.mark.parametrize("fails", ["write", "rename"])
def test_an_interrupted_write_leaves_no_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, fails: str
) -> None:
    target = tmp_path / "npcs" / "bob_chathead.png"

    def half_written(self: Path, data: bytes) -> int:
        with open(self, "wb") as handle:
            handle.write(data[:4])
        raise KeyboardInterrupt

    def no_rename(*args: object) -> None:
        raise KeyboardInterrupt

    if fails == "write":
        monkeypatch.setattr(Path, "write_bytes", half_written)
    else:
        monkeypatch.setattr(os, "replace", no_rename)
    with pytest.raises(KeyboardInterrupt):
        fetch_assets.write_atomic(target, PNG)
    assert list(target.parent.iterdir()) == []


@pytest.mark.usefixtures("agent")
def test_a_file_that_is_there_survives_unless_forced(
    monkeypatch: pytest.MonkeyPatch, assets: Path
) -> None:
    picked = assets / "npcs" / "examiner_chathead.png"
    picked.parent.mkdir(parents=True)
    picked.write_bytes(b"the owner's own pick")
    fake = fake_wiki(monkeypatch, FakeWiki(every_file()))
    assert fetch_assets.main([]) == 0
    assert picked.read_bytes() == b"the owner's own pick"
    assert not any("Examiner" in urllib.parse.unquote(url) for url, _, _ in fake.sent)
    assert fetch_assets.main(["--force"]) == 0
    assert picked.read_bytes() == PNG


# --- never committed ------------------------------------------------------------------


def test_every_target_is_under_the_client_assets_or_staging_and_git_ignored() -> None:
    targets = [
        fetch_assets.destination(target, fetch_assets.ASSETS, fetch_assets.PICTURES)
        for target in MANIFEST
    ]
    roots = (fetch_assets.ASSETS, fetch_assets.PICTURES)
    assert all(any(path.resolve().is_relative_to(root) for root in roots) for path in targets)
    assert fetch_assets.git_ignored(targets) == set(targets)


def test_a_picture_would_be_git_ignored_in_staging() -> None:
    """The shipped manifest may hold no picture yet, and the staging folder is ignored anyway."""
    path = fetch_assets.destination(
        "pictures/item/4151.png", fetch_assets.ASSETS, fetch_assets.PICTURES
    )
    assert path == fetch_assets.PICTURES / "item" / "4151.png"
    assert fetch_assets.git_ignored([path]) == {path}


@pytest.mark.usefixtures("agent")
def test_every_run_builds_the_pictures_after_its_fetch_but_a_dry_one(
    monkeypatch: pytest.MonkeyPatch, assets: Path, builds: list[int]
) -> None:
    fake_wiki(monkeypatch, FakeWiki(every_file()))
    assert fetch_assets.main(["--dry-run"]) == 0
    assert builds == []
    assert fetch_assets.main([]) == 0
    assert builds == [1]


@pytest.mark.usefixtures("agent")
def test_the_pictures_are_built_even_when_a_fetch_failed(
    monkeypatch: pytest.MonkeyPatch, assets: Path, builds: list[int]
) -> None:
    files = every_file()
    del files["Thurgo chathead.png"]
    fake_wiki(monkeypatch, FakeWiki(files))
    assert fetch_assets.main([]) == 1
    assert builds == [1]


def test_a_failed_build_fails_the_run(
    monkeypatch: pytest.MonkeyPatch, assets: Path, tmp_path: Path
) -> None:
    monkeypatch.setattr(fetch_assets, "build_pictures", lambda: 1)
    saved = tmp_path / "saved"
    saved.mkdir()
    for title in MANIFEST.values():
        (saved / title).write_bytes(PNG)
    assert fetch_assets.main(["--from-dir", str(saved)]) == 1


def test_a_picture_is_staged_outside_the_client_under_its_asset_id(tmp_path: Path) -> None:
    manifest = {
        "npcs/bob_chathead.png": "Bob chathead.png",
        "pictures/item/4151.png": "Abyssal whip.png",
    }
    saved = tmp_path / "saved"
    saved.mkdir()
    for title in manifest.values():
        (saved / title).write_bytes(PNG)
    assets, pictures = tmp_path / "assets", tmp_path / "pictures"
    report = fetch_assets.fetch(
        manifest, assets, pictures, fetch_assets.DirSource(saved), out=lambda line: None
    )
    assert report.ok
    assert written(assets) == {"npcs/bob_chathead.png"}
    assert written(pictures) == {"item/4151.png"}


@pytest.mark.usefixtures("agent")
def test_a_target_git_would_commit_is_refused_before_any_request(
    monkeypatch: pytest.MonkeyPatch, assets: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    fake = fake_wiki(monkeypatch, FakeWiki(every_file()))
    monkeypatch.setattr(
        fetch_assets, "git_ignored", lambda paths: {p for p in paths if "thurgo" not in p.name}
    )
    assert fetch_assets.main([]) == 1
    assert fake.sent == []
    assert "thurgo_chathead.png" in capsys.readouterr().err


def test_without_a_git_checkout_nothing_counts_as_ignored(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path))
    with pytest.raises(fetch_assets.NotIgnored, match="git checkout"):
        fetch_assets.git_ignored([tmp_path / "npcs" / "bob.png"], repo=tmp_path)


# --- the manifest ---------------------------------------------------------------------


def test_every_random_event_npc_has_art_in_the_manifest() -> None:
    npcs = {fetch_assets.TARGET.match(t)["stem"] for t in MANIFEST if t.startswith("npcs/")}
    assert [n for n in RANDOM_EVENTS if n not in npcs and f"{n}_chathead" not in npcs] == []


@pytest.mark.parametrize(
    ("manifest", "problem"),
    [
        ({"trophies/gold.png": "a.png", "npcs/bob.png": "b.png"}, "sorted"),
        ({"items/4151.png": "Abyssal whip.png"}, "no category 'items'"),
        ({"npcs/Bob.png": "Bob.png"}, "not <category>"),
        ({"npcs/../../evil.png": "Bob.png"}, "not <category>"),
        ({"npcs/bob.gif": "Bob.gif"}, "not <category>"),
        ({"npcs/bob.png": "File:Bob.png"}, "without 'File:'"),
        ({"npcs/bob.png": ""}, "wiki file name"),
        ({"npcs/bob.png": "Bob.png", "npcs/bob.webp": "Bob.webp"}, "another format"),
        ({"pictures/item/whip.png": "Abyssal whip.png"}, "not pictures/<item|npc>/<id>"),
        ({"pictures/pet/4151.png": "Abyssal whip.png"}, "not pictures/<item|npc>/<id>"),
        ({"pictures/4151.png": "Abyssal whip.png"}, "not pictures/<item|npc>/<id>"),
        (
            {"pictures/item/4151.png": "A.png", "pictures/item/4151.webp": "A.webp"},
            "another format",
        ),
    ],
)
def test_a_malformed_manifest_is_refused(manifest: dict[str, str], problem: str) -> None:
    assert any(problem in error for error in fetch_assets.manifest_errors(manifest))


def test_a_target_listed_twice_is_refused(tmp_path: Path) -> None:
    path = tmp_path / "assets.json"
    path.write_text('{"npcs/bob.png": "A.png", "npcs/bob.png": "B.png"}')
    with pytest.raises(fetch_assets.ManifestError, match="duplicate"):
        fetch_assets.load_manifest(path)


def test_the_logo_sources_are_fetched_though_the_client_never_shows_them() -> None:
    """``make logo`` draws the owner's logo from these; the app itself never looks."""
    assert {"logo/broav_detail.png", "logo/skull.png"} <= set(MANIFEST)


def test_the_shipped_manifest_is_sound() -> None:
    raw = json.loads(fetch_assets.MANIFEST.read_text(encoding="utf-8"))
    assert fetch_assets.manifest_errors(raw) == []
