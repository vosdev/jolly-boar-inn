"""The type half: ``check()`` holds the price strictly inside a two-figure range,
``parse_value`` takes only slider positions, ``grade`` pays by distance along the slider,
and every shipped answer sits in a band away from the ends and the start. The generator
half is in ``test_gen_price_questions.py``.
"""

import copy
import json
from typing import Any
from uuid import uuid4

import pytest

from app.modes import MODES
from app.questions import schema
from app.questions.packs import load_packs
from app.questions.submission import Submission
from app.questions.types import (
    TYPES,
    answer_seconds,
    price_is_right,
    reveal_seconds,
    scoring_of,
    slider,
)
from app.questions.types.scoring import Scoring
from tests.packs import PACKS_DIR

EXAMPLE: dict[str, Any] = {
    "type": "price_is_right",
    "mode": "price_is_right",
    "source": "pack",
    "tags": ["prices", "ge-price"],
    "payload": {
        "subject": {"name": "Abyssal whip", "asset": "item:4151"},
        "value": 1600000,
        "min": 1100000,
        "max": 3000000,
        "as_of": "2026-09-20",
    },
}
EXAMPLE["id"] = schema.content_id(EXAMPLE)
LOW, HIGH = 1100000, 3000000


def payload(**changes: Any) -> dict[str, Any]:
    p = copy.deepcopy(EXAMPLE["payload"])
    p.update(changes)
    return p


def shipped() -> list[dict[str, Any]]:
    prices = next(pack for pack in load_packs(PACKS_DIR) if pack.path.name == "prices.json")
    return [q for q in prices.questions if q["mode"] == "price_is_right"]


def grid(low: int, high: int) -> list[int]:
    return [v for v in range(low, high + 1, slider.sig_step(low, 3)) if slider.on_grid(v, 3)]


# --- registry ---------------------------------------------------------------------------


def test_mode_plays_its_own_type() -> None:
    assert MODES["price_is_right"].types == {"price_is_right"}
    assert TYPES["price_is_right"] is price_is_right
    assert scoring_of("price_is_right") is Scoring.ACCURACY


def test_fifteen_seconds_to_answer_and_six_to_reveal_at_run() -> None:
    assert answer_seconds("price_is_right", EXAMPLE["payload"], "run") == 15
    assert reveal_seconds("price_is_right", EXAMPLE["payload"], "run") == 6


def test_example_validates() -> None:
    schema.validate(EXAMPLE)


# --- check ------------------------------------------------------------------------------


def test_check_passes_a_consistent_payload() -> None:
    assert price_is_right.check(EXAMPLE["payload"]) == []


@pytest.mark.parametrize(
    ("low", "value", "high"),
    [
        (1600000, 1600000, 3000000),
        (1100000, 1600000, 1600000),
        (1100000, 3100000, 3000000),
        (1100000, 1000000, 3000000),
        (3000000, 1600000, 1100000),
    ],
)
def test_check_rejects_a_price_outside_or_on_the_edge_of_the_range(
    low: int, value: int, high: int
) -> None:
    errors = price_is_right.check(payload(min=low, value=value, max=high))
    assert errors == [f"value: {value} is not strictly between {low} and {high}"]


@pytest.mark.parametrize("key", ["min", "value", "max"])
def test_check_rejects_a_number_off_the_two_figure_grid(key: str) -> None:
    off = {"min": 1150000, "value": 1650000, "max": 2950000}[key]
    assert price_is_right.check(payload(**{key: off})) == [
        f"{key}: {off} has more than two significant figures"
    ]


def test_validation_runs_check_on_the_envelope() -> None:
    broken = copy.deepcopy(EXAMPLE)
    broken["payload"]["value"] = 3000000
    broken["id"] = schema.content_id(broken)
    with pytest.raises(schema.QuestionError) as info:
        schema.validate(broken)
    assert info.value.errors == [
        "$.payload.value: 3000000 is not strictly between 1100000 and 3000000"
    ]


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (lambda p: p.pop("value"), "$.payload"),
        (lambda p: p.pop("min"), "$.payload"),
        (lambda p: p.pop("max"), "$.payload"),
        (lambda p: p.update(value=0), "$.payload.value"),
        (lambda p: p.update(min=0), "$.payload.min"),
        (lambda p: p.update(max=2147483648), "$.payload.max"),
        (lambda p: p.update(min="1.1M"), "$.payload.min"),
        (lambda p: p.update(options=[1100000, 1600000, 2100000, 3000000]), "$.payload"),
        (lambda p: p.update(answer_index=1), "$.payload"),
    ],
)
def test_schema_rejects(mutate: Any, path: str) -> None:
    q = copy.deepcopy(EXAMPLE)
    mutate(q["payload"])
    q["id"] = schema.content_id(q)
    assert any(error.startswith(path) for error in schema.schema_errors(q)), path


def test_schema_refuses_the_old_four_option_payload() -> None:
    old = copy.deepcopy(EXAMPLE)
    old["payload"] = {
        "subject": {"name": "Abyssal whip", "asset": "item:4151"},
        "value": 1600000,
        "options": [1100000, 1600000, 2100000, 2900000],
        "answer_index": 1,
        "as_of": "2026-09-20",
    }
    old["id"] = schema.content_id(old)
    assert schema.schema_errors(old)


# --- views ------------------------------------------------------------------------------


def test_client_view_shows_the_range_and_not_the_price() -> None:
    view = price_is_right.client_view(EXAMPLE["payload"])
    assert view == {
        "subject": {"name": "Abyssal whip", "asset": "item:4151"},
        "min": LOW,
        "max": HIGH,
        "as_of": "2026-09-20",
    }
    view["subject"]["name"] = "changed"  # a copy, not an alias of the payload
    assert EXAMPLE["payload"]["subject"]["name"] == "Abyssal whip"


def test_reveal_adds_the_price() -> None:
    revealed = price_is_right.reveal(EXAMPLE["payload"])
    assert revealed == {**price_is_right.client_view(EXAMPLE["payload"]), "value": 1600000}


# --- parse_value ------------------------------------------------------------------------


def test_parse_value_takes_every_grid_value_in_range() -> None:
    values = grid(LOW, HIGH)
    assert values[0] == LOW and values[-1] == HIGH and len(values) == 191
    for value in values:
        assert price_is_right.parse_value(EXAMPLE["payload"], value) == value


def test_the_grid_crosses_a_power_of_ten() -> None:
    p = payload(min=95000, value=130000, max=200000)
    assert price_is_right.parse_value(p, 99900) == 99900
    assert price_is_right.parse_value(p, 100000) == 100000
    assert price_is_right.parse_value(p, 100100) is None
    assert price_is_right.parse_value(p, 101000) == 101000


@pytest.mark.parametrize(
    "value",
    [1001000, 3010000, 1655000, 1600001, "1600000", 1600000.0, float("nan"), True, False, None],
)
def test_parse_value_refuses(value: Any) -> None:
    assert price_is_right.parse_value(EXAMPLE["payload"], value) is None


# --- grade ------------------------------------------------------------------------------


def credit(guess: int, p: dict[str, Any] | None = None) -> float:
    player = uuid4()
    return price_is_right.grade(p or EXAMPLE["payload"], [Submission(player, guess)])[player]


@pytest.mark.parametrize("guess", [1550000, 1600000, 1640000, 1649000])
def test_grade_pays_in_full_within_the_two_figure_band(guess: int) -> None:
    assert credit(guess) == 1.0


def test_the_band_below_a_power_of_ten_is_finer() -> None:
    p = payload(min=50000, value=100000, max=200000)
    assert slider.band(100000) == (99500, 104999)
    assert credit(99500, p) == 1.0
    assert credit(99400, p) < 1.0


def test_grade_reaches_nothing_a_quarter_of_the_width_past_the_band() -> None:
    _, far = slider.band(1600000)
    reach = far * (HIGH / LOW) ** slider.REACH
    values = grid(LOW, HIGH)
    first_past = next(v for v in values if v >= reach)
    assert credit(first_past) == 0.0
    assert credit(values[values.index(first_past) - 1]) > 0.0
    assert credit(HIGH) == 0.0


def test_grade_falls_monotonically_away_from_the_band() -> None:
    values = grid(LOW, HIGH)
    answer = values.index(1600000)
    above = [credit(v) for v in values[answer:]]
    below = [credit(v) for v in reversed(values[: answer + 1])]
    for side in (above, below):
        assert all(a >= b for a, b in zip(side, side[1:], strict=False)), side
        assert side[0] == 1.0
    assert any(0.0 < c < 1.0 for c in above) and above[-1] == 0.0


def test_grade_is_continuous_at_the_band_edge() -> None:
    near, far = slider.band(1600000)
    assert credit(far + 1000 - far % 1000) > 0.95


def test_grade_gives_nothing_for_a_value_that_is_not_a_number() -> None:
    odd = uuid4()
    credits = price_is_right.grade(EXAMPLE["payload"], [Submission(odd, "1600000")])
    assert credits == {odd: 0.0}


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


def test_no_shipped_answer_sits_near_an_end_or_the_start() -> None:
    """Outside the outer 10% at either end and the middle 10% the slider starts in."""
    for q in shipped():
        p = q["payload"]
        where = slider.position(p["value"], p["min"], p["max"])
        assert 0.10 <= where <= 0.45 or 0.55 <= where <= 0.90, (q["id"], where)


def test_no_shipped_answer_leaks_into_the_open_view() -> None:
    for q in shipped():
        view = json.dumps(price_is_right.client_view(q["payload"]))
        assert '"value"' not in view
