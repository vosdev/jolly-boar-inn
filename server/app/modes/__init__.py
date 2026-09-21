"""The mode registry: every round this build can play, and how a round of each is paced.

A mode is a round -- the thing a host ticks on the create form, the thing a splash
introduces, the thing ``questions.mode`` records. A type (``questions/types``) is only the
shape of the answer: what a player sends, how it is checked, what it earns. Until Phase 2
the two were one registry and one string, which held while every round had an answer
shape of its own, and stops holding at Drop Table, Bestiary, Odd One Out, Who Said That?
and Clipped: five rounds that are all four buttons and one index. As five types they
would be five copies of one ``grade``. As one type with no modes, ``selection`` could not
tell two rounds of "pick one of four" apart and would draw each from the other's pool. So
a round is a registry entry of its own, and a question carries both: ``type`` for how it
is answered, ``mode`` for which pool it came from and which round it plays in.

Pace is the one thing both have an opinion on, so ``questions_bounds`` and
``seconds_bounds`` read the mode, then its type, then the fallbacks below. A mode states
only the numbers it disagrees with its type about, and ``more_less`` disagrees with
nothing, so the pace a room was played at before the split is the one it is played at
now.

Copy -- what a mode is called and how it is explained -- is not here. It stays on the
client, in ``lib/modes.ts``.
"""

from types import ModuleType

from app.modes.mode import Mode
from app.questions.types import TYPES
from app.questions.types.bounds import Bounds

# For a mode whose type says nothing about its own pace. Deliberately unremarkable: a mode
# or a type that cares says so, next to the thing that makes it quick or slow.
QUESTIONS = Bounds(default=5, minimum=1, maximum=30)
SECONDS = Bounds(default=30, minimum=5, maximum=120)

# In the order the create form lists them.
MODES: dict[str, Mode] = {"more_less": Mode(id="more_less", type="more_less")}


def _type_of(mode: Mode | None) -> ModuleType | None:
    return None if mode is None else TYPES.get(mode.type)


# Both take a mode this build may not have: a room can carry a round of a mode that was
# registered when it was created and is not any more, and answering "the fallbacks" for
# it is more useful than raising on the way to a screen that only shows a number.
def questions_bounds(mode: str) -> Bounds:
    """How many questions a round of this mode holds: default and the host's range."""
    entry = MODES.get(mode)
    if entry is not None and entry.questions is not None:
        return entry.questions
    return getattr(_type_of(entry), "QUESTIONS", QUESTIONS)


def seconds_bounds(mode: str) -> Bounds:
    """How long one question of this mode stays open: default and the host's range."""
    entry = MODES.get(mode)
    if entry is not None and entry.seconds is not None:
        return entry.seconds
    return getattr(_type_of(entry), "SECONDS", SECONDS)
