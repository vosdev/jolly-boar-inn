"""Registry of question type modules.

Each module exports ``client_view``, ``reveal``, ``grade``, ``parse_value`` (see
ideas/architecture.md section 1) plus ``check(payload)``, the consistency rules that
``validate_packs.py`` and room creation run on stored questions. ``parse_value`` turns a
submitted value into the one form the room stores, echoes and grades, or ``None`` to refuse
it. ``grade`` returns credit, 0.0 to 1.0 per player, and never points: what an answer is
worth is ``rooms/scoring.py``'s business, told how to go about it by the module's optional
``SCORING``, and by its optional ``steps(payload)`` for a question that shows itself in steps.

A type is an answer shape, not a round: the rounds are modes (``app/modes``), and several
of them may share one type. The type alone says how long a question stays open and how
long its reveal holds, as two ``Timing``s, ``ANSWER`` and ``REVEAL``, over its optional
``items(payload)``: ``more_less`` is two names and one word whatever round it is dressed
as, and six entries to order are six entries in any round. The room's pace scales both
(``timing.py``). A module may also say how many questions a round holds, as ``QUESTIONS``
(``app.modes`` reads it).
"""

from types import ModuleType
from typing import Any

from app.questions.types import (
    closest_number,
    free_text,
    more_less,
    multiple_choice,
    ordering,
    pick_all_that_apply,
    pick_from_list,
    price_is_right,
)
from app.questions.types.scoring import Scoring
from app.questions.types.timing import MIN_ANSWER, MIN_REVEAL

TYPES: dict[str, ModuleType] = {
    "more_less": more_less,
    "price_is_right": price_is_right,
    "pick_from_list": pick_from_list,
    "multiple_choice": multiple_choice,
    "closest_number": closest_number,
    "free_text": free_text,
    "pick_all_that_apply": pick_all_that_apply,
    "ordering": ordering,
}


def scoring_of(type_id: str) -> Scoring:
    """How a question of this type turns credit into points: its ``SCORING``, or ``SPEED``."""
    return getattr(TYPES[type_id], "SCORING", Scoring.SPEED)


def steps_of(type_id: str, payload: dict[str, Any]) -> int | None:
    """How many steps this question shows itself in: its type's ``steps(payload)``, or ``None``."""
    hook = getattr(TYPES[type_id], "steps", None)
    return None if hook is None else hook(payload)


def _items(type_id: str, payload: dict[str, Any]) -> int:
    hook = getattr(TYPES[type_id], "items", None)
    return 0 if hook is None else hook(payload)


def answer_seconds(type_id: str, payload: dict[str, Any], pace: str) -> int:
    """How long this question stays open at ``pace``."""
    return TYPES[type_id].ANSWER.seconds(_items(type_id, payload), pace, MIN_ANSWER)


def reveal_seconds(type_id: str, payload: dict[str, Any], pace: str) -> int:
    """How long this question's reveal holds at ``pace``."""
    return TYPES[type_id].REVEAL.seconds(_items(type_id, payload), pace, MIN_REVEAL)
