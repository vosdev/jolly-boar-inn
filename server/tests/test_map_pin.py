"""Pin on the map: what is particular to it. ``test_type_contract`` holds it to the rest."""

import json
import math
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT
from app.modes import MODES, TILES, Mode, drawable, offered
from app.questions import schema
from app.questions.packs import Pack
from app.questions.submission import Submission
from app.questions.types import map_pin

FIXTURE = REPO_ROOT / "client" / "src" / "lib" / "mapPins.fixture.json"
FALADOR = {"name": "Falador", "x": 2965, "y": 3380, "radius": 40}
VARROCK = {"name": "Varrock", "x": 3213, "y": 3424, "radius": 40}
ONE: dict[str, Any] = {"prompt": "Where is Falador?", "targets": [FALADOR]}
TWO: dict[str, Any] = {"prompt": "Pin both.", "targets": [FALADOR, VARROCK]}
DESERT = {"min_x": 3100, "max_x": 3400, "min_y": 2800, "max_y": 3100}


def credit(payload: dict[str, Any], pins: list[dict[str, int]]) -> float:
    player = uuid4()
    return map_pin.grade(payload, [Submission(player_id=player, value=pins)])[player]


def points(payload: dict[str, Any], pins: list[dict[str, int]]) -> int:
    return round(1000 * credit(payload, pins))


def east_of(target: dict[str, Any], tiles: int) -> dict[str, int]:
    return {"x": target["x"] + tiles, "y": target["y"]}


def test_the_open_view_has_the_pin_count_and_no_target() -> None:
    view = map_pin.client_view({**TWO, "bounds": DESERT})
    assert view == {"prompt": "Pin both.", "bounds": DESERT, "pins": 2}


def test_the_reveal_has_every_target() -> None:
    assert map_pin.reveal(TWO)["targets"] == [FALADOR, VARROCK]


@pytest.mark.parametrize(
    "value",
    [
        {"x": 2965, "y": 3380},
        [],
        [{"x": 2965, "y": 3380}, {"x": 2965, "y": 3380}],
        [{"x": 2965.5, "y": 3380}],
        [{"x": True, "y": 3380}],
        [{"x": "2965", "y": 3380}],
        [{"x": 2965}],
        [{"x": 2965, "y": 3380, "z": 0}],
        [{"x": 767, "y": 3380}],
        [{"x": 4096, "y": 3380}],
        [{"x": 2965, "y": 1791}],
        [{"x": 2965, "y": 4352}],
        ["2965,3380"],
    ],
)
def test_parse_value_refuses(value: Any) -> None:
    assert map_pin.parse_value(ONE, value) is None


def test_parse_value_keeps_a_tile_on_the_map() -> None:
    value = [{"x": 768, "y": 4351}]
    assert map_pin.parse_value(ONE, value) == value


def test_a_region_refuses_a_pin_outside_it() -> None:
    target = {"name": "Pollnivneach", "x": 3350, "y": 2970, "radius": 20}
    region = {"prompt": "Where?", "targets": [target], "bounds": DESERT}
    assert map_pin.parse_value(region, [{"x": 3099, "y": 2970}]) is None
    assert map_pin.parse_value(region, [{"x": 3100, "y": 2970}]) == [{"x": 3100, "y": 2970}]


def test_inside_the_radius_is_full_credit() -> None:
    assert credit(ONE, [FALADOR | {}]) == 1.0
    assert credit(ONE, [east_of(FALADOR, 40)]) == 1.0


def test_300_tiles_outside_the_radius_scores_368() -> None:
    assert points(ONE, [east_of(FALADOR, 340)]) == 368


def test_points_never_rise_with_distance() -> None:
    far = [points(ONE, [east_of(FALADOR, tiles)]) for tiles in range(0, 1000, 25)]
    assert far == sorted(far, reverse=True)


def test_a_region_scales_the_falloff() -> None:
    target = {"name": "Pollnivneach", "x": 3250, "y": 2950, "radius": 20}
    region = {"prompt": "Where?", "targets": [target], "bounds": DESERT}
    assert points(region, [east_of(target, 50)]) == 368


def test_a_huge_region_scores_as_the_whole_map() -> None:
    bounds = {"min_x": 768, "max_x": 4095, "min_y": 1792, "max_y": 4351}
    assert points({**ONE, "bounds": bounds}, [east_of(FALADOR, 340)]) == 368


def test_pins_pair_with_targets_whichever_order_they_arrive_in() -> None:
    pins = [east_of(VARROCK, 0), east_of(FALADOR, 340)]
    assert points(TWO, pins) == points(TWO, pins[::-1])
    assert credit(TWO, pins) == pytest.approx((1 + math.exp(-1)) / 2)


def test_pairing_finds_the_best_assignment_not_the_nearest_first() -> None:
    near = {"name": "Near", "x": 2000, "y": 3000, "radius": 5}
    next_door = {"name": "Next door", "x": 2030, "y": 3000, "radius": 5}
    payload = {"prompt": "Pin both.", "targets": [near, next_door]}
    # The first pin is nearest the first target, but taking it strands the second pin.
    pins = [{"x": 2014, "y": 3000}, {"x": 1950, "y": 3000}]
    assert credit(payload, pins) == pytest.approx((math.exp(-11 / 300) + math.exp(-45 / 300)) / 2)


@pytest.mark.parametrize(
    ("payload", "problem"),
    [
        ({**ONE, "bounds": DESERT}, "outside the bounds"),
        ({**ONE, "bounds": {**DESERT, "max_x": DESERT["min_x"]}}, "holds no tile"),
        ({"prompt": "Two.", "targets": [FALADOR, {**FALADOR, "name": "Fally"}]}, "share a tile"),
        ({"prompt": "Two.", "targets": [FALADOR, {**VARROCK, "name": "Falador"}]}, "share a name"),
    ],
)
def test_check_refuses(payload: dict[str, Any], problem: str) -> None:
    assert any(problem in found for found in map_pin.check(payload))


def envelope(payload: dict[str, Any], **fields: Any) -> dict[str, Any]:
    question = {
        "type": "map_pin",
        "mode": "custom",
        "payload": payload,
        "source": "room",
        "tags": [],
        **fields,
    }
    return {**question, "id": schema.content_id(question)}


@pytest.mark.parametrize(
    "payload",
    [
        {"prompt": "Where?", "targets": [{**FALADOR, "radius": 4}]},
        {"prompt": "Where?", "targets": []},
        {
            "prompt": "Where?",
            "targets": [{**FALADOR, "name": str(n), "x": FALADOR["x"] + n} for n in range(7)],
        },
        {"prompt": "Where?", "targets": [{**FALADOR, "x": 767}]},
    ],
)
def test_the_schema_refuses(payload: dict[str, Any]) -> None:
    assert schema.schema_errors(envelope(payload))


def test_a_host_or_an_event_cannot_ask_it() -> None:
    errors = schema.errors(envelope(ONE))
    assert any("is not accepted in 'custom'" in error for error in errors)


class Instance:
    random_event_game_mode = False


@pytest.fixture
def map_round(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setitem(MODES, "mark_it", Mode("mark_it", frozenset({"map_pin"})))
    return "mark_it"


def pool(mode: str) -> list[Pack]:
    question = {"type": "map_pin", "mode": mode, "payload": ONE}
    return [Pack(name="test", generated_at=None, questions=(question,), path=Path("test.json"))]


def test_no_tiles_draws_no_map_question() -> None:
    question = {"type": "map_pin", "mode": "mark_it", "payload": ONE}
    assert not drawable(question, {})
    assert drawable(question, {TILES: "clean"})


def test_a_map_round_is_offered_only_with_tiles(map_round: str) -> None:
    packs = pool(map_round)
    assert map_round not in {mode.id for mode in offered(Instance(), packs, {})}
    assert map_round in {mode.id for mode in offered(Instance(), packs, {TILES: "clean"})}


def test_the_server_offers_a_map_round_once_it_has_the_tiles(
    client: TestClient, map_round: str
) -> None:
    def listed() -> bool:
        return map_round in {mode["id"] for mode in client.get("/api/modes").json()}

    state = client.app.state  # type: ignore[attr-defined]
    state.packs = [*state.packs, *pool(map_round)]
    assert not listed()
    settings = {"modes": [{"mode": map_round, "questions": 1}]}
    body = {"returning": False, "display_name": "Zezima", "settings": settings}
    response = client.post("/api/rooms", json=body)
    assert (response.status_code, response.json()["code"]) == (403, "mode_not_offered")
    state.rooms.pictures = {TILES: "clean"}
    assert listed()


@pytest.mark.parametrize(
    "case", json.loads(FIXTURE.read_text(encoding="utf-8")), ids=lambda case: case["about"]
)
def test_the_client_reads_the_same_credit(case: dict[str, Any]) -> None:
    """``lib/pins.test.ts`` runs these too: the reveal's lines repeat this pairing."""
    payload: dict[str, Any] = {"prompt": "Where?", "targets": case["targets"]}
    if "bounds" in case:
        payload["bounds"] = case["bounds"]
    assert credit(payload, case["pins"]) == pytest.approx(case["credit"])
