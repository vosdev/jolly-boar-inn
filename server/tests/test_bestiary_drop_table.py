"""Bestiary and Drop Table: two hand-written rounds about monsters and what they drop."""

import json
import random
import uuid
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds
from app.questions.packs import load_packs
from app.questions.submission import Submission
from app.questions.types import TYPES
from app.rooms.selection import select
from app.rooms.settings import RoomSettings
from tests.packs import PACKS_DIR


def questions(mode: str) -> list[dict[str, Any]]:
    path = REPO_ROOT / "data" / "packs" / f"{mode}.json"
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


def test_bestiary_mixes_five_types() -> None:
    assert MODES["bestiary"].types == {
        "multiple_choice",
        "closest_number",
        "free_text",
        "ordering",
        "pick_all_that_apply",
    }
    assert questions_bounds("bestiary").default == 5
    assert {q["type"] for q in questions("bestiary")} == MODES["bestiary"].types


def test_drop_table_mixes_four_types() -> None:
    assert MODES["drop_table"].types == {
        "multiple_choice",
        "free_text",
        "pick_all_that_apply",
        "closest_number",
    }
    assert questions_bounds("drop_table").default == 5
    assert {q["type"] for q in questions("drop_table")} == MODES["drop_table"].types


@pytest.mark.parametrize("mode", ["bestiary", "drop_table"])
def test_a_round_draws_and_scores_every_type_its_mode_plays(mode: str) -> None:
    packs = load_packs(PACKS_DIR)
    settings = RoomSettings(modes=[{"mode": mode, "questions": questions_bounds(mode).maximum}])
    # A pool larger than one round may leave a type out of any one draw, but not out of ten.
    # The random events dropped into the round are not its own.
    drawn = [
        q
        for seed in range(10)
        for q in select(packs, [], settings, random.Random(seed))[0].questions
        if q["mode"] == mode
    ]
    assert {q["type"] for q in drawn} == MODES[mode].types
    right, wrong = uuid.uuid4(), uuid.uuid4()
    for question in drawn:
        if question["type"] != "pick_all_that_apply":
            continue
        payload = question["payload"]
        answer = TYPES["pick_all_that_apply"].reveal(payload)["answer_indices"]
        submissions = [Submission(right, answer), Submission(wrong, answer[1:])]
        credit = TYPES["pick_all_that_apply"].grade(payload, submissions)
        assert credit[right] == 1.0 and 0.0 < credit[wrong] < 1.0


@pytest.mark.parametrize(("mode", "least"), [("bestiary", 20), ("drop_table", 15)])
def test_each_pack_has_enough_questions_to_fill_a_long_round(mode: str, least: int) -> None:
    assert len(questions(mode)) >= least


@pytest.mark.parametrize(
    "question",
    [q for mode in ("bestiary", "drop_table") for q in questions(mode)],
    ids=lambda q: q["id"],
)
def test_every_question_is_its_modes_own_and_links_the_wiki(
    question: dict[str, Any],
) -> None:
    assert question["source"] == "pack" and question["type"] in MODES[question["mode"]].types
    assert question["wiki"].startswith("https://oldschool.runescape.wiki/w/")


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


@pytest.mark.parametrize(
    "question",
    [q for q in questions("drop_table") if q["payload"]["prompt"].startswith("Which boss drops ")],
    ids=lambda q: q["id"],
)
def test_a_which_boss_question_shows_its_item_and_four_bosses(question: dict[str, Any]) -> None:
    payload = question["payload"]
    assert question["type"] == "multiple_choice"
    assert payload["image"].startswith("item:")
    assert len(payload["options"]) == 4
