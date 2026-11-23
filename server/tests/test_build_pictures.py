"""``scripts/build_pictures.py``: each question picture copied into the client under a random
name that outlives a re-run, a new name for a new or changed file, nothing for an unused one, and
an item's picture cropped, squared and shrunk on the way."""

import io
import json
import re
import sys
from pathlib import Path

import pytest
from PIL import Image

from app.config import REPO_ROOT
from app.questions import vocab
from app.questions.packs import Pack, load_packs

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import build_pictures  # noqa: E402
import fetch_assets  # noqa: E402

from tests.packs import PACKS_DIR

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 16
RED = (200, 30, 30, 255)


def picture(
    size: tuple[int, int] = (40, 30),
    box: tuple[int, int, int, int] = (10, 5, 30, 25),
    colour: tuple[int, int, int, int] = RED,
) -> bytes:
    """A transparent PNG of ``size`` with an opaque ``colour`` rectangle over ``box``."""
    image = Image.new("RGBA", size)
    image.paste(colour, box)
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def opened(body: bytes) -> Image.Image:
    with Image.open(io.BytesIO(body)) as image:
        assert image.format == "PNG"
        return image.convert("RGBA")


class Install:
    """A staging folder, the client's picture folder and the mapping, all empty."""

    def __init__(self, root: Path) -> None:
        self.staging = root / "staging"
        self.out = root / "pictures"
        self.mapping = root / "pictures.json"

    def stage(self, asset: str, body: bytes | None = None, ext: str = "png") -> None:
        kind, number = asset.split(":")
        if body is None:
            body = picture() if kind == "item" else PNG
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
    install.stage("item:4151", picture(colour=(1, 2, 3, 255)))
    install.stage("item:11840", picture(colour=(4, 5, 6, 255)))
    install.stage("npc:2042", PNG + b"zulrah")
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
    install.stage("item:4151", picture(colour=(9, 9, 9, 255)))
    install.build("item:4151")
    after = install.names()["item:4151"]
    assert after != before
    assert install.files() == {f"{after}.png"}


def test_a_refetched_item_that_builds_the_same_picture_keeps_its_name(install: Install) -> None:
    install.stage("item:4151", picture(size=(40, 30), box=(10, 5, 30, 25)))
    install.build("item:4151")
    before = install.names()["item:4151"]
    install.stage("item:4151", picture(size=(90, 60), box=(50, 20, 70, 40)))
    report = install.build("item:4151")
    assert install.names()["item:4151"] == before
    assert report.kept == ["item:4151"]


def test_an_item_is_cropped_to_what_is_opaque_and_padded_square() -> None:
    square = opened(build_pictures.squared(picture(size=(100, 80), box=(20, 30, 60, 50))))
    assert square.size == (40, 40)
    assert square.getchannel("A").getbbox() == (0, 10, 40, 30)
    assert square.getpixel((20, 20)) == RED
    assert square.getpixel((20, 5)) == (0, 0, 0, 0)


def test_a_small_item_is_never_enlarged() -> None:
    square = opened(build_pictures.squared(picture(size=(300, 300), box=(100, 120, 130, 200))))
    assert square.size == (80, 80)


def test_a_large_item_is_shrunk_to_the_largest_side() -> None:
    body = picture(size=(1400, 1200), box=(100, 100, 1300, 700))
    square = opened(build_pictures.squared(body))
    assert square.size == (build_pictures.MAX_SIDE, build_pictures.MAX_SIDE)
    # 1200 x 600 becomes 512 x 256, centred; the filter blurs the edge, hence half opaque.
    left, top, right, bottom = square.getchannel("A").point(lambda a: 255 * (a > 127)).getbbox()
    assert (left, right) == (0, 512)
    assert abs(top - 128) <= 1 and abs(bottom - 384) <= 1
    assert square.getpixel((256, 256)) == RED


def test_an_item_without_transparency_is_squared_whole() -> None:
    image = Image.new("RGB", (60, 20), (10, 20, 30))
    out = io.BytesIO()
    image.save(out, "JPEG")
    square = opened(build_pictures.squared(out.getvalue()))
    assert square.size == (60, 60)
    assert square.getchannel("A").getbbox() == (0, 20, 60, 40)


def test_the_png_written_is_the_same_bytes_every_time() -> None:
    body = picture(size=(900, 700), box=(13, 40, 880, 610))
    assert build_pictures.squared(body) == build_pictures.squared(body)


def test_an_item_is_written_as_png_and_an_npc_as_it_came(install: Install) -> None:
    webp = io.BytesIO()
    Image.open(io.BytesIO(picture())).save(webp, "WEBP", lossless=True)
    install.stage("item:4151", webp.getvalue(), "webp")
    install.stage("npc:2042", PNG + b"zulrah")
    install.build("item:4151", "npc:2042")
    names = install.names()
    whip = install.out / f"{names['item:4151']}.png"
    assert whip.read_bytes() == build_pictures.squared(webp.getvalue())
    assert (install.out / f"{names['npc:2042']}.png").read_bytes() == PNG + b"zulrah"


def test_a_screenshot_is_copied_as_it_is_under_a_random_name(install: Install) -> None:
    body = picture(size=(160, 90), box=(0, 0, 160, 90))
    install.stage("screenshot:ice-demon", body)
    install.build("screenshot:ice-demon")
    name = install.names()["screenshot:ice-demon"]
    assert re.fullmatch(r"[0-9a-f]{16}", name)
    assert (install.out / f"{name}.png").read_bytes() == body


def test_a_screenshot_of_another_shape_than_its_question_says_writes_nothing(
    install: Install,
) -> None:
    install.stage("screenshot:ice-demon", picture(size=(160, 90)))
    with pytest.raises(ValueError, match="screenshot:ice-demon"):
        build_pictures.build(
            ["screenshot:ice-demon"],
            install.staging,
            install.out,
            install.mapping,
            sizes={"screenshot:ice-demon": {(1600, 900)}},
        )
    assert not install.mapping.exists() and install.files() == set()
    install.build("screenshot:ice-demon")
    sizes = {"screenshot:ice-demon": {(160, 90)}}
    build_pictures.build(
        ["screenshot:ice-demon"], install.staging, install.out, install.mapping, sizes=sizes
    )
    assert set(install.names()) == {"screenshot:ice-demon"}


def test_the_screenshots_and_their_sizes_come_from_the_pin_questions() -> None:
    payload = {
        "prompt": "Where?",
        "screenshot": "screenshot:ice-demon",
        "width": 160,
        "height": 90,
        "target": {"min_x": 0.1, "max_x": 0.3, "min_y": 0.1, "max_y": 0.3},
        "reach": 0,
    }
    question = {"type": "picture_pin", "mode": "pin_round", "payload": payload}
    packs = [Pack(name="pins", generated_at=None, questions=(question,), path=Path("pins.json"))]
    assert build_pictures.used_assets(packs) == ["screenshot:ice-demon"]
    assert build_pictures.screenshot_sizes(packs) == {"screenshot:ice-demon": {(160, 90)}}


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


def test_the_assets_come_from_every_pack_questions_image_field_icons_and_minimaps() -> None:
    vocab.load_all()
    packs = load_packs(PACKS_DIR)
    payloads = [q["payload"] for pack in packs for q in pack.questions]
    images = {p["image"] for p in payloads if "image" in p}
    icons = {f["icon"] for p in payloads for f in p.get("fields", []) if "icon" in f}
    minimaps = {
        f"minimap:{m['x']}_{m['y']}_{m['angle']}" for p in payloads if (m := p.get("minimap"))
    }
    assets = build_pictures.used_assets(packs)
    assert assets == sorted(images | icons | minimaps)
    assert images and icons and minimaps


def test_every_pack_questions_image_has_a_picture_in_the_manifest() -> None:
    vocab.load_all()
    manifest = fetch_assets.load_manifest(fetch_assets.MANIFEST)
    pictures = {
        "{}:{}".format(*match["stem"].split("/"))
        for target in manifest
        if (match := fetch_assets.PICTURE.match(target))
    }
    assets = build_pictures.used_assets(load_packs(PACKS_DIR))
    fetched = [asset for asset in assets if not asset.startswith(build_pictures.MINIMAP)]
    assert [asset for asset in fetched if asset not in pictures] == []


def test_what_it_writes_is_git_ignored() -> None:
    written = [build_pictures.MAPPING, build_pictures.OUT / "0123456789abcdef.png"]
    assert fetch_assets.git_ignored(written) == set(written)
