"""``number_slider``: a number picked on a linear or log slider, credited by width share."""

import copy
from typing import Any
from uuid import uuid4

import pytest

from app.modes import MODES
from app.questions import schema
from app.questions.packs import load_packs
from app.questions.submission import Submission
from app.questions.types import TYPES, number_slider, scoring_of, slider
from app.questions.types.scoring import Scoring
from app.suggestions import QUESTION_MODES, UNPLACED_TYPES
from tests.packs import PACKS_DIR

LINEAR: dict[str, Any] = {
    "type": "number_slider",
    "payload": {
        "prompt": "What Mining level do you need to mine runite ore?",
        "answer": 85,
        "min": 1,
        "max": 99,
        "scale": "linear",
        "unit": "level",
    },
}
LOG: dict[str, Any] = {
    "type": "number_slider",
    "payload": {
        "prompt": "How many Hitpoints does the Corporeal Beast have?",
        "answer": 2000,
        "min": 100,
        "max": 10000,
        "scale": "log",
    },
}


def payload(example: dict[str, Any], **changes: Any) -> dict[str, Any]:
    p = copy.deepcopy(example["payload"])
    p.update(changes)
    return p


def log_grid(low: int, high: int) -> list[int]:
    return [v for v in range(low, high + 1) if slider.on_grid(v, slider.FIGURES)]


# --- registry ---------------------------------------------------------------------------


def test_it_scores_on_accuracy_beside_closest_number() -> None:
    assert TYPES["number_slider"] is number_slider
    assert scoring_of("number_slider") is Scoring.ACCURACY
    for mode, types in QUESTION_MODES.items():
        assert ("closest_number" in types) == ("number_slider" in types), mode
    for mode in MODES.values():
        assert ("closest_number" in mode.types) == ("number_slider" in mode.types), mode.id
    assert "number_slider" in UNPLACED_TYPES


@pytest.mark.parametrize("example", [LINEAR, LOG])
def test_examples_validate_and_check(example: dict[str, Any]) -> None:
    schema.validate(
        {
            **example,
            "id": schema.content_id(example),
            "mode": "custom",
            "source": "room",
            "tags": [],
        }
    )
    assert number_slider.check(example["payload"]) == []


# --- check ------------------------------------------------------------------------------


@pytest.mark.parametrize("missing", ["min", "max", "scale"])
def test_the_schema_refuses_a_slider_without_its_bounds(missing: str) -> None:
    broken = {"type": "number_slider", "payload": payload(LINEAR)}
    del broken["payload"][missing]
    with pytest.raises(schema.QuestionError, match=missing):
        schema.validate(
            {**broken, "id": schema.content_id(broken), "mode": "custom", "source": "room"}
        )


@pytest.mark.parametrize(
    ("example", "changes", "error"),
    [
        (LINEAR, {"min": 99, "max": 1}, "max: 1 is not above min 99"),
        (LINEAR, {"min": 50, "max": 50}, "max: 50 is not above min 50"),
        (LOG, {"max": 10050}, "max: 10050 has more than three significant figures"),
        (LOG, {"min": 1234}, "min: 1234 has more than three significant figures"),
        (LOG, {"answer": 2345}, "answer: 2345 has more than three significant figures"),
        (LOG, {"min": 0}, "min: 0 is below 1"),
        (LINEAR, {"answer": 1}, "answer: 1 is not strictly between 1 and 99"),
        (LINEAR, {"answer": 99}, "answer: 99 is not strictly between 1 and 99"),
        (LINEAR, {"answer": 120}, "answer: 120 is not strictly between 1 and 99"),
        (LINEAR, {"answer": 50}, "answer: 50 is where the slider starts"),
        (LOG, {"answer": 1000}, "answer: 1000 is where the slider starts"),
    ],
)
def test_check_names_a_bad_track_or_answer(
    example: dict[str, Any], changes: dict[str, Any], error: str
) -> None:
    errors = number_slider.check(payload(example, **changes))
    assert any(e.startswith(error) for e in errors), errors


def test_a_linear_track_takes_any_whole_number() -> None:
    assert number_slider.check(payload(LINEAR, min=3, max=1234, answer=1001)) == []


def test_the_middle_rounds_a_half_up() -> None:
    assert slider.middle(0, 3, "linear") == 2
    assert slider.middle(1, 99, "linear") == 50
    assert slider.middle(100, 10000, "log") == 1000
    assert slider.middle(1, 3, "log") == 2


# --- parse_value ------------------------------------------------------------------------


def test_parse_value_takes_every_whole_number_on_a_linear_track() -> None:
    p = LINEAR["payload"]
    assert [v for v in range(-5, 110) if number_slider.parse_value(p, v) is not None] == list(
        range(1, 100)
    )


def test_parse_value_takes_every_log_grid_value_and_nothing_between() -> None:
    p = payload(LOG, min=100, max=2000, answer=150)
    taken = [v for v in range(0, 2100) if number_slider.parse_value(p, v) is not None]
    assert taken == log_grid(100, 2000)
    assert 1015 not in taken and 1001 not in taken


@pytest.mark.parametrize("value", [85.0, "85", True, None, [85], float("nan")])
def test_parse_value_refuses_what_is_not_a_whole_number(value: Any) -> None:
    assert number_slider.parse_value(LINEAR["payload"], value) is None


# --- grade ------------------------------------------------------------------------------


def credit(example_payload: dict[str, Any], guess: Any) -> float:
    player = uuid4()
    return number_slider.grade(example_payload, [Submission(player, guess)])[player]


def test_linear_credit_is_the_share_of_the_width_away() -> None:
    p = payload(LINEAR, min=0, max=100, answer=30)
    assert credit(p, 30) == 1.0
    assert credit(p, 31) == pytest.approx(0.96)
    assert credit(p, 20) == pytest.approx(0.6)
    assert credit(p, 55) == 0.0
    assert credit(p, 100) == 0.0


def test_log_credit_is_the_share_of_the_log_width_away() -> None:
    p = LOG["payload"]  # 100 to 10000: two decades, so a quarter is half a decade
    assert credit(p, 2000) == 1.0
    assert credit(p, 2010) < 1.0
    assert credit(p, 200) == 0.0
    # A tenth of a decade is a twentieth of the width: a fifth of the reach.
    assert credit(p, int(round(2000 * 10**0.1, -1))) == pytest.approx(0.8, abs=0.01)
    assert credit(p, 6320) == pytest.approx(0.0, abs=0.01)


def test_credit_has_no_band_round_the_answer() -> None:
    p = payload(LINEAR, min=0, max=2000, answer=1024)
    assert credit(p, 1000) < 1.0


def test_credit_falls_monotonically_away_from_the_answer() -> None:
    p = LOG["payload"]
    above = [credit(p, v) for v in log_grid(2000, 10000)]
    below = [credit(p, v) for v in reversed(log_grid(100, 2000))]
    assert above == sorted(above, reverse=True)
    assert below == sorted(below, reverse=True)


def test_a_guess_that_is_not_a_whole_number_earns_nothing() -> None:
    assert credit(LINEAR["payload"], "85") == 0.0


# --- views ------------------------------------------------------------------------------


def test_the_open_view_shows_the_track_and_not_the_answer() -> None:
    p = payload(LINEAR, explanation="Runite ore needs 85 Mining.", image="item:451")
    assert number_slider.client_view(p) == {
        "prompt": p["prompt"],
        "unit": "level",
        "min": 1,
        "max": 99,
        "scale": "linear",
    }
    assert number_slider.reveal(p) == {
        **number_slider.client_view(p),
        "answer": 85,
        "explanation": "Runite ore needs 85 Mining.",
    }


# --- packs ------------------------------------------------------------------------------


def test_every_pack_slider_loads_with_its_bounds_and_passes_check() -> None:
    sliders = [
        q for pack in load_packs(PACKS_DIR) for q in pack.questions if q["type"] == "number_slider"
    ]
    assert len(sliders) >= 20
    for question in sliders:
        assert {"min", "max", "scale"} <= question["payload"].keys(), question["id"]
        assert number_slider.check(question["payload"]) == [], question["id"]
