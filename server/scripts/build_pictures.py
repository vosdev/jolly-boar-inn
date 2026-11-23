"""Copy each question's picture into the client under a name that says nothing about it.

A pack question's ``image``, and a ``matching`` field's ``icon``, is an asset id, ``item:<id>``,
``npc:<id>`` or ``place:<slug>``, and for Who's That NPC? and Pixel Hunt that id is the answer.
``fetch_assets.py`` stages the files under those ids in ``.pictures/<kind>/<id>.<ext>``,
outside the client. A ``picture_pin``'s ``screenshot``, ``screenshot:<name>``, is an own
screenshot staged by hand as ``.pictures/screenshot/<name>.<ext>``, copied as it is, and must
be the ``width`` by ``height`` its question says: the question grades on that shape. A
``map_pin``'s ``minimap`` is baked from the world map's tiles (``minimap.py``), so ``make gen-map``
comes first; without the tiles it is missing like an unstaged file.
This copies every one a pack uses
to ``client/public/pictures/<random>.<ext>`` and records ``asset -> file`` in
``data/pictures.json``, which the server loads to name a question's picture. Both are
git-ignored, so every install has its own names. ``public/`` because Vite copies it as it is:
the bundler would merge a picture with an identical item icon and serve it under the icon's id.

An item's picture is cropped to what is not transparent, padded to a square with a transparent
margin and shrunk to at most ``MAX_SIDE`` px, never enlarged, so the item fills its picture
rather than sitting in the wiki's empty canvas. It is always written as a PNG, which Pillow
writes the same bytes for every time it is given the same picture.

A picture keeps its name while the file written for it stays the same. A new one, or one whose
file changed, gets a fresh name: ``/pictures/`` is served as immutable, so a changed file under
an old name would never reach a browser that cached it. A picture no pack uses any more, or
whose staged file is gone, is dropped, along with anything else in the client's folder.

Packs that would not load, or an output git would commit, write nothing.

Usage (from ``server/``)::

    uv run python scripts/build_pictures.py
"""

import argparse
import hashlib
import io
import json
import secrets
import sys
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path

import minimap
from fetch_assets import (
    EXTENSIONS,
    PICTURES,
    REPO_ROOT,
    NotIgnored,
    git_ignored,
    write_atomic,
)
from PIL import Image

from app.map import LAYER, MANIFEST, PIN
from app.questions import vocab
from app.questions.packs import Pack, PackError, load_packs
from app.questions.types.map_pin import picture_asset

PACKS = REPO_ROOT / "data" / "packs"
OUT = REPO_ROOT / "client" / "public" / "pictures"
MAPPING = REPO_ROOT / "data" / "pictures.json"
MAX_SIDE = 512
MINIMAP = "minimap:"


@dataclass
class Report:
    kept: list[str] = field(default_factory=list)
    named: list[str] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)
    # Used by a pack but not staged: its question shows without a picture.
    missing: list[str] = field(default_factory=list)


def used_assets(packs: Iterable[Pack]) -> list[str]:
    """Every asset a pack question shows, as its ``image``, a field's ``icon``, its
    ``screenshot`` or its ``minimap``, sorted."""
    used: set[str] = set()
    for pack in packs:
        for q in pack.questions:
            payload = q["payload"]
            for key in ("image", "screenshot"):
                if key in payload:
                    used.add(payload[key])
            pinned = picture_asset(payload) if q["type"] == "map_pin" else None
            if pinned is not None:
                used.add(pinned)
            used.update(field["icon"] for field in payload.get("fields", []) if "icon" in field)
    return sorted(used)


def screenshot_sizes(packs: Iterable[Pack]) -> dict[str, set[tuple[int, int]]]:
    """Each screenshot a pack question pins on, to the ``(width, height)`` its questions say."""
    sizes: dict[str, set[tuple[int, int]]] = {}
    for pack in packs:
        for q in pack.questions:
            payload = q["payload"]
            if "screenshot" in payload:
                size = (payload["width"], payload["height"])
                sizes.setdefault(payload["screenshot"], set()).add(size)
    return sizes


def misshapen(body: bytes, sizes: set[tuple[int, int]]) -> bool:
    """Whether the screenshot in ``body`` is any other size than all of ``sizes``."""
    with Image.open(io.BytesIO(body)) as opened:
        return sizes != {opened.size}


def staged(staging: Path, asset: str) -> Path | None:
    """The staged file for ``asset``, in the first format ``EXTENSIONS`` lists that is there."""
    kind, number = asset.split(":", 1)
    for ext in EXTENSIONS:
        path = staging / kind / f"{number}.{ext}"
        if path.is_file():
            return path
    return None


def squared(body: bytes) -> bytes:
    """``body``'s image cropped to its opaque part, padded square, at most ``MAX_SIDE``, as PNG."""
    with Image.open(io.BytesIO(body)) as opened:
        image = opened.convert("RGBA")
    box = image.getchannel("A").getbbox()
    if box is not None:
        image = image.crop(box)
    side = max(image.size)
    square = Image.new("RGBA", (side, side))
    square.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    if side > MAX_SIDE:
        # Premultiplied, so the fully transparent margin bleeds no black into the edge.
        square = (
            square.convert("RGBa")
            .resize((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
            .convert("RGBA")
        )
    out = io.BytesIO()
    square.save(out, "PNG", optimize=True)
    return out.getvalue()


CLIENT_MAP = REPO_ROOT / "client" / "public" / "map"


def tiles_dir(pin: Path = PIN, client: Path = CLIENT_MAP) -> Path | None:
    """The pinned tileset's zoom 2 tiles, or ``None`` while it is not whole."""
    cache_id = json.loads(pin.read_text(encoding="utf-8"))["cache_id"]
    layer = client / str(cache_id) / LAYER
    return layer / str(minimap.NATIVE_ZOOM) if (layer / MANIFEST).is_file() else None


def baked(asset: str, tiles: Path) -> bytes:
    """The picture of a ``minimap:<x>_<y>_<angle>`` asset."""
    x, y, angle = (int(part) for part in asset.removeprefix(MINIMAP).split("_"))
    return minimap.bake(tiles, x, y, angle)


def load_mapping(path: Path) -> dict[str, dict[str, str]]:
    """The mapping a previous run wrote, or an empty one."""
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def build(
    assets: list[str],
    staging: Path,
    out: Path,
    mapping_path: Path,
    *,
    sizes: Mapping[str, set[tuple[int, int]]] | None = None,
    tiles: Path | None = None,
    fresh: Callable[[], str] = lambda: secrets.token_hex(8),
) -> Report:
    """Bring ``out`` and ``mapping_path`` in line with ``assets`` and what ``staging`` holds.

    Raises ``ValueError``, writing nothing, for a screenshot of another size than ``sizes`` says.
    """
    wrong = [
        asset
        for asset, shapes in (sizes or {}).items()
        if (source := staged(staging, asset)) is not None and misshapen(source.read_bytes(), shapes)
    ]
    if wrong:
        raise ValueError(f"not the width and height their questions say: {', '.join(wrong)}")
    old = load_mapping(mapping_path)
    taken = {Path(entry["file"]).stem for entry in old.values()}
    report = Report()
    mapping: dict[str, dict[str, str]] = {}
    files: set[str] = set()
    for asset in assets:
        if asset.startswith(MINIMAP):
            if tiles is None:
                report.missing.append(asset)
                continue
            body, suffix = baked(asset, tiles), ".png"
        elif (source := staged(staging, asset)) is None:
            report.missing.append(asset)
            continue
        else:
            body, suffix = source.read_bytes(), source.suffix
        if asset.startswith("item:") and suffix != ".svg":
            body, suffix = squared(body), ".png"
        digest = hashlib.sha256(body).hexdigest()
        before = old.get(asset)
        if before is not None and before["sha256"] == digest:
            name = Path(before["file"]).stem
            report.kept.append(asset)
        else:
            name = fresh()
            while name in taken:
                name = fresh()
            taken.add(name)
            report.named.append(asset)
        target = out / f"{name}{suffix}"
        if not target.is_file() or target.read_bytes() != body:
            write_atomic(target, body)
        mapping[asset] = {"file": target.name, "sha256": digest}
        files.add(target.name)
    report.dropped = sorted(set(old) - set(mapping))
    if out.is_dir():
        for path in out.iterdir():
            if path.is_file() and path.name not in files:
                path.unlink()
    text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    if not mapping_path.is_file() or mapping_path.read_text(encoding="utf-8") != text:
        write_atomic(mapping_path, text.encode("utf-8"))
    return report


def main(argv: list[str], out: Callable[[str], None] = print) -> int:
    argparse.ArgumentParser(description=__doc__.split("\n\n")[0]).parse_args(argv)
    try:
        vocab.load_all()
        packs = load_packs(PACKS)
        assets = used_assets(packs)
        written = [MAPPING, OUT / "0.png"]
        tracked = sorted(set(written) - git_ignored(written))
        if tracked:
            raise NotIgnored(
                "git would commit these, and they are game assets; ignore them in .gitignore:\n"
                + "\n".join(f"  {path.relative_to(REPO_ROOT)}" for path in tracked)
            )
        report = build(
            assets, PICTURES, OUT, MAPPING, sizes=screenshot_sizes(packs), tiles=tiles_dir()
        )
    except PackError as exc:
        for line in exc.errors:
            print(line, file=sys.stderr)
        return 1
    except (NotIgnored, OSError, ValueError, KeyError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    out(
        f"pictures: {len(report.kept)} kept, {len(report.named)} named,"
        f" {len(report.dropped)} dropped, {len(report.missing)} not staged"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
