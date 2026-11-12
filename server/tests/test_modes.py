"""``app/modes``: the round registry, and where a round's length comes from.

``questions_bounds`` reads the mode, then its types, then the registry's fallback. Stub
modes and stub types show the links the shipped modes do not exercise. The registry itself
is held to rules rather than to a snapshot, so a new mode needs no edit here.
"""

import ast
import io
import re
import tokenize
from collections.abc import Iterator
from pathlib import Path
from types import ModuleType

import pytest

from app import modes
from app.config import REPO_ROOT
from app.modes import (
    MODES,
    PLANNED,
    SUGGESTIBLE,
    TRIVIA_TYPES,
    UPCOMING,
    Mode,
    problems,
    questions_bounds,
    round_modes,
    suggest_problems,
)
from app.modes.mode import Suggest
from app.questions.schema import load_schema
from app.questions.types import TYPES
from app.questions.types.bounds import Bounds

# The two modes whose questions are random events rather than a round.
EVENTS = ("custom", "random_event")
CLIENT_LIB = REPO_ROOT / "client" / "src" / "lib"


def test_every_shipped_mode_follows_the_registry_rules() -> None:
    for key, mode in MODES.items():
        assert mode.id == key
        assert problems(mode) == [], problems(mode)


def test_custom_and_random_event_are_the_modes_that_are_not_rounds() -> None:
    """Their questions are random events, paced by their own types, so neither states a
    type or a number of its own."""
    assert tuple(mode.id for mode in MODES.values() if not mode.is_round) == EVENTS
    assert [mode.id for mode in round_modes()] == [m for m in MODES if m not in EVENTS]


def test_the_clients_mode_list_is_this_registry() -> None:
    """``lib/modes/`` has copy for every round, names no mode this server lacks, and
    lists as coming soon only ids the schema accepts and nothing already shipped;
    the registry lists every one coming soon, as ``UPCOMING`` or ``PLANNED``."""
    files = {
        path.stem: path.read_text(encoding="utf-8")
        for path in sorted((CLIENT_LIB / "modes").glob("*.ts"))
    }
    shipped = {k: v for k, v in files.items() if "\nexport const mode: Mode = {\n" in v}
    upcoming = {k: v for k, v in files.items() if "\nexport const upcoming: " in v}
    keys = sorted(shipped)
    ids = sorted(
        id_
        for source in shipped.values()
        for id_ in re.findall(r"^  id: '([^']*)',$", source, flags=re.MULTILINE)
    )
    soon = [
        id_
        for source in upcoming.values()
        for id_ in re.findall(r"^  id: '([^']*)',$", source, flags=re.MULTILINE)
    ]
    assert keys and keys == ids, "an entry filed under another id, or the file's shape moved"
    assert soon and sorted(soon) == sorted(upcoming), "an upcoming mode filed under another id"
    assert {mode.id for mode in round_modes()} <= set(keys), "a round with no client copy"
    assert set(keys) <= set(MODES), "client copy for a mode this server does not have"
    pattern = load_schema()["properties"]["mode"]["pattern"]
    assert soon and all(re.fullmatch(pattern, mode) for mode in soon), soon
    assert len(set(soon)) == len(soon)
    assert not set(soon) & (set(MODES) | set(keys)), "shipped, and still coming soon"
    assert sorted(soon) == sorted([*UPCOMING, *PLANNED]), "coming soon, yet not in the registry"


def test_more_less_takes_the_registrys_round_length() -> None:
    assert questions_bounds("more_less") is modes.QUESTIONS


def test_no_shipped_type_repeats_the_registrys_round_length() -> None:
    """A type that states ``QUESTIONS`` must disagree with the fallback, or say nothing."""
    for name, module in TYPES.items():
        assert getattr(module, "QUESTIONS", None) != modes.QUESTIONS, name


@pytest.fixture
def long_mode() -> Iterator[str]:
    """A mode over ``more_less`` that states its own round length."""
    MODES["long"] = Mode(id="long", types=frozenset({"more_less"}), questions=Bounds(20, 5, 30))
    yield "long"
    del MODES["long"]


def test_a_mode_may_state_its_own_round_length(long_mode: str) -> None:
    assert questions_bounds(long_mode) == Bounds(20, 5, 30)


# --- a round of several types ----------------------------------------------------------


@pytest.fixture
def short_type() -> Iterator[ModuleType]:
    """A type whose rounds are shorter than the registry's."""
    module = ModuleType("short")
    module.QUESTIONS = Bounds(3, 1, 10)  # type: ignore[attr-defined]
    TYPES["short"] = module
    yield module
    del TYPES["short"]


def test_a_round_of_types_that_agree_takes_their_round_length(short_type: ModuleType) -> None:
    MODES["shorts"] = Mode(id="shorts", types=frozenset({"short"}))
    try:
        assert questions_bounds("shorts") == Bounds(3, 1, 10)
    finally:
        del MODES["shorts"]


def test_a_round_of_types_that_disagree_must_state_the_number(short_type: ModuleType) -> None:
    both = frozenset({"more_less", "short"})
    assert problems(Mode(id="mixed", types=both)) == [
        "mixed: its types disagree on questions, so it must state them"
    ]
    assert problems(Mode(id="mixed", types=both, questions=Bounds(4, 1, 10))) == []


def test_a_round_mixing_slow_and_quick_types_is_fine_as_it_is() -> None:
    """How long a question lasts is its type's, so a round never has to agree on it."""
    assert problems(Mode(id="mixed", types=frozenset({"more_less", "ordering"}))) == []


# --- what the registry refuses ---------------------------------------------------------


def test_a_round_needs_a_type() -> None:
    """Leaving out the types never turns a round into an event pool: that is ``is_round``."""
    assert problems(Mode(id="empty", types=frozenset())) == [
        "empty: a round needs at least one type"
    ]


def test_a_round_may_only_play_registered_types() -> None:
    assert problems(Mode(id="odd", types=frozenset({"word_search"}))) == [
        "odd: plays 'word_search', which no type module has"
    ]


@pytest.mark.parametrize(
    "extra",
    [
        {"types": frozenset({"more_less"})},
        {"questions": Bounds(5, 1, 30)},
    ],
)
def test_an_event_pool_states_no_type_and_no_round_length(extra: dict[str, object]) -> None:
    fields: dict[str, object] = {"types": frozenset(), **extra}
    mode = Mode(id="pool", is_round=False, **fields)  # type: ignore[arg-type]
    assert problems(mode) == ["pool: not a round, so it states no types and no questions"]


def test_a_bare_string_is_not_a_set_of_types() -> None:
    with pytest.raises(TypeError, match="not a str"):
        Mode(id="typo", types="more_less")  # type: ignore[arg-type]


# --- a mode's rules ----------------------------------------------------------------------


def test_a_suggestion_offers_the_modes_own_types_unless_it_says() -> None:
    assert MODES["bestiary"].suggest == Suggest(types=MODES["bestiary"].types)
    assert MODES["random_event"].suggest is not None
    assert MODES["random_event"].suggest.types == TRIVIA_TYPES
    assert set(SUGGESTIBLE) == {
        *(mode.id for mode in MODES.values() if mode.suggest is not None),
        *UPCOMING,
    }
    assert not UPCOMING.keys() & MODES.keys()


@pytest.mark.parametrize(
    ("rules", "problem"),
    [
        (Suggest(types=frozenset()), "a suggestion needs at least one type"),
        (Suggest(types=frozenset({"word_search"})), "suggests 'word_search', which no type"),
        (Suggest(types=frozenset({"ordering"}), quote=True), "a quote is a multiple_choice field"),
        (
            Suggest(types=frozenset({"ordering"}), named="items", verse=True),
            "suggests no pick_from_list",
        ),
        (Suggest(types=frozenset({"pick_from_list"}), verse=True), "names none"),
        (Suggest(types=frozenset({"pick_from_list"}), named="items"), "fixed prompt or a verse"),
        (Suggest(types=frozenset({"ordering"}), render=True), "a render is a multiple_choice"),
        (Suggest(types=frozenset({"ordering"}), tags=(("matching", "x"),)), "tags 'matching'"),
    ],
)
def test_a_contradictory_suggestion_is_refused(rules: Suggest, problem: str) -> None:
    found = suggest_problems("odd", rules)
    assert len(found) == 1 and problem in found[0], found
    upcoming = problems(Mode(id="odd", types=frozenset({"ordering"}), suggest=rules))
    assert any(problem in p for p in upcoming), upcoming


def test_a_round_suggests_only_types_it_plays() -> None:
    mode = Mode(id="odd", types=frozenset({"ordering"}), suggest=Suggest(types=TRIVIA_TYPES))
    assert problems(mode) == ["odd: suggests a type it does not play"]


def test_the_hold_counts_a_prompt_only_where_no_stem_types_one() -> None:
    mode = Mode(id="odd", types=frozenset({"ordering"}), hold_counts_prompt=True)
    assert problems(mode) == ["odd: the hold counts the prompt only for a mode with no stem"]


def test_only_a_round_on_buttons_is_told_apart_by_its_options() -> None:
    mode = Mode(id="odd", types=frozenset({"ordering"}), compare="options")
    assert problems(mode) == ["odd: told apart by its options, but plays no multiple_choice"]


def test_every_modes_stem_is_the_one_the_client_draws() -> None:
    """``rooms/hold.py`` counts the letters of the stem the client types."""
    for mode in MODES.values():
        source = (CLIENT_LIB / "modes" / f"{mode.id}.ts").read_text(encoding="utf-8")
        (stem,) = re.findall(r"^  stem: (null|'[a-z_]+'),$", source, flags=re.MULTILINE)
        assert mode.stem == (None if stem == "null" else stem.strip("'")), mode.id


SERVER = REPO_ROOT / "server"
# Where a mode's id is named for something other than a per-mode rule: as a type's id, as the
# mode a script generates a pack for or plays, and as the mode of a host's own questions.
NOT_A_RULE = {
    ("app/daily.py", "more_less"): "a type",
    ("app/daily.py", "price_is_right"): "a type",
    ("app/questions/types/__init__.py", "more_less"): "a type",
    ("app/questions/types/__init__.py", "price_is_right"): "a type",
    ("app/questions/schema.py", "more_less"): "a type",
    ("app/questions/schema.py", "price_is_right"): "a type",
    ("app/rooms/hold.py", "more_less"): "a type",
    ("app/rooms/hold.py", "price_is_right"): "a type",
    ("app/questions/custom.py", "custom"): "a host's questions",
    ("app/questions/schema.py", "custom"): "a host's questions",
    ("scripts/gen_locations.py", "mark_the_map"): "the pack it drafts",
    ("scripts/gen_pixel_hunt.py", "pixel_hunt"): "the pack it generates",
    ("scripts/gen_price_questions.py", "more_less"): "the pack it generates",
    ("scripts/gen_price_questions.py", "price_is_right"): "the pack it generates",
    ("scripts/loadtest.py", "who_said_that"): "the round it plays",
    ("scripts/smoke_ws.py", "more_less"): "the round it plays",
}
# Also the field a question names its NPC in, so it is everywhere and no rule.
EVENT = "random_event"


def _named_modes(path: Path) -> set[str]:
    ids = (set(MODES) | set(UPCOMING)) - {EVENT}
    found = set()
    for token in tokenize.generate_tokens(io.StringIO(path.read_text("utf-8")).readline):
        if token.type == tokenize.STRING:
            value = ast.literal_eval(token.string)
            if value in ids:
                found.add(value)
    return found


def test_no_module_outside_the_registry_names_a_mode() -> None:
    """A mode's rules are its registry entry's, so a new mode is one entry and nothing else."""
    paths = [*(SERVER / "app").rglob("*.py"), *(SERVER / "scripts").rglob("*.py")]
    found = {
        (path.relative_to(SERVER).as_posix(), mode)
        for path in paths
        if (SERVER / "app" / "modes") not in path.parents
        for mode in _named_modes(path)
    }
    assert sorted(found - NOT_A_RULE.keys()) == []


def test_the_hold_reads_the_stem_and_names_no_mode() -> None:
    names = _named_modes(SERVER / "app" / "rooms" / "hold.py")
    assert names <= TYPES.keys(), "a mode named other than as a type"
    assert "mode ==" not in (SERVER / "app" / "rooms" / "hold.py").read_text("utf-8")
