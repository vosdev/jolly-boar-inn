"""``rooms.settings`` (section 4 of ideas/architecture.md): fixed at creation.

A room plays one round per game mode: pick three modes and the room is three rounds long.
There is no global round count and no global question length, because the two numbers
that used to be global are the two that differ most between modes. Each mode carries its
own ``questions`` and ``seconds`` instead (``ModeSettings``), defaulting to what its type
module says a round of it should feel like.

Two models, one shape. ``RoomSettings`` is what a room *is*: the field types, the
supported modes, and the little the game loop cannot work without (a question has to
last a positive number of seconds). ``NewRoomSettings`` adds the ranges section 4 gives,
which are the per-type ``Bounds`` plus a cap on the room as a whole, because those are a
policy about what a host may ask for and the only place that policy belongs is where the
request comes in.

Keeping the ranges off the stored model means two things. A room created under one set of
bounds still loads after the bounds change, instead of becoming unrehydratable. And the
test suite can run a whole game with one-second questions without going behind the
model's back.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.questions.types import TYPES, questions_bounds, seconds_bounds

# The most questions one room may be created with, over all of its rounds. Nothing in the
# game loop cares; it is there so a host cannot ask for an evening that never ends.
MAX_QUESTIONS_PER_ROOM = 100


class ModeSettings(BaseModel):
    """One mode's round: how many questions it holds, and how long each one is open.

    Both numbers are optional on the way in and filled from the type's own ``Bounds``, so
    ``{"mode": "more_less"}`` is a complete round at that mode's own pace. After
    validation they are always present, which is what the game loop and the lobby read.
    """

    model_config = ConfigDict(extra="forbid")

    mode: str
    questions: int = Field(ge=0)
    seconds: int = Field(gt=0)  # a zero would divide by zero in scoring

    @model_validator(mode="before")
    @classmethod
    def _defaults_from_the_type(cls, data: Any) -> Any:
        """Fill what was left out from the mode's own bounds.

        A mode the registry does not know is filled from the fallbacks rather than left
        short: the problem with ``{"mode": "closest_number"}`` is the mode, and the host
        should read that from ``modes`` and not two complaints about missing numbers.
        """
        mode = data.get("mode") if isinstance(data, dict) else None
        if not isinstance(mode, str):
            return data  # not a mode at all; ``mode``'s own field error says so
        filled = dict(data)
        filled.setdefault("questions", questions_bounds(mode).default)
        filled.setdefault("seconds", seconds_bounds(mode).default)
        return filled


def default_modes() -> list[ModeSettings]:
    """One round of the first registered type: the smallest room that is still a game."""
    return [ModeSettings(mode=next(iter(TYPES)))]


class RoomSettings(BaseModel):
    """A room's settings as stored in and read back from ``rooms.settings``."""

    model_config = ConfigDict(extra="forbid")

    # One round each, in this order unless ``mode_order`` says to shuffle them.
    modes: list[ModeSettings] = Field(default_factory=default_modes, min_length=1)
    # ``"listed"``: the rounds play in the order the host arranged them, which is the
    # order this list is in. ``"random"``: shuffled once, at creation.
    mode_order: Literal["listed", "random"] = "listed"
    # Where the room's own questions go; nothing to do with ``mode_order``. Phase 2.
    order: Literal["shuffle", "custom_last"] = "shuffle"
    reveal_seconds: int = Field(default=8, ge=0)
    # How long a round's mode is introduced for before its first question. Zero turns the
    # splash off, which is what the test suite runs with.
    splash_seconds: int = Field(default=8, ge=0)
    close_when_all_answered: bool = True
    # ``None`` means "the server's MAX_PLAYERS_PER_ROOM"; ``RoomManager.create`` resolves it,
    # so a stored room always has a number here.
    max_players: int | None = Field(default=None, ge=1)

    @field_validator("modes")
    @classmethod
    def _supported_and_unique(cls, modes: list[ModeSettings]) -> list[ModeSettings]:
        unknown = [entry.mode for entry in modes if entry.mode not in TYPES]
        if unknown:
            raise ValueError(f"unsupported question type(s): {unknown}")
        picked = [entry.mode for entry in modes]
        if len(set(picked)) != len(picked):
            # One round per mode is the whole rule; the same mode twice would be two
            # rounds of it, and the splash between them would introduce what is playing.
            raise ValueError("modes must be unique: a mode is one round")
        return modes

    @property
    def mode_ids(self) -> list[str]:
        """The modes in play, in the order they were listed."""
        return [entry.mode for entry in self.modes]

    @property
    def question_count(self) -> int:
        """Questions over every round, which is what the room asks the packs for."""
        return sum(entry.questions for entry in self.modes)

    def entry_for(self, mode: str) -> ModeSettings | None:
        return next((entry for entry in self.modes if entry.mode == mode), None)

    def questions_for(self, mode: str) -> int:
        """How many questions this mode's round holds; its type's default if unpicked.

        A mode can be unpicked and still play: a room's own question of a type nobody
        ticked trails the game in a round of its own (see ``selection``).
        """
        entry = self.entry_for(mode)
        return entry.questions if entry is not None else questions_bounds(mode).default

    def seconds_for(self, mode: str) -> int:
        """How long one question of this mode stays open, the type's own range included.

        The clamp is for stored rooms, not for new ones: ``NewRoomSettings`` refuses
        anything outside the type's ``Bounds`` on the way in, so the only way past it is a
        room created before the bounds moved.
        """
        entry = self.entry_for(mode)
        bounds = seconds_bounds(mode)
        return bounds.default if entry is None else bounds.clamp(entry.seconds)


class NewRoomSettings(RoomSettings):
    """What ``POST /api/rooms`` accepts: section 4's ranges, checked on the way in."""

    reveal_seconds: int = Field(default=8, ge=3, le=30)
    splash_seconds: int = Field(default=8, ge=0, le=30)

    @field_validator("modes")
    @classmethod
    def _within_the_types_own_bounds(cls, modes: list[ModeSettings]) -> list[ModeSettings]:
        for entry in modes:
            if entry.mode not in TYPES:
                continue  # ``_supported_and_unique`` is the one that reports this
            questions, seconds = questions_bounds(entry.mode), seconds_bounds(entry.mode)
            if not questions.holds(entry.questions):
                raise ValueError(
                    f"{entry.mode}: questions must be"
                    f" {questions.minimum}..{questions.maximum}, not {entry.questions}"
                )
            if not seconds.holds(entry.seconds):
                raise ValueError(
                    f"{entry.mode}: seconds must be"
                    f" {seconds.minimum}..{seconds.maximum}, not {entry.seconds}"
                )
        total = sum(entry.questions for entry in modes)
        if total > MAX_QUESTIONS_PER_ROOM:
            raise ValueError(f"{total} questions over all rounds, more than the room's limit")
        return modes
