"""The pet list, and which pets a player can pick.

A pet is pickable with both its chathead and its icon in ``data/assets.json``. The client
reads the same two files, so the server and every browser agree on the list without a
request for it. The client's own tests (``pets.test.ts``) cover the rest.
"""

import json
import re
from pathlib import Path

import pytest

from app.config import Settings
from app.pets import ASSETS, PETS, load_pickable_pets


def test_there_are_enough_pets_for_a_full_room() -> None:
    assert len(load_pickable_pets()) >= Settings(_env_file=None).max_players_per_room


def test_only_pets_with_both_pictures_are_pickable() -> None:
    assets = json.loads(ASSETS.read_text(encoding="utf-8"))
    for pet in json.loads(PETS.read_text(encoding="utf-8")):
        both = f"pets/{pet['id']}.png" in assets and f"pets/{pet['id']}_chathead.png" in assets
        assert (pet["id"] in load_pickable_pets()) is both


def write(tmp_path: Path, pets: object, assets: object) -> tuple[Path, Path]:
    (tmp_path / "pets.json").write_text(json.dumps(pets))
    (tmp_path / "assets.json").write_text(json.dumps(assets))
    return tmp_path / "pets.json", tmp_path / "assets.json"


def test_a_pet_is_pickable_once_its_second_file_is_in_the_manifest(tmp_path: Path) -> None:
    pets = [{"id": "aggy", "name": "Aggy"}]
    one = {"pets/aggy.png": "Aggy.png"}
    with pytest.raises(ValueError, match="no pet has both"):
        load_pickable_pets(*write(tmp_path, pets, one))
    both = {**one, "pets/aggy_chathead.png": "Aggy chathead.png"}
    assert load_pickable_pets(*write(tmp_path, pets, both)) == {"aggy"}


@pytest.mark.parametrize(
    ("pets", "problem"),
    [
        ([], "non-empty"),
        ([{"id": "aggy"}], "exactly"),
        ([{"id": "Aggy", "name": "Aggy"}], "distinct id"),
        ([{"id": "a", "name": "A"}, {"id": "a", "name": "B"}], "distinct id"),
        ([{"id": "a", "name": "A"}, {"id": "b", "name": "a"}], "distinct, non-empty name"),
        ([{"id": "a", "name": " "}], "distinct, non-empty name"),
    ],
)
def test_a_broken_list_stops_the_server(tmp_path: Path, pets: list, problem: str) -> None:
    with pytest.raises(ValueError, match=re.escape(problem)):
        load_pickable_pets(*write(tmp_path, pets, {}))
