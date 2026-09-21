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
Phase = Literal["idle", "splash", "open", "reveal"]
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
    # reveal to the next question. Null while a question is open, and in a room that is
    # not playing. Also on ``question_closed``, but a splash or a reveal a client arrives
    # into (a reconnect, or a room that just came back from a restart) has no frame of its
    # own to carry it.
    next_at: datetime | None
    # The round in progress, null before the first question and once the game is over.
    segment: Segment | None


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


class Standing(_Message):
    player_id: UUID
    display_name: str
    avatar: int | None  # as on ``PlayerView``
    points: int
    rank: int


class OpenQuestion(_Message):
    """What every socket sees while a question is open: ``client_view`` only, never the
    answer or the raw payload (section 3, "What the server withholds from the admin")."""

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
    opened_at: datetime
    ends_at: datetime
    you_can_answer: bool


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
    t: Literal["skip"]


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


ClientMessage = Annotated[
    Hello | Ping | Answer | StartGame | Skip | Promote | Kick | EndGame | SetProfile | Ready,
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


class RoomUpdated(_Message):
    """Join, leave, connect, disconnect, promote, kick, status change, ``set_profile``,
    ``ready``, and the start of a splash."""

    t: Literal["room_updated"] = "room_updated"
    room: RoomView
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
    Welcome | RoomUpdated | QuestionOpen | AnswerAck | QuestionClosed | GameFinished | Pong | Error
)
