"""Pixel Hunt: one question per roster item with a detail picture, drawn only where the
install has that picture, its picture building up over the first 17 of 25 seconds."""

import json
import random
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.modes import MODES, drawable, offered, questions_bounds
from app.questions import vocab
from app.questions.packs import Pack, load_packs
from app.questions.types.scoring import Steps
from app.rooms.selection import select
from app.rooms.settings import RoomSettings
from tests.packs import PACKS_DIR
from tests.rooms_api import create

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import gen_pixel_hunt  # noqa: E402
import validate_packs  # noqa: E402
from fetch_assets import MANIFEST, load_manifest  # noqa: E402

PACK = REPO_ROOT / "data" / "packs" / "pixel_hunt.json"


def questions() -> list[dict[str, Any]]:
    return json.loads(PACK.read_text(encoding="utf-8"))["questions"]


def roster() -> list[dict[str, Any]]:
    path = REPO_ROOT / "data" / "popular-items.json"
    return json.loads(path.read_text(encoding="utf-8"))["items"]


def test_the_mode_is_a_list_pick_whose_picture_builds_up() -> None:
    mode = MODES["pixel_hunt"]
    assert mode.types == {"pick_from_list"}
    assert mode.steps == Steps(build=17, of=25) and mode.steps.count == 18
    assert mode.pictured
    assert questions_bounds("pixel_hunt").default == 5


def test_the_pack_is_what_the_script_writes_from_the_roster() -> None:
    kept = gen_pixel_hunt.difficulties(PACK)
    pack = gen_pixel_hunt.generate(roster(), load_manifest(MANIFEST), kept)
    assert gen_pixel_hunt.render(pack) == PACK.read_text(encoding="utf-8")


def test_every_question_names_a_roster_item_by_its_own_picture() -> None:
    items = vocab.get("items")
    assert items is not None
    for question in questions():
        payload = question["payload"]
        assert question["mode"] == "pixel_hunt" and question["type"] == "pick_from_list"
        assert payload["prompt"] == "Which item is this?"
        assert payload["vocab"] == "items"
        assert payload["image"] == f"item:{payload['answer_id']}"
        assert payload["subject"]["name"] == items.name_of(payload["answer_id"])
        assert question["difficulty"] in ("easy", "medium", "hard")
    assert len({q["payload"]["answer_id"] for q in questions()}) == len(questions())


MANIFEST_ENTRIES = {
    "pictures/item/4151.png": "Abyssal whip detail.png",
    "pictures/item/11802.png": "Armadyl godsword detail.png",
    "items/4587.png": "Dragon scimitar.png",
}
ITEMS = [
    {"id": 4151, "name": "Abyssal whip"},
    {"id": 4587, "name": "Dragon scimitar"},
    {"id": 11802, "name": "Armadyl godsword"},
]


def test_the_script_leaves_out_items_without_a_picture_or_on_the_blocklist() -> None:
    pack = gen_pixel_hunt.generate(ITEMS, MANIFEST_ENTRIES, {})
    assert [q["payload"]["answer_id"] for q in pack["questions"]] == [4151, 11802]
    assert {q["difficulty"] for q in pack["questions"]} == {"medium"}
    blocked = gen_pixel_hunt.generate(ITEMS, MANIFEST_ENTRIES, {}, frozenset({11802}))
    assert [q["payload"]["answer_id"] for q in blocked["questions"]] == [4151]
    assert gen_pixel_hunt.BLOCKLIST == frozenset()


def test_the_script_keeps_the_difficulty_an_item_was_given() -> None:
    pack = gen_pixel_hunt.generate(ITEMS, MANIFEST_ENTRIES, {11802: "hard"})
    assert [q["difficulty"] for q in pack["questions"]] == ["medium", "hard"]


def test_the_script_writes_nothing_for_packs_that_would_not_load(tmp_path: Path) -> None:
    packs = tmp_path / "packs"
    packs.mkdir()
    manifest = tmp_path / "assets.json"
    manifest.write_text(json.dumps(dict(sorted(MANIFEST_ENTRIES.items()))))
    listed = tmp_path / "roster.json"
    listed.write_text(json.dumps({"items": [*ITEMS, {"id": 4151, "name": "Whip again"}]}))
    args = ["--packs-dir", str(packs), "--roster", str(listed), "--manifest", str(manifest)]
    assert gen_pixel_hunt.main(args) == 1
    assert not (packs / "pixel_hunt.json").exists()


# --- validate_packs -------------------------------------------------------------------


def _pack(**edit: Any) -> Pack:
    """A Pack of Abyssal whip's question, its payload edited; ``None`` drops a key."""
    built = gen_pixel_hunt.generate(ITEMS[:1], MANIFEST_ENTRIES, {})["questions"][0]
    payload = {**built["payload"], **edit}
    payload = {key: value for key, value in payload.items() if value is not None}
    question = {**built, "payload": payload}
    return Pack(name="pixel_hunt", generated_at=None, questions=(question,), path=PACK)


def test_validate_packs_passes_the_shipped_packs() -> None:
    packs = load_packs(REPO_ROOT / "data" / "packs")
    assert validate_packs.picture_errors(packs, load_manifest(MANIFEST)) == []


def test_validate_packs_fails_a_question_without_a_detail_picture() -> None:
    (error,) = validate_packs.picture_errors([_pack()], {"items/4151.png": "Abyssal whip.png"})
    assert error.endswith("item 4151 has no picture")


@pytest.mark.parametrize(
    "edit", [{"image": "item:4587"}, {"vocab": "npcs"}, {"image": None}], ids=str
)
def test_validate_packs_fails_a_question_that_pictures_anything_else(edit: dict[str, Any]) -> None:
    (error,) = validate_packs.picture_errors([_pack(**edit)], MANIFEST_ENTRIES)
    assert error.endswith("must picture its own item")


# --- a picture this install lacks ------------------------------------------------------

PACKS = load_packs(PACKS_DIR)
ALL = {q["payload"]["image"] for q in questions()}


def test_a_question_whose_picture_is_missing_is_never_drawn() -> None:
    have = set(sorted(ALL)[:7])
    settings = RoomSettings(modes=[{"mode": "pixel_hunt", "questions": 30}])
    for seed in range(20):
        (round_,) = select(PACKS, [], settings, random.Random(seed), have)
        assert {q["payload"]["image"] for q in round_.questions} <= have
        assert len(round_.questions) == 7


def test_a_round_with_no_pictures_is_not_offered_or_drawn() -> None:
    settings = RoomSettings(modes=[{"mode": "pixel_hunt", "questions": 5}])
    assert select(PACKS, [], settings, random.Random(1)) == []
    instance = Settings(_env_file=None)
    assert "pixel_hunt" not in {mode.id for mode in offered(instance, PACKS)}
    assert "pixel_hunt" in {mode.id for mode in offered(instance, PACKS, ALL)}


def test_only_a_pictured_mode_needs_its_picture() -> None:
    npc = {"mode": "whos_that_npc", "payload": {"image": "npc:8058"}}
    assert drawable(npc, ())
    assert not drawable({"mode": "pixel_hunt", "payload": {"image": "item:4151"}}, ())
    assert drawable({"mode": "pixel_hunt", "payload": {"image": "item:4151"}}, {"item:4151"})


def test_the_server_offers_pixel_hunt_once_it_has_the_pictures(client: TestClient) -> None:
    def listed() -> bool:
        return "pixel_hunt" in {mode["id"] for mode in client.get("/api/modes").json()}

    assert not listed()
    settings = {"modes": [{"mode": "pixel_hunt", "questions": 5}]}
    body = {"returning": False, "display_name": "Zezima", "settings": settings}
    response = client.post("/api/rooms", json=body)
    assert (response.status_code, response.json()["code"]) == (403, "mode_not_offered")
    rooms = client.app.state.rooms  # type: ignore[attr-defined]
    rooms.pictures = {asset: "0123456789abcdef.png" for asset in ALL}
    assert listed()
    code, _ = create(client, modes=[{"mode": "pixel_hunt", "questions": 5}])
    assert client.portal is not None
    room = client.portal.call(rooms.get, code)
    assert [q.mode for q in room.questions] == ["pixel_hunt"] * 5
