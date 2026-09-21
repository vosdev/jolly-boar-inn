"""``Scoring``: which of the three ways a type's credit is turned into points.

A type's ``grade`` says how good an answer was, as credit from 0.0 to 1.0, and nothing
about what that is worth. What it is worth depends on something the type does know and
the grader does not: whether being quick is the skill (``SPEED``), whether only being
close is (``RANK``, where the nearest guess should win however late it arrived), or whether
the question gives itself away as it runs (``STEP``, a picture that zooms out). So a type
module declares ``SCORING`` and ``rooms/scoring.py`` does the arithmetic; section 6 of
ideas/architecture.md has the three tables.

``SPEED`` is the default, and a module that says nothing gets it: it is what every type
but two wants, and what ``more_less`` has always been scored on.

Its own module for the reason ``Bounds`` has one: every type module may need it, and
``types/__init__.py`` imports every type module.
"""

from enum import StrEnum


class Scoring(StrEnum):
    """The values are what ``answer_ack.scoring`` carries on the wire."""

    SPEED = "speed"
    RANK = "rank"
    STEP = "step"
