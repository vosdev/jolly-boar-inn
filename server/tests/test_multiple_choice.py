"""``multiple_choice``: two to six written answers and an index, the shape five modes and
most of a host's own questions are answered in."""

import copy
from typing import Any
from uuid import uuid4

import pytest

from app.questions import schema
from app.questions.submission import Submission
from app.questions.types import TYPES, multiple_choice, scoring_of
from app.questions.types.scoring import Scoring

EXAMPLE: dict[str, Any] = {
    "type": "multiple_choice",
    "mode": "custom",
    "source": "room",
    "tags": [],
    "payload": {
        "prompt": "Which boss drops the Tanzanite fang?",
        "options": ["Zulrah", "Vorkath", "Jad", "Kraken"],
        "answer_index": 0,
        "explanation": "It is one of Zulrah's uniques, alongside the Magic fang.",
    },
}
EXAMPLE["id"] = schema.content_id(EXAMPLE)


def payload(**changes: Any) -> dict[str, Any]:
    p = copy.deepcopy(EXAMPLE["payload"])
    p.update(changes)
    return p


def test_it_is_registered_and_scored_on_speed() -> None:
    assert TYPES["multiple_choice"] is multiple_choice
    assert scoring_of("multiple_choice") is Scoring.SPEED


def test_example_validates() -> None:
    schema.validate(EXAMPLE)


def test_client_view_shows_the_options_and_withholds_the_answer() -> None:
    view = multiple_choice.client_view(payload(image="npc:2042"))
    assert view == {
        "prompt": "Which boss drops the Tanzanite fang?",
        "image": "npc:2042",
        "options": ["Zulrah", "Vorkath", "Jad", "Kraken"],
    }
    assert "answer_index" not in view and "explanation" not in view


def test_client_view_shows_a_quote_while_open() -> None:
    view = multiple_choice.client_view(payload(prompt="Who said this?", quote="What am I to do?"))
    assert view["quote"] == "What am I to do?"
    assert schema.schema_errors({**EXAMPLE, "payload": payload(quote="")}) != []


def test_reveal_adds_the_answer_and_why() -> None:
    assert multiple_choice.reveal(EXAMPLE["payload"]) == {
        **multiple_choice.client_view(EXAMPLE["payload"]),
        "answer_index": 0,
        "explanation": "It is one of Zulrah's uniques, alongside the Magic fang.",
    }
    bare = payload()
    del bare["explanation"]
    assert set(multiple_choice.reveal(bare)) == {"prompt", "options", "answer_index"}


def test_grade_is_all_or_nothing_on_the_index() -> None:
    right, wrong = uuid4(), uuid4()
    credit = multiple_choice.grade(EXAMPLE["payload"], [Submission(right, 0), Submission(wrong, 3)])
    assert credit == {right: 1.0, wrong: 0.0}


@pytest.mark.parametrize(
    ("value", "ok"),
    [(0, True), (3, True), (4, False), (-1, False), (True, False), ("0", False), (0.0, False)],
)
def test_parse_value_takes_an_option_index(value: Any, ok: bool) -> None:
    assert multiple_choice.parse_value(EXAMPLE["payload"], value) == (value if ok else None)


def test_check_passes_a_consistent_payload() -> None:
    assert multiple_choice.check(EXAMPLE["payload"]) == []


def test_check_fails_an_answer_that_is_none_of_the_options() -> None:
    assert multiple_choice.check(payload(options=["Zulrah", "Vorkath"], answer_index=3)) == [
        "answer_index: is 3 but there are only 2 options"
    ]


def test_check_fails_two_options_that_read_the_same() -> None:
    """Either two right answers the index names one of, or two a player cannot tell apart."""
    errors = multiple_choice.check(payload(options=["Zulrah", "Vorkath", " zulrah  "]))
    assert errors == ["options[2]: ' zulrah  ' repeats options[0]"]


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (lambda p: p.update(options=["Zulrah"]), "$.payload.options"),
        (lambda p: p.update(options=[str(n) for n in range(7)]), "$.payload.options"),
        (lambda p: p.update(options=["Zulrah", ""]), "$.payload.options[1]"),
        (lambda p: p.update(answer_index=6), "$.payload.answer_index"),
        (lambda p: p.update(prompt=""), "$.payload.prompt"),
        (lambda p: p.update(image="https://example.com/x.png"), "$.payload.image"),
        (lambda p: p.pop("answer_index"), "$.payload"),
    ],
)
def test_schema_rejects(mutate: Any, path: str) -> None:
    q = copy.deepcopy(EXAMPLE)
    mutate(q["payload"])
    q["id"] = schema.content_id(q)
    problems = schema.schema_errors(q)
    assert any(p.startswith(path + ":") for p in problems), problems
