"""The world map's tiles, which ``scripts/gen_map.py`` renders per install.

``data/map.json`` pins the game cache they come from, and the tiles sit in the client under its
id, so a new map is a new URL. A tileset's manifest is its last file, so its presence means the
tileset is whole. Without it an install offers no map modes.
"""

import json
from pathlib import Path

from app.config import REPO_ROOT
from app.static import CLIENT_DIST

PIN = REPO_ROOT / "data" / "map.json"
LAYER = "clean"
MANIFEST = "manifest.json"


def has_tiles(pin: Path = PIN, client: Path = CLIENT_DIST / "map") -> bool:
    """Whether the pinned tileset is in the client, whole."""
    cache_id = json.loads(pin.read_text(encoding="utf-8"))["cache_id"]
    return (client / str(cache_id) / LAYER / MANIFEST).is_file()
