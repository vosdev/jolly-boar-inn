"""A logarithmic slider between two whole numbers, and credit by how far along it a guess lands.

The client's half is ``lib/slider.ts``; the two must agree on the grid, or a player could
drag to a value the server refuses.

The slider snaps to three significant figures, so every two-figure price is a position and
the player can land on it exactly, while a decade still holds only 900 of them. Its track is
logarithmic: a step from 110k to 120k is as wide as one from 1.1M to 1.2M, which is how
far off a price guess feels.

Credit is measured in that track's width, not in coins, so a 3x range and a 30x range are
equally forgiving. A guess that rounds to the answer at two figures is the answer: the
stored price is itself rounded to two, so "within its rounding" is as close as anyone can
be. Outside that band credit falls linearly from its edge, not from the answer, so a guess
one step outside the band earns nearly full credit instead of dropping by a sixth.
"""

import math
from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types.exact import whole_number

FIGURES = 3
ANSWER_FIGURES = 2
# How far from the answer's band, as a share of the slider's width, credit reaches 0.
REACH = 0.25


def sig_step(value: int, figures: int) -> int:
    """The grid's spacing at ``value``: 1 below ``figures`` digits, else a power of ten."""
    return 10 ** max(0, len(str(value)) - figures)


def round_sig(value: int, figures: int) -> int:
    """``value`` to ``figures`` significant figures, half up."""
    step = sig_step(value, figures)
    return (value + step // 2) // step * step


def on_grid(value: int, figures: int) -> bool:
    """Whether ``value`` has at most ``figures`` significant figures."""
    return value % sig_step(value, figures) == 0


def band(answer: int) -> tuple[int, int]:
    """The lowest and highest whole numbers that round to ``answer`` at two figures."""
    # Just under a power of ten the grid is ten times finer, so the band's lower half is too.
    low = answer - sig_step(answer - 1, ANSWER_FIGURES) // 2 if answer > 1 else answer
    high = answer + (sig_step(answer, ANSWER_FIGURES) - 1) // 2
    return low, high


def position(value: float, low: int, high: int) -> float:
    """Where ``value`` sits on the track, 0 at ``low`` and 1 at ``high``."""
    return math.log(value / low) / math.log(high / low)


def parse(low: int, high: int, value: Any) -> int | None:
    """``value`` if it is a slider position in ``[low, high]``, else ``None``."""
    guess = whole_number(value)
    if guess is None or not low <= guess <= high or not on_grid(guess, FIGURES):
        return None
    return guess


def credit(low: int, high: int, answer: int, guess: int) -> float:
    """1.0 inside the answer's band, falling linearly to 0 at ``REACH`` of the width past it."""
    near, far = band(answer)
    if near <= guess <= far:
        return 1.0
    edge = near if guess < near else far
    distance = abs(position(guess, low, high) - position(edge, low, high))
    return max(0.0, 1.0 - distance / REACH)


def grade(low: int, high: int, answer: int, submissions: list[Submission]) -> dict[UUID, float]:
    """Each submission's ``credit``; one that is not a whole number earns nothing."""
    return {
        s.player_id: credit(low, high, answer, s.value)
        if isinstance(s.value, int) and not isinstance(s.value, bool)
        else 0.0
        for s in submissions
    }
