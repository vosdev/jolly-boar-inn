"""``Mode``: one round a host can pick, and the question types it is answered in.

Its own module rather than a class in ``modes/__init__.py`` for the same reason ``Bounds``
has one: a test's stub mode, or anything else that needs the shape, should not have to
import the registry to get it.
"""

from dataclasses import dataclass

from app.questions.types.bounds import Bounds


@dataclass(frozen=True, slots=True)
class Mode:
    """One entry in ``MODES``.

    ``id`` is what ``questions.mode`` and ``settings.modes[].mode`` hold. ``types`` are the
    keys into ``questions/types`` its questions may use: the answer shapes, and so what
    grades them. Most rounds have one; a round may mix several, since every question
    carries its own type and the game loop only ever reads that.

    ``is_round`` is stated rather than derived from ``types``, so that forgetting a type
    cannot quietly turn a round into something no host can pick. The two modes that are
    not rounds, ``custom`` (the host's own questions) and ``random_event`` (the NPCs'), are
    pools of random events: each of their questions carries a type of its own, and is
    paced by it, so they state no types and no numbers.

    ``pool`` names the mode whose pack questions this round draws instead of its own, so
    ``random_events_only`` can play the NPCs' questions as a round. ``setting`` names the
    boolean ``Settings`` field that has to be on for a host to pick the mode: the way a
    round that is not ready for everyone is kept off a public instance.

    ``questions`` and ``seconds`` are the numbers a round disagrees with its types about.
    ``None`` means "whatever the types say", which is what ``questions_bounds`` and
    ``seconds_bounds`` fall back to; a round whose types disagree must state the number
    itself, which ``modes.problems`` checks.
    """

    id: str
    types: frozenset[str]
    is_round: bool = True
    questions: Bounds | None = None
    seconds: Bounds | None = None
    pool: str | None = None
    setting: str | None = None

    def __post_init__(self) -> None:
        # A bare string would be read as a set of its letters.
        if isinstance(self.types, str):
            raise TypeError(f"{self.id}: types must be a collection of type ids, not a str")
        object.__setattr__(self, "types", frozenset(self.types))
