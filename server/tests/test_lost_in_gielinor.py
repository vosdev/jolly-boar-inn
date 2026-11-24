"""Lost in Gielinor: Hans describes a place without naming it, and players pin it."""

import dataclasses
import json
from copy import deepcopy
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import similar
from app.config import REPO_ROOT
from app.modes import MODES, SUGGESTIBLE, TILES, problems
from app.modes.mode import Mode
from app.questions import schema
from app.questions.types import map_pin
from tests import test_suggestions
from tests.game_api import answer_after
from tests.test_map_pin import envelope
from tests.test_suggestion_pictures import refused
from tests.test_suggestions import queue, suggest

app, client = test_suggestions.app, test_suggestions.client

PACK = REPO_ROOT / "data" / "packs" / "lost_in_gielinor.json"
FALADOR = {"name": "Falador", "min_x": 2935, "max_x": 3066, "min_y": 3309, "max_y": 3395}
PAYLOAD: dict[str, Any] = {
    "prompt": "Big white walls and knights in white armour. Nice castle. Not my castle.",
    "targets": [FALADOR],
    "explanation": "The White Knights guard Falador's castle.",
}
SUGGESTED = {
    "kind": "question",
    "content": {
        "type": "map_pin",
        "mode": "lost_in_gielinor",
        "difficulty": "easy",
        "wiki": "https://oldschool.runescape.wiki/w/Falador",
        "payload": PAYLOAD,
    },
    "credit": "AFKFisher",
    "credit_shown": False,
}


def questions() -> list[dict[str, Any]]:
    return json.loads(PACK.read_text(encoding="utf-8"))["questions"]


def errors(**payload: Any) -> list[str]:
    question = envelope(
        {**PAYLOAD, **payload}, mode="lost_in_gielinor", source="pack", difficulty="easy"
    )
    return schema.mode_errors(question)


def suggested(**payload: Any) -> dict[str, Any]:
    body = deepcopy(SUGGESTED)
    body["content"]["payload"] = {**PAYLOAD, **payload}
    return body


# --- the round --------------------------------------------------------------------------


def test_the_mode_is_sound_and_reads_for_ten_seconds_more() -> None:
    mode = MODES["lost_in_gielinor"]
    assert not problems(mode)
    assert mode.types == frozenset({"map_pin"})
    assert mode.steps is None and mode.clues == 0
    assert map_pin.ANSWER.seconds(1, "run", 5, mode.extra_answer) == 40
    assert SUGGESTIBLE["lost_in_gielinor"].explanation


def test_a_described_mode_plays_only_map_pin() -> None:
    mode = Mode(id="x", types=frozenset({"multiple_choice"}), described=True)
    assert problems(mode) == ["x: describes a place on the map, so it plays only map_pin"]


def test_every_pack_question_passes_its_checks() -> None:
    assert questions()
    for question in questions():
        assert schema.consistency_errors(question) == [], question["payload"]["prompt"]
        assert "bounds" not in question["payload"]


def test_an_open_question_carries_the_description_and_no_place() -> None:
    for question in questions():
        payload = question["payload"]
        assert map_pin.client_view(payload) == {"prompt": payload["prompt"], "pins": 1}


def test_the_reveal_carries_the_place_and_the_explanation() -> None:
    shown = map_pin.reveal(PAYLOAD)
    assert shown["targets"] == [FALADOR]
    assert shown["explanation"] == PAYLOAD["explanation"]


# --- the description --------------------------------------------------------------------


def test_a_good_description_passes() -> None:
    assert errors() == []


@pytest.mark.parametrize(
    ("prompt", "word"),
    [
        ("I'm in FALADOR, I think.", "falador"),
        ("Falador's walls are white.", "falador"),
        ("A big castle.", "castle"),
        ("So many castles!", "castle"),
    ],
)
def test_a_description_holding_a_word_of_the_name_is_refused(prompt: str, word: str) -> None:
    name = "Falador" if word == "falador" else "Falador Castle"
    targets = [{**FALADOR, "name": name}]
    assert errors(prompt=prompt, targets=targets) == [
        f"$.payload.prompt: the description names its place, {word!r}"
    ]


def test_the_small_words_of_a_name_do_not_count() -> None:
    targets = [{**FALADOR, "name": "Isle of the Souls"}]
    assert errors(prompt="Out at the edge of a lake, in a fog.", targets=targets) == []


def test_a_description_is_of_one_place_and_explained() -> None:
    second = {**FALADOR, "name": "Lumbridge", "min_x": 3185, "max_x": 3255}
    assert errors(targets=[FALADOR, second]) == [
        "$.payload.targets: 'lost_in_gielinor' describes one place"
    ]
    payload = {key: value for key, value in PAYLOAD.items() if key != "explanation"}
    question = envelope(payload, mode="lost_in_gielinor", source="pack", difficulty="easy")
    assert "explanation" in schema.mode_errors(question)[0]


def test_another_map_round_may_name_its_place() -> None:
    question = envelope(
        {"prompt": "Where is Falador?", "targets": [FALADOR]},
        mode="mark_the_map",
        source="pack",
        difficulty="easy",
    )
    assert schema.mode_errors(question) == []


# --- playing ----------------------------------------------------------------------------


@pytest.fixture
def mapped(app: FastAPI, table: Any) -> Any:
    app.state.rooms.pictures = {TILES: "clean"}
    return table


def test_the_server_offers_it_only_with_the_tiles_and_the_pack(
    app: FastAPI, client: TestClient
) -> None:
    def listed() -> bool:
        return "lost_in_gielinor" in {mode["id"] for mode in client.get("/api/modes").json()}

    app.state.rooms.pictures = {}
    assert not listed()
    app.state.rooms.pictures = {TILES: "clean"}
    assert listed()
    app.state.packs = [
        dataclasses.replace(
            pack,
            questions=tuple(q for q in pack.questions if q["mode"] != "lost_in_gielinor"),
        )
        for pack in app.state.packs
    ]
    assert not listed()


def test_points_are_the_distance_from_the_box_however_late(mapped: Any) -> None:
    game = mapped(
        "Zezima",
        "Woox",
        "Lynx",
        "Durial",
        modes=["lost_in_gielinor"],
        seconds=30,
        close_when_all_answered=False,
    )
    game.start()
    payload = game.question(0).payload
    shown = {"prompt": payload["prompt"], "pins": 1}
    assert [m["question"]["view"] for m in game.opened(0)] == [shown] * len(game.seats)
    target = payload["targets"][0]
    middle = (target["min_y"] + target["max_y"]) // 2
    inside = [{"x": target["min_x"], "y": target["max_y"]}]
    for seat, pins, seconds in zip(
        game.players,
        (
            inside,
            inside,
            [{"x": target["max_x"] + 50, "y": middle}],
            [{"x": target["max_x"] + 100, "y": middle}],
        ),
        (1, 29, 1, 1),
        strict=True,
    ):
        answer_after(game, seat, 0, pins, seconds)
    game.skip()
    closed = game.admin.take("question_closed")
    by_name = {seat.id: seat.name for seat in game.seats}
    points = {by_name[pid]: row["points"] for pid, row in closed["results"].items()}
    assert points == {"Zezima": 1000, "Woox": 1000, "Lynx": 500, "Durial": 0}
    assert closed["reveal"]["targets"] == [target]
    assert closed["reveal"]["explanation"] == payload["explanation"]


# --- suggesting -------------------------------------------------------------------------


def test_a_description_is_suggested_with_its_explanation(client: TestClient) -> None:
    suggest(client, suggested(reach=60))
    (row,) = queue(client)["suggestions"]
    assert row["content"]["payload"] == {**PAYLOAD, "reach": 60}


def test_a_suggestion_naming_its_place_is_refused(client: TestClient) -> None:
    found = refused(client, suggested(prompt="The castle in Falador, east of the swamp."))
    assert "names its place" in found["message"]


def test_a_suggestion_needs_an_explanation(client: TestClient) -> None:
    body = suggested()
    del body["content"]["payload"]["explanation"]
    assert "explanation" in refused(client, body)["message"]


def test_two_overlapping_boxes_in_the_round_are_similar() -> None:
    def place(name: str, tiles: dict[str, int]) -> dict[str, Any]:
        payload = {**PAYLOAD, "targets": [{"name": name, **tiles}]}
        return {"type": "map_pin", "mode": "lost_in_gielinor", "payload": payload}

    box = {key: value for key, value in FALADOR.items() if key != "name"}
    shifted = {**box, "min_x": box["min_x"] + 100, "max_x": box["max_x"] + 100}
    far = {"min_x": 3500, "max_x": 3600, "min_y": 3500, "max_y": 3600}
    here = similar.features(place("Falador", box))
    assert similar.score(here, similar.features(place("White Knights' Castle", shifted))) == 100
    assert similar.score(here, similar.features(place("Lumbridge", far))) < 100
