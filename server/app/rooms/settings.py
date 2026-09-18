"""``rooms.settings`` (section 4 of ideas/architecture.md): fixed at creation."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.questions.types import TYPES


class RoomSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_seconds: int = Field(default=30, ge=10, le=120)
    question_count: int = Field(default=20, ge=1, le=100)
    modes: list[str] = Field(default=["higher_lower"], min_length=1)
    order: Literal["shuffle", "custom_last"] = "shuffle"
    reveal_seconds: int = Field(default=8, ge=3, le=30)
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
