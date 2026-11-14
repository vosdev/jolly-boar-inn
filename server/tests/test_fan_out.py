"""A broadcast is rendered once for the room, not once per socket.

Fifty sockets reconnecting at once hear a few ``players_updated``, each serialised once,
and a question opens as at most two frames: one for those who can answer, one for the TV.
"""

import asyncio
import json
from collections import Counter
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.questions.types import TYPES
from app.rooms.models import Broadcast, Room
from app.rooms.state import RoomManager
from app.ws import outbox as outbox_module
from tests.game_api import Game
from tests.rooms_api import call, create

ROOM_SIZE = 50
# A frame or two per socket however many arrive: the one that tells it about everybody
# already in, and at most one more for whoever overtook that.
FEW = 2


class RecordingSocket:
    """A client that reads everything it is sent."""

    def __init__(self) -> None:
        self.sent: list[str] = []
        self.closed_with: int | None = None

    async def send_text(self, data: str) -> None:
        self.sent.append(data)

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.closed_with = code

    def kinds(self, kind: str) -> list[str]:
        return [text for text in self.sent if json.loads(text)["t"] == kind]


@pytest.fixture
def dumped(monkeypatch: pytest.MonkeyPatch) -> Counter[str]:
    """How many times the outbox serialised a frame, by its type."""
    counts: Counter[str] = Counter()

    def dumps(message: dict[str, Any], **kwargs: Any) -> str:
        counts[message["t"]] += 1
        return json.dumps(message, **kwargs)

    monkeypatch.setattr(outbox_module, "json", SimpleNamespace(dumps=dumps))
    return counts


def test_fifty_sockets_attaching_at_once_hear_a_few_players_updated(
    app: FastAPI, client: TestClient, dumped: Counter[str]
) -> None:
    manager: RoomManager = app.state.rooms
    code, admin = create(client)
    sessions = [admin["session"]]
    for n in range(ROOM_SIZE - 1):
        _, session = call(client, manager.join, code, f"Player {n}")
        sessions.append(session)
    sockets = [RecordingSocket() for _ in sessions]

    async def attach_all() -> None:
        await asyncio.gather(
            *(manager.connect(code, s, ws) for s, ws in zip(sessions, sockets, strict=True))
        )
        room = await manager.get(code)
        while room.players_flush is not None:
            await room.players_flush
        for _ in range(200):
            await asyncio.sleep(0.01)
            if all(out._queue.empty() for out in room.sockets.values()):
                break

    call(client, attach_all)
    received = [ws.kinds("players_updated") for ws in sockets]
    assert all(json.loads(ws.sent[0])["t"] == "welcome" for ws in sockets)
    assert max(len(frames) for frames in received) <= FEW
    # Every socket ends up knowing everyone is connected.
    for ws in sockets:
        last = json.loads((ws.kinds("players_updated") or ws.sent[:1])[-1])
        assert all(p["connected"] for p in last["players"])
    broadcasts = {text for frames in received for text in frames}
    assert dumped["players_updated"] == len(broadcasts)
    assert sum(len(frames) for frames in received) > len(broadcasts)
    assert dumped["welcome"] == ROOM_SIZE


def test_a_players_updated_that_fails_to_build_stays_owed(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    manager: RoomManager = app.state.rooms
    code, admin = create(client)
    ws = RecordingSocket()
    call(client, manager.connect, code, admin["session"], ws)
    room = call(client, manager.get, code)
    owed = set(room.sockets)
    room.players_stale.update(owed)
    built = Room.player_views

    def fails(self: Room) -> Any:
        raise RuntimeError("could not build the players")

    monkeypatch.setattr(Room, "player_views", fails)
    with pytest.raises(RuntimeError):
        call(client, manager._flush_players, room)
    assert room.players_stale == owed
    monkeypatch.setattr(Room, "player_views", built)

    async def flush() -> None:
        await manager._flush_players(room)
        for _ in range(200):
            await asyncio.sleep(0.01)
            if all(out._queue.empty() for out in room.sockets.values()):
                break

    call(client, flush)
    assert room.players_stale == set()
    assert ws.kinds("players_updated")


def test_a_question_opens_as_one_frame_for_players_and_one_for_the_tv(
    table: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    game: Game = table(*(f"Player {n}" for n in range(9)), seconds=10, splash=True)
    tv = game.players[0]
    game.admin.send(t="set_tv", player_id=tv.id, on=True)
    game.players[-1].take("room_updated")
    game.start()
    game.splash()
    question = game.room.questions[0]
    views = 0
    real = TYPES[question.type].client_view

    def client_view(payload: dict[str, Any]) -> dict[str, Any]:
        nonlocal views
        views += 1
        return real(payload)

    monkeypatch.setattr(TYPES[question.type], "client_view", client_view)
    manager: RoomManager = game.app.state.rooms
    broadcasts: list[Broadcast] = []
    sent = manager._broadcast

    def spy(broadcast: Broadcast) -> None:
        broadcasts.append(broadcast)
        sent(broadcast)

    monkeypatch.setattr(manager, "_broadcast", spy)
    game.skip()
    opened = game.opened(0)
    assert views == 1
    [frames] = [
        [frame for _, frame in b.targets]
        for b in broadcasts
        if b.targets and b.targets[0][1].message["t"] == "question_open"
    ]
    assert len(frames) == len(game.seats)
    assert len({id(frame) for frame in frames}) <= 2
    can = {
        seat.name: message["question"]["you_can_answer"]
        for seat, message in zip(game.seats, opened, strict=True)
    }
    assert can == {seat.name: seat is not tv for seat in game.seats}
