"""Helpers shared by the room, websocket and game tests."""

from typing import Any
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.rooms.settings import RoomSettings
from app.rooms.state import Room


def create(client: TestClient, **settings: Any) -> tuple[str, str]:
    """Create a room, return ``(code, token)``."""
    response = client.post("/api/rooms", json={"settings": settings})
    assert response.status_code == 201, response.text
    body = response.json()
    fragment = urlsplit(body["admin_url"]).fragment
    assert fragment.startswith("t=")
    return body["code"], fragment[2:]


def claim(client: TestClient, code: str, token: str, name: str = "Admin") -> httpx.Response:
    return client.post(f"/api/rooms/{code}/claim", json={"token": token, "display_name": name})


def join(client: TestClient, code: str, name: str) -> httpx.Response:
    return client.post(f"/api/rooms/{code}/join", json={"display_name": name})


def call(client: TestClient, fn: Any, *args: Any) -> Any:
    """Run a manager coroutine on the app's loop from the test thread."""
    assert client.portal is not None
    return client.portal.call(fn, *args)


def fast_settings(**overrides: Any) -> RoomSettings:
    """Settings for a game that is over in seconds rather than minutes.

    ``POST /api/rooms`` will not take these: ``NewRoomSettings`` holds hosts to
    ``question_seconds >= 10`` and ``reveal_seconds >= 3``, which is the shortest question
    worth playing but far too long for a test suite to sit through. The stored model has
    no such opinion, so these rooms are made through the manager directly.
    """
    return RoomSettings(
        **{"question_seconds": 1, "reveal_seconds": 1, "question_count": 3, **overrides}
    )


def create_fast(app: FastAPI, client: TestClient, **overrides: Any) -> tuple[Room, str]:
    """A room with one-second questions. Returns the room and its admin token."""
    return call(client, app.state.rooms.create, fast_settings(**overrides), [], "127.0.0.1")
