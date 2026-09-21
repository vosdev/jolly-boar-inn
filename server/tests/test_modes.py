"""``app/modes``: the round registry, and where a round's pace comes from.

``questions_bounds`` and ``seconds_bounds`` read the mode, then its type, then the
registry's fallbacks. ``more_less`` exercises only the middle link, because it states
nothing of its own, so the other two are shown here with stub modes and a stub type.
"""

from collections.abc import Iterator
from types import ModuleType

import pytest

from app import modes
from app.modes import MODES, Mode, questions_bounds, seconds_bounds
from app.questions.types import TYPES, more_less
from app.questions.types.bounds import Bounds


def test_the_registry_lists_every_shipped_mode_in_create_form_order() -> None:
    """T16 added the axis with one round on it; T19 adds the second. Each mode and its
    type still share a name, which stops being true at the first ``multiple_choice`` mode."""
    assert MODES == {
        "more_less": Mode(id="more_less", type="more_less"),
        "price_is_right": Mode(id="price_is_right", type="price_is_right"),
    }


def test_every_mode_is_filed_under_its_own_id_and_plays_a_registered_type() -> None:
    for key, mode in MODES.items():
        assert mode.id == key
        assert mode.type in TYPES, f"{key} plays {mode.type!r}, which no type module answers"


def test_more_less_is_paced_by_its_type() -> None:
    """It states no numbers of its own, so it plays exactly as it did before the split."""
    assert questions_bounds("more_less") is more_less.QUESTIONS
    assert seconds_bounds("more_less") is more_less.SECONDS


@pytest.fixture
def slow_mode() -> Iterator[str]:
    """A mode over ``more_less`` that disagrees with its type about one number only."""
    MODES["slow"] = Mode(id="slow", type="more_less", seconds=Bounds(40, 20, 60))
    yield "slow"
    del MODES["slow"]


def test_a_mode_states_only_the_numbers_it_disagrees_with(slow_mode: str) -> None:
    assert seconds_bounds(slow_mode) == Bounds(40, 20, 60)
    assert questions_bounds(slow_mode) is more_less.QUESTIONS  # the rest is its type's


@pytest.fixture
def paceless_mode() -> Iterator[str]:
    """A mode over a type module that declares no pace at all."""
    TYPES["paceless"] = ModuleType("paceless")
    MODES["paceless"] = Mode(id="paceless", type="paceless")
    yield "paceless"
    del MODES["paceless"]
    del TYPES["paceless"]


def test_a_type_that_says_nothing_leaves_it_to_the_registry(paceless_mode: str) -> None:
    assert questions_bounds(paceless_mode) is modes.QUESTIONS
    assert seconds_bounds(paceless_mode) is modes.SECONDS
