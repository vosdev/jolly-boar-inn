"""``scripts/add_detail_pictures.py``: every roster item with a wiki detail image gets a picture
in the manifest, found in one bulk lookup, and the rest are listed and left out."""

import json
import sys
from pathlib import Path

import pytest

from app.config import REPO_ROOT
from tests.test_fetch_assets import AGENT, PNG, FakeWiki

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import add_detail_pictures  # noqa: E402
import fetch_assets  # noqa: E402
import wiki  # noqa: E402

ROSTER = [
    {"id": 4151, "name": "Abyssal whip"},
    {"id": 11802, "name": "Armadyl godsword"},
    {"id": 2552, "name": "Ring of dueling(8)"},
    {"id": 6585, "name": "Amulet of fury"},
]


@pytest.fixture
def files(tmp_path: Path) -> tuple[Path, Path]:
    roster = tmp_path / "popular-items.json"
    roster.write_text(json.dumps({"items": ROSTER}), encoding="utf-8")
    manifest = tmp_path / "assets.json"
    manifest.write_text(
        json.dumps({"items/4151.png": "Abyssal whip.png", "pictures/item/6585.webp": "Fury.webp"}),
        encoding="utf-8",
    )
    return roster, manifest


def source(monkeypatch: pytest.MonkeyPatch, fake: FakeWiki) -> fetch_assets.WikiSource:
    monkeypatch.setattr(wiki.urllib.request, "urlopen", fake.urlopen)
    throttle = wiki.Throttle(clock=fake.clock.clock, sleep=fake.clock.sleep)
    return fetch_assets.WikiSource(wiki.Wiki(AGENT, throttle))


def test_each_item_with_a_detail_image_gets_an_entry_in_one_request(
    monkeypatch: pytest.MonkeyPatch, files: tuple[Path, Path]
) -> None:
    roster, manifest = files
    fake = FakeWiki({"Abyssal whip detail.png": PNG, "Armadyl godsword detail.png": PNG})
    said: list[str] = []
    plan = add_detail_pictures.run(roster, manifest, source(monkeypatch, fake), said.append)

    assert len(fake.sent) == 1
    assert plan.added == {
        "pictures/item/4151.png": "Abyssal whip detail.png",
        "pictures/item/11802.png": "Armadyl godsword detail.png",
    }
    assert plan.missing == ["2552 Ring of dueling(8)"]
    assert "no detail image: 2552 Ring of dueling(8)" in said
    written = fetch_assets.load_manifest(manifest)
    assert written == {
        "items/4151.png": "Abyssal whip.png",
        "pictures/item/11802.png": "Armadyl godsword detail.png",
        "pictures/item/4151.png": "Abyssal whip detail.png",
        "pictures/item/6585.webp": "Fury.webp",
    }
    assert manifest.read_text(encoding="utf-8") == json.dumps(written, indent=2) + "\n"


def test_an_item_that_has_a_picture_is_not_asked_for(
    monkeypatch: pytest.MonkeyPatch, files: tuple[Path, Path]
) -> None:
    roster, manifest = files
    fake = FakeWiki({"Amulet of fury detail.png": PNG})
    add_detail_pictures.run(roster, manifest, source(monkeypatch, fake), lambda _: None)
    assert "Amulet+of+fury" not in fake.queries()[0]
    assert fetch_assets.load_manifest(manifest)["pictures/item/6585.webp"] == "Fury.webp"


def test_a_redirected_title_is_written_as_the_file_it_lands_on(
    monkeypatch: pytest.MonkeyPatch, files: tuple[Path, Path]
) -> None:
    roster, manifest = files
    fake = FakeWiki(
        {"Abyssal whip (detail).png": PNG},
        redirects={"File:Abyssal whip detail.png": "File:Abyssal whip (detail).png"},
    )
    plan = add_detail_pictures.run(roster, manifest, source(monkeypatch, fake), lambda _: None)
    assert plan.added == {"pictures/item/4151.png": "Abyssal whip (detail).png"}


def test_nothing_found_leaves_the_manifest_alone(
    monkeypatch: pytest.MonkeyPatch, files: tuple[Path, Path]
) -> None:
    roster, manifest = files
    before = manifest.read_bytes()
    plan = add_detail_pictures.run(roster, manifest, source(monkeypatch, FakeWiki({})), print)
    assert plan.added == {}
    assert len(plan.missing) == 3
    assert manifest.read_bytes() == before


def test_every_roster_item_with_a_detail_image_has_a_picture() -> None:
    """The committed manifest: only the items the wiki has no detail image for go without."""
    items = json.loads(add_detail_pictures.ROSTER.read_text(encoding="utf-8"))["items"]
    manifest = fetch_assets.load_manifest(fetch_assets.MANIFEST)
    without = sorted(
        item["name"] for item in items if not add_detail_pictures.has_picture(manifest, item["id"])
    )
    assert without == [
        "Amulet of glory(6)",
        "Combat bracelet(4)",
        "Games necklace(8)",
        "Ring of dueling(8)",
    ]
