"""Minimap Guesser: a baked minimap round a spot, pinned on the map, from ``/suggest`` to a pack."""

import io
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import similar
from app.config import REPO_ROOT
from app.modes import MODES, SUGGESTIBLE, TILES, drawable, offered, problems
from app.questions import schema
from app.questions.packs import Pack, load_packs
from app.questions.types import map_pin, pictured
from tests import test_suggestions
from tests.packs import PACKS_DIR
from tests.test_map_pin import Instance, envelope, points
from tests.test_suggestion_pictures import refused
from tests.test_suggestions import BEARER, queue, suggest

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import build_pictures  # noqa: E402
import minimap  # noqa: E402

app, client = test_suggestions.app, test_suggestions.client

PROMPT = "Where is this?"
SPOT = {"x": 3212, "y": 3428, "angle": 0}
ASSET = "minimap:3212_3428_0"
PAYLOAD: dict[str, Any] = {
    "prompt": PROMPT,
    "targets": [map_pin.minimap_target(3212, 3428, "Varrock Square")],
    "minimap": SPOT,
}
SUGGESTED = {
    "kind": "question",
    "content": {
        "type": "map_pin",
        "mode": "minimap_guesser",
        "difficulty": "easy",
        "wiki": "https://oldschool.runescape.wiki/w/Varrock_Square",
        "payload": PAYLOAD,
    },
    "credit": "AFKFisher",
    "credit_shown": False,
}

RED = (255, 0, 0, 255)
BLUE = (0, 0, 255, 255)
GREEN = (0, 255, 0, 255)


def round_question(payload: dict[str, Any]) -> dict[str, Any]:
    return envelope(payload, mode="minimap_guesser", source="pack", difficulty="easy")


def suggested(**payload: Any) -> dict[str, Any]:
    body = deepcopy(SUGGESTED)
    body["content"]["payload"] = {**PAYLOAD, **payload}
    return body


def paint(tiles: Path, x: int, y: int, colour: tuple[int, int, int, int]) -> None:
    """Colour game tile ``x``, ``y`` in its zoom 2 tile, making the tile if it is not there."""
    column, row = x // 64, y // 64
    path = minimap.tile_path(tiles, column, row)
    path.parent.mkdir(parents=True, exist_ok=True)
    tile = Image.open(path).convert("RGBA") if path.is_file() else Image.new("RGBA", (256, 256))
    left, top = (x % 64) * 4, (63 - y % 64) * 4
    tile.paste(colour, (left, top, left + 4, top + 4))
    tile.save(path)


def baked(tiles: Path, x: int, y: int, angle: int) -> Image.Image:
    return Image.open(io.BytesIO(minimap.bake(tiles, x, y, angle))).convert("RGBA")


# --- the picture ------------------------------------------------------------------------


def test_the_picture_is_the_minimap_across_at_four_pixels_a_tile(tmp_path: Path) -> None:
    image = baked(tmp_path, 3212, 3428, 0)
    assert image.size == (2 * map_pin.MINIMAP_RADIUS * 4,) * 2 == (152, 152)
    assert image.getpixel((0, 0))[3] == 0
    assert image.getpixel((76, 76))[3] == 255


def test_the_spot_is_in_the_middle_and_north_is_up(tmp_path: Path) -> None:
    # The spot sits across a tile's corner, so its neighbours fall in other files.
    x, y = 3200, 3456
    paint(tmp_path, x, y, RED)
    paint(tmp_path, x, y + 10, BLUE)
    paint(tmp_path, x + 10, y, GREEN)
    image = baked(tmp_path, x, y, 0)
    assert image.getpixel((75, 75)) == RED
    assert image.getpixel((75, 75 - 40)) == BLUE
    assert image.getpixel((75 + 40, 75)) == GREEN


def test_a_turned_minimap_turns_clockwise(tmp_path: Path) -> None:
    x, y = 3212, 3428
    paint(tmp_path, x, y + 10, BLUE)
    image = baked(tmp_path, x, y, 90)
    # North, turned a quarter clockwise, points east.
    assert image.getpixel((75 + 40, 75)) == BLUE


def test_past_the_tiles_is_black(tmp_path: Path) -> None:
    image = baked(tmp_path, 3212, 3428, 0)
    assert image.getpixel((76, 76)) == (0, 0, 0, 255)


def test_build_pictures_bakes_a_minimap_only_with_the_tiles(tmp_path: Path) -> None:
    out, mapping = tmp_path / "pictures", tmp_path / "pictures.json"
    missing = build_pictures.build([ASSET], tmp_path / "staging", out, mapping, tiles=None)
    assert missing.missing == [ASSET]
    tiles = tmp_path / "tiles"
    paint(tiles, 3212, 3428, RED)
    report = build_pictures.build([ASSET], tmp_path / "staging", out, mapping, tiles=tiles)
    assert report.named == [ASSET]
    (file,) = out.iterdir()
    assert "3212" not in file.name and "3428" not in file.name
    assert Image.open(file).size == (152, 152)


def test_every_pack_question_is_one_spot_with_its_minimap() -> None:
    (pack,) = [pack for pack in load_packs(PACKS_DIR) if pack.name == "minimap_guesser"]
    assert len(pack.questions) >= 10
    assert {question["difficulty"] for question in pack.questions} == {"easy", "medium", "hard"}
    for question in pack.questions:
        payload = question["payload"]
        assert payload["prompt"] == PROMPT
        assert question["wiki"].startswith("https://oldschool.runescape.wiki/w/")
        assert map_pin.picture_asset(payload) in build_pictures.used_assets([pack])


# --- the question -----------------------------------------------------------------------


def test_the_open_view_carries_the_picture_but_no_spot_or_target() -> None:
    view = pictured("map_pin", map_pin.client_view(PAYLOAD), PAYLOAD, {ASSET: "a1b2.png"})
    assert view == {"prompt": PROMPT, "pins": 1, "north": 0, "picture": "a1b2.png"}
    turned = {**PAYLOAD, "minimap": {**SPOT, "angle": 135}}
    assert map_pin.client_view(turned)["north"] == 135
    revealed = map_pin.reveal(PAYLOAD)
    assert "minimap" not in revealed
    assert revealed["targets"] == PAYLOAD["targets"]


def test_anywhere_the_minimap_shows_is_full_points() -> None:
    assert points(PAYLOAD, [{"x": 3212, "y": 3428}]) == 1000
    assert points(PAYLOAD, [{"x": 3212 + 19, "y": 3428}]) == 1000
    assert points(PAYLOAD, [{"x": 3212 + 13, "y": 3428 + 13}]) == 1000


def test_points_fall_from_the_circles_edge_not_the_boxs() -> None:
    # The box's corner is past the circle: 19 x (sqrt 2 - 1) tiles off it.
    assert points(PAYLOAD, [{"x": 3212 + 19, "y": 3428 + 19}]) == 921
    assert points(PAYLOAD, [{"x": 3212 + 69, "y": 3428}]) == 500


def test_a_round_target_has_a_square_box() -> None:
    oval = {**PAYLOAD["targets"][0], "max_x": PAYLOAD["targets"][0]["max_x"] + 4}
    assert any("square" in found for found in map_pin.check({"prompt": "?", "targets": [oval]}))


def test_the_validator_holds_a_minimap_to_one_target_on_its_spot() -> None:
    assert not schema.schema_errors(round_question(PAYLOAD))
    assert not schema.consistency_errors(round_question(PAYLOAD))
    two = {**PAYLOAD, "targets": [*PAYLOAD["targets"], map_pin.minimap_target(3100, 3300, "B")]}
    assert any("one target" in found for found in map_pin.check(two))
    off = {**PAYLOAD, "targets": [map_pin.minimap_target(3220, 3428, "Varrock Square")]}
    assert any("its target" in found for found in map_pin.check(off))


@pytest.mark.parametrize("spot", [{"x": 500, "y": 3428}, {"x": 3212, "y": 5000}])
def test_the_validator_refuses_a_spot_off_the_surface(spot: dict[str, int]) -> None:
    payload = {**PAYLOAD, "minimap": {**SPOT, **spot}}
    assert schema.schema_errors(round_question(payload))


@pytest.mark.parametrize("angle", [-1, 360])
def test_the_angle_is_a_whole_turn_at_most(angle: int) -> None:
    payload = {**PAYLOAD, "minimap": {**SPOT, "angle": angle}}
    assert schema.schema_errors(round_question(payload))


def test_it_is_drawn_only_with_the_tiles_and_its_picture() -> None:
    question = {"type": "map_pin", "mode": "minimap_guesser", "payload": PAYLOAD}
    assert drawable(question, {TILES: "clean", ASSET: "a1b2.png"})
    assert not drawable(question, {TILES: "clean"})
    assert not drawable(question, {ASSET: "a1b2.png"})


def test_it_is_offered_only_with_the_tiles() -> None:
    question = {"type": "map_pin", "mode": "minimap_guesser", "payload": PAYLOAD}
    packs = [Pack(name="mm", generated_at=None, questions=(question,), path=Path("mm.json"))]
    assert "minimap_guesser" not in {m.id for m in offered(Instance(), packs, {ASSET: "a.png"})}
    shown = {m.id for m in offered(Instance(), packs, {TILES: "clean", ASSET: "a.png"})}
    assert "minimap_guesser" in shown


def test_the_mode_is_sound() -> None:
    assert not problems(MODES["minimap_guesser"])
    assert SUGGESTIBLE["minimap_guesser"].types == frozenset({"map_pin"})


# --- similar ----------------------------------------------------------------------------


def _spot(x: int, y: int, name: str) -> dict[str, Any]:
    payload = {
        "prompt": PROMPT,
        "targets": [map_pin.minimap_target(x, y, name)],
        "minimap": {"x": x, "y": y, "angle": 0},
    }
    return {"type": "map_pin", "mode": "minimap_guesser", "payload": payload}


def test_two_spots_within_the_radius_are_the_same_question() -> None:
    here = similar.features(_spot(3212, 3428, "Varrock Square"))
    near = similar.features(_spot(3212 + 11, 3428 + 15, "Varrock fountain"))
    far = similar.features(_spot(3212 + 14, 3428 + 15, "Varrock Square"))
    assert similar.score(here, near) == 100
    assert similar.score(here, far) == 0


# --- suggesting -------------------------------------------------------------------------


def test_a_spot_is_suggested_as_a_map_pin_with_its_minimap(client: TestClient) -> None:
    suggest(client, suggested(minimap={**SPOT, "angle": 30}))
    (row,) = queue(client)["suggestions"]
    assert row["content"]["payload"]["minimap"] == {**SPOT, "angle": 30}


def test_a_spot_needs_its_minimap_and_another_round_takes_none(client: TestClient) -> None:
    body = suggested()
    del body["content"]["payload"]["minimap"]
    assert "minimap" in refused(client, body)["message"]
    place = suggested()
    place["content"]["mode"] = "mark_the_map"
    place["content"]["payload"]["prompt"] = "Where is Varrock Square?"
    assert "minimap" in refused(client, place)["message"]


def test_a_spot_off_the_surface_is_refused(client: TestClient) -> None:
    body = suggested(
        minimap={"x": 700, "y": 3428, "angle": 0},
        targets=[map_pin.minimap_target(700, 3428, "Nowhere")],
    )
    assert refused(client, body)


def test_a_spot_keeps_the_rounds_reach_and_prompt(client: TestClient) -> None:
    assert "reach" in refused(client, suggested(reach=60))["message"]
    assert "always asks" in refused(client, suggested(prompt="Where am I?"))["message"]


def test_the_operator_moves_the_spot(client: TestClient) -> None:
    suggestion = suggest(client, suggested())
    (row,) = queue(client)["suggestions"]
    content = deepcopy(row["content"])
    content["payload"] |= {
        "minimap": {"x": 3215, "y": 3430, "angle": 90},
        "targets": [map_pin.minimap_target(3215, 3430, "Varrock Square")],
    }
    response = client.put(
        f"/api/admin/suggestions/{suggestion}",
        json={"content": content, "credit": "AFKFisher", "credit_shown": False},
        headers=BEARER,
    )
    assert response.status_code == 200, response.text
    assert response.json()["content"]["payload"]["minimap"] == {"x": 3215, "y": 3430, "angle": 90}


# --- the browser's preview --------------------------------------------------------------

FIXTURE = REPO_ROOT / "client" / "src" / "lib" / "minimap.fixture.json"


def test_the_preview_places_the_same_tiles_as_the_baker() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert (fixture["side"], fixture["turnable"]) == (minimap.SIDE, minimap.TURNABLE)
    for case in fixture["cases"]:
        spot = case["spot"]
        placed = [(t["column"], t["row"], t["left"], t["top"]) for t in case["tiles"]]
        assert minimap.placed_tiles(spot["x"], spot["y"]) == placed
