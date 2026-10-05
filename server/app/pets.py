"""Pets a player can be: ``data/pets.json`` and which of them have both pictures.

``players.avatar`` stores a pet's id, so the list may be reordered and grow without a
migration. A pet is pickable once ``data/assets.json`` has both its chathead and its
inventory icon: the chathead is drawn on the splash, the icon in the picker and lists.
Loading validates the list, so a file a client could not draw from is a server that does
not start rather than a gap in somebody's lobby.
"""

import json
import re
from pathlib import Path

from app.config import REPO_ROOT

PETS = REPO_ROOT / "data" / "pets.json"
ASSETS = REPO_ROOT / "data" / "assets.json"
_ID = re.compile(r"^[a-z0-9_]+$")


def load_pickable_pets(pets_path: Path = PETS, assets_path: Path = ASSETS) -> frozenset[str]:
    """The ids of every pet with both pictures in the asset manifest."""
    pets = json.loads(pets_path.read_text(encoding="utf-8"))
    if not isinstance(pets, list) or not pets:
        raise ValueError(f"{pets_path}: must be a non-empty JSON array")
    assets = json.loads(assets_path.read_text(encoding="utf-8"))
    ids: set[str] = set()
    names: set[str] = set()
    for index, pet in enumerate(pets):
        if not isinstance(pet, dict) or set(pet) != {"id", "name"}:
            raise ValueError(f"{pets_path}: entry {index} must be exactly {{id, name}}")
        pet_id, name = pet["id"], pet["name"]
        if not isinstance(pet_id, str) or _ID.match(pet_id) is None or pet_id in ids:
            raise ValueError(f"{pets_path}: entry {index} needs a distinct id of a-z, 0-9 and _")
        if not isinstance(name, str) or not name.strip() or name.lower() in names:
            raise ValueError(f"{pets_path}: entry {index} needs a distinct, non-empty name")
        ids.add(pet_id)
        names.add(name.lower())
    pickable = frozenset(
        pet["id"]
        for pet in pets
        if f"pets/{pet['id']}.png" in assets and f"pets/{pet['id']}_chathead.png" in assets
    )
    if not pickable:
        raise ValueError(f"{assets_path}: no pet has both a chathead and an icon")
    return pickable
