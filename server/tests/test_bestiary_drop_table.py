"""Bestiary and Drop Table: two hand-written rounds about monsters and what they drop."""

import json
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds, seconds_bounds


def questions(mode: str) -> list[dict[str, Any]]:
    path = REPO_ROOT / "data" / "packs" / f"{mode}.json"
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


def test_bestiary_mixes_four_types_at_twenty_seconds() -> None:
    assert MODES["bestiary"].types == {"multiple_choice", "closest_number", "free_text", "ordering"}
    seconds = seconds_bounds("bestiary")
    assert (seconds.default, seconds.minimum, seconds.maximum) == (20, 10, 60)
    assert questions_bounds("bestiary").default == 5
    assert {q["type"] for q in questions("bestiary")} == MODES["bestiary"].types


def test_drop_table_is_multiple_choice_at_twenty_seconds() -> None:
    assert MODES["drop_table"].types == {"multiple_choice"}
    seconds = seconds_bounds("drop_table")
    assert (seconds.default, seconds.minimum, seconds.maximum) == (20, 5, 30)
    assert questions_bounds("drop_table").default == 5


@pytest.mark.parametrize(("mode", "least"), [("bestiary", 20), ("drop_table", 15)])
def test_each_pack_has_enough_questions_to_fill_a_long_round(mode: str, least: int) -> None:
    assert len(questions(mode)) >= least


@pytest.mark.parametrize(
    "question",
    [q for mode in ("bestiary", "drop_table") for q in questions(mode)],
    ids=lambda q: q["id"],
)
def test_every_question_is_its_modes_own_and_says_where_its_fact_came_from(
    question: dict[str, Any],
) -> None:
    assert question["source"] == "pack" and question["type"] in MODES[question["mode"]].types
    assert question["wiki"].startswith("https://oldschool.runescape.wiki/w/")
    assert "OSRS Wiki" in question["payload"]["explanation"]


@pytest.mark.parametrize(
    "question",
    [q for q in questions("bestiary") if q["type"] == "multiple_choice"],
    ids=lambda q: q["id"],
)
def test_no_bestiary_distractor_equals_the_answer(question: dict[str, Any]) -> None:
    payload = question["payload"]
    answer = " ".join(payload["options"][payload["answer_index"]].split()).casefold()
    distractors = [o for i, o in enumerate(payload["options"]) if i != payload["answer_index"]]
    assert all(" ".join(o.split()).casefold() != answer for o in distractors)


@pytest.mark.parametrize("question", questions("drop_table"), ids=lambda q: q["id"])
def test_a_drop_table_question_shows_its_item_and_four_bosses(question: dict[str, Any]) -> None:
    payload = question["payload"]
    assert question["type"] == "multiple_choice"
    assert payload["image"].startswith("item:")
    assert len(payload["options"]) == 4
    assert payload["prompt"].startswith("Which boss drops ")
