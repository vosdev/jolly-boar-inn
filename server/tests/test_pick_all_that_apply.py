"""``pick_all_that_apply``: three to six written answers, any number of them right, and the
player ticks the ones that are."""

import copy
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.questions import schema
from app.questions.submission import Submission
from app.questions.types import TYPES, pick_all_that_apply, scoring_of
from app.questions.types.scoring import Scoring
from tests.conftest import stub_mode

EXAMPLE: dict[str, Any] = {
    "type": "pick_all_that_apply",
    "mode": "custom",
    "source": "room",
    "tags": [],
    "payload": {
        "prompt": "Which of these bosses are spiders?",
        "options": ["Kalphite Queen", "Sarachnis", "Scorpia", "Kraken", "Venenatis", "Zulrah"],
        "answer_indices": [1, 4],
        "explanation": "Sarachnis and Venenatis; Scorpia is a scorpion.",
    },
}
EXAMPLE["id"] = schema.content_id(EXAMPLE)


def payload(**changes: Any) -> dict[str, Any]:
    p = copy.deepcopy(EXAMPLE["payload"])
    p.update(changes)
    return p


def test_it_is_registered_and_scored_on_speed() -> None:
    assert TYPES["pick_all_that_apply"] is pick_all_that_apply
    assert scoring_of("pick_all_that_apply") is Scoring.SPEED


def test_example_validates() -> None:
    schema.validate(EXAMPLE)
    with_picks = {**EXAMPLE, "payload": payload(picks=2)}
    schema.validate({**with_picks, "id": schema.content_id(with_picks)})


def test_client_view_shows_the_options_and_how_many_to_pick_but_not_which() -> None:
    view = pick_all_that_apply.client_view(payload(picks=2, image="npc:8713"))
    assert view == {
        "prompt": "Which of these bosses are spiders?",
        "image": "npc:8713",
        "options": EXAMPLE["payload"]["options"],
        "picks": 2,
    }
    assert "answer_indices" not in view and "explanation" not in view


def test_reveal_adds_the_right_options_and_why() -> None:
    assert pick_all_that_apply.reveal(EXAMPLE["payload"]) == {
        **pick_all_that_apply.client_view(EXAMPLE["payload"]),
        "answer_indices": [1, 4],
        "explanation": "Sarachnis and Venenatis; Scorpia is a scorpion.",
    }


@pytest.mark.parametrize(
    ("picked", "credit"),
    [
        ([1, 4], 1.0),  # both right, nothing else
        ([0, 1, 4], 2 / 3),  # both right and one wrong
        ([1], 1 / 2),  # one right
        ([0, 1], 1 / 3),  # one right and one wrong
        ([0, 1, 2, 3, 4, 5], 2 / 6),  # all six
        ([0, 2], 0.0),  # only wrong ones
    ],
)
def test_credit_is_right_picks_over_right_or_picked(picked: list[int], credit: float) -> None:
    player = uuid4()
    value = pick_all_that_apply.parse_value(EXAMPLE["payload"], picked)
    assert value is not None
    assert pick_all_that_apply.grade(EXAMPLE["payload"], [Submission(player, value)]) == {
        player: pytest.approx(credit)
    }


def test_grade_takes_every_answer_at_once() -> None:
    right, half = uuid4(), uuid4()
    credit = pick_all_that_apply.grade(
        EXAMPLE["payload"], [Submission(right, [1, 4]), Submission(half, [4])]
    )
    assert credit == {right: 1.0, half: 0.5}


@pytest.mark.parametrize(
    ("value", "parsed"),
    [
        ([4, 1], [1, 4]),
        ([5], [5]),
        ([0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5]),
        ([], None),
        ([1, 1], None),
        ([6], None),
        ([-1], None),
        ([True], None),
        ([1.0], None),
        (1, None),
        ([0, 1, 2, 3, 4, 5, 0], None),
    ],
)
def test_parse_value_takes_distinct_option_indices_at_least_one(value: Any, parsed: Any) -> None:
    assert pick_all_that_apply.parse_value(EXAMPLE["payload"], value) == parsed


def test_with_picks_exactly_that_many_are_taken() -> None:
    p = payload(picks=2)
    assert pick_all_that_apply.parse_value(p, [0, 4]) == [0, 4]
    assert pick_all_that_apply.parse_value(p, [4]) is None
    assert pick_all_that_apply.parse_value(p, [0, 1, 4]) is None


def test_check_passes_a_consistent_payload() -> None:
    assert pick_all_that_apply.check(EXAMPLE["payload"]) == []
    assert pick_all_that_apply.check(payload(picks=2)) == []


def test_check_fails_no_right_option() -> None:
    assert pick_all_that_apply.check(payload(answer_indices=[])) == [
        "answer_indices: no option is right"
    ]


def test_check_fails_every_option_right() -> None:
    errors = pick_all_that_apply.check(
        payload(options=["Sarachnis", "Venenatis", "Kalphite Queen"], answer_indices=[0, 1, 2])
    )
    assert errors == ["answer_indices: every option is right, so ticking them all is the answer"]


def test_check_fails_an_index_that_is_none_of_the_options() -> None:
    errors = pick_all_that_apply.check(
        payload(options=["Sarachnis", "Venenatis", "Scorpia"], answer_indices=[0, 4])
    )
    assert errors == ["answer_indices: [4] are not options; there are only 3"]


def test_check_fails_indices_out_of_order() -> None:
    assert pick_all_that_apply.check(payload(answer_indices=[4, 1])) == [
        "answer_indices: must be in ascending order, each once"
    ]


def test_check_fails_picks_that_is_not_the_number_right() -> None:
    assert pick_all_that_apply.check(payload(picks=3)) == ["picks: is 3 but 2 options are right"]


def test_check_fails_two_options_that_read_the_same() -> None:
    errors = pick_all_that_apply.check(
        payload(options=["Sarachnis", "Venenatis", " sarachnis"], answer_indices=[1])
    )
    assert errors == ["options[2]: ' sarachnis' repeats options[0]"]


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (lambda p: p.update(options=["Sarachnis", "Venenatis"]), "$.payload.options"),
        (lambda p: p.update(options=[str(n) for n in range(7)]), "$.payload.options"),
        (lambda p: p.update(answer_indices=[]), "$.payload.answer_indices"),
        (lambda p: p.update(answer_indices=[0, 1, 2, 3, 4, 5]), "$.payload.answer_indices"),
        (lambda p: p.update(answer_indices=[1, 1]), "$.payload.answer_indices"),
        (lambda p: p.update(answer_indices=[6]), "$.payload.answer_indices[0]"),
        (lambda p: p.update(picks=0), "$.payload.picks"),
        (lambda p: p.update(picks=6), "$.payload.picks"),
        (lambda p: p.pop("answer_indices"), "$.payload"),
    ],
)
def test_schema_rejects(mutate: Any, path: str) -> None:
    q = copy.deepcopy(EXAMPLE)
    mutate(q["payload"])
    q["id"] = schema.content_id(q)
    problems = schema.schema_errors(q)
    assert any(p.startswith(path + ":") for p in problems), problems


@pytest.fixture
def shipped_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A round of the shipped, hand-written ``pick_all_that_apply`` questions."""
    yield from stub_mode(app, "pick_all_round", type_id="pick_all_that_apply")


def test_a_shipped_question_plays_end_to_end(table, shipped_round: str, db) -> None:
    game = table("Zezima", "Woox", modes=[shipped_round], questions=1, seconds=20)
    admin, zezima, woox = game.seats
    question = game.question(0)
    assert question.type == "pick_all_that_apply"
    right = question.payload["answer_indices"]
    game.start()
    opened = game.opened(0)[1]["question"]
    assert opened["view"]["options"] == question.payload["options"]
    assert "answer_indices" not in opened["view"]

    game.answer(zezima, 0, list(reversed(right)))
    zezima.take("answer_ack")
    game.answer(woox, 0, [])
    assert woox.take("error")["code"] == "bad_value"
    game.answer(woox, 0, right[:1])
    woox.take("answer_ack")
    game.skip()

    closed = admin.take("question_closed")
    assert closed["reveal"]["answer_indices"] == right
    full, partial = closed["results"][zezima.id], closed["results"][woox.id]
    assert full["value"] == right and full["correct"] is True
    assert partial["value"] == right[:1] and partial["correct"] is False
    assert partial["credit"] == pytest.approx(1 / len(right))
    assert 0 < partial["points"] < full["points"]
    assert admin.id not in closed["results"]
