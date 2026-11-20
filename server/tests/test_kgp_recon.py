"""KGP Recon: a player's own photo of a place, pinned on the map, from ``/suggest`` to a pack."""

import base64
import json
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.modes import (
    MODES,
    TILES,
    UPCOMING,
    Suggest,
    drawable,
    offered,
    problems,
    suggest_problems,
)
from app.questions import schema
from app.questions.packs import Pack
from app.questions.types import answer_seconds, map_pin, pictured
from app.suggestions import PLACE_REACH
from tests import test_import_suggestions, test_suggestions
from tests.test_import_suggestions import loads
from tests.test_map_pin import VARROCK, Instance, east_of, envelope, points
from tests.test_suggestion_pictures import _run, picture, refused, stored
from tests.test_suggestions import BEARER, approve, export, queue, suggest

app, client = test_suggestions.app, test_suggestions.client
repo = test_import_suggestions.repo

PROMPT = "Where was this photo taken?"
SHOT = "screenshot:varrock-square"
PHOTO: dict[str, Any] = {
    "prompt": PROMPT,
    "targets": [VARROCK],
    "screenshot": SHOT,
    "width": 1600,
    "height": 900,
}
SUGGESTED = {
    "kind": "question",
    "content": {
        "type": "map_pin",
        "mode": "kgp_recon",
        "difficulty": "easy",
        "payload": {
            "prompt": PROMPT,
            "targets": [{**VARROCK, "name": "Varrock square"}],
            # What the form sends before the server names the picture it stores.
            "screenshot": "screenshot:upload",
            "width": 800,
            "height": 450,
            "explanation": "The fountain gives it away.",
        },
    },
    "credit": "AFKFisher",
    "credit_shown": True,
}


def round_question(payload: dict[str, Any]) -> dict[str, Any]:
    return envelope(payload, mode="kgp_recon", source="pack", difficulty="easy")


def suggested(**payload: Any) -> dict[str, Any]:
    body = deepcopy(SUGGESTED)
    body["content"]["payload"] |= payload
    return body | {"picture": picture()}


# --- the question -----------------------------------------------------------------------


def test_the_open_view_carries_the_photo_and_its_shape_but_no_target() -> None:
    view = pictured("map_pin", map_pin.client_view(PHOTO), PHOTO, {SHOT: "a1b2.webp"})
    assert view == {
        "prompt": PROMPT,
        "pins": 1,
        "width": 1600,
        "height": 900,
        "picture": "a1b2.webp",
    }
    assert "screenshot" not in map_pin.reveal(PHOTO)
    assert map_pin.reveal(PHOTO)["targets"] == [VARROCK]


def test_a_round_question_needs_its_photo_whole() -> None:
    assert not schema.schema_errors(round_question(PHOTO))
    assert not schema.consistency_errors(round_question(PHOTO))
    bare = {key: PHOTO[key] for key in ("prompt", "targets")}
    assert any("screenshot" in found for found in schema.consistency_errors(round_question(bare)))
    for missing in ("width", "height", "screenshot"):
        part = {key: value for key, value in PHOTO.items() if key != missing}
        assert schema.schema_errors(round_question(part)), missing


def test_a_photo_this_instance_lacks_is_not_drawn() -> None:
    question = {"type": "map_pin", "mode": "kgp_recon", "payload": PHOTO}
    assert drawable(question, {TILES: "clean", SHOT: "a1b2.webp"})
    assert not drawable(question, {TILES: "clean"})
    assert not drawable(question, {SHOT: "a1b2.webp"})


def test_it_is_offered_once_it_has_a_photo_it_can_draw() -> None:
    question = {"type": "map_pin", "mode": "kgp_recon", "payload": PHOTO}
    packs = [Pack(name="kgp", generated_at=None, questions=(question,), path=Path("kgp.json"))]
    assert "kgp_recon" not in {mode.id for mode in offered(Instance(), [], {TILES: "clean"})}
    assert "kgp_recon" not in {mode.id for mode in offered(Instance(), packs, {TILES: "clean"})}
    shown = {mode.id for mode in offered(Instance(), packs, {TILES: "clean", SHOT: "a1b2.webp"})}
    assert "kgp_recon" in shown


def test_a_pin_scores_as_any_map_pin() -> None:
    inside = {"x": VARROCK["min_x"] + 5, "y": VARROCK["min_y"] + 5}
    assert points(PHOTO, [inside]) == 1000
    assert points(PHOTO, [east_of(VARROCK, 50)]) == 500


def test_a_photo_is_open_forty_seconds_at_run_pace() -> None:
    assert answer_seconds("map_pin", PHOTO, "run", MODES["kgp_recon"].extra_answer) == 40


def test_a_round_taking_pictures_holds_its_types_to_ones_drawn_on_one() -> None:
    assert not problems(MODES["kgp_recon"])
    assert suggest_problems("x", Suggest(types=frozenset({"free_text"}), picture=True))
    assert suggest_problems("x", Suggest(types=frozenset({"picture_pin"})))
    assert UPCOMING["prop_hunt"].picture


# --- suggesting -------------------------------------------------------------------------


def test_a_photo_is_stored_with_its_picture_and_needs_no_link(client: TestClient) -> None:
    suggestion = suggest(client, suggested())
    (row,) = queue(client)["suggestions"]
    payload = row["content"]["payload"]
    assert payload["screenshot"].startswith("screenshot:suggested-")
    assert (payload["width"], payload["height"]) == (800, 450)
    assert payload["explanation"] == "The fountain gives it away."
    assert stored(client, suggestion)


def test_a_photo_needs_its_picture_and_a_place_takes_none(client: TestClient) -> None:
    without = deepcopy(SUGGESTED)
    assert "$.picture" in refused(client, without)["message"]
    place = {
        "kind": "question",
        "content": {
            "type": "map_pin",
            "mode": "mark_the_map",
            "difficulty": "easy",
            "wiki": "https://oldschool.runescape.wiki/w/Varrock",
            "payload": {"prompt": "Where is Varrock?", "targets": [VARROCK]},
        },
        "credit": "AFKFisher",
        "credit_shown": False,
    }
    assert "$.picture" in refused(client, place | {"picture": picture()})["message"]


def test_a_photo_asks_the_rounds_prompt(client: TestClient) -> None:
    assert "always asks" in refused(client, suggested(prompt="Where am I?"))["message"]


@pytest.mark.parametrize("reach", [PLACE_REACH[0] - 1, PLACE_REACH[1] + 1])
def test_a_photos_reach_is_held_to_the_places(client: TestClient, reach: int) -> None:
    assert "reach" in refused(client, suggested(reach=reach))["message"]


def test_the_operator_moves_the_box_and_the_photo_stays(client: TestClient) -> None:
    suggestion = suggest(client, suggested())
    (row,) = queue(client)["suggestions"]
    name = row["content"]["payload"]["screenshot"]
    content = deepcopy(row["content"])
    moved = {**VARROCK, "name": "Varrock square", "min_x": 3200, "max_x": 3230}
    content["payload"] |= {"targets": [moved], "screenshot": "screenshot:someone-elses"}
    response = client.put(
        f"/api/admin/suggestions/{suggestion}",
        json={"content": content, "credit": "AFKFisher", "credit_shown": True},
        headers=BEARER,
    )
    assert response.status_code == 200, response.text
    payload = response.json()["content"]["payload"]
    assert payload["targets"] == [moved]
    assert (payload["screenshot"], payload["width"], payload["height"]) == (name, 800, 450)


def test_an_approved_photo_is_imported_into_its_pack_with_its_picture(
    client: TestClient, repo: dict[str, Path]
) -> None:
    suggestion = suggest(client, suggested())
    approve(client, suggestion)
    (entry,) = export(client)["questions"]
    name = entry["payload"]["screenshot"]
    assert base64.b64decode(entry["picture"]) == stored(client, suggestion)

    pictures = repo["dir"] / ".pictures"
    assert _run(repo, {"questions": [entry]}, pictures) == 0
    staged = pictures / "screenshot" / f"{name.removeprefix('screenshot:')}.webp"
    assert staged.read_bytes() == stored(client, suggestion)
    assert loads(repo)
    (question,) = json.loads((repo["packs"] / "kgp_recon.json").read_text())["questions"]
    assert question["mode"] == "kgp_recon"
    assert "picture" not in question
    assert not schema.consistency_errors(question)
