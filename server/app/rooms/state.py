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

Scoring (T10, T17) is ``rooms/scoring.py``. An answer's band -- its speed bucket, or its
step -- is fixed when it arrives; at the close the type's ``grade`` gives credit, and
``points_for`` pays out on the two. The answers table is the source of truth for
standings: close writes ``correct`` and ``points``, then re-reads ``sum(points)`` per
player into ``Room.totals``. Nothing adds to a running total in memory.

Restart recovery (T11) is the rest of the rehydrate: ``_load`` brings back the room, its
players, its questions and the standings sum, and ``_recover`` voids whatever question was
open when the process died, puts the room in ``reveal`` and hands it to a timer task that
starts there, so a crash costs one question and nobody is asked another one on arrival.

Token flow (section 7 of ideas/architecture.md): a session token is
``secrets.token_urlsafe(32)`` and only its sha256 hex is stored. The plaintext is
returned to its owner exactly once, by ``create`` or ``join``, and never logged. There
is no second kind of token: a room's creator is its first admin, and further admins are
made with ``promote``.
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
from app.questions import custom
from app.questions.packs import Pack
from app.questions.schema import QuestionError
from app.questions.submission import Submission
from app.questions.types import TYPES, scoring_of
from app.questions.types.scoring import Scoring
from app.rooms import codes, ready, scoring, segments, selection
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
    Segment,
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
# The room is gone for good -- expired and cleaned up, or removed by its host. The same
# code the handler closes an unknown room with, because that is what a reconnect finds.
CLOSE_GONE = 4004
# Envelope keys that have their own column in ``questions``; the rest is the payload jsonb.
# ``random_event`` is not an envelope key at all but a placement ``selection`` adds.
_QUESTION_COLUMNS = frozenset({"id", "type", "mode", "source", "host_only", "random_event"})


class RoomNotFound(ApiError):
    status, code = 404, "not_found"


class RoomExpired(ApiError):
    status, code = 410, "expired"


class NotOpen(ApiError):
    status, code = 409, "not_open"


class NameTaken(ApiError):
    status, code = 409, "name_taken"


class RoomFull(ApiError):
    status, code = 409, "room_full"


class BadName(ApiError):
    status, code = 422, "bad_name"


class BadAvatar(ApiError):
    """An ``avatar`` that is not an id in ``data/heads/heads.json``."""

    status, code = 422, "bad_avatar"


class BadSettings(ApiError):
    status, code = 422, "bad_settings"


class BadQuestion(ApiError):
    """One of the host's own questions fails the schema or its type's ``check``."""

    status, code = 422, "bad_question"


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
    # A head from the manifest, or ``None`` for "never chosen": the client draws the one
    # derived from ``id`` then, which is also what every player from before D4 has.
    avatar: int | None = None
    # The ready check (D7), in memory only: it means "ready to start" in the lobby and
    # "ready for this round" on a splash, and every splash starts everybody afresh. A
    # restart forgets it, which costs one tap -- the same as the splash it replays.
    ready: bool = False
    # Whether this player has already taken a tap back on this splash. One un-ready per
    # splash, so a player hammering the button cannot stop and restart the room's
    # countdown over and over; the lobby, where a toggle stops nothing, has no limit.
    unreadied: bool = False

    def view(self) -> PlayerView:
        return PlayerView(
            id=self.id,
            display_name=self.display_name,
            avatar=self.avatar,
            role=self.role,  # type: ignore[arg-type]  # the column's check constraint
            connected=self.connected,
            ready=self.ready,
        )


@dataclass(slots=True)
class Submitted:
    """One player's answer to one question, in memory.

    ``band`` is fixed at receive time from ``received_at - shown_at`` (section 6); the
    client never sends a time. It is ``None`` for a question scored on ``RANK``, where
    nothing is known until everyone has answered. ``credit``, ``correct`` and ``points``
    stay ``None`` until the question closes and grading writes them here, and the last
    two to the ``answers`` row. ``credit`` has no column: it goes out once with the
    reveal, and the table keeps what the standings are built from.
    """

    value: Any
    received_at: datetime
    band: int | None
    credit: float | None = None
    correct: bool | None = None
    points: int | None = None


@dataclass(slots=True)
class RoomQuestion:
    """A ``questions`` row plus the answers to it.

    ``payload`` is the type-specific payload, the thing ``types.<type>`` takes, unwrapped
    from the column of the same name: that column also carries the envelope extras
    (``tags``, ``difficulty``, ``author``, ``added_at``), which the game loop has no use
    for and leaves in the database.

    ``seconds`` and ``ends_at`` are not columns either: they are recomputed whenever the
    question opens, from the setting its own mode carries, and ``ends_at`` is what the
    timer and the clients count down to. ``seconds`` is also what the speed bucket is a
    fraction of, so a ten-second mode scores on ten seconds in a room whose other rounds
    run to a minute.

    ``type`` and ``mode`` are both columns, and neither is derived from the other: the
    type is how the question is answered and graded, the mode is the round it was drawn
    for and where its ``seconds`` come from.

    ``random_event`` is the NPC interrupting ``round`` with this question, or ``None`` for
    a question that belongs to its round. An event's ``mode`` is its own and its ``round``
    is the one it interrupts; ``segments.py`` reads the pair.
    """

    id: UUID
    position: int
    question_id: str
    type: str
    mode: str
    source: str
    payload: dict[str, Any]
    host_only: bool
    author_player_id: UUID | None
    round: int = 0
    random_event: str | None = None
    shown_at: datetime | None = None
    closed_at: datetime | None = None
    voided: bool = False
    seconds: int | None = None
    ends_at: datetime | None = None
    answers: dict[UUID, Submitted] = field(default_factory=dict)

    @property
    def steps(self) -> int | None:
        """How many frames the question shows itself in, for ``STEP`` scoring (section 6).

        Pixel Hunt's ``pick_from_list`` payloads will be the only ones to carry it (Phase
        3). Every other question is ``None``, which is also what turns ``STEP`` into
        ``SPEED``.
        """
        return self.payload.get("steps")

    @property
    def scoring(self) -> Scoring:
        """How this question's credit becomes points, as its type and payload decide."""
        return scoring.effective(scoring_of(self.type), self.steps)

    def can_answer(self, player_id: UUID) -> bool:
        """Section 6 exclusions: nobody answers a ``host_only`` question, and the author
        of a ``source: room`` question cannot answer their own."""
        if self.host_only:
            return False
        return self.source != "room" or self.author_player_id != player_id

    def view(self, total: int, player_id: UUID, segment: Segment) -> OpenQuestion:
        assert self.shown_at is not None and self.ends_at is not None
        return OpenQuestion(
            question_id=self.question_id,
            index=self.position,
            total=total,
            type=self.type,
            mode=self.mode,
            segment=segment,
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
    # When the current timed phase ends: a splash gives way to its first question, a
    # reveal to the next question. ``None`` while a question is open, and during a splash
    # that is still waiting for the room to be ready.
    next_at: datetime | None = None
    # The one task driving open → closed → reveal → next.
    timer: asyncio.Task[None] | None = field(default=None, repr=False)
    # Set to cut the current sleep short: ``skip``, or everyone has answered.
    advance: asyncio.Event = field(default_factory=asyncio.Event, repr=False)
    # Set when the ready check (D7) starts, shortens or stops a splash's countdown, so the
    # timer task wakes and sleeps to the new ``next_at`` rather than the old one.
    rescheduled: asyncio.Event = field(default_factory=asyncio.Event, repr=False)

    @property
    def segments(self) -> list[Segment]:
        """The room's rounds. Grouped on demand so they cannot drift from the questions."""
        return segments.segments_of(self.questions)

    def segment_at(self, position: int) -> Segment | None:
        return segments.segment_at(self.segments, position)

    @property
    def current_segment(self) -> Segment | None:
        return None if self.current_index is None else self.segment_at(self.current_index)

    def question_seconds(self, mode: str) -> int:
        """How long a question of this mode stays open: its round's own setting."""
        return self.settings.seconds_for(mode)

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
            next_at=self.next_at,
            segment=self.current_segment,
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
                    avatar=player.avatar,
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
        avatar=row["avatar"],
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


def _question_rows(
    room_id: UUID, questions: Sequence[tuple[int, dict[str, Any]]], author: UUID
) -> list[tuple[Any, ...]]:
    """Rows for ``selection.flatten``'s ``(round, question)`` pairs, position by position.

    ``author`` is the room's creator, and it is written against the questions they wrote
    -- ``source: room`` -- and nothing else. That column is what keeps them from scoring on
    their own questions (``RoomQuestion.can_answer``).
    """
    return [
        (
            room_id,
            position,
            q["id"],
            q["type"],
            q["mode"],
            q["source"],
            {k: v for k, v in q.items() if k not in _QUESTION_COLUMNS},
            bool(q.get("host_only", False)),
            round_,
            q.get("random_event"),
            author if q["source"] == "room" else None,
        )
        for position, (round_, q) in enumerate(questions)
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
        *,
        heads: int,
    ) -> None:
        self._pool = pool
        self.packs = packs
        self.settings = settings
        self.words = words
        # The length of ``data/heads/heads.json``: every valid ``avatar`` is below it.
        self.heads = heads
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
            # Registered before the recovery, which starts a timer task that checks it.
            self.rooms[code] = room
            if room.status == "playing":
                try:
                    await self._recover(room)
                except Exception:
                    # An unrecovered room left in memory would stay that way: every later
                    # call finds it here and skips this branch, so the game would sit in
                    # ``idle`` with no timer until it expired. Drop it and let the caller's
                    # retry rehydrate from scratch.
                    self.rooms.pop(code, None)
                    raise
        elif room.expires_at <= datetime.now(UTC):
            raise RoomExpired(f"room {code} has expired")
        return room

    async def _load(self, code: str) -> Room:
        """Rehydrate: the room row, its players, its questions and the standings sum.

        Individual answer rows are not read back. The only ones that could still matter
        are the answers to a question that was open when the process died, and
        ``_recover`` voids that question ungraded; everything already scored is in
        ``totals``, which is the ``answers`` table's own sum.

        A room that comes back ``playing`` is not running yet when this returns:
        ``_room`` hands it to ``_recover`` once it is in ``self.rooms``.
        """
        pool = await self._pool()
        async with pool.acquire() as conn:
            row = await _fetch_room(conn, code)
            questions = await _fetch_questions(conn, row["id"])
            players = await conn.fetch(
                "select id, display_name, avatar, role, joined_at, session_token_hash from players"
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
        return room

    async def _recover(self, room: Room) -> None:
        """T11: pick a ``playing`` room that left memory mid-game back up, in ``reveal``.

        Section 3's restart rules. A question with ``shown_at`` set and ``closed_at`` null
        was open when the process died, so it is closed now and voided, ungraded: that is
        the "a crash costs the open question at most" guarantee. Its answers keep their
        null ``points`` and are worth nothing to anybody.

        The room then resumes in ``reveal`` for ``reveal_seconds`` whether or not anything
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

        Call with the room lock held, once the room is in ``self.rooms``.
        """
        question = room.current
        resume_from = room.current_index or 0
        if question is None or question.shown_at is None:
            resume_from -= 1
        elif question.closed_at is None:
            pool = await self._pool()
            async with pool.acquire() as conn:
                await _void_question(conn, question)
            log.warning(
                "room %s: question %d was open at the restart, voided", room.code, question.position
            )
        room.phase = "reveal"
        room.next_at = datetime.now(UTC) + timedelta(seconds=room.settings.reveal_seconds)
        log.info(
            "room %s resumes in reveal until %s, then question %d",
            room.code,
            room.next_at.isoformat(),
            resume_from + 1,
        )
        self._start_timer(room, resume_from, resume_at=room.next_at)

    def _forget(self, room: Room) -> list[WebSocket]:
        """Take a room out of memory and detach its sockets, returning them to close.

        Call with the room lock held. Closing a socket is a send, and sends never happen
        under the lock, so that is the caller's job once it has released it.
        """
        if self.rooms.get(room.code) is room:
            del self.rooms[room.code]
        _stop_timer(room)
        sockets = list(room.sockets.values())
        room.sockets.clear()
        for player in room.players.values():
            player.connected = False
        return sockets

    async def evict(self, code: str) -> bool:
        """Drop a room from memory the way a process restart would; the next ``get``
        rehydrates it. Attached sockets are closed with 1012 so clients reconnect and
        receive a fresh ``welcome``. Returns whether the room was in memory.

        This exists for the rehydrate tests (T8 accept, T11 accept); nothing in the app
        calls it. The room rows stay: ``purge_expired`` and ``delete`` are the two ways
        a room really goes away.
        """
        code = code.upper()
        async with self._lock(code):
            room = self.rooms.get(code)
            if room is None:
                return False
            sockets = self._forget(room)
        for ws in sockets:
            await _close(ws, CLOSE_RESTART, "room restarted, reconnect")
        return True

    # --- Removal --------------------------------------------------------------------

    async def purge_expired(self) -> int:
        """Section 4's ``any → deleted``: delete every room past its ``expires_at``.

        One statement; ``on delete cascade`` takes the players, questions and answers
        with it. Then the same rooms go from memory, so the process does not hold what
        the database has dropped. Returns the number of rows deleted.

        The order is deliberate. Between the delete and the eviction an expired room is
        still in ``self.rooms``, and every way in refuses it anyway: ``_room`` checks
        ``expires_at`` on a cached room and ``_fetch_room`` checks it on a loaded one, so
        there is no window in which a purged room can still be joined or played.

        The caller is the cleanup task in ``main.py``; the tests run a pass directly.
        """
        pool = await self._pool()
        async with pool.acquire() as conn:
            status = await conn.execute("delete from rooms where expires_at < now()")
        deleted = _rows_affected(status)
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
        for code in [c for c, room in self.rooms.items() if room.expires_at <= now]:
            async with self._lock(code):
                room = self.rooms.get(code)
                if room is None or room.expires_at > now:
                    continue
                sockets = self._forget(room)
                log.info("room %s expired and left memory", code)
            for ws in sockets:
                await _close(ws, CLOSE_GONE, "this room has expired")

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
        async with self._lock(code):
            room = await self._room(code)
            player = room.find_by_session(session)
            if player is None:
                raise BadSession(f"that session is not a player in room {code}")
            _require_admin(player)
            async with pool.acquire() as conn:
                await conn.execute("delete from rooms where id = $1", room.id)
            sockets = self._forget(room)
            log.info("room %s deleted by %s", code, player.display_name)
        for ws in sockets:
            await _close(ws, CLOSE_GONE, "the host removed this room")

    # --- Broadcasting ---------------------------------------------------------------

    def _room_updated(self, room: Room, exclude: UUID | None = None) -> Broadcast:
        """Snapshot ``room_updated`` and its recipients. Call with the room lock held.

        Join, leave, connect, disconnect, promote, kick, status change, ``ready`` -- and
        the start of a splash, which has no frame of its own because the ``RoomView`` in
        here says everything a client needs: the phase, the round, and when it ends. The
        ready check's countdown is that ``next_at``, so it travels in the same frame.
        """
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
            # A ready player coming back can be the last one a splash was waiting on.
            _recount_splash(room)
            question = room.open_question()
            answered = question.answers.get(player.id) if question is not None else None
            # ``room.view()`` carries the round, so a socket arriving during a splash
            # gets the same phase, round and ``next_at`` a live one was broadcast.
            segment = room.current_segment
            open_view = (
                question.view(room.total, player.id, segment)
                if question is not None and segment is not None
                else None
            )
            welcome = Welcome(
                room=room.view(),
                you=player.view(),
                players=room.player_views(),
                question=open_view,
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
            # Somebody leaving lowers the threshold rather than stalling the splash.
            _recount_splash(room)
            update = self._room_updated(room)
        await self._broadcast(update)

    # --- HTTP-driven mutations -----------------------------------------------------

    async def create(
        self,
        display_name: str,
        settings: RoomSettings,
        custom_questions: Sequence[dict[str, Any]],
        creator_ip: str | None,
        avatar: int | None = None,
    ) -> tuple[Room, Player, str]:
        """Insert the room, its fixed question set and its admin, in one transaction.

        ``custom_questions`` are the creator's own: stored ``source: room``, ``mode:
        custom``, with the creator as their author, each placed as a random event. The HTTP
        body has already checked them and how many there are; they are checked again here
        for callers that did not come through it, before anything is written.

        Returns the room, the admin player and their plaintext session token, once.
        """
        # First, before the pool is even touched: a bad name leaves no room behind.
        name = normalize_name(display_name)
        self.check_avatar(avatar)
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
            rounds = selection.select(self.packs, own, settings, self.rng)
        except selection.TooManyEvents as exc:
            raise BadSettings(str(exc)) from None
        questions = selection.flatten(rounds)
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
                            "insert into rooms (code, status, settings, creator_ip, expires_at)"
                            " values ($1, 'lobby', $2, $3, $4)"
                            " returning id, code, status, settings, current_index,"
                            " created_at, expires_at",
                            code,
                            settings.model_dump(),
                            parse_ip(creator_ip),
                            expires_at,
                        )
                except asyncpg.UniqueViolationError:
                    return False
                return True

            await codes.allocate(self.words, self.rng, try_insert)
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
                " returning id, display_name, avatar, role, joined_at, session_token_hash",
                room_row["id"],
                name,
                hash_token(session),
                avatar,
            )
            assert player_row is not None
            await conn.executemany(
                "insert into questions (room_id, position, question_id, type, mode, source,"
                " payload, host_only, round, random_event, author_player_id)"
                " values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
                _question_rows(room_row["id"], questions, player_row["id"]),
            )
            # Read them back so a freshly created room holds exactly what a rehydrated
            # one would, ids included.
            inserted = await _fetch_questions(conn, room_row["id"])
        code = room_row["code"]
        player = _player_from_row(player_row)
        room = _room_from_row(room_row, total=len(inserted), lock=self._lock(code))
        room.questions = inserted
        # Before ``setdefault``: the copy that lands in ``self.rooms`` is never re-read,
        # so a room cached without its admin would reject the host's own ``hello``.
        room.players[player.id] = player
        async with room.lock:
            # A ``get`` racing the commit may have loaded it first; that copy wins, and
            # it read the admin back from the same committed row.
            room = self.rooms.setdefault(code, room)
            player = room.players.get(player.id, player)
        return room, player, session

    async def join(
        self, code: str, display_name: str, avatar: int | None = None
    ) -> tuple[Player, str]:
        """Add a player to a joinable room. Returns the player and their session token, once.

        Connected sockets learn about the newcomer through ``room_updated``.
        """
        code = code.upper()
        name = normalize_name(display_name)
        self.check_avatar(avatar)
        session = new_token()
        pool = await self._pool()
        async with self._lock(code):
            room = await self._room(code)
            if room.status not in ("lobby", "playing"):
                raise NotOpen(f"room {code} has finished")
            if len(room.players) >= room.max_players:
                raise RoomFull(f"room {code} is full")
            async with pool.acquire() as conn, conn.transaction():
                try:
                    row = await conn.fetchrow(
                        "insert into players (room_id, display_name, session_token_hash, avatar)"
                        " values ($1, $2, $3, $4)"
                        " returning id, display_name, avatar, role, joined_at, session_token_hash",
                        room.id,
                        name,
                        hash_token(session),
                        avatar,
                    )
                except asyncpg.UniqueViolationError:
                    raise NameTaken(f"the name {name!r} is taken in room {code}") from None
            assert row is not None
            player = _player_from_row(row)
            room.players[player.id] = player
            update = self._room_updated(room)
        await self._broadcast(update)
        return player, session

    async def set_profile(
        self, code: str, player: Player, display_name: str | None, avatar: int | None
    ) -> None:
        """Rename, re-roll the head, or both (D4, section 5.1.1 of ideas/design.md).

        Held to exactly what a join is: the same name rules, the same case-insensitive
        uniqueness in the room -- the unique index is what decides, so a rename racing a
        join cannot both win -- and a head from the manifest. A rejected change leaves
        the row and the room exactly as they were. Allowed in any status: standings are
        keyed on the player's id, so a mid-game rename moves no points and no answer.

        Nothing changed is nothing broadcast. Everybody else hears about a real change
        through ``room_updated``, the sender included, like every other command.
        """
        code = code.upper()
        name = normalize_name(display_name) if display_name is not None else None
        self.check_avatar(avatar)
        pool = await self._pool()
        async with self._lock(code):
            room = await self._room(code)
            # The ``Player`` the handler holds is the one in the room, unless the room
            # left memory and came back since; the room's copy is the live one.
            target = room.players.get(player.id)
            if target is None:
                raise BadState("you are no longer in this room")
            new_name = target.display_name if name is None else name
            new_avatar = target.avatar if avatar is None else avatar
            if (new_name, new_avatar) == (target.display_name, target.avatar):
                return
            async with pool.acquire() as conn:
                try:
                    await conn.execute(
                        "update players set display_name = $2, avatar = $3 where id = $1",
                        target.id,
                        new_name,
                        new_avatar,
                    )
                except asyncpg.UniqueViolationError:
                    raise NameTaken(f"the name {new_name!r} is taken in room {code}") from None
            target.display_name = new_name
            target.avatar = new_avatar
            update = self._room_updated(room)
        await self._broadcast(update)

    def check_avatar(self, avatar: int | None) -> None:
        """Refuse a head that is not in the manifest, before anything is written."""
        if avatar is not None and not 0 <= avatar < self.heads:
            raise BadAvatar(f"avatar must be a head id from 0 to {self.heads - 1}")

    async def set_ready(self, code: str, player: Player, is_ready: bool) -> None:
        """Tap ready, or take it back (D7, section 7.1 of ideas/design.md).

        In the lobby it is what the host's Start waits on. On a splash it is what ends the
        splash (``rooms/ready.py``): the threshold starts a countdown, everyone ready
        shortens it, and taking a tap back below the threshold stops it again. The
        countdown rides as ``next_at`` on the same ``room_updated`` that says who is ready.
        A splash allows each player one un-ready; a second is ``bad_state``, so nobody can
        spam the countdown on and off. The lobby's toggle has no limit.

        Anywhere else there is nothing to be ready for. Nothing changed is nothing
        broadcast.
        """
        code = code.upper()
        async with self._lock(code):
            room = await self._room(code)
            target = room.players.get(player.id)
            if target is None:
                raise BadState("you are no longer in this room")
            in_splash = room.status == "playing" and room.phase == "splash"
            if room.status != "lobby" and not in_splash:
                raise BadState("there is nothing to be ready for")
            if target.ready == is_ready:
                return
            if in_splash and not is_ready:
                if target.unreadied:
                    raise BadState("you can only take your ready back once a round")
                target.unreadied = True
            target.ready = is_ready
            _recount_splash(room, unready=not is_ready)
            update = self._room_updated(room)
        await self._broadcast(update)

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
            # "Ready to start" has been answered by starting. The first splash asks again.
            for player in room.players.values():
                player.ready = False
            async with pool.acquire() as conn:
                await conn.execute(
                    "update rooms set status = 'playing', current_index = 0 where id = $1",
                    room.id,
                )
            update = self._room_updated(room)
        await self._broadcast(update)
        self._start_timer(room, 0)

    async def submit_answer(
        self, code: str, player: Player, question_id: str, value: Any
    ) -> tuple[Scoring, int | None]:
        """Store one answer and return how the question is scored and its band there.

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
            # The question's own length, not the room's setting: a mode that caps itself
            # at ten seconds must score on ten seconds, or every answer to it lands in
            # the fastest bucket of a room set to a minute.
            assert question.seconds is not None  # set when the question opened
            how = question.scoring
            band = scoring.band(how, elapsed, question.seconds, question.steps)
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
            question.answers[player.id] = Submitted(value=value, received_at=now, band=band)
            if room.settings.close_when_all_answered and _everyone_answered(room, question):
                room.advance.set()
        return how, band

    async def skip(self, code: str, by: Player) -> None:
        """Admin: cut the splash, the open question or the reveal short (section 3).

        Nothing is broadcast and nothing is awaited here: setting ``advance`` wakes the
        timer task, which owns every state change either way. A skip that arrives while
        the timer is midway through a close finds the phase already ``reveal`` and
        shortens that instead, which is the same thing the admin asked for.
        """
        code = code.upper()
        async with self._lock(code):
            room = await self._room(code)
            _require_admin(by)
            if room.status != "playing" or room.phase not in ("splash", "open", "reveal"):
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
            _recount_splash(room)
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
                    await _void_question(conn, question)
                broadcasts = await self._finish(room, conn)
        for broadcast in broadcasts:
            await self._broadcast(broadcast)

    # --- The timer task --------------------------------------------------------------

    def _start_timer(self, room: Room, index: int, resume_at: datetime | None = None) -> None:
        """Hand the room to its one timer task, starting at ``index``.

        ``start_game`` calls this with the lock released, right after its own broadcast,
        so the first thing the task does cannot overtake it. T11's ``_recover`` calls it
        under the lock instead, passing the ``resume_at`` that starts the task in a reveal
        rather than on an open: there is nothing to overtake in a room that has no sockets
        yet, and the task's first move is to sleep anyway.
        """
        if self.rooms.get(room.code) is not room or room.status != "playing":
            return
        room.timer = asyncio.create_task(
            self._run_questions(room, index, resume_at), name=f"room-{room.code}-timer"
        )

    async def _run_questions(
        self, room: Room, index: int, resume_at: datetime | None = None
    ) -> None:
        """The one task per room: open → close → reveal → next, until the game ends.

        Every step takes the room lock again and re-checks that this room is still the
        live one and still playing, so a game that ends underneath the task (``end_game``,
        eviction) stops it at the next step whether or not the cancellation lands first.

        ``resume_at`` (T11) enters the loop one step in, in a reveal that ends then, and
        ``index`` is the question that reveal belongs to rather than one to open. It
        rejoins at the top of the loop, so a recovered room that owes the first question
        of a round introduces that round again before opening it.
        """
        try:
            if resume_at is not None:
                await self._sleep_until(room, resume_at)
                following = await self._advance(room, index)
                if following is None:
                    return
                index = following
            while True:
                if not await self._splash(room, index):
                    return
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

    async def _splash(self, room: Room, index: int) -> bool:
        """Introduce the round ``index`` starts, if it starts one. False: the room is gone.

        The splash introduces a *mode*, not a round: a game whose rounds are all the same
        mode gets one card at the start rather than the same card between every round.
        Nothing is written to the database -- ``current_index`` was persisted by
        ``start_game`` or ``_advance`` before this ran, and ``phase`` has never been a
        column, so a restart mid-splash is a restart before a question that never opened,
        which ``_recover`` already knows how to resume.
        """
        async with room.lock:
            if self.rooms.get(room.code) is not room or room.status != "playing":
                return False
            segment = room.segment_at(index)
            previous = room.segment_at(index - 1) if index > 0 else None
            introduces_a_mode = segment is not None and (
                previous is None or previous.mode != segment.mode
            )
            if (
                room.settings.splash_seconds <= 0
                or segment is None
                or segment.start != index
                or not introduces_a_mode
            ):
                return True
            room.current_index = index
            room.phase = "splash"
            # No clock: the splash waits for the room (``rooms/ready.py``) or the host.
            room.next_at = None
            room.advance.clear()
            # Each splash is its own ready check: being ready for the last round is not
            # being ready for this one.
            for player in room.players.values():
                player.ready = False
                player.unreadied = False
            update = self._room_updated(room)
        await self._broadcast(update)
        await self._sleep_through_splash(room)
        return True

    async def _sleep_through_splash(self, room: Room) -> None:
        """Wait out a splash, which ends when the room is ready rather than on a clock.

        ``next_at`` is ``None`` until the ready check starts a countdown, and it can be
        started, shortened or stopped while this sleeps: each change sets
        ``rescheduled``, and this wakes, reads the new time and sleeps again. ``skip``
        sets ``advance`` and ends it at once, as it ends any other sleep. Reading
        ``next_at`` and clearing ``rescheduled`` happen with no await between them, so a
        change is never lost between the read and the wait.
        """
        while True:
            target = room.next_at
            room.rescheduled.clear()
            if room.phase != "splash" or room.advance.is_set():
                return
            if target is None:
                await _wait_for_either(room.advance, room.rescheduled, None)
                continue
            delay = (target - datetime.now(UTC)).total_seconds()
            if delay <= 0:
                return
            await _wait_for_either(room.advance, room.rescheduled, delay)

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
            question.seconds = room.question_seconds(question.mode)
            question.ends_at = now + timedelta(seconds=question.seconds)
            room.current_index = index
            room.phase = "open"
            room.next_at = None
            room.advance.clear()
            async with pool.acquire() as conn:
                await conn.execute(
                    "update questions set shown_at = $1 where id = $2", now, question.id
                )
            segment = room.segment_at(index)
            assert segment is not None  # every question belongs to a round
            opened = Broadcast.per_player(
                room,
                lambda pid: QuestionOpen(
                    question=question.view(room.total, pid, segment)
                ).model_dump(mode="json"),
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
            credit = module.grade(
                question.payload,
                [Submission(pid, answer.value) for pid, answer in question.answers.items()],
            )
            how = question.scoring
            for pid, answer in question.answers.items():
                answer.credit = credit.get(pid, 0.0)
                # Full marks only. Three of five in the right order scores, and is not
                # "correct" for the standings tie-break (section 6).
                answer.correct = answer.credit >= 1.0
                answer.points = scoring.points_for(how, answer.credit, answer.band, question.steps)
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
                        credit=answer.credit or 0.0,
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


def _rows_affected(status: str) -> int:
    """The row count out of an asyncpg command tag, which for a delete is ``DELETE 3``."""
    _, _, count = status.rpartition(" ")
    return int(count) if count.isdigit() else 0


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


def _recount_splash(room: Room, unready: bool = False) -> None:
    """Start, shorten or stop a splash's countdown to match who is ready. Lock held.

    A no-op outside a splash. Eligible is every connected player who can answer the
    round's first question (``current_index`` points at it during a splash), and only
    their taps count: a player who cannot answer may tap, but holds nobody up either way.

    Only an un-ready (``unready``) stops a running countdown; a connect, a disconnect or a
    kick can start or shorten one but never stop it (``rooms/ready.py`` says why). Any
    change sets ``rescheduled``, so the timer task sleeps to the new ``next_at``.
    """
    if room.status != "playing" or room.phase != "splash":
        return
    question = room.current
    if question is None:
        return
    eligible = [pid for pid in room.sockets if question.can_answer(pid)]
    tapped = sum(1 for pid in eligible if room.players[pid].ready)
    target = ready.countdown(room.next_at, datetime.now(UTC), len(eligible), tapped)
    if target is None and not unready:
        return
    if target != room.next_at:
        room.next_at = target
        room.rescheduled.set()


async def _wait_for_either(
    first: asyncio.Event, second: asyncio.Event, delay: float | None
) -> None:
    """Wait up to ``delay`` seconds (``None``: for ever) for either event to be set."""
    waiters = [asyncio.ensure_future(first.wait()), asyncio.ensure_future(second.wait())]
    try:
        await asyncio.wait(waiters, timeout=delay, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for waiter in waiters:
            waiter.cancel()


def _stop_timer(room: Room) -> None:
    """Cancel the room's timer task, if it has one, without waiting for it.

    Never awaited here: the task may be blocked on the room lock, which the caller
    usually holds. It takes the cancellation at that await, and every step it could
    still run re-checks that the room is live and playing before it changes anything.
    """
    timer, room.timer = room.timer, None
    if timer is not None and timer is not asyncio.current_task():
        timer.cancel()


async def _void_question(conn: asyncpg.Connection, question: RoomQuestion) -> None:
    """``open → voided`` (section 4): close a question now and grade nothing.

    Both ways in are a question nobody gets to score: ``end_game``, and a restart that
    found it open (T11). Answers already in the table stay exactly as they arrived, with
    ``correct`` and ``points`` null, which is what ``_fetch_totals`` sums as nothing.
    """
    question.closed_at = datetime.now(UTC)
    question.voided = True
    await conn.execute(
        "update questions set closed_at = $1, voided = true where id = $2",
        question.closed_at,
        question.id,
    )


async def _fetch_questions(conn: asyncpg.Connection, room_id: UUID) -> list[RoomQuestion]:
    rows = await conn.fetch(
        "select id, position, question_id, type, mode, source, payload, host_only, round,"
        " random_event, author_player_id, shown_at, closed_at, voided"
        " from questions where room_id = $1 order by position",
        room_id,
    )
    return [
        RoomQuestion(
            id=row["id"],
            position=row["position"],
            question_id=row["question_id"],
            type=row["type"],
            mode=row["mode"],
            source=row["source"],
            payload=row["payload"]["payload"],
            host_only=row["host_only"],
            round=row["round"],
            random_event=row["random_event"],
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
