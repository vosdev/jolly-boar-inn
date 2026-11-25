"""Pin on the map: what is particular to it. ``test_type_contract`` holds it to the rest."""

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT
from app.modes import MODES, TILES, Mode, drawable, offered, problems
from app.questions import schema
from app.questions.packs import Pack
from app.questions.submission import Submission
from app.questions.types import map_pin

FIXTURE = REPO_ROOT / "client" / "src" / "lib" / "mapPins.fixture.json"
SARIM = {"name": "Port Sarim", "min_x": 3008, "max_x": 3060, "min_y": 3180, "max_y": 3260}
VARROCK = {"name": "Varrock", "min_x": 3170, "max_x": 3270, "min_y": 3380, "max_y": 3500}
ONE: dict[str, Any] = {"prompt": "Where is Port Sarim?", "targets": [SARIM]}
TWO: dict[str, Any] = {"prompt": "Pin both.", "targets": [SARIM, VARROCK]}
DESERT = {"min_x": 3100, "max_x": 3400, "min_y": 2800, "max_y": 3100}
OASIS = {"name": "Oasis", "min_x": 3240, "max_x": 3260, "min_y": 2940, "max_y": 2960}


def credit(payload: dict[str, Any], pins: list[dict[str, int]]) -> float:
    player = uuid4()
    return map_pin.grade(payload, [Submission(player_id=player, value=pins)])[player]


def points(payload: dict[str, Any], pins: list[dict[str, int]]) -> int:
    return round(1000 * credit(payload, pins))


def east_of(target: dict[str, Any], tiles: int) -> dict[str, int]:
    """A tile that many past the target's east edge, level with its middle."""
    return {"x": target["max_x"] + tiles, "y": (target["min_y"] + target["max_y"]) // 2}


def test_the_open_view_has_the_pin_count_and_no_target() -> None:
    view = map_pin.client_view({**TWO, "bounds": DESERT})
    assert view == {"prompt": "Pin both.", "bounds": DESERT, "pins": 2}


def test_the_open_view_says_where_the_map_opens() -> None:
    view = map_pin.client_view({**ONE, "view": DESERT})
    assert view == {"prompt": "Where is Port Sarim?", "view": DESERT, "pins": 1}


def test_a_pin_outside_the_view_still_counts() -> None:
    assert map_pin.parse_value({**ONE, "view": DESERT}, [{"x": 3030, "y": 3220}]) is not None
    assert points({**ONE, "view": DESERT}, [{"x": 3030, "y": 3220}]) == 1000


def test_the_reveal_has_every_target() -> None:
    assert map_pin.reveal(TWO)["targets"] == [SARIM, VARROCK]


def test_the_reveal_says_what_reach_scored() -> None:
    assert map_pin.reveal(ONE)["reach"] == 100
    assert map_pin.reveal({**ONE, "reach": 250})["reach"] == 250


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
    region = {"prompt": "Where?", "targets": [OASIS], "bounds": DESERT}
    assert map_pin.parse_value(region, [{"x": 3099, "y": 2970}]) is None
    assert map_pin.parse_value(region, [{"x": 3100, "y": 2970}]) == [{"x": 3100, "y": 2970}]


@pytest.mark.parametrize(
    "pin",
    [
        {"x": 3008, "y": 3180},
        {"x": 3060, "y": 3260},
        {"x": 3010, "y": 3258},
        {"x": 3034, "y": 3220},
    ],
)
def test_all_of_the_box_is_full_credit(pin: dict[str, int]) -> None:
    assert credit(ONE, [pin]) == 1.0


@pytest.mark.parametrize(
    ("tiles", "scored"), [(0, 1000), (25, 750), (50, 500), (75, 250), (100, 0), (300, 0)]
)
def test_points_fall_in_a_line_from_the_edge_to_the_reach(tiles: int, scored: int) -> None:
    assert points(ONE, [east_of(SARIM, tiles)]) == scored


def test_off_a_corner_is_measured_to_the_corner() -> None:
    assert points(ONE, [{"x": SARIM["max_x"] + 30, "y": SARIM["max_y"] + 40}]) == 500


def test_a_tall_town_gives_no_credit_beside_it() -> None:
    assert points(ONE, [{"x": SARIM["min_x"] - 100, "y": SARIM["max_y"]}]) == 0


def test_points_never_rise_with_distance() -> None:
    far = [points(ONE, [east_of(SARIM, tiles)]) for tiles in range(0, 400, 10)]
    assert far == sorted(far, reverse=True)


def test_a_region_scales_the_reach() -> None:
    region = {"prompt": "Where?", "targets": [OASIS], "bounds": DESERT}
    assert points(region, [east_of(OASIS, 30)]) == 500


def test_a_big_region_keeps_the_whole_maps_reach() -> None:
    bounds = {"min_x": 768, "max_x": 4095, "min_y": 1792, "max_y": 4351}
    assert points({**ONE, "bounds": bounds}, [east_of(SARIM, 50)]) == 500


def test_a_question_may_set_its_own_reach() -> None:
    assert points({**ONE, "reach": 400}, [east_of(SARIM, 300)]) == 250
    region = {"prompt": "Where?", "targets": [OASIS], "bounds": DESERT, "reach": 120}
    assert points(region, [east_of(OASIS, 30)]) == 750


def test_pins_pair_with_targets_whichever_order_they_arrive_in() -> None:
    pins = [east_of(VARROCK, 0), east_of(SARIM, 50)]
    assert points(TWO, pins) == points(TWO, pins[::-1])
    assert credit(TWO, pins) == pytest.approx(0.75)


def test_pairing_finds_the_best_assignment_not_the_nearest_first() -> None:
    near = {"name": "Near", "min_x": 2000, "max_x": 2010, "min_y": 3000, "max_y": 3010}
    next_door = {"name": "Next door", "min_x": 2040, "max_x": 2050, "min_y": 3000, "max_y": 3010}
    payload = {"prompt": "Pin both.", "targets": [near, next_door]}
    # The first pin is nearest the first target, but taking it strands the second pin.
    pins = [{"x": 2024, "y": 3005}, {"x": 1960, "y": 3005}]
    assert credit(payload, pins) == pytest.approx((0.84 + 0.6) / 2)


@pytest.mark.parametrize(
    ("payload", "problem"),
    [
        ({**ONE, "bounds": DESERT}, "outside the bounds"),
        ({**ONE, "bounds": {**DESERT, "max_x": DESERT["min_x"]}}, "holds no tile"),
        ({**ONE, "view": {**DESERT, "max_y": DESERT["min_y"]}}, "view: "),
        ({**ONE, "bounds": DESERT, "view": {**DESERT, "max_x": 3500}}, "opens outside"),
        ({"prompt": "Two.", "targets": [SARIM, {**SARIM, "name": "Sarim"}]}, "overlaps"),
        (
            {"prompt": "Two.", "targets": [SARIM, {**VARROCK, "name": SARIM["name"]}]},
            "share a name",
        ),
        (
            {"prompt": "Tiny.", "targets": [{**SARIM, "max_x": SARIM["min_x"] + 9}]},
            "under 10 tiles",
        ),
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
        {"prompt": "Where?", "targets": []},
        {
            "prompt": "Where?",
            "targets": [
                {**SARIM, "name": str(n), "min_x": SARIM["min_x"] + n * 100} for n in range(7)
            ],
        },
        {"prompt": "Where?", "targets": [{**SARIM, "min_x": 767}]},
        {"prompt": "Where?", "targets": [{**SARIM, "radius": 40}]},
        {**ONE, "reach": 9},
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
    for key in ("bounds", "reach"):
        if key in case:
            payload[key] = case[key]
    assert credit(payload, case["pins"]) == pytest.approx(case["credit"])
    assert map_pin.reveal(payload)["reach"] == case["scored_reach"]


def test_only_kgp_recon_and_minimap_guesser_draw_map_icons_while_open() -> None:
    rules = json.loads((REPO_ROOT / "schema" / "modes.json").read_text(encoding="utf-8"))
    drawn = {mode["id"] for mode in rules["modes"] if mode["map_icons"]}
    assert drawn == {"kgp_recon", "minimap_guesser"}


def test_a_mode_with_map_icons_plays_map_pin() -> None:
    mode = Mode(id="x", types=frozenset({"multiple_choice"}), map_icons=True)
    assert problems(mode) == ["x: draws map icons, so it plays map_pin"]


def test_only_kgp_recon_draws_map_labels_while_open() -> None:
    rules = json.loads((REPO_ROOT / "schema" / "modes.json").read_text(encoding="utf-8"))
    assert {mode["id"] for mode in rules["modes"] if mode["map_labels"]} == {"kgp_recon"}


def test_a_mode_with_map_labels_plays_map_pin() -> None:
    mode = Mode(id="x", types=frozenset({"multiple_choice"}), map_labels=True)
    assert problems(mode) == ["x: draws map labels, so it plays map_pin"]
