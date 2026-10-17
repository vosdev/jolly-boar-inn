"""The per-room lock map holds an entry only while a room or a caller needs it.

Anybody can ask for any code without logging in, so an entry kept for every code asked
would let a script grow the process until it runs out of memory.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.rooms.errors import RoomNotFound
from app.rooms.state import RoomManager
from tests.rooms_api import call, create, join


def assert_one_lock_per_room(manager: RoomManager) -> None:
    assert set(manager._locks) == set(manager.rooms)
    for code, room in manager.rooms.items():
        assert room.lock is manager._locks[code].lock


def test_codes_no_room_has_leave_no_lock_behind(app: FastAPI, client: TestClient) -> None:
    code, admin = create(client, "Host")
    assert client.get("/api/rooms/NOSUCHROOM").status_code == 404
    assert join(client, "NOSUCHROOM", "Zezima").status_code == 404
    response = client.request("DELETE", "/api/rooms/NOSUCHROOM", json={"session": "x" * 43})
    assert response.status_code == 404
    with client.websocket_connect("/ws/NOSUCHROOM") as ws:
        ws.send_json({"t": "hello", "session": admin["session"]})
        with pytest.raises(WebSocketDisconnect) as info:
            ws.receive_json()
    assert info.value.code == 4004
    assert set(app.state.rooms._locks) == {code}
    assert_one_lock_per_room(app.state.rooms)


@pytest.mark.parametrize("code", ["X" * 8192, "ABC-12", "A", "ÄBC", "ABC%20DEF"])
def test_a_code_no_room_could_have_is_a_404_without_a_lock(
    app: FastAPI, client: TestClient, code: str
) -> None:
    response = client.get(f"/api/rooms/{code}")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    assert app.state.rooms._locks == {}


def test_delete_purge_and_evict_drop_the_rooms_lock(app: FastAPI, client: TestClient, db) -> None:
    manager = app.state.rooms
    deleted, admin = create(client, "Host")
    expired, _ = create(client, "Host")
    evicted, _ = create(client, "Host")
    live, _ = create(client, "Host")
    assert_one_lock_per_room(manager)

    response = client.request("DELETE", f"/api/rooms/{deleted}", json={"session": admin["session"]})
    assert response.status_code == 204
    past = datetime.now(UTC) - timedelta(minutes=1)
    db("update rooms set expires_at = $2 where code = $1", expired, past)
    manager.rooms[expired].expires_at = past
    assert call(client, manager.purge_expired) == 1
    assert call(client, manager.evict, evicted) is True

    assert set(manager._locks) == {live}
    assert_one_lock_per_room(manager)
    # Rehydrating takes a fresh entry, and it is the one the room holds.
    assert client.get(f"/api/rooms/{evicted}").status_code == 200
    assert set(manager._locks) == {live, evicted}
    assert_one_lock_per_room(manager)


def test_concurrent_lookups_of_an_unknown_code_leave_no_lock(
    app: FastAPI, client: TestClient
) -> None:
    manager = app.state.rooms

    async def lookups() -> list[object]:
        tries = (manager.get("NOSUCHROOM") for _ in range(20))
        return await asyncio.gather(*tries, return_exceptions=True)

    results = call(client, lookups)
    assert all(isinstance(r, RoomNotFound) for r in results)
    assert manager._locks == {}


def test_a_waiter_keeps_the_lock_a_room_leaves_memory_with(
    app: FastAPI, client: TestClient
) -> None:
    """A room evicted while somebody waits on its lock comes back under that same lock."""
    manager = app.state.rooms
    code, _ = create(client, "Host")

    async def scenario() -> bool:
        async with manager._locked(code) as lock:
            waiter = asyncio.create_task(manager.get(code))
            await asyncio.sleep(0)
            manager._forget(manager.rooms[code])
        room = await waiter
        return room.lock is lock

    assert call(client, scenario) is True
    assert_one_lock_per_room(manager)
