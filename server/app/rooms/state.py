"""The room-state module: everything that mutates a room goes through ``RoomManager``.

Rooms live in memory, one ``Room`` per code, loaded from Postgres on first use
(rehydrate) and shared by the HTTP handlers and every websocket in the room. Each room
has one ``asyncio.Lock``; every public method acquires it around its reads and writes of
the room and the matching database transaction. Sockets are never awaited under the
lock: a mutation snapshots the message and the sockets it goes to, releases the lock,
and only then sends (``Broadcast`` / ``_send``), so one stalled client cannot hold up the
room. A send that fails or times out detaches that socket like a disconnect.

T8 scope: ``create``, ``claim_admin``, ``join``, ``get`` with rehydrate for created and
lobby rooms, ``connect`` / ``disconnect`` and the ``room_updated`` broadcast. The game loop
(``Room.timer``, questions in memory, standings from answers) is T9-T11; rehydrating a
``playing`` room, which voids its open question, is T11.

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
from starlette.websockets import WebSocket

from app.config import Settings
from app.errors import ApiError
from app.questions.packs import Pack
from app.rooms import codes, selection
from app.rooms.settings import RoomSettings
from app.ws.protocol import PlayerView, RoomUpdated, RoomView, Standing, Welcome

log = logging.getLogger("app.rooms")

NAME_MAX = 24
# Seconds a single socket send may take before that socket counts as dead.
SEND_TIMEOUT = 10.0
# Close codes the manager itself uses (the handler owns the handshake codes).
CLOSE_REPLACED = 4000  # a newer socket for the same player took over
CLOSE_RESTART = 1012  # the room left memory; reconnect and you get a fresh welcome
CLOSE_SEND_FAILED = 1011
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
    # The one task driving open → closed → reveal → next. T9 creates it; nothing here does.
    timer: asyncio.Task[None] | None = field(default=None, repr=False)

    @property
    def phase(self) -> str:
        return "idle"  # T9: "open" / "reveal" while playing

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
        """Nobody has scored yet, so every player is rank 1 with 0 points, in join order.

        T10 replaces this with the sum of ``answers.points`` and the section 6 tie-break.
        """
        return [
            Standing(player_id=p.id, display_name=p.display_name, points=0, rank=1)
            for p in self.players.values()
        ]

    def find_by_session(self, session: str) -> Player | None:
        digest = hash_token(session)
        for player in self.players.values():
            if hmac.compare_digest(player.session_hash, digest):
                return player
        return None


@dataclass(slots=True)
class Broadcast:
    """A message and the sockets it goes to, snapshotted under the room lock."""

    room: Room
    message: dict[str, Any]
    targets: list[tuple[UUID, WebSocket]]


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
        """Rehydrate: the room row, its players and its question count.

        T11 adds the ``playing`` case (questions, answers, voiding the open question).
        """
        pool = await self._pool()
        async with pool.acquire() as conn:
            row = await _fetch_room(conn, code)
            total = await conn.fetchval(
                "select count(*) from questions where room_id = $1", row["id"]
            )
            players = await conn.fetch(
                "select id, display_name, role, joined_at, session_token_hash from players"
                " where room_id = $1 order by joined_at, id",
                row["id"],
            )
        room = _room_from_row(row, total=total, lock=self._lock(code))
        room.players = {p["id"]: _player_from_row(p) for p in players}
        log.info("room %s loaded with %d players", code, len(room.players))
        return room

    async def evict(self, code: str) -> bool:
        """Drop a room from memory the way a process restart would; the next ``get``
        rehydrates it. Attached sockets are closed with 1012 so clients reconnect and
        receive a fresh ``welcome``. Returns whether the room was in memory.

        This exists for the rehydrate tests (T8 accept, T11 accept); nothing in the app
        calls it. T11 also cancels ``Room.timer`` here.
        """
        code = code.upper()
        async with self._lock(code):
            room = self.rooms.pop(code, None)
            if room is None:
                return False
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
        targets = [(pid, ws) for pid, ws in room.sockets.items() if pid != exclude]
        return Broadcast(room, message.model_dump(mode="json"), targets)

    async def _broadcast(self, broadcast: Broadcast) -> None:
        """Send to every snapshotted socket, concurrently, outside the lock.

        A socket whose send fails or times out is detached exactly as if it had
        disconnected, which broadcasts its own ``room_updated`` to the survivors.
        """
        if not broadcast.targets:
            return
        results = await asyncio.gather(
            *(self._send(ws, broadcast.message) for _, ws in broadcast.targets)
        )
        for (pid, ws), ok in zip(broadcast.targets, results, strict=True):
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
            welcome = Welcome(
                room=room.view(),
                you=player.view(),
                players=room.player_views(),
                question=None,  # T9
                your_answer=None,  # T9
                standings=room.standings(),
                server_time=datetime.now(UTC),
            ).model_dump(mode="json")
            update = self._room_updated(room, exclude=player.id)
        # Sent first, straight after the lock is released, so no later broadcast can
        # reach this socket before its snapshot does.
        try:
            await ws.send_json(welcome)
        except Exception:
            await self.disconnect(code, player.id, ws)
            raise
        if previous is not None:
            await _close(previous, CLOSE_REPLACED, "connected from another device")
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
        code = room_row["code"]
        room = _room_from_row(room_row, total=len(questions), lock=self._lock(code))
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
