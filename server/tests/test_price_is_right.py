"""The type half: ``check()`` rejects a payload whose ``answer_index`` does not
point at the stored price; no shipped question has two options within 5% of each other;
the answer's slot is spread evenly over the pack; about 100 valid questions ship. The
generator half is in ``test_gen_price_questions.py``.
"""

import copy
import json
from collections import Counter
from itertools import pairwise
from typing import Any
from uuid import uuid4

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, seconds_bounds
from app.questions import schema
from app.questions.packs import load_packs
from app.questions.submission import Submission
from app.questions.types import TYPES, price_is_right, scoring_of
from app.questions.types.scoring import Scoring

PACKS_DIR = REPO_ROOT / "data" / "packs"

EXAMPLE: dict[str, Any] = {
    "type": "price_is_right",
    "mode": "price_is_right",
    "source": "pack",
    "tags": ["prices", "ge-price"],
    "payload": {
        "subject": {"name": "Abyssal whip", "asset": "item:4151"},
        "value": 1600000,
        "options": [1100000, 1600000, 2100000, 2900000],
        "answer_index": 1,
        "as_of": "2026-09-20",
    },
}
EXAMPLE["id"] = schema.content_id(EXAMPLE)


def payload(**changes: Any) -> dict[str, Any]:
    p = copy.deepcopy(EXAMPLE["payload"])
    p.update(changes)
    return p


def shipped() -> list[dict[str, Any]]:
    prices = next(pack for pack in load_packs(PACKS_DIR) if pack.path.name == "prices.json")
    return [q for q in prices.questions if q["mode"] == "price_is_right"]


# --- registry ---------------------------------------------------------------------------


def test_mode_plays_its_own_type_at_its_own_pace() -> None:
    assert MODES["price_is_right"].types == {"price_is_right"}
    assert TYPES["price_is_right"] is price_is_right
    assert scoring_of("price_is_right") is Scoring.SPEED
    assert seconds_bounds("price_is_right") is price_is_right.SECONDS


def test_example_validates() -> None:
    schema.validate(EXAMPLE)


# --- check ------------------------------------------------------------------------------


@pytest.mark.parametrize("wrong", [0, 2, 3])
def test_check_rejects_an_answer_index_that_is_not_the_stored_price(wrong: int) -> None:
    """The whole reason this is not ``multiple_choice``."""
    errors = price_is_right.check(payload(answer_index=wrong))
    assert errors == [
        f"answer_index: points at {EXAMPLE['payload']['options'][wrong]}"
        " but the stored price is 1600000"
    ]


def test_check_rejects_a_price_that_is_not_among_the_options() -> None:
    assert price_is_right.check(payload(value=1650000)) == [
        "answer_index: points at 1600000 but the stored price is 1650000"
    ]


def test_check_rejects_a_repeated_price() -> None:
    errors = price_is_right.check(payload(options=[1100000, 1600000, 1600000, 2900000]))
    assert errors == ["options: [1100000, 1600000, 1600000, 2900000] repeats a price"]


def test_check_passes_a_consistent_payload() -> None:
    assert price_is_right.check(EXAMPLE["payload"]) == []


def test_validation_runs_check_on_the_envelope() -> None:
    broken = copy.deepcopy(EXAMPLE)
    broken["payload"]["answer_index"] = 0
    broken["id"] = schema.content_id(broken)
    with pytest.raises(schema.QuestionError) as info:
        schema.validate(broken)
    assert info.value.errors == [
        "$.payload.answer_index: points at 1100000 but the stored price is 1600000"
    ]


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (lambda p: p.pop("value"), "$.payload"),
        (lambda p: p.update(value=-1), "$.payload.value"),
        (lambda p: p.update(options=[1, 2, 3]), "$.payload.options"),
        (lambda p: p.update(options=["1.1M", "1.6M", "2.1M", "2.9M"]), "$.payload.options[0]"),
        (lambda p: p.update(answer_index=4), "$.payload.answer_index"),
    ],
)
def test_schema_rejects(mutate: Any, path: str) -> None:
    q = copy.deepcopy(EXAMPLE)
    mutate(q["payload"])
    q["id"] = schema.content_id(q)
    assert any(error.startswith(path) for error in schema.schema_errors(q)), path


# --- the other four exports -------------------------------------------------------------


def test_client_view_shows_the_options_and_not_the_answer() -> None:
    view = price_is_right.client_view(EXAMPLE["payload"])
    assert view == {
        "subject": {"name": "Abyssal whip", "asset": "item:4151"},
        "options": [1100000, 1600000, 2100000, 2900000],
        "as_of": "2026-09-20",
    }
    view["subject"]["name"] = "changed"  # a copy, not an alias of the payload
    view["options"][0] = 0
    assert EXAMPLE["payload"]["subject"]["name"] == "Abyssal whip"
    assert EXAMPLE["payload"]["options"][0] == 1100000


def test_reveal_adds_the_price_and_its_slot() -> None:
    revealed = price_is_right.reveal(EXAMPLE["payload"])
    assert revealed == {
        **price_is_right.client_view(EXAMPLE["payload"]),
        "value": 1600000,
        "answer_index": 1,
    }


def test_grade_is_all_or_nothing_credit() -> None:
    right, wrong, odd = uuid4(), uuid4(), uuid4()
    subs = [Submission(right, 1), Submission(wrong, 2), Submission(odd, "1")]
    credit = price_is_right.grade(EXAMPLE["payload"], subs)
    assert credit == {right: 1.0, wrong: 0.0, odd: 0.0}
    assert all(type(value) is float for value in credit.values())


@pytest.mark.parametrize(
    ("value", "ok"),
    [(0, True), (3, True), (4, False), (-1, False), ("1", False), (1.0, False), (True, False)],
)
def test_parse_value(value: Any, ok: bool) -> None:
    assert price_is_right.parse_value(EXAMPLE["payload"], value) == (value if ok else None)


# --- the shipped pack -------------------------------------------------------------------


def test_about_a_hundred_valid_questions_ship() -> None:
    """~100 questions, every one valid (``load_packs`` ran the checks)."""
    questions = shipped()
    assert 90 <= len(questions) <= 110
    for q in questions:
        assert q["type"] == "price_is_right"
        assert "ge-price" in q["tags"]
    subjects = [q["payload"]["subject"]["name"] for q in questions]
    assert len(subjects) == len(set(subjects)), "one question per item"


def test_no_shipped_question_has_two_options_within_five_percent() -> None:
    """Two options that close read as the same answer."""
    for q in shipped():
        options = q["payload"]["options"]
        assert options == sorted(options), q["id"]
        for low, high in pairwise(options):
            assert high >= low * 1.05, f"{q['id']}: {low} and {high}"


def test_the_answer_is_spread_over_every_slot() -> None:
    """Roughly uniform, not exact -- every slot within 40% of its fair share."""
    questions = shipped()
    slots = Counter(q["payload"]["answer_index"] for q in questions)
    expected = len(questions) / 4
    for slot in range(4):
        assert 0.6 * expected <= slots[slot] <= 1.4 * expected, (slot, slots)


def test_no_shipped_answer_leaks_into_the_open_view() -> None:
    for q in shipped():
        view = json.dumps(price_is_right.client_view(q["payload"]))
        assert "answer_index" not in view and '"value"' not in view
