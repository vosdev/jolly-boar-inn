"""Render the surface map from the game cache into the tiles the client serves.

``data/map.json`` pins an OpenRS2 cache and the hash of its ``disk.zip``. OpenRS2 keeps every
cache, while the wiki retires a tileset weeks after the next one, so a pin stays valid for a
selfhoster who runs this years later. RuneLite's renderer draws each map square without icons or
labels (``map_render/``, the only Java here, which is why this runs in its own image), at 4 px per
game tile. That is zoom 2 of the wiki's grid, and Pillow halves it down to the overview.

Everything is built in ``.map/`` and moved into ``client/public/map/<cache_id>/clean/`` whole, with
its manifest inside, so a stopped run serves nothing. A complete tileset sends no request. The
tiles are git-ignored and ``make image`` bundles them, as it does the question pictures.

Usage: ``make gen-map``.
"""

import hashlib
import json
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from fetch_assets import REPO_ROOT, NotIgnored, git_ignored
from PIL import Image

from app.map import LAYER, MANIFEST, PIN

CLIENT_MAP = REPO_ROOT / "client" / "public" / "map"
STAGE = REPO_ROOT / ".map"
CACHE_URL = "https://archive.openrs2.org/caches/runescape/{cache_id}/disk.zip"
USER_AGENT = "jolly-boar-inn gen-map (https://github.com/vosdev/jolly-boar-inn)"
TIMEOUT_SECONDS = 60
RENDERER = Path("/opt/map-render")
HEAP = "2g"

TILE_SIZE = 256
NATIVE_ZOOM = 2
LOWEST_ZOOM = -3
# The whole surface, oceans included. Further north, the cache holds dungeons and instances.
SQUARES_X = (12, 63)
SQUARES_Y = (28, 67)
_CACHE_FILE = re.compile(r"^cache/(main_file_cache\.(dat2|idx\d+))$")
_SQUARE = re.compile(r"^(\d+)_(\d+)$")


class BadDownload(RuntimeError):
    """A ``disk.zip`` that is not the one ``data/map.json`` pins."""


@dataclass(frozen=True)
class Pin:
    """The cache a tileset is rendered from."""

    cache_id: int
    sha256: str


def read_pin(path: Path = PIN) -> Pin:
    """The pinned cache."""
    pin = json.loads(path.read_text(encoding="utf-8"))
    return Pin(pin["cache_id"], pin["sha256"])


def download(pin: Pin, path: Path) -> None:
    """Fetch the pinned cache's ``disk.zip`` to ``path``."""
    url = CACHE_URL.format(cache_id=pin.cache_id)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})  # noqa: S310
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
        with path.open("wb") as file:
            shutil.copyfileobj(response, file)


def render(cache: Path, squares: Path) -> None:
    """Draw the surface's map squares into ``squares``, one 256 px image each."""
    subprocess.run(  # noqa: S603
        [  # noqa: S607
            "java",
            # The world's regions peak near 1.2 GB, and Java's default cap is a quarter of the
            # host's RAM, which a small server falls short of.
            f"-Xmx{HEAP}",
            "-Djava.awt.headless=true",
            "-cp",
            f"{RENDERER}/*",
            "Render",
            str(cache),
            str(squares),
            *(str(bound) for bound in (*SQUARES_X, *SQUARES_Y)),
        ],
        check=True,
    )


def sha256(path: Path) -> str:
    """The hex digest of a file too large to read at once."""
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def unpack(archive: Path, cache: Path) -> None:
    """Extract the cache's files from a ``disk.zip``, and nothing else it may hold."""
    cache.mkdir(parents=True)
    with zipfile.ZipFile(archive) as files:
        for name in files.namelist():
            if (match := _CACHE_FILE.match(name)) is not None:
                with files.open(name) as source, (cache / match[1]).open("wb") as target:
                    shutil.copyfileobj(source, target)


def tile_path(root: Path, zoom: int, x: int, y: int) -> Path:
    """Where a tile lives, in the wiki's layout: rows count north."""
    return root / str(zoom) / f"0_{x}_{y}.png"


def save(image: Image.Image, root: Path, zoom: int, x: int, y: int) -> bool:
    """Write a tile unless it is all black, which the map's background already draws."""
    if image.getbbox() is None:
        return False
    path = tile_path(root, zoom, x, y)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    return True


def halved(root: Path, zoom: int, x: int, y: int) -> Image.Image:
    """A tile from the four tiles of the zoom above that it covers, north up."""
    joined = Image.new("RGB", (TILE_SIZE * 2, TILE_SIZE * 2))
    for east in (0, 1):
        for north in (0, 1):
            child = tile_path(root, zoom + 1, x * 2 + east, y * 2 + north)
            if child.is_file():
                with Image.open(child) as image:
                    joined.paste(image, (east * TILE_SIZE, (1 - north) * TILE_SIZE))
    return joined.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.BILINEAR)


def build_tiles(squares: Path, out: Path) -> int:
    """Write every zoom from the rendered map squares; returns how many tiles."""
    level: set[tuple[int, int]] = set()
    for path in sorted(squares.glob("*.png")):
        match = _SQUARE.match(path.stem)
        if match is None:
            raise ValueError(f"{path.name} is not a map square")
        x, y = int(match[1]), int(match[2])
        with Image.open(path) as image:
            if save(image.convert("RGB"), out, NATIVE_ZOOM, x, y):
                level.add((x, y))
    count = len(level)
    for zoom in range(NATIVE_ZOOM - 1, LOWEST_ZOOM - 1, -1):
        level = {
            (x, y)
            for x, y in sorted({(x // 2, y // 2) for x, y in level})
            if save(halved(out, zoom, x, y), out, zoom, x, y)
        }
        count += len(level)
    return count


def fetch_cache(pin: Pin, stage: Path, fetch: Callable[[Pin, Path], None]) -> Path:
    """The pinned ``disk.zip``, kept from a stopped run if it can be. ``BadDownload`` if wrong."""
    archive = stage / f"disk-{pin.cache_id}.zip"
    if not archive.is_file() or sha256(archive) != pin.sha256:
        fetch(pin, archive)
        digest = sha256(archive)
        if digest != pin.sha256:
            archive.unlink()
            raise BadDownload(f"cache {pin.cache_id}: {digest} is not the pinned {pin.sha256}")
    return archive


def install(built: Path, pin: Pin, client: Path) -> None:
    """Swap a finished tileset in, then drop every other cache's."""
    target = client / str(pin.cache_id) / LAYER
    target.parent.mkdir(parents=True, exist_ok=True)
    built.replace(target)
    for other in client.iterdir():
        if other.name != str(pin.cache_id):
            shutil.rmtree(other)


def generate(
    pin: Pin,
    client: Path = CLIENT_MAP,
    stage: Path = STAGE,
    fetch: Callable[[Pin, Path], None] = download,
    draw: Callable[[Path, Path], None] = render,
) -> bool:
    """Make the pinned tileset; False when it was already complete."""
    final = client / str(pin.cache_id) / LAYER
    if (final / MANIFEST).is_file():
        return False
    written = [stage / "x", final / "0" / "0_0_0.png"]
    if git_ignored(written) != set(written):
        raise NotIgnored(f"git would commit what this writes: {written}")

    stage.mkdir(exist_ok=True)
    archive = fetch_cache(pin, stage, fetch)
    for leftover in ("cache", "squares", "tiles"):
        shutil.rmtree(stage / leftover, ignore_errors=True)
    unpack(archive, stage / "cache")
    (stage / "squares").mkdir()
    draw(stage / "cache", stage / "squares")

    built = stage / "tiles"
    count = build_tiles(stage / "squares", built)
    manifest = {"cache_id": pin.cache_id, "tiles": count}
    (built / MANIFEST).write_text(json.dumps(manifest) + "\n", encoding="utf-8")
    install(built, pin, client)
    shutil.rmtree(stage)
    return True


def main() -> int:
    """Run ``make gen-map``."""
    pin = read_pin()
    try:
        made = generate(pin)
    except (BadDownload, NotIgnored) as exc:
        print(exc, file=sys.stderr)
        return 1
    print(f"map: cache {pin.cache_id} {'rendered' if made else 'already complete'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
