"""``rooms.settings`` (section 4 of ideas/architecture.md): fixed at creation.

Two models, one shape. ``RoomSettings`` is what a room *is*: the field types, the
supported modes, and the little the game loop cannot work without (a question has to
last a positive number of seconds). ``NewRoomSettings`` adds the ranges section 4 gives,
because those are a policy about what a host may ask for, and the only place that policy
belongs is where the request comes in.

Keeping the ranges off the stored model means two things. A room created under one set of
bounds still loads after the bounds change, instead of becoming unrehydratable. And the
test suite can run a whole game with one-second questions without going behind the
model's back.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.questions.types import TYPES


class RoomSettings(BaseModel):
    """A room's settings as stored in and read back from ``rooms.settings``."""

    model_config = ConfigDict(extra="forbid")

    question_seconds: int = Field(default=30, gt=0)  # a zero would divide by zero in scoring
    question_count: int = Field(default=20, ge=0)
    modes: list[str] = Field(default=["higher_lower"], min_length=1)
    order: Literal["shuffle", "custom_last"] = "shuffle"
    reveal_seconds: int = Field(default=8, ge=0)
    close_when_all_answered: bool = True
    # ``None`` means "the server's MAX_PLAYERS_PER_ROOM"; ``RoomManager.create`` resolves it,
    # so a stored room always has a number here.
    max_players: int | None = Field(default=None, ge=1)

    @field_validator("modes")
    @classmethod
    def _supported_and_unique(cls, modes: list[str]) -> list[str]:
        unknown = [mode for mode in modes if mode not in TYPES]
        if unknown:
            raise ValueError(f"unsupported question type(s): {unknown}")
        if len(set(modes)) != len(modes):
            raise ValueError("modes must be unique")
        return modes


class NewRoomSettings(RoomSettings):
    """What ``POST /api/rooms`` accepts: section 4's ranges, checked on the way in.

    ``plan.md`` narrows ``question_seconds`` further to 30..60 in the UI; this is the
    outer bound, not the recommended one.
    """

    question_seconds: int = Field(default=30, ge=10, le=120)
    question_count: int = Field(default=20, ge=1, le=100)
    reveal_seconds: int = Field(default=8, ge=3, le=30)
