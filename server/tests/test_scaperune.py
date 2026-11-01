"""ScapeRune: the answer on the stage, four questions on the buttons."""

import json
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, extra_answer_seconds
from app.questions.schema import mode_errors
from app.questions.types import answer_seconds
from app.rooms.hold import stem_lines

PACK = REPO_ROOT / "data" / "packs" / "scaperune.json"
FOUR = {"options": ["a", "b", "c", "d"]}


def questions() -> list[dict[str, Any]]:
    return json.loads(PACK.read_text())["questions"]


def test_a_round_is_four_buttons_with_time_to_read_them() -> None:
    assert MODES["scaperune"].types == {"multiple_choice"}
    assert MODES["scaperune"].options == (4, 4)
    extra = extra_answer_seconds("scaperune")
    assert answer_seconds("multiple_choice", FOUR, "run", extra) == 30
    assert answer_seconds("multiple_choice", FOUR, "teleport", extra) == 23


def test_a_mode_this_build_lacks_adds_no_time() -> None:
    assert extra_answer_seconds("gone") == 0


@pytest.mark.parametrize("options", [["a", "b", "c"], ["a", "b", "c", "d", "e"]])
def test_anything_but_four_options_is_refused(options: list[str]) -> None:
    question = {"type": "multiple_choice", "mode": "scaperune", "source": "pack"}
    payload = {"prompt": "Zaff", "options": options, "answer_index": 0}
    assert mode_errors({**question, "payload": payload})


def test_the_pack_holds_forty_answers_and_some_are_ordered() -> None:
    pack = questions()
    assert len(pack) == 40
    assert len({q["payload"]["prompt"] for q in pack}) == 40
    assert sum("\n" in q["payload"]["prompt"] for q in pack) >= 10


def test_every_question_fits_a_button_and_keeps_the_answer_to_itself() -> None:
    for question in questions():
        payload = question["payload"]
        assert len(payload["options"]) == len(set(payload["options"])) == 4
        for option in payload["options"]:
            assert len(option) <= 120
            assert payload["prompt"].lower() not in option.lower()


def test_an_ordered_answer_types_one_line_per_entry() -> None:
    view = {"prompt": "Rush\nBurst\nBlitz"}
    assert stem_lines("multiple_choice", "scaperune", view) == [4, 5, 5]
    assert stem_lines("multiple_choice", "who_said_that", view) == [len(view["prompt"])]
