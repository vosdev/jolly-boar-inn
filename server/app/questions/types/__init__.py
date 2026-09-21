"""Registry of question type modules. Phase 1 ships ``more_less`` only.

Each module exports ``client_view``, ``reveal``, ``grade``, ``validate_value`` (see
ideas/architecture.md section 1) plus ``check(payload)``, the consistency rules that
``validate_packs.py`` and room creation run on stored questions.

A type is an answer shape, not a round: the rounds are modes (``app/modes``), and several
of them may share one type. A type module may still say how a round of it is paced, as
two ``Bounds``: ``QUESTIONS``, how many questions a round holds, and ``SECONDS``, how long
one of them stays open. That is where the pace usually belongs -- ``more_less`` is two
names and one word whatever round it is dressed as -- so it is what every mode of the type
gets unless the mode says otherwise. ``app.modes.questions_bounds`` and ``seconds_bounds``
do the reading; a module that declares neither gets the registry's fallbacks there.
"""

from types import ModuleType

from app.questions.types import more_less

TYPES: dict[str, ModuleType] = {"more_less": more_less}
