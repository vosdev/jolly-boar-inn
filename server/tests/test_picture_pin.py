"""Pin on a picture: what is particular to it. ``test_type_contract`` holds it to the rest."""

import json
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import REPO_ROOT
from app.modes import drawable
from app.questions import schema
from app.questions.submission import Submission
from app.questions.types import map_pin, picture_pin
from tests.conftest import stub_mode
from tests.game_api import answer_after

FIXTURE = REPO_ROOT / "client" / "src" / "lib" / "picturePins.fixture.json"
SCREENSHOT = "screenshot:ice-demon-safespot"
FILE = "0123456789abcdef.png"
BOX = {"min_x": 0.4, "max_x": 0.5, "min_y": 0.4, "max_y": 0.6}
# 16:9, so a fraction across is longer than one down.
FREE: dict[str, Any] = {
    "prompt": "Where is the safespot?",
    "screenshot": SCREENSHOT,
    "width": 1600,
    "height": 900,
    "target": BOX,
    "reach": 0.2,
}
INVENTORY: dict[str, Any] = {
    "prompt": "Which item does not belong?",
    "screenshot": "screenshot:odd-inventory",
    "width": 400,
    "height": 700,
    "grid": {"cols": 4, "rows": 7},
    "cells": [{"col": 2, "row": 3}, {"col": 0, "row": 6}],
}


def credit(payload: dict[str, Any], point: dict[str, float]) -> float:
    player = uuid4()
    parsed = picture_pin.parse_value(payload, point)
    assert parsed is not None
    return picture_pin.grade(payload, [Submission(player_id=player, value=parsed)])[player]


def east_of(box: dict[str, float], across: float) -> dict[str, float]:
    """A point that far past the box's east edge, in fractions of the width."""
    return {"x": box["max_x"] + across, "y": (box["min_y"] + box["max_y"]) / 2}


def test_the_open_view_has_the_picture_by_its_random_name_and_no_target() -> None:
    view = picture_pin.pictured(picture_pin.client_view(FREE), FREE, {SCREENSHOT: FILE})
    assert view == {"prompt": FREE["prompt"], "width": 1600, "height": 900, "picture": FILE}


def test_a_grids_open_view_has_the_grid_and_no_cell() -> None:
    view = picture_pin.client_view(INVENTORY)
    assert view == {
        "prompt": INVENTORY["prompt"],
        "width": 400,
        "height": 700,
        "grid": INVENTORY["grid"],
    }


def test_a_picture_that_was_not_built_leaves_the_view_without_one() -> None:
    view = picture_pin.client_view(FREE)
    assert picture_pin.pictured(view, FREE, {}) == view


def test_the_reveal_has_the_target_and_its_reach_or_the_cells() -> None:
    shown = picture_pin.reveal({**FREE, "explanation": "Behind the rock."})
    assert (shown["target"], shown["reach"], shown["explanation"]) == (BOX, 0.2, "Behind the rock.")
    assert picture_pin.reveal(INVENTORY)["cells"] == INVENTORY["cells"]
    assert "screenshot" not in shown


@pytest.mark.parametrize(
    "value",
    [
        [{"x": 0.5, "y": 0.5}],
        {"x": 0.5},
        {"x": 0.5, "y": 0.5, "z": 0},
        {"x": -0.01, "y": 0.5},
        {"x": 0.5, "y": 1.01},
        {"x": True, "y": 0.5},
        {"x": "0.5", "y": 0.5},
        {"x": float("nan"), "y": 0.5},
        {"x": 0.5, "y": float("inf")},
        {"x": None, "y": 0.5},
        "0.5,0.5",
        0.5,
    ],
)
def test_parse_value_refuses(value: Any) -> None:
    assert picture_pin.parse_value(FREE, value) is None
    assert picture_pin.parse_value(INVENTORY, value) is None


@pytest.mark.parametrize("value", [{"x": 0, "y": 0}, {"x": 1, "y": 1}, {"x": 0.25, "y": 0.75}])
def test_parse_value_keeps_any_point_on_the_picture(value: dict[str, float]) -> None:
    parsed = picture_pin.parse_value(FREE, value)
    assert parsed == value
    assert parsed is not None and all(type(v) is float for v in parsed.values())


@pytest.mark.parametrize(
    "point", [{"x": 0.4, "y": 0.4}, {"x": 0.5, "y": 0.6}, {"x": 0.45, "y": 0.5}]
)
def test_all_of_the_box_is_full_credit(point: dict[str, float]) -> None:
    assert credit(FREE, point) == 1.0


@pytest.mark.parametrize(
    ("across", "scored"),
    [(0.0, 1.0), (0.05, 0.75), (0.1, 0.5), (0.15, 0.25), (0.2, 0.0), (0.4, 0.0)],
)
def test_credit_falls_in_a_line_from_the_edge_to_the_reach(across: float, scored: float) -> None:
    assert credit(FREE, east_of(BOX, across)) == pytest.approx(scored)


def test_distance_is_measured_on_the_picture_so_a_wide_one_grades_evenly() -> None:
    # 160 px east of the box, and 160 px south of it: a tenth of the width, 0.178 of the height.
    east = {"x": BOX["max_x"] + 0.1, "y": 0.5}
    south = {"x": 0.45, "y": BOX["max_y"] + 160 / 900}
    assert credit(FREE, east) == pytest.approx(credit(FREE, south)) == pytest.approx(0.5)


def test_a_reach_of_0_is_all_or_nothing() -> None:
    sharp = {**FREE, "reach": 0}
    assert credit(sharp, {"x": BOX["max_x"], "y": 0.5}) == 1.0
    assert credit(sharp, east_of(BOX, 0.001)) == 0.0


def test_the_grading_is_map_pins(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []
    monkeypatch.setattr(
        map_pin, "pin_credit", lambda pin, box, reach: calls.append((pin, box, reach)) or 0.25
    )
    assert credit(FREE, {"x": 0.9, "y": 0.5}) == 0.25
    ((pin, box, reach),) = calls
    assert (pin["x"], reach) == (0.9, 0.2)
    assert box["max_y"] == pytest.approx(0.6 * 900 / 1600)


@pytest.mark.parametrize(
    ("point", "snapped", "scored"),
    [
        ({"x": 0.6, "y": 0.45}, {"x": 0.625, "y": 0.5}, 1.0),
        ({"x": 0.01, "y": 0.99}, {"x": 0.125, "y": 6.5 / 7}, 1.0),
        ({"x": 0.76, "y": 0.45}, {"x": 0.875, "y": 0.5}, 0.0),
        ({"x": 1, "y": 1}, {"x": 0.875, "y": 6.5 / 7}, 0.0),
    ],
)
def test_a_grid_snaps_the_tap_to_its_cell_and_credits_only_a_target_cell(
    point: dict[str, float], snapped: dict[str, float], scored: float
) -> None:
    parsed = picture_pin.parse_value(INVENTORY, point)
    assert parsed == pytest.approx(snapped)
    assert picture_pin.parse_value(INVENTORY, parsed) == parsed
    assert credit(INVENTORY, point) == scored


@pytest.mark.parametrize(
    ("payload", "problem"),
    [
        ({**FREE, "target": {**BOX, "max_x": BOX["min_x"]}}, "holds no spot"),
        ({**FREE, "target": {**BOX, "min_y": 0.7}}, "holds no spot"),
        # 0.02 of the 1600 px width is 32 px; 0.02 of the 900 px height is only 18.
        ({**FREE, "target": {**BOX, "max_y": BOX["min_y"] + 0.03}}, "under 0.02"),
        ({**FREE, "target": {**BOX, "max_x": BOX["min_x"] + 0.019}}, "under 0.02"),
        ({**INVENTORY, "cells": [{"col": 4, "row": 0}]}, "off the 4 by 7 grid"),
        ({**INVENTORY, "cells": [{"col": 0, "row": 7}]}, "off the 4 by 7 grid"),
        (
            {
                **INVENTORY,
                "grid": {"cols": 1, "rows": 2},
                "cells": [{"col": 0, "row": 0}, {"col": 0, "row": 1}],
            },
            "every cell",
        ),
    ],
)
def test_check_refuses(payload: dict[str, Any], problem: str) -> None:
    assert any(problem in found for found in picture_pin.check(payload))


def test_the_smallest_box_passes_check() -> None:
    least = {**BOX, "max_x": BOX["min_x"] + 0.02, "max_y": BOX["min_y"] + 0.02 * 1600 / 900}
    assert picture_pin.check({**FREE, "target": least}) == []
    assert picture_pin.check(INVENTORY) == []


def envelope(payload: dict[str, Any], **fields: Any) -> dict[str, Any]:
    question = {
        "type": "picture_pin",
        "mode": "custom",
        "payload": payload,
        "source": "room",
        "tags": [],
        **fields,
    }
    return {**question, "id": schema.content_id(question)}


def without(payload: dict[str, Any], *keys: str) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key not in keys}


@pytest.mark.parametrize(
    "payload",
    [
        without(FREE, "target", "reach"),
        without(FREE, "reach"),
        without(FREE, "target"),
        without(INVENTORY, "cells"),
        without(INVENTORY, "grid"),
        {**FREE, "grid": INVENTORY["grid"], "cells": INVENTORY["cells"]},
        without(FREE, "screenshot"),
        without(FREE, "width"),
        {**FREE, "screenshot": "item:4151"},
        {**FREE, "screenshot": "screenshot:Ice Demon"},
        {**FREE, "image": "item:4151"},
        {**FREE, "target": {**BOX, "max_x": 1.1}},
        {**FREE, "reach": -0.1},
        {**FREE, "reach": 1.5},
        {**INVENTORY, "grid": {"cols": 17, "rows": 7}},
        {**INVENTORY, "grid": {"cols": 0, "rows": 7}},
        {**INVENTORY, "cells": []},
        {**INVENTORY, "cells": [{"col": 1, "row": 1}, {"col": 1, "row": 1}]},
    ],
)
def test_the_schema_refuses(payload: dict[str, Any]) -> None:
    assert schema.schema_errors(envelope(payload))


@pytest.mark.parametrize("payload", [FREE, {**FREE, "reach": 0}, INVENTORY])
def test_the_schema_takes_either_kind(payload: dict[str, Any]) -> None:
    assert schema.schema_errors(envelope(payload)) == []


def test_a_host_or_an_event_cannot_ask_it() -> None:
    errors = schema.errors(envelope(FREE))
    assert any("is not accepted in 'custom'" in error for error in errors)


def test_a_room_draws_it_only_with_its_screenshot() -> None:
    question = {"type": "picture_pin", "mode": "pin_round", "payload": FREE}
    assert not drawable(question, {})
    assert not drawable(question, {"screenshot:other": FILE})
    assert drawable(question, {SCREENSHOT: FILE})


@pytest.mark.parametrize(
    "case", json.loads(FIXTURE.read_text(encoding="utf-8")), ids=lambda case: case["about"]
)
def test_the_client_reads_the_same_credit(case: dict[str, Any]) -> None:
    """``lib/picturePins.test.ts`` runs these too: the reveal draws what the server graded."""
    payload = {"prompt": "Where?", "screenshot": SCREENSHOT, **case["question"]}
    assert schema.schema_errors(envelope(payload)) == []
    assert picture_pin.check(payload) == []
    assert picture_pin.parse_value(payload, case["point"]) == pytest.approx(case["value"])
    assert credit(payload, case["point"]) == pytest.approx(case["credit"])


@pytest.fixture
def pin_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A round of one picture pin question, its screenshot built under a random name."""
    app.state.rooms.pictures = {SCREENSHOT: FILE}
    question = {"type": "picture_pin", "source": "pack", "tags": [], "payload": FREE}
    yield from stub_mode(app, "pin_round", "picture_pin", [question])


def test_a_round_names_the_picture_and_reveals_the_target_and_every_pin(
    table: Any, pin_round: str
) -> None:
    game = table("Zezima", "Woox", "Lynx", modes=[{"mode": pin_round, "questions": 1}], seconds=30)
    game.start()
    opened = game.opened(0)
    shown = {"prompt": FREE["prompt"], "width": 1600, "height": 900, "picture": FILE}
    assert [m["question"]["view"] for m in opened] == [shown] * len(game.seats)
    assert "screenshot:" not in json.dumps(opened)
    assert {m["question"]["picture"] for m in opened} == {None}

    zezima = game.players[0]
    game.answer(zezima, 0, [{"x": 0.45, "y": 0.5}])
    assert zezima.take("error")["code"] == "bad_value"
    game.answer(zezima, 0, {"x": 1.5, "y": 0.5})
    assert zezima.take("error")["code"] == "bad_value"
    pins = {"Zezima": {"x": 0.45, "y": 0.5}, "Woox": east_of(BOX, 0.1), "Lynx": {"x": 1, "y": 0}}
    for seat in game.players:
        assert answer_after(game, seat, 0, pins[seat.name], 25)["scoring"] == "accuracy"
    game.skip()
    closed = game.admin.take("question_closed")
    assert closed["reveal"]["target"] == BOX
    assert closed["reveal"]["reach"] == 0.2
    assert closed["reveal"]["picture"] == FILE
    by_id = {seat.id: seat.name for seat in game.players}
    results = {by_id[pid]: row for pid, row in closed["results"].items() if pid in by_id}
    assert results.keys() == pins.keys()
    for name, point in pins.items():
        assert results[name]["value"] == pytest.approx(point)
    points = {name: row["points"] for name, row in results.items()}
    assert points == {"Zezima": 1000, "Woox": 500, "Lynx": 0}
