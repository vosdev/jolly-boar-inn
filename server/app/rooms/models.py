"""A room in memory: its players, questions, answers and scores, and the frames sent from it."""

import asyncio
import hashlib
import hmac
import math
import re
import secrets
import unicodedata
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from app.questions.types import (
    TYPES,
    answer_seconds,
    pictured,
    reveal_seconds,
    scoring_of,
    steps_of,
)
from app.questions.types.scoring import Scoring
from app.rooms import codes, duration, scoring, segments
from app.rooms.errors import BadName, NotAdmin
from app.rooms.settings import RoomSettings
from app.rooms.teams import God
from app.stats import Arrival
from app.ws.outbox import Outbox
from app.ws.protocol import (
    JoinRequestView,
    OpenQuestion,
    PlayerView,
    RoomView,
    Segment,
    Standing,
    TeamStanding,
)

NAME_MAX = 12
# A question's credit is a name too, but credits from before names were cut to 12 stand.
CREDIT_MAX = 24
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


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def new_invite_key() -> str:
    """A door code for an invite link: short enough for a URL, too long to guess."""
    return secrets.token_urlsafe(9)


def normalize_name(raw: str, limit: int = NAME_MAX) -> str:
    """NFKC, trimmed, spaces collapsed, then 1-``limit`` Latin letters, digits, spaces, _ and -."""
    name = _SPACES.sub(" ", unicodedata.normalize("NFKC", raw).strip())
    if not 1 <= len(name) <= limit:
        raise BadName(f"display name must be 1 to {limit} characters")
    if not all(ch in _NAME_MARKS or _is_latin_letter(ch) for ch in name):
        raise BadName("Only letters, digits, spaces, _ and - in a name.")
    return name


def _is_latin_letter(ch: str) -> bool:
    return any(low <= ch <= high for low, high in _LATIN_LETTERS)


@dataclass(slots=True)
class Player:
    id: UUID
    display_name: str
    role: str
    joined_at: datetime
    session_hash: str = field(repr=False)  # sha256 hex of the session token, never plaintext
    connected: bool = False
    # A pet's id. ``None`` only for a row startup has not yet given one.
    avatar: str | None = None
    # ``None`` outside a team game and until they get one.
    team: God | None = None
    # The ready check, in memory only: it means "ready to start" in the lobby and
    # "ready for this round" on a splash, and every splash starts everybody afresh. A
    # restart forgets it, which costs one tap -- the same as the splash it replays.
    ready: bool = False
    # Whether this player has already taken a tap back on this splash. One un-ready per
    # splash, so a player hammering the button cannot stop and restart the room's
    # countdown over and over. The lobby has ``CHANGE_COOLDOWN`` instead.
    unreadied: bool = False
    # When this player last changed their lobby ready, profile or team, on the manager's
    # monotonic clock. Each change is a broadcast to every socket in the room.
    ready_changed_at: float = field(default=-math.inf, repr=False)
    profile_changed_at: float = field(default=-math.inf, repr=False)
    team_changed_at: float = field(default=-math.inf, repr=False)
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
            team=self.team,
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
class JoinRequest:
    """Somebody without an invite-only room's key, asking its admins to let them in.

    Not a player and not a row: memory only, so a restart forgets it and the waiting page
    says to ask again. The requester holds a ticket, which works like a session until an
    admin answers and the next poll turns it into one.
    """

    id: UUID
    ticket_hash: str = field(repr=False)
    display_name: str
    avatar: str | None
    returning: bool
    arrival: Arrival
    asked_at: float  # on the manager's monotonic clock
    # ``None`` while waiting, then the admin's answer, which the next poll acts on.
    accepted: bool | None = None
    # Drops the request once its requester stops polling or it outlives its lifetime.
    expiry: asyncio.Task[None] | None = field(default=None, repr=False)

    def view(self) -> JoinRequestView:
        return JoinRequestView(id=self.id, display_name=self.display_name, avatar=self.avatar)

    def drop(self) -> None:
        """Cancel the expiry; the caller takes the request out of the room."""
        if self.expiry is not None:
            self.expiry.cancel()
            self.expiry = None


@dataclass(slots=True)
class Submitted:
    """One player's answer to one question, in memory.

    ``band`` is fixed at receive time from ``received_at - answerable_at`` (section 6); the
    client never sends a time. It is ``None`` for a question scored on ``ACCURACY``, where
    the clock does not count, and for ``SPEED`` in a team game.
    ``credit``, ``correct`` and ``points`` stay ``None`` until the question closes and
    grading writes them here, and the last two to the ``answers`` row. ``credit`` has no
    column: it goes out once with the reveal, and the table keeps what the standings are
    built from.
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
    recomputed whenever the question opens, from its type and the room's pace, and
    ``ends_at`` is what the timer and the clients count down to. ``seconds`` is also what
    the speed bucket is a fraction of, so a ten-second question scores on ten seconds in a
    room whose ordering questions run to forty.

    ``answerable_at`` is when answers are taken from, and so when ``seconds`` starts. It is
    ``shown_at`` plus ``question_hold``, the time the scroll takes to type the question in
    before the buttons appear. Deriving it rather
    than storing it is what leaves rehydrate as it was: a question that was open at a
    restart is voided either way, so nothing ever needs it back from the database.

    ``answerable_mono`` and ``ends_mono`` are those two moments on the manager's monotonic
    clock. An answer is timed and cut off against them and the timer sleeps to them, so a
    wall clock that jumps mid-question moves neither a bucket nor the close; the wall-clock
    pair is what the clients count down to.

    ``type`` and ``mode`` are both columns, and neither is derived from the other: the
    type is how the question is answered, graded and timed, the mode is the round it was
    drawn for.

    ``random_event`` is the NPC interrupting ``round`` with this question, or ``None`` for
    a question that belongs to its round. An event's ``mode`` is its own and its ``round``
    is the one it interrupts; ``segments.py`` reads the pair.

    ``suggested_by`` is the envelope's ``credit`` when the player who suggested a pack
    question let players see it, and goes out with the reveal. A host's own question never
    has one: a host could otherwise sign it with anybody's name.
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
    suggested_by: str | None = None
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
        payloads will be the only ones with any (the Images milestone). Every other question is
        ``None``, which is also what turns ``STEP`` into ``SPEED``.
        """
        return steps_of(self.type, self.payload)

    @property
    def scoring(self) -> Scoring:
        """How this question's credit becomes points, as its type and payload decide."""
        return scoring.effective(scoring_of(self.type), self.steps)

    def can_answer(self, player_id: UUID) -> bool:
        """The question's own exclusion: nobody answers ``host_only``. Authors answer their own.

        ``Room.can_answer`` adds the player's: the TV answers nothing.
        """
        return not self.host_only

    def view(
        self,
        total: int,
        you_can_answer: bool,
        segment: Segment,
        count: tuple[int, int] = (0, 0),
        picture: str | None = None,
        pictures: Mapping[str, str] | None = None,
        waiting: Iterable[str] = (),
    ) -> OpenQuestion:
        """The open question as a player sees it. ``count`` is ``_answer_count``'s,
        ``pictures`` names the pictures the view shows inside it, and ``waiting`` is who is
        still to answer."""
        assert self.shown_at is not None and self.ends_at is not None
        assert self.answerable_at is not None
        return OpenQuestion(
            question_id=str(self.id),
            index=self.position,
            total=total,
            type=self.type,
            mode=self.mode,
            segment=segment,
            view=pictured(
                self.type, TYPES[self.type].client_view(self.payload), self.payload, pictures or {}
            ),
            picture=picture,
            random_event=self.random_event,
            opened_at=self.shown_at,
            answerable_at=self.answerable_at,
            ends_at=self.ends_at,
            you_can_answer=you_can_answer,
            answered=count[0],
            of=count[1],
            waiting=list(waiting),
        )


@dataclass(slots=True)
class Totals:
    """A player's score, as the ``answers`` table has it. Never incremented in memory.

    ``round_points`` and ``round_correct`` are the part of it scored in the round of the
    latest close, so the standings can say what that round gained and where everyone stood
    before it.
    """

    points: int = 0
    correct: int = 0
    round_points: int = 0
    round_correct: int = 0


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
    # Only a join carrying it gets in. Sent to admins, never stored in ``settings``.
    invite_key: str | None = field(default=None, repr=False)
    # Listed on Home for anyone to join while it is a lobby (``RoomManager.public_rooms``).
    public: bool = False
    players: dict[UUID, Player] = field(default_factory=dict)  # in join order
    # Join requests by ticket hash, oldest first. Only an invite-only lobby has any.
    requests: dict[str, JoinRequest] = field(default_factory=dict, repr=False)
    sockets: dict[UUID, Outbox] = field(default_factory=dict, repr=False)
    questions: list[RoomQuestion] = field(default_factory=list, repr=False)  # by position
    # Rebuilt from ``sum(answers.points)`` at every close, never added to.
    totals: dict[UUID, Totals] = field(default_factory=dict, repr=False)
    # Where the round that ``Totals.round_points`` covers starts: the latest close's.
    totals_round: int = 0
    phase: str = "idle"
    # When the current timed phase ends: a splash gives way to its first question, a
    # reveal to the next question or the standings, the standings to the next round.
    # ``None`` while a question is open, and during a splash that is still waiting for the
    # room to be ready.
    next_at: datetime | None = None
    # The same moment on the manager's monotonic clock, and what the timer sleeps to: a
    # wall clock that jumps must not move it. ``next_at`` is for the wire.
    next_mono: float | None = None
    # How long the reveal in progress holds, for the clients' countdown: its question's own.
    reveal_seconds: int | None = None
    # The one task driving open → closed → reveal → next.
    timer: asyncio.Task[None] | None = field(default=None, repr=False)
    # A ``playing`` room rehydrated but not yet resumed: it waits for a player to come
    # back, so a scanner or link preview asking for the code does not play it unattended.
    awaiting_player: bool = False
    # Set to cut the current sleep short: ``skip``, or everyone has answered.
    advance: asyncio.Event = field(default_factory=asyncio.Event, repr=False)
    # Set when the ready check starts, shortens or stops a splash's countdown, so the
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

    @property
    def next_segment(self) -> Segment | None:
        """The round after the current one, or ``None`` past the last."""
        current = self.current_segment
        if current is None or current.index + 1 >= len(self.segments):
            return None
        return self.segments[current.index + 1]

    @property
    def played(self) -> list[str]:
        """The modes of the rounds before the current one, in the order they were played."""
        current = self.current_segment
        return [] if current is None else [s.mode for s in self.segments[: current.index]]

    def question_seconds(self, question: RoomQuestion) -> int:
        """How long ``question`` stays open: its type's time at the room's pace."""
        return answer_seconds(question.type, question.payload, self.settings.pace)

    def question_reveal_seconds(self, question: RoomQuestion) -> int:
        """How long ``question``'s reveal holds: its type's time at the room's pace, plus names."""
        names = duration.NAMES_SECONDS if self.settings.name_wrong_answers else 0
        return reveal_seconds(question.type, question.payload, self.settings.pace) + names

    def estimated_seconds(self) -> int:
        """How long the whole game takes at most (``rooms/duration.py``)."""
        return duration.game_seconds(
            [(q.type, q.payload) for q in self.questions],
            len(self.segments),
            self.settings.pace,
            self.settings.standings_seconds,
            self.settings.name_wrong_answers,
        )

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

    def can_answer(self, question: RoomQuestion, player_id: UUID) -> bool:
        """May ``player_id`` answer ``question``? Never the TV, which only watches."""
        player = self.players.get(player_id)
        return player is not None and player.role != "tv" and question.can_answer(player_id)

    def is_admin(self, player_id: UUID) -> bool:
        player = self.players.get(player_id)
        return player is not None and player.role == "admin"

    def view_for(self, player_id: UUID) -> RoomView:
        """The room as ``player_id`` is sent it: admins get the key, the rest the rounds so far."""
        if self.is_admin(player_id):
            return self.view(admin=True, withhold=bool(self.settings.surprise_modes))
        return self.view(withhold=self.settings.hide_rounds)

    def view(self, withhold: bool = False, admin: bool = False) -> RoomView:
        """The room as a client sees it: ``withhold`` the unstarted rounds, and add the key
        and the waiting join requests for an ``admin``.

        A round has started once ``current_index`` reaches it, which its splash does. A game
        ended early keeps the rest hidden.
        """
        settings = self.settings
        rounds = None
        if settings.hide_rounds:
            rounds = len(self.segments)
            if withhold:
                current = self.current_segment
                started = {s.mode for s in self.segments[: current.index + 1]} if current else set()
                kept = [entry for entry in settings.modes if entry.mode in started]
                settings = settings.model_copy(update={"modes": kept})
        return RoomView(
            code=codes.cased(self.code),
            status=self.status,  # type: ignore[arg-type]  # the column's check constraint
            settings=settings,
            current_index=self.current_index,
            total=self.total,
            events=sum(q.random_event is not None for q in self.questions),
            phase=self.phase,  # type: ignore[arg-type]
            next_at=self.next_at,
            reveal_seconds=self.reveal_seconds if self.phase == "reveal" else None,
            estimated_seconds=self.estimated_seconds(),
            segment=self.current_segment,
            next_segment=self.next_segment if self.phase == "standings" else None,
            played=self.played,
            finished_at=self.finished_at,
            rounds=rounds,
            key=self.invite_key if admin else None,
            requests=self.waiting_requests() if admin and self.invite_key is not None else None,
        )

    def waiting_requests(self) -> list[JoinRequestView]:
        """The join requests no admin has answered yet, oldest first."""
        return [r.view() for r in self.requests.values() if r.accepted is None]

    def drop_requests(self) -> None:
        for request in self.requests.values():
            request.drop()
        self.requests.clear()

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

        ``points_gained`` is what the latest close's round added, and ``previous_rank`` the
        rank before that round by the same rules, or None when it is the game's first.
        """

        def now(player: Player) -> tuple[int, int]:
            score = self.score(player.id)
            return score.points, score.correct

        def before(player: Player) -> tuple[int, int]:
            score = self.score(player.id)
            return score.points - score.round_points, score.correct - score.round_correct

        playing = [player for player in self.players.values() if player.role != "tv"]
        ranked = _dense_ranks(playing, now)
        previous = (
            None
            if self.totals_round == 0
            else {player.id: rank for player, rank in _dense_ranks(playing, before)}
        )
        return [
            Standing(
                player_id=player.id,
                display_name=player.display_name,
                avatar=player.avatar,
                points=self.score(player.id).points,
                rank=rank,
                points_gained=self.score(player.id).round_points,
                previous_rank=None if previous is None else previous[player.id],
            )
            for player, rank in ranked
        ]

    def team_standings(self) -> list[TeamStanding] | None:
        """Section 8's team standings from the same ``totals`` as ``standings``; None
        outside a team game."""
        if not self.settings.teams:
            return None
        members = {
            god: [p for p in self.players.values() if p.team == god] for god in self.settings.teams
        }
        playing = [god for god in self.settings.teams if members[god]]
        now = {
            god: _rounded_mean([self.score(p.id).points for p in members[god]]) for god in playing
        }
        before = {
            god: _rounded_mean(
                [self.score(p.id).points - self.score(p.id).round_points for p in members[god]]
            )
            for god in playing
        }
        previous = None if self.totals_round == 0 else dict(_dense_team_ranks(playing, before))
        return [
            TeamStanding(
                team=god,
                points=now[god],
                rank=rank,
                points_gained=now[god] - before[god],
                previous_rank=None if previous is None else previous[god],
            )
            for god, rank in _dense_team_ranks(playing, now)
        ]

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

    One entry per socket, because not every frame is the same for everyone: only admins are
    sent ``room_updated``'s key and, with ``hide_rounds``, the rounds still to come.
    """

    targets: list[tuple[Outbox, dict[str, Any]]]

    @classmethod
    def to_all(cls, room: Room, message: dict[str, Any], exclude: UUID | None = None) -> Broadcast:
        return cls([(out, message) for pid, out in room.sockets.items() if pid != exclude])

    @classmethod
    def per_player(cls, room: Room, build: Callable[[UUID], dict[str, Any]]) -> Broadcast:
        return cls([(out, build(pid)) for pid, out in room.sockets.items()])


def _require_admin(player: Player) -> None:
    if player.role != "admin":
        raise NotAdmin("only an admin can do that")


def _dense_ranks(
    players: Iterable[Player], score: Callable[[Player], tuple[int, int]]
) -> list[tuple[Player, int]]:
    """Section 6's order on ``score``'s points and correct answers, then ``joined_at``;
    the rank is dense over the score alone."""
    ranked: list[tuple[Player, int]] = []
    rank, previous = 0, None
    for player in sorted(players, key=lambda p: (-score(p)[0], -score(p)[1], p.joined_at)):
        if score(player) != previous:
            rank += 1
            previous = score(player)
        ranked.append((player, rank))
    return ranked


def _rounded_mean(values: list[int]) -> int:
    """The mean of non-negative ``values``, halves rounded up rather than to even."""
    return (2 * sum(values) + len(values)) // (2 * len(values))


def _dense_team_ranks(teams: list[God], points: Mapping[God, int]) -> list[tuple[God, int]]:
    """Dense ranks over ``points``; a stable sort keeps ``teams``' order among ties."""
    ranked: list[tuple[God, int]] = []
    rank, previous = 0, None
    for god in sorted(teams, key=lambda g: -points[g]):
        if points[god] != previous:
            rank += 1
            previous = points[god]
        ranked.append((god, rank))
    return ranked


def _gone(
    expires_at: datetime, finished_at: datetime | None, grace: timedelta, now: datetime
) -> bool:
    return expires_at <= now or (finished_at is not None and finished_at + grace <= now)
