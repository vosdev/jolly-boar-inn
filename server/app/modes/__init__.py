"""The mode registry: every round this build can play, and how many questions a round holds.

A mode is a round -- the thing a host ticks on the create form, the thing a splash
introduces, the thing ``questions.mode`` records. A type (``questions/types``) is only the
shape of the answer: what a player sends, how it is checked, what it earns. Several rounds
share one shape (Drop Table, Bestiary, Odd One Out, Who Said That? and Know Your Content
Creator are all four buttons and one index), and one round may mix shapes (four buttons,
and pick all that apply). So a question carries both: ``type`` for how it is answered,
``mode`` for which pool it came from and which round it plays in.

How many questions a round holds is the one thing both have an opinion on, so
``questions_bounds`` reads the mode, then its types, then the fallback below. How long a
question lasts is its type's alone (``questions/types/timing.py``), whatever round it is in.

``custom`` and ``random_event`` are not rounds: each of their questions is a random event,
dropped into a round it does not belong to (``rooms/selection.py``). ``custom`` is the
host's own questions and
``random_event`` the NPCs' (``data/packs/random_events/``).

Copy -- what a mode is called and how it is explained -- is not here. It stays on the
client, in ``lib/modes.ts``.
"""

from collections.abc import Callable, Iterable
from typing import TYPE_CHECKING, Any

from app.modes.mode import Mode
from app.questions.types import TYPES
from app.questions.types.bounds import Bounds

# Only for the annotation: the packs import the registry to check a question's mode.
if TYPE_CHECKING:
    from app.questions.packs import Pack

# For a mode whose types say nothing about round length. Deliberately unremarkable: a
# mode or a type that cares says so.
QUESTIONS = Bounds(default=5, minimum=1, maximum=30)

# In the order the create form lists them.
MODES: dict[str, Mode] = {
    "more_less": Mode(id="more_less", types=frozenset({"more_less"})),
    "price_is_right": Mode(id="price_is_right", types=frozenset({"price_is_right"})),
    # With the right name, four to six buttons: fewer is a guess, and six is one per gem.
    "guess_examine": Mode(id="guess_examine", types=frozenset({"multiple_choice"}), options=(4, 6)),
    "sort_it_out": Mode(id="sort_it_out", types=frozenset({"ordering"})),
    "who_said_that": Mode(id="who_said_that", types=frozenset({"multiple_choice"})),
    "know_your_content_creator": Mode(
        id="know_your_content_creator",
        types=frozenset(
            {"multiple_choice", "closest_number", "number_slider", "pick_all_that_apply"}
        ),
    ),
    "bestiary": Mode(
        id="bestiary",
        types=frozenset(
            {
                "multiple_choice",
                "closest_number",
                "number_slider",
                "free_text",
                "ordering",
                "pick_all_that_apply",
            }
        ),
    ),
    "drop_table": Mode(
        id="drop_table",
        types=frozenset(
            {
                "multiple_choice",
                "free_text",
                "pick_all_that_apply",
                "closest_number",
                "number_slider",
            }
        ),
    ),
    "odd_one_out": Mode(id="odd_one_out", types=frozenset({"multiple_choice"})),
    "whos_that_npc": Mode(id="whos_that_npc", types=frozenset({"pick_from_list"})),
    # The NPCs' questions as a round, to test them in a row. Off unless the instance says so.
    "random_events_only": Mode(
        id="random_events_only",
        types=frozenset(
            {
                "multiple_choice",
                "free_text",
                "closest_number",
                "number_slider",
                "pick_all_that_apply",
                "ordering",
            }
        ),
        # The pool is small: 20 leaves room for the events the room adds on top.
        questions=Bounds(default=10, minimum=1, maximum=20),
        pool="random_event",
        setting="random_event_game_mode",
    ),
    "custom": Mode(id="custom", types=frozenset(), is_round=False),
    "random_event": Mode(id="random_event", types=frozenset(), is_round=False),
}


def round_modes() -> list[Mode]:
    """The modes a host may pick as rounds, in the create form's order."""
    return [mode for mode in MODES.values() if mode.is_round]


def offered(settings: Any, packs: Iterable[Pack]) -> list[Mode]:
    """The modes this instance lets a host pick: switched on, and a round only with questions."""
    # The price pack is generated on each instance, so a fresh clone has none yet.
    pooled = {question["mode"] for pack in packs for question in pack.questions}
    return [
        m
        for m in MODES.values()
        if (m.setting is None or getattr(settings, m.setting))
        and (not m.is_round or (m.pool or m.id) in pooled)
    ]


def type_questions(type_id: str) -> Bounds:
    """How many questions a round of this type holds, when its mode does not say."""
    return getattr(TYPES.get(type_id), "QUESTIONS", QUESTIONS)


def _agreed(mode: Mode | None, of_type: Callable[[str], Bounds], fallback: Bounds) -> Bounds:
    found = {of_type(t) for t in mode.types} if mode is not None else set()
    return found.pop() if len(found) == 1 else fallback


# Takes a mode this build may not have: a stored room can carry a round of a mode that
# has since left the registry, and it still plays, at the fallbacks.
def questions_bounds(mode: str) -> Bounds:
    """How many questions a round of this mode holds: default and the host's range."""
    entry = MODES.get(mode)
    if entry is not None and entry.questions is not None:
        return entry.questions
    return _agreed(entry, type_questions, QUESTIONS)


def problems(mode: Mode) -> list[str]:
    """Why ``mode`` cannot be registered as it stands; empty when it can."""
    found = [f"{mode.id}: plays {t!r}, which no type module has" for t in mode.types - TYPES.keys()]
    if not mode.is_round:
        if mode.types or mode.questions is not None:
            found.append(f"{mode.id}: not a round, so it states no types and no questions")
        return found
    if not mode.types:
        found.append(f"{mode.id}: a round needs at least one type")
    if mode.questions is None and len({type_questions(t) for t in mode.types}) > 1:
        found.append(f"{mode.id}: its types disagree on questions, so it must state them")
    return found


# A registry mistake should stop the server starting, not surface in the middle of a game.
_broken = [p for mode in MODES.values() for p in problems(mode)]
_broken += [f"{key}: filed as {mode.id!r}" for key, mode in MODES.items() if mode.id != key]
if _broken:
    raise RuntimeError("; ".join(_broken))
