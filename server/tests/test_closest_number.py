"""``closest_number``: a number for an answer, each guess measured against it alone.

The type half (the game half is in ``test_game.py``): exact is 1.0; inside ``within`` the
credit falls from 0.75 to 0.25; past it, or off at all without ``within``, it is 0.
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


def graded(answer: float, within: float | None = None, **guesses: float) -> dict[str, float]:
    """Credit by name for ``guesses`` at a question whose answer is ``answer``."""
    payload = {**EXAMPLE["payload"], "answer": answer}
    if within is not None:
        payload["within"] = within
    ids = {name: uuid4() for name in guesses}
    credit = closest_number.grade(
        payload, [Submission(ids[name], guess) for name, guess in guesses.items()]
    )
    names: dict[UUID, str] = {pid: name for name, pid in ids.items()}
    return {names[pid]: value for pid, value in credit.items()}


def test_it_is_registered_and_scored_on_accuracy() -> None:
    assert TYPES["closest_number"] is closest_number
    assert scoring_of("closest_number") is Scoring.ACCURACY


def test_example_validates() -> None:
    schema.validate(EXAMPLE)
    within = {**EXAMPLE, "payload": {**EXAMPLE["payload"], "within": 2.5}}
    within["id"] = schema.content_id(within)
    schema.validate(within)


def test_without_within_only_the_exact_answer_scores() -> None:
    """A year: 2017 is not nearly 2013."""
    assert graded(2013, exact=2013, near=2014, far=2017) == {"exact": 1.0, "near": 0.0, "far": 0.0}


def test_inside_within_credit_falls_from_three_quarters_to_a_quarter() -> None:
    assert graded(850, 85, exact=850, hair=849.15, half=892.5, edge=765, past=936) == {
        "exact": 1.0,
        "hair": pytest.approx(0.745),
        "half": 0.5,
        "edge": 0.25,
        "past": 0.0,
    }
    credits = [1.0, 0.745, 0.5, 0.25, 0.0]
    points = [scoring.points_for(Scoring.ACCURACY, c, None, None) for c in credits]
    assert points == [1000, 745, 500, 250, 0]


def test_the_issue_s_guess_scores_nothing() -> None:
    """850 kills, a guess of 250 that the old ladder paid 750 as the nearest in the room."""
    assert graded(850, 85, guess=250) == {"guess": 0.0}


def test_other_guesses_do_not_change_a_guess_s_credit() -> None:
    alone = graded(100, 10, me=105)
    crowded = graded(100, 10, me=105, a=100, b=101, c=500)
    assert alone["me"] == crowded["me"] == 0.5


def test_either_side_of_the_answer_scores_alike() -> None:
    assert graded(100, 10, under=96, over=104) == {"under": 0.55, "over": 0.55}


def test_a_player_who_did_not_answer_is_not_graded() -> None:
    """``grade`` only ever sees submissions, so a silent player is not in what it returns
    -- and the close pays only the players it returned."""
    silent = uuid4()
    credit = closest_number.grade(EXAMPLE["payload"], [Submission(uuid4(), 100)])
    assert silent not in credit
    assert list(credit.values()) == [1.0]


def test_a_decimal_guess_exactly_within_off_is_inside() -> None:
    """In float arithmetic 1.1 is a little more than 0.1 away from 1."""
    assert abs(1.1 - 1) > 0.1
    assert graded(1, 0.1, edge=1.1, under=0.9) == {"edge": 0.25, "under": 0.25}


def test_speed_does_not_come_into_it() -> None:
    """A guess is worth the same early or late: ``ACCURACY`` has no band."""
    assert scoring.band(Scoring.ACCURACY, 0.1, 20, None) is None
    assert scoring.band(Scoring.ACCURACY, 19.9, 20, None) is None


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


def test_client_view_shows_how_close_scores() -> None:
    """Players need ``within`` while answering, to know whether to be precise."""
    view = closest_number.client_view({**EXAMPLE["payload"], "within": 10})
    assert view["within"] == 10 and "answer" not in view


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


def test_check_fails_a_within_no_guess_can_be_measured_against() -> None:
    assert closest_number.check({**EXAMPLE["payload"], "within": 10}) == []
    for within in (float("inf"), 10**400):
        (error,) = closest_number.check({**EXAMPLE["payload"], "within": within})
        assert error.startswith("within:") and "not a finite number" in error


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (lambda p: p.update(answer="100"), "$.payload.answer"),
        (lambda p: p.update(unit="u" * 17), "$.payload.unit"),
        (lambda p: p.pop("answer"), "$.payload"),
        (lambda p: p.update(options=[1, 2]), "$.payload"),
        (lambda p: p.update(within=0), "$.payload.within"),
        (lambda p: p.update(within=-5), "$.payload.within"),
        (lambda p: p.update(within="10%"), "$.payload.within"),
    ],
)
def test_schema_rejects(mutate: Any, path: str) -> None:
    q = copy.deepcopy(EXAMPLE)
    mutate(q["payload"])
    q["id"] = schema.content_id(q)
    problems = schema.schema_errors(q)
    assert any(p.startswith(path + ":") for p in problems), problems
