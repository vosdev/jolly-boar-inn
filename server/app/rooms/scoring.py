"""Points for one graded answer: section 6 of ideas/architecture.md.

Pure functions, no room state and no I/O, so this table is the only thing to read when
the numbers are argued about.

Grading happens in two halves. A type's ``grade`` returns credit, 0.0 to 1.0, and this
module turns credit into points one of three ways, picked by the type's ``SCORING``: a
speed bucket (``SPEED``), a share of 1000 for the rung the credit reached (``RANK``, where
the credit is already the ranking), or the step of a question that shows more of itself as
it runs (``STEP``). ``SPEED`` and ``STEP`` are one table and one multiplication, so partial
credit needs nothing of its own: three of five in the right place in bucket 2 is 900 x 0.6.

The bucket edges are fractions of the question's own length -- its mode's ``seconds`` --
rather than absolute seconds, so a slow round and a quick one in the same game are both
scored on how fast you were for that round: a 30-second question buckets at 3 / 7.5 / 15 /
22.5 / 30 s, a 10-second one at 1 / 2.5 / 5 / 7.5 / 10 s. Steps divide the same length
evenly, so step ``k`` of ``n`` is on screen for the ``k``-th ``n``-th of it.

The *band* is what an answer earns the moment it arrives, before anything is graded: its
bucket, its step, or nothing at all for ``RANK``, where a guess's worth depends on guesses
that have not arrived yet. ``answer_ack`` carries it, and ``points_for`` reads it back at
the close.
"""

import logging
import math
from typing import assert_never

from app.questions.types.scoring import Scoring

log = logging.getLogger("app.rooms")

BUCKETS: tuple[tuple[float, int], ...] = (
    (0.10, 1000),
    (0.25, 900),
    (0.50, 800),
    (0.75, 700),
    (1.00, 600),
)
SLOWEST = len(BUCKETS)
RANK_TOP = 1000
# (least credit, share of RANK_TOP), best first. The rungs pay less than their credit so
# that being nearly right is clearly worth less than being right; below the last, nothing.
RANK_SHARES: tuple[tuple[float, float], ...] = ((1.0, 1.0), (0.9, 0.75), (0.8, 0.5), (0.7, 0.25))
STEP_TOP, STEP_BOTTOM = 1000, 400


def bucket(elapsed_s: float, question_s: int) -> int:
    """Which speed bucket, 1..5, an answer that took ``elapsed_s`` lands in.

    Edges are inclusive: exactly a tenth of the question's time is still bucket 1.
    Anything past the full time clamps to the slowest bucket, though the room refuses an
    answer that arrives from ``ends_at`` on.
    """
    fraction = elapsed_s / question_s
    for index, (edge, _) in enumerate(BUCKETS, start=1):
        if fraction <= edge:
            return index
    return SLOWEST


def step(elapsed_s: float, question_s: int, steps: int) -> int:
    """Which step, 1..``steps``, was on screen when an answer that took ``elapsed_s`` arrived.

    Inclusive edges and a clamp at the end, the same as ``bucket``: an answer on the very
    instant the picture changes is credited to the step it was looking at.
    """
    for k in range(1, steps + 1):
        if elapsed_s * steps <= k * question_s:
            return k
    return steps


def step_points(step: int, steps: int) -> int:
    """1000 on the first step down to 400 on the last, in even strides.

    One step is the first and the last at once, and pays the top rather than dividing by
    zero. A step outside ``1..steps`` clamps, as a bucket past the last one does.
    """
    if steps == 1:
        return STEP_TOP
    step = max(1, min(steps, step))
    return round(STEP_BOTTOM + (STEP_TOP - STEP_BOTTOM) * (steps - step) / (steps - 1))


def effective(scoring: Scoring, steps: int | None) -> Scoring:
    """``STEP`` with no ``steps`` in the payload is ``SPEED``.

    One type serves Pixel Hunt, which zooms out over eight frames, and Who's That NPC?,
    which shows one render: a question that never changes has nothing to be early about,
    so it is scored on being quick instead.
    """
    return Scoring.SPEED if scoring is Scoring.STEP and steps is None else scoring


def band(scoring: Scoring, elapsed_s: float, question_s: int, steps: int | None) -> int | None:
    """What an answer has earned on arrival: its bucket, its step, or ``None`` for ``RANK``."""
    match how := effective(scoring, steps):
        case Scoring.SPEED:
            return bucket(elapsed_s, question_s)
        case Scoring.STEP:
            assert steps is not None  # ``effective`` made it SPEED otherwise
            return step(elapsed_s, question_s, steps)
        case Scoring.RANK:
            return None
        case _:
            assert_never(how)


def points_for(scoring: Scoring, credit: float, band: int | None, steps: int | None) -> int:
    """Points for one graded answer: the scoring's table at ``band`` times ``credit``, or for
    ``RANK`` the share of its top for the rung ``credit`` reached.

    ``band`` is one this module's ``band()`` returned for the same scoring and steps;
    nothing else produces them. A wrong answer, like no answer at all, is worth 0.
    """
    if not 0.0 <= credit <= 1.0:
        raise ValueError(f"credit {credit} is outside 0..1")
    match how := effective(scoring, steps):
        case Scoring.SPEED:
            assert band is not None
            top = BUCKETS[band - 1][1]
        case Scoring.STEP:
            assert band is not None and steps is not None
            top = step_points(band, steps)
        case Scoring.RANK:
            share = next((share for least, share in RANK_SHARES if credit >= least), 0.0)
            return round(RANK_TOP * share)
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
