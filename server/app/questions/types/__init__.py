"""Registry of question type modules.

Each module exports ``client_view``, ``reveal``, ``grade``, ``validate_value`` (see
ideas/architecture.md section 1) plus ``check(payload)``, the consistency rules that
``validate_packs.py`` and room creation run on stored questions. ``grade`` returns credit,
0.0 to 1.0 per player, and never points: what an answer is worth is ``rooms/scoring.py``'s
business, told how to go about it by the module's optional ``SCORING``.

A type is an answer shape, not a round: the rounds are modes (``app/modes``), and several
of them may share one type. A type module may still say how a round of it is paced, as
two ``Bounds``: ``QUESTIONS``, how many questions a round holds, and ``SECONDS``, how long
one of them stays open. That is where the pace usually belongs -- ``more_less`` is two
names and one word whatever round it is dressed as -- so it is what every mode of the type
gets unless the mode says otherwise. ``app.modes.questions_bounds`` and ``seconds_bounds``
do the reading; a module that declares neither gets the registry's fallbacks there.
"""

from types import ModuleType

from app.questions.types import more_less, pick_from_list, price_is_right
from app.questions.types.scoring import Scoring

TYPES: dict[str, ModuleType] = {
    "more_less": more_less,
    "price_is_right": price_is_right,
    "pick_from_list": pick_from_list,
}


def scoring_of(type_id: str) -> Scoring:
    """How a question of this type turns credit into points: its ``SCORING``, or ``SPEED``."""
    return getattr(TYPES[type_id], "SCORING", Scoring.SPEED)
