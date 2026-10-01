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
model's back. A room read back from the database (``RoomSettings.stored``) goes further:
it keeps a round whose mode has left the registry, which still plays because each of its
questions carries its own type, and drops keys a newer release wrote, so a downgrade does
not strand every room that release created.

Random events are the other thing a room is made of, and ``random_event_frequency`` says
how many: one per 20, 10 or 5 round questions (``EVENT_EVERY``), added on top of the
rounds rather than taken out of them, so one mode of ten questions at ``default`` plays
eleven. ``rooms/selection.py`` places them. There is no off switch -- a host who wants
fewer picks ``less`` -- because the events are where the NPCs' own questions live, and a
game without them is a game without the part that is allowed to be silly.

The host's own questions are not a round and have no entry in ``modes``: each takes one of
those event slots. So the slot count is also their cap, and
``NewRoomSettings.check_custom_questions`` refuses a room that asks for more, naming the
count, the limit and the frequency, rather than letting selection drop the overflow where
the host would only find out during the game.

Until T22 the choice was a boolean, ``random_events``: whether the packs could interrupt
as well as the host. A stored room still says so, and reads back as ``default`` for true
and as ``None`` for false -- "the host's questions only, one per round after the first",
the rules it was created under. ``NewRoomSettings`` never takes ``None``, so no new room
is made that way; it exists so every stored room still loads.
"""

from collections.abc import Sequence
from typing import Any, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)

from app.modes import MODES, questions_bounds, seconds_bounds, type_seconds

# The most questions one room may be created with, over all of its rounds and the events
# inside them. Nothing in the game loop cares; it is there so a host cannot ask for an
# evening that never ends.
MAX_QUESTIONS_PER_ROOM = 100

Frequency = Literal["less", "default", "more"]
# One random event per this many round questions (ideas/phase2.md T22, "How often"). Ten is
# roughly once a round at the default round lengths, which is about as often as the game
# itself interrupts anyone; five is a room that came for the NPCs.
EVENT_EVERY: dict[str, int] = {"less": 20, "default": 10, "more": 5}


def _stored(info: ValidationInfo) -> bool:
    return bool(info.context and info.context.get("stored"))


def _known_keys(model: type[BaseModel], data: Any, info: ValidationInfo, *legacy: str) -> Any:
    """``data`` without the keys ``model`` does not have, when it is being read back."""
    if not _stored(info) or not isinstance(data, dict):
        return data
    return {k: v for k, v in data.items() if k in model.model_fields or k in legacy}


def event_windows(lengths: Sequence[int], every: int) -> list[list[tuple[int, int]]]:
    """Each window of ``every`` round questions that has room for an event, in play order.

    ``lengths`` are the rounds' question counts, in play order. A window lists where its
    event may go, as ``(round, position)`` of the question it would follow: any but its
    round's last. A window of nothing but rounds' last questions has nowhere, and is left
    out. Selection draws from these and the settings count them, so the slots a room is
    promised are the slots it gets.
    """
    played = [
        (number, at, at < length - 1)
        for number, length in enumerate(lengths)
        for at in range(length)
    ]
    windows: list[list[tuple[int, int]]] = []
    for start in range(0, len(played) - every + 1, every):
        inside = [(number, at) for number, at, open_ in played[start : start + every] if open_]
        if inside:
            windows.append(inside)
    return windows


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
    def _defaults_from_the_mode(cls, data: Any, info: ValidationInfo) -> Any:
        """Fill what was left out from the mode's own bounds.

        A mode the registry does not know is filled from the fallbacks rather than left
        short: the problem with ``{"mode": "closest_number"}`` is the mode, and the host
        should read that from ``modes`` and not two complaints about missing numbers.
        """
        data = _known_keys(cls, data, info)
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
    # One random event per 20, 10 or 5 round questions. ``None`` is a room stored before
    # T22 with ``random_events: false``: its host's questions only (see the module
    # docstring). Never ``None`` for a room created since.
    random_event_frequency: Frequency | None = "default"
    reveal_seconds: int = Field(default=8, ge=0)
    # Whether a round's mode is introduced before its first question: zero turns the splash
    # off, which is what the test suite runs with, and anything else turns it on. Since D7
    # the number is no longer a length -- a splash ends when the room is ready or the host
    # skips it (``rooms/ready.py``) -- but it stays an int so every stored room still reads.
    splash_seconds: int = Field(default=8, ge=0)
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

    @classmethod
    def stored(cls, data: Any) -> Self:
        """Read a room's settings back from ``rooms.settings``, whichever build wrote them."""
        return cls.model_validate(data, context={"stored": True})

    @model_validator(mode="before")
    @classmethod
    def _frequency_from_the_boolean(cls, data: Any, info: ValidationInfo) -> Any:
        """Read a room stored with T21's ``random_events`` as the frequency it meant.

        Only a real boolean is translated. Anything else is left where it is, for
        ``extra="forbid"`` to refuse by name, or for ``stored`` to drop.
        """
        data = _known_keys(cls, data, info, "random_events")
        if not isinstance(data, dict) or not isinstance(data.get("random_events"), bool):
            return data
        translated = {k: v for k, v in data.items() if k != "random_events"}
        translated.setdefault(
            "random_event_frequency", "default" if data["random_events"] else None
        )
        return translated

    @field_validator("modes")
    @classmethod
    def _supported_and_unique(
        cls, modes: list[ModeSettings], info: ValidationInfo
    ) -> list[ModeSettings]:
        unknown = [entry.mode for entry in modes if entry.mode not in MODES]
        if unknown and not _stored(info):
            raise ValueError(f"unsupported mode(s): {unknown}")
        events = [m for m in (e.mode for e in modes) if m in MODES and not MODES[m].is_round]
        if events and not _stored(info):
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
        """How many random events the room asks for: one per ``EVENT_EVERY`` round questions,
        less any window of one-question rounds, which has nowhere to put one.

        Counted in the listed order, so a room whose rounds are shuffled can still come out
        a slot short, and ``create`` refuses it then. A stored room with no frequency has
        the old count instead, one per round after the first.
        """
        if self.random_event_frequency is None:
            return len(self.modes) - 1
        lengths = [entry.questions for entry in self.modes]
        return len(event_windows(lengths, EVENT_EVERY[self.random_event_frequency]))

    def entry_for(self, mode: str) -> ModeSettings | None:
        return next((entry for entry in self.modes if entry.mode == mode), None)

    def seconds_for(self, mode: str, type_id: str) -> int:
        """How long one question stays open: its round's setting, or its type's default.

        The clamp is for stored rooms, not for new ones: ``NewRoomSettings`` refuses
        anything outside the mode's ``Bounds`` on the way in, so the only way past it is a
        room created before the bounds moved. A question whose mode has no entry is a
        random event, which has no round to take a length from, so its own type decides.
        """
        entry = self.entry_for(mode)
        if entry is None:
            return type_seconds(type_id).default
        return seconds_bounds(mode).clamp(entry.seconds)


class NewRoomSettings(RoomSettings):
    """What ``POST /api/rooms`` accepts: section 4's ranges, checked on the way in."""

    # A new room shuffles unless its host numbers the rounds; a stored one says which.
    mode_order: Literal["listed", "random"] = "random"
    random_event_frequency: Frequency = "default"
    reveal_seconds: int = Field(default=8, ge=2, le=30)
    splash_seconds: int = Field(default=8, ge=0, le=30)
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
        # Every slot is a question the room will play, whoever ends up asking it: the
        # host's questions take slots rather than adding to them, and the packs fill the
        # rest.
        total = self.question_count + self.random_event_slots
        if total > MAX_QUESTIONS_PER_ROOM:
            raise ValueError(
                f"{total} questions over all rounds and random events, more than the"
                f" room's limit of {MAX_QUESTIONS_PER_ROOM}"
            )
        return self

    def check_custom_questions(self, count: int) -> None:
        """Refuse more of the host's own questions than the room has random-event slots.

        Raises ``ValueError`` naming the count, the limit and the frequency. Never
        truncates: a host who loses two of five questions to a silent cut finds out during
        the game.
        """
        if count <= self.random_event_slots:
            return
        frequency = self.random_event_frequency
        assert frequency is not None  # ``NewRoomSettings`` has no ``None`` to offer
        remedy = (
            "Add questions to the rounds or write fewer of your own"
            if frequency == "more"
            else "Pick random_event_frequency 'more', add questions, or write fewer of your own"
        )
        raise ValueError(
            f"{count} custom questions, but {self.question_count} round questions at"
            f" random_event_frequency {frequency!r} make room for {self.random_event_slots}"
            f" random events: one per {EVENT_EVERY[frequency]}. {remedy}"
        )
