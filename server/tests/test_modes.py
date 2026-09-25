"""``app/modes``: the round registry, and where a round's pace comes from.

``questions_bounds`` and ``seconds_bounds`` read the mode, then its types, then the
registry's fallbacks. The shipped modes exercise only the middle link, so the others are
shown here with stub modes and stub types. The registry itself is held to rules rather
than to a snapshot, so a new mode needs no edit here.
"""

import re
from collections.abc import Iterator
from types import ModuleType

import pytest

from app import modes
from app.config import REPO_ROOT
from app.modes import MODES, Mode, problems, questions_bounds, round_modes, seconds_bounds
from app.questions.schema import load_schema
from app.questions.types import TYPES, more_less, multiple_choice
from app.questions.types.bounds import Bounds

# The two modes whose questions are random events rather than a round.
EVENTS = ("custom", "random_event")
CLIENT_COPY = REPO_ROOT / "client" / "src" / "lib" / "modes.ts"


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
    """``lib/modes.ts`` has copy for every round, names no mode this server lacks, and
    lists as coming soon only ids the schema accepts and nothing already shipped."""
    source = CLIENT_COPY.read_text(encoding="utf-8")
    shipped = _between(source, "export const MODES", "\n}\n")
    upcoming = _between(source, "export const UPCOMING_MODES", "\n]\n")
    keys = re.findall(r"^  ([a-z0-9_]+): \{$", shipped, flags=re.MULTILINE)
    ids = re.findall(r"^    id: '([^']*)',$", shipped, flags=re.MULTILINE)
    soon = re.findall(r"^  \{ id: '([^']*)',", upcoming, flags=re.MULTILINE)
    assert keys and keys == ids, "an entry filed under another id, or the file's shape moved"
    assert {mode.id for mode in round_modes()} <= set(keys), "a round with no client copy"
    assert set(keys) <= set(MODES), "client copy for a mode this server does not have"
    pattern = load_schema()["properties"]["mode"]["pattern"]
    assert soon and all(re.fullmatch(pattern, mode) for mode in soon), soon
    assert len(set(soon)) == len(soon)
    assert not set(soon) & (set(MODES) | set(keys)), "shipped, and still coming soon"


def test_more_less_is_paced_by_its_type() -> None:
    """It states no numbers of its own, and its type states only seconds."""
    assert questions_bounds("more_less") is modes.QUESTIONS
    assert seconds_bounds("more_less") is more_less.SECONDS


def test_no_shipped_type_repeats_the_registrys_round_length() -> None:
    """A type that states ``QUESTIONS`` must disagree with the fallback, or say nothing."""
    for name, module in TYPES.items():
        assert getattr(module, "QUESTIONS", None) != modes.QUESTIONS, name


@pytest.fixture
def slow_mode() -> Iterator[str]:
    """A mode over ``more_less`` that disagrees with its type about one number only."""
    MODES["slow"] = Mode(id="slow", types=frozenset({"more_less"}), seconds=Bounds(40, 20, 60))
    yield "slow"
    del MODES["slow"]


def test_a_mode_states_only_the_numbers_it_disagrees_with(slow_mode: str) -> None:
    assert seconds_bounds(slow_mode) == Bounds(40, 20, 60)
    assert questions_bounds(slow_mode) is modes.QUESTIONS  # the rest is its type's


@pytest.fixture
def paceless_mode() -> Iterator[str]:
    """A mode over a type module that declares no pace at all."""
    TYPES["paceless"] = ModuleType("paceless")
    MODES["paceless"] = Mode(id="paceless", types=frozenset({"paceless"}))
    yield "paceless"
    del MODES["paceless"]
    del TYPES["paceless"]


def test_a_type_that_says_nothing_leaves_it_to_the_registry(paceless_mode: str) -> None:
    assert questions_bounds(paceless_mode) is modes.QUESTIONS
    assert seconds_bounds(paceless_mode) is modes.SECONDS


# --- a round of several types ----------------------------------------------------------


@pytest.fixture
def twin() -> Iterator[ModuleType]:
    """A second four-button type, paced exactly like ``multiple_choice``."""
    module = ModuleType("twin")
    module.SECONDS = multiple_choice.SECONDS  # type: ignore[attr-defined]
    TYPES["twin"] = module
    yield module
    del TYPES["twin"]


def test_a_round_of_types_that_agree_takes_their_pace(twin: ModuleType) -> None:
    mixed = Mode(id="mixed", types=frozenset({"multiple_choice", "twin"}))
    assert problems(mixed) == []
    MODES["mixed"] = mixed
    try:
        assert seconds_bounds("mixed") is multiple_choice.SECONDS
        assert questions_bounds("mixed") is modes.QUESTIONS
    finally:
        del MODES["mixed"]


def test_a_round_of_types_that_disagree_must_state_the_number() -> None:
    """``more_less`` and ``multiple_choice`` disagree on seconds, and on nothing else."""
    both = frozenset({"more_less", "multiple_choice"})
    assert problems(Mode(id="mixed", types=both)) == [
        "mixed: its types disagree on seconds, so it must state them"
    ]
    stated = Mode(id="mixed", types=both, seconds=Bounds(12, 5, 30))
    assert problems(stated) == []
    MODES["mixed"] = stated
    try:
        assert seconds_bounds("mixed") == Bounds(12, 5, 30)
    finally:
        del MODES["mixed"]


# --- what the registry refuses ---------------------------------------------------------


def test_a_round_needs_a_type() -> None:
    """Leaving out the types never turns a round into an event pool: that is ``is_round``."""
    assert problems(Mode(id="empty", types=frozenset())) == [
        "empty: a round needs at least one type"
    ]


def test_a_round_may_only_play_registered_types() -> None:
    assert problems(Mode(id="odd", types=frozenset({"ordering"}))) == [
        "odd: plays 'ordering', which no type module has"
    ]


@pytest.mark.parametrize(
    "extra",
    [
        {"types": frozenset({"more_less"})},
        {"questions": Bounds(5, 1, 30)},
        {"seconds": Bounds(20, 10, 60)},
    ],
)
def test_an_event_pool_states_no_type_and_no_pace(extra: dict[str, object]) -> None:
    fields: dict[str, object] = {"types": frozenset(), **extra}
    mode = Mode(id="pool", is_round=False, **fields)  # type: ignore[arg-type]
    assert problems(mode) == ["pool: not a round, so its questions pace themselves by type"]


def test_a_bare_string_is_not_a_set_of_types() -> None:
    with pytest.raises(TypeError, match="not a str"):
        Mode(id="typo", types="more_less")  # type: ignore[arg-type]
