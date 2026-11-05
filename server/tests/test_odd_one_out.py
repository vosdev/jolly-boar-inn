"""Odd One Out: a hand-written round of four to six names, all alike but one."""

import json
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds
from app.questions import schema


def questions() -> list[dict[str, Any]]:
    path = REPO_ROOT / "data" / "packs" / "odd_one_out.json"
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


def test_odd_one_out_is_multiple_choice() -> None:
    assert MODES["odd_one_out"].types == {"multiple_choice"}
    assert questions_bounds("odd_one_out").default == 5


def test_the_pack_has_enough_questions_to_fill_a_long_round() -> None:
    assert len(questions()) >= 15


def test_the_odd_one_is_not_always_in_the_same_place() -> None:
    assert len({q["payload"]["answer_index"] for q in questions()}) > 1


@pytest.mark.parametrize("question", questions(), ids=lambda q: q["id"])
def test_a_question_shows_four_to_six_names_and_says_what_the_rest_share(
    question: dict[str, Any],
) -> None:
    payload = question["payload"]
    assert question["type"] == "multiple_choice" and question["source"] == "pack"
    assert 4 <= len(payload["options"]) <= 6
    assert payload["prompt"] == "Which one doesn't belong?"
    assert payload["explanation"].strip() != ""
    assert question["wiki"].startswith("https://oldschool.runescape.wiki/w/")


def test_a_three_option_question_is_refused() -> None:
    """ "Which one doesn't belong" needs a crowd for the odd one to stand out from."""
    question = dict(questions()[0])
    payload = dict(question["payload"])
    payload["options"] = payload["options"][:3]
    payload["answer_index"] = min(payload["answer_index"], 2)
    question["payload"] = payload
    question["id"] = schema.content_id(question)
    assert schema.errors(question) == ["$.payload.options: 'odd_one_out' offers 4 to 6 options"]
