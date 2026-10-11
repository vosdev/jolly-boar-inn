"""Invite links: a room created invite-only takes a join only with its key.

The checks on what a player is sent search the serialised frames for the key rather than
reading one field, so the key leaking through any part of any frame fails them.
"""

import json
import logging
import threading
from typing import Any

import httpx
import pytest
import uvicorn
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.rooms_api import hello, next_of
from tests.test_admin import _free_port


def create_keyed(
    client: TestClient, invite_only: bool = True, **settings: Any
) -> tuple[str, dict[str, Any]]:
    """Create a room as Admin; ``(code, {session, player})`` like ``rooms_api.create``."""
    response = client.post(
        "/api/rooms",
        json={
            "returning": False,
            "display_name": "Admin",
            "invite_only": invite_only,
            "settings": settings,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body["code"].upper(), {"session": body["session"], "player": body["player"]}


def join(client: TestClient, code: str, name: str, key: str | None = None) -> httpx.Response:
    body: dict[str, Any] = {"returning": False, "display_name": name}
    if key is not None:
        body["key"] = key
    return client.post(f"/api/rooms/{code}/join", json=body)


def key_of(client: TestClient, code: str, session: str) -> str:
    """The key, as the admin's ``welcome`` carries it."""
    with client.websocket_connect(f"/ws/{code}") as ws:
        key = hello(ws, session)["room"]["key"]
    assert isinstance(key, str)
    return key


def stored_key(db: Any, code: str) -> str | None:
    return db("select invite_key from rooms where code = $1", code)[0]["invite_key"]


def test_a_keyed_room_refuses_a_join_without_its_key(client: TestClient) -> None:
    code, _ = create_keyed(client)
    response = join(client, code, "Zezima")
    assert response.status_code == 403
    assert response.json()["code"] == "key_required"


def test_a_keyed_room_refuses_a_wrong_key(client: TestClient) -> None:
    code, _ = create_keyed(client)
    response = join(client, code, "Zezima", key="not-the-key")
    assert response.status_code == 403
    assert response.json()["code"] == "bad_key"


def test_the_key_is_asked_for_before_anything_else_about_the_room(client: TestClient) -> None:
    """A guessed code says the room wants a key, not that its game has started or is full."""
    code, _ = create_keyed(client, max_players=1)
    for key in (None, "not-the-key"):
        response = join(client, code, "Zezima", key=key)
        assert response.json()["code"] in {"key_required", "bad_key"}


def test_the_correct_key_joins(client: TestClient, db: Any) -> None:
    code, admin = create_keyed(client)
    key = key_of(client, code, admin["session"])
    assert key == stored_key(db, code)
    assert len(key) == 12
    response = join(client, code, "Zezima", key=key)
    assert response.status_code == 200, response.text


def test_a_session_reconnect_never_needs_the_key(client: TestClient, evict: Any) -> None:
    code, admin = create_keyed(client)
    key = key_of(client, code, admin["session"])
    player = join(client, code, "Zezima", key=key).json()
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        ws.send_json({"t": "rotate_key"})
        next_of(ws, "room_updated")
    # Out of memory too, so the reconnect rehydrates the room from its row.
    assert evict(code)
    with client.websocket_connect(f"/ws/{code}") as ws:
        assert hello(ws, player["session"])["you"]["id"] == player["player"]["id"]


def test_rotating_refuses_the_old_link_and_disconnects_nobody(client: TestClient, db: Any) -> None:
    code, admin = create_keyed(client)
    old = key_of(client, code, admin["session"])
    player = join(client, code, "Zezima", key=old).json()
    with (
        client.websocket_connect(f"/ws/{code}") as host,
        client.websocket_connect(f"/ws/{code}") as guest,
    ):
        hello(host, admin["session"])
        hello(guest, player["session"])
        next_of(host, "players_updated")
        host.send_json({"t": "rotate_key"})
        new = next_of(host, "room_updated")["room"]["key"]
        assert new != old
        assert new == stored_key(db, code)
        assert next_of(guest, "room_updated")["players"]
        assert join(client, code, "Woox", key=old).json()["code"] == "bad_key"
        assert join(client, code, "Woox", key=new).status_code == 200
        # Both sockets are still up and hear the newcomer.
        assert len(next_of(host, "room_updated")["players"]) == 3
        assert len(next_of(guest, "room_updated")["players"]) == 3


def test_only_an_admin_rotates_and_only_in_the_lobby(client: TestClient) -> None:
    code, admin = create_keyed(client, modes=[{"mode": "more_less", "questions": 5}])
    key = key_of(client, code, admin["session"])
    player = join(client, code, "Zezima", key=key).json()
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, player["session"])
        ws.send_json({"t": "rotate_key"})
        assert next_of(ws, "error")["code"] == "not_admin"
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        ws.send_json({"t": "start_game"})
        next_of(ws, "room_updated")
        ws.send_json({"t": "rotate_key"})
        assert next_of(ws, "error")["code"] == "bad_state"


def test_a_room_without_a_key_has_none_to_rotate(client: TestClient) -> None:
    code, admin = create_keyed(client, invite_only=False)
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        ws.send_json({"t": "rotate_key"})
        assert next_of(ws, "error")["code"] == "bad_state"


def test_a_non_admin_is_never_sent_the_key(client: TestClient) -> None:
    code, admin = create_keyed(client)
    key = key_of(client, code, admin["session"])
    player = join(client, code, "Zezima", key=key).json()
    seen: list[dict[str, Any]] = []
    with (
        client.websocket_connect(f"/ws/{code}") as host,
        client.websocket_connect(f"/ws/{code}") as guest,
    ):
        hello(host, admin["session"])
        seen.append(hello(guest, player["session"]))
        assert "key" not in seen[0]["room"]
        assert join(client, code, "Woox", key=key).status_code == 200
        seen.append(next_of(guest, "room_updated"))
        assert next_of(host, "room_updated")["room"]["key"] == key
        host.send_json({"t": "rotate_key"})
        seen.append(next_of(guest, "room_updated"))
        key = next_of(host, "room_updated")["room"]["key"]
        guest.send_json({"t": "set_profile", "display_name": "Zezima Two"})
        seen.append(next_of(guest, "room_updated"))
        assert "key" in next_of(host, "room_updated")["room"]
        frames = json.dumps(seen)
        assert key not in frames
        # Promoted, they are an admin like any other and are sent it from then on.
        host.send_json({"t": "promote", "player_id": player["player"]["id"]})
        assert next_of(guest, "room_updated")["room"]["key"] == key


def test_a_room_without_the_tick_behaves_as_before(client: TestClient, db: Any) -> None:
    code, admin = create_keyed(client, invite_only=False)
    assert stored_key(db, code) is None
    assert join(client, code, "Zezima").status_code == 200
    # A key nobody asked for is not a reason to refuse.
    assert join(client, code, "Woox", key="anything").status_code == 200
    with client.websocket_connect(f"/ws/{code}") as ws:
        assert "key" not in hello(ws, admin["session"])["room"]


def test_the_key_never_shows_up_server_side(app: FastAPI, caplog: pytest.LogCaptureFixture) -> None:
    """Through a real uvicorn: the access log and the app's own logs never hold the key.

    The share link carries it after ``#``, which no client sends, and the join carries it
    in its body.
    """
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, port=port, log_config=None, access_log=True))
    thread = threading.Thread(target=server.run)
    caplog.set_level(logging.DEBUG)
    thread.start()
    try:
        for _ in range(500):
            if server.started:
                break
            threading.Event().wait(0.01)
        assert server.started
        base = f"http://127.0.0.1:{port}"
        created = httpx.post(
            f"{base}/api/rooms",
            json={"returning": False, "display_name": "Admin", "invite_only": True},
        )
        assert created.status_code == 201, created.text
        code = created.json()["code"]
        key = app.state.rooms.rooms[code.upper()].invite_key
        assert key is not None
        link = f"{base}/r/{code}#k={key}"
        assert httpx.get(link).status_code == 200
        joined = httpx.post(
            f"{base}/api/rooms/{code}/join",
            json={"returning": False, "display_name": "Zezima", "key": key},
        )
        assert joined.status_code == 200, joined.text
    finally:
        server.should_exit = True
        thread.join()
    access = [r.getMessage() for r in caplog.records if r.name == "uvicorn.access"]
    assert len(access) == 3, access
    assert any(f"/r/{code}" in line for line in access)
    # httpx logs the link it was handed, fragment and all; that line is the client's.
    server_side = [r for r in caplog.records if r.name.split(".")[0] in {"uvicorn", "app"}]
    assert not [r.getMessage() for r in server_side if key in r.getMessage()]
