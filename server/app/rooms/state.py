"""The room-state module: everything that mutates a room goes through ``RoomManager``.

Rooms live in memory, one ``Room`` per code, loaded from Postgres on first use
(rehydrate) and shared by the HTTP handlers and every websocket in the room. Each room
has one ``asyncio.Lock``; every public method acquires it around its reads and writes of
the room and the matching database transaction. Nothing here awaits a socket: each one has
an ``Outbox`` (``ws/outbox.py``), a mutation snapshots the message and the sockets it goes
to under the lock (``Broadcast``) and queues it on each, and the outbox's own task does the
sending. One stalled client cannot hold up the room, and a socket whose queue overflows or
whose send times out is closed and detached like a disconnect.

The game loop (T9) is one ``asyncio.Task`` per room, ``Room.timer``, running
``_run_questions``: open a question, sleep until it closes, close and grade it, sleep
through the reveal, move on. Nothing else drives time. ``skip`` and an early close on
all-answered cut a sleep short through ``Room.advance``, an ``asyncio.Event``, never by
cancelling the task; every sleep is computed from its deadline on the manager's monotonic
clock, so a late wakeup closes immediately instead of drifting and a wall clock that jumps
moves nothing. Wall-clock times are for the wire and the database. The task takes the same
room lock as everything else and, like everything else, sends nothing while holding it.

A step that raises (a database blip, a type's ``grade``) takes the room out of memory as a
process restart would, and the next player to reconnect brings it back through the
recovery below.
Every step writes to the database before it changes memory, so whatever the failure left
behind, the database holds a state recovery knows how to resume.

Between two rounds the loop holds the room in ``standings`` (D9) for
``standings_seconds``: the reveal of a round's last question gives way to it, and it gives
way to the next round's splash or first question. It is only ever between rounds. The
game's last question goes straight to ``finished``, whose final standings are the same
picture, and a question inside a round never stops for one.

Scoring (T10, T17) is ``rooms/scoring.py``. An answer's band -- its speed bucket, or its
step -- is fixed when it arrives; at the close the type's ``grade`` gives credit, and
``points_for`` pays out on the two. The answers table is the source of truth for
standings: close writes ``correct`` and ``points``, then re-reads ``sum(points)`` per
player into ``Room.totals``. Nothing adds to a running total in memory.

Restart recovery (T11) is the rest of the rehydrate: ``_load`` brings back the room, its
players, its questions and the standings sum, and ``_recover`` voids whatever question was
open when the process died, puts the room in ``reveal`` and hands it to a timer task that
starts there, so a crash costs one question and nobody is asked another one on arrival.
Loading is on any lookup, but recovery waits for the first player whose socket
authenticates: a room nobody has come back to stays still.

Token flow (section 7 of ideas/architecture.md): a session token is
``secrets.token_urlsafe(32)`` and only its sha256 hex is stored. The plaintext is
returned to its owner exactly once, by ``create`` or ``join``, and never logged. There
is no second kind of token: a room's creator is its first admin, and further admins are
made with ``promote``.
"""

import asyncio
import hashlib
import hmac
import logging
import math
import random
import re
import secrets
import time
import unicodedata
from collections.abc import AsyncIterator, Awaitable, Callable, Collection, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import asyncpg
from starlette.websockets import WebSocket

from app.config import APP_VERSION, Settings
from app.errors import ApiError
from app.questions import custom
from app.questions.packs import Pack
from app.questions.schema import QuestionError
from app.questions.submission import Submission
from app.questions.types import TYPES, scoring_of, steps_of
from app.questions.types.scoring import Scoring
from app.rooms import codes, ready, scoring, segments, selection
from app.rooms.settings import RoomSettings
from app.stats import Metric, bump, joined
from app.ws.outbox import Outbox
from app.ws.protocol import (
    AnswerCount,
    GameFinished,
    OpenQuestion,
    PlayerResult,
    PlayersUpdated,
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
# Letters only, from the Latin blocks whose accented letters a player could type:
# names are read aloud and compared by eye, and every other script has letters that look
# like these. ``names.ts`` holds the same ranges.
_LATIN_LETTERS = (
    ("A", "Z"),
    ("a", "z"),
    ("\u00c0", "\u00d6"),
    ("\u00d8", "\u00f6"),
    ("\u00f8", "\u024f"),
    ("\u1e00", "\u1eff"),
)
_NAME_MARKS = frozenset("0123456789 _-")
_SPACES = re.compile(" {2,}")
# Seconds between one player's lobby ready changes, and between their profile changes.
CHANGE_COOLDOWN = 1.0
# Seconds an ``editing`` flag lasts without being sent again. A tab that froze or lost its
# socket half-way would otherwise leave "picking a name…" up for the rest of the lobby.
EDITING_SECONDS = 60.0
# Seconds a random event's NPC holds the floor before the buttons appear. Fixed rather than
# a room setting: the client's interlude is timed to it, the prompt typing in at a set pace
# and finishing just before the answers (section 12 of ideas/design.md).
RANDOM_EVENT_HOLD = 3.5
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
# Envelope keys that have their own column in ``questions``; the rest is the payload jsonb.
# ``random_event`` is the NPC asking it: the envelope's own for an NPC's question or a host's
# that names one, a face ``selection`` draws for the rest, and a column either way.
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
    """NFKC, trimmed, spaces collapsed, then 1-24 of Latin letters, digits, space, _ and -."""
    name = _SPACES.sub(" ", unicodedata.normalize("NFKC", raw).strip())
    if not 1 <= len(name) <= NAME_MAX:
        raise BadName(f"display name must be 1 to {NAME_MAX} characters")
    if not all(ch in _NAME_MARKS or _is_latin_letter(ch) for ch in name):
        raise BadName("Only letters, digits, spaces, _ and - in a name.")
    return name


def _is_latin_letter(ch: str) -> bool:
    return any(low <= ch <= high for low, high in _LATIN_LETTERS)


# Credit summed from fractions misses its target by a few ulps: ten tenths are
# 0.9999999999999999, which would not be "correct".
_CREDIT_DIGITS = 9


def settle_credit(type_id: str, raw: object) -> float:
    """One player's credit from ``grade``, rounded and held to 0..1; a bad one is logged."""
    # A type's bug should cost its player the question, not everyone: ``points_for``
    # raising would fail the whole close, and the restart voids the question for all.
    if isinstance(raw, bool) or not isinstance(raw, int | float):
        log.error("%s graded %r, which is not a number: counted as 0", type_id, raw)
        return 0.0
    if isinstance(raw, float) and math.isnan(raw):
        log.error("%s graded NaN: counted as 0", type_id)
        return 0.0
    credit = round(raw, _CREDIT_DIGITS)
    if not 0 <= credit <= 1:
        log.error("%s graded %r, outside 0..1: clamped", type_id, raw)
        credit = min(max(credit, 0), 1)
    # ``+ 0.0`` turns a rounded -1e-12 into 0.0 rather than -0.0.
    return float(credit) + 0.0


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
    # countdown over and over. The lobby has ``CHANGE_COOLDOWN`` instead.
    unreadied: bool = False
    # When this player last changed their lobby ready or their profile, on the manager's
    # monotonic clock. Each change is a broadcast to every socket in the room.
    ready_changed_at: float = field(default=-math.inf, repr=False)
    profile_changed_at: float = field(default=-math.inf, repr=False)
    # Has the name field focused in the lobby. In memory only, like ``ready``, and advice only:
    # it holds up neither the ready check nor Start.
    editing: bool = False
    editing_changed_at: float = field(default=-math.inf, repr=False)
    # Clears ``editing`` once it has gone ``EDITING_SECONDS`` without being sent again.
    editing_expiry: asyncio.Task[None] | None = field(default=None, repr=False)

    def view(self) -> PlayerView:
        return PlayerView(
            id=self.id,
            display_name=self.display_name,
            avatar=self.avatar,
            role=self.role,  # type: ignore[arg-type]  # the column's check constraint
            connected=self.connected,
            ready=self.ready,
            editing=self.editing,
        )

    def stop_editing(self) -> bool:
        """Clear ``editing`` and its expiry. ``True`` if it was on."""
        if self.editing_expiry is not None:
            self.editing_expiry.cancel()
            self.editing_expiry = None
        was, self.editing = self.editing, False
        return was


@dataclass(slots=True)
class Submitted:
    """One player's answer to one question, in memory.

    ``band`` is fixed at receive time from ``received_at - answerable_at`` (section 6); the
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

    ``content_id`` is the ``questions.question_id`` column and never leaves the server: it
    hashes the payload, answer included, so a client could hash each candidate answer
    until one matched. The wire names a question by ``id`` instead.

    ``seconds``, ``answerable_at`` and ``ends_at`` are not columns either: they are
    recomputed whenever the question opens, from the setting its own mode carries, and
    ``ends_at`` is what the timer and the clients count down to. ``seconds`` is also what
    the speed bucket is a fraction of, so a ten-second mode scores on ten seconds in a
    room whose other rounds run to a minute.

    ``answerable_at`` is when answers are taken from, and so when ``seconds`` starts. It is
    ``shown_at`` for every question but a random event, where the NPC holds the floor with
    the question for ``RANDOM_EVENT_HOLD`` before the buttons appear. Deriving it rather
    than storing it is what leaves rehydrate as it was: a question that was open at a
    restart is voided either way, so nothing ever needs it back from the database.

    ``answerable_mono`` and ``ends_mono`` are those two moments on the manager's monotonic
    clock. An answer is timed and cut off against them and the timer sleeps to them, so a
    wall clock that jumps mid-question moves neither a bucket nor the close; the wall-clock
    pair is what the clients count down to.

    ``type`` and ``mode`` are both columns, and neither is derived from the other: the
    type is how the question is answered and graded, the mode is the round it was drawn
    for and where its ``seconds`` come from.

    ``random_event`` is the NPC interrupting ``round`` with this question, or ``None`` for
    a question that belongs to its round. An event's ``mode`` is its own and its ``round``
    is the one it interrupts; ``segments.py`` reads the pair.
    """

    id: UUID
    position: int
    content_id: str
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
    answerable_at: datetime | None = None
    ends_at: datetime | None = None
    answerable_mono: float | None = None
    ends_mono: float | None = None
    answers: dict[UUID, Submitted] = field(default_factory=dict)

    @property
    def steps(self) -> int | None:
        """How many frames the question shows itself in, for ``STEP`` scoring (section 6).

        Its type says, so the engine never reads a payload. Pixel Hunt's ``pick_from_list``
        payloads will be the only ones with any (Phase 3). Every other question is ``None``,
        which is also what turns ``STEP`` into ``SPEED``.
        """
        return steps_of(self.type, self.payload)

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

    def view(
        self, total: int, player_id: UUID, segment: Segment, count: tuple[int, int] = (0, 0)
    ) -> OpenQuestion:
        """The open question as ``player_id`` sees it. ``count`` is ``_answer_count``'s."""
        assert self.shown_at is not None and self.ends_at is not None
        assert self.answerable_at is not None
        return OpenQuestion(
            question_id=str(self.id),
            index=self.position,
            total=total,
            type=self.type,
            mode=self.mode,
            segment=segment,
            view=TYPES[self.type].client_view(self.payload),
            random_event=self.random_event,
            opened_at=self.shown_at,
            answerable_at=self.answerable_at,
            ends_at=self.ends_at,
            you_can_answer=self.can_answer(player_id),
            answered=count[0],
            of=count[1],
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
    finished_at: datetime | None = None
    players: dict[UUID, Player] = field(default_factory=dict)  # in join order
    sockets: dict[UUID, Outbox] = field(default_factory=dict, repr=False)
    questions: list[RoomQuestion] = field(default_factory=list, repr=False)  # by position
    # Rebuilt from ``sum(answers.points)`` at every close, never added to.
    totals: dict[UUID, Totals] = field(default_factory=dict, repr=False)
    phase: str = "idle"
    # When the current timed phase ends: a splash gives way to its first question, a
    # reveal to the next question or the standings, the standings to the next round.
    # ``None`` while a question is open, and during a splash that is still waiting for the
    # room to be ready.
    next_at: datetime | None = None
    # The same moment on the manager's monotonic clock, and what the timer sleeps to: a
    # wall clock that jumps must not move it. ``next_at`` is for the wire.
    next_mono: float | None = None
    # The one task driving open → closed → reveal → next.
    timer: asyncio.Task[None] | None = field(default=None, repr=False)
    # A ``playing`` room rehydrated but not yet resumed: it waits for a player to come
    # back, so a scanner or link preview asking for the code does not play it unattended.
    awaiting_player: bool = False
    # Set to cut the current sleep short: ``skip``, or everyone has answered.
    advance: asyncio.Event = field(default_factory=asyncio.Event, repr=False)
    # Set when the ready check (D7) starts, shortens or stops a splash's countdown, so the
    # timer task wakes and sleeps to the new ``next_mono`` rather than the old one.
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

    def question_seconds(self, question: RoomQuestion) -> int:
        """How long ``question`` stays open: its round's own setting, or its type's."""
        return self.settings.seconds_for(question.mode, question.type)

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
            finished_at=self.finished_at,
        )

    def gone(self, grace: timedelta, now: datetime) -> bool:
        """Past ``expires_at``, or finished longer ago than ``grace``: cleanup's to delete."""
        return _gone(self.expires_at, self.finished_at, grace, now)

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

    targets: list[tuple[Outbox, dict[str, Any]]]

    @classmethod
    def to_all(cls, room: Room, message: dict[str, Any], exclude: UUID | None = None) -> Broadcast:
        return cls([(out, message) for pid, out in room.sockets.items() if pid != exclude])

    @classmethod
    def per_player(cls, room: Room, build: Callable[[UUID], dict[str, Any]]) -> Broadcast:
        return cls([(out, build(pid)) for pid, out in room.sockets.items()])


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
        settings=RoomSettings.stored(row["settings"]),
        current_index=row["current_index"],
        total=total,
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        lock=lock,
        finished_at=row["finished_at"],
    )


def _question_rows(
    room_id: UUID,
    questions: Sequence[tuple[int, dict[str, Any]]],
    author: UUID,
    authored: Collection[str],
) -> list[tuple[Any, ...]]:
    """Rows for ``selection.flatten``'s ``(round, question)`` pairs, position by position.

    ``author`` is the room's creator, and it is written against the questions they wrote
    -- the content ids in ``authored`` -- and nothing else. That column is what keeps them
    from scoring on their own questions (``RoomQuestion.can_answer``). It goes by where a
    question came from rather than by the ``source`` it carries, so a claim in the
    envelope can never be what decides who the author is.
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
            author if q["id"] in authored else None,
        )
        for position, (round_, q) in enumerate(questions)
    ]


@dataclass(slots=True)
class _Slot:
    """A code's room lock, and how many callers hold or wait on it."""

    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    users: int = 0


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
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._pool = pool
        self.packs = packs
        self.settings = settings
        self.words = words
        # The length of ``data/heads/heads.json``: every valid ``avatar`` is below it.
        self.heads = heads
        self.rng = rng or random.Random()
        # Codes from the OS, not ``rng``: Mersenne Twister's next draw can be worked out
        # from enough of its past ones, and a code is only as private as its successors.
        self.code_rng: random.Random = secrets.SystemRandom()
        self.clock = clock
        self.editing_seconds = EDITING_SECONDS
        self.rooms: dict[str, Room] = {}
        # A room in memory shares its code's lock. The entry outlives the room while
        # anyone holds or waits on it, so an eviction and a rehydrate of the same code
        # serialise with whatever else holds the room, and no longer than that: anyone
        # can ask for any code, so an entry kept for every code asked would never shrink.
        self._locks: dict[str, _Slot] = {}

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
                "select id, display_name, avatar, role, joined_at, session_token_hash from players"
                " where room_id = $1 order by joined_at, id",
                row["id"],
            )
            totals = await _fetch_totals(conn, row["id"])
        room = _room_from_row(row, total=len(questions), lock=self._locks[code].lock)
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
                await _count_round_finished(conn, room, question.position)
            question.closed_at, question.voided = closed_at, True
            log.warning(
                "room %s: question %d was open at the restart, voided", room.code, question.position
            )
        room.phase = "reveal"
        room.next_at = datetime.now(UTC) + timedelta(seconds=room.settings.reveal_seconds)
        room.next_mono = self.clock() + room.settings.reveal_seconds
        log.info(
            "room %s resumes in reveal until %s, then question %d",
            room.code,
            room.next_at.isoformat(),
            resume_from + 1,
        )
        self._start_timer(room, resume_from, resume_at=room.next_mono)

    def _forget(self, room: Room) -> list[Outbox]:
        """Take a room out of memory and detach its sockets, returning them to close.

        Call with the room lock held.
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
        async with self._locked(code):
            room = self.rooms.get(code)
            if room is None:
                return False
            sockets = self._forget(room)
        for outbox in sockets:
            outbox.close(CLOSE_RESTART, "room restarted, reconnect")
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
            outbox.close(CLOSE_RESTART, "room restarted, reconnect")

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
                    await conn.execute("delete from rooms where id = any($1)", ids)
                    if abandoned:
                        await bump(conn, Metric.GAMES_ABANDONED, by=abandoned)
                    for row in rounds:
                        await bump(conn, Metric.ROUNDS_ABANDONED, row["mode"], row["n"])
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
                outbox.close(CLOSE_GONE, "this room has expired")

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
                    if (cut_short := _round_under_way(room)) is not None:
                        await bump(conn, Metric.ROUNDS_ABANDONED, cut_short.mode)
            sockets = self._forget(room)
            log.info("room %s deleted by %s", code, player.display_name)
        for outbox in sockets:
            outbox.close(CLOSE_GONE, "the host removed this room")

    # --- Broadcasting ---------------------------------------------------------------

    def _room_updated(self, room: Room, exclude: UUID | None = None) -> Broadcast:
        """Snapshot ``room_updated`` and its recipients. Call with the room lock held.

        Join, leave, promote, kick, status change, ``set_profile`` -- and the start of a
        splash, which has no frame of its own because the ``RoomView`` in here says
        everything a client needs: the phase, the round, and when it ends. The ready
        check's countdown is that ``next_at``, so it travels in the same frame.
        """
        message = RoomUpdated(room=room.view(), players=room.player_views())
        return Broadcast.to_all(room, message.model_dump(mode="json"), exclude)

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
                question.view(room.total, player.id, segment, _answer_count(room, question))
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
                server_version=APP_VERSION,
            ).model_dump(mode="json")
            # Queued under the lock, so no later broadcast can reach this socket first.
            outbox.put(welcome)
            if previous is not None:
                # Behind whatever it still had queued, so nothing it was owed is cut off.
                previous.close(CLOSE_REPLACED, "connected from another device")
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

    # --- HTTP-driven mutations -----------------------------------------------------

    async def create(
        self,
        display_name: str,
        settings: RoomSettings,
        custom_questions: Sequence[dict[str, Any]],
        avatar: int | None = None,
        returning: bool = False,
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
                            "insert into rooms (code, status, settings, expires_at)"
                            " values ($1, 'lobby', $2, $3)"
                            " returning id, code, status, settings, current_index,"
                            " created_at, expires_at, finished_at",
                            code,
                            settings.model_dump(),
                            expires_at,
                        )
                except asyncpg.UniqueViolationError:
                    return False
                return True

            await codes.allocate(self.words, self.code_rng, try_insert)
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
            await bump(conn, Metric.ROOMS_CREATED)
            await joined(conn, returning)
            await conn.executemany(
                "insert into questions (room_id, position, question_id, type, mode, source,"
                " payload, host_only, round, random_event, author_player_id)"
                " values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
                _question_rows(room_row["id"], questions, player_row["id"], {q["id"] for q in own}),
            )
            # Read them back so a freshly created room holds exactly what a rehydrated
            # one would, ids included.
            inserted = await _fetch_questions(conn, room_row["id"])
        code = room_row["code"]
        player = _player_from_row(player_row)
        async with self._locked(code) as lock:
            room = _room_from_row(room_row, total=len(inserted), lock=lock)
            room.questions = inserted
            # Before ``setdefault``: the copy that lands in ``self.rooms`` is never re-read,
            # so a room cached without its admin would reject the host's own ``hello``.
            room.players[player.id] = player
            # A ``get`` racing the commit may have loaded it first; that copy wins, and
            # it read the admin back from the same committed row.
            room = self.rooms.setdefault(code, room)
            player = room.players.get(player.id, player)
        return room, player, session

    async def join(
        self, code: str, display_name: str, avatar: int | None = None, returning: bool = False
    ) -> tuple[Player, str]:
        """Add a player to a room in its lobby. Returns the player and their session token, once.

        Connected sockets learn about the newcomer through ``room_updated``.
        """
        code = code.upper()
        name = normalize_name(display_name)
        self.check_avatar(avatar)
        session = new_token()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            # A player who is already in comes back through ``connect`` with their
            # session; a join is a new player, and a game under way is too late for one.
            if room.status == "playing":
                raise NotOpen(f"the game in room {code} has already started")
            if room.status != "lobby":
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
                await joined(conn, returning)
            assert row is not None
            player = _player_from_row(row)
            room.players[player.id] = player
            update = self._room_updated(room)
        self._broadcast(update)
        return player, session

    async def set_profile(
        self, code: str, player: Player, display_name: str | None, avatar: int | None
    ) -> None:
        """Rename, re-roll the head, or both (D4, section 5.1.1 of ideas/design.md).

        Held to exactly what a join is: the same name rules, the same case-insensitive
        uniqueness in the room -- the unique index is what decides, so a rename racing a
        join cannot both win -- and a head from the manifest. A rejected change leaves
        the row and the room exactly as they were. Only in the lobby: a name that changes
        mid-game leaves the others unsure who is ahead of them. A change within
        ``CHANGE_COOLDOWN`` of the last one is ``bad_state``. A rename lands with the
        player's ``editing`` already off.

        Nothing changed is nothing broadcast. Everybody else hears about a real change
        through ``room_updated``, the sender included, like every other command.
        """
        code = code.upper()
        name = normalize_name(display_name) if display_name is not None else None
        self.check_avatar(avatar)
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            # The ``Player`` the handler holds is the one in the room, unless the room
            # left memory and came back since; the room's copy is the live one.
            target = room.players.get(player.id)
            if target is None:
                raise BadState("you are no longer in this room")
            if room.status != "lobby":
                raise BadState("names are fixed once the game has started")
            new_name = target.display_name if name is None else name
            new_avatar = target.avatar if avatar is None else avatar
            if (new_name, new_avatar) == (target.display_name, target.avatar):
                return
            now = self.clock()
            _cool_down(target.profile_changed_at, now)
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
            target.profile_changed_at = now
            target.stop_editing()
            update = self._room_updated(room)
        self._broadcast(update)

    def check_avatar(self, avatar: int | None) -> None:
        """Refuse a head that is not in the manifest, before anything is written."""
        if avatar is not None and not 0 <= avatar < self.heads:
            raise BadAvatar(f"avatar must be a head id from 0 to {self.heads - 1}")

    async def set_ready(self, code: str, player: Player, is_ready: bool) -> None:
        """Tap ready, or take it back (D7, section 7.1 of ideas/design.md).

        In the lobby it is what the host's Start waits on. On a splash it is what ends the
        splash (``rooms/ready.py``): the threshold starts a countdown, everyone ready
        shortens it, and taking a tap back below the threshold stops it again. The
        countdown rides as ``next_at`` on the same frame that says who is ready.
        A splash allows each player one un-ready; a second is ``bad_state``, so nobody can
        spam the countdown on and off. In the lobby, a change within ``CHANGE_COOLDOWN``
        of the last one is ``bad_state``.

        Anywhere else there is nothing to be ready for. Nothing changed is nothing
        broadcast.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            target = room.players.get(player.id)
            if target is None:
                raise BadState("you are no longer in this room")
            in_splash = room.status == "playing" and room.phase == "splash"
            if room.status != "lobby" and not in_splash:
                raise BadState("there is nothing to be ready for")
            if target.ready == is_ready:
                return
            before = room.view()
            if in_splash and not is_ready:
                if target.unreadied:
                    raise BadState("you can only take your ready back once a round")
                target.unreadied = True
            if not in_splash:
                now = self.clock()
                _cool_down(target.ready_changed_at, now)
                target.ready_changed_at = now
            target.ready = is_ready
            _recount_splash(room, self.clock(), unready=not is_ready)
            update = self._players_updated(room, before)
        self._broadcast(update)

    async def set_editing(self, code: str, player: Player, on: bool) -> None:
        """Say the player is in the name field in the lobby, or has left it.

        Advice for the others, never a gate. An ``on`` for a flag that is already on only
        restarts its ``EDITING_SECONDS``. A change is broadcast; spam is held to two a
        second by ignoring an ``on`` within ``CHANGE_COOLDOWN`` of the last change, while
        an ``off`` always lands so a flag never outlives the focus. Outside the lobby it is
        ignored rather than refused: the client sends it on its own, not on a tap.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            target = room.players.get(player.id)
            if target is None:
                raise BadState("you are no longer in this room")
            now = self.clock()
            if not on:
                if not target.stop_editing():
                    return
            elif room.status != "lobby":
                return
            elif target.editing:
                self._expire_editing_later(room, target)
                return
            elif now - target.editing_changed_at < CHANGE_COOLDOWN:
                return
            else:
                target.editing = True
                self._expire_editing_later(room, target)
            target.editing_changed_at = now
            update = self._players_updated(room, room.view())
        self._broadcast(update)

    def _expire_editing_later(self, room: Room, player: Player) -> None:
        """(Re)start the countdown that clears ``player.editing``. Lock held."""
        if player.editing_expiry is not None:
            player.editing_expiry.cancel()
        player.editing_expiry = asyncio.create_task(self._expire_editing(room, player))

    async def _expire_editing(self, room: Room, player: Player) -> None:
        await asyncio.sleep(self.editing_seconds)
        async with room.lock:
            # A kick or the room leaving memory keeps the task going but drops the player.
            if self.rooms.get(room.code) is not room or room.players.get(player.id) is not player:
                return
            player.editing_expiry = None
            player.editing = False
            update = self._players_updated(room, room.view())
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
            if not room.sockets:
                raise BadState("nobody is connected to play")
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
                await bump(conn, Metric.GAMES_STARTED)
            room.status = "playing"
            room.expires_at = expires_at
            room.current_index = 0
            # "Ready to start" has been answered by starting. The first splash asks again.
            for player in room.players.values():
                player.ready = False
                player.stop_editing()
            update = self._room_updated(room)
        self._broadcast(update)
        self._start_timer(room, 0)

    async def submit_answer(
        self, code: str, player: Player, question_id: str, value: Any
    ) -> tuple[Scoring, int | None, tuple[int, int]]:
        """Store one answer and return how the question is scored, its band there, and
        the room's answer count with it in.

        Everyone else hears the new count as ``answer_count`` (D8), broadcast from here;
        the answerer is left out of it, since the handler's ``answer_ack`` carries it.

        The row is committed before this returns and the handler sends ``answer_ack``
        only after it returns, so an acknowledged answer is an answer that survived the
        process. Nothing here is batched or deferred.

        An answer is timed when it arrives, before it queues for the room lock behind
        other answers' writes, so a pile-up at the buzzer costs nobody a bucket. It counts
        from ``answerable_at`` up to, not including, ``ends_at``, and a close that runs late
        gives nobody extra time. A random event is on screen before it takes answers, and
        one that arrives early is ``not_open``, so a client that draws its buttons ahead of
        time gets nothing for it. Elapsed time runs from there, so the NPC's two seconds
        cost nobody a speed bucket.
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
            if not question.can_answer(player.id):
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
            band = scoring.band(how, elapsed, question.seconds, question.steps)
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
            counted = AnswerCount(question_id=question_id, answered=count[0], of=count[1])
            others = Broadcast.to_all(room, counted.model_dump(mode="json"), exclude=player.id)
        self._broadcast(others)
        return how, band, count

    async def skip(self, code: str, by: Player, phase: str, index: int) -> None:
        """Admin: cut the splash, the open question, the reveal or the standings short.

        Only if ``phase`` of question ``index`` is still the room's. The second tap of a
        double tap, or a second admin's, lands once the room has moved on, and it must not
        end the phase after the one it meant. It is no error either: what it asked for has
        happened.

        Nothing is broadcast and nothing is awaited here: setting ``advance`` wakes the
        timer task, which owns every state change either way. Each phase clears
        ``advance`` as it starts, so a skip that matched just as the timer moved on by
        itself is spent on the phase it named.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            if room.status == "playing" and (room.phase, room.current_index) == (phase, index):
                room.advance.set()

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
            async with pool.acquire() as conn:
                await conn.execute("update players set role = 'admin' where id = $1", player_id)
            target.role = "admin"
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
            socket.close(CLOSE_KICKED, "removed from the room")
        self._broadcast(update)

    async def end_game(self, code: str, by: Player) -> None:
        """Admin: void whatever is open and finish the game (section 4).

        The voided question keeps its answers but is never graded, so those rows stay at
        ``points = null`` and add nothing to anyone's sum.

        Nothing changes in memory, the timer included, until the transaction commits: an
        end the database refused leaves the game running for the host to end again.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            if room.status != "playing":
                raise BadState(f"room {code} is {room.status}, not playing")
            question = room.open_question()
            voiding = question if question is not None and question.closed_at is None else None
            cut_short = _round_under_way(room)
            closed_at = datetime.now(UTC)
            async with pool.acquire() as conn, conn.transaction():
                if voiding is not None:
                    await _void_question(conn, voiding, closed_at)
                await conn.execute(
                    "update rooms set status = 'finished', finished_at = $2 where id = $1",
                    room.id,
                    closed_at,
                )
                await bump(conn, Metric.GAMES_ENDED_EARLY)
                if cut_short is not None:
                    await bump(conn, Metric.ROUNDS_ENDED_EARLY, cut_short.mode)
            _stop_timer(room)
            if voiding is not None:
                voiding.closed_at, voiding.voided = closed_at, True
            broadcasts = self._finish(room, closed_at)
        for broadcast in broadcasts:
            self._broadcast(broadcast)

    # --- The timer task --------------------------------------------------------------

    def _start_timer(self, room: Room, index: int, resume_at: float | None = None) -> None:
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

    async def _run_questions(self, room: Room, index: int, resume_at: float | None = None) -> None:
        """The one task per room: open → close → reveal → next, until the game ends.

        Every step takes the room lock again and re-checks that this room is still the
        live one and still playing, so a game that ends underneath the task (``end_game``,
        eviction) stops it at the next step whether or not the cancellation lands first.

        ``resume_at`` (T11) enters the loop one step in, in a reveal that ends then, and
        ``index`` is the question that reveal belongs to rather than one to open. It
        rejoins at the top of the loop, so a recovered room that owes the first question
        of a round introduces that round again before opening it.

        A step that raises restarts the room (``_restart``) rather than leaving it in
        memory with nothing to move it on.
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
                if question is None or question.ends_mono is None:
                    return
                await self._sleep_until(room, question.ends_mono)
                reveal_ends = await self._close_question(room, question)
                if reveal_ends is None:
                    return
                await self._sleep_until(room, reveal_ends)
                if not await self._standings(room, index):
                    return
                following = await self._advance(room, index)
                if following is None:
                    return
                index = following
        except asyncio.CancelledError:
            raise
        except Exception:  # a broken question or a database failure must not go silent
            log.exception("room %s: a timer step failed, restarting the room", room.code)
            await self._restart(room)
        finally:
            if room.timer is asyncio.current_task():
                room.timer = None

    async def _sleep_until(self, room: Room, deadline: float) -> None:
        """Wait until ``deadline`` on the manager's clock, or until ``room.advance`` is set.

        The delay is measured against the clock every time rather than counted down, so
        a wakeup that is late (a busy event loop) closes the question immediately instead
        of pushing the rest of the game back by that much.
        """
        delay = max(0.0, deadline - self.clock())
        try:
            async with asyncio.timeout(delay):
                await room.advance.wait()
        except TimeoutError:
            pass

    async def _splash(self, room: Room, index: int) -> bool:
        """Introduce the round ``index`` starts, if it starts one. False: the room is gone.

        The splash introduces a *segment*: it runs before a segment's first question and
        before no other. It used to introduce a mode -- "before a question whose mode
        differs from the one before it" -- which was the same rule until random events,
        and is wrong twice over with them: an event would get a splash it must not have,
        and the question after it a second one for a mode already introduced. A segment
        groups an event into the round it interrupts (``segments.py``), and an event is
        never a segment's first question, so it gets no introduction at all: that is what
        makes it an interruption, and the NPC is its own announcement.

        Nothing is written to the database -- ``current_index`` was persisted by
        ``start_game`` or ``_advance`` before this ran, and ``phase`` has never been a
        column, so a restart mid-splash is a restart before a question that never opened,
        which ``_recover`` already knows how to resume.
        """
        async with room.lock:
            if self.rooms.get(room.code) is not room or room.status != "playing":
                return False
            segment = room.segment_at(index)
            if room.settings.splash_seconds <= 0 or segment is None or segment.start != index:
                return True
            room.current_index = index
            room.phase = "splash"
            # No clock: the splash waits for the room (``rooms/ready.py``) or the host.
            room.next_at = room.next_mono = None
            room.advance.clear()
            # Each splash is its own ready check: being ready for the last round is not
            # being ready for this one.
            for player in room.players.values():
                player.ready = False
                player.unreadied = False
            update = self._room_updated(room)
        self._broadcast(update)
        await self._sleep_through_splash(room)
        return True

    async def _sleep_through_splash(self, room: Room) -> None:
        """Wait out a splash, which ends when the room is ready rather than on a clock.

        ``next_mono`` is ``None`` until the ready check starts a countdown, and it can be
        started, shortened or stopped while this sleeps: each change sets
        ``rescheduled``, and this wakes, reads the new time and sleeps again. ``skip``
        sets ``advance`` and ends it at once, as it ends any other sleep. Reading
        ``next_mono`` and clearing ``rescheduled`` happen with no await between them, so a
        change is never lost between the read and the wait.
        """
        while True:
            target = room.next_mono
            room.rescheduled.clear()
            if room.phase != "splash" or room.advance.is_set():
                return
            if target is None:
                await _wait_for_either(room.advance, room.rescheduled, None)
                continue
            delay = target - self.clock()
            if delay <= 0:
                return
            await _wait_for_either(room.advance, room.rescheduled, delay)

    async def _standings(self, room: Room, index: int) -> bool:
        """Hold the standings up if ``index`` ended a round. False: the room is gone.

        Only a round's last question ends one, and never the game's last: that one goes
        to ``finished``, whose final screen is these same standings. ``standings_seconds``
        at zero turns the phase off. The standings themselves are not in the frame -- the
        reveal just before this carried them, and a socket that arrives now gets them in
        its ``welcome`` -- so ``room_updated`` says only that this is the phase and when it
        ends.

        Like the splash, nothing is written: ``phase`` is not a column, and a restart
        here resumes in the reveal (``_recover``) and moves straight on, which costs that
        round its standings and nothing else.
        """
        async with room.lock:
            if self.rooms.get(room.code) is not room or room.status != "playing":
                return False
            segment = room.segment_at(index)
            seconds = room.settings.standings_seconds
            if (
                seconds <= 0
                or segment is None
                or index != segment.start + segment.count - 1
                or index + 1 >= len(room.questions)
            ):
                return True
            room.phase = "standings"
            room.next_at = datetime.now(UTC) + timedelta(seconds=seconds)
            room.next_mono = ends = self.clock() + seconds
            # A skip that landed during the reveal has been spent on the reveal.
            room.advance.clear()
            update = self._room_updated(room)
        self._broadcast(update)
        await self._sleep_until(room, ends)
        return True

    async def _open_question(self, room: Room, index: int) -> RoomQuestion | None:
        """``pending → open``: stamp ``shown_at``, broadcast ``question_open``.

        A random event opens muted: on screen now, taking answers from ``answerable_at``,
        and open for its own ``seconds`` from then rather than from now, so the NPC's hold
        does not come out of the time to answer. It is the same one frame either way; the
        client counts down to ``answerable_at`` itself, so the buttons appearing needs no
        message of its own.
        """
        pool = await self._pool()
        async with room.lock:
            if self.rooms.get(room.code) is not room or room.status != "playing":
                return None
            if not 0 <= index < len(room.questions):
                return None
            question = room.questions[index]
            shown_at, now = datetime.now(UTC), self.clock()
            seconds = room.question_seconds(question)
            hold = RANDOM_EVENT_HOLD if question.random_event else 0
            segment = room.segment_at(index)
            assert segment is not None  # every question belongs to a round
            async with pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    "update questions set shown_at = $1 where id = $2", shown_at, question.id
                )
                if index == segment.start:
                    await bump(conn, Metric.ROUNDS_STARTED, segment.mode)
            question.shown_at = shown_at
            question.seconds = seconds
            question.answerable_at = shown_at + timedelta(seconds=hold)
            question.ends_at = question.answerable_at + timedelta(seconds=seconds)
            question.answerable_mono = now + hold
            question.ends_mono = question.answerable_mono + seconds
            room.current_index = index
            room.phase = "open"
            room.next_at = room.next_mono = None
            room.advance.clear()
            count = _answer_count(room, question)
            opened = Broadcast.per_player(
                room,
                lambda pid: QuestionOpen(
                    question=question.view(room.total, pid, segment, count)
                ).model_dump(mode="json"),
            )
        self._broadcast(opened)
        return question

    async def _close_question(self, room: Room, question: RoomQuestion) -> float | None:
        """``open → closed``: grade, write the points, broadcast ``question_closed``.

        Returns when the reveal ends on the manager's clock, or ``None`` if the room
        stopped playing underneath us. This is the only place ``answers.correct`` and
        ``answers.points`` are written, and the standings that go out with the reveal are
        the table's own sum, re-read here once the points are in.

        Grading and the reveal run before the write, because a type's bug shows up there,
        and nothing in memory changes until the write has committed. A close that fails
        leaves the question open in both, for the restart to void.
        """
        pool = await self._pool()
        async with room.lock:
            if self.rooms.get(room.code) is not room or room.status != "playing":
                return None
            if room.phase != "open" or room.current is not question:
                return None
            closed_at, now = datetime.now(UTC), self.clock()
            module = TYPES[question.type]
            # Everything in ``answers`` passed ``can_answer`` on the way in, so grading
            # never has to re-check the exclusions.
            credit = module.grade(
                question.payload,
                [Submission(pid, answer.value) for pid, answer in question.answers.items()],
            )
            how = question.scoring
            graded: dict[UUID, tuple[float, bool, int]] = {}
            for pid, answer in question.answers.items():
                got = settle_credit(question.type, credit.get(pid, 0.0))
                points = scoring.points_for(how, got, answer.band, question.steps)
                # Full marks only. Three of five in the right order scores, and is not
                # "correct" for the standings tie-break (section 6).
                graded[pid] = (got, got >= 1.0, points)
            reveal = module.reveal(question.payload)
            async with pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    "update questions set closed_at = $1 where id = $2", closed_at, question.id
                )
                await _count_round_finished(conn, room, question.position)
                if graded:
                    await conn.executemany(
                        "update answers set correct = $1, points = $2"
                        " where question_id = $3 and player_id = $4",
                        [
                            (correct, points, question.id, pid)
                            for pid, (_, correct, points) in graded.items()
                        ],
                    )
                totals = await _fetch_totals(conn, room.id)
            question.closed_at = closed_at
            for pid, (got, correct, points) in graded.items():
                answer = question.answers[pid]
                answer.credit, answer.correct, answer.points = got, correct, points
            room.totals = totals
            room.phase = "reveal"
            room.next_at = closed_at + timedelta(seconds=room.settings.reveal_seconds)
            room.next_mono = reveal_ends = now + room.settings.reveal_seconds
            room.advance.clear()
            more = question.position + 1 < len(room.questions)
            message = QuestionClosed(
                question_id=str(question.id),
                reveal=reveal,
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
        self._broadcast(closed)
        return reveal_ends

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
            async with pool.acquire() as conn, conn.transaction():
                if following < len(room.questions):
                    await conn.execute(
                        "update rooms set current_index = $1 where id = $2", following, room.id
                    )
                    room.current_index = following
                    room.next_at = room.next_mono = None
                    return following
                finished_at = datetime.now(UTC)
                await conn.execute(
                    "update rooms set status = 'finished', finished_at = $2 where id = $1",
                    room.id,
                    finished_at,
                )
                await bump(conn, Metric.GAMES_FINISHED)
            broadcasts = self._finish(room, finished_at)
        for broadcast in broadcasts:
            self._broadcast(broadcast)
        return None

    def _finish(self, room: Room, finished_at: datetime) -> list[Broadcast]:
        """``playing → finished`` in memory, once the database says so. Lock held; send
        what it returns.

        ``room_updated`` goes first so a client knows the room is over before the final
        standings land.
        """
        room.status = "finished"
        room.finished_at = finished_at
        room.phase = "idle"
        room.next_at = room.next_mono = None
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
            for outbox in room.sockets.values():
                outbox.cancel()
        await asyncio.gather(*timers, return_exceptions=True)


def _require_admin(player: Player) -> None:
    if player.role != "admin":
        raise NotAdmin("only an admin can do that")


def _cool_down(last: float, now: float) -> None:
    if now - last < CHANGE_COOLDOWN:
        raise BadState("wait a moment before changing that again")


def _close_if_everyone_answered(room: Room) -> None:
    """Wake the timer to close the open question early, if nobody connected still owes it.

    An answer, a disconnect and a kick each call this, since any of them can be the change
    that leaves nobody owing one. A phone that drops unanswered is not waited for, because
    it would not have been had it dropped before the others answered, and the order must
    not decide how long the room waits. Lock held.
    """
    question = room.open_question()
    if (
        question is not None
        and room.settings.close_when_all_answered
        and _everyone_answered(room, question)
    ):
        room.advance.set()


def _everyone_answered(room: Room, question: RoomQuestion) -> bool:
    """Has every connected player who is allowed to score answered this question?

    A question nobody may answer (``host_only``) is never "all answered": it runs its
    full time, as section 4 says it should.
    """
    eligible = [pid for pid in room.sockets if question.can_answer(pid)]
    return bool(eligible) and all(pid in question.answers for pid in eligible)


def _answer_count(room: Room, question: RoomQuestion) -> tuple[int, int]:
    """How many have answered ``question``, of how many can. Lock held.

    The second number is every connected player allowed to answer, plus anyone who
    answered and has since dropped: an answer does not stop counting because its phone
    went to sleep, and the first number never exceeds the second.
    """
    answering = {pid for pid in room.sockets if question.can_answer(pid)}
    answering.update(question.answers)
    return len(question.answers), len(answering)


def _recount_splash(room: Room, now: float, unready: bool = False) -> None:
    """Start, shorten or stop a splash's countdown to match who is ready. Lock held.

    ``now`` is the manager's clock, which the countdown runs on.

    A no-op outside a splash. Eligible is every connected player who can answer the
    round's first question (``current_index`` points at it during a splash), and only
    their taps count: a player who cannot answer may tap, but holds nobody up either way.

    Only an un-ready (``unready``) stops a running countdown; a connect, a disconnect or a
    kick can start or shorten one but never stop it (``rooms/ready.py`` says why). Any
    change sets ``rescheduled``, so the timer task sleeps to the new ``next_mono``.
    """
    if room.status != "playing" or room.phase != "splash":
        return
    question = room.current
    if question is None:
        return
    eligible = [pid for pid in room.sockets if question.can_answer(pid)]
    tapped = sum(1 for pid in eligible if room.players[pid].ready)
    target = ready.countdown(room.next_mono, now, len(eligible), tapped)
    if target is None and not unready:
        return
    if target != room.next_mono:
        room.next_mono = target
        room.next_at = (
            None if target is None else datetime.now(UTC) + timedelta(seconds=target - now)
        )
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


def _round_under_way(room: Room) -> Segment | None:
    """The round whose first question has opened and whose last has not closed, if any."""
    segment = room.segment_at(room.current_index or 0)
    if segment is None:
        return None
    first = room.questions[segment.start]
    last = room.questions[segment.start + segment.count - 1]
    return segment if first.shown_at is not None and last.closed_at is None else None


async def _count_round_finished(conn: asyncpg.Connection, room: Room, position: int) -> None:
    """Count the round as finished if ``position``, now closing, is its last question."""
    segment = room.segment_at(position)
    if segment is not None and position == segment.start + segment.count - 1:
        await bump(conn, Metric.ROUNDS_FINISHED, segment.mode)


async def _void_question(conn: asyncpg.Connection, question: RoomQuestion, at: datetime) -> None:
    """Write ``open → voided`` (section 4): the question closes at ``at``, graded nothing.

    Both ways in are a question nobody gets to score: ``end_game``, and a restart that
    found it open (T11). Answers already in the table stay exactly as they arrived, with
    ``correct`` and ``points`` null, which is what ``_fetch_totals`` sums as nothing. The
    caller marks the question voided in memory once the write has committed.
    """
    await conn.execute(
        "update questions set closed_at = $1, voided = true where id = $2", at, question.id
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
            content_id=row["question_id"],
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


def _gone(
    expires_at: datetime, finished_at: datetime | None, grace: timedelta, now: datetime
) -> bool:
    return expires_at <= now or (finished_at is not None and finished_at + grace <= now)


async def _fetch_room(conn: asyncpg.Connection, code: str, grace: timedelta) -> asyncpg.Record:
    row = await conn.fetchrow(
        "select id, code, status, settings, current_index, created_at, expires_at, finished_at"
        " from rooms where code = $1",
        code,
    )
    if row is None:
        raise RoomNotFound(f"no room {code}")
    if _gone(row["expires_at"], row["finished_at"], grace, datetime.now(UTC)):
        raise RoomExpired(f"room {code} has expired")
    return row
