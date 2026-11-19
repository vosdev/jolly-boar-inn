"""Idle rooms leave memory: ``RoomManager.evict_idle``, and what it must never drop.

A room with nobody connected and nothing running goes after ``idle_room_seconds``, and
the next lookup rehydrates it from Postgres. Tests run a pass directly rather than
waiting on the sweep task.
"""

import time
from typing import Any
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.rooms.state import IDLE_ROOM_SECONDS, RoomManager
from tests.game_api import reseat
from tests.rooms_api import call, closed_with, create, create_fast, hello, join
from tests.test_game import TANZANITE
from tests.test_invite_links import create_keyed
from tests.test_join_requests import ticket
from tests.test_ws import snapshot


def sweep(client: TestClient) -> int:
    return call(client, client.app.state.rooms.evict_idle)  # type: ignore[attr-defined]


def held_in_memory(app: FastAPI, code: str) -> bool:
    return code in app.state.rooms.rooms


def wait_for(predicate: Any, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while not predicate():
        assert time.monotonic() < deadline, "timed out"
        time.sleep(0.01)


def test_an_idle_lobby_leaves_memory_and_comes_back_intact(
    app: FastAPI, client: TestClient, clock: list[float]
) -> None:
    manager: RoomManager = app.state.rooms
    room, _, _ = create_fast(app, client, custom=[TANZANITE], questions=4, pace="walk")
    code = room.code
    player = join(client, code, "Zezima").json()
    expected = snapshot(room)
    custom, settings = list(room.custom_questions), room.settings

    clock[0] += IDLE_ROOM_SECONDS - 1
    assert sweep(client) == 0
    assert manager.rooms[code] is room

    clock[0] += 2
    assert sweep(client) == 1
    assert not held_in_memory(app, code)
    assert code not in manager._locks

    back = call(client, manager.get, code)
    assert back is not room
    assert snapshot(back) == expected
    assert back.custom_questions == custom
    assert back.settings == settings

    with client.websocket_connect(f"/ws/{code}") as ws:
        welcome = hello(ws, player["session"])
        assert manager.rooms[code] is back
        assert [p["display_name"] for p in welcome["players"]] == ["Admin", "Zezima"]
        assert welcome["you"]["connected"] is True


def test_a_lookup_does_not_keep_an_idle_room_in_memory(
    app: FastAPI, client: TestClient, clock: list[float]
) -> None:
    """A stranger polling the code is not activity, or polling would pin the room for good."""
    code, _ = create(client)
    clock[0] += IDLE_ROOM_SECONDS - 60
    assert client.get(f"/api/rooms/{code}").status_code == 200
    clock[0] += 61
    assert sweep(client) == 1
    assert not held_in_memory(app, code)


def test_a_disconnect_restarts_the_idle_period(
    app: FastAPI, client: TestClient, clock: list[float]
) -> None:
    code, admin = create(client)
    clock[0] += IDLE_ROOM_SECONDS * 2
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        assert sweep(client) == 0
        clock[0] += IDLE_ROOM_SECONDS
    wait_for(lambda: not app.state.rooms.rooms[code].sockets)
    clock[0] += IDLE_ROOM_SECONDS - 1
    assert sweep(client) == 0
    clock[0] += 2
    assert sweep(client) == 1


def test_a_room_with_a_socket_stays(app: FastAPI, client: TestClient, lobby) -> None:
    app.state.rooms.idle_room_seconds = 0
    code = lobby["code"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, lobby["player"]["session"])
        assert sweep(client) == 0
        assert held_in_memory(app, code)
    wait_for(lambda: not app.state.rooms.rooms[code].sockets)
    assert sweep(client) == 1


def test_a_room_with_a_pending_join_request_stays(app: FastAPI, client: TestClient) -> None:
    """Requests live in memory only; dropping the room would forget them."""
    app.state.rooms.idle_room_seconds = 0
    code, _ = create_keyed(client)
    ticket(client, code, "Woox")
    assert sweep(client) == 0
    assert app.state.rooms.rooms[code].requests


def test_a_game_playing_on_with_nobody_connected_stays(table, client, db) -> None:
    """Its timer task is the game; only once that game is over can the room go."""
    game = table(seconds=10, reveal_seconds=1)
    game.start()
    game.opened(0)
    room = game.room
    game.admin.ws.close()
    wait_for(lambda: not room.sockets)
    game.app.state.rooms.idle_room_seconds = 0

    assert sweep(client) == 0
    assert held_in_memory(game.app, game.code)
    assert room.timer is not None
    (stored,) = db("select closed_at from questions where position = 0")
    assert stored["closed_at"] is None


def test_a_playing_room_waiting_for_a_player_leaves_and_resumes_as_after_a_restart(
    table, client, db, evict
) -> None:
    """A room rehydrated mid-game holds only what Postgres does until a player is back."""
    game = table("Zezima", seconds=10, reveal_seconds=3)
    game.start()
    game.opened(0)
    player = game.players[0]
    game.answer(player, 0, game.right(0))
    player.take("answer_ack")
    game.admin.take("answer_count")
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_with(seat.ws, drain=True) == 1012

    assert client.get(f"/api/rooms/{game.code}").json() == {"status": "playing", "players": 2}
    manager: RoomManager = game.app.state.rooms
    assert manager.rooms[game.code].awaiting_player
    manager.idle_room_seconds = 0
    assert sweep(client) == 1
    assert not held_in_memory(game.app, game.code)

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        again = reseat(player, ws)
        welcome = again.take("welcome")
        room = game.room
        assert room.questions[0].voided is True
        assert room.phase == "reveal"
        assert room.timer is not None
        assert welcome["room"]["status"] == "playing"
        assert welcome["room"]["phase"] == "reveal"
        assert [s["points"] for s in welcome["standings"]] == [0, 0]
        assert again.take("question_open")["question"]["index"] == 1
    (stored,) = db("select voided from questions where position = 0")
    assert stored["voided"] is True
    assert UUID(player.id) in room.players
