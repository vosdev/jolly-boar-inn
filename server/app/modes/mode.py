"""``Mode``: one round a host can pick, and the question type it is answered in.

Its own module rather than a class in ``modes/__init__.py`` for the same reason ``Bounds``
has one: a test's stub mode, or anything else that needs the shape, should not have to
import the registry to get it.
"""

from dataclasses import dataclass

from app.questions.types.bounds import Bounds


@dataclass(frozen=True, slots=True)
class Mode:
    """One entry in ``MODES``.

    ``id`` is what ``questions.mode`` and ``settings.modes[].mode`` hold. ``type`` is the
    key into ``questions/types``: the answer shape, and so what grades the round.

    ``questions`` and ``seconds`` are the numbers a mode disagrees with its type about.
    ``None`` means "whatever the type says", which is what ``questions_bounds`` and
    ``seconds_bounds`` fall back to. A pace belongs to the answer shape far more often
    than to the round -- two names and one word is quick whatever the round is about --
    so a mode that states neither is the ordinary case, not a missing one.

    ``type`` is ``None`` for one mode only, ``custom``: the host's own questions, each of
    which carries a type of its own. It is also the one mode that is not a round
    (``is_round``), so it states its ``seconds`` and has no ``questions`` to state.
    """

    id: str
    type: str | None
    questions: Bounds | None = None
    seconds: Bounds | None = None

    @property
    def is_round(self) -> bool:
        """Whether a host can pick it: every mode but the one whose questions are events."""
        return self.type is not None
