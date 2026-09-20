"""T8 Accept: test client connects, sends ``hello``, gets ``welcome`` with ``players`` and
``you``; second socket for the same player closes the first with 4000; bad session is
4001; disconnect flips ``connected`` in a broadcast to the remaining socket; a room
evicted from memory (test hook) rehydrates identically.

Plus section 3: join over HTTP is a ``room_updated`` trigger, ``ping``/``pong``, close codes
4004 and 4008, and section 1: a failed send removes the socket.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.rooms.state import Room, RoomManager
from app.ws import handler as ws_handler
from app.ws import protocol
from tests.rooms_api import call, create, join


@pytest.fixture
def lobby(client: TestClient) -> dict[str, Any]:
    """A room with its admin and one joined player: ``code``, ``admin``, ``player``."""
    code, admin = create(client, modes=[{"mode": "more_less", "questions": 3}])
    player = join(client, code, "Zezima").json()
    return {"code": code, "admin": admin, "player": player}


def hello(ws: WebSocketTestSession, session: str) -> dict[str, Any]:
    ws.send_json({"t": "hello", "session": session})
    message = ws.receive_json()
    assert message["t"] == "welcome", message
    return message


def closed_with(ws: WebSocketTestSession) -> int:
    with pytest.raises(WebSocketDisconnect) as info:
        ws.receive_json()
    return info.value.code


def get_room(client: TestClient, code: str) -> dict[str, Any]:
    response = client.get(f"/api/rooms/{code}")
    assert response.status_code == 200
    return response.json()


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
    """T8: connect, send hello, get welcome with players and you."""
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
        }
        assert welcome["you"] == {**player["player"], "connected": True}
        assert welcome["players"] == [lobby["admin"]["player"], welcome["you"]]
        assert welcome["players"][0]["connected"] is False
        assert welcome["question"] is None
        assert welcome["your_answer"] is None
        assert welcome["standings"] == [
            {"player_id": p["id"], "display_name": p["display_name"], "points": 0, "rank": 1}
            for p in welcome["players"]
        ]
        served = datetime.fromisoformat(welcome["server_time"])
        assert served.tzinfo is not None
        assert abs((datetime.now(UTC) - served).total_seconds()) < 5
        # The HTTP view and the socket view are the same object rendered twice.
        assert get_room(client, code) == {"room": welcome["room"], "players": welcome["players"]}
        assert welcome["room"]["status"] == "lobby"
        assert welcome["room"]["total"] == 3
        assert welcome["room"]["phase"] == "idle"
        assert "session" not in str(welcome)
    assert get_room(client, code)["players"][1]["connected"] is False


def test_ping_gets_pong(client: TestClient, lobby) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["player"]["session"])
        ws.send_json({"t": "ping"})
        pong = ws.receive_json()
        assert pong["t"] == "pong"
        assert datetime.fromisoformat(pong["server_time"]).tzinfo is not None


def test_code_in_url_is_case_insensitive(client: TestClient, lobby) -> None:
    with client.websocket_connect(f"/ws/{lobby['code'].lower()}") as ws:
        assert hello(ws, lobby["player"]["session"])["room"]["code"] == lobby["code"]


# --- last device wins ---------------------------------------------------------------


def test_second_socket_for_same_player_closes_first_with_4000(client: TestClient, lobby) -> None:
    """T8: second socket for the same player closes the first with 4000."""
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
        assert get_room(client, code)["players"][1]["connected"] is True
        join(client, code, "Late")
        assert second.receive_json()["t"] == "room_updated"
        first.close()  # the replaced socket's own disconnect must not flip the flag
        assert get_room(client, code)["players"][1]["connected"] is True


# --- handshake failures -------------------------------------------------------------


def test_bad_session_closes_4001(client: TestClient, lobby) -> None:
    """T8: bad session is 4001, after one ``error bad_hello``."""
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
    """T8: disconnect flips ``connected`` in a broadcast to the remaining socket."""
    code = lobby["code"]
    with client.websocket_connect(f"/ws/{code}") as admin_ws:
        hello(admin_ws, lobby["admin"]["session"])
        with client.websocket_connect(f"/ws/{code}") as player_ws:
            hello(player_ws, lobby["player"]["session"])
            connected = admin_ws.receive_json()
            assert connected["t"] == "room_updated"
            assert [p["connected"] for p in connected["players"]] == [True, True]
            player_ws.close()
            update = admin_ws.receive_json()
        assert update["t"] == "room_updated"
        assert set(update) == {"t", "room", "players"}
        assert [p["connected"] for p in update["players"]] == [True, False]
        assert update["players"][1]["id"] == lobby["player"]["player"]["id"]
        assert get_room(client, code)["players"] == update["players"]


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
        assert update["room"] == get_room(client, code)["room"]
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
            ({"t": "skip"}, "not_admin"),
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
        for frame, expected in (
            ({"t": "skip"}, "bad_state"),  # nothing is running to skip
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
            assert update["t"] == "room_updated"
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
        player = call(client, manager.connect, code, lobby["player"]["session"], flaky)
        assert flaky.sent[0]["t"] == "welcome"
        assert admin_ws.receive_json()["players"][1]["connected"] is True
        flaky.alive = False
        response = join(client, code, "Third")
        assert response.status_code == 200
        first = admin_ws.receive_json()  # the join itself, snapshotted before the send failed
        assert [p["connected"] for p in first["players"]] == [True, True, False]
        second = admin_ws.receive_json()  # the flaky socket's removal
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
        player = call(client, manager.connect, code, session, first)
        assert first.sent[0]["t"] == "welcome"
        assert admin_ws.receive_json()["players"][1]["connected"] is True

        second = FlakySocket()
        second.alive = False  # the new device is gone before the welcome is written
        with pytest.raises(WebSocketDisconnect):
            call(client, manager.connect, code, session, second)

        assert first.closed_with == 4000  # replaced, not orphaned
        assert second.closed_with == 1011
        room = call(client, manager.get, code)
        assert player.id not in room.sockets
        assert room.players[player.id].connected is False
        update = admin_ws.receive_json()
        assert update["t"] == "room_updated"
        assert [p["connected"] for p in update["players"]] == [True, False]


# --- rehydrate ----------------------------------------------------------------------


def test_evicted_room_rehydrates_identically(app: FastAPI, client: TestClient, lobby) -> None:
    """T8: a room evicted from memory (test hook) rehydrates identically."""
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
    assert after.lock is before.lock  # one lock per code, across evictions
    assert after.timer is None
    assert after.sockets == {}
    # The rehydrated room is the one everything now uses.
    assert get_room(client, code) == {
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
