"""Points for one graded answer: section 6 of ideas/architecture.md.

Pure functions, no room state and no I/O, so this table is the only thing to read when
the numbers are argued about.

Grading happens in two halves. A type's ``grade`` returns credit, 0.0 to 1.0, and this
module turns credit into points one of three ways, picked by the type's ``SCORING``: a
speed bucket (``SPEED``), a flat 1000 (``RANK``, where the credit is already the ranking),
or the step of a question that shows more of itself as it runs (``STEP``). Each is one
table and one multiplication, so partial credit needs nothing of its own: three of five in
the right place in bucket 2 is 900 x 0.6.

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

from app.questions.types.scoring import Scoring

BUCKETS: tuple[tuple[float, int], ...] = (
    (0.10, 1000),
    (0.25, 900),
    (0.50, 800),
    (0.75, 700),
    (1.00, 600),
)
SLOWEST = len(BUCKETS)
RANK_TOP = 1000
STEP_TOP, STEP_BOTTOM = 1000, 400


def bucket(elapsed_s: float, question_s: int) -> int:
    """Which speed bucket, 1..5, an answer that took ``elapsed_s`` lands in.

    Edges are inclusive: exactly a tenth of the question's time is still bucket 1.
    Anything past the full time clamps to the slowest bucket, which is what an answer
    accepted a moment after ``ends_at`` gets (the close was waiting on the room lock).
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
    match effective(scoring, steps):
        case Scoring.SPEED:
            return bucket(elapsed_s, question_s)
        case Scoring.STEP:
            assert steps is not None  # ``effective`` made it SPEED otherwise
            return step(elapsed_s, question_s, steps)
        case Scoring.RANK:
            return None


def points_for(scoring: Scoring, credit: float, band: int | None, steps: int | None) -> int:
    """Points for one graded answer: the scoring's table at ``band``, times ``credit``.

    ``band`` is one this module's ``band()`` returned for the same scoring and steps;
    nothing else produces them. A wrong answer, like no answer at all, is worth 0.
    """
    if not 0.0 <= credit <= 1.0:
        raise ValueError(f"credit {credit} is outside 0..1")
    match effective(scoring, steps):
        case Scoring.SPEED:
            assert band is not None
            top = BUCKETS[band - 1][1]
        case Scoring.STEP:
            assert band is not None and steps is not None
            top = step_points(band, steps)
        case Scoring.RANK:
            top = RANK_TOP
    return round(top * credit)
