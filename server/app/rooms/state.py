"""The room-state module: everything that mutates a room goes through ``RoomManager``.

This batch (T6/T7) has ``create``, ``claim_admin``, ``join`` and the ``get`` the HTTP
room view needs. Each reads and writes Postgres directly inside one transaction, under
a per-code ``asyncio.Lock``. The in-memory ``Room`` map, sockets, timers and rehydrate
arrive with T8.

Token flow (section 7 of ideas/architecture.md): the admin token and every session
token are ``secrets.token_urlsafe(32)``; only their sha256 hex is stored. The plaintext
is returned to the caller exactly once and never logged.
"""

import asyncio
import hashlib
import hmac
import ipaddress
import random
import secrets
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import asyncpg

from app.config import Settings
from app.errors import ApiError
from app.questions.packs import Pack
from app.rooms import codes, selection
from app.rooms.settings import RoomSettings

NAME_MAX = 24
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
    connected: bool = False

    def view(self) -> dict[str, Any]:
        """``PlayerView`` from section 3."""
        return {
            "id": str(self.id),
            "display_name": self.display_name,
            "role": self.role,
            "connected": self.connected,
        }


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
    players: dict[UUID, Player] = field(default_factory=dict)

    @property
    def phase(self) -> str:
        return "idle"

    def view(self) -> dict[str, Any]:
        """``RoomView`` from section 3."""
        return {
            "code": self.code,
            "status": self.status,
            "settings": self.settings.model_dump(),
            "current_index": self.current_index,
            "total": self.total,
            "phase": self.phase,
        }


def _player_from_row(row: asyncpg.Record) -> Player:
    return Player(
        id=row["id"],
        display_name=row["display_name"],
        role=row["role"],
        joined_at=row["joined_at"],
    )


def _room_from_row(row: asyncpg.Record, total: int) -> Room:
    return Room(
        id=row["id"],
        code=row["code"],
        status=row["status"],
        settings=RoomSettings.model_validate(row["settings"]),
        current_index=row["current_index"],
        total=total,
        created_at=row["created_at"],
        expires_at=row["expires_at"],
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
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock(self, code: str) -> asyncio.Lock:
        return self._locks.setdefault(code, asyncio.Lock())

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
        return _room_from_row(room_row, total=len(questions)), token

    async def claim_admin(self, code: str, token: str, display_name: str) -> tuple[Player, str]:
        """Consume the admin token, open the lobby, create the admin player.

        Returns the player and their plaintext session token, once.
        """
        code = code.upper()
        name = normalize_name(display_name)
        session = new_token()
        pool = await self._pool()
        async with self._lock(code):
            async with pool.acquire() as conn, conn.transaction():
                room = await _fetch_room(conn, code)
                stored = room["admin_token_hash"]
                # Compare against a dummy when consumed so both failures take the same path.
                if not hmac.compare_digest(hash_token(token), stored or "0" * 64) or stored is None:
                    raise TokenUsed("this admin link was already used or is not valid")
                await conn.execute(
                    "update rooms set admin_token_hash = null,"
                    " admin_token_consumed_at = now(), status = 'lobby'"
                    " where id = $1 and admin_token_hash = $2",
                    room["id"],
                    stored,
                )
                row = await conn.fetchrow(
                    "insert into players (room_id, display_name, session_token_hash, role)"
                    " values ($1, $2, $3, 'admin')"
                    " returning id, display_name, role, joined_at",
                    room["id"],
                    name,
                    hash_token(session),
                )
        assert row is not None
        return _player_from_row(row), session

    async def join(self, code: str, display_name: str) -> tuple[Player, str]:
        """Add a player to a joinable room. Returns the player and their session token, once."""
        code = code.upper()
        name = normalize_name(display_name)
        session = new_token()
        pool = await self._pool()
        async with self._lock(code):
            async with pool.acquire() as conn, conn.transaction():
                room = await _fetch_room(conn, code)
                if room["status"] not in ("lobby", "playing"):
                    raise NotOpen(f"room {code} is not open for joining")
                settings = RoomSettings.model_validate(room["settings"])
                count = await conn.fetchval(
                    "select count(*) from players where room_id = $1", room["id"]
                )
                if count >= settings.max_players:
                    raise RoomFull(f"room {code} is full")
                try:
                    row = await conn.fetchrow(
                        "insert into players (room_id, display_name, session_token_hash)"
                        " values ($1, $2, $3)"
                        " returning id, display_name, role, joined_at",
                        room["id"],
                        name,
                        hash_token(session),
                    )
                except asyncpg.UniqueViolationError:
                    raise NameTaken(f"the name {name!r} is taken in room {code}") from None
        assert row is not None
        return _player_from_row(row), session

    async def get(self, code: str) -> Room:
        """The room with its players, read from Postgres. T8 adds the in-memory map."""
        code = code.upper()
        pool = await self._pool()
        async with pool.acquire() as conn:
            row = await _fetch_room(conn, code)
            total = await conn.fetchval(
                "select count(*) from questions where room_id = $1", row["id"]
            )
            players = await conn.fetch(
                "select id, display_name, role, joined_at from players"
                " where room_id = $1 order by joined_at, id",
                row["id"],
            )
        room = _room_from_row(row, total=total)
        room.players = {p["id"]: _player_from_row(p) for p in players}
        return room


async def _fetch_room(conn: asyncpg.Connection, code: str) -> asyncpg.Record:
    row = await conn.fetchrow(
        "select id, code, status, settings, admin_token_hash, current_index,"
        " created_at, expires_at from rooms where code = $1",
        code,
    )
    if row is None:
        raise RoomNotFound(f"no room {code}")
    if row["expires_at"] <= datetime.now(UTC):
        raise RoomExpired(f"room {code} has expired")
    return row
