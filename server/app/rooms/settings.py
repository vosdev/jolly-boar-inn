"""``rooms.settings`` (section 4 of ideas/architecture.md): fixed at creation.

A room plays one round per game mode: pick three modes and the room is three rounds long.
There is no global round count and no global question length, because the two numbers
that used to be global are the two that differ most between modes. Each mode carries its
own ``questions`` and ``seconds`` instead (``ModeSettings``), defaulting to what the mode
registry (``app/modes``) says a round of it should feel like.

``modes[].mode`` is a mode id, a key into ``MODES`` and never into ``TYPES``. A host picks
rounds; which answer shape a round is played in is the mode's business, and nothing in
the settings mentions it.

Two models, one shape. ``RoomSettings`` is what a room *is*: the field types, the
supported modes, and the little the game loop cannot work without (a question has to
last a positive number of seconds). ``NewRoomSettings`` adds the ranges section 4 gives,
which are the per-mode ``Bounds`` plus a cap on the room as a whole, because those are a
policy about what a host may ask for and the only place that policy belongs is where the
request comes in.

Keeping the ranges off the stored model means two things. A room created under one set of
bounds still loads after the bounds change, instead of becoming unrehydratable. And the
test suite can run a whole game with one-second questions without going behind the
model's back.

The host's own questions are not a round and have no entry in ``modes``: each is a random
event, one per round after the first (``rooms/selection.py``). That caps them at one fewer
than the modes picked, and ``NewRoomSettings.check_custom_questions`` refuses a room that
asks for more, naming both numbers, rather than letting selection drop the overflow where
the host would only find out during the game. ``random_events`` is the one choice left
about events -- whether the packs may interrupt as well -- and ``random_event_seconds`` is
how long the NPC holds the floor before the buttons appear (T22).
"""

from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modes import MODES, questions_bounds, seconds_bounds

# The most questions one room may be created with, over all of its rounds and the events
# inside them. Nothing in the game loop cares; it is there so a host cannot ask for an
# evening that never ends.
MAX_QUESTIONS_PER_ROOM = 100


class ModeSettings(BaseModel):
    """One mode's round: how many questions it holds, and how long each one is open.

    Both numbers are optional on the way in and filled from the mode's own ``Bounds``, so
    ``{"mode": "more_less"}`` is a complete round at that mode's own pace. After
    validation they are always present, which is what the game loop and the lobby read.
    """

    model_config = ConfigDict(extra="forbid")

    mode: str
    questions: int = Field(ge=0)
    seconds: int = Field(gt=0)  # a zero would divide by zero in scoring

    @model_validator(mode="before")
    @classmethod
    def _defaults_from_the_mode(cls, data: Any) -> Any:
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
    """One round of the first registered mode: the smallest room that is still a game."""
    return [ModeSettings(mode=next(iter(MODES)))]


class RoomSettings(BaseModel):
    """A room's settings as stored in and read back from ``rooms.settings``."""

    model_config = ConfigDict(extra="forbid")

    # One round each, in this order unless ``mode_order`` says to shuffle them.
    modes: list[ModeSettings] = Field(default_factory=default_modes, min_length=1)
    # ``"listed"``: the rounds play in the order the host arranged them, which is the
    # order this list is in. ``"random"``: shuffled once, at creation.
    mode_order: Literal["listed", "random"] = "listed"
    # Whether a pack question may interrupt a round as a random event. The host's own
    # questions always do -- there is nowhere else for them to go -- so this only decides
    # whether the packs may as well.
    random_events: bool = True
    reveal_seconds: int = Field(default=8, ge=0)
    # Whether a round's mode is introduced before its first question: zero turns the splash
    # off, which is what the test suite runs with, and anything else turns it on. Since D7
    # the number is no longer a length -- a splash ends when the room is ready or the host
    # skips it (``rooms/ready.py``) -- but it stays an int so every stored room still reads.
    splash_seconds: int = Field(default=8, ge=0)
    # How long an event's NPC holds the floor before the buttons appear. Stored from T21,
    # read from T22, which is when there is an NPC to hold it; zero is a plain question.
    random_event_seconds: int = Field(default=2, ge=0)
    # How long the standings hold the floor between two rounds (D9). Zero turns them off,
    # as ``splash_seconds`` does for the splash; the game's last round never has them,
    # because the final screen is its standings. Defaulted, so a room stored before the
    # field existed reads as a room that has them.
    standings_seconds: int = Field(default=10, ge=0)
    close_when_all_answered: bool = True
    # Name the players who answered wrong under a reveal (D8). The host's call, off unless
    # they turn it on: the count of who got it right is always shown, the names are a
    # room's taste. Nothing on the wire changes, since ``question_closed.results`` already
    # carries every row; the setting only says whether the client prints the names.
    # Defaulted, so a room stored before it existed reads as one that does not.
    name_wrong_answers: bool = False
    # ``None`` means "the server's MAX_PLAYERS_PER_ROOM"; ``RoomManager.create`` resolves it,
    # so a stored room always has a number here.
    max_players: int | None = Field(default=None, ge=1)

    @field_validator("modes")
    @classmethod
    def _supported_and_unique(cls, modes: list[ModeSettings]) -> list[ModeSettings]:
        unknown = [entry.mode for entry in modes if entry.mode not in MODES]
        if unknown:
            raise ValueError(f"unsupported mode(s): {unknown}")
        events = [entry.mode for entry in modes if not MODES[entry.mode].is_round]
        if events:
            # The host's questions go in ``custom_questions``, and land as random events.
            raise ValueError(f"{events} cannot be picked as a round: its questions are events")
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

    @property
    def random_event_slots(self) -> int:
        """How many random events the room can hold: one per round after the first."""
        return len(self.modes) - 1

    def entry_for(self, mode: str) -> ModeSettings | None:
        return next((entry for entry in self.modes if entry.mode == mode), None)

    def seconds_for(self, mode: str) -> int:
        """How long one question of this mode stays open, the mode's own range included.

        The clamp is for stored rooms, not for new ones: ``NewRoomSettings`` refuses
        anything outside the mode's ``Bounds`` on the way in, so the only way past it is a
        room created before the bounds moved. A mode with no entry -- ``custom``, or the
        unpicked mode a pack event was drawn from -- plays at its own default.
        """
        entry = self.entry_for(mode)
        bounds = seconds_bounds(mode)
        return bounds.default if entry is None else bounds.clamp(entry.seconds)


class NewRoomSettings(RoomSettings):
    """What ``POST /api/rooms`` accepts: section 4's ranges, checked on the way in."""

    reveal_seconds: int = Field(default=8, ge=2, le=30)
    splash_seconds: int = Field(default=8, ge=0, le=30)
    random_event_seconds: int = Field(default=2, ge=0, le=10)
    standings_seconds: int = Field(default=10, ge=0, le=30)

    @field_validator("modes")
    @classmethod
    def _within_the_modes_own_bounds(cls, modes: list[ModeSettings]) -> list[ModeSettings]:
        for entry in modes:
            if entry.mode not in MODES or not MODES[entry.mode].is_round:
                continue  # ``_supported_and_unique`` is the one that reports these
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
        return modes

    @model_validator(mode="after")
    def _within_the_room_cap(self) -> Self:
        # When the packs may interrupt, any slot may end up holding an event, so the cap
        # counts every slot. When they may not, only the host's own questions are events,
        # and ``check_custom_questions`` counts those.
        self._check_total(self.random_event_slots if self.random_events else 0)
        return self

    def check_custom_questions(self, count: int) -> None:
        """Refuse more of the host's own questions than the room has random-event slots.

        Raises ``ValueError`` naming the count and the limit. Never truncates: a host who
        loses two of five questions to a silent cut finds out during the game.
        """
        if count > self.random_event_slots:
            raise ValueError(
                f"{count} custom questions, but a room of {len(self.modes)} modes holds at"
                f" most {self.random_event_slots}: one per round after the first. Pick more"
                " modes or write fewer questions"
            )
        if not self.random_events:
            self._check_total(count)

    def _check_total(self, events: int) -> None:
        total = self.question_count + events
        if total > MAX_QUESTIONS_PER_ROOM:
            raise ValueError(
                f"{total} questions over all rounds and random events, more than the"
                f" room's limit of {MAX_QUESTIONS_PER_ROOM}"
            )
