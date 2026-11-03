"""Getting into a room: ``create``, ``join``, and the join requests of an invite-only one.

Token flow (section 7 of ideas/architecture.md): a session token is
``secrets.token_urlsafe(32)`` and only its sha256 hex is stored. The plaintext is
returned to its owner exactly once, by ``create`` or ``join``, and never logged. There
is no second kind of token: a room's creator is its first admin, and further admins are
made with ``promote``.

"""

import asyncio
import hmac
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import asyncpg

from app.questions import custom
from app.questions.schema import QuestionError
from app.rooms import codes
from app.rooms.errors import (
    BadCode,
    BadKey,
    BadQuestion,
    BadSettings,
    BadState,
    CodeTaken,
    KeyRequired,
    NameTaken,
    NotOpen,
    RequestDenied,
    RequestGone,
    RequestsFull,
    RoomFull,
    RoomNotFound,
)
from app.rooms.models import (
    JoinRequest,
    Player,
    Room,
    _require_admin,
    hash_token,
    new_invite_key,
    new_token,
    normalize_name,
)
from app.rooms.queries import _player_from_row, _room_from_row
from app.rooms.settings import RoomSettings
from app.stats import UNREPORTED, Arrival, Metric, bump, joined

# Requests waiting on an admin at once, so somebody guessing codes cannot bury a lobby.
MAX_JOIN_REQUESTS = 5
# Seconds a request outlives its requester's last poll; the waiting page polls every two.
REQUEST_STALE_SECONDS = 10.0
# Seconds a request waits for an answer before it lapses and frees its place.
REQUEST_LIFETIME_SECONDS = 300.0


def _check_key(room: Room, key: str | None) -> None:
    if room.invite_key is None:
        return
    if key is None:
        raise KeyRequired(f"room {room.code} takes players with an invite link only")
    if not hmac.compare_digest(key.encode(), room.invite_key.encode()):
        raise BadKey("that invite link is out of date or mistyped")


def _pets_worn(room: Room) -> list[str | None]:
    """The pets of everyone in the room and everyone waiting to be let in."""
    return [p.avatar for p in room.players.values()] + [r.avatar for r in room.requests.values()]


def _check_joinable(room: Room) -> None:
    _check_lobby(room)
    _check_seat(room)


def _check_lobby(room: Room) -> None:
    # A player who is already in comes back through ``connect`` with their session; a
    # join is a new player, and a game under way is too late for one.
    if room.status == "playing":
        raise NotOpen(f"the game in room {room.code} has already started")
    if room.status != "lobby":
        raise NotOpen(f"room {room.code} has finished")


def _check_seat(room: Room) -> None:
    if len(room.players) >= room.max_players:
        raise RoomFull(f"room {room.code} is full")


class Joins:
    """The ``RoomManager`` methods that make a room or let a player into one."""

    async def get_listed(self, code: str) -> Room:
        """``get`` for a stranger holding a code: a daily room is nobody else's to find."""
        code = code.upper()
        async with self._locked(code):
            return await self._listed_room(code)

    async def _listed_room(self, code: str) -> Room:
        """``_room``, but a daily room reads as missing. Call with the room lock held."""
        room = await self._room(code)
        if room.daily is not None:
            raise RoomNotFound(f"no room {code}")
        return room

    async def create(
        self,
        display_name: str,
        settings: RoomSettings,
        custom_questions: Sequence[dict[str, Any]],
        avatar: str | None = None,
        returning: bool = False,
        invite_only: bool = False,
        public: bool = False,
        arrival: Arrival = UNREPORTED,
        code: str | None = None,
    ) -> tuple[Room, Player, str]:
        """Insert the room and its admin, in one transaction; its questions wait for the start.

        ``code`` is the host's preferred one: taken, it is ``CodeTaken`` rather than a
        different code, so the host is never handed one they did not see.

        ``custom_questions`` are the creator's own, held until ``start_game`` places each
        as a random event. The HTTP body has already checked them; they are checked again
        here for callers that did not come through it, before anything is written. How many
        fit is the start's to say, since the settings can change until then.

        Returns the room, the admin player and their plaintext session token, once.
        """
        # First, before the pool is even touched: a bad name leaves no room behind.
        name = normalize_name(display_name)
        if public and invite_only:
            raise BadSettings("a public room cannot be invite-only")
        self.check_avatar(avatar)
        self.check_code(code)
        avatar = self._pet_for(avatar, ())
        try:
            own = custom.envelopes(custom_questions)
        except QuestionError as exc:
            raise BadQuestion(str(exc)) from None
        cap = self.settings.max_players_per_room
        if settings.max_players is None:
            settings = settings.model_copy(update={"max_players": cap})
        elif settings.max_players > cap:
            raise BadSettings(f"max_players may not exceed {cap}")
        try:
            settings.drawn(self._rounds_offered(), self.rng)
        except ValueError as exc:
            raise BadSettings(str(exc)) from None
        session = new_token()
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
                            " (code, status, settings, expires_at, invite_key, public,"
                            " custom_questions)"
                            " values ($1, 'lobby', $2, $3, $4, $5, $6)"
                            " returning id, code, status, settings, current_index,"
                            " created_at, expires_at, finished_at, invite_key, public,"
                            " custom_questions, custom_author, played_question_ids",
                            code,
                            settings.model_dump(),
                            expires_at,
                            new_invite_key() if invite_only else None,
                            public,
                            own,
                        )
                except asyncpg.UniqueViolationError:
                    return False
                return True

            if code is None:
                await codes.allocate(self.words, self.code_rng, try_insert)
            elif not await try_insert(code.upper()):
                raise CodeTaken("that room code is taken")
            assert room_row is not None
            # Outside the savepoint above and inside this transaction, deliberately.
            # ``try_insert`` reads a unique violation as "that code was taken, try
            # another", and ``players_session_idx`` is unique across every room: a
            # collision there would be retried as a code collision until the allocator
            # gave up. Out here it aborts the transaction and takes the room row with
            # it, which is the property worth having -- no room without a host, ever.
            # No ``NameTaken`` guard: the room is one statement old and has no players,
            # so a violation here is a bug and should read as one.
            player_row = await conn.fetchrow(
                "insert into players (room_id, display_name, session_token_hash, role, avatar)"
                " values ($1, $2, $3, 'admin', $4)"
                " returning id, display_name, avatar, role, team, joined_at, session_token_hash",
                room_row["id"],
                name,
                hash_token(session),
                avatar,
            )
            assert player_row is not None
            await bump(conn, Metric.ROOMS_CREATED)
            await joined(conn, returning, arrival)
            await conn.execute(
                "update rooms set custom_author = $2 where id = $1",
                room_row["id"],
                player_row["id"],
            )
        code = room_row["code"]
        player = _player_from_row(player_row)
        async with self._locked(code) as lock:
            room = _room_from_row(room_row, total=0, lock=lock)
            room.custom_author = player_row["id"]
            self._plan_lobby(room)
            # Before ``setdefault``: the copy that lands in ``self.rooms`` is never re-read,
            # so a room cached without its admin would reject the host's own ``hello``.
            room.players[player.id] = player
            # A ``get`` racing the commit may have loaded it first; that copy wins, and
            # it read the admin back from the same committed row.
            room = self.rooms.setdefault(code, room)
            player = room.players.get(player.id, player)
        return room, player, session

    async def join(
        self,
        code: str,
        display_name: str,
        avatar: str | None = None,
        returning: bool = False,
        key: str | None = None,
        arrival: Arrival = UNREPORTED,
    ) -> tuple[Player, str]:
        """Add a player to a room in its lobby. Returns the player and their session token, once.

        Connected sockets learn about the newcomer through ``room_updated``. An
        invite-only room wants its ``key``, checked before anything else about the room
        is said.
        """
        code = code.upper()
        name = normalize_name(display_name)
        self.check_avatar(avatar)
        async with self._locked(code):
            room = await self._listed_room(code)
            _check_key(room, key)
            _check_joinable(room)
            player, session = await self._admit(room, name, avatar, returning, arrival)
            update = self._room_updated(room)
        self._broadcast(update)
        return player, session

    async def _admit(
        self, room: Room, name: str, avatar: str | None, returning: bool, arrival: Arrival
    ) -> tuple[Player, str]:
        """Insert a player into a lobby with room for them. Call with the room lock held."""
        avatar = self._pet_for(avatar, _pets_worn(room))
        session = new_token()
        pool = await self._pool()
        async with pool.acquire() as conn, conn.transaction():
            try:
                row = await conn.fetchrow(
                    "insert into players (room_id, display_name, session_token_hash, avatar)"
                    " values ($1, $2, $3, $4) returning id, display_name, avatar, role, team,"
                    " joined_at, session_token_hash",
                    room.id,
                    name,
                    hash_token(session),
                    avatar,
                )
            except asyncpg.UniqueViolationError:
                raise NameTaken(f"the name {name!r} is taken in room {room.code}") from None
            await joined(conn, returning, arrival)
        assert row is not None
        player = _player_from_row(row)
        room.players[player.id] = player
        return player, session

    async def request_join(
        self,
        code: str,
        display_name: str,
        avatar: str | None = None,
        returning: bool = False,
        arrival: Arrival = UNREPORTED,
    ) -> str:
        """Ask an invite-only room's admins to let ``display_name`` in. Returns the ticket, once.

        Refused up front for whatever would refuse the join itself, so nobody waits on an
        answer that could never let them in.
        """
        code = code.upper()
        name = normalize_name(display_name)
        self.check_avatar(avatar)
        ticket = new_token()
        async with self._locked(code):
            room = await self._listed_room(code)
            if room.invite_key is None:
                raise BadState(f"room {code} takes anyone with its code")
            _check_joinable(room)
            folded = name.casefold()
            taken = [p.display_name for p in room.players.values()]
            taken += [r.display_name for r in room.requests.values()]
            if any(other.casefold() == folded for other in taken):
                raise NameTaken(f"the name {name!r} is taken in room {code}")
            if len(room.requests) >= MAX_JOIN_REQUESTS:
                raise RequestsFull(f"room {code} has too many requests waiting, try again later")
            request = JoinRequest(
                id=uuid4(),
                ticket_hash=hash_token(ticket),
                display_name=name,
                avatar=self._pet_for(avatar, _pets_worn(room)),
                returning=returning,
                arrival=arrival,
                asked_at=self.clock(),
            )
            room.requests[request.ticket_hash] = request
            self._expire_request_later(room, request)
            update = self._room_updated(room)
        self._broadcast(update)
        return ticket

    async def poll_request(self, code: str, ticket: str) -> tuple[Player, str] | None:
        """The requester asking how it went: ``None`` while it waits, their player and
        session once an admin let them in. Turned away raises ``RequestDenied``.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._listed_room(code)
            _check_lobby(room)
            request = room.requests.get(hash_token(ticket))
            if request is None:
                raise RequestGone("this request is no longer waiting, ask again")
            if request.accepted is None:
                # Restarted at once by a lapsed request, which drops it and tells the admins.
                self._expire_request_later(room, request)
                if self.clock() - request.asked_at >= REQUEST_LIFETIME_SECONDS:
                    raise RequestGone("nobody let you in in time, ask again")
                return None
            request.drop()
            del room.requests[request.ticket_hash]
            if not request.accepted:
                raise RequestDenied("the host did not let you in")
            _check_seat(room)
            admitted = await self._admit(
                room, request.display_name, request.avatar, request.returning, request.arrival
            )
            update = self._room_updated(room)
        self._broadcast(update)
        return admitted

    async def cancel_request(self, code: str, ticket: str) -> None:
        """The requester gave up. A ticket that is no longer waiting is nothing to cancel."""
        code = code.upper()
        async with self._locked(code):
            room = await self._listed_room(code)
            request = room.requests.pop(hash_token(ticket), None)
            if request is None:
                return
            request.drop()
            update = self._room_updated(room)
        self._broadcast(update)

    async def decide_request(self, code: str, by: Player, request_id: UUID, accept: bool) -> None:
        """Admin: let a requester in or turn them away; their next poll hears which.

        That poll creates the player, so a session is only ever made in the response that
        hands it over.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            request = next((r for r in room.requests.values() if r.id == request_id), None)
            if request is None or request.accepted is not None:
                raise BadState("that request is no longer waiting")
            if accept and len(room.players) >= room.max_players:
                raise BadState(f"room {code} is full")
            request.accepted = accept
            update = self._room_updated(room)
        self._broadcast(update)

    def _expire_request_later(self, room: Room, request: JoinRequest) -> None:
        """(Re)start the countdown that drops ``request``. Lock held."""
        request.drop()
        left = REQUEST_LIFETIME_SECONDS - (self.clock() - request.asked_at)
        seconds = max(0.0, min(self.request_stale_seconds, left))
        request.expiry = asyncio.create_task(self._expire_request(room, request, seconds))

    async def _expire_request(self, room: Room, request: JoinRequest, seconds: float) -> None:
        await asyncio.sleep(seconds)
        async with room.lock:
            if room.requests.get(request.ticket_hash) is not request:
                return
            request.expiry = None
            del room.requests[request.ticket_hash]
            update = self._room_updated(room)
        self._broadcast(update)

    def check_code(self, code: str | None) -> None:
        """Refuse a requested room code the word list could not have drawn."""
        if code is not None and not codes.drawable(code.upper(), self.words):
            raise BadCode("code must be one the server could have drawn")

    async def free_code(self) -> str:
        """A drawn room code no room holds right now; nothing reserves it."""
        drawn = list(codes.candidates(self.words, self.code_rng))
        pool = await self._pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("select code from rooms where code = any($1)", drawn)
        return codes.first_free(drawn, {row["code"] for row in rows})
