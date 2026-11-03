"""Mark the Map: a place's name, one pin on the whole surface, and its first draft's script."""

import dataclasses
import json
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import REPO_ROOT
from app.modes import MODES, TILES
from app.questions.types import map_pin
from app.questions.types.timing import Timing
from tests.game_api import answer_after

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import gen_locations  # noqa: E402
from import_suggestions import DEFAULT_ROSTER, check_packs  # noqa: E402

PACK = REPO_ROOT / "data" / "packs" / "mark_the_map.json"
POLYGON = "{{Map|name=Falador|mtype=polygon|2940,3310|3060,3310|3060,3400|2940,3400|plane=0}}"


def questions() -> list[dict[str, Any]]:
    return json.loads(PACK.read_text(encoding="utf-8"))["questions"]


def infobox(maps: str, body: str = "") -> str:
    return f"{{{{Infobox Location\n|name = Somewhere\n|map = {maps}\n|members = No\n}}}}\n{body}"


def test_it_asks_for_one_pin_on_the_whole_surface() -> None:
    assert MODES["mark_the_map"].types == frozenset({"map_pin"})
    assert map_pin.ANSWER == Timing(base=20, per_item=10)
    for question in questions():
        payload = question["payload"]
        assert len(payload["targets"]) == 1
        assert "bounds" not in payload
        assert payload["targets"][0]["name"] in payload["prompt"]
    prompts = [question["payload"]["prompt"] for question in questions()]
    assert len(set(prompts)) == len(prompts)


def test_a_place_inside_another_opens_on_both_and_is_reached_sooner() -> None:
    zoomed = [question["payload"] for question in questions() if "view" in question["payload"]]
    assert zoomed
    for payload in zoomed:
        target, view = payload["targets"][0], payload["view"]
        assert view["min_x"] <= target["min_x"] and target["max_x"] <= view["max_x"]
        assert view["min_y"] <= target["min_y"] and target["max_y"] <= view["max_y"]
        assert payload["reach"] == 50
    whole = [question["payload"] for question in questions() if "view" not in question["payload"]]
    assert all("reach" not in payload for payload in whole)


def test_every_pack_question_passes_check() -> None:
    assert len(questions()) >= 100
    for question in questions():
        assert map_pin.check(question["payload"]) == [], question["payload"]["prompt"]


def test_an_open_question_shows_the_name_and_no_coordinates() -> None:
    for question in questions():
        payload = question["payload"]
        opening = {"view": payload["view"]} if "view" in payload else {}
        assert map_pin.client_view(payload) == {"prompt": payload["prompt"], "pins": 1, **opening}


def test_the_server_offers_it_once_it_has_the_tiles(app: FastAPI, client: TestClient) -> None:
    def listed() -> bool:
        return "mark_the_map" in {mode["id"] for mode in client.get("/api/modes").json()}

    app.state.rooms.pictures = {}
    assert not listed()
    app.state.rooms.pictures = {TILES: "clean"}
    assert listed()


@pytest.fixture
def mapped(app: FastAPI, table: Any) -> Any:
    app.state.rooms.pictures = {TILES: "clean"}
    return table


def only(app: FastAPI, zoomed: bool) -> None:
    """Keep the room's Mark the Map pool to the zoomed questions or to the whole-map ones."""
    app.state.rooms.packs = [
        dataclasses.replace(
            pack,
            questions=tuple(
                q
                for q in pack.questions
                if q["mode"] != "mark_the_map" or ("view" in q["payload"]) == zoomed
            ),
        )
        for pack in app.state.rooms.packs
    ]


def east_of(target: dict[str, int], tiles: int) -> list[dict[str, int]]:
    return [{"x": target["max_x"] + tiles, "y": (target["min_y"] + target["max_y"]) // 2}]


def test_points_are_the_distance_from_the_box_however_late(app: FastAPI, mapped: Any) -> None:
    only(app, zoomed=False)
    game = mapped(
        "Zezima",
        "Woox",
        "Lynx",
        "Durial",
        modes=["mark_the_map"],
        seconds=30,
        close_when_all_answered=False,
    )
    game.start()
    opened = game.opened(0)
    shown = {"prompt": game.question(0).payload["prompt"], "pins": 1}
    assert [m["question"]["view"] for m in opened] == [shown] * len(game.seats)
    target = game.question(0).payload["targets"][0]
    inside = [{"x": target["min_x"], "y": target["max_y"]}]
    for seat, pins, seconds in zip(
        game.players,
        (inside, inside, east_of(target, 50), east_of(target, 100)),
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
    assert all(len(row["value"]) == 1 for row in closed["results"].values())


def test_a_zoomed_question_opens_on_its_view_and_reaches_half_as_far(
    app: FastAPI, mapped: Any
) -> None:
    only(app, zoomed=True)
    game = mapped("Zezima", "Woox", modes=["mark_the_map"], seconds=30)
    game.start()
    payload = game.question(0).payload
    assert game.opened(0)[0]["question"]["view"]["view"] == payload["view"]
    target = payload["targets"][0]
    for seat, tiles in zip(game.players, (25, 50), strict=True):
        answer_after(game, seat, 0, east_of(target, tiles), 1)
    closed = game.admin.take("question_closed")
    by_name = {seat.id: seat.name for seat in game.seats}
    points = {by_name[pid]: row["points"] for pid, row in closed["results"].items()}
    assert points == {"Zezima": 500, "Woox": 0}


def test_the_script_boxes_a_polygon_and_a_point() -> None:
    falador = gen_locations.place(infobox(POLYGON))
    assert falador == {"min_x": 2940, "max_x": 3060, "min_y": 3310, "max_y": 3400}
    point = gen_locations.place(infobox("{{Map|name=Catherby|x=2814|y=3443|width=300}}"))
    assert point == {"min_x": 2809, "max_x": 2819, "min_y": 3438, "max_y": 3448}


@pytest.mark.parametrize(("zoom", "across"), [("0", 100), ("1", 50), ("2", 20), ("3", 10)])
def test_the_script_sizes_a_point_by_how_far_its_map_zooms_out(zoom: str, across: int) -> None:
    tiles = gen_locations.place(infobox(f"{{{{Map|name=Varrock|x=3210|y=3448|zoom={zoom}}}}}"))
    assert tiles is not None
    assert tiles["max_x"] - tiles["min_x"] == tiles["max_y"] - tiles["min_y"] == across
    assert (tiles["min_x"] + tiles["max_x"]) / 2 == 3210


def test_the_script_takes_the_polygon_over_a_point_and_ignores_the_body() -> None:
    switch = (
        "{{Switch infobox|item1=" + POLYGON + "|text1=Today"
        "|item2={{Map|name=Falador|x=3000|y=3360}}|text2=Earlier}}"
    )
    assert gen_locations.place(infobox(switch))["max_x"] == 3060
    entrance = "{{Map|x=3100|y=3200|mtype=square|r=4}}"
    assert gen_locations.place(infobox("No", entrance)) is None


def test_the_script_sizes_a_rectangle_and_widens_a_small_area() -> None:
    bank = gen_locations.place(infobox("{{Map|x=3269|y=3167|rectX=8|rectY=14|mtype=rectangle}}"))
    assert bank == {"min_x": 3264, "max_x": 3274, "min_y": 3160, "max_y": 3174}
    tiny = "{{Map|mtype=polygon|3000,3000|3004,3000|3004,3004|3000,3004}}"
    assert gen_locations.place(infobox(tiny)) == {
        "min_x": 2997,
        "max_x": 3007,
        "min_y": 2997,
        "max_y": 3007,
    }


@pytest.mark.parametrize(
    "maps",
    [
        "{{Map|x=3000|y=3360|plane=1}}",
        "{{Map|x=3000|y=3360|mapID=5}}",
        "{{Map|x=2867|y=9600|mapID=-1}}",
        "No",
    ],
    ids=["upstairs", "another map", "underground", "no map"],
)
def test_the_script_skips_what_is_not_on_the_surface(maps: str) -> None:
    assert gen_locations.place(infobox(maps)) is None


def test_the_script_skips_water_and_regions_and_flags_shared_names() -> None:
    point = infobox("{{Map|x=3000|y=3200}}")
    pages = {
        "Bay of Sarim": point,
        "Asgarnia": point,
        "Chaos Temple (Asgarnia)": infobox("{{Map|x=2935|y=3515}}"),
        "Chaos Temple (Wilderness)": infobox("{{Map|x=3236|y=3635}}"),
        "Falador": infobox(POLYGON),
    }
    pack, shared = gen_locations.draft(pages, {"Bay of Sarim", "Asgarnia"}, {"Falador"})
    names = [q["payload"]["targets"][0]["name"] for q in pack["questions"]]
    assert names == ["Chaos Temple", "Chaos Temple", "Falador"]
    assert shared == ["Chaos Temple"]
    assert pack["questions"][0]["wiki"].endswith("/w/Chaos_Temple_(Asgarnia)")
    assert [q["difficulty"] for q in pack["questions"]] == ["medium", "medium", "easy"]
    assert "generated_at" not in pack


def test_the_scripts_draft_loads(tmp_path: Path) -> None:
    pages = {"Falador": infobox(POLYGON), "Catherby": infobox("{{Map|x=2814|y=3443}}")}
    pack, _ = gen_locations.draft(pages, set(), set())
    packs = tmp_path / "packs"
    packs.mkdir()
    roster = DEFAULT_ROSTER.read_text(encoding="utf-8")
    written = {packs / "mark_the_map.json": gen_locations.render(pack)}
    assert check_packs(packs, written, roster) == []


def test_the_script_never_overwrites_the_pack(tmp_path: Path) -> None:
    (tmp_path / "mark_the_map.json").write_text("{}", encoding="utf-8")
    assert gen_locations.main(["--packs-dir", str(tmp_path)]) == 1
    assert (tmp_path / "mark_the_map.json").read_text(encoding="utf-8") == "{}"
