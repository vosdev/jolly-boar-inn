"""Question pictures: an open question names its picture by the random name it has in the
client, never by the asset id its payload holds, which for some modes is the answer."""

import json
import re
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import main
from app.config import Settings
from app.main import create_app
from app.pictures import load_pictures
from tests.conftest import stub_mode
from tests.game_api import Game, reseat
from tests.test_game import TANZANITE, event_rooms, reach, the_event

WHIP = "0123456789abcdef.png"


@pytest.fixture
def pictured_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """Two ``pick_from_list`` questions whose picture is their answer; only the whip's is built."""
    questions = [
        {
            "id": f"q_pictured_{item_id}",
            "type": "pick_from_list",
            "source": "pack",
            "tags": [],
            "payload": {
                "prompt": "Which item is this?",
                "vocab": "items",
                "answer_id": item_id,
                "image": f"item:{item_id}",
            },
        }
        for item_id in (4151, 4587)
    ]
    app.state.rooms.pictures = {"item:4151": WHIP}
    yield from stub_mode(app, "pictured_round", "pick_from_list", questions)


def strings_and_numbers(value: Any) -> Iterator[Any]:
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from strings_and_numbers(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from strings_and_numbers(inner)
    else:
        yield value


def names_the_id(frame: dict[str, Any], item_id: int) -> bool:
    """Whether ``frame`` holds ``item_id``: as a number, or in a string that is not a time."""
    for value in strings_and_numbers(frame):
        if isinstance(value, int) and not isinstance(value, bool) and value == item_id:
            return True
        if isinstance(value, str) and re.search(rf"(?<![0-9]){item_id}(?![0-9])", value):
            try:
                datetime.fromisoformat(value)
            except ValueError:
                return True
    return False


def open_at(game: Game, item_id: int) -> list[dict[str, Any]]:
    """Start ``game`` and play on to the question answered by ``item_id``; everyone's
    ``question_open`` for it. The reveal before it ends on its own."""
    game.start()
    index = next(i for i, q in enumerate(game.room.questions) if q.payload["answer_id"] == item_id)
    opened = game.opened(0)
    if index == 1:
        game.skip()
        opened = game.opened(1)
    for seat in game.seats:
        seat.seen.clear()
    return opened


def test_no_frame_of_an_open_question_names_its_asset_only_its_picture(
    table, pictured_round
) -> None:
    """Players answer, one reconnects mid-question, and nothing they get names the whip."""
    game = table("Zezima", "Woox", modes=[{"mode": pictured_round, "questions": 2}], seconds=30)
    opened = open_at(game, 4151)
    index = opened[0]["question"]["index"]
    zezima, woox = game.players
    game.answer(zezima, index, game.wrong(index))
    zezima.take("answer_ack")
    with game.client.websocket_connect(f"/ws/{game.code}") as ws:
        again = reseat(woox, ws)
        welcome = again.take("welcome")
        game.answer(again, index, game.right(index))
        again.take("answer_ack")
        game.skip()
        for seat in (game.admin, zezima, again):
            seat.take("question_closed")
        frames = [*opened, *game.admin.seen, *zezima.seen, *woox.seen, *again.seen]
    open_frames = [f for f in frames if f["t"] != "question_closed"]
    assert {f["t"] for f in open_frames} >= {
        "question_open",
        "welcome",
        "answer_ack",
        "answer_count",
    }
    assert [f for f in open_frames if names_the_id(f, 4151)] == []
    assert "item:" not in json.dumps(frames)
    assert {m["question"]["picture"] for m in opened} == {WHIP}
    assert welcome["question"]["picture"] == WHIP
    assert "image" not in welcome["question"]["view"]
    closed = [f for f in frames if f["t"] == "question_closed"]
    assert len(closed) == 3
    assert {f["picture"] for f in closed} == {WHIP}


def test_a_question_whose_picture_was_not_built_has_none(table, pictured_round) -> None:
    game = table("Zezima", "Woox", modes=[{"mode": pictured_round, "questions": 2}], seconds=30)
    opened = open_at(game, 4587)
    assert {m["question"]["picture"] for m in opened} == {None}
    game.skip()
    assert game.admin.take("question_closed")["picture"] is None


def test_a_host_s_own_question_never_has_a_picture(app, table, second_mode) -> None:
    """Were it named, a host could learn which name every asset has from their own questions."""
    app.state.rooms.pictures = {"item:4151": WHIP}
    pictured = {**TANZANITE, "payload": {**TANZANITE["payload"], "image": "item:4151"}}
    game = table("Zezima", "Woox", custom=[pictured], reveal_seconds=1, **event_rooms(second_mode))
    event = the_event(game)
    assert event.payload["image"] == "item:4151"
    frames = reach(game, event.position)
    assert {frame["picture"] for frame in frames.values()} == {None}


def test_without_the_file_no_question_has_a_picture(tmp_path: Path) -> None:
    assert load_pictures(tmp_path / "pictures.json", tmp_path) == {}


def test_the_file_maps_each_asset_whose_picture_is_built_to_its_file(tmp_path: Path) -> None:
    """An entry whose file the built client lacks is dropped: no question draws a broken image."""
    path = tmp_path / "pictures.json"
    mace = "fedcba9876543210.webp"
    path.write_text(
        json.dumps(
            {
                "item:4151": {"file": WHIP, "sha256": "ab"},
                "item:4587": {"file": mace, "sha256": "cd"},
            }
        )
    )
    client = tmp_path / "pictures"
    client.mkdir()
    (client / WHIP).write_bytes(b"\x89PNG")
    assert load_pictures(path, client) == {"item:4151": WHIP}


@pytest.mark.parametrize(
    "mapping",
    [
        [],
        {"item:4151": {"file": "abyssal_whip.png"}},
        {"item:4151": {"file": "0123456789abcdef"}},
        {"item:4151": {"file": "0123456789abcdef.gif"}},
        {"item:4151": {"file": "../0123456789abcdef.png"}},
        {"whip": {"file": WHIP}},
        {"item:4151": WHIP},
        {"item:4151": {"file": WHIP}, "item:4587": {"file": WHIP}},
    ],
)
def test_a_malformed_file_refuses_to_load(tmp_path: Path, mapping: Any) -> None:
    path = tmp_path / "pictures.json"
    path.write_text(json.dumps(mapping))
    with pytest.raises(ValueError):
        load_pictures(path, tmp_path)


def test_a_dev_server_names_the_pictures_vite_serves(
    settings: Settings, dist: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Under ``make dev`` Vite serves ``client/public``: a missing or stale build hides none."""
    path = tmp_path / "pictures.json"
    path.write_text(json.dumps({"item:4151": {"file": WHIP, "sha256": "ab"}}))
    public = tmp_path / "public" / "pictures"
    public.mkdir(parents=True)
    (public / WHIP).write_bytes(b"\x89PNG")
    monkeypatch.setattr(main, "load_pictures", lambda client: load_pictures(path, client))
    built = create_app(settings, dist)
    dev = create_app(settings.model_copy(update={"client_pictures": str(public)}), dist)
    with TestClient(built), TestClient(dev):
        assert built.state.rooms.pictures == {}
        assert dev.state.rooms.pictures == {"item:4151": WHIP}
