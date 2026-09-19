"""Registry of question type modules. Phase 1 ships ``more_less`` only.

Each module exports ``client_view``, ``reveal``, ``grade``, ``validate_value`` (see
ideas/architecture.md section 1) plus ``check(payload)``, the consistency rules that
``validate_packs.py`` and room creation run on stored questions. A module may also set
``MAX_SECONDS``, the longest a question of that type stays open however long the room's
``question_seconds`` is; leaving it unset means the room's setting stands.
"""

from types import ModuleType

from app.questions.types import more_less

TYPES: dict[str, ModuleType] = {"more_less": more_less}


def max_seconds(type_: str) -> int | None:
    """The type's own cap on how long its questions stay open, if it has one."""
    return getattr(TYPES[type_], "MAX_SECONDS", None)
