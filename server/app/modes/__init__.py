"""The mode registry: every round this build can play, and how a round of each is paced.

A mode is a round -- the thing a host ticks on the create form, the thing a splash
introduces, the thing ``questions.mode`` records. A type (``questions/types``) is only the
shape of the answer: what a player sends, how it is checked, what it earns. Several rounds
share one shape (Drop Table, Bestiary, Odd One Out, Who Said That? and Clipped are all four
buttons and one index), and one round may mix shapes (four buttons, and pick all that
apply). So a question carries both: ``type`` for how it is answered, ``mode`` for which
pool it came from and which round it plays in.

Pace is the one thing both have an opinion on, so ``questions_bounds`` and
``seconds_bounds`` read the mode, then its types, then the fallbacks below. A mode states
only the numbers it disagrees with its types about, or that its types disagree about.

``custom`` and ``random_event`` are not rounds: each of their questions is a random event,
dropped into a round it does not belong to (``rooms/selection.py``), and is open for as
long as its own type says (``type_seconds``). ``custom`` is the host's own questions and
``random_event`` the NPCs' (``data/packs/random_events/``).

Copy -- what a mode is called and how it is explained -- is not here. It stays on the
client, in ``lib/modes.ts``.
"""

from collections.abc import Callable
from typing import Any

from app.modes.mode import Mode
from app.questions.types import TYPES
from app.questions.types.bounds import Bounds

# For a mode whose types say nothing about their own pace. Deliberately unremarkable: a
# mode or a type that cares says so, next to the thing that makes it quick or slow.
QUESTIONS = Bounds(default=5, minimum=1, maximum=30)
SECONDS = Bounds(default=30, minimum=5, maximum=120)

# In the order the create form lists them.
MODES: dict[str, Mode] = {
    "more_less": Mode(id="more_less", types=frozenset({"more_less"})),
    "price_is_right": Mode(id="price_is_right", types=frozenset({"price_is_right"})),
    "guess_examine": Mode(id="guess_examine", types=frozenset({"pick_from_list"})),
    # The NPCs' questions as a round, to test them in a row. Off unless the instance says so.
    "random_events_only": Mode(
        id="random_events_only",
        types=frozenset({"multiple_choice", "free_text", "closest_number", "pick_all_that_apply"}),
        # Its types disagree on both, and the pool is small: 20 leaves room for the events
        # the room adds on top.
        questions=Bounds(default=10, minimum=1, maximum=20),
        seconds=Bounds(default=20, minimum=10, maximum=60),
        pool="random_event",
        setting="random_event_game_mode",
    ),
    "custom": Mode(id="custom", types=frozenset(), is_round=False),
    "random_event": Mode(id="random_event", types=frozenset(), is_round=False),
}


def round_modes() -> list[Mode]:
    """The modes a host may pick as rounds, in the create form's order."""
    return [mode for mode in MODES.values() if mode.is_round]


def offered(settings: Any) -> list[Mode]:
    """The modes this instance lets a host pick: every one whose ``setting`` is on."""
    return [m for m in MODES.values() if m.setting is None or getattr(settings, m.setting)]


def type_questions(type_id: str) -> Bounds:
    """How many questions a round of this type holds, when its mode does not say."""
    return getattr(TYPES.get(type_id), "QUESTIONS", QUESTIONS)


def type_seconds(type_id: str) -> Bounds:
    """How long a question of this type stays open, when its round does not say."""
    return getattr(TYPES.get(type_id), "SECONDS", SECONDS)


def _agreed(mode: Mode | None, of_type: Callable[[str], Bounds], fallback: Bounds) -> Bounds:
    found = {of_type(t) for t in mode.types} if mode is not None else set()
    return found.pop() if len(found) == 1 else fallback


# Both take a mode this build may not have: a stored room can carry a round of a mode that
# has since left the registry, and it still plays, at the fallbacks.
def questions_bounds(mode: str) -> Bounds:
    """How many questions a round of this mode holds: default and the host's range."""
    entry = MODES.get(mode)
    if entry is not None and entry.questions is not None:
        return entry.questions
    return _agreed(entry, type_questions, QUESTIONS)


def seconds_bounds(mode: str) -> Bounds:
    """How long one question of this mode stays open: default and the host's range."""
    entry = MODES.get(mode)
    if entry is not None and entry.seconds is not None:
        return entry.seconds
    return _agreed(entry, type_seconds, SECONDS)


def problems(mode: Mode) -> list[str]:
    """Why ``mode`` cannot be registered as it stands; empty when it can."""
    found = [f"{mode.id}: plays {t!r}, which no type module has" for t in mode.types - TYPES.keys()]
    if not mode.is_round:
        if mode.types or mode.questions is not None or mode.seconds is not None:
            found.append(f"{mode.id}: not a round, so its questions pace themselves by type")
        return found
    if not mode.types:
        found.append(f"{mode.id}: a round needs at least one type")
    if mode.questions is None and len({type_questions(t) for t in mode.types}) > 1:
        found.append(f"{mode.id}: its types disagree on questions, so it must state them")
    if mode.seconds is None and len({type_seconds(t) for t in mode.types}) > 1:
        found.append(f"{mode.id}: its types disagree on seconds, so it must state them")
    return found


# A registry mistake should stop the server starting, not surface in the middle of a game.
_broken = [p for mode in MODES.values() for p in problems(mode)]
_broken += [f"{key}: filed as {mode.id!r}" for key, mode in MODES.items() if mode.id != key]
if _broken:
    raise RuntimeError("; ".join(_broken))
