"""``Scoring``: which of the three ways a type's credit is turned into points.

A type's ``grade`` says how good an answer was, as credit from 0.0 to 1.0, and nothing
about what that is worth. What it is worth depends on something the type does know and
the grader does not: whether being quick is the skill (``SPEED``), whether only being
right is (``ACCURACY``, where a guess earns the same however late it arrived), or whether
the question gives itself away as it runs (``STEP``, a picture that builds up). So a type
module declares ``SCORING`` and ``rooms/scoring.py`` does the arithmetic; section 6 of
ideas/architecture.md has the three tables.

``SPEED`` is the default, and a module that says nothing gets it: it is what every type
but two wants, and what ``more_less`` has always been scored on.

Its own module for the reason ``Bounds`` has one: every type module may need it, and
``types/__init__.py`` imports every type module.
"""

from dataclasses import dataclass
from enum import StrEnum


class Scoring(StrEnum):
    """The values are what ``answer_ack.scoring`` carries on the wire."""

    SPEED = "speed"
    ACCURACY = "accuracy"
    STEP = "step"


@dataclass(frozen=True, slots=True)
class Steps:
    """A picture that builds up in ``build`` steps, each ``1 / of`` of the answer time, and is
    then whole for the rest: one step more, the last."""

    build: int
    of: int

    def __post_init__(self) -> None:
        if not 0 < self.build < self.of:
            raise ValueError(f"{self.build} build-up steps do not fit in {self.of}")

    @property
    def count(self) -> int:
        """Every step, the whole picture's included."""
        return self.build + 1
