"""Answers that are one whole number, and right only if it is the stored one.

``more_less``, ``price_is_right`` and ``multiple_choice`` answer with an option's index,
``pick_from_list`` with a vocabulary entry's id. Parsing and grading such an answer is the
same few lines for all four, and the ``bool`` rule below is the one they must not drift on.
"""

from typing import Any
from uuid import UUID

from app.questions.submission import Submission


def whole_number(value: Any) -> int | None:
    """``value`` if it is an ``int`` and not a ``bool``, else ``None``."""
    # ``bool`` is a subclass of ``int`` and ``True == 1``, so without the explicit
    # rejection a client sending ``true`` would submit -- and score -- as option 1.
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def option_index(payload: dict[str, Any], value: Any) -> int | None:
    """``value`` if it is the index of one of ``payload["options"]``, else ``None``."""
    index = whole_number(value)
    if index is None or not 0 <= index < len(payload["options"]):
        return None
    return index


def grade(answer: int, submissions: list[Submission]) -> dict[UUID, float]:
    """1.0 for each submission that is ``answer``, 0.0 for every other."""
    return {s.player_id: 1.0 if s.value == answer else 0.0 for s in submissions}
