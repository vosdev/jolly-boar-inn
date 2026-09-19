"""Points for one graded answer: section 6 of ideas/architecture.md.

Pure functions, no room state and no I/O, so this table is the only thing to read when
the numbers are argued about. The bucket edges are fractions of the room's
``question_seconds`` rather than absolute seconds, so changing the question length keeps
the shape: a 30-second question buckets at 3 / 7.5 / 15 / 22.5 / 30 s, a 10-second one at
1 / 2.5 / 5 / 7.5 / 10 s.

``closest_number`` ranks answers by distance instead of speed; its ``points_closest``
lands in Phase 2 together with that type module.
"""

BUCKETS: tuple[tuple[float, int], ...] = (
    (0.10, 1000),
    (0.25, 900),
    (0.50, 800),
    (0.75, 700),
    (1.00, 600),
)
SLOWEST = len(BUCKETS)


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


def points_for(correct: bool, bucket: int) -> int:
    """Points for one graded answer. A wrong answer, like no answer at all, is worth 0.

    ``bucket`` is one this module's ``bucket()`` returned; nothing else produces them.
    """
    return BUCKETS[bucket - 1][1] if correct else 0
