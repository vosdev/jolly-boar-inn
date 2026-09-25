"""Helpers shared by the room, websocket and game tests."""

import asyncio
from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.modes import MODES
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

    ``POST /api/rooms`` will not take these: ``NewRoomSettings`` holds hosts to what each
    mode says a round of it is worth (``more_less`` is 5..20 seconds a question), and
    ``reveal_seconds >= 2``, which is the shortest game worth playing but far too long for
    a test suite to sit through. The stored model has no such opinion, so these rooms are
    made through the manager directly.

    ``seconds`` and ``questions`` belong to a mode now, so this spreads them over the
    modes asked for: ``fast_settings()`` is one round of three one-second questions.
    ``modes`` takes names, or whole ``{"mode": ..., "questions": ..., "seconds": ...}``
    dicts for a game whose rounds are deliberately different lengths.

    ``splash_seconds`` and ``standings_seconds`` are zero by default too: a test that is
    not about the splash or the standings should see the frames it always saw, and the
    ones that are about them pass their own. ``random_event_frequency`` is ``less`` for the
    same reason: an NPC's question dropped into the middle of a round would move every
    index a test counts on, and at one event per twenty round questions a room this short
    has none. There is no off switch, so a test room of twenty questions or more gets
    events; the tests that are about events ask for ``more`` and enough questions to hold
    the host's own. And ``random_event_seconds`` is zero, which plays an event as a plain
    question, so only the tests about the NPC's hold have to wait it out.
    """
    seconds = overrides.pop("seconds", 1)
    questions = overrides.pop("questions", 3)
    modes = [
        mode
        if isinstance(mode, dict)
        else {"mode": mode, "questions": questions, "seconds": seconds}
        for mode in overrides.pop("modes", [next(iter(MODES))])
    ]
    return RoomSettings(
        **{
            "modes": modes,
            "reveal_seconds": 1,
            "splash_seconds": 0,
            "standings_seconds": 0,
            "random_event_frequency": "less",
            "random_event_seconds": 0,
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
    """A room with one-second questions, its admin player and their session token.

    ``custom`` is the admin's own questions, placed as random events and authored by them.
    """
    settings = fast_settings(**overrides)
    return call(client, app.state.rooms.create, name, settings, custom or [], "127.0.0.1")


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
