"""Helpers shared by the room, websocket and game tests."""

from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.questions.types import TYPES
from app.rooms.settings import RoomSettings
from app.rooms.state import Player, Room


def create(client: TestClient, name: str = "Admin", **settings: Any) -> tuple[str, dict[str, Any]]:
    """Create a room; its creator is its admin. Returns ``(code, {session, player})``.

    The second element is shaped exactly like ``join(...).json()``, so a fixture can
    hold admins and players in the same list.
    """
    response = client.post("/api/rooms", json={"display_name": name, "settings": settings})
    assert response.status_code == 201, response.text
    body = response.json()
    return body["code"], {"session": body["session"], "player": body["player"]}


def join(client: TestClient, code: str, name: str) -> httpx.Response:
    return client.post(f"/api/rooms/{code}/join", json={"display_name": name})


def call(client: TestClient, fn: Any, *args: Any) -> Any:
    """Run a manager coroutine on the app's loop from the test thread."""
    assert client.portal is not None
    return client.portal.call(fn, *args)


def fast_settings(**overrides: Any) -> RoomSettings:
    """Settings for a game that is over in seconds rather than minutes.

    ``POST /api/rooms`` will not take these: ``NewRoomSettings`` holds hosts to what each
    type says a round of it is worth (``more_less`` is 5..20 seconds a question), and
    ``reveal_seconds >= 3``, which is the shortest game worth playing but far too long for
    a test suite to sit through. The stored model has no such opinion, so these rooms are
    made through the manager directly.

    ``seconds`` and ``questions`` belong to a mode now, so this spreads them over the
    modes asked for: ``fast_settings()`` is one round of three one-second questions.
    ``modes`` takes names, or whole ``{"mode": ..., "questions": ..., "seconds": ...}``
    dicts for a game whose rounds are deliberately different lengths.

    ``splash_seconds`` is zero by default too: a test that is not about the splash should
    see the frames it always saw, and the ones that are about it pass their own.
    """
    seconds = overrides.pop("seconds", 1)
    questions = overrides.pop("questions", 3)
    modes = [
        mode
        if isinstance(mode, dict)
        else {"mode": mode, "questions": questions, "seconds": seconds}
        for mode in overrides.pop("modes", [next(iter(TYPES))])
    ]
    return RoomSettings(**{"modes": modes, "reveal_seconds": 1, "splash_seconds": 0, **overrides})


def create_fast(
    app: FastAPI, client: TestClient, name: str = "Admin", **overrides: Any
) -> tuple[Room, Player, str]:
    """A room with one-second questions, its admin player and their session token."""
    return call(client, app.state.rooms.create, name, fast_settings(**overrides), [], "127.0.0.1")
