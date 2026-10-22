"""Closest number: a question with a number for an answer, typed rather than slid.

Payload shape (schema ``$defs/closest_number``)::

    {"intro"?: str, "prompt": str, "answer": number, "within"?: number, "unit"?: str,
     "image"?: asset, "explanation"?: str}

Each guess is measured against the answer alone, never against the room's other guesses,
so a room where everybody is far off pays nobody. An exact guess is 1.0. ``within``, in
the answer's unit, is how far off still scores: 0.75 just off the answer, falling linearly
to 0.25 at ``within`` itself, and 0.0 past it. Without ``within`` only the exact answer
scores, which is what a year or a quest count wants: 2017 is not nearly 2013. Players see
``within`` while the question is open, so they know whether to be precise or to estimate.

Speed does not count (``SCORING = ACCURACY``, section 8): a number takes thinking, and a
player who knows that takes the whole clock rather than rushing a guess in.

``parse_value`` takes an int or a float and nothing else, and only a finite one. JSON
parsing here will turn ``1e400`` into infinity and accept ``NaN``, and a huge integer
cannot be subtracted from a float answer at all, so any of the three would reach the close
and stop the room's timer task with an exception rather than being refused on arrival.
``check`` holds a stored ``answer`` and ``within`` to the same rule.
"""

import math
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types.scoring import Scoring
from app.questions.types.timing import Timing

SCORING = Scoring.ACCURACY
# A number to think about and type; the reveal lists everyone's guesses.
ANSWER = Timing(base=20)
REVEAL = Timing(base=8)

EXACT = 1.0
# Credit just off the answer and at ``within``: a near miss is clearly worth less than exact.
NEAR, EDGE = Decimal("0.75"), Decimal("0.25")

_OPEN_KEYS = ("intro", "prompt", "within", "unit")


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the question, how close scores, and the unit."""
    return {key: payload[key] for key in _OPEN_KEYS if key in payload}


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus the number and why."""
    shown = {**client_view(payload), "answer": payload["answer"]}
    if "explanation" in payload:
        shown["explanation"] = payload["explanation"]
    return shown


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    answer = _as_written(payload["answer"])
    within = _as_written(payload.get("within", 0))
    return {s.player_id: _credit(abs(_as_written(s.value) - answer), within) for s in submissions}


def _credit(off: Decimal, within: Decimal) -> float:
    if off == 0:
        return EXACT
    if off > within:
        return 0.0
    return float(NEAR - (NEAR - EDGE) * off / within)


def parse_value(payload: dict[str, Any], value: Any) -> int | float | None:
    """A finite number, as sent; ``None`` for anything else."""
    # ``True == 1``, so a ``true`` would otherwise guess 1; see ``exact``.
    if isinstance(value, bool) or not isinstance(value, int | float) or not _finite(value):
        return None
    return value


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: the answer and ``within`` are numbers a guess can be measured against."""
    problems = []
    answer = payload["answer"]
    if not _finite(answer):
        problems.append(f"answer: {answer!r} is not a finite number, so no guess can be closest")
    if "within" in payload and not _finite(payload["within"]):
        problems.append(f"within: {payload['within']!r} is not a finite number")
    return problems


def _as_written(value: int | float) -> Decimal:
    """The number as the decimal it was typed as. In float arithmetic 1.1 and 0.9 are not
    quite the same distance from 1, and a guess exactly ``within`` off could fall outside it.
    """
    return Decimal(str(value))


def _finite(value: int | float) -> bool:
    try:
        return math.isfinite(value)
    except OverflowError:  # an int too large to be a float, which ``abs(value - 1.5)`` needs
        return False
