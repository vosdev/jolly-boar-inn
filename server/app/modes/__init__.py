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
question lasts is its type's (``questions/types/timing.py``), plus any ``extra_answer`` of
its mode.

``custom`` and ``random_event`` are not rounds: each of their questions is a random event,
dropped into a round it does not belong to (``rooms/selection.py``). ``custom`` is the
host's own questions and
``random_event`` the NPCs' (``data/packs/random_events/``).

A mode's rules are here as data, so no other module keeps a list of mode ids: its stem,
how players suggest for it (``Suggest``) and how it is reported and compared. Rounds not
built yet take suggestions from ``UPCOMING``, or wait in ``PLANNED``. Copy -- what a mode
is called and how it is explained -- is not here. It stays on the client, in ``lib/modes/``.
"""

from collections.abc import Callable, Collection, Iterable
from typing import TYPE_CHECKING, Any

from app.modes.mode import Mode, Suggest
from app.questions.types import TYPES
from app.questions.types.bounds import Bounds
from app.questions.types.scoring import Steps
from app.random_events import BUILT_UP

# Only for the annotation: the packs import the registry to check a question's mode.
if TYPE_CHECKING:
    from app.questions.packs import Pack

# For a mode whose types say nothing about round length. Deliberately unremarkable: a
# mode or a type that cares says so.
QUESTIONS = Bounds(default=5, minimum=1, maximum=30)

# The seven types a hand-written trivia round takes whole: Create's, an ordering and a matching.
TRIVIA_TYPES = frozenset(
    {
        "multiple_choice",
        "free_text",
        "closest_number",
        "number_slider",
        "pick_all_that_apply",
        "ordering",
        "matching",
    }
)

# In the order the create form lists them.
MODES: dict[str, Mode] = {
    "more_less": Mode(
        id="more_less", types=frozenset({"more_less"}), stem="more_less", report="item"
    ),
    "price_is_right": Mode(
        id="price_is_right", types=frozenset({"price_is_right"}), stem="price", report="item"
    ),
    # With the right name, four to six buttons: fewer is a guess, and six is one per gem. An
    # examine line is its own joke, so a line after it only repeats it.
    "guess_examine": Mode(
        id="guess_examine",
        types=frozenset({"multiple_choice"}),
        options=(4, 6),
        stem="examine",
        suggest=Suggest(
            explanation=False,
            wiki_only=True,
            tags=(("multiple_choice", "examine"),),
            right_first=True,
        ),
    ),
    "sort_it_out": Mode(id="sort_it_out", types=frozenset({"ordering"}), suggest=Suggest()),
    "who_said_that": Mode(
        id="who_said_that",
        types=frozenset({"multiple_choice"}),
        stem="quote",
        suggest=Suggest(quote=True),
    ),
    "know_your_content_creator": Mode(
        id="know_your_content_creator",
        types=frozenset(
            {"multiple_choice", "closest_number", "number_slider", "pick_all_that_apply"}
        ),
        stem="quote",
        suggest=Suggest(quote=True),
    ),
    "bestiary": Mode(id="bestiary", types=TRIVIA_TYPES, suggest=Suggest()),
    # Players know an item by name, not id: the import script finds it and sets the picture.
    "drop_table": Mode(
        id="drop_table",
        types=TRIVIA_TYPES - {"ordering"},
        suggest=Suggest(picture_item=True),
    ),
    # Every question asks the same, so its options are what tell two apart.
    "odd_one_out": Mode(
        id="odd_one_out",
        types=frozenset({"multiple_choice"}),
        options=(4, 6),
        suggest=Suggest(fixed_prompt="Which one doesn't belong?"),
        report="options",
        compare="options",
    ),
    "minigame_madness": Mode(
        id="minigame_madness", types=TRIVIA_TYPES, suggest=Suggest(picture_item=True)
    ),
    # A shadow picked from the list, or a render among look-alikes on the buttons. The
    # question only asks "Who's that NPC?", so without its picture there is nothing to answer,
    # and the NPC is the whole question. A player names the NPC; the import script finds it.
    "whos_that_npc": Mode(
        id="whos_that_npc",
        types=frozenset({"pick_from_list", "multiple_choice"}),
        pictured=True,
        stem=None,
        suggest=Suggest(
            explanation=False,
            fixed_prompt="Who's that NPC?",
            wiki_only=True,
            named="npcs",
            render=True,
            tags=(("pick_from_list", "shadow"), ("multiple_choice", "render")),
        ),
        report="npc",
        compare="npc",
    ),
    # An item's picture builds up for 17 of the 25 seconds, then stays whole.
    "pixel_hunt": Mode(
        id="pixel_hunt",
        types=frozenset({"pick_from_list"}),
        steps=Steps(build=17, of=25),
        pictured=True,
        stem=None,
        hold_counts_prompt=True,
    ),
    # Falo sings a verse about an item; its picture would be the answer, so it waits. An item
    # may have several verses, yet one with a verse already is worth flagging.
    "forgetful_bard": Mode(
        id="forgetful_bard",
        types=frozenset({"pick_from_list"}),
        picture_at_reveal=True,
        suggest=Suggest(explanation=False, named="items", verse=True),
        compare="item",
    ),
    # Five clues, vaguest first, one every 10 s and the last for 20, each a step down in points:
    # at 5 s players spent a clue reading it, with no time left to think.
    # The answer is any NPC, item or place on its own list, its picture held for the reveal.
    # The Sphinx's ask line is the question, and the clues come in after the hold.
    "riddles_of_the_sphinx": Mode(
        id="riddles_of_the_sphinx",
        types=frozenset({"pick_from_list"}),
        steps=Steps(build=4, of=6),
        clues=5,
        picture_at_reveal=True,
        extra_answer=35,
        stem="clues",
        suggest=Suggest(
            explanation=False, fixed_prompt="Who or what am I?", named="subjects", clued=True
        ),
        compare="item",
    ),
    # The answer on the stage, four questions on the buttons, which take 30 s to read.
    "scaperune": Mode(
        id="scaperune",
        types=frozenset({"multiple_choice"}),
        options=(4, 4),
        extra_answer=12,
        stem="board",
        suggest=Suggest(lined=True),
    ),
    "tales_of_gielinor": Mode(id="tales_of_gielinor", types=TRIVIA_TYPES, suggest=Suggest()),
    "uris_unravelling": Mode(
        id="uris_unravelling",
        types=TRIVIA_TYPES,
        extra_answer=5,
        stem="quote",
        suggest=Suggest(quote=True),
    ),
    "slayer_master": Mode(id="slayer_master", types=TRIVIA_TYPES, suggest=Suggest()),
    # One place to pin on the whole surface, scored on distance alone.
    "mark_the_map": Mode(
        id="mark_the_map",
        types=frozenset({"map_pin"}),
        suggest=Suggest(explanation=False, wiki_only=True),
    ),
    # The NPCs' questions as a round, to test them in a row. Off unless the instance says so.
    "random_events_only": Mode(
        id="random_events_only",
        types=TRIVIA_TYPES | {"pick_from_list"},
        # The pool is small: 20 leaves room for the events the room adds on top.
        questions=Bounds(default=10, minimum=1, maximum=20),
        pool="random_event",
        setting="random_event_game_mode",
    ),
    "custom": Mode(id="custom", types=frozenset(), is_round=False),
    # An NPC's question is drawn whatever the room's difficulty, so a tier would mean nothing,
    # and only an NPC says a line before it.
    "random_event": Mode(
        id="random_event",
        types=frozenset(),
        is_round=False,
        suggest=Suggest(types=TRIVIA_TYPES, intro=True, difficulty=False),
    ),
}

# Rounds this build does not play yet, which already take suggestions so their packs are
# ready when they open.
UPCOMING: dict[str, Suggest] = {
    "release_order": Suggest(types=frozenset({"ordering"})),
    "prop_hunt": Suggest(types=frozenset({"picture_pin"}), explanation=False),
}

# Rounds still being planned, which take no suggestions yet: the create form shows each as a
# card to come, after ``UPCOMING``'s, in this order. Their copy is the client's.
PLANNED: tuple[str, ...] = (
    "name_that_spell",
    "minimap_guesser",
    "scrying_pool",
    "lost_in_gielinor",
)

# Every mode a player may write a question for, built or not.
SUGGESTIBLE: dict[str, Suggest] = {
    **{mode.id: mode.suggest for mode in MODES.values() if mode.suggest is not None},
    **UPCOMING,
}


def round_modes() -> list[Mode]:
    """The modes a host may pick as rounds, in the create form's order."""
    return [mode for mode in MODES.values() if mode.is_round]


# Beside the asset ids in ``pictures``: the world map is what a map question draws on, and
# has to be on the instance the way a picture does. No asset id looks like it.
TILES = "map:tiles"


def drawable(question: dict[str, Any], pictures: Collection[str]) -> bool:
    """Whether a room may draw ``question``: in a ``pictured`` mode, only with its picture,
    on the map only with the tiles, and on a screenshot only with that."""
    if question.get("type") == "map_pin" and TILES not in pictures:
        return False
    if question.get("type") == "picture_pin" and question["payload"]["screenshot"] not in pictures:
        return False
    return not needs_picture(question) or question["payload"].get("image") in pictures


def needs_picture(question: dict[str, Any]) -> bool:
    """Whether ``question`` is its picture: a ``pictured`` mode's, or a built-up NPC's."""
    mode = MODES.get(question["mode"])
    return (mode is not None and mode.pictured) or question.get("random_event") in BUILT_UP


def offered(settings: Any, packs: Iterable[Pack], pictures: Collection[str] = ()) -> list[Mode]:
    """The modes this instance lets a host pick: switched on, and a round only with questions
    it can draw, given the ``pictures`` it has."""
    from app.questions.packs import live_packs  # packs import this module

    # The price pack is generated on each instance, so a fresh clone has none yet.
    pooled = {
        question["mode"]
        for pack in live_packs(packs)
        for question in pack.questions
        if drawable(question, pictures)
    }
    return [
        m
        for m in MODES.values()
        if (m.setting is None or getattr(settings, m.setting))
        and (not m.is_round or (m.pool or m.id) in pooled)
    ]


def entry(mode: str) -> Mode:
    """``mode``'s registry entry, or a plain stand-in for a mode this build lacks."""
    return MODES.get(mode) or Mode(id=mode, types=frozenset())


def steps_of(mode: str, random_event: str | None = None) -> Steps | None:
    """How a question of ``mode``, asked by ``random_event``, builds its picture up, or
    ``None``: a stored room may play a mode this build no longer has."""
    if random_event in BUILT_UP:
        return BUILT_UP[random_event]
    entry = MODES.get(mode)
    return None if entry is None else entry.steps


def extra_answer_seconds(mode: str) -> int:
    """The seconds ``mode`` adds to its questions' answer time; 0 for a mode this build lacks."""
    entry = MODES.get(mode)
    return 0 if entry is None else entry.extra_answer


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


def suggest_problems(mode: str, rules: Suggest) -> list[str]:
    """Why ``rules`` contradict themselves as ``mode``'s; empty when they do not."""
    types = rules.types or frozenset()
    found = [f"{mode}: suggests {t!r}, which no type module has" for t in types - TYPES.keys()]
    if not types:
        found.append(f"{mode}: a suggestion needs at least one type")
    if rules.quote and "multiple_choice" not in types:
        found.append(f"{mode}: a quote is a multiple_choice field, which it does not suggest")
    if rules.named is not None and "pick_from_list" not in types:
        found.append(f"{mode}: names its answer on a list, but suggests no pick_from_list")
    if rules.verse and rules.named is None:
        found.append(f"{mode}: a verse is about a named answer, and it names none")
    if rules.named is not None and (rules.verse == (rules.fixed_prompt is not None)):
        found.append(f"{mode}: a named answer asks either its fixed prompt or a verse")
    if rules.clued and "pick_from_list" not in types:
        found.append(f"{mode}: clues are a pick_from_list field, which it does not suggest")
    if rules.render and "multiple_choice" not in types:
        found.append(f"{mode}: a render is a multiple_choice option, which it does not suggest")
    found += [
        f"{mode}: tags {t!r}, which it does not suggest"
        for t in sorted({t for t, _ in rules.tags} - types)
    ]
    return found


def problems(mode: Mode) -> list[str]:
    """Why ``mode`` cannot be registered as it stands; empty when it can."""
    found = [f"{mode.id}: plays {t!r}, which no type module has" for t in mode.types - TYPES.keys()]
    if mode.hold_counts_prompt and mode.stem is not None:
        found.append(f"{mode.id}: the hold counts the prompt only for a mode with no stem")
    if "options" in (mode.report, mode.compare) and "multiple_choice" not in mode.types:
        found.append(f"{mode.id}: told apart by its options, but plays no multiple_choice")
    if mode.suggest is not None:
        found += suggest_problems(mode.id, mode.suggest)
        if mode.is_round and not (mode.suggest.types or frozenset()) <= mode.types:
            found.append(f"{mode.id}: suggests a type it does not play")
    if not mode.is_round:
        if mode.types or mode.questions is not None:
            found.append(f"{mode.id}: not a round, so it states no types and no questions")
        return found
    if not mode.types:
        found.append(f"{mode.id}: a round needs at least one type")
    if mode.clues and (mode.steps is None or mode.steps.count != mode.clues):
        found.append(f"{mode.id}: shows a clue a step, so it needs {mode.clues} steps")
    if mode.clues and mode.types != {"pick_from_list"}:
        found.append(f"{mode.id}: clues are a pick_from_list field, its only type")
    if mode.questions is None and len({type_questions(t) for t in mode.types}) > 1:
        found.append(f"{mode.id}: its types disagree on questions, so it must state them")
    return found


# A registry mistake should stop the server starting, not surface in the middle of a game.
_broken = [p for mode in MODES.values() for p in problems(mode)]
_broken += [f"{key}: filed as {mode.id!r}" for key, mode in MODES.items() if mode.id != key]
_broken += [p for key, rules in UPCOMING.items() for p in suggest_problems(key, rules)]
_broken += [f"{key}: upcoming, yet the registry plays it" for key in UPCOMING.keys() & MODES.keys()]
_broken += [f"{key}: planned, yet built or upcoming" for key in {*PLANNED} & {*MODES, *UPCOMING}]
if _broken:
    raise RuntimeError("; ".join(_broken))
