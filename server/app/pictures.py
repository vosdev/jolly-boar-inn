"""The question pictures ``scripts/build_pictures.py`` copied into the client.

A pack question's ``image`` is an asset id, and for some modes that id is the answer, so the
client never sees it. ``data/pictures.json`` maps each id to the random file name its picture
has in ``client/public/pictures/``, and that name is what an open question carries. The file
is git-ignored and written per install; without it every question shows without a picture.
"""

import json
import re
from pathlib import Path

from app.config import REPO_ROOT
from app.static import CLIENT_DIST

PICTURES = REPO_ROOT / "data" / "pictures.json"
_ASSET = re.compile(
    r"^((item|npc):[0-9]{1,7}|(place|screenshot):[a-z0-9][a-z0-9-]{0,63}"
    r"|minimap:[0-9]{1,4}_[0-9]{1,4}_[0-9]{1,3})$"
)
_FILE = re.compile(r"^[0-9a-f]{16}\.(avif|webp|png|jpg|jpeg|svg)$")


def load_pictures(path: Path = PICTURES, client: Path = CLIENT_DIST / "pictures") -> dict[str, str]:
    """Each asset id whose picture is in ``client``, to its file name there."""
    if not path.is_file():
        return {}
    mapping = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(mapping, dict):
        raise ValueError(f"{path}: must be an object of asset id to picture")
    files: dict[str, str] = {}
    for asset, entry in mapping.items():
        file = entry.get("file") if isinstance(entry, dict) else None
        if _ASSET.match(asset) is None or not isinstance(file, str) or _FILE.match(file) is None:
            raise ValueError(f"{path}: {asset!r} needs an asset id and a random file name")
        files[asset] = file
    if len(set(files.values())) != len(files):
        raise ValueError(f"{path}: two assets share a file")
    # A client built before the pictures were would draw a broken image for each.
    return {asset: file for asset, file in files.items() if (client / file).is_file()}
