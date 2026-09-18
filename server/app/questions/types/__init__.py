"""Registry of question type modules. Phase 1 ships ``higher_lower`` only.

Each module exports ``client_view``, ``reveal``, ``grade``, ``validate_value`` (see
ideas/architecture.md section 1) plus ``check(payload)``, the consistency rules that
``validate_packs.py`` and room creation run on stored questions.
"""

from types import ModuleType

from app.questions.types import higher_lower

TYPES: dict[str, ModuleType] = {"higher_lower": higher_lower}
