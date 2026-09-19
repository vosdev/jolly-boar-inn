"""The room-state module: everything that mutates a room goes through ``RoomManager``.

Rooms live in memory, one ``Room`` per code, loaded from Postgres on first use
(rehydrate) and shared by the HTTP handlers and every websocket in the room. Each room
has one ``asyncio.Lock``; every public method acquires it around its reads and writes of
the room and the matching database transaction. Sockets are never awaited under the
lock: a mutation snapshots the message and the sockets it goes to, releases the lock,
and only then sends (``Broadcast`` / ``_send``), so one stalled client cannot hold up the
room. A send that fails or times out detaches that socket like a disconnect.

The game loop (T9) is one ``asyncio.Task`` per room, ``Room.timer``, running
``_run_questions``: open a question, sleep until it closes, close and grade it, sleep
through the reveal, move on. Nothing else drives time. ``skip`` and an early close on
all-answered cut a sleep short through ``Room.advance``, an ``asyncio.Event``, never by
cancelling the task; every sleep is computed from the target timestamp, so a late wakeup
closes immediately instead of drifting. The task takes the same room lock as everything
else and, like everything else, sends nothing while holding it.

Scoring (T10) is ``rooms/scoring.py``. The answers table is the source of truth for
standings: close writes ``correct`` and ``points``, then re-reads ``sum(points)`` per
player into ``Room.totals``. Nothing adds to a running total in memory.

Rehydrating a ``playing`` room, which voids its open question and resumes the timer, is
T11; ``_load`` brings back the questions and the standings sum, but not a running game.

Token flow (section 7 of ideas/architecture.md): the admin token and every session
token are ``secrets.token_urlsafe(32)``; only their sha256 hex is stored. The plaintext
is returned to the caller exactly once and never logged.
"""

import asyncio
import hashlib
import hmac
import ipaddress
import logging
import random
import secrets
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import asyncpg
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.config import Settings
from app.errors import ApiError
from app.questions.packs import Pack
from app.questions.submission import Submission
from app.questions.types import TYPES
from app.rooms import codes, scoring, selection
from app.rooms.settings import RoomSettings
from app.ws.protocol import (
    GameFinished,
    OpenQuestion,
    PlayerResult,
    PlayerView,
    QuestionClosed,
    QuestionOpen,
    RoomUpdated,
    RoomView,
    Standing,
    Welcome,
)

log = logging.getLogger("app.rooms")

NAME_MAX = 24
# Seconds a single socket send may take before that socket counts as dead.
SEND_TIMEOUT = 10.0
# Close codes the manager itself uses (the handler owns the handshake codes).
CLOSE_REPLACED = 4000  # a newer socket for the same player took over
CLOSE_RESTART = 1012  # the room left memory; reconnect and you get a fresh welcome
CLOSE_SEND_FAILED = 1011
CLOSE_KICKED = 4003
# Envelope keys that have their own column in ``questions``; the rest is the payload jsonb.
_QUESTION_COLUMNS = frozenset({"id", "type", "source", "host_only"})


class RoomNotFound(ApiError):
    status, code = 404, "not_found"


class RoomExpired(ApiError):
    status, code = 410, "expired"


class TokenUsed(ApiError):
    """Wrong token or already-consumed token: one response for both, no oracle."""

    status, code = 410, "token_used"


class NotOpen(ApiError):
    status, code = 409, "not_open"


class NameTaken(ApiError):
    status, code = 409, "name_taken"


class RoomFull(ApiError):
    status, code = 409, "room_full"


class BadName(ApiError):
    status, code = 422, "bad_name"


class BadSettings(ApiError):
    status, code = 422, "bad_settings"


class BadSession(ApiError):
    """``hello`` carried a session that belongs to nobody in this room."""

    status, code = 401, "bad_session"


class NotAdmin(ApiError):
    """A player sent one of the admin messages. ``code`` is a websocket error code."""

    status, code = 403, "not_admin"


class BadState(ApiError):
    """The message is valid but the room is in no state to act on it."""

    status, code = 409, "bad_state"


class AlreadyAnswered(ApiError):
    status, code = 409, "already_answered"


class Excluded(ApiError):
    """``host_only``, or the author of a ``source: room`` question (section 6)."""

    status, code = 403, "excluded"


class BadValue(ApiError):
    status, code = 422, "bad_value"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def normalize_name(raw: str) -> str:
    """T7 name rules: trimmed, 1-24 chars, no HTML, no control characters."""
    name = raw.strip()
    if not 1 <= len(name) <= NAME_MAX:
        raise BadName(f"display name must be 1 to {NAME_MAX} characters")
    if "<" in name or ">" in name:
        raise BadName("display name may not contain < or >")
    if any(ch.isspace() and ch != " " for ch in name) or any(ord(ch) < 32 for ch in name):
        raise BadName("display name may not contain line breaks or control characters")
    return name


def parse_ip(value: str | None) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """An address the ``inet`` column accepts, or ``None`` for anything else."""
    try:
        return ipaddress.ip_address(value) if value else None
    except ValueError:
        return None


@dataclass(slots=True)
class Player:
    id: UUID
    display_name: str
    role: str
    joined_at: datetime
    session_hash: str = field(repr=False)  # sha256 hex of the session token, never plaintext
    connected: bool = False

    def view(self) -> PlayerView:
        return PlayerView(
            id=self.id,
            display_name=self.display_name,
            role=self.role,  # type: ignore[arg-type]  # the column's check constraint
            connected=self.connected,
        )


@dataclass(slots=True)
class Submitted:
    """One player's answer to one question, in memory.

    ``bucket`` is fixed at receive time from ``received_at - shown_at`` (section 6); the
    client never sends a time. ``correct`` and ``points`` stay ``None`` until the question
    closes and grading writes them here and to the ``answers`` row.
    """

    value: Any
    received_at: datetime
    bucket: int
    correct: bool | None = None
    points: int | None = None


@dataclass(slots=True)
class RoomQuestion:
    """A ``questions`` row plus the answers to it.

    ``payload`` is the type-specific payload, the thing ``types.<type>`` takes, unwrapped
    from the column of the same name: that column also carries the envelope extras
    (``tags``, ``difficulty``, ``author``, ``added_at``), which the game loop has no use
    for and leaves in the database.

    ``ends_at`` is not a column either: it is ``shown_at + question_seconds``, recomputed
    whenever the question opens, and it is what the timer and the clients count down to.
    """

    id: UUID
    position: int
    question_id: str
    type: str
    source: str
    payload: dict[str, Any]
    host_only: bool
    author_player_id: UUID | None
    shown_at: datetime | None = None
    closed_at: datetime | None = None
    voided: bool = False
    ends_at: datetime | None = None
    answers: dict[UUID, Submitted] = field(default_factory=dict)

    def can_answer(self, player_id: UUID) -> bool:
        """Section 6 exclusions: nobody answers a ``host_only`` question, and the author
        of a ``source: room`` question cannot answer their own."""
        if self.host_only:
            return False
        return self.source != "room" or self.author_player_id != player_id

    def view(self, total: int, player_id: UUID) -> OpenQuestion:
        assert self.shown_at is not None and self.ends_at is not None
        return OpenQuestion(
            question_id=self.question_id,
            index=self.position,
            total=total,
            type=self.type,
            view=TYPES[self.type].client_view(self.payload),
            opened_at=self.shown_at,
            ends_at=self.ends_at,
            you_can_answer=self.can_answer(player_id),
        )


@dataclass(slots=True)
class Totals:
    """A player's score, as the ``answers`` table has it. Never incremented in memory."""

    points: int = 0
    correct: int = 0


@dataclass(slots=True)
class Room:
    id: UUID
    code: str
    status: str
    settings: RoomSettings
    current_index: int | None
    total: int
    created_at: datetime
    expires_at: datetime
    lock: asyncio.Lock = field(repr=False)
    players: dict[UUID, Player] = field(default_factory=dict)  # in join order
    sockets: dict[UUID, WebSocket] = field(default_factory=dict, repr=False)
    questions: list[RoomQuestion] = field(default_factory=list, repr=False)  # by position
    # Rebuilt from ``sum(answers.points)`` at every close, never added to.
    totals: dict[UUID, Totals] = field(default_factory=dict, repr=False)
    phase: str = "idle"
    # When the reveal ends and the next question opens; ``None`` outside a reveal.
    next_at: datetime | None = None
    # The one task driving open → closed → reveal → next.
    timer: asyncio.Task[None] | None = field(default=None, repr=False)
    # Set to cut the current sleep short: ``skip``, or everyone has answered.
    advance: asyncio.Event = field(default_factory=asyncio.Event, repr=False)

    @property
    def current(self) -> RoomQuestion | None:
        """The question ``current_index`` points at, open or revealing."""
        if self.current_index is None or not 0 <= self.current_index < len(self.questions):
            return None
        return self.questions[self.current_index]

    def open_question(self) -> RoomQuestion | None:
        """The question players may answer right now, if any."""
        return self.current if self.phase == "open" else None

    @property
    def max_players(self) -> int:
        assert self.settings.max_players is not None  # resolved by ``RoomManager.create``
        return self.settings.max_players

    def view(self) -> RoomView:
        return RoomView(
            code=self.code,
            status=self.status,  # type: ignore[arg-type]  # the column's check constraint
            settings=self.settings,
            current_index=self.current_index,
            total=self.total,
            phase=self.phase,  # type: ignore[arg-type]
        )

    def player_views(self) -> list[PlayerView]:
        return [p.view() for p in self.players.values()]

    def standings(self) -> list[Standing]:
        """Section 6: points desc, then correct answers desc, then ``joined_at`` asc.

        ``rank`` is dense, so players with the same points *and* the same number of
        correct answers share a rank and the next player is one higher. Join time only
        decides the order two otherwise identical players are listed in ("earliest to
        join wins ties"); it never changes the number shown.

        The numbers come from ``Room.totals``, which is the ``answers`` table's own sum,
        re-read at every close. Before the first close everyone is 0 and rank 1.
        """
        ranked = sorted(
            self.players.values(),
            key=lambda p: (-self.score(p.id).points, -self.score(p.id).correct, p.joined_at),
        )
        standings: list[Standing] = []
        rank, previous = 0, None
        for player in ranked:
            score = self.score(player.id)
            if (score.points, score.correct) != previous:
                rank += 1
                previous = (score.points, score.correct)
            standings.append(
                Standing(
                    player_id=player.id,
                    display_name=player.display_name,
                    points=score.points,
                    rank=rank,
                )
            )
        return standings

    def score(self, player_id: UUID) -> Totals:
        """This player's row of ``totals``; a player who has not scored is a fresh zero.

        Not a field: ``total`` next to it is the question count, and a method by that
        name would quietly become that field's default value.
        """
        return self.totals.get(player_id, Totals())

    def find_by_session(self, session: str) -> Player | None:
        digest = hash_token(session)
        for player in self.players.values():
            if hmac.compare_digest(player.session_hash, digest):
                return player
        return None


@dataclass(slots=True)
class Broadcast:
    """Rendered messages and the sockets they go to, snapshotted under the room lock.

    One entry per socket, because ``question_open`` is not the same frame for everyone:
    ``you_can_answer`` is false for the author of a room question and for ``host_only``
    ones. Nothing else in the frame differs, and nothing in it depends on being admin.
    """

    room: Room
    targets: list[tuple[UUID, WebSocket, dict[str, Any]]]

    @classmethod
    def to_all(cls, room: Room, message: dict[str, Any], exclude: UUID | None = None) -> Broadcast:
        targets = [(pid, ws, message) for pid, ws in room.sockets.items() if pid != exclude]
        return cls(room, targets)

    @classmethod
    def per_player(cls, room: Room, build: Callable[[UUID], dict[str, Any]]) -> Broadcast:
        return cls(room, [(pid, ws, build(pid)) for pid, ws in room.sockets.items()])


def _player_from_row(row: asyncpg.Record) -> Player:
    return Player(
        id=row["id"],
        display_name=row["display_name"],
        role=row["role"],
        joined_at=row["joined_at"],
        session_hash=row["session_token_hash"],
    )


def _room_from_row(row: asyncpg.Record, total: int, lock: asyncio.Lock) -> Room:
    return Room(
        id=row["id"],
        code=row["code"],
        status=row["status"],
        settings=RoomSettings.model_validate(row["settings"]),
        current_index=row["current_index"],
        total=total,
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        lock=lock,
    )


def _question_rows(room_id: UUID, questions: Sequence[dict[str, Any]]) -> list[tuple[Any, ...]]:
    return [
        (
            room_id,
            position,
            q["id"],
            q["type"],
            q["source"],
            {k: v for k, v in q.items() if k not in _QUESTION_COLUMNS},
            bool(q.get("host_only", False)),
        )
        for position, q in enumerate(questions)
    ]


async def _close(ws: WebSocket, code: int, reason: str) -> None:
    """Best-effort close of a socket we are done with. Never raises, never hangs."""
    try:
        async with asyncio.timeout(SEND_TIMEOUT):
            await ws.close(code=code, reason=reason)
    except Exception as exc:  # already closed, client gone, or stalled: all the same to us
        log.debug("closing socket with %d failed: %r", code, exc)


class RoomManager:
    def __init__(
        self,
        pool: Callable[[], Awaitable[asyncpg.Pool]],
        packs: Sequence[Pack],
        settings: Settings,
        words: Sequence[str],
        rng: random.Random | None = None,
    ) -> None:
        self._pool = pool
        self.packs = packs
        self.settings = settings
        self.words = words
        self.rng = rng or random.Random()
        self.rooms: dict[str, Room] = {}
        # Locks outlive their rooms so an eviction and a rehydrate of the same code
        # serialise with whatever else holds the room.
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock(self, code: str) -> asyncio.Lock:
        return self._locks.setdefault(code, asyncio.Lock())

    # --- Loading ------------------------------------------------------------------

    async def get(self, code: str) -> Room:
        """The room from memory, rehydrated from Postgres if it is not there yet.

        Callers share the returned object; read it, but mutate only through this class.
        """
        code = code.upper()
        async with self._lock(code):
            return await self._room(code)

    async def _room(self, code: str) -> Room:
        """``get`` for callers that already hold the room lock."""
        room = self.rooms.get(code)
        if room is None:
            room = await self._load(code)
            self.rooms[code] = room
        elif room.expires_at <= datetime.now(UTC):
            raise RoomExpired(f"room {code} has expired")
        return room

    async def _load(self, code: str) -> Room:
        """Rehydrate: the room row, its players, its questions and the standings sum.

        Individual answer rows are not read back. The only ones that could still matter
        are the answers to a question that was open when the process died, and T11's
        recovery voids that question ungraded; everything already scored is in ``totals``,
        which is the ``answers`` table's own sum.

        T11 adds the rest of the ``playing`` case: voiding the open question and
        restarting the timer in ``reveal``.
        """
        pool = await self._pool()
        async with pool.acquire() as conn:
            row = await _fetch_room(conn, code)
            questions = await _fetch_questions(conn, row["id"])
            players = await conn.fetch(
                "select id, display_name, role, joined_at, session_token_hash from players"
                " where room_id = $1 order by joined_at, id",
                row["id"],
            )
            totals = await _fetch_totals(conn, row["id"])
        room = _room_from_row(row, total=len(questions), lock=self._lock(code))
        room.players = {p["id"]: _player_from_row(p) for p in players}
        room.questions = questions
        room.totals = totals
        log.info(
            "room %s loaded with %d players and %d questions",
            code,
            len(room.players),
            len(questions),
        )
        if room.status == "playing":
            log.warning("room %s was playing when it left memory; recovery is T11", code)
        return room

    async def evict(self, code: str) -> bool:
        """Drop a room from memory the way a process restart would; the next ``get``
        rehydrates it. Attached sockets are closed with 1012 so clients reconnect and
        receive a fresh ``welcome``. Returns whether the room was in memory.

        This exists for the rehydrate tests (T8 accept, T11 accept); nothing in the app
        calls it.
        """
        code = code.upper()
        async with self._lock(code):
            room = self.rooms.pop(code, None)
            if room is None:
                return False
            _stop_timer(room)
            sockets = list(room.sockets.values())
            room.sockets.clear()
            for player in room.players.values():
                player.connected = False
        for ws in sockets:
            await _close(ws, CLOSE_RESTART, "room restarted, reconnect")
        return True

    # --- Broadcasting ---------------------------------------------------------------

    def _room_updated(self, room: Room, exclude: UUID | None = None) -> Broadcast:
        """Snapshot ``room_updated`` and its recipients. Call with the room lock held."""
        message = RoomUpdated(room=room.view(), players=room.player_views())
        return Broadcast.to_all(room, message.model_dump(mode="json"), exclude)

    async def _broadcast(self, broadcast: Broadcast) -> None:
        """Send to every snapshotted socket, concurrently, outside the lock.

        A socket whose send fails or times out is detached exactly as if it had
        disconnected, which broadcasts its own ``room_updated`` to the survivors.
        """
        if not broadcast.targets:
            return
        results = await asyncio.gather(
            *(self._send(ws, message) for _, ws, message in broadcast.targets)
        )
        for (pid, ws, _), ok in zip(broadcast.targets, results, strict=True):
            if not ok:
                await _close(ws, CLOSE_SEND_FAILED, "send failed")
                await self.disconnect(broadcast.room.code, pid, ws)

    async def _send(self, ws: WebSocket, message: dict[str, Any]) -> bool:
        try:
            async with asyncio.timeout(SEND_TIMEOUT):
                await ws.send_json(message)
        except Exception as exc:  # closed from either side, transport error, timeout
            log.info("dropping socket after failed send: %r", exc)
            return False
        return True

    # --- Sockets --------------------------------------------------------------------

    async def connect(self, code: str, session: str, ws: WebSocket) -> Player:
        """Attach a socket for the player who owns ``session`` and send ``welcome``.

        Last device wins: a socket already attached for that player is closed with 4000.
        Everyone else gets ``room_updated`` with the player connected.

        A ``welcome`` that cannot be delivered detaches the new socket again and raises
        ``WebSocketDisconnect``; the handler treats that as the client having left.
        """
        code = code.upper()
        async with self._lock(code):
            room = await self._room(code)
            player = room.find_by_session(session)
            if player is None:
                raise BadSession("no player in this room has that session")
            previous = room.sockets.get(player.id)
            room.sockets[player.id] = ws
            player.connected = True
            question = room.open_question()
            answered = question.answers.get(player.id) if question is not None else None
            welcome = Welcome(
                room=room.view(),
                you=player.view(),
                players=room.player_views(),
                question=question.view(room.total, player.id) if question is not None else None,
                your_answer=answered.value if answered is not None else None,
                standings=room.standings(),
                server_time=datetime.now(UTC),
            ).model_dump(mode="json")
            update = self._room_updated(room, exclude=player.id)
        # Sent first, straight after the lock is released, so no later broadcast can
        # reach this socket before its snapshot does.
        delivered = await self._send(ws, welcome)
        # The replaced socket goes either way: it left ``room.sockets`` under the lock
        # and can never be reattached, so leaving it open would strand that device.
        if previous is not None:
            await _close(previous, CLOSE_REPLACED, "connected from another device")
        if not delivered:
            reason = "welcome could not be delivered"
            await _close(ws, CLOSE_SEND_FAILED, reason)
            await self.disconnect(code, player.id, ws)
            raise WebSocketDisconnect(CLOSE_SEND_FAILED, reason)
        await self._broadcast(update)
        return player

    async def disconnect(self, code: str, player_id: UUID, ws: WebSocket) -> None:
        """Detach ``ws`` if it is still the player's socket, and tell the others.

        A no-op for a socket that was already replaced or whose room left memory, so the
        handler can call it unconditionally on the way out. Never rehydrates.
        """
        room = self.rooms.get(code.upper())
        if room is None:
            return
        async with room.lock:
            if room.sockets.get(player_id) is not ws:
                return
            del room.sockets[player_id]
            player = room.players.get(player_id)
            if player is not None:
                player.connected = False
            update = self._room_updated(room)
        await self._broadcast(update)

    # --- HTTP-driven mutations -----------------------------------------------------

    async def create(
        self,
        settings: RoomSettings,
        custom_questions: Sequence[dict[str, Any]],
        creator_ip: str | None,
    ) -> tuple[Room, str]:
        """Insert the room and its fixed question set. Returns the room and the admin token."""
        cap = self.settings.max_players_per_room
        if settings.max_players is None:
            settings = settings.model_copy(update={"max_players": cap})
        elif settings.max_players > cap:
            raise BadSettings(f"max_players may not exceed {cap}")
        questions = selection.select(self.packs, custom_questions, settings, self.rng)
        token = new_token()
        now = datetime.now(UTC)
        expires_at = now + timedelta(days=self.settings.room_ttl_days)

        pool = await self._pool()
        async with pool.acquire() as conn, conn.transaction():
            room_row: asyncpg.Record | None = None

            async def try_insert(code: str) -> bool:
                nonlocal room_row
                try:
                    async with conn.transaction():  # savepoint, so a collision is retryable
                        room_row = await conn.fetchrow(
                            "insert into rooms"
                            " (code, status, settings, admin_token_hash, creator_ip, expires_at)"
                            " values ($1, 'created', $2, $3, $4, $5)"
                            " returning id, code, status, settings, current_index,"
                            " created_at, expires_at",
                            code,
                            settings.model_dump(),
                            hash_token(token),
                            parse_ip(creator_ip),
                            expires_at,
                        )
                except asyncpg.UniqueViolationError:
                    return False
                return True

            await codes.allocate(self.words, self.rng, try_insert)
            assert room_row is not None
            await conn.executemany(
                "insert into questions"
                " (room_id, position, question_id, type, source, payload, host_only)"
                " values ($1, $2, $3, $4, $5, $6, $7)",
                _question_rows(room_row["id"], questions),
            )
            # Read them back so a freshly created room holds exactly what a rehydrated
            # one would, ids included.
            inserted = await _fetch_questions(conn, room_row["id"])
        code = room_row["code"]
        room = _room_from_row(room_row, total=len(inserted), lock=self._lock(code))
        room.questions = inserted
        async with room.lock:
            # A ``get`` racing the commit may have loaded it first; that copy wins.
            room = self.rooms.setdefault(code, room)
        return room, token

    async def claim_admin(self, code: str, token: str, display_name: str) -> tuple[Player, str]:
        """Consume the admin token, open the lobby, create the admin player.

        Returns the player and their plaintext session token, once.
        """
        code = code.upper()
        name = normalize_name(display_name)
        session = new_token()
        pool = await self._pool()
        async with self._lock(code):
            room = await self._room(code)
            async with pool.acquire() as conn, conn.transaction():
                stored = await conn.fetchval(
                    "select admin_token_hash from rooms where id = $1", room.id
                )
                # Compare against a dummy when consumed so both failures take the same path.
                if not hmac.compare_digest(hash_token(token), stored or "0" * 64) or stored is None:
                    raise TokenUsed("this admin link was already used or is not valid")
                await conn.execute(
                    "update rooms set admin_token_hash = null,"
                    " admin_token_consumed_at = now(), status = 'lobby'"
                    " where id = $1 and admin_token_hash = $2",
                    room.id,
                    stored,
                )
                row = await conn.fetchrow(
                    "insert into players (room_id, display_name, session_token_hash, role)"
                    " values ($1, $2, $3, 'admin')"
                    " returning id, display_name, role, joined_at, session_token_hash",
                    room.id,
                    name,
                    hash_token(session),
                )
            assert row is not None
            player = _player_from_row(row)
            room.status = "lobby"
            room.players[player.id] = player
            update = self._room_updated(room)
        await self._broadcast(update)  # nobody can be connected before the claim, but cheap
        return player, session

    async def join(self, code: str, display_name: str) -> tuple[Player, str]:
        """Add a player to a joinable room. Returns the player and their session token, once.

        Connected sockets learn about the newcomer through ``room_updated``.
        """
        code = code.upper()
        name = normalize_name(display_name)
        session = new_token()
        pool = await self._pool()
        async with self._lock(code):
            room = await self._room(code)
            if room.status not in ("lobby", "playing"):
                raise NotOpen(f"room {code} is not open for joining")
            if len(room.players) >= room.max_players:
                raise RoomFull(f"room {code} is full")
            async with pool.acquire() as conn, conn.transaction():
                try:
                    row = await conn.fetchrow(
                        "insert into players (room_id, display_name, session_token_hash)"
                        " values ($1, $2, $3)"
                        " returning id, display_name, role, joined_at, session_token_hash",
                        room.id,
                        name,
                        hash_token(session),
                    )
                except asyncpg.UniqueViolationError:
                    raise NameTaken(f"the name {name!r} is taken in room {code}") from None
            assert row is not None
            player = _player_from_row(row)
            room.players[player.id] = player
            update = self._room_updated(room)
        await self._broadcast(update)
        return player, session

    # --- Game loop ------------------------------------------------------------------

    async def start_game(self, code: str, by: Player) -> None:
        """``lobby → playing``, then open question 0 (section 4).

        The timer task is created only after ``room_updated`` is on the wire, so nobody
        can see ``question_open`` before they know the game has started.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._lock(code):
            room = await self._room(code)
            _require_admin(by)
            if room.status != "lobby":
                raise BadState(f"room {code} is {room.status}, not in the lobby")
            if not room.questions:
                raise BadState(f"room {code} has no questions")
            if not room.sockets:
                raise BadState("nobody is connected to play")
            room.status = "playing"
            room.current_index = 0
            async with pool.acquire() as conn:
                await conn.execute(
                    "update rooms set status = 'playing', current_index = 0 where id = $1",
                    room.id,
                )
            update = self._room_updated(room)
        await self._broadcast(update)
        self._start_timer(room, 0)

    async def submit_answer(self, code: str, player: Player, question_id: str, value: Any) -> int:
        """Store one answer and return its speed bucket.

        The row is committed before this returns and the handler sends ``answer_ack``
        only after it returns, so an acknowledged answer is an answer that survived the
        process. Nothing here is batched or deferred.

        The room lock is what keeps this honest against the clock: an answer that arrives
        while the timer is closing the question waits for the lock and is then rejected
        with ``not_open``, and one that wins the race is graded in that same close.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._lock(code):
            room = await self._room(code)
            question = room.open_question()
            if room.status != "playing" or question is None or question.closed_at is not None:
                raise NotOpen("no question is open")
            if question.question_id != question_id:
                raise NotOpen(f"question {question_id} is not the open one")
            if player.id in question.answers:
                raise AlreadyAnswered("you have already answered this question")
            if not question.can_answer(player.id):
                raise Excluded("you cannot answer this question")
            if not TYPES[question.type].validate_value(question.payload, value):
                raise BadValue(f"not a valid answer to a {question.type} question")
            now = datetime.now(UTC)
            assert question.shown_at is not None  # set when the question opened
            elapsed = (now - question.shown_at).total_seconds()
            bucket = scoring.bucket(elapsed, room.settings.question_seconds)
            async with pool.acquire() as conn:
                try:
                    await conn.execute(
                        "insert into answers (question_id, player_id, value, received_at)"
                        " values ($1, $2, $3, $4)",
                        question.id,
                        player.id,
                        value,
                        now,
                    )
                except asyncpg.UniqueViolationError:  # a row this room never loaded
                    raise AlreadyAnswered("you have already answered this question") from None
            question.answers[player.id] = Submitted(value=value, received_at=now, bucket=bucket)
            if room.settings.close_when_all_answered and _everyone_answered(room, question):
                room.advance.set()
        return bucket

    async def skip(self, code: str, by: Player) -> None:
        """Admin: close the open question now, or cut the reveal short (section 3).

        Nothing is broadcast and nothing is awaited here: setting ``advance`` wakes the
        timer task, which owns every state change either way. A skip that arrives while
        the timer is midway through a close finds the phase already ``reveal`` and
        shortens that instead, which is the same thing the admin asked for.
        """
        code = code.upper()
        async with self._lock(code):
            room = await self._room(code)
            _require_admin(by)
            if room.status != "playing" or room.phase not in ("open", "reveal"):
                raise BadState("there is nothing to skip")
            room.advance.set()

    async def promote(self, code: str, by: Player, player_id: UUID) -> None:
        """Admin: make another player an admin too. There is no demote."""
        code = code.upper()
        pool = await self._pool()
        async with self._lock(code):
            room = await self._room(code)
            _require_admin(by)
            target = room.players.get(player_id)
            if target is None:
                raise BadState("there is no such player in this room")
            if target.role == "admin":
                return
            async with pool.acquire() as conn:
                await conn.execute("update players set role = 'admin' where id = $1", player_id)
            target.role = "admin"
            update = self._room_updated(room)
        await self._broadcast(update)

    async def kick(self, code: str, by: Player, player_id: UUID) -> None:
        """Admin: delete a player and their answers, and close their socket with 4003.

        Admins cannot be kicked, themselves included. Deleting the row cascades to their
        answers, so they leave the standings with it and the sum in ``totals`` drops them.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._lock(code):
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
            update = self._room_updated(room)
        if socket is not None:
            await _close(socket, CLOSE_KICKED, "removed from the room")
        await self._broadcast(update)

    async def end_game(self, code: str, by: Player) -> None:
        """Admin: void whatever is open and finish the game (section 4).

        The voided question keeps its answers but is never graded, so those rows stay at
        ``points = null`` and add nothing to anyone's sum.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._lock(code):
            room = await self._room(code)
            _require_admin(by)
            if room.status != "playing":
                raise BadState(f"room {code} is {room.status}, not playing")
            _stop_timer(room)
            async with pool.acquire() as conn, conn.transaction():
                question = room.open_question()
                if question is not None and question.closed_at is None:
                    question.closed_at = datetime.now(UTC)
                    question.voided = True
                    await conn.execute(
                        "update questions set closed_at = $1, voided = true where id = $2",
                        question.closed_at,
                        question.id,
                    )
                broadcasts = await self._finish(room, conn)
        for broadcast in broadcasts:
            await self._broadcast(broadcast)

    # --- The timer task --------------------------------------------------------------

    def _start_timer(self, room: Room, index: int) -> None:
        """Hand the room to its one timer task, starting at ``index``.

        Called with the lock released, right after the caller's own broadcast, so the
        first thing the task does cannot overtake it.
        """
        if self.rooms.get(room.code) is not room or room.status != "playing":
            return
        room.timer = asyncio.create_task(
            self._run_questions(room, index), name=f"room-{room.code}-timer"
        )

    async def _run_questions(self, room: Room, index: int) -> None:
        """The one task per room: open → close → reveal → next, until the game ends.

        Every step takes the room lock again and re-checks that this room is still the
        live one and still playing, so a game that ends underneath the task (``end_game``,
        eviction) stops it at the next step whether or not the cancellation lands first.
        """
        try:
            while True:
                question = await self._open_question(room, index)
                if question is None or question.ends_at is None:
                    return
                await self._sleep_until(room, question.ends_at)
                next_at = await self._close_question(room, question)
                if next_at is None:
                    return
                await self._sleep_until(room, next_at)
                following = await self._advance(room, index)
                if following is None:
                    return
                index = following
        except asyncio.CancelledError:
            raise
        except Exception:  # a broken question or a database failure must not go silent
            log.exception("room %s: the timer task stopped", room.code)
        finally:
            if room.timer is asyncio.current_task():
                room.timer = None

    async def _sleep_until(self, room: Room, target: datetime) -> None:
        """Wait until ``target``, or until something sets ``room.advance``.

        The delay is measured against the clock every time rather than counted down, so
        a wakeup that is late (a busy event loop, a suspended machine) closes the
        question immediately instead of pushing the rest of the game back by that much.
        """
        delay = max(0.0, (target - datetime.now(UTC)).total_seconds())
        try:
            async with asyncio.timeout(delay):
                await room.advance.wait()
        except TimeoutError:
            pass

    async def _open_question(self, room: Room, index: int) -> RoomQuestion | None:
        """``pending → open``: stamp ``shown_at``, broadcast ``question_open``."""
        pool = await self._pool()
        async with room.lock:
            if self.rooms.get(room.code) is not room or room.status != "playing":
                return None
            if not 0 <= index < len(room.questions):
                return None
            question = room.questions[index]
            now = datetime.now(UTC)
            question.shown_at = now
            question.ends_at = now + timedelta(seconds=room.settings.question_seconds)
            room.current_index = index
            room.phase = "open"
            room.next_at = None
            room.advance.clear()
            async with pool.acquire() as conn:
                await conn.execute(
                    "update questions set shown_at = $1 where id = $2", now, question.id
                )
            opened = Broadcast.per_player(
                room,
                lambda pid: QuestionOpen(question=question.view(room.total, pid)).model_dump(
                    mode="json"
                ),
            )
        await self._broadcast(opened)
        return question

    async def _close_question(self, room: Room, question: RoomQuestion) -> datetime | None:
        """``open → closed``: grade, write the points, broadcast ``question_closed``.

        Returns when the reveal ends, or ``None`` if the room stopped playing underneath
        us. This is the only place ``answers.correct`` and ``answers.points`` are written,
        and the standings that go out with the reveal are the table's own sum, re-read
        here once the points are in.
        """
        pool = await self._pool()
        async with room.lock:
            if self.rooms.get(room.code) is not room or room.status != "playing":
                return None
            if room.phase != "open" or room.current is not question:
                return None
            now = datetime.now(UTC)
            question.closed_at = now
            room.phase = "reveal"
            room.next_at = now + timedelta(seconds=room.settings.reveal_seconds)
            room.advance.clear()
            module = TYPES[question.type]
            # Everything in ``answers`` passed ``can_answer`` on the way in, so grading
            # never has to re-check the exclusions.
            correct = module.grade(
                question.payload,
                [Submission(pid, answer.value) for pid, answer in question.answers.items()],
            )
            for pid, answer in question.answers.items():
                answer.correct = bool(correct.get(pid, False))
                answer.points = scoring.points_for(answer.correct, answer.bucket)
            async with pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    "update questions set closed_at = $1 where id = $2", now, question.id
                )
                if question.answers:
                    await conn.executemany(
                        "update answers set correct = $1, points = $2"
                        " where question_id = $3 and player_id = $4",
                        [
                            (answer.correct, answer.points, question.id, pid)
                            for pid, answer in question.answers.items()
                        ],
                    )
                room.totals = await _fetch_totals(conn, room.id)
            more = question.position + 1 < len(room.questions)
            message = QuestionClosed(
                question_id=question.question_id,
                reveal=module.reveal(question.payload),
                results={
                    pid: PlayerResult(
                        value=answer.value,
                        correct=bool(answer.correct),
                        points=answer.points or 0,
                    )
                    for pid, answer in question.answers.items()
                },
                standings=room.standings(),
                next_at=room.next_at if more else None,
            )
            closed = Broadcast.to_all(room, message.model_dump(mode="json"))
            next_at = room.next_at
        await self._broadcast(closed)
        return next_at

    async def _advance(self, room: Room, index: int) -> int | None:
        """``closed → next pending``, or the end of the game.

        Returns the next index, or ``None`` when the room finished or is no longer ours.
        The index change is not broadcast on its own; the ``question_open`` that follows
        immediately carries it.
        """
        pool = await self._pool()
        async with room.lock:
            if self.rooms.get(room.code) is not room or room.status != "playing":
                return None
            following = index + 1
            async with pool.acquire() as conn:
                if following < len(room.questions):
                    room.current_index = following
                    room.next_at = None
                    await conn.execute(
                        "update rooms set current_index = $1 where id = $2", following, room.id
                    )
                    return following
                broadcasts = await self._finish(room, conn)
        for broadcast in broadcasts:
            await self._broadcast(broadcast)
        return None

    async def _finish(self, room: Room, conn: asyncpg.Connection) -> list[Broadcast]:
        """``playing → finished``. Call with the room lock held, send what it returns.

        ``room_updated`` goes first so a client knows the room is over before the final
        standings land.
        """
        room.status = "finished"
        room.phase = "idle"
        room.next_at = None
        await conn.execute("update rooms set status = 'finished' where id = $1", room.id)
        finished = GameFinished(standings=room.standings())
        return [
            self._room_updated(room),
            Broadcast.to_all(room, finished.model_dump(mode="json")),
        ]

    async def shutdown(self) -> None:
        """Cancel every room's timer task and wait for them. The lifespan calls this."""
        timers = [room.timer for room in self.rooms.values() if room.timer is not None]
        for room in self.rooms.values():
            _stop_timer(room)
        await asyncio.gather(*timers, return_exceptions=True)


def _require_admin(player: Player) -> None:
    if player.role != "admin":
        raise NotAdmin("only an admin can do that")


def _everyone_answered(room: Room, question: RoomQuestion) -> bool:
    """Has every connected player who is allowed to score answered this question?

    A question nobody may answer (``host_only``) is never "all answered": it runs its
    full time, as section 4 says it should.

    Only an arriving answer asks this. Somebody leaving with the question unanswered does
    not close it early, so a player whose phone drops has until ``ends_at`` to come back
    and answer rather than having the question shut behind them.
    """
    eligible = [pid for pid in room.sockets if question.can_answer(pid)]
    return bool(eligible) and all(pid in question.answers for pid in eligible)


def _stop_timer(room: Room) -> None:
    """Cancel the room's timer task, if it has one, without waiting for it.

    Never awaited here: the task may be blocked on the room lock, which the caller
    usually holds. It takes the cancellation at that await, and every step it could
    still run re-checks that the room is live and playing before it changes anything.
    """
    timer, room.timer = room.timer, None
    if timer is not None and timer is not asyncio.current_task():
        timer.cancel()


async def _fetch_questions(conn: asyncpg.Connection, room_id: UUID) -> list[RoomQuestion]:
    rows = await conn.fetch(
        "select id, position, question_id, type, source, payload, host_only,"
        " author_player_id, shown_at, closed_at, voided"
        " from questions where room_id = $1 order by position",
        room_id,
    )
    return [
        RoomQuestion(
            id=row["id"],
            position=row["position"],
            question_id=row["question_id"],
            type=row["type"],
            source=row["source"],
            payload=row["payload"]["payload"],
            host_only=row["host_only"],
            author_player_id=row["author_player_id"],
            shown_at=row["shown_at"],
            closed_at=row["closed_at"],
            voided=row["voided"],
        )
        for row in rows
    ]


async def _fetch_totals(conn: asyncpg.Connection, room_id: UUID) -> dict[UUID, Totals]:
    """Every player's score straight from the ``answers`` table (section 5).

    This query is the source of truth for standings; the in-memory copy is only ever
    replaced by what it returns. Ungraded rows (points null) count for nothing, which is
    what makes a voided question free.
    """
    rows = await conn.fetch(
        "select a.player_id, coalesce(sum(a.points), 0)::int as points,"
        " count(*) filter (where a.correct)::int as correct"
        " from answers a join questions q on q.id = a.question_id"
        " where q.room_id = $1 group by a.player_id",
        room_id,
    )
    return {row["player_id"]: Totals(points=row["points"], correct=row["correct"]) for row in rows}


async def _fetch_room(conn: asyncpg.Connection, code: str) -> asyncpg.Record:
    row = await conn.fetchrow(
        "select id, code, status, settings, current_index, created_at, expires_at"
        " from rooms where code = $1",
        code,
    )
    if row is None:
        raise RoomNotFound(f"no room {code}")
    if row["expires_at"] <= datetime.now(UTC):
        raise RoomExpired(f"room {code} has expired")
    return row
