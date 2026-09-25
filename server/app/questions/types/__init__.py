"""Registry of question type modules.

Each module exports ``client_view``, ``reveal``, ``grade``, ``parse_value`` (see
ideas/architecture.md section 1) plus ``check(payload)``, the consistency rules that
``validate_packs.py`` and room creation run on stored questions. ``parse_value`` turns a
submitted value into the one form the room stores, echoes and grades, or ``None`` to refuse
it. ``grade`` returns credit, 0.0 to 1.0 per player, and never points: what an answer is
worth is ``rooms/scoring.py``'s business, told how to go about it by the module's optional
``SCORING``, and by its optional ``steps(payload)`` for a question that shows itself in steps.

A type is an answer shape, not a round: the rounds are modes (``app/modes``), and several
of them may share one type. A type module may still say how its questions are paced, as
two optional ``Bounds``: ``QUESTIONS``, how many a round holds, and ``SECONDS``, how long
one stays open. That is where the pace usually belongs -- ``more_less`` is two names and
one word whatever round it is dressed as -- so it is what every mode of the type gets
unless the mode says otherwise, and what a random event of the type is open for.
``app.modes`` does the reading; a module that declares neither gets its fallbacks.
"""

from types import ModuleType
from typing import Any

from app.questions.types import (
    closest_number,
    free_text,
    more_less,
    multiple_choice,
    pick_from_list,
    price_is_right,
)
from app.questions.types.scoring import Scoring

TYPES: dict[str, ModuleType] = {
    "more_less": more_less,
    "price_is_right": price_is_right,
    "pick_from_list": pick_from_list,
    "multiple_choice": multiple_choice,
    "closest_number": closest_number,
    "free_text": free_text,
}


def scoring_of(type_id: str) -> Scoring:
    """How a question of this type turns credit into points: its ``SCORING``, or ``SPEED``."""
    return getattr(TYPES[type_id], "SCORING", Scoring.SPEED)


def steps_of(type_id: str, payload: dict[str, Any]) -> int | None:
    """How many steps this question shows itself in: its type's ``steps(payload)``, or ``None``."""
    hook = getattr(TYPES[type_id], "steps", None)
    return None if hook is None else hook(payload)
