"""Closest number: a question with a number for an answer, and whoever gets nearest wins.

Payload shape (schema ``$defs/closest_number``)::

    {"prompt": str, "answer": number, "unit"?: str, "image"?: asset, "explanation"?: str}

The host's favourite question -- how many Zulrah kills does the clan's worst pker have, how
many hours did the Inferno cape take -- and the one type nobody is expected to get right.
So it is not scored on right and wrong, and not on speed either: the closest guess should
win whether it arrived first or last (``SCORING = RANK``, section 6). That is also why
``grade`` takes every submission at once, which is the reason every type's ``grade`` does.

The credit ladder is section 6's table. An exact guess is 1.0, whatever anyone else did;
then the closest guesses that were not exact are 0.9, the next closest 0.8, the next 0.7,
and every other answer 0.0, which the reveal tally counts as wrong. A player who sent
nothing is not in ``submissions`` and so not in what this returns.

Ties share the better rank, and the ranks are dense: two players the same distance away
are both "closest", and the guess behind them is second closest, not third. That is the
rule the standings already count ranks by, and it reads the way a host would call it out:
the second-closest *guess*, however many people made the closest one.

``parse_value`` takes an int or a float and nothing else, and only a finite one. JSON
parsing here will turn ``1e400`` into infinity and accept ``NaN``, and a huge integer
cannot be subtracted from a float answer at all, so any of the three would reach the close
and stop the room's timer task with an exception rather than being refused on arrival.
``check`` holds a stored ``answer`` to the same rule.
"""

import math
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types.bounds import Bounds
from app.questions.types.scoring import Scoring

SCORING = Scoring.RANK
# A number to think about and type, where a guess made in the last second is worth what
# one made in the first. Twenty seconds leaves room to argue it out loud; a minute is as
# long as a room will wait on one number.
SECONDS = Bounds(default=20, minimum=10, maximum=60)

EXACT = 1.0
# The closest non-exact guess, the next, the next; then everybody else who answered.
LADDER = (0.9, 0.8, 0.7)
FURTHER = 0.0

_OPEN_KEYS = ("prompt", "image", "unit")


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the question and the unit to answer in."""
    return {key: payload[key] for key in _OPEN_KEYS if key in payload}


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus the number and why."""
    shown = {**client_view(payload), "answer": payload["answer"]}
    if "explanation" in payload:
        shown["explanation"] = payload["explanation"]
    return shown


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    answer = _as_written(payload["answer"])
    off = {s.player_id: abs(_as_written(s.value) - answer) for s in submissions}
    # Dense ranks over the distinct misses: equal distances share one rung of the ladder.
    misses = sorted({distance for distance in off.values() if distance != 0})
    rung = {miss: LADDER[i] if i < len(LADDER) else FURTHER for i, miss in enumerate(misses)}
    return {pid: EXACT if distance == 0 else rung[distance] for pid, distance in off.items()}


def parse_value(payload: dict[str, Any], value: Any) -> int | float | None:
    """A finite number, as sent; ``None`` for anything else."""
    # ``True == 1``, so a ``true`` would otherwise guess 1; see ``exact``.
    if isinstance(value, bool) or not isinstance(value, int | float) or not _finite(value):
        return None
    return value


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: the answer is a number a guess can be measured against."""
    answer = payload["answer"]
    if not _finite(answer):
        return [f"answer: {answer!r} is not a finite number, so no guess can be closest"]
    return []


def _as_written(value: int | float) -> Decimal:
    """The number as the decimal it was typed as. In float arithmetic 1.1 and 0.9 are not
    quite the same distance from 1, and a player who guessed either would call it a tie.
    """
    return Decimal(str(value))


def _finite(value: int | float) -> bool:
    try:
        return math.isfinite(value)
    except OverflowError:  # an int too large to be a float, which ``abs(value - 1.5)`` needs
        return False
