"""Section 4's ``any → deleted``: the cleanup job, and the host's own delete button.

The job is ``RoomManager.purge_expired`` on a timer (``cleanup_expired_rooms`` in
``main.py``). The tests run a pass directly rather than sleeping on the interval; only
the two lifespan tests let the task run itself, and they poll instead of waiting a fixed
time.

``DELETE /api/rooms/{code}`` is the same deletion, asked for by an admin, without waiting
for the room to expire.
"""

import asyncio
import time
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import asyncpg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.config import Settings
from app.main import cleanup_expired_rooms
from tests.rooms_api import call, create, create_fast, join


def expire(db, code: str, when: datetime) -> None:
    """Move a room's ``expires_at``, in the database and in the copy the app holds."""
    db("update rooms set expires_at = $2 where code = $1", code, when)


def answer_one_question(db, code: str, player_id: str) -> None:
    """One ``answers`` row for this player, so the cascade has something to carry off."""
    db(
        "insert into answers (question_id, player_id, value)"
        " select q.id, $2::uuid, '0'::jsonb from questions q"
        " join rooms r on r.id = q.room_id"
        " where r.code = $1 and q.position = 0",
        code,
        player_id,
    )


def wait_until(predicate, timeout: float = 5.0) -> bool:
    """Poll from the test thread while the app's loop works in its own."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return False


def hello(ws: WebSocketTestSession, session: str) -> dict[str, Any]:
    ws.send_json({"t": "hello", "session": session})
    message = ws.receive_json()
    assert message["t"] == "welcome", message
    return message


# --- purge_expired ------------------------------------------------------------------


def test_purge_deletes_the_expired_room_and_its_children(
    app: FastAPI, client: TestClient, db
) -> None:
    """One room past ``expires_at``, one with a month left: only the first one goes.

    The room row is the only thing deleted; ``on delete cascade`` is what takes its
    players, its questions and their answers with it, which is the half of section 5's
    cleanup note that is easy to assume and worth checking.
    """
    expired, _ = create(client, "Host")
    live, _ = create(client, "Host")
    player = join(client, expired, "Zezima").json()["player"]
    answer_one_question(db, expired, player["id"])
    (gone,) = db("select id from rooms where code = $1", expired)
    expire(db, expired, datetime.now(UTC) - timedelta(minutes=1))

    assert call(client, app.state.rooms.purge_expired) == 1

    assert [row["code"] for row in db("select code from rooms")] == [live]
    assert db("select id from players where room_id = $1", gone["id"]) == []
    assert db("select id from questions where room_id = $1", gone["id"]) == []
    assert db("select id from answers where player_id = $1::uuid", player["id"]) == []
    # The live room kept everything it had.
    assert db("select id from players where room_id = (select id from rooms where code = $1)", live)
    assert db(
        "select id from questions where room_id = (select id from rooms where code = $1)", live
    )


def test_purge_with_nothing_to_delete_is_a_no_op(app: FastAPI, client: TestClient, db) -> None:
    code, _ = create(client, "Host")
    assert call(client, app.state.rooms.purge_expired) == 0
    assert [row["code"] for row in db("select code from rooms")] == [code]


def test_purge_drops_the_expired_room_from_memory(app: FastAPI, client: TestClient, db) -> None:
    """Memory must not hold what the database has dropped.

    ``expires_at`` is set on both sides of the room here: nothing in the app ever moves
    it, so the row and the cached copy agreeing is the normal case, not a contrivance.
    """
    expired, _ = create(client, "Host")
    live, _ = create(client, "Host")
    past = datetime.now(UTC) - timedelta(minutes=1)
    expire(db, expired, past)
    app.state.rooms.rooms[expired].expires_at = past

    assert call(client, app.state.rooms.purge_expired) == 1

    assert expired not in app.state.rooms.rooms
    assert live in app.state.rooms.rooms


def test_purge_closes_the_sockets_of_an_expired_room(app: FastAPI, client: TestClient, db) -> None:
    """4004: the room is gone, so a client that reconnects will not find it either."""
    code, admin = create(client, "Host")
    past = datetime.now(UTC) - timedelta(minutes=1)
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        expire(db, code, past)
        app.state.rooms.rooms[code].expires_at = past
        assert call(client, app.state.rooms.purge_expired) == 1
        with pytest.raises(WebSocketDisconnect) as info:
            ws.receive_json()
    assert info.value.code == 4004


def test_an_expired_room_is_refused_before_the_purge_reaches_it(
    client: TestClient, db, evict
) -> None:
    """The window between expiry and deletion is not a window anything can be done in.

    This is why ``purge_expired`` may delete the rows first and tidy memory afterwards.
    """
    code, admin = create(client, "Host")
    expire(db, code, datetime.now(UTC) - timedelta(minutes=1))
    evict(code)
    assert client.get(f"/api/rooms/{code}").status_code == 410
    assert join(client, code, "Zezima").status_code == 410
    response = client.request("DELETE", f"/api/rooms/{code}", json={"session": admin["session"]})
    assert response.status_code == 410


# --- the task in the lifespan -------------------------------------------------------


def test_the_lifespan_starts_the_task_and_cancels_it(app: FastAPI) -> None:
    with TestClient(app) as client:
        assert client.get("/api/health").json()["ok"] is True
        task = app.state.cleanup
        assert task is not None and not task.done()
        assert task.get_name() == "room-cleanup"
    assert task.done()  # cancelled and awaited by the lifespan, before the pool closed


def test_the_first_pass_runs_at_startup(app: FastAPI, db) -> None:
    """A deployment restarted more often than the interval still cleans up."""
    with TestClient(app) as client:
        code, _ = create(client, "Host")
    expire(db, code, datetime.now(UTC) - timedelta(minutes=1))

    with TestClient(app):
        assert wait_until(lambda: db("select code from rooms") == [])


async def test_a_failed_pass_does_not_stop_the_loop(caplog) -> None:
    """A database error is logged and the next pass runs; the task survives it."""
    passes = 0
    second = asyncio.Event()

    async def purge_expired() -> int:
        nonlocal passes
        passes += 1
        if passes == 1:
            raise asyncpg.PostgresError("the database went away")
        second.set()
        return 0

    app = SimpleNamespace(
        state=SimpleNamespace(
            settings=Settings(_env_file=None, room_cleanup_interval_seconds=0),
            rooms=SimpleNamespace(purge_expired=purge_expired),
        )
    )
    task = asyncio.create_task(cleanup_expired_rooms(app))
    try:
        await asyncio.wait_for(second.wait(), timeout=5)
    finally:
        task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert passes >= 2
    assert "room cleanup failed" in caplog.text


# --- DELETE /api/rooms/{code} -------------------------------------------------------


def delete_room(client: TestClient, code: str, session: str):
    return client.request("DELETE", f"/api/rooms/{code}", json={"session": session})


def test_an_admin_deletes_their_room(app: FastAPI, client: TestClient, db) -> None:
    """The host's button on the front page: the room is invalid immediately."""
    code, admin = create(client, "Host")
    other, _ = create(client, "Host")
    player = join(client, code, "Zezima").json()["player"]
    answer_one_question(db, code, player["id"])

    response = delete_room(client, code, admin["session"])
    assert response.status_code == 204, response.text
    assert response.content == b""

    assert [row["code"] for row in db("select code from rooms")] == [other]
    assert db("select id from players where id = $1::uuid", player["id"]) == []
    assert code not in app.state.rooms.rooms
    assert client.get(f"/api/rooms/{code}").status_code == 404
    assert join(client, code, "Someone").status_code == 404


def test_delete_frees_the_room_code(client: TestClient, db) -> None:
    """The point of the button: the word is back in circulation right away."""
    code, admin = create(client, "Host")
    assert delete_room(client, code, admin["session"]).status_code == 204
    assert db("select code from rooms where code = $1", code) == []
    # Nothing stops the allocator handing the same word out again.
    db(
        "insert into rooms (code, status, settings, expires_at) values ($1, 'lobby', $2, now())",
        code,
        {},
    )


def test_a_player_may_not_delete_the_room(client: TestClient, db) -> None:
    code, _ = create(client, "Host")
    player = join(client, code, "Zezima").json()
    response = delete_room(client, code, player["session"])
    assert response.status_code == 403
    assert response.json()["code"] == "not_admin"
    assert db("select code from rooms where code = $1", code)


def test_a_promoted_admin_may_delete_the_room(app: FastAPI, client: TestClient, db) -> None:
    """A promoted admin has the same reach as the creator over everything else."""
    code, admin = create(client, "Host")
    player = join(client, code, "Zezima").json()
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        ws.send_json({"t": "promote", "player_id": player["player"]["id"]})
        assert ws.receive_json()["t"] == "room_updated"
    assert delete_room(client, code, player["session"]).status_code == 204
    assert db("select code from rooms where code = $1", code) == []


def test_a_session_from_another_room_is_refused(client: TestClient, db) -> None:
    code, _ = create(client, "Host")
    _, elsewhere = create(client, "Host")
    response = delete_room(client, code, elsewhere["session"])
    assert response.status_code == 401
    assert response.json()["code"] == "bad_session"
    assert db("select code from rooms where code = $1", code)


def test_delete_needs_a_session_and_an_existing_room(client: TestClient) -> None:
    code, admin = create(client, "Host")
    assert delete_room(client, "NOSUCHROOM", admin["session"]).status_code == 404
    assert client.request("DELETE", f"/api/rooms/{code}", json={}).status_code == 422
    assert delete_room(client, code, "").status_code == 401


def test_delete_closes_the_sockets_in_the_room(client: TestClient) -> None:
    """Nobody is left sitting in a lobby the database has forgotten."""
    code, admin = create(client, "Host")
    player = join(client, code, "Zezima").json()
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, player["session"])
        assert delete_room(client, code, admin["session"]).status_code == 204
        with pytest.raises(WebSocketDisconnect) as info:
            ws.receive_json()
    assert info.value.code == 4004


def test_delete_ends_a_game_in_progress(app: FastAPI, client: TestClient, db) -> None:
    """A room being played is still the host's to remove; its timer goes with it."""
    room, _, session = create_fast(app, client, "Host")
    with client.websocket_connect(f"/ws/{room.code}") as ws:
        hello(ws, session)
        ws.send_json({"t": "start_game"})
        assert ws.receive_json()["t"] == "room_updated"
        assert ws.receive_json()["t"] == "question_open"
        assert room.timer is not None

        assert delete_room(client, room.code, session).status_code == 204

        with pytest.raises(WebSocketDisconnect) as info:
            ws.receive_json()
    assert info.value.code == 4004
    assert room.timer is None  # the one task driving the room, stopped with it
    assert db("select code from rooms where code = $1", room.code) == []
