"""``scripts/build_pictures.py``: each question picture copied into the client under a random
name that outlives a re-run, a new name for a new or changed file, nothing for an unused one."""

import json
import re
import sys
from pathlib import Path

import pytest

from app.config import REPO_ROOT
from app.questions import vocab
from app.questions.packs import load_packs

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import build_pictures  # noqa: E402
import fetch_assets  # noqa: E402

from tests.packs import PACKS_DIR

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 16


class Install:
    """A staging folder, the client's picture folder and the mapping, all empty."""

    def __init__(self, root: Path) -> None:
        self.staging = root / "staging"
        self.out = root / "pictures"
        self.mapping = root / "pictures.json"

    def stage(self, asset: str, body: bytes = PNG, ext: str = "png") -> None:
        kind, number = asset.split(":")
        path = self.staging / kind / f"{number}.{ext}"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)

    def build(self, *assets: str) -> build_pictures.Report:
        return build_pictures.build(sorted(assets), self.staging, self.out, self.mapping)

    def names(self) -> dict[str, str]:
        mapping = json.loads(self.mapping.read_text(encoding="utf-8"))
        return {asset: entry["file"].split(".")[0] for asset, entry in mapping.items()}

    def files(self) -> set[str]:
        return {path.name for path in self.out.iterdir()} if self.out.is_dir() else set()


@pytest.fixture
def install(tmp_path: Path) -> Install:
    return Install(tmp_path)


def test_each_picture_is_copied_under_a_random_name_that_holds_no_id(install: Install) -> None:
    install.stage("item:4151")
    install.stage("npc:2042", PNG + b"zulrah", "webp")
    install.build("item:4151", "npc:2042")
    names = install.names()
    assert set(names) == {"item:4151", "npc:2042"}
    assert all(re.fullmatch(r"[0-9a-f]{16}", name) for name in names.values())
    assert len(set(names.values())) == 2
    assert install.files() == {f"{names['item:4151']}.png", f"{names['npc:2042']}.webp"}
    assert (install.out / f"{names['npc:2042']}.webp").read_bytes() == PNG + b"zulrah"
    assert not any("4151" in f or "2042" in f for f in install.files())


def test_a_rerun_keeps_names_names_new_assets_and_drops_unused_ones(install: Install) -> None:
    for asset in ("item:4151", "item:11840", "npc:2042"):
        install.stage(asset, PNG + asset.encode())
    install.build("item:4151", "item:11840")
    before = install.names()

    report = install.build("item:4151", "npc:2042")
    after = install.names()
    assert after["item:4151"] == before["item:4151"]
    assert after["npc:2042"] not in before.values()
    assert "item:11840" not in after
    assert install.files() == {f"{after['item:4151']}.png", f"{after['npc:2042']}.png"}
    assert (report.kept, report.named, report.dropped) == (
        ["item:4151"],
        ["npc:2042"],
        ["item:11840"],
    )


def test_a_rerun_with_nothing_changed_rewrites_nothing(install: Install) -> None:
    install.stage("item:4151")
    install.build("item:4151")
    stamps = {p: p.stat().st_mtime_ns for p in [install.mapping, *install.out.iterdir()]}
    install.build("item:4151")
    assert {p: p.stat().st_mtime_ns for p in stamps} == stamps


def test_a_changed_file_gets_a_new_name_so_no_cached_copy_is_served(install: Install) -> None:
    install.stage("item:4151")
    install.build("item:4151")
    before = install.names()["item:4151"]
    install.stage("item:4151", PNG + b"refetched")
    install.build("item:4151")
    after = install.names()["item:4151"]
    assert after != before
    assert install.files() == {f"{after}.png"}


def test_a_picture_that_is_not_staged_has_no_entry_and_no_file(install: Install) -> None:
    install.stage("item:4151")
    install.build("item:4151")
    (install.staging / "item" / "4151.png").unlink()
    report = install.build("item:4151")
    assert install.names() == {}
    assert install.files() == set()
    assert report.missing == ["item:4151"]


def test_a_file_nobody_mapped_is_removed_from_the_client(install: Install) -> None:
    install.out.mkdir(parents=True)
    (install.out / "abyssal_whip.png").write_bytes(PNG)
    install.build()
    assert install.files() == set()


def test_the_assets_come_from_every_pack_questions_image_and_field_icons() -> None:
    vocab.load_all()
    packs = load_packs(PACKS_DIR)
    payloads = [q["payload"] for pack in packs for q in pack.questions]
    images = {p["image"] for p in payloads if "image" in p}
    icons = {f["icon"] for p in payloads for f in p.get("fields", []) if "icon" in f}
    assets = build_pictures.used_assets(packs)
    assert assets == sorted(images | icons)
    assert images and icons


def test_every_pack_questions_image_has_a_picture_in_the_manifest() -> None:
    vocab.load_all()
    manifest = fetch_assets.load_manifest(fetch_assets.MANIFEST)
    pictures = {
        "{}:{}".format(*match["stem"].split("/"))
        for target in manifest
        if (match := fetch_assets.PICTURE.match(target))
    }
    assets = build_pictures.used_assets(load_packs(PACKS_DIR))
    assert [asset for asset in assets if asset not in pictures] == []


def test_what_it_writes_is_git_ignored() -> None:
    written = [build_pictures.MAPPING, build_pictures.OUT / "0123456789abcdef.png"]
    assert fetch_assets.git_ignored(written) == set(written)
