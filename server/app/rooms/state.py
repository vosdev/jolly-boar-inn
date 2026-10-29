"""The room-state module: everything that mutates a room goes through ``RoomManager``.

It is assembled from ``Joins`` (``joins.py``), ``Lobby`` (``lobby.py``) and ``Loop``
(``loop.py``); the lock and the rules below hold for every method of each.

Rooms live in memory, one ``Room`` per code, loaded from Postgres on first use
(rehydrate) and shared by the HTTP handlers and every websocket in the room. Each room
has one ``asyncio.Lock``; every public method acquires it around its reads and writes of
the room and the matching database transaction. Nothing here awaits a socket: each one has
an ``Outbox`` (``ws/outbox.py``), a mutation snapshots the message and the sockets it goes
to under the lock (``Broadcast``) and queues it on each, and the outbox's own task does the
sending. One stalled client cannot hold up the room, and a socket whose queue overflows or
whose send times out is closed and detached like a disconnect.

A step that raises (a database blip, a type's ``grade``) takes the room out of memory as a
process restart would, and the next player to reconnect brings it back through the
recovery below.
Every step writes to the database before it changes memory, so whatever the failure left
behind, the database holds a state recovery knows how to resume.

Restart recovery is the rest of the rehydrate: ``_load`` brings back the room, its
players, its questions and the standings sum, and ``_recover`` voids whatever question was
open when the process died, puts the room in ``reveal`` and hands it to a timer task that
starts there, so a crash costs one question and nobody is asked another one on arrival.
Loading is on any lookup, but recovery waits for the first player whose socket
authenticates: a room nobody has come back to stays still.
"""

import asyncio
import logging
import random
import secrets
import time
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

import asyncpg
from starlette.websockets import WebSocket

from app import metrics
from app.config import APP_VERSION, Settings
from app.questions.packs import Pack
from app.questions.types import TYPES
from app.questions.types.scoring import Scoring
from app.questions.types.timing import MIN_REVEAL
from app.rooms import codes, scoring
from app.rooms.errors import (
    AlreadyAnswered,
    BadSession,
    BadState,
    BadValue,
    Excluded,
    NotOpen,
    RoomExpired,
    RoomNotFound,
)
from app.rooms.joins import REQUEST_STALE_SECONDS, Joins
from app.rooms.lobby import EDITING_SECONDS, Lobby, _check_teams_ready
from app.rooms.loop import (
    ALL_ANSWERED_PAUSE_SECONDS,
    Loop,
    _answer_count,
    _close_if_everyone_answered,
    _recount_splash,
    _round_under_way,
    _stop_timer,
    _waiting,
)
from app.rooms.models import (
    Broadcast,
    Player,
    Room,
    RoomQuestion,
    Submitted,
    _require_admin,
    new_invite_key,
)
from app.rooms.queries import (
    _count_game_started,
    _count_round_finished,
    _fetch_questions,
    _fetch_room,
    _fetch_totals,
    _player_from_row,
    _room_from_row,
    _round_key,
    _round_start,
    _void_question,
)
from app.stats import Metric, bump, peak, round_key
from app.ws.outbox import Outbox
from app.ws.protocol import AnswerCount, PlayersUpdated, RoomUpdated, RoomView, Welcome

log = logging.getLogger("app.rooms")
# Close codes the manager itself uses (the handler owns the handshake codes).
CLOSE_REPLACED = 4000  # a newer socket for the same player took over
CLOSE_RESTART = 1012  # the room left memory; reconnect and you get a fresh welcome
CLOSE_KICKED = 4003
# The room is gone for good -- expired and cleaned up, or removed by its host. The same
# code the handler closes an unknown room with, because that is what a reconnect finds.
CLOSE_GONE = 4004
# Expired rooms deleted per statement: small enough that a batch never nears the pool's
# ``command_timeout``, whatever the backlog.
PURGE_BATCH = 200
# ``_round_under_way`` in SQL, per mode, for the playing rooms among $1. Questions open
# and close in order, so a round is under way while some of its questions have been
# shown and some are not closed. It is named as ``segments_of`` names it.
_ROUNDS_UNDER_WAY = (
    "select (select q.mode from questions q"
    "        where q.room_id = r.id and q.round = cur.round"
    "        order by q.random_event is not null, q.position limit 1) as mode,"
    " count(*) as n"
    " from rooms r join questions cur on cur.room_id = r.id and cur.position = r.current_index"
    " where r.id = any($1) and r.status = 'playing'"
    " and exists (select 1 from questions s where s.room_id = r.id and s.round = cur.round"
    "             and s.shown_at is not null)"
    " and exists (select 1 from questions c where c.room_id = r.id and c.round = cur.round"
    "             and c.closed_at is null)"
    " group by 1"
)

# How many playing rooms are in each round, 0-based by the rounds before it, as
# ``Room.segment_at`` counts them.
_ROUND_REACHED = (
    "select (select count(distinct q.round) from questions q"
    "        where q.room_id = r.id and q.round < cur.round) as round,"
    " count(*) as n"
    " from rooms r join questions cur on cur.room_id = r.id"
    " and cur.position = coalesce(r.current_index, 0)"
    " where r.id = any($1) and r.status = 'playing'"
    " group by 1"
)


@dataclass(slots=True)
class _Slot:
    """A code's room lock, and how many callers hold or wait on it."""

    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    users: int = 0


class RoomManager(Joins, Lobby, Loop):
    def __init__(
        self,
        pool: Callable[[], Awaitable[asyncpg.Pool]],
        packs: Sequence[Pack],
        settings: Settings,
        words: Sequence[str],
        rng: random.Random | None = None,
        *,
        pets: frozenset[str],
        pictures: Mapping[str, str] | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._pool = pool
        self.packs = packs
        self.settings = settings
        self.words = words
        # Every valid ``avatar``.
        self.pets = pets
        # Asset id to its picture's name in the client (``app/pictures.py``).
        self.pictures: Mapping[str, str] = pictures or {}
        self.rng = rng or random.Random()
        # Codes from the OS, not ``rng``: Mersenne Twister's next draw can be worked out
        # from enough of its past ones, and a code is only as private as its successors.
        self.code_rng: random.Random = secrets.SystemRandom()
        self.clock = clock
        # Off only in the test suite, where a game that is not about the splash plays
        # straight into its first question.
        self.splashes = True
        self.editing_seconds = EDITING_SECONDS
        # Zero in most of the test suite, which plays a game in a second or two.
        self.all_answered_pause = ALL_ANSWERED_PAUSE_SECONDS
        # Set only in the test suite, to play a game in seconds: every question open for
        # this long, every reveal this long, whatever their type and the room's pace.
        self.answer_seconds: int | None = None
        self.reveal_seconds: int | None = None
        self.request_stale_seconds = REQUEST_STALE_SECONDS
        self.rooms: dict[str, Room] = {}
        # A room in memory shares its code's lock. The entry outlives the room while
        # anyone holds or waits on it, so an eviction and a rehydrate of the same code
        # serialise with whatever else holds the room, and no longer than that: anyone
        # can ask for any code, so an entry kept for every code asked would never shrink.
        self._locks: dict[str, _Slot] = {}
        # The highest each peak has been written as today, so only a new high touches the
        # database. Lost on a restart, which costs one write that ``greatest`` keeps right.
        self._peaks: dict[Metric, tuple[date, int]] = {}

    async def _count_peaks(self) -> None:
        """Raise today's peaks to the players connected now and the unfinished rooms they are in."""
        rooms = [room for room in self.rooms.values() if room.status != "finished"]
        connected = [
            sum(1 for p in room.players.values() if p.connected and p.role != "tv")
            for room in rooms
        ]
        today = datetime.now(UTC).date()
        now = {
            Metric.PEAK_PLAYERS: sum(connected),
            Metric.PEAK_ROOMS: sum(1 for n in connected if n > 0),
        }
        known = {metric: v for metric, (day, v) in self._peaks.items() if day == today}
        higher = {metric: value for metric, value in now.items() if value > known.get(metric, 0)}
        if not higher:
            return
        pool = await self._pool()
        try:
            async with pool.acquire() as conn, conn.transaction():
                for metric, value in higher.items():
                    await peak(conn, metric, value)
        except asyncpg.PostgresError, OSError:
            # A counter must never cost a player the connection they just made.
            log.exception("could not count today's peaks")
            return
        for metric, value in higher.items():
            self._peaks[metric] = (today, value)

    def _picture(self, question: RoomQuestion) -> str | None:
        """The name ``question``'s picture has in the client, never its asset id.

        A pack question's only: a host who could name any asset in a question of their own
        would learn which name each one has, and every later game's pictures with it.
        """
        image = question.payload.get("image")
        return self._pictures(question).get(image) if isinstance(image, str) else None

    def _pictures(self, question: RoomQuestion) -> Mapping[str, str]:
        """The pictures ``question`` may show, by asset id: a pack question's, as ``_picture``."""
        return self.pictures if question.source == "pack" else {}

    @asynccontextmanager
    async def _locked(self, code: str) -> AsyncIterator[asyncio.Lock]:
        """Hold ``code``'s room lock; a code no room could have raises ``RoomNotFound``."""
        if not codes.well_formed(code):
            raise RoomNotFound("no room has that code")
        slot = self._locks.get(code)
        if slot is None:
            slot = self._locks[code] = _Slot()
        slot.users += 1
        try:
            async with slot.lock:
                yield slot.lock
        finally:
            slot.users -= 1
            if slot.users == 0 and code not in self.rooms:
                del self._locks[code]

    @property
    def _grace(self) -> timedelta:
        return timedelta(minutes=self.settings.finished_room_grace_minutes)

    # --- Loading ------------------------------------------------------------------

    async def get(self, code: str) -> Room:
        """The room from memory, rehydrated from Postgres if it is not there yet.

        Callers share the returned object; read it, but mutate only through this class.
        """
        code = code.upper()
        async with self._locked(code):
            return await self._room(code)

    async def _room(self, code: str) -> Room:
        """``get`` for callers that already hold the room lock."""
        room = self.rooms.get(code)
        if room is None:
            room = await self._load(code)
            room.awaiting_player = room.status == "playing"
            self.rooms[code] = room
        elif room.gone(self._grace, datetime.now(UTC)):
            raise RoomExpired(f"room {code} has expired")
        return room

    async def _load(self, code: str) -> Room:
        """Rehydrate: the room row, its players, its questions and the standings sum.

        Individual answer rows are not read back. The only ones that could still matter
        are the answers to a question that was open when the process died, and
        ``_recover`` voids that question ungraded; everything already scored is in
        ``totals``, which is the ``answers`` table's own sum.

        A room that comes back ``playing`` is not running yet when this returns, and stays
        that way until ``connect`` attaches a player and hands it to ``_recover``.
        """
        pool = await self._pool()
        async with pool.acquire() as conn:
            row = await _fetch_room(conn, code, self._grace)
            questions = await _fetch_questions(conn, row["id"])
            players = await conn.fetch(
                "select id, display_name, avatar, role, team, joined_at, session_token_hash"
                " from players"
                " where room_id = $1 order by joined_at, id",
                row["id"],
            )
            closed = [q.position for q in questions if q.closed_at is not None]
            round_start = _round_start(questions, max(closed, default=None))
            totals = await _fetch_totals(conn, row["id"], round_start)
        room = _room_from_row(row, total=len(questions), lock=self._locks[code].lock)
        room.players = {p["id"]: _player_from_row(p) for p in players}
        room.questions = questions
        room.totals = totals
        room.totals_round = round_start
        log.info(
            "room %s loaded with %d players and %d questions",
            code,
            len(room.players),
            len(questions),
        )
        return room

    async def _recover(self, room: Room) -> None:
        """Pick a ``playing`` room that left memory mid-game back up, in ``reveal``.

        Section 3's restart rules. A question with ``shown_at`` set and ``closed_at`` null
        was open when the process died, so it is closed now and voided, ungraded: that is
        the "a crash costs the open question at most" guarantee. Its answers keep their
        null ``points`` and are worth nothing to anybody.

        The room then resumes in ``reveal`` for its question's reveal whether or not anything
        was voided, so the players reconnecting into a room that has just come back are
        not answering a question a moment later. A room that died during a splash is this
        same case -- its question has no ``shown_at`` -- and the splash replays when the
        reveal ends, which is the right thing for players who have just reconnected.

        ``resume_from`` is the index the timer task advances *out of* when that reveal
        ends. Normally it is ``current_index``, whose question is behind us either way,
        closed or voided. A question that never opened is the exception: the process died
        in the gap between ``start_game`` or ``_advance`` persisting ``current_index`` and
        ``_open_question`` stamping ``shown_at``, so the room is still owed that question
        and advancing out of the one before it opens it.

        The reveal starts when the first player's socket authenticates, not when the room
        is loaded, so it is always a reveal somebody sees.

        Call with the room lock held, once the room is in ``self.rooms``.
        """
        question = room.current
        resume_from = room.current_index or 0
        if question is None or question.shown_at is None:
            resume_from -= 1
        elif question.closed_at is None:
            closed_at = datetime.now(UTC)
            pool = await self._pool()
            async with pool.acquire() as conn, conn.transaction():
                await _void_question(conn, question, closed_at)
                # The game plays on after a restart, so a round whose last question it
                # voided was played through, not cut short.
                await _count_round_finished(conn, room, question.position, closed_at)
            question.closed_at, question.voided = closed_at, True
            log.warning(
                "room %s: question %d was open at the restart, voided", room.code, question.position
            )
        room.phase = "reveal"
        room.reveal_seconds = self._reveal_seconds(room, question)
        room.next_at = datetime.now(UTC) + timedelta(seconds=room.reveal_seconds)
        room.next_mono = self.clock() + room.reveal_seconds
        log.info(
            "room %s resumes in reveal until %s, then question %d",
            room.code,
            room.next_at.isoformat(),
            resume_from + 1,
        )
        self._start_timer(room, resume_from, resume_at=room.next_mono)

    def _answer_seconds(self, room: Room, question: RoomQuestion) -> int:
        if self.answer_seconds is not None:
            return self.answer_seconds
        return room.question_seconds(question)

    def _reveal_seconds(self, room: Room, question: RoomQuestion | None) -> int:
        """A question's reveal; the shortest there is for a room resuming before its first."""
        if self.reveal_seconds is not None:
            return self.reveal_seconds
        return MIN_REVEAL if question is None else room.question_reveal_seconds(question)

    def _forget(self, room: Room) -> list[Outbox]:
        """Take a room out of memory and detach its sockets, returning them to close.

        Call with the room lock held.
        """
        if self.rooms.get(room.code) is room:
            del self.rooms[room.code]
        _stop_timer(room)
        room.drop_requests()
        sockets = list(room.sockets.values())
        room.sockets.clear()
        for player in room.players.values():
            player.connected = False
        return sockets

    async def evict(self, code: str) -> bool:
        """Drop a room from memory the way a process restart would; the next ``get``
        rehydrates it. Attached sockets are closed with 1012 so clients reconnect and
        receive a fresh ``welcome``. Returns whether the room was in memory.

        This exists for the rehydrate tests (rehydrate and restart recovery); nothing in the app
        calls it. The room rows stay: ``purge_expired`` and ``delete`` are the two ways
        a room really goes away.
        """
        code = code.upper()
        async with self._locked(code):
            room = self.rooms.get(code)
            if room is None:
                return False
            sockets = self._forget(room)
        for outbox in sockets:
            if outbox.close(CLOSE_RESTART, "room restarted, reconnect"):
                metrics.WS_DISCONNECTS.labels(reason="room_restarted").inc()
        return True

    async def _restart(self, room: Room) -> None:
        """``evict`` for a room whose timer step failed, unless it has already left memory.

        The room is checked by identity, not code: a timer that failed after its room was
        dropped and rehydrated must not drop the new one. The first reconnect runs
        ``_recover``, which voids a question the failure left open.
        """
        async with self._locked(room.code):
            if self.rooms.get(room.code) is not room:
                return
            sockets = self._forget(room)
        for outbox in sockets:
            if outbox.close(CLOSE_RESTART, "room restarted, reconnect"):
                metrics.WS_DISCONNECTS.labels(reason="room_restarted").inc()

    # --- Removal --------------------------------------------------------------------

    async def purge_expired(self) -> int:
        """Section 4's ``any → deleted``: delete every room past its ``expires_at``, and
        every finished room past its grace (``FINISHED_ROOM_GRACE_MINUTES``).

        ``on delete cascade`` takes the players, questions and answers with it. The rooms
        go ``PURGE_BATCH`` at a time, each batch its own statement under the pool's
        ``command_timeout``: one statement over a backlog could outgrow the timeout, roll
        back, and meet a larger backlog every hour after. Then the same rooms go from
        memory, so the process does not hold what the database has dropped. Returns the
        number of rows deleted.

        The order is deliberate. Between the delete and the eviction an expired room is
        still in ``self.rooms``, and every way in refuses it anyway: ``_room`` checks
        ``Room.gone`` on a cached room and ``_fetch_room`` the same on a loaded one, so
        there is no window in which a purged room can still be joined or played.

        The caller is the cleanup task in ``main.py``; the tests run a pass directly.
        """
        pool = await self._pool()
        deleted = 0
        async with pool.acquire() as conn:
            while True:
                async with conn.transaction():
                    ids = await conn.fetch(
                        "select id from rooms"
                        " where expires_at < now() or finished_at < now() - $2::interval"
                        " limit $1 for update",
                        PURGE_BATCH,
                        self._grace,
                    )
                    ids = [row["id"] for row in ids]
                    # Most of these rooms are not in memory, so the database says what
                    # was under way in them, read before the delete takes it.
                    abandoned = await conn.fetchval(
                        "select count(*) from rooms where id = any($1) and status = 'playing'",
                        ids,
                    )
                    rounds = await conn.fetch(_ROUNDS_UNDER_WAY, ids)
                    at_rounds = await conn.fetch(_ROUND_REACHED, ids)
                    await conn.execute("delete from rooms where id = any($1)", ids)
                    if abandoned:
                        await bump(conn, Metric.GAMES_ABANDONED, by=abandoned)
                    for row in rounds:
                        await bump(conn, Metric.ROUNDS_ABANDONED, row["mode"], row["n"])
                    for row in at_rounds:
                        key = round_key(row["round"])
                        await bump(conn, Metric.ABANDONED_AT_ROUND, key, row["n"])
                if abandoned:
                    metrics.GAMES.labels(outcome="abandoned").inc(abandoned)
                batch = len(ids)
                deleted += batch
                if batch < PURGE_BATCH:
                    break
        log.info("cleanup deleted %d expired room%s", deleted, "" if deleted == 1 else "s")
        await self._evict_expired()
        return deleted

    async def _evict_expired(self) -> None:
        """Drop the rooms in memory that have expired, closing their sockets with 4004.

        Each room is re-checked under its own lock, because the snapshot of codes was
        taken before the first ``await``. Reconnecting will not find these rooms, which
        is what 4004 tells the client: the room is gone, not restarting.
        """
        now = datetime.now(UTC)
        for code in [c for c, room in self.rooms.items() if room.gone(self._grace, now)]:
            async with self._locked(code):
                room = self.rooms.get(code)
                if room is None or not room.gone(self._grace, now):
                    continue
                sockets = self._forget(room)
                log.info("room %s expired and left memory", code)
            for outbox in sockets:
                if outbox.close(CLOSE_GONE, "this room has expired"):
                    metrics.WS_DISCONNECTS.labels(reason="room_gone").inc()

    async def delete(self, code: str, session: str) -> None:
        """An admin removes their room: the row goes now, cascade and all.

        Authenticated by the session token in the request body, exactly as a websocket
        ``hello`` is (section 7): the caller has to be a player in this room, and an
        admin of it. The creator is the room's first admin, so their own session opens
        this door the moment the room exists; a promoted admin has the same reach as
        they do over everything else, and so over this too.

        The room is invalid immediately: the row is gone, so nothing rehydrates, and
        anybody still connected is closed with 4004 rather than being left in a lobby
        the database has forgotten. An already-expired room raises ``RoomExpired`` and
        stays for ``purge_expired`` to collect; there is nothing left to remove that the
        cleanup job will not take within the hour.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            player = room.find_by_session(session)
            if player is None:
                raise BadSession(f"that session is not a player in room {code}")
            _require_admin(player)
            async with pool.acquire() as conn, conn.transaction():
                await conn.execute("delete from rooms where id = $1", room.id)
                if room.status == "playing":
                    await bump(conn, Metric.GAMES_ABANDONED)
                    await bump(conn, Metric.ABANDONED_AT_ROUND, _round_key(room))
                    if (cut_short := _round_under_way(room)) is not None:
                        await bump(conn, Metric.ROUNDS_ABANDONED, cut_short.mode)
            if room.status == "playing":
                metrics.GAMES.labels(outcome="abandoned").inc()
            sockets = self._forget(room)
            log.info("room %s deleted by %s", code, player.display_name)
        for outbox in sockets:
            if outbox.close(CLOSE_GONE, "the host removed this room"):
                metrics.WS_DISCONNECTS.labels(reason="room_gone").inc()

    # --- Broadcasting ---------------------------------------------------------------

    def _room_updated(
        self, room: Room, exclude: UUID | None = None, standings: bool = False
    ) -> Broadcast:
        """Snapshot ``room_updated`` and its recipients. Call with the room lock held.

        Join, leave, promote, kick, status change, ``set_profile`` -- and the start of a
        splash, which has no frame of its own because the ``RoomView`` in here says
        everything a client needs: the phase, the round, and when it ends. The ready
        check's countdown is that ``next_at``, so it travels in the same frame.
        ``standings`` adds them, for the start of the standings.
        """
        players = room.player_views()
        ranked = room.standings() if standings else None
        teams = room.team_standings() if standings else None
        everyone = RoomUpdated(
            room=room.view(withhold=room.settings.hide_rounds),
            players=players,
            standings=ranked,
            team_standings=teams,
        )
        admins = RoomUpdated(
            room=room.view(admin=True, withhold=bool(room.settings.surprise_modes)),
            players=players,
            standings=ranked,
            team_standings=teams,
        )
        if admins == everyone:
            return Broadcast.to_all(room, everyone.model_dump(mode="json"), exclude)
        rendered = {False: everyone.model_dump(mode="json"), True: admins.model_dump(mode="json")}
        return Broadcast(
            [
                (out, rendered[room.is_admin(pid)])
                for pid, out in room.sockets.items()
                if pid != exclude
            ]
        )

    def _players_updated(
        self, room: Room, before: RoomView, exclude: UUID | None = None
    ) -> Broadcast:
        """``players_updated``, or ``room_updated`` if the room itself moved since ``before``.

        For a ready tap, a connect and a disconnect, which change a player and usually
        nothing else: the full ``RoomView`` with its settings is most of ``room_updated``,
        and those three are the frames a room of fifty sends most. On a splash any of them
        can start or shorten the countdown, and that ``next_at`` needs the full frame.
        """
        if room.view() != before:
            return self._room_updated(room, exclude)
        message = PlayersUpdated(players=room.player_views())
        return Broadcast.to_all(room, message.model_dump(mode="json"), exclude)

    def _broadcast(self, broadcast: Broadcast) -> None:
        """Queue every snapshotted frame on its socket. Waits for nothing.

        Called straight after the lock that built ``broadcast`` is released, with no await
        in between, so frames are queued in the order the room changed.
        """
        for outbox, message in broadcast.targets:
            outbox.put(message)

    # --- Sockets --------------------------------------------------------------------

    async def connect(self, code: str, session: str, ws: WebSocket) -> tuple[Player, Outbox]:
        """Attach a socket for the player who owns ``session`` and queue its ``welcome``.

        Returns the player and the socket's outbox, which is where the handler's own
        replies go. Last device wins: a socket already attached for that player is closed
        with 4000. Everyone else hears the player connect.

        A ``welcome`` that cannot be delivered fails like any other send: the outbox
        closes the socket with 1011 and detaches it again.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            player = room.find_by_session(session)
            if player is None:
                raise BadSession("no player in this room has that session")
            if room.awaiting_player:
                try:
                    await self._recover(room)
                except Exception:
                    # Left in memory, the room would never be offered to ``_recover``
                    # again and would sit with no timer until it expired. Dropped, the
                    # client's reconnect rehydrates it from scratch.
                    self.rooms.pop(code, None)
                    raise
                room.awaiting_player = False
            before = room.view()
            previous = room.sockets.get(player.id)
            outbox = Outbox(ws, lambda: self.disconnect(code, player.id, ws))
            room.sockets[player.id] = outbox
            player.connected = True
            # A ready player coming back can be the last one a splash was waiting on.
            _recount_splash(room, self.clock())
            question = room.open_question()
            answered = question.answers.get(player.id) if question is not None else None
            # ``room.view()`` carries the round, so a socket arriving during a splash
            # gets the same phase, round and ``next_at`` a live one was broadcast.
            segment = room.current_segment
            open_view = (
                question.view(
                    room.total,
                    room.can_answer(question, player.id),
                    segment,
                    _answer_count(room, question),
                    self._picture(question),
                    self._pictures(question),
                    _waiting(room, question),
                )
                if question is not None and segment is not None
                else None
            )
            welcome = Welcome(
                room=room.view_for(player.id),
                you=player.view(),
                players=room.player_views(),
                question=open_view,
                your_answer=answered.value if answered is not None else None,
                standings=room.standings(),
                team_standings=room.team_standings(),
                server_time=datetime.now(UTC),
                server_version=APP_VERSION,
            ).model_dump(mode="json")
            # Before the welcome, so a client that has its welcome was counted already.
            await self._count_peaks()
            # Queued under the lock, so no later broadcast can reach this socket first.
            outbox.put(welcome)
            if previous is not None:
                # Behind whatever it still had queued, so nothing it was owed is cut off.
                if previous.close(CLOSE_REPLACED, "connected from another device"):
                    metrics.WS_DISCONNECTS.labels(reason="replaced").inc()
            update = self._players_updated(room, before, exclude=player.id)
        self._broadcast(update)
        return player, outbox

    async def disconnect(self, code: str, player_id: UUID, ws: WebSocket) -> None:
        """Detach ``ws`` if it is still the player's socket, and tell the others.

        A no-op for a socket that was already replaced or whose room left memory, so the
        handler can call it unconditionally on the way out. Never rehydrates. The socket's
        outbox gets a close behind whatever it still holds, unless it has one already.
        """
        room = self.rooms.get(code.upper())
        if room is None:
            return
        async with room.lock:
            outbox = room.sockets.get(player_id)
            if outbox is None or outbox.ws is not ws:
                return
            before = room.view()
            del room.sockets[player_id]
            outbox.close(1000, "disconnected")
            player = room.players.get(player_id)
            if player is not None:
                player.connected = False
                player.stop_editing()
            # Somebody leaving lowers the threshold rather than stalling the splash, and can
            # be the last player the open question was waiting on.
            _recount_splash(room, self.clock())
            _close_if_everyone_answered(room)
            update = self._players_updated(room, before)
        self._broadcast(update)

    # --- Game loop ------------------------------------------------------------------

    async def start_game(self, code: str, by: Player) -> None:
        """``lobby → playing``, then open question 0 (section 4).

        The timer task is created only after ``room_updated`` is queued, so nobody can see
        ``question_open`` before they know the game has started.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            if room.status != "lobby":
                raise BadState(f"room {code} is {room.status}, not in the lobby")
            if not room.questions:
                raise BadState(f"room {code} has no questions")
            if not any(room.players[pid].role != "tv" for pid in room.sockets):
                raise BadState("nobody but the TV is connected to play")
            if room.settings.teams:
                _check_teams_ready(room)
            # A room made near its expiry must not expire mid-game, so it gets a full
            # lifetime from here.
            expires_at = datetime.now(UTC) + timedelta(days=self.settings.room_ttl_days)
            async with pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    "update rooms set status = 'playing', current_index = 0, expires_at = $2"
                    " where id = $1",
                    room.id,
                    expires_at,
                )
                await _count_game_started(conn, room)
            room.status = "playing"
            room.expires_at = expires_at
            room.current_index = 0
            # "Ready to start" has been answered by starting. The first splash asks again.
            for player in room.players.values():
                player.ready = False
                player.stop_editing()
            # Too late to let anyone in; each requester's next poll is told so.
            room.drop_requests()
            update = self._room_updated(room)
        self._broadcast(update)
        self._start_timer(room, 0)

    async def submit_answer(
        self, code: str, player: Player, question_id: str, value: Any
    ) -> tuple[Scoring, int | None, tuple[int, int]]:
        """Store one answer and return how the question is scored, its band there, and
        the room's answer count with it in.

        Everyone else hears the new count as ``answer_count``, broadcast from here;
        the answerer is left out of it, since the handler's ``answer_ack`` carries it.

        The row is committed before this returns and the handler sends ``answer_ack``
        only after it returns, so an acknowledged answer is an answer that survived the
        process. Nothing here is batched or deferred.

        An answer is timed when it arrives, before it queues for the room lock behind
        other answers' writes, so a pile-up at the buzzer costs nobody a bucket. It counts
        from ``answerable_at`` up to, not including, ``ends_at``, and a close that runs late
        gives nobody extra time. A question is on screen before it takes answers, and an
        answer that arrives early is ``not_open``, so a client that draws its buttons ahead
        of time gets nothing for it. Elapsed time runs from there, so the typing costs
        nobody a speed bucket.
        """
        code = code.upper()
        received_at, arrived = datetime.now(UTC), self.clock()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            # A kick that held the lock while this waited has deleted the player's row,
            # and the insert below would fail on its foreign key.
            if player.id not in room.players:
                raise Excluded("you are no longer in this room")
            question = room.open_question()
            if room.status != "playing" or question is None or question.closed_at is not None:
                raise NotOpen("no question is open")
            if str(question.id) != question_id:
                raise NotOpen(f"question {question_id} is not the open one")
            # Both set when the question opened.
            assert question.answerable_mono is not None and question.ends_mono is not None
            if arrived < question.answerable_mono:
                raise NotOpen("this question is not taking answers yet")
            if arrived >= question.ends_mono:
                raise NotOpen("this question's time is up")
            if player.id in question.answers:
                raise AlreadyAnswered("you have already answered this question")
            if not room.can_answer(question, player.id):
                raise Excluded("you cannot answer this question")
            # From here on the answer is its canonical form: stored, echoed and graded as that.
            value = TYPES[question.type].parse_value(question.payload, value)
            if value is None:
                raise BadValue(f"not a valid answer to a {question.type} question")
            elapsed = arrived - question.answerable_mono
            # The question's own length, not the room's setting: a mode that caps itself
            # at ten seconds must score on ten seconds, or every answer to it lands in
            # the fastest bucket of a room set to a minute.
            assert question.seconds is not None  # set when the question opened
            how = question.scoring
            band = scoring.band(
                how, elapsed, question.seconds, question.steps, team=bool(room.settings.teams)
            )
            async with pool.acquire() as conn:
                try:
                    await conn.execute(
                        "insert into answers (question_id, player_id, value, received_at)"
                        " values ($1, $2, $3, $4)",
                        question.id,
                        player.id,
                        value,
                        received_at,
                    )
                except asyncpg.UniqueViolationError:  # a row this room never loaded
                    raise AlreadyAnswered("you have already answered this question") from None
            question.answers[player.id] = Submitted(value=value, received_at=received_at, band=band)
            _close_if_everyone_answered(room)
            count = _answer_count(room, question)
            counted = AnswerCount(
                question_id=question_id,
                answered=count[0],
                of=count[1],
                waiting=_waiting(room, question),
            )
            others = Broadcast.to_all(room, counted.model_dump(mode="json"), exclude=player.id)
        self._broadcast(others)
        return how, band, count

    async def rotate_key(self, code: str, by: Player) -> None:
        """Admin: replace an invite-only room's key, so links holding the old one stop working.

        Players already in keep their sessions; a key nobody else has yet locks the room.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            if room.invite_key is None:
                raise BadState("this room takes anyone with its code")
            if room.status != "lobby":
                raise BadState("only a room in its lobby can be joined")
            key = new_invite_key()
            async with pool.acquire() as conn:
                await conn.execute("update rooms set invite_key = $1 where id = $2", key, room.id)
            room.invite_key = key
            update = self._room_updated(room)
        self._broadcast(update)

    async def promote(self, code: str, by: Player, player_id: UUID) -> None:
        """Admin: make another player an admin too. There is no demote."""
        code = code.upper()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            target = room.players.get(player_id)
            if target is None:
                raise BadState("there is no such player in this room")
            if target.role == "admin":
                return
            if target.role == "tv":
                raise BadState("the TV cannot be an admin")
            async with pool.acquire() as conn:
                await conn.execute("update players set role = 'admin' where id = $1", player_id)
            target.role = "admin"
            update = self._room_updated(room)
        self._broadcast(update)

    async def set_tv(self, code: str, by: Player, player_id: UUID, on: bool) -> None:
        """Admin, lobby: make a player the room's one TV, or turn the TV back into a player.

        A new TV turns the old one back into a player. The TV is un-ready and teamless,
        because it plays no part. The last admin cannot be the TV, or nobody could run
        the game; admins who are disconnected still count, since they can come back.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            if room.status != "lobby":
                raise BadState("the TV is picked in the lobby")
            target = room.players.get(player_id)
            if target is None:
                raise BadState("there is no such player in this room")
            if on == (target.role == "tv"):
                return
            if on and target.role == "admin":
                if sum(p.role == "admin" for p in room.players.values()) == 1:
                    raise BadState("the last admin cannot be the TV")
            old = [p for p in room.players.values() if on and p.role == "tv"]
            async with pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    "update players set role = 'player' where id = any($1::uuid[])",
                    [p.id for p in old] + ([] if on else [target.id]),
                )
                if on:
                    await conn.execute(
                        "update players set role = 'tv', team = null where id = $1", target.id
                    )
            for player in old:
                player.role = "player"
            if on:
                target.role = "tv"
                target.team = None
                target.ready = False
                target.stop_editing()
            else:
                target.role = "player"
            update = self._room_updated(room)
        self._broadcast(update)

    async def kick(self, code: str, by: Player, player_id: UUID) -> None:
        """Admin: delete a player and their answers, and close their socket with 4003.

        Admins cannot be kicked, themselves included. Deleting the row cascades to their
        answers, so they leave the standings with it and the sum in ``totals`` drops them.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            target = room.players.get(player_id)
            if target is None:
                raise BadState("there is no such player in this room")
            if target.role == "admin":
                raise BadState("an admin cannot be kicked")
            async with pool.acquire() as conn:
                await conn.execute("delete from players where id = $1", player_id)
            del room.players[player_id]
            room.totals.pop(player_id, None)
            for question in room.questions:
                question.answers.pop(player_id, None)
            socket = room.sockets.pop(player_id, None)
            _recount_splash(room, self.clock())
            _close_if_everyone_answered(room)
            update = self._room_updated(room)
        if socket is not None:
            if socket.close(CLOSE_KICKED, "removed from the room"):
                metrics.WS_DISCONNECTS.labels(reason="kicked").inc()
        self._broadcast(update)

    async def shutdown(self) -> None:
        """Cancel every room's timer task and wait for them. The lifespan calls this."""
        timers = [room.timer for room in self.rooms.values() if room.timer is not None]
        for room in self.rooms.values():
            _stop_timer(room)
            for outbox in room.sockets.values():
                outbox.cancel()
        await asyncio.gather(*timers, return_exceptions=True)
