"""Bake a minimap question's picture from the world map's zoom 2 tiles.

The picture is the circle ``MINIMAP_RADIUS`` game tiles round the middle of the spot's tile, at
4 px a tile like the tiles and the game's minimap, turned clockwise by the question's angle as
the game turns it with the camera. ``/suggest`` draws its preview from the same tiles the same
way (``client/src/lib/minimap.ts``), so the two agree in position and size. Outside the tiles,
as past the edge of the surface, the picture is black, as the map is.
"""

import io
import math
from pathlib import Path

from PIL import Image, ImageDraw

from app.questions.types.map_pin import MINIMAP_RADIUS

TILE_SIZE = 256
NATIVE_ZOOM = 2
PIXELS_PER_TILE = 4
SIDE = 2 * MINIMAP_RADIUS * PIXELS_PER_TILE
# Wide enough that the circle stays inside the square at any angle, and even, so its middle
# falls between pixels as the spot's tile middle does.
TURNABLE = 2 * math.ceil(SIDE / math.sqrt(2))
_VOID = (0, 0, 0, 255)


def tile_path(tiles: Path, column: int, row: int) -> Path:
    """A zoom 2 tile's file, its ``row`` counting north as the file names do."""
    return tiles / f"0_{column}_{row}.png"


def placed_tiles(x: int, y: int) -> list[tuple[int, int, int, int]]:
    """Each zoom 2 tile under the square round tile ``x``, ``y``, as its column and row and
    where its top left lands on the square, in pixels."""
    half = TURNABLE // 2
    # In pixels east of x 0 and south of y 0, a tile's middle being half a tile in.
    left = (x * PIXELS_PER_TILE + PIXELS_PER_TILE // 2) - half
    top = -(y * PIXELS_PER_TILE + PIXELS_PER_TILE // 2) - half
    # A tile's row counts north, so row r spans -256 (r + 1) to -256 r in pixels south.
    return [
        (column, row, column * TILE_SIZE - left, -TILE_SIZE * (row + 1) - top)
        for column in range(left // TILE_SIZE, (left + TURNABLE - 1) // TILE_SIZE + 1)
        for row in range((-top - TURNABLE) // TILE_SIZE, (-top - 1) // TILE_SIZE + 1)
    ]


def bake(tiles: Path, x: int, y: int, angle: int) -> bytes:
    """The minimap round tile ``x``, ``y``, turned ``angle`` degrees clockwise, as a PNG."""
    half = TURNABLE // 2
    square = Image.new("RGBA", (TURNABLE, TURNABLE), _VOID)
    for column, row, left, top in placed_tiles(x, y):
        path = tile_path(tiles, column, row)
        if path.is_file():
            with Image.open(path) as tile:
                square.paste(tile.convert("RGBA"), (left, top))
    if angle % 360:
        # Pillow turns counter-clockwise for a positive angle.
        square = square.rotate(-angle, resample=Image.Resampling.BILINEAR, fillcolor=_VOID)
    inset = half - SIDE // 2
    picture = square.crop((inset, inset, inset + SIDE, inset + SIDE))
    circle = Image.new("L", (SIDE, SIDE), 0)
    ImageDraw.Draw(circle).ellipse((0, 0, SIDE - 1, SIDE - 1), fill=255)
    picture.putalpha(circle)
    out = io.BytesIO()
    picture.save(out, "PNG", optimize=True)
    return out.getvalue()
