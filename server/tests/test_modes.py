"""``app/modes``: the round registry, and where a round's length comes from.

``questions_bounds`` reads the mode, then its types, then the registry's fallback. Stub
modes and stub types show the links the shipped modes do not exercise. The registry itself
is held to rules rather than to a snapshot, so a new mode needs no edit here.
"""

import re
from collections.abc import Iterator
from types import ModuleType

import pytest

from app import modes
from app.config import REPO_ROOT
from app.modes import MODES, Mode, problems, questions_bounds, round_modes
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


def _between(source: str, start: str, end: str) -> str:
    head = source.index(start)
    return source[head : source.index(end, head)]


def test_the_clients_mode_list_is_this_registry() -> None:
    """``lib/modes/`` has copy for every round, names no mode this server lacks, and
    lists as coming soon only ids the schema accepts and nothing already shipped;
    ``lib/modes.ts`` lists the shipped ones in this registry's order."""
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
    listed = _between(
        (CLIENT_LIB / "modes.ts").read_text(encoding="utf-8"), "export const MODE_IDS", "\n]\n"
    )
    order = re.findall(r"^  '([a-z0-9_]+)',$", listed, flags=re.MULTILINE)
    assert [m for m in order if m in shipped] == [m for m in MODES if m in shipped]


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
