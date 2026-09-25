"""``closest_number``: a number for an answer, ranked against everyone else's guess.

T21 Accept (the type half; the game half is in ``test_game.py``): two players the same
distance away share the better rank; an exact match beats a guess one off; a player who
did not answer scores 0.
"""

import copy
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.questions import schema
from app.questions.submission import Submission
from app.questions.types import TYPES, closest_number, scoring_of
from app.questions.types.scoring import Scoring
from app.rooms import scoring

EXAMPLE: dict[str, Any] = {
    "type": "closest_number",
    "mode": "custom",
    "source": "room",
    "tags": [],
    "payload": {
        "prompt": "How many hours did Zezima's Infernal cape take?",
        "answer": 100,
        "unit": "hours",
        "explanation": "Most of them at Zuk.",
    },
}
EXAMPLE["id"] = schema.content_id(EXAMPLE)


def ranked(answer: float, **guesses: float) -> dict[str, float]:
    """Credit by name for ``guesses`` at a question whose answer is ``answer``."""
    ids = {name: uuid4() for name in guesses}
    credit = closest_number.grade(
        {**EXAMPLE["payload"], "answer": answer},
        [Submission(ids[name], guess) for name, guess in guesses.items()],
    )
    names: dict[UUID, str] = {pid: name for name, pid in ids.items()}
    return {names[pid]: value for pid, value in credit.items()}


def test_it_is_registered_and_scored_on_rank() -> None:
    assert TYPES["closest_number"] is closest_number
    assert scoring_of("closest_number") is Scoring.RANK


def test_example_validates() -> None:
    schema.validate(EXAMPLE)


def test_the_ladder_is_section_6s_table() -> None:
    """1.0 exact, then 0.9 / 0.8 / 0.7 for the closest three misses, 0.0 for the rest."""
    assert ranked(100, a=100, b=90, c=80, d=70, e=60, f=50) == {
        "a": 1.0,
        "b": 0.9,
        "c": 0.8,
        "d": 0.7,
        "e": 0.0,
        "f": 0.0,
    }
    points = [scoring.points_for(Scoring.RANK, c, None, None) for c in (1.0, 0.9, 0.8, 0.7, 0.0)]
    assert points == [1000, 750, 500, 250, 0]


def test_players_the_same_distance_away_share_the_better_rank() -> None:
    """Either side of the answer, and the guess behind them is second closest: dense."""
    assert ranked(100, under=99, over=101, behind=105, last=200) == {
        "under": 0.9,
        "over": 0.9,
        "behind": 0.8,
        "last": 0.7,
    }


def test_an_exact_match_beats_a_guess_one_off() -> None:
    assert ranked(100, exact=100, near=101) == {"exact": 1.0, "near": 0.9}
    # And an exact match takes no rung from the misses: the nearest one is still closest.
    assert ranked(100, exact=100, also=100.0, near=150)["near"] == 0.9


def test_nobody_exact_means_nobody_gets_full_marks() -> None:
    assert max(ranked(100, a=150, b=40).values()) == 0.9


def test_a_player_who_did_not_answer_is_not_graded() -> None:
    """``grade`` only ever sees submissions, so a silent player is not in what it returns
    -- and the close pays only the players it returned."""
    silent = uuid4()
    credit = closest_number.grade(EXAMPLE["payload"], [Submission(uuid4(), 5)])
    assert silent not in credit
    assert list(credit.values()) == [0.9]


def test_decimal_guesses_equally_far_off_tie() -> None:
    """In float arithmetic 1.1 and 0.9 are not quite as far from 1 as each other."""
    assert abs(1.1 - 1) != abs(0.9 - 1)
    assert ranked(1, over=1.1, under=0.9) == {"over": 0.9, "under": 0.9}


def test_speed_does_not_come_into_it() -> None:
    """The closest guess wins whether it arrived first or last: ``RANK`` has no band."""
    assert scoring.band(Scoring.RANK, 0.1, 20, None) is None
    assert scoring.band(Scoring.RANK, 19.9, 20, None) is None


@pytest.mark.parametrize(
    ("value", "ok"),
    [
        (100, True),
        (-3, True),
        (99.5, True),
        (0, True),
        (True, False),
        ("100", False),
        (None, False),
        (float("inf"), False),
        (float("nan"), False),
        (10**400, False),  # no float holds it, so it could not be ranked against 99.5
    ],
)
def test_parse_value_takes_a_finite_number(value: Any, ok: bool) -> None:
    assert closest_number.parse_value(EXAMPLE["payload"], value) == (value if ok else None)


def test_client_view_withholds_the_answer() -> None:
    view = closest_number.client_view(EXAMPLE["payload"])
    assert view == {"prompt": "How many hours did Zezima's Infernal cape take?", "unit": "hours"}


def test_reveal_adds_the_answer_and_why() -> None:
    assert closest_number.reveal(EXAMPLE["payload"]) == {
        "prompt": "How many hours did Zezima's Infernal cape take?",
        "unit": "hours",
        "answer": 100,
        "explanation": "Most of them at Zuk.",
    }


def test_check_fails_an_answer_no_guess_can_be_measured_against() -> None:
    assert closest_number.check(EXAMPLE["payload"]) == []
    for answer in (float("inf"), 10**400):
        (error,) = closest_number.check({**EXAMPLE["payload"], "answer": answer})
        assert error.startswith("answer:") and "not a finite number" in error


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (lambda p: p.update(answer="100"), "$.payload.answer"),
        (lambda p: p.update(unit="u" * 17), "$.payload.unit"),
        (lambda p: p.pop("answer"), "$.payload"),
        (lambda p: p.update(options=[1, 2]), "$.payload"),
    ],
)
def test_schema_rejects(mutate: Any, path: str) -> None:
    q = copy.deepcopy(EXAMPLE)
    mutate(q["payload"])
    q["id"] = schema.content_id(q)
    problems = schema.schema_errors(q)
    assert any(p.startswith(path + ":") for p in problems), problems
