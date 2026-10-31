"""Websocket messages from section 3 of ideas/architecture.md, both directions.

Every frame is a JSON object with a ``t`` discriminator. ``parse_client_message`` turns a
decoded frame into one of the client models; the server builds its models in
``RoomManager`` and the handler and sends them with ``model_dump(mode="json")``, which
renders ``UUID`` as text and ``datetime`` as ISO 8601.

The shared shapes (``RoomView``, ``PlayerView``, ``Standing``, ``OpenQuestion``) live here
too, because the HTTP room view is the same ``RoomView`` the websocket sends.
"""

from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from app.questions.types.scoring import Scoring
from app.rooms.settings import RoomSettings
from app.rooms.teams import God

RoomStatus = Literal["lobby", "playing", "finished"]
# ``standings`` sits between a round's last reveal and the next round, never between
# two questions of one round, and never after the game's last: that goes to ``finished``.
Phase = Literal["idle", "splash", "open", "reveal", "standings"]
# Every timed phase: each one is a wait the host can cut short.
SkippablePhase = Literal["splash", "open", "reveal", "standings"]
Role = Literal["player", "admin", "tv"]
ErrorCode = Literal[
    "bad_hello",
    "bad_message",  # unparseable or unknown frame after ``hello``; the socket closes with 4008
    "not_admin",
    "not_open",
    "already_answered",
    "excluded",
    "bad_value",
    "bad_state",
    # ``set_profile``, which is validated exactly like a join, and says so with the
    # same codes ``POST /api/rooms/{code}/join`` answers with.
    "bad_name",
    "name_taken",
    "bad_avatar",
]


class _Message(BaseModel):
    model_config = ConfigDict(extra="forbid", use_attribute_docstrings=True)


# --- Shared shapes ----------------------------------------------------------------


class Segment(_Message):
    """The round the room is in: one mode, a run of consecutive questions.

    Grouped from the ``questions.round`` column rather than stored a second time, so it
    cannot drift from the questions it describes. ``start`` is a position in the room's
    question list, which is what ``OpenQuestion.index`` counts in too, so the question
    number within the round is ``index - start + 1``.
    """

    mode: str
    """A mode id (``app/modes``), never a type id; the client's mode registry key."""
    index: int
    """0-based round number."""
    total: int
    """Rounds in this room."""
    start: int
    """Position of the round's first question."""
    count: int
    """Questions in the round."""


class Daily(_Message):
    """The day's set a daily room plays: one player, alone, once."""

    day: date
    """The date the set's 08:00 UTC window opened on."""
    number: int
    """The day's number, counting ``DAILY_FIRST_DAY`` as #1."""


class JoinRequestView(_Message):
    id: UUID
    display_name: str
    avatar: str | None
    """As on ``PlayerView``."""


class RoomView(_Message):
    code: str
    status: RoomStatus
    settings: RoomSettings
    current_index: int | None
    total: int
    events: int = 0
    """The random events among ``total``, so the lobby can tell them from the rounds' questions."""
    phase: Phase
    next_at: datetime | None
    """When the current timed phase ends: a splash gives way to its first question, a reveal to
    the next question or to the standings, the standings to the next round. Null while a
    question is open, during a splash still waiting for the room to be ready, and in a room that
    is not playing. Also on ``question_closed``, but a splash, reveal or standings a client
    arrives into (a reconnect, or a room that just came back from a restart) has no frame of its
    own to carry it.
    """
    reveal_seconds: int | None = None
    """How long the reveal ending at ``next_at`` holds, so a countdown bar knows its full
    length: each question's is its own. Null outside a reveal.
    """
    estimated_seconds: int = 0
    """How long the game takes at most, for the lobby's minutes: ``rooms/duration.py``."""
    segment: Segment | None
    """The round in progress, null before the first question and once the game is over."""
    next_segment: Segment | None = Field(default=None, exclude_if=lambda segment: segment is None)
    """The round the standings hand over to, sent only in the standings phase: hidden or
    shuffled rounds are its splash's news, which the standings' "Next up" tells a few
    seconds early.
    """
    played: list[str] = Field(default_factory=list)
    """The modes of the rounds before ``segment``, in the order they were played, so a splash
    can name past rounds' hosts after a shuffle or with ``settings.hide_rounds``. Rounds still
    to come are never in it.
    """
    finished_at: datetime | None
    """When the game ended, null until it has. Every browser files the result under it, so it
    comes from the server's clock and not each one's own.
    """
    rounds: int | None = Field(default=None, exclude_if=lambda rounds: rounds is None)
    """How many rounds the room plays, sent only when ``settings.hide_rounds`` keeps the rest of
    ``settings.modes`` from a non-admin. Counted off the stored questions, so it agrees with
    ``Segment.total``.
    """
    key: str | None = Field(default=None, exclude_if=lambda key: key is None)
    """An invite-only room's key, sent to its admins only: settings reach every player."""
    requests: list[JoinRequestView] | None = Field(
        default=None, exclude_if=lambda requests: requests is None
    )
    """Who is asking to be let in without the key, oldest first: an invite-only room's, sent to
    its admins only, as the key is.
    """
    daily: Daily | None = Field(default=None, exclude_if=lambda daily: daily is None)
    """A daily room's day. Its reveal waits for the player's ``skip`` instead of a countdown."""


class PlayerView(_Message):
    id: UUID
    display_name: str
    avatar: str | None
    """A pet's id in ``data/pets.json``; the server stores one for every player."""
    role: Role
    team: God | None
    """The god they play for in a team game; null outside one, and for everyone who just joined."""
    connected: bool
    ready: bool
    """The ready check: ready to start in the lobby, ready for this round on a splash. Every
    splash starts it false for everyone again.
    """
    editing: bool
    """Is typing a name in the lobby: "picking a name…". Advice, never a gate."""


class Standing(_Message):
    player_id: UUID
    display_name: str
    avatar: str | None
    """As on ``PlayerView``."""
    points: int
    rank: int
    points_gained: int
    """What the round of the latest close added, and the rank before it; None in the first."""
    previous_rank: int | None


class TeamStanding(_Message):
    """A team game's team: its members' points averaged and rounded, so a silent member counts.

    ``rank`` is dense over ``points``, ties in ``settings.teams`` order; ``points_gained`` and
    ``previous_rank`` follow ``Standing``'s rule on the averages. A team without members is
    left out.
    """

    team: God
    points: int
    rank: int
    points_gained: int
    previous_rank: int | None


class OpenQuestion(_Message):
    """What every socket sees while a question is open: ``client_view`` only, never the
    answer or the raw payload (section 3, "What the server withholds from the admin")."""

    question_id: str
    """The ``questions`` row id, never the content id: that one hashes the answer."""
    index: int
    total: int
    type: str
    """How it is answered: the key into ``questions/types``."""
    mode: str
    """Which mode it was drawn for (``app/modes``); not always the same string as ``type``. On
    the question itself rather than only on ``segment``, because it is a fact about the
    question, and the round it sits in is a different fact that merely agrees today.
    """
    segment: Segment
    """Repeated from ``RoomView`` because the client patches its room from this frame rather
    than replacing it, and a round can change without a splash to announce it (a restart in the
    splash resumes at the question).
    """
    view: dict[str, Any]
    picture: str | None = None
    """The picture's random name in the client's bundle (``app/pictures.py``), or ``None``.
    Never the payload's ``image``: for some modes that asset id is the answer.
    """
    random_event: str | None = None
    """The NPC interrupting the round with this question, or ``None`` for a question that
    belongs to its round. An id from ``app/random_events.py``; the client has the copy.
    """
    opened_at: datetime
    answerable_at: datetime
    """When the buttons appear and the clock starts: ``opened_at`` plus the time the scroll
    takes to type the question in (``rooms/hold.py``). An answer before it is ``not_open``, and
    ``ends_at`` is this plus the question's seconds.
    """
    ends_at: datetime
    you_can_answer: bool
    answered: int = 0
    """How many have answered, of how many can, for the waiting state. Current as of this frame:
    zero on ``question_open``, the live count in a ``welcome``, and kept up to date after that
    by ``answer_count`` and the answerer's own ``answer_ack``.
    """
    of: int = 0
    waiting: list[str] = Field(default_factory=list)
    """Who is still to answer, as player ids: connected, allowed to, and not yet in. Never
    what anyone answered. The TV's waiting panel shows them; ``answer_count`` keeps it current.
    """


# --- Client → server --------------------------------------------------------------


class Hello(_Message):
    t: Literal["hello"]
    session: str = Field(min_length=1, max_length=128)


class Ping(_Message):
    t: Literal["ping"]


class Answer(_Message):
    t: Literal["answer"]
    question_id: str = Field(min_length=1, max_length=200)
    value: Any


class StartGame(_Message):
    t: Literal["start_game"]


class Skip(_Message):
    """End ``phase`` of the question at ``index``: what the host was looking at when they
    pressed it, so a second tap that lands once the room has moved on ends nothing."""

    t: Literal["skip"]
    phase: SkippablePhase
    index: int = Field(ge=0, strict=True)


class Promote(_Message):
    t: Literal["promote"]
    player_id: UUID


class SetTv(_Message):
    """Admin: make ``player_id`` the room's one TV (``on``), or a player again. Lobby only."""

    t: Literal["set_tv"]
    player_id: UUID
    on: bool = Field(strict=True)


class Kick(_Message):
    t: Literal["kick"]
    player_id: UUID


class EndGame(_Message):
    t: Literal["end_game"]


class EndRound(_Message):
    """End the round holding question ``index``, which must still be the room's."""

    t: Literal["end_round"]
    index: int = Field(ge=0, strict=True)


class RotateKey(_Message):
    """Replace an invite-only room's key. Lobby only."""

    t: Literal["rotate_key"]


class DecideRequest(_Message):
    """Let a join request in, or turn it away. Lobby of an invite-only room only."""

    t: Literal["decide_request"]
    request_id: UUID
    accept: bool = Field(strict=True)


class SetProfile(_Message):
    """Rename, change the pet, or both. One message for both, because they are the
    same operation on the same row: validated like a join, broadcast as ``room_updated``.

    An omitted field is left as it is. The bounds here are only the outer ones; the name
    rules and the list of pets are the manager's to apply.
    """

    t: Literal["set_profile"]
    display_name: str | None = Field(default=None, max_length=200)
    avatar: str | None = Field(default=None, max_length=64, strict=True)


class Ready(_Message):
    """Tap ready, or take it back. In the lobby and on a splash; nowhere else."""

    t: Literal["ready"]
    ready: bool = Field(strict=True)


class SetTeam(_Message):
    """Join one of the room's teams. Lobby of a team game only, and not while ready."""

    t: Literal["set_team"]
    team: God


class MoveTeam(_Message):
    """Put any player on one of the room's teams, keeping their ready. Lobby only."""

    t: Literal["move_team"]
    player_id: UUID
    team: God


class SetTeams(_Message):
    """Admin: the whole list of a team game's gods, in the lobby. Names are checked by the
    manager, so an unknown god is ``bad_value`` like any other wrong list.
    """

    t: Literal["set_teams"]
    teams: list[Annotated[str, Field(max_length=32, strict=True)]] = Field(max_length=16)


class Editing(_Message):
    """The name field gained focus (``on``), or lost it. Lobby only; ignored anywhere else."""

    t: Literal["editing"]
    on: bool = Field(strict=True)


class SetSettings(_Message):
    """Admin: the game's whole settings, in the lobby. Left a plain object here and checked by
    the manager, so a wrong value is ``bad_value`` and costs nobody their socket.
    """

    t: Literal["set_settings"]
    settings: dict[str, Any]


ClientMessage = Annotated[
    Hello
    | Ping
    | Answer
    | StartGame
    | Skip
    | Promote
    | SetTv
    | Kick
    | EndGame
    | EndRound
    | RotateKey
    | DecideRequest
    | SetProfile
    | Ready
    | SetTeam
    | MoveTeam
    | SetTeams
    | SetSettings
    | Editing,
    Field(discriminator="t"),
]
_client_message = TypeAdapter[ClientMessage](ClientMessage)


def parse_client_message(frame: Any) -> ClientMessage:
    """A decoded JSON frame as its model. Raises ``pydantic.ValidationError``."""
    return _client_message.validate_python(frame)


# --- Server → client --------------------------------------------------------------


class Welcome(_Message):
    """Reply to ``hello``: the full snapshot the client rebuilds all state from."""

    t: Literal["welcome"] = "welcome"
    room: RoomView
    you: PlayerView
    players: list[PlayerView]
    question: OpenQuestion | None
    your_answer: Any | None
    standings: list[Standing]
    team_standings: list[TeamStanding] | None
    """Null outside a team game, here and on every frame that carries it."""
    server_time: datetime
    server_version: str
    """``/VERSION`` of the running server. A client built from another version reloads itself,
    so a deploy never leaves an old bundle reading frames it does not know.
    """


class RoomUpdated(_Message):
    """Join, leave, promote, kick, status change, ``set_profile``, and the start of a
    splash or of the standings, which carries ``standings``. Also a ready tap, connect or
    disconnect that moves the room itself, which on a splash is its countdown."""

    t: Literal["room_updated"] = "room_updated"
    room: RoomView
    players: list[PlayerView]
    standings: list[Standing] | None = Field(default=None, exclude_if=lambda s: s is None)
    team_standings: list[TeamStanding] | None = Field(default=None, exclude_if=lambda s: s is None)


class PlayersUpdated(_Message):
    """A ready tap, a team change, an ``editing`` change, connect or disconnect that changed
    the players and nothing else."""

    t: Literal["players_updated"] = "players_updated"
    players: list[PlayerView]


class QuestionOpen(_Message):
    t: Literal["question_open"] = "question_open"
    question: OpenQuestion


class AnswerAck(_Message):
    """How the answer will be scored and where it landed, never whether it was right.

    ``band`` is the speed bucket (1..5) for ``speed``, the step the answer arrived on for
    ``step``, and null for ``accuracy``, where the clock does not count. A team game scores
    ``speed`` on accuracy alone, so its band is null there too.
    """

    t: Literal["answer_ack"] = "answer_ack"
    question_id: str
    scoring: Scoring
    band: Annotated[int, Field(ge=1)] | None
    answered: int
    """The room's count with this answer in it: the answerer is left out of the ``answer_count``
    broadcast, so the ack is where they hear it.
    """
    of: int


class AnswerCount(_Message):
    """Somebody else has answered the open question: how many have, of how many can, and who
    is still to.

    Never what: the waiting state shows "4 of 6 answered" and the TV the players still
    thinking, nothing a player could read an answer off. ``of`` is every connected
    player allowed to answer plus anyone who answered and has since dropped, so the count
    never reads more than the total. A disconnect does not send a fresh count; the next
    answer does.
    """

    t: Literal["answer_count"] = "answer_count"
    question_id: str
    answered: int
    of: int
    waiting: list[str]


class PlayerResult(_Message):
    """One player's row in the reveal.

    ``credit`` is what the type's ``grade`` returned. It is here so a reveal can say
    "three of five in the right place"; ``correct`` is the tie-break's boolean, and is
    ``credit >= 1.0``.
    """

    value: Any
    correct: bool
    credit: float = Field(ge=0.0, le=1.0)
    points: int


class QuestionClosed(_Message):
    t: Literal["question_closed"] = "question_closed"
    question_id: str
    reveal: dict[str, Any]
    picture: str | None = None
    """The same name ``OpenQuestion.picture`` carried, so a reveal can show it too."""
    results: dict[UUID, PlayerResult]
    unanswered: list[UUID]
    """Connected players who could have answered and did not, for the reveal's "No answer"."""
    standings: list[Standing]
    team_standings: list[TeamStanding] | None
    next_at: datetime | None
    reveal_seconds: int | None
    """How long this reveal holds, even for the last question. Null in a daily room, whose
    reveal waits for the player."""
    suggested_by: str | None = Field(default=None, exclude_if=lambda name: name is None)
    """The player who suggested the question, when they asked to be named. Left out otherwise."""


class GameFinished(_Message):
    t: Literal["game_finished"] = "game_finished"
    standings: list[Standing]
    team_standings: list[TeamStanding] | None


class Pong(_Message):
    t: Literal["pong"] = "pong"
    server_time: datetime


class Error(_Message):
    t: Literal["error"] = "error"
    code: ErrorCode
    message: str


ServerMessage = (
    Welcome
    | RoomUpdated
    | PlayersUpdated
    | QuestionOpen
    | AnswerAck
    | AnswerCount
    | QuestionClosed
    | GameFinished
    | Pong
    | Error
)
