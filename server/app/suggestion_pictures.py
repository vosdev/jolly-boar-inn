"""A suggester's own screenshot, kept with their suggestion until the operator imports it.

A ``picture_pin`` suggestion carries its picture in the same ``POST /api/suggestions``, as
base64 inside the JSON, so the route keeps the app's JSON-only rule. Whatever comes in is
decoded and written again as WebP: a re-encode drops EXIF, XMP and colour profiles along with
anything hidden after the image data, and gives the later picture work (grids, recolouring)
one format. A picture larger than ``MAX_SIDE`` on its longer side is shrunk to it.

The stored picture gets a random ``screenshot:<name>``, which the question's payload names
from the start, with the stored ``width`` and ``height``: the payload then passes the schema
while it waits, and the import writes the bytes to ``.pictures/screenshot/<name>.webp``.
"""

import asyncio
import base64
import binascii
import io
import secrets
from typing import Any
from uuid import UUID

import asyncpg
from PIL import Image, ImageOps, UnidentifiedImageError

from app.errors import ApiError

# What a browser sends from a screenshot tool. Anything else is refused before it is decoded.
FORMATS = frozenset({"PNG", "JPEG", "WEBP"})
MAX_BYTES = 5 * 1024 * 1024
# A 4K screenshot, the largest anyone takes in game, keeps its shape at half its pixels.
MAX_SIDE = 1920
# Smaller than this is not a screenshot a player could pin anything on.
MIN_SIDE = 200
# Checked on the header before any pixel is decoded: a few bytes can claim a huge image. A
# 4K or 5K screenshot fits; decoded as RGBA it is 64 MiB of a container's 512.
MAX_PIXELS = 4096 * 4096
QUALITY = 90
# The base64 of ``MAX_BYTES``; the route's body limit allows it.
MAX_ENCODED = 4 * -(-MAX_BYTES // 3)
PREFIX = "screenshot:"
# Modes Pillow shrinks smoothly as they are. Any other is converted first, at full size: a
# palette shrinks by nearest neighbour, and the rest are rare.
SHRINKS = frozenset({"RGB", "RGBA", "L", "LA"})
# One decode at a time, so concurrent uploads cannot each hold a full-size picture.
DECODES = asyncio.Semaphore(1)


class BadPicture(ApiError):
    status, code = 422, "bad_picture"


def decode(encoded: str) -> bytes:
    """The bytes of a base64 picture, or ``BadPicture``."""
    if len(encoded) > MAX_ENCODED:
        raise BadPicture(f"a picture is at most {MAX_BYTES // (1024 * 1024)} MB")
    try:
        body = base64.b64decode(encoded, validate=True)
    except binascii.Error as exc:
        raise BadPicture("the picture is not base64") from exc
    if not body:
        raise BadPicture("the picture is empty")
    return body


def reencode(body: bytes) -> tuple[bytes, int, int]:
    """``body`` as a WebP with no metadata, at most ``MAX_SIDE`` across; its width and height.

    ``BadPicture`` for anything not a PNG, JPEG or WebP within the limits.
    """
    try:
        with Image.open(io.BytesIO(body)) as opened:
            _check(opened)
            image = _small_upright(opened)
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombError,
    ) as exc:
        raise BadPicture("the picture could not be read") from exc
    with image:
        out = io.BytesIO()
        image.save(out, "WEBP", quality=QUALITY, method=4)
        return out.getvalue(), image.width, image.height


def _check(opened: Image.Image) -> None:
    if opened.format not in FORMATS:
        raise BadPicture("a picture is a PNG, JPEG or WebP")
    width, height = opened.size
    if width * height > MAX_PIXELS:
        raise BadPicture("the picture has too many pixels")
    if min(width, height) < MIN_SIDE:
        raise BadPicture(f"a picture is at least {MIN_SIDE} pixels each way")


def _small_upright(opened: Image.Image) -> Image.Image:
    """``opened`` shrunk, turned upright and in the mode the WebP keeps.

    Shrinking comes first, so the copies the turn and the conversion make are small ones; the
    bound is square, so shrinking before the turn gives the same size as after.
    """
    alpha = opened.mode in ("RGBA", "LA") or "transparency" in opened.info
    target = "RGBA" if alpha else "RGB"
    # A JPEG can decode straight to a fraction of its size, so the full one never exists.
    opened.draft(None, (MAX_SIDE, MAX_SIDE))
    if opened.mode in SHRINKS:
        image = opened
    else:
        image = opened.convert(target)
        opened.close()
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    # A phone photo stores its rotation in EXIF, which the re-encode drops.
    ImageOps.exif_transpose(image, in_place=True)
    if image.mode == target:
        return image.copy() if image is opened else image
    converted = image.convert(target)
    image.close()
    return converted


async def prepare(encoded: str) -> tuple[bytes, int, int]:
    """``encoded`` decoded and re-encoded off the event loop, which runs every room."""
    body = decode(encoded)
    async with DECODES:
        return await asyncio.to_thread(reencode, body)


def fresh_name() -> str:
    """A screenshot asset id that says nothing about the suggestion or the picture."""
    return f"{PREFIX}suggested-{secrets.token_hex(8)}"


def placed(payload: dict[str, Any], name: str, width: int, height: int) -> dict[str, Any]:
    """``payload`` naming the stored picture, whatever the client put there."""
    return {**payload, "screenshot": name, "width": width, "height": height}


async def add(
    conn: asyncpg.Connection, suggestion: UUID, name: str, data: bytes, width: int, height: int
) -> None:
    """Keep the picture of ``suggestion``, inside the transaction that adds it."""
    await conn.execute(
        "insert into suggestion_pictures (suggestion_id, name, width, height, data)"
        " values ($1, $2, $3, $4, $5)",
        suggestion,
        name,
        width,
        height,
        data,
    )


async def shape(pool: asyncpg.Pool, suggestion: UUID) -> asyncpg.Record | None:
    """The stored picture's name, width and height, without its bytes."""
    return await pool.fetchrow(
        "select name, width, height from suggestion_pictures where suggestion_id = $1", suggestion
    )


async def data(pool: asyncpg.Pool, suggestion: UUID) -> bytes | None:
    """The stored picture of ``suggestion``, or ``None``."""
    return await pool.fetchval(
        "select data from suggestion_pictures where suggestion_id = $1", suggestion
    )
