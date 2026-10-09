"""``questions/types/timing.py``: a type's time to answer and to reveal, scaled by the pace."""

from typing import Any

import pytest

from app.questions.types import answer_seconds, reveal_seconds
from app.questions.types.timing import MIN_ANSWER, MIN_REVEAL, Timing


def options(count: int) -> dict[str, Any]:
    return {"options": [f"option {n}" for n in range(count)]}


def entries(count: int) -> dict[str, Any]:
    return {"entries": [{"text": f"entry {n}", "rank": n + 1} for n in range(count)]}


@pytest.mark.parametrize(
    ("type_id", "payload", "answer", "reveal"),
    [
        ("multiple_choice", options(4), 18, 6),
        ("multiple_choice", options(6), 22, 7),
        ("pick_all_that_apply", options(4), 22, 8),
        ("pick_all_that_apply", options(6), 28, 10),
        ("ordering", entries(4), 30, 12),
        ("ordering", entries(6), 40, 16),
        ("price_is_right", options(4), 10, 6),
        ("more_less", {}, 10, 5),
        ("pick_from_list", {}, 20, 6),
        ("free_text", {}, 20, 7),
        ("closest_number", {}, 20, 8),
    ],
)
def test_each_type_at_run_pace(
    type_id: str, payload: dict[str, Any], answer: int, reveal: int
) -> None:
    assert answer_seconds(type_id, payload, "run") == answer
    assert reveal_seconds(type_id, payload, "run") == reveal


@pytest.mark.parametrize(
    ("pace", "answer", "reveal"), [("walk", 50, 20), ("run", 40, 16), ("teleport", 30, 12)]
)
def test_walk_adds_a_quarter_and_teleport_takes_one_off(
    pace: str, answer: int, reveal: int
) -> None:
    assert answer_seconds("ordering", entries(6), pace) == answer
    assert reveal_seconds("ordering", entries(6), pace) == reveal


def test_a_half_second_rounds_up() -> None:
    """Five options reveal in 6.5 seconds at ``run``; ``more_less`` opens 7.5 at ``teleport``."""
    assert reveal_seconds("multiple_choice", options(5), "run") == 7
    assert answer_seconds("more_less", {}, "teleport") == 8


def test_teleport_never_goes_under_the_minimums() -> None:
    assert Timing(base=4).seconds(0, "teleport", MIN_ANSWER) == MIN_ANSWER == 5
    assert Timing(base=4).seconds(0, "teleport", MIN_REVEAL) == MIN_REVEAL == 4
    assert reveal_seconds("more_less", {}, "teleport") == 4
