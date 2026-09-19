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

from app.rooms.settings import RoomSettings

RoomStatus = Literal["lobby", "playing", "finished"]
Phase = Literal["idle", "open", "reveal"]
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
]


class _Message(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Shared shapes ----------------------------------------------------------------


class RoomView(_Message):
    code: str
    status: RoomStatus
    settings: RoomSettings
    current_index: int | None
    total: int
    phase: Phase
    # When the reveal ends and the next question opens; null outside a reveal. Also on
    # ``question_closed``, but a reveal a client arrives into (a reconnect, or a room that
    # just came back from a restart) has no ``question_closed`` of its own to carry it.
    next_at: datetime | None


class PlayerView(_Message):
    id: UUID
    display_name: str
    role: Role
    connected: bool


class Standing(_Message):
    player_id: UUID
    display_name: str
    points: int
    rank: int


class OpenQuestion(_Message):
    """What every socket sees while a question is open: ``client_view`` only, never the
    answer or the raw payload (section 3, "What the server withholds from the admin")."""

    question_id: str
    index: int
    total: int
    type: str
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


ClientMessage = Annotated[
    Hello | Ping | Answer | StartGame | Skip | Promote | Kick | EndGame,
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
    """Join, leave, connect, disconnect, promote, kick, status change."""

    t: Literal["room_updated"] = "room_updated"
    room: RoomView
    players: list[PlayerView]


class QuestionOpen(_Message):
    t: Literal["question_open"] = "question_open"
    question: OpenQuestion


class AnswerAck(_Message):
    """Bucket only, never correctness, for everyone."""

    t: Literal["answer_ack"] = "answer_ack"
    question_id: str
    bucket: int = Field(ge=1, le=5)


class PlayerResult(_Message):
    value: Any
    correct: bool
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
