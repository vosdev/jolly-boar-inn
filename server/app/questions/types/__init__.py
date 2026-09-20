"""Registry of question type modules. Phase 1 ships ``more_less`` only.

Each module exports ``client_view``, ``reveal``, ``grade``, ``validate_value`` (see
ideas/architecture.md section 1) plus ``check(payload)``, the consistency rules that
``validate_packs.py`` and room creation run on stored questions.

A module also says how a round of it is paced, as two ``Bounds``: ``QUESTIONS``, how many
questions its round holds, and ``SECONDS``, how long one of them stays open. Both carry
the default the create form offers and the range a host may set, because modes differ in
pace -- ``more_less`` is two names and one word, so its round is long and its questions
short, where a release-date round is the other way round. A module that declares neither
gets the fallbacks below, which are the old global defaults.
"""

from types import ModuleType

from app.questions.types import more_less
from app.questions.types.bounds import Bounds

# For a type module that says nothing about its own pace. Deliberately unremarkable: a
# mode that cares says so, in its own module, next to the code that makes it quick or slow.
QUESTIONS = Bounds(default=5, minimum=1, maximum=30)
SECONDS = Bounds(default=30, minimum=5, maximum=120)

TYPES: dict[str, ModuleType] = {"more_less": more_less}


# Both take a type this build may not have: a room can carry a question of a type that
# was registered when it was created and is not any more, and answering "the fallbacks"
# for it is more useful than raising on the way to a screen that only shows a number.
def questions_bounds(type_: str) -> Bounds:
    """How many questions a round of this type holds: default and the host's range."""
    return getattr(TYPES.get(type_), "QUESTIONS", QUESTIONS)


def seconds_bounds(type_: str) -> Bounds:
    """How long one question of this type stays open: default and the host's range."""
    return getattr(TYPES.get(type_), "SECONDS", SECONDS)
