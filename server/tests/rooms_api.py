"""Helpers shared by the room, websocket and game tests."""

import asyncio
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.rooms.settings import RoomSettings
from app.rooms.state import Player, Room


def create(
    client: TestClient, name: str = "Admin", returning: bool = False, **settings: Any
) -> tuple[str, dict[str, Any]]:
    """Create a room; its creator is its admin. Returns ``(code, {session, player})``.

    The code is the room's key, uppercase as stored; the response spells it as its word.

    The second element is shaped exactly like ``join(...).json()``, so a fixture can
    hold admins and players in the same list.
    """
    response = client.post(
        "/api/rooms", json={"returning": returning, "display_name": name, "settings": settings}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body["code"].upper(), {"session": body["session"], "player": body["player"]}


def join(client: TestClient, code: str, name: str, returning: bool = False) -> httpx.Response:
    return client.post(
        f"/api/rooms/{code}/join", json={"returning": returning, "display_name": name}
    )


def hello(ws: WebSocketTestSession, session: str) -> dict[str, Any]:
    """Send ``hello`` on a fresh socket; the ``welcome`` it gets back."""
    ws.send_json({"t": "hello", "session": session})
    message = ws.receive_json()
    assert message["t"] == "welcome", message
    return message


def next_of(ws: WebSocketTestSession, kind: str, limit: int = 10) -> dict[str, Any]:
    """The next frame of type ``kind`` among the next ``limit``, skipping the rest."""
    for _ in range(limit):
        message = ws.receive_json()
        if message["t"] == kind:
            return message
    raise AssertionError(f"never got {kind}")


def closed_with(ws: WebSocketTestSession, drain: bool = False) -> int:
    """The code the socket closes with, which must be its next frame unless ``drain``."""
    with pytest.raises(WebSocketDisconnect) as info:
        ws.receive_json()
        while drain:
            ws.receive_json()
    return info.value.code


def call(client: TestClient, fn: Any, *args: Any) -> Any:
    """Run a manager coroutine on the app's loop from the test thread."""
    assert client.portal is not None
    return client.portal.call(fn, *args)


def held(client: TestClient, code: str) -> dict[str, Any]:
    """The room as the manager holds it, as ``{room, players}`` in the shapes ``welcome`` uses.

    ``GET /api/rooms/{code}`` says only the status and how many are in, so a test that
    wants to see who they are looks here.
    """
    room = call(client, client.app.state.rooms.get, code)  # type: ignore[attr-defined]
    return {
        "room": room.view().model_dump(mode="json"),
        "players": [p.view().model_dump(mode="json") for p in room.players.values()],
    }


def fast_settings(**overrides: Any) -> RoomSettings:
    """Settings for a game that is over in seconds rather than minutes.

    ``fast_settings()`` is one ``more_less`` round of three questions. ``modes`` takes
    names, or whole ``{"mode": ..., "questions": ...}`` dicts for a game whose rounds are
    deliberately different lengths.

    The splash is off by default and ``standings_seconds`` is zero: a test that is not about
    the splash or the standings should see the frames it always saw, and the ones that are
    about them pass ``splash=True`` or their own ``standings_seconds``. The splash is the
    manager's rather than the room's, so ``create_fast`` sets it on the manager, as it
    does how long questions and reveals last. ``random_event_frequency`` is ``less`` for
    the same reason: an NPC's question dropped into the middle of a round would move every
    index a test counts on, and at one event per twenty round questions a room this short
    has none. There is no off switch, so a test room of twenty questions or more gets
    events; the tests that are about events ask for ``more`` and enough questions to hold
    the host's own.
    """
    questions = overrides.pop("questions", 3)
    modes = [
        mode if isinstance(mode, dict) else {"mode": mode, "questions": questions}
        for mode in overrides.pop("modes", ["more_less"])
    ]
    return RoomSettings(
        **{
            "modes": modes,
            "standings_seconds": 0,
            "random_event_frequency": "less",
            **overrides,
        }
    )


def create_fast(
    app: FastAPI,
    client: TestClient,
    name: str = "Admin",
    custom: list[dict[str, Any]] | None = None,
    **overrides: Any,
) -> tuple[Room, Player, str]:
    """A room on ``fast_settings``, its admin player and their session token.

    ``custom`` is the admin's own questions, placed as random events and authored by them.
    ``seconds`` and ``reveal_seconds``, one each by default, hold every question and reveal
    in the room to that length, whatever its type and pace: a game a test can sit through.
    """
    app.state.rooms.splashes = overrides.pop("splash", False)
    app.state.rooms.answer_seconds = overrides.pop("seconds", 1)
    app.state.rooms.reveal_seconds = overrides.pop("reveal_seconds", 1)
    settings = fast_settings(**overrides)
    return call(client, app.state.rooms.create, name, settings, custom or [])


class StalledSocket:
    """A client that has stopped reading: a send or a close to it never finishes."""

    def __init__(self) -> None:
        self.sends = 0
        self.closed_with: int | None = None

    async def send_json(self, data: dict[str, Any]) -> None:
        self.sends += 1
        await asyncio.Event().wait()

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.closed_with = code
        await asyncio.Event().wait()
