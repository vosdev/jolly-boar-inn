"""``Timing`` and the room's pace: how long a question stays open, and how long its reveal holds.

Its own module for the reason ``Bounds`` has one: every type module states its timings,
and ``types/__init__.py`` imports every type module.

A type states two timings, ``ANSWER`` and ``REVEAL``, each a base plus seconds per item:
six entries to put in order take longer to place, and to watch fall into place, than four.
What an item is (an option, an entry) is the type's ``items(payload)``. A mode may add
seconds to the answer (``Mode.extra_answer``), when its questions take longer to read than
its type's. The room's pace then scales the lot: a host picks how quick the game is, never
how long one kind of question takes.
"""

import math
from dataclasses import dataclass
from typing import Literal

Pace = Literal["walk", "run", "teleport"]
PACE_FACTOR: dict[str, float] = {"walk": 1.25, "run": 1.0, "teleport": 0.75}
# Teleport takes a quarter off; below these a question is a reflex test and a reveal a blink.
MIN_ANSWER = 5
MIN_REVEAL = 4


@dataclass(frozen=True, slots=True)
class Timing:
    """``base`` seconds plus ``per_item`` for each item the question shows, at ``run`` pace."""

    base: float
    per_item: float = 0.0

    def seconds(self, items: int, pace: str, minimum: int, extra: int = 0) -> int:
        """Whole seconds at ``pace`` with ``extra`` added, never under ``minimum``; a half rounds
        up."""
        exact = (self.base + self.per_item * items + extra) * PACE_FACTOR[pace]
        return max(minimum, math.floor(exact + 0.5))
