"""Points for one graded answer: "Scoring" in ideas/architecture.md.

Pure functions, no room state and no I/O, so this table is the only thing to read when
the numbers are argued about.

Grading happens in two halves. A type's ``grade`` returns credit, 0.0 to 1.0, and this
module turns credit into points one of three ways, picked by the type's ``SCORING``: a
speed bucket (``SPEED``), 1000 whatever the clock says (``ACCURACY``), or the step of a
question that shows more of itself as it runs (``STEP``). Each is one number times credit,
so partial credit needs nothing of its own: three of five in the right place in bucket 2
is 900 x 0.6.

The bucket edges are fractions of the question's own length -- its mode's ``seconds`` --
rather than absolute seconds, so a slow round and a quick one in the same game are both
scored on how fast you were for that round: a 30-second question buckets at 3 / 7.5 / 15 /
22.5 / 30 s, a 10-second one at 1 / 2.5 / 5 / 7.5 / 10 s. Steps are fractions of it too:
Pixel Hunt's 17 build-up steps are a 25th each, and the whole picture is the 18th.

A type whose answer has to be built, an order or a set of pairs, may state a ``GRACE``: a
share of the time no answer could beat, which the edges skip before they start counting.
With grace 0.2 bucket 1 ends at 0.28 and bucket 5 still at the full time.

The *band* is what an answer earns the moment it arrives, before anything is graded: its
bucket, its step, or nothing at all for ``ACCURACY``, where the clock does not count.
``answer_ack`` carries it, and ``points_for`` reads it back at the close.

A team game scores on accuracy alone: ``SPEED`` has no band there and pays its top bucket
times credit, so a teammate who reads slowly costs the team nothing. ``ACCURACY`` and
``STEP`` already pay for something other than speed and score as ever.
"""

import logging
import math
from typing import assert_never

from app.questions.types.scoring import Scoring, Steps

log = logging.getLogger("app.rooms")

BUCKETS: tuple[tuple[float, int], ...] = (
    (0.10, 1000),
    (0.25, 900),
    (0.50, 800),
    (0.75, 700),
    (1.00, 600),
)
SLOWEST = len(BUCKETS)
ACCURACY_TOP = 1000
STEP_TOP, STEP_BOTTOM = 1000, 400


def edges(grace: float = 0.0) -> tuple[float, ...]:
    """Where each speed bucket ends, as fractions of the question's time, after ``grace``."""
    if not 0.0 <= grace < 1.0:
        raise ValueError(f"grace {grace} is outside 0 up to 1")
    # ``grace + edge * (1 - grace)``, written so that grace 0 leaves every edge bit for bit
    # where it was and the last one always lands on exactly 1.0.
    return tuple(edge + grace * (1.0 - edge) for edge, _ in BUCKETS)


def bucket(elapsed_s: float, question_s: int, grace: float = 0.0) -> int:
    """Which speed bucket, 1..5, an answer that took ``elapsed_s`` lands in.

    Edges are inclusive: exactly a tenth of the question's time is still bucket 1.
    Anything past the full time clamps to the slowest bucket, though the room refuses an
    answer that arrives from ``ends_at`` on.
    """
    fraction = elapsed_s / question_s
    for index, edge in enumerate(edges(grace), start=1):
        if fraction <= edge:
            return index
    return SLOWEST


def step(elapsed_s: float, question_s: int, steps: Steps) -> int:
    """Which step, 1..``steps.count``, was on screen when an answer that took ``elapsed_s``
    arrived: a build-up step, or the last once the picture is whole.

    Inclusive edges and a clamp at the end, the same as ``bucket``: an answer on the very
    instant the picture changes is credited to the step it was looking at.
    """
    for k in range(1, steps.build + 1):
        if elapsed_s * steps.of <= k * question_s:
            return k
    return steps.count


def step_points(step: int, count: int) -> int:
    """1000 on the first of ``count`` steps down to 400 on the last, in even strides.

    One step is the first and the last at once, and pays the top rather than dividing by
    zero. A step outside ``1..count`` clamps, as a bucket past the last one does.
    """
    if count == 1:
        return STEP_TOP
    step = max(1, min(count, step))
    return round(STEP_BOTTOM + (STEP_TOP - STEP_BOTTOM) * (count - step) / (count - 1))


def effective(scoring: Scoring, steps: Steps | None) -> Scoring:
    """``STEP`` in a mode with no ``steps`` is ``SPEED``.

    One type serves Pixel Hunt, whose picture builds up, and Who's That NPC?, which shows
    one shadow: a question that never changes has nothing to be early about, so it is
    scored on being quick instead.
    """
    return Scoring.SPEED if scoring is Scoring.STEP and steps is None else scoring


def band(
    scoring: Scoring,
    elapsed_s: float,
    question_s: int,
    steps: Steps | None,
    *,
    team: bool = False,
    grace: float = 0.0,
) -> int | None:
    """What an answer has earned on arrival: its bucket after the type's ``grace``, its step,
    or ``None`` for ``ACCURACY`` and for ``SPEED`` in a team game."""
    match how := effective(scoring, steps):
        case Scoring.SPEED:
            return None if team else bucket(elapsed_s, question_s, grace)
        case Scoring.STEP:
            assert steps is not None  # ``effective`` made it SPEED otherwise
            return step(elapsed_s, question_s, steps)
        case Scoring.ACCURACY:
            return None
        case _:
            assert_never(how)


def points_for(
    scoring: Scoring, credit: float, band: int | None, steps: Steps | None, *, team: bool = False
) -> int:
    """Points for one graded answer: the scoring's table at ``band``, or 1000 for
    ``ACCURACY``, times ``credit``.

    ``band`` is one this module's ``band()`` returned for the same scoring, steps and
    ``team``; nothing else produces them. A wrong answer, like no answer at all, is worth 0.
    """
    if not 0.0 <= credit <= 1.0:
        raise ValueError(f"credit {credit} is outside 0..1")
    match how := effective(scoring, steps):
        case Scoring.SPEED if team:
            assert band is None
            top = BUCKETS[0][1]
        case Scoring.SPEED:
            assert band is not None
            top = BUCKETS[band - 1][1]
        case Scoring.STEP:
            assert band is not None and steps is not None
            top = step_points(band, steps.count)
        case Scoring.ACCURACY:
            top = ACCURACY_TOP
        case _:
            assert_never(how)
    return round(top * credit)


# Credit summed from fractions misses its target by a few ulps: ten tenths are
# 0.9999999999999999, which would not be "correct".
_CREDIT_DIGITS = 9


def settle_credit(type_id: str, raw: object) -> float:
    """One player's credit from ``grade``, rounded and held to 0..1; a bad one is logged."""
    # A type's bug should cost its player the question, not everyone: ``points_for``
    # raising would fail the whole close, and the restart voids the question for all.
    if isinstance(raw, bool) or not isinstance(raw, int | float):
        log.error("%s graded %r, which is not a number: counted as 0", type_id, raw)
        return 0.0
    if isinstance(raw, float) and math.isnan(raw):
        log.error("%s graded NaN: counted as 0", type_id)
        return 0.0
    credit = round(raw, _CREDIT_DIGITS)
    if not 0 <= credit <= 1:
        log.error("%s graded %r, outside 0..1: clamped", type_id, raw)
        credit = min(max(credit, 0), 1)
    # ``+ 0.0`` turns a rounded -1e-12 into 0.0 rather than -0.0.
    return float(credit) + 0.0
