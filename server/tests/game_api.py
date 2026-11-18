"""The game harness: seats at a table, the game they play, and the ways a test drives it.

The fixtures that hand these out (``table``, ``faults``) are in
``conftest.py``; this module is what a test imports to read and steer what they return.
"""

import asyncio
import threading
import time
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import ExitStack, asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.rooms.models import Room, RoomQuestion
from tests.answers import right_value, wrong_value
from tests.rooms_api import call, create_fast, hello, join


@dataclass
class Seat:
    """One player at the table: their session, their socket and what it has received."""

    name: str
    session: str
    player: dict[str, Any]
    ws: WebSocketTestSession
    seen: list[dict[str, Any]] = field(default_factory=list)

    @property
    def id(self) -> str:
        return self.player["id"]

    def send(self, **frame: Any) -> None:
        self.ws.send_json(frame)

    def skip(self, phase: str, index: int) -> None:
        """The host's skip, naming the phase and question it was pressed on."""
        self.send(t="skip", phase=phase, index=index)

    def settle(self) -> None:
        """Wait until the server has handled every frame this seat sent before now.

        One socket's frames are handled in order, so the ``pong`` comes after them all.
        """
        self.send(t="ping")
        self.take("pong")

    def take(self, kind: str, limit: int = 30) -> dict[str, Any]:
        """The next message of type ``kind``. Anything before it is kept in ``seen``.

        Skipping is deliberate: a ``players_updated`` for somebody else connecting can land
        between any two messages a test cares about, and no client may depend on the
        order of those.
        """
        for _ in range(limit):
            message = self.ws.receive_json()
            self.seen.append(message)
            if message["t"] == kind:
                return message
        raise AssertionError(f"{self.name} never got {kind}; saw {self.kinds}")

    @property
    def kinds(self) -> list[str]:
        return [message["t"] for message in self.seen]


@dataclass
class Game:
    app: FastAPI
    client: TestClient
    code: str
    seats: list[Seat]
    started: bool = False

    @property
    def admin(self) -> Seat:
        return self.seats[0]

    @property
    def players(self) -> list[Seat]:
        return self.seats[1:]

    @property
    def room(self) -> Room:
        return call(self.client, self.app.state.rooms.get, self.code)

    def question(self, index: int) -> RoomQuestion:
        """Question ``index``, starting the game if it is not yet: only that selects them."""
        self.start()
        return self.room.questions[index]

    def right(self, index: int) -> Any:
        """An answer to question ``index`` that is full credit, whatever its type."""
        question = self.question(index)
        return right_value(question.type, question.payload)

    def wrong(self, index: int) -> Any:
        """A valid answer to question ``index`` that is not full credit."""
        question = self.question(index)
        return wrong_value(question.type, question.payload)

    def start(self) -> None:
        """Start the game once, and return when its questions are there to look at."""
        if self.started:
            return
        self.started = True
        self.admin.send(t="start_game")
        while self.room.status == "lobby":
            time.sleep(0.005)

    def skip(self, seat: Seat | None = None) -> None:
        """Skip the phase the room is in now, named as a client that is up to date would."""
        room = self.room
        assert room.current_index is not None, f"nothing to skip in {room.status}"
        (seat or self.admin).skip(room.phase, room.current_index)

    def answer(self, seat: Seat, index: int, value: Any) -> None:
        seat.send(t="answer", question_id=str(self.question(index).id), value=value)

    def splash(self, seat: Seat | None = None) -> dict[str, Any]:
        """The next ``room_updated`` that is a splash.

        ``start_game`` broadcasts its own ``room_updated`` for ``lobby -> playing``, and
        that one is still ``idle``: the timer task has not run a step yet.
        """
        seat = seat or self.admin
        for _ in range(10):
            message = seat.take("room_updated")
            if message["room"]["phase"] == "splash":
                return message
        raise AssertionError(f"{seat.name} never got a splash; saw {seat.kinds}")

    def opened(self, index: int) -> list[dict[str, Any]]:
        """Everyone's ``question_open`` for question ``index``."""
        messages = [seat.take("question_open") for seat in self.seats]
        assert {m["question"]["index"] for m in messages} == {index}
        return messages


def seat_table(
    app: FastAPI, client: TestClient, stack: ExitStack, *names: str, **settings: Any
) -> Game:
    """A lobby on ``fast_settings(**settings)`` with the admin and ``names`` connected.

    Seat 0 is always the admin. Each socket is entered on ``stack``.
    """
    room, admin, session = create_fast(app, client, **settings)
    # The admin comes back from ``create`` itself, in the shape ``join`` returns.
    bodies = [{"session": session, "player": admin.view().model_dump(mode="json")}]
    bodies += [join(client, room.code, name).json() for name in names]
    seats = []
    for body in bodies:
        ws = stack.enter_context(client.websocket_connect(f"/ws/{room.code}"))
        hello(ws, body["session"])
        seats.append(Seat(body["player"]["display_name"], body["session"], body["player"], ws))
    # Everyone already seated hears each new socket connect. Drain those now so a test
    # that waits for a ``players_updated`` gets the one it is waiting for.
    for index, seat in enumerate(seats):
        for _ in range(len(seats) - 1 - index):
            message = seat.ws.receive_json()
            assert message["t"] == "players_updated", message
    return Game(app, client, room.code, seats)


def reseat(seat: Seat, ws: WebSocketTestSession) -> Seat:
    """The same player on a new socket, the way their client reconnects after a restart."""
    again = Seat(seat.name, seat.session, seat.player, ws)
    again.send(t="hello", session=again.session)
    return again


def closed_after(seat: Seat) -> int:
    """The code ``seat``'s socket closes with, once the frames still queued on it are read."""
    with pytest.raises(WebSocketDisconnect) as info:
        for _ in range(30):
            seat.seen.append(seat.ws.receive_json())
    return info.value.code


def answer_after(game: Game, seat: Seat, index: int, value: Any, seconds: float) -> dict[str, Any]:
    """Answer question ``index`` as though ``seconds`` had passed since it took answers.

    ``submit_answer`` measures elapsed time from the in-memory ``answerable_mono`` on the
    manager's clock and nothing else, so moving that is how a test picks the bucket
    instead of racing the clock for it. ``ends_mono`` stays, so the answer is still on
    time. Returns the ``answer_ack``.
    """
    question = game.question(index)
    question.answerable_mono = game.app.state.rooms.clock() - seconds
    game.answer(seat, index, value)
    return seat.take("answer_ack")


# Into each ten-second bucket's middle, so a slow test run lands in the same one.
AFTER = {1: 0.3, 2: 1.75, 3: 3.75, 4: 6.25, 5: 8.75}


def updated(seat: Seat, until: Callable[[dict[str, Any]], bool]) -> dict[str, Any]:
    """The next ``room_updated`` or ``players_updated`` that ``until`` accepts."""
    for _ in range(200):
        message = seat.ws.receive_json()
        seat.seen.append(message)
        if message["t"] in ("room_updated", "players_updated") and until(message):
            return message
    raise AssertionError(f"{seat.name} never got the update wanted; saw {seat.kinds}")


def reply(seat: Seat, wanted: Callable[[dict[str, Any]], bool]) -> dict[str, Any]:
    """The first frame ``wanted`` accepts, or the first ``error``, whichever comes first."""
    for _ in range(30):
        message = seat.ws.receive_json()
        seat.seen.append(message)
        if message["t"] == "error" or wanted(message):
            return message
    raise AssertionError(f"{seat.name} never heard back; saw {seat.kinds}")


def acked(message: dict[str, Any]) -> bool:
    return message["t"] == "answer_ack"


def ready_of(message: dict[str, Any]) -> dict[str, bool]:
    return {p["display_name"]: p["ready"] for p in message["players"]}


def seconds_left(message: dict[str, Any]) -> float:
    ends_at = datetime.fromisoformat(message["room"]["next_at"])
    return (ends_at - datetime.now(UTC)).total_seconds()


def tap(game: Game, seat: Seat, is_ready: bool = True) -> dict[str, Any]:
    """``seat`` taps ready (or takes it back); the admin's update that shows it."""
    seat.send(t="ready", ready=is_ready)
    return updated(game.admin, lambda m: ready_of(m)[seat.name] is is_ready)


def at(frame: dict[str, Any], key: str) -> datetime:
    return datetime.fromisoformat(frame[key])


def db_totals(db, code: str) -> dict[UUID, int]:
    """Every player's points, item points included, straight from the answers table."""
    rows = db(
        "select a.player_id, coalesce(sum(a.points + a.item_points), 0)::int as points"
        " from answers a"
        " join questions q on q.id = a.question_id join rooms r on r.id = q.room_id"
        " where r.code = $1 group by a.player_id",
        code,
    )
    return {row["player_id"]: row["points"] for row in rows}


def assert_memory_matches_db(game: Game, db) -> None:
    """The sum kept in memory is the one the database holds, after every close.

    A player with no graded answer is 0 either way: absent from ``totals``, or present in
    the query with an ungraded (voided) row that sums to nothing.
    """
    room = game.room
    from_db = db_totals(db, game.code)
    expected = {player_id: from_db.get(player_id, 0) for player_id in room.players}
    assert {player_id: room.score(player_id).points for player_id in room.players} == expected
    assert {s.player_id: s.points for s in room.standings()} == expected
    assert set(room.totals) <= set(from_db)  # memory never invents a scorer


def left_memory(game: Game, within: float = 5.0) -> bool:
    """Whether the room drops out of the manager's memory within ``within`` seconds."""
    rooms = game.app.state.rooms.rooms
    deadline = time.monotonic() + within
    while game.code in rooms:
        if time.monotonic() > deadline:
            return False
        time.sleep(0.02)
    return True


@contextmanager
def lock_held(game: Game) -> Iterator[None]:
    """Hold the room lock on the app's loop for the block, as a slow step would."""
    room = game.room
    portal = game.client.portal
    assert portal is not None
    held, release = threading.Event(), asyncio.Event()

    async def hold() -> None:
        async with room.lock:
            held.set()
            await release.wait()

    holder = portal.start_task_soon(hold)
    assert held.wait(5), "never got the room lock"
    try:
        yield
    finally:
        portal.call(release.set)
        holder.result(5)


class Faults:
    """The manager's database, with statements a test picks failing once or stalling first.

    A statement is picked by how its SQL starts. Failing raises what a connection dropped
    mid-query raises, which is what a Postgres restart looks like to a game in progress.
    """

    def __init__(self, manager: Any) -> None:
        self._real = manager._pool
        self._failing: list[str] = []
        self._stalls: dict[str, float] = {}
        manager._pool = self._pool

    def fail_once(self, sql: str) -> None:
        self._failing.append(sql)

    def stall(self, sql: str, seconds: float) -> None:
        self._stalls[sql] = seconds

    async def _pool(self) -> _FaultyPool:
        return _FaultyPool(await self._real(), self)

    async def check(self, sql: str) -> None:
        for prefix in self._failing:
            if sql.startswith(prefix):
                self._failing.remove(prefix)
                raise ConnectionResetError(f"injected: the database dropped {prefix!r}")
        for prefix, seconds in self._stalls.items():
            if sql.startswith(prefix):
                await asyncio.sleep(seconds)


@dataclass
class _FaultyPool:
    pool: Any
    faults: Faults

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[_FaultyConnection]:
        async with self.pool.acquire() as conn:
            yield _FaultyConnection(conn, self.faults)


@dataclass
class _FaultyConnection:
    conn: Any
    faults: Faults

    async def execute(self, sql: str, *args: Any) -> str:
        await self.faults.check(sql)
        return await self.conn.execute(sql, *args)

    async def executemany(self, sql: str, args: Any) -> None:
        await self.faults.check(sql)
        await self.conn.executemany(sql, args)

    def __getattr__(self, name: str) -> Any:
        return getattr(self.conn, name)
