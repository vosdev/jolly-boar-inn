"""Websocket messages from section 3 of ideas/architecture.md, both directions.

Every frame is a JSON object with a ``t`` discriminator. ``parse_client_message`` turns a
decoded frame into one of the client models; the server builds its models in
``RoomManager`` and the handler and sends them with ``model_dump(mode="json")``, which
renders ``UUID`` as text and ``datetime`` as ISO 8601.

The shared shapes (``RoomView``, ``PlayerView``, ``Standing``, ``OpenQuestion``) live here
too, because the HTTP room view is the same ``RoomView`` the websocket sends.
"""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from app.questions.types.scoring import Scoring
from app.rooms.settings import RoomSettings

RoomStatus = Literal["lobby", "playing", "finished"]
# ``standings`` (D9) sits between a round's last reveal and the next round, never between
# two questions of one round, and never after the game's last: that goes to ``finished``.
Phase = Literal["idle", "splash", "open", "reveal", "standings"]
# Every timed phase: each one is a wait the host can cut short.
SkippablePhase = Literal["splash", "open", "reveal", "standings"]
Role = Literal["player", "admin"]
ErrorCode = Literal[
    "bad_hello",
    "bad_message",  # unparseable or unknown frame after ``hello``; the socket closes with 4008
    "not_admin",
    "not_open",
    "already_answered",
    "excluded",
    "bad_value",
    "bad_state",
    # ``set_profile`` (D4), which is validated exactly like a join, and says so with the
    # same codes ``POST /api/rooms/{code}/join`` answers with.
    "bad_name",
    "name_taken",
    "bad_avatar",
]


class _Message(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Shared shapes ----------------------------------------------------------------


class Segment(_Message):
    """The round the room is in: one mode, a run of consecutive questions.

    Grouped from the ``questions.round`` column rather than stored a second time, so it
    cannot drift from the questions it describes. ``start`` is a position in the room's
    question list, which is what ``OpenQuestion.index`` counts in too, so the question
    number within the round is ``index - start + 1``.
    """

    mode: str  # a mode id (``app/modes``), never a type id; the client's mode registry key
    index: int  # 0-based round number
    total: int  # rounds in this room
    start: int  # position of the round's first question
    count: int  # questions in the round


class RoomView(_Message):
    code: str
    status: RoomStatus
    settings: RoomSettings
    current_index: int | None
    total: int
    phase: Phase
    # When the current timed phase ends: a splash gives way to its first question, a
    # reveal to the next question or to the standings, the standings to the next round.
    # Null while a question is open, during a splash still waiting for the room to be
    # ready (D7), and in a room that is not playing. Also on ``question_closed``, but a
    # splash, reveal or standings a client arrives into (a reconnect, or a room that just
    # came back from a restart) has no frame of its own to carry it.
    next_at: datetime | None
    # The round in progress, null before the first question and once the game is over.
    segment: Segment | None
    # When the game ended, null until it has. Every browser files the result under it, so
    # it comes from the server's clock and not each one's own.
    finished_at: datetime | None
    # How many rounds the room plays, sent only when ``settings.hide_rounds`` keeps the
    # rest of ``settings.modes`` from a non-admin. Counted off the stored questions, so it
    # agrees with ``Segment.total``.
    rounds: int | None = Field(default=None, exclude_if=lambda rounds: rounds is None)


class PlayerView(_Message):
    id: UUID
    display_name: str
    # An id in ``data/heads/heads.json``, or null for a player who never chose one: the
    # client then draws the head derived from ``id`` (D4, section 5.2).
    avatar: int | None
    role: Role
    connected: bool
    # The ready check (D7): ready to start in the lobby, ready for this round on a splash.
    # Every splash starts it false for everyone again.
    ready: bool
    # Is typing a name in the lobby: "picking a name…". Advice, never a gate.
    editing: bool


class Standing(_Message):
    player_id: UUID
    display_name: str
    avatar: int | None  # as on ``PlayerView``
    points: int
    rank: int


class OpenQuestion(_Message):
    """What every socket sees while a question is open: ``client_view`` only, never the
    answer or the raw payload (section 3, "What the server withholds from the admin")."""

    # The ``questions`` row id, never the content id: that one hashes the answer.
    question_id: str
    index: int
    total: int
    type: str  # how it is answered: the key into ``questions/types``
    # Which mode it was drawn for (``app/modes``); since T16 not the same string as ``type``.
    # On the question itself rather than only on ``segment``, because it is a fact about
    # the question, and the round it sits in is a different fact that merely agrees today.
    mode: str
    # Repeated from ``RoomView`` because the client patches its room from this frame
    # rather than replacing it, and a round can change without a splash to announce it
    # (``splash_seconds`` at zero, or two consecutive rounds of the same mode).
    segment: Segment
    view: dict[str, Any]
    # The NPC interrupting the round with this question, or ``None`` for a question that
    # belongs to its round. An id from ``app/random_events.py``; the client has the copy.
    random_event: str | None = None
    opened_at: datetime
    # When the buttons appear and the clock starts: ``opened_at`` for every question but a
    # random event, where the NPC holds the floor for ``RANDOM_EVENT_HOLD`` first. An
    # answer before it is ``not_open``, and ``ends_at`` is this plus the question's seconds.
    answerable_at: datetime
    ends_at: datetime
    you_can_answer: bool
    # How many have answered, of how many can (D8's waiting state). Current as of this
    # frame: zero on ``question_open``, the live count in a ``welcome``, and kept up to
    # date after that by ``answer_count`` and the answerer's own ``answer_ack``.
    answered: int = 0
    of: int = 0


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


class Kick(_Message):
    t: Literal["kick"]
    player_id: UUID


class EndGame(_Message):
    t: Literal["end_game"]


class SetProfile(_Message):
    """Rename, re-roll the head, or both (D4). One message for both, because they are the
    same operation on the same row: validated like a join, broadcast as ``room_updated``.

    An omitted field is left as it is. The bounds here are only the outer ones; the name
    rules and the manifest's length are the manager's to apply.
    """

    t: Literal["set_profile"]
    display_name: str | None = Field(default=None, max_length=200)
    avatar: int | None = Field(default=None, ge=0, le=32767, strict=True)


class Ready(_Message):
    """Tap ready, or take it back (D7). In the lobby and on a splash; nowhere else."""

    t: Literal["ready"]
    ready: bool = Field(strict=True)


class Editing(_Message):
    """The name field gained focus (``on``), or lost it. Lobby only; ignored anywhere else."""

    t: Literal["editing"]
    on: bool = Field(strict=True)


ClientMessage = Annotated[
    Hello
    | Ping
    | Answer
    | StartGame
    | Skip
    | Promote
    | Kick
    | EndGame
    | SetProfile
    | Ready
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
    server_time: datetime
    # ``/VERSION`` of the running server. A client built from another version reloads
    # itself, so a deploy never leaves an old bundle reading frames it does not know.
    server_version: str


class RoomUpdated(_Message):
    """Join, leave, promote, kick, status change, ``set_profile``, and the start of a
    splash or of the standings. Also a ready tap, connect or disconnect that moves the
    room itself, which on a splash is its countdown."""

    t: Literal["room_updated"] = "room_updated"
    room: RoomView
    players: list[PlayerView]


class PlayersUpdated(_Message):
    """A ready tap, an ``editing`` change, connect or disconnect that changed the players
    and nothing else."""

    t: Literal["players_updated"] = "players_updated"
    players: list[PlayerView]


class QuestionOpen(_Message):
    t: Literal["question_open"] = "question_open"
    question: OpenQuestion


class AnswerAck(_Message):
    """How the answer will be scored and where it landed, never whether it was right.

    ``band`` is the speed bucket (1..5) for ``speed``, the step the answer arrived on for
    ``step``, and null for ``rank``: a guess ranked against everyone else's is worth
    nothing anybody can know until they have all answered.
    """

    t: Literal["answer_ack"] = "answer_ack"
    question_id: str
    scoring: Scoring
    band: Annotated[int, Field(ge=1)] | None
    # The room's count with this answer in it: the answerer is left out of the
    # ``answer_count`` broadcast, so the ack is where they hear it.
    answered: int
    of: int


class AnswerCount(_Message):
    """Somebody else has answered the open question: how many have, of how many can.

    Only a count, never who, and never what: the waiting state (D8) shows "4 of 6
    answered" and nothing a player could read an answer off. ``of`` is every connected
    player allowed to answer plus anyone who answered and has since dropped, so the count
    never reads more than the total. A disconnect does not send a fresh count; the next
    answer does.
    """

    t: Literal["answer_count"] = "answer_count"
    question_id: str
    answered: int
    of: int


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
    results: dict[UUID, PlayerResult]
    standings: list[Standing]
    next_at: datetime | None


class GameFinished(_Message):
    t: Literal["game_finished"] = "game_finished"
    standings: list[Standing]


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
