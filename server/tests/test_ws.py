"""Test client connects, sends ``hello``, gets ``welcome`` with ``players`` and
``you``; second socket for the same player closes the first with 4000; bad session is
4001; disconnect flips ``connected`` in a broadcast to the remaining socket; a room
evicted from memory (test hook) rehydrates identically.

Plus section 3: join over HTTP is a ``room_updated`` trigger, ``ping``/``pong``, close codes
4004 and 4008, and section 1: a failed send removes the socket.
"""

import asyncio
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import REPO_ROOT
from app.rooms import codes
from app.rooms.state import Room, RoomManager
from app.ws import handler as ws_handler
from app.ws import protocol
from app.ws.outbox import Outbox
from tests.rooms_api import StalledSocket, call, closed_with, create, held, hello, join


def until(check: Callable[[], bool], seconds: float = 2.0) -> None:
    """Wait for something a socket's outbox does on the app's loop, not the test thread."""
    deadline = time.monotonic() + seconds
    while not check():
        assert time.monotonic() < deadline, "timed out waiting"
        time.sleep(0.01)


def snapshot(room: Room) -> dict[str, Any]:
    """Everything a rehydrated room must reproduce."""
    return {
        "id": room.id,
        "created_at": room.created_at,
        "expires_at": room.expires_at,
        "view": room.view().model_dump(mode="json"),
        "players": [p.view().model_dump(mode="json") for p in room.players.values()],
        "sessions": {p.id: p.session_hash for p in room.players.values()},
        "joined_at": [p.joined_at for p in room.players.values()],
    }


# --- hello / welcome ----------------------------------------------------------------


def test_hello_gets_welcome_with_players_and_you(client: TestClient, lobby) -> None:
    """Connect, send hello, get welcome with players and you."""
    code, player = lobby["code"], lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        welcome = hello(ws, player["session"])
        assert set(welcome) == {
            "t",
            "room",
            "you",
            "players",
            "question",
            "your_answer",
            "standings",
            "server_time",
            "server_version",
        }
        assert welcome["server_version"] == (REPO_ROOT / "VERSION").read_text().strip()
        assert welcome["you"] == {**player["player"], "connected": True}
        assert welcome["players"] == [lobby["admin"]["player"], welcome["you"]]
        assert welcome["players"][0]["connected"] is False
        assert welcome["question"] is None
        assert welcome["your_answer"] is None
        assert welcome["standings"] == [
            {
                "player_id": p["id"],
                "display_name": p["display_name"],
                "avatar": p["avatar"],
                "points": 0,
                "rank": 1,
                "points_gained": 0,
                "previous_rank": None,
            }
            for p in welcome["players"]
        ]
        served = datetime.fromisoformat(welcome["server_time"])
        assert served.tzinfo is not None
        assert abs((datetime.now(UTC) - served).total_seconds()) < 5
        # The HTTP view and the socket view are the same object rendered twice.
        assert held(client, code) == {"room": welcome["room"], "players": welcome["players"]}
        assert welcome["room"]["status"] == "lobby"
        assert welcome["room"]["total"] == 3
        assert welcome["room"]["phase"] == "idle"
        assert "session" not in str(welcome)
    assert held(client, code)["players"][1]["connected"] is False


def test_ping_gets_pong(client: TestClient, lobby) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["player"]["session"])
        ws.send_json({"t": "ping"})
        pong = ws.receive_json()
        assert pong["t"] == "pong"
        assert datetime.fromisoformat(pong["server_time"]).tzinfo is not None


def test_code_in_url_is_case_insensitive(client: TestClient, lobby) -> None:
    with client.websocket_connect(f"/ws/{lobby['code'].lower()}") as ws:
        assert hello(ws, lobby["player"]["session"])["room"]["code"] == codes.cased(lobby["code"])


# --- last device wins ---------------------------------------------------------------


def test_second_socket_for_same_player_closes_first_with_4000(client: TestClient, lobby) -> None:
    """Second socket for the same player closes the first with 4000."""
    code, session = lobby["code"], lobby["player"]["session"]
    with (
        client.websocket_connect(f"/ws/{code}") as first,
        client.websocket_connect(f"/ws/{code}") as second,
    ):
        hello(first, session)
        welcome = hello(second, session)
        assert welcome["you"]["connected"] is True
        assert closed_with(first) == 4000
        # The player stays connected, through the second socket only.
        assert held(client, code)["players"][1]["connected"] is True
        join(client, code, "Late")
        assert second.receive_json()["t"] == "room_updated"
        first.close()  # the replaced socket's own disconnect must not flip the flag
        assert held(client, code)["players"][1]["connected"] is True


# --- handshake failures -------------------------------------------------------------


def test_bad_session_closes_4001(client: TestClient, lobby) -> None:
    """Bad session is 4001, after one ``error bad_hello``."""
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        ws.send_json({"t": "hello", "session": "not-a-session"})
        error = ws.receive_json()
        assert error["t"] == "error"
        assert error["code"] == "bad_hello"
        assert closed_with(ws) == 4001


@pytest.mark.parametrize(
    "frame",
    [
        {"t": "ping"},
        {"t": "hello"},
        {"t": "hello", "session": ""},
        {"t": "hello", "session": "x", "extra": 1},
        {"session": "x"},
        [],
        "not json",
        b"\x00binary",
    ],
)
def test_malformed_first_frame_closes_4001(client: TestClient, lobby, frame) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        if isinstance(frame, bytes):
            ws.send_bytes(frame)
        elif isinstance(frame, str):
            ws.send_text(frame)
        else:
            ws.send_json(frame)
        error = ws.receive_json()
        assert error["t"] == "error"
        assert error["code"] == "bad_hello"
        assert closed_with(ws) == 4001


def test_unknown_or_expired_room_closes_4004(client: TestClient, lobby, db, evict) -> None:
    with client.websocket_connect("/ws/NOSUCHROOM") as ws:
        ws.send_json({"t": "hello", "session": lobby["player"]["session"]})
        assert closed_with(ws) == 4004
    code = lobby["code"]
    db("update rooms set expires_at = now() where code = $1", code)
    evict(code)
    with client.websocket_connect(f"/ws/{code}") as ws:
        ws.send_json({"t": "hello", "session": lobby["player"]["session"]})
        assert closed_with(ws) == 4004


# --- room_updated -------------------------------------------------------------------


def test_disconnect_flips_connected_in_broadcast_to_remaining_socket(
    client: TestClient, lobby
) -> None:
    """Disconnect flips ``connected`` in a broadcast to the remaining socket."""
    code = lobby["code"]
    with client.websocket_connect(f"/ws/{code}") as admin_ws:
        hello(admin_ws, lobby["admin"]["session"])
        with client.websocket_connect(f"/ws/{code}") as player_ws:
            hello(player_ws, lobby["player"]["session"])
            connected = admin_ws.receive_json()
            assert connected["t"] == "players_updated"
            assert [p["connected"] for p in connected["players"]] == [True, True]
            player_ws.close()
            update = admin_ws.receive_json()
        # Only the players changed, so only the players are sent.
        assert update["t"] == "players_updated"
        assert set(update) == {"t", "players"}
        assert [p["connected"] for p in update["players"]] == [True, False]
        assert update["players"][1]["id"] == lobby["player"]["player"]["id"]
        assert held(client, code)["players"] == update["players"]


def test_join_over_http_broadcasts_room_updated(client: TestClient, lobby) -> None:
    """Section 3: join is a ``room_updated`` trigger, so sockets see HTTP joiners."""
    code = lobby["code"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, lobby["admin"]["session"])
        response = join(client, code, "Newcomer")
        assert response.status_code == 200
        update = ws.receive_json()
        assert update["t"] == "room_updated"
        assert update["players"][-1] == response.json()["player"]
        assert len(update["players"]) == 3
        assert update["room"] == held(client, code)["room"]
        # A rejected join broadcasts nothing.
        assert join(client, code, "Newcomer").status_code == 409
        ws.send_json({"t": "ping"})
        assert ws.receive_json()["t"] == "pong"


def test_rejected_messages_keep_the_socket_open(client: TestClient, lobby) -> None:
    """A message the room will not act on is one ``error`` frame, not a disconnect.

    Only a frame we cannot parse is a protocol error (4008); being in the wrong state or
    the wrong role is an ordinary refusal.
    """
    code = lobby["code"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, lobby["player"]["session"])
        for frame, expected in (
            ({"t": "answer", "question_id": "q_x", "value": "higher"}, "not_open"),
            ({"t": "start_game"}, "not_admin"),  # the lobby fixture's player is not admin
            ({"t": "skip", "phase": "open", "index": 0}, "not_admin"),
            ({"t": "end_game"}, "not_admin"),
            ({"t": "kick", "player_id": lobby["admin"]["player"]["id"]}, "not_admin"),
        ):
            ws.send_json(frame)
            error = ws.receive_json()
            assert error["t"] == "error", error
            assert error["code"] == expected, (frame, error)
        ws.send_json({"t": "ping"})
        assert ws.receive_json()["t"] == "pong"
    with client.websocket_connect(f"/ws/{code}") as admin_ws:
        hello(admin_ws, lobby["admin"]["session"])
        # Nothing is running, so the phase a skip names is not, and it gets no reply: the
        # first frame back is the one for ``end_game``.
        admin_ws.send_json({"t": "skip", "phase": "open", "index": 0})
        for frame, expected in (
            ({"t": "end_game"}, "bad_state"),
            ({"t": "answer", "question_id": "q_x", "value": "higher"}, "not_open"),
        ):
            admin_ws.send_json(frame)
            error = admin_ws.receive_json()
            assert error["t"] == "error", error
            assert error["code"] == expected, (frame, error)


@pytest.mark.parametrize(
    "frame",
    [
        {"t": "hello", "session": "again"},
        {"t": "teleport"},
        {"t": "promote", "player_id": "not-a-uuid"},
        {"t": "answer", "question_id": "q"},
        {"t": "ping", "extra": True},
        {"t": "skip"},  # a skip names the phase and question it was pressed on
        {"t": "skip", "phase": "idle", "index": 0},
        {"t": "skip", "phase": "open", "index": -1},
        {"t": "skip", "phase": "open", "index": True},
        {"t": "skip", "phase": "open", "index": "0"},
        "{not json",
        b"\x00",
    ],
)
def test_protocol_error_after_hello_closes_4008(client: TestClient, lobby, frame) -> None:
    code = lobby["code"]
    with client.websocket_connect(f"/ws/{code}") as admin_ws:
        hello(admin_ws, lobby["admin"]["session"])
        with client.websocket_connect(f"/ws/{code}") as ws:
            hello(ws, lobby["player"]["session"])
            admin_ws.receive_json()  # the player's connect
            if isinstance(frame, bytes):
                ws.send_bytes(frame)
            elif isinstance(frame, str):
                ws.send_text(frame)
            else:
                ws.send_json(frame)
            error = ws.receive_json()
            assert error["t"] == "error"
            assert error["code"] in ("bad_message", "bad_hello")
            assert closed_with(ws) == 4008
            ws.close()
            # The close detaches the socket like any disconnect.
            update = admin_ws.receive_json()
            assert update["t"] == "players_updated"
            assert [p["connected"] for p in update["players"]] == [True, False]


# --- failed sends -------------------------------------------------------------------


class FlakySocket:
    """Stands in for a client whose sends start failing."""

    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self.closed_with: int | None = None
        self.alive = True

    async def send_json(self, data: dict[str, Any]) -> None:
        if not self.alive:
            raise RuntimeError("connection reset")
        self.sent.append(data)

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.closed_with = code


def test_failed_send_removes_socket_and_tells_the_others(
    app: FastAPI, client: TestClient, lobby
) -> None:
    """Section 1: a failed send removes the socket; the others see the disconnect."""
    manager: RoomManager = app.state.rooms
    code = lobby["code"]
    flaky = FlakySocket()
    with client.websocket_connect(f"/ws/{code}") as admin_ws:
        hello(admin_ws, lobby["admin"]["session"])
        player, _ = call(client, manager.connect, code, lobby["player"]["session"], flaky)
        until(lambda: bool(flaky.sent))
        assert flaky.sent[0]["t"] == "welcome"
        assert admin_ws.receive_json()["players"][1]["connected"] is True
        flaky.alive = False
        response = join(client, code, "Third")
        assert response.status_code == 200
        first = admin_ws.receive_json()  # the join itself, snapshotted before the send failed
        assert [p["connected"] for p in first["players"]] == [True, True, False]
        second = admin_ws.receive_json()  # the flaky socket's removal
        assert second["t"] == "players_updated"
        assert [p["connected"] for p in second["players"]] == [True, False, False]
        assert flaky.closed_with == 1011
        room = call(client, manager.get, code)
        assert player.id not in room.sockets
        assert room.players[player.id].connected is False
        # The handler-style disconnect for the dead socket is now a no-op.
        call(client, manager.disconnect, code, player.id, flaky)
        ws_alive = admin_ws
        ws_alive.send_json({"t": "ping"})
        assert ws_alive.receive_json()["t"] == "pong"


class DeadSocket:
    """A socket whose client is already gone.

    Uvicorn signals this with ``ClientDisconnected``, an ``OSError`` subclass, from both
    ``send`` and ``close``; Starlette does not wrap it.
    """

    async def send_json(self, data: dict[str, Any]) -> None:
        raise OSError("client is gone")

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        raise OSError("client is gone")


async def test_handler_send_and_close_survive_a_vanished_client() -> None:
    """A dropped client must not escape the handler's helpers as an exception."""
    ws = DeadSocket()
    pong = protocol.Pong(server_time=datetime.now(UTC))
    assert await ws_handler._send(ws, pong) is False  # type: ignore[arg-type]
    await ws_handler._close(ws, 4008, "protocol error")  # type: ignore[arg-type]


def test_failed_welcome_still_closes_the_replaced_socket(
    app: FastAPI, client: TestClient, lobby
) -> None:
    """A new socket that dies before ``welcome`` lands must not strand the old one."""
    manager: RoomManager = app.state.rooms
    code, session = lobby["code"], lobby["player"]["session"]
    with client.websocket_connect(f"/ws/{code}") as admin_ws:
        hello(admin_ws, lobby["admin"]["session"])
        first = FlakySocket()
        player, _ = call(client, manager.connect, code, session, first)
        until(lambda: bool(first.sent))
        assert first.sent[0]["t"] == "welcome"
        assert admin_ws.receive_json()["players"][1]["connected"] is True

        second = FlakySocket()
        second.alive = False  # the new device is gone before the welcome is written
        call(client, manager.connect, code, session, second)
        # The new device connecting, then its welcome failing.
        assert [p["connected"] for p in admin_ws.receive_json()["players"]] == [True, True]
        update = admin_ws.receive_json()
        assert update["t"] == "players_updated"
        assert [p["connected"] for p in update["players"]] == [True, False]

        until(lambda: first.closed_with is not None)
        assert first.closed_with == 4000  # replaced, not orphaned
        assert second.closed_with == 1011
        room = call(client, manager.get, code)
        assert player.id not in room.sockets
        assert room.players[player.id].connected is False


def test_replacing_a_stalled_socket_waits_for_nothing(
    app: FastAPI, client: TestClient, lobby
) -> None:
    """The old device's close queues behind its own frames; the room hears of the new one now."""
    manager: RoomManager = app.state.rooms
    code = lobby["code"]
    stalled = StalledSocket()
    with client.websocket_connect(f"/ws/{code}") as admin_ws:
        hello(admin_ws, lobby["admin"]["session"])
        call(client, manager.connect, code, lobby["player"]["session"], stalled)
        assert admin_ws.receive_json()["t"] == "players_updated"
        started = time.monotonic()
        with client.websocket_connect(f"/ws/{code}") as player_ws:
            hello(player_ws, lobby["player"]["session"])
            assert admin_ws.receive_json()["t"] == "players_updated"
            assert time.monotonic() - started < 1
            player_ws.send_json({"t": "ping"})
            assert player_ws.receive_json()["t"] == "pong"


def test_kicking_a_stalled_player_waits_for_nothing(
    app: FastAPI, client: TestClient, lobby
) -> None:
    manager: RoomManager = app.state.rooms
    code = lobby["code"]
    stalled = StalledSocket()
    with client.websocket_connect(f"/ws/{code}") as admin_ws:
        hello(admin_ws, lobby["admin"]["session"])
        call(client, manager.connect, code, lobby["player"]["session"], stalled)
        assert admin_ws.receive_json()["t"] == "players_updated"
        started = time.monotonic()
        admin_ws.send_json({"t": "kick", "player_id": lobby["player"]["player"]["id"]})
        update = admin_ws.receive_json()
        assert time.monotonic() - started < 1
        assert update["t"] == "room_updated"
        assert [p["display_name"] for p in update["players"]] == ["Admin"]


async def test_an_outbox_sends_in_order_and_closes_after_what_it_holds() -> None:
    ws = FlakySocket()
    outbox = Outbox(ws, on_failed=_never)
    assert outbox.put({"n": 1}) and outbox.put({"n": 2})
    outbox.close(4003, "removed from the room")
    assert outbox.closing and not outbox.put({"n": 3})
    await asyncio.wait_for(outbox.finished(), 1)
    assert ws.sent == [{"n": 1}, {"n": 2}]
    assert ws.closed_with == 4003


async def test_an_outbox_that_overflows_closes_and_detaches_its_socket_at_once() -> None:
    ws = StalledSocket()
    detached = asyncio.Event()

    async def on_failed() -> None:
        detached.set()

    outbox = Outbox(ws, on_failed=on_failed, limit=3)
    assert all(outbox.put({"n": n}) for n in range(3))
    assert not outbox.put({"n": 3})
    await asyncio.wait_for(detached.wait(), 1)  # not the ten seconds a send may take
    assert ws.closed_with == 1011
    assert not outbox.put({"n": 4})


async def test_an_outbox_whose_send_fails_closes_and_detaches_its_socket() -> None:
    ws = FlakySocket()
    ws.alive = False
    detached = asyncio.Event()

    async def on_failed() -> None:
        detached.set()

    outbox = Outbox(ws, on_failed=on_failed)
    outbox.put({"n": 1})
    await asyncio.wait_for(detached.wait(), 1)
    await asyncio.wait_for(outbox.finished(), 1)
    assert ws.closed_with == 1011


async def _never() -> None:
    raise AssertionError("this outbox should not have failed")


# --- rehydrate ----------------------------------------------------------------------


def test_evicted_room_rehydrates_identically(app: FastAPI, client: TestClient, lobby) -> None:
    """A room evicted from memory (test hook) rehydrates identically."""
    manager: RoomManager = app.state.rooms
    code = lobby["code"]
    before = call(client, manager.get, code)
    assert manager.rooms[code] is before
    expected = snapshot(before)
    assert len(expected["players"]) == 2

    assert call(client, manager.evict, code) is True
    assert code not in manager.rooms
    assert call(client, manager.evict, code) is False

    after = call(client, manager.get, code)
    assert after is not before
    assert manager.rooms[code] is after
    assert snapshot(after) == expected
    assert after.lock is manager._locks[code].lock  # the lock every caller of this code takes
    assert after.timer is None
    assert after.sockets == {}
    # The rehydrated room is the one everything now uses.
    assert held(client, code) == {
        "room": expected["view"],
        "players": expected["players"],
    }
    with client.websocket_connect(f"/ws/{code}") as ws:
        welcome = hello(ws, lobby["player"]["session"])
        assert welcome["players"][1]["connected"] is True
        assert UUID(welcome["you"]["id"]) in manager.rooms[code].sockets


def test_evict_closes_sockets_with_1012_and_they_reconnect(
    app: FastAPI, client: TestClient, lobby
) -> None:
    manager: RoomManager = app.state.rooms
    code = lobby["code"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, lobby["player"]["session"])
        assert call(client, manager.evict, code) is True
        assert closed_with(ws) == 1012
        ws.close()
        room = call(client, manager.get, code)
        assert room.sockets == {}
        assert all(not p.connected for p in room.players.values())
        with client.websocket_connect(f"/ws/{code}") as again:
            welcome = hello(again, lobby["player"]["session"])
            assert welcome["you"]["connected"] is True
            assert [p["connected"] for p in welcome["players"]] == [False, True]


def test_rehydrate_covers_a_room_nobody_has_connected_to(app: FastAPI, client: TestClient) -> None:
    """No sockets, no answers -- and an admin who is a database row, not a live object."""
    manager: RoomManager = app.state.rooms
    code, admin = create(client, modes=[{"mode": "more_less", "questions": 5}])
    expected = snapshot(call(client, manager.get, code))
    assert expected["view"]["status"] == "lobby"
    assert [p["display_name"] for p in expected["players"]] == ["Admin"]
    assert expected["players"][0]["role"] == "admin"
    call(client, manager.evict, code)
    after = call(client, manager.get, code)
    assert snapshot(after) == expected
    # The session the host was handed still finds them after the room was rebuilt.
    assert after.find_by_session(admin["session"]) is not None
