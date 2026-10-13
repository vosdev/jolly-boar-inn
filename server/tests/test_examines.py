"""``data/packs/examine.json``: the hand-written examine lines Guess the Examine is played from.

It is the file people contribute to, so it is held to rules here: every question is a
``guess_examine`` line with four to six names to pick from, the right one first, carries
the wiki page its author checked, has no ``generated_at``, and keeps its text tidy.
"""

import json
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.questions.vocab import fold

PATH = REPO_ROOT / "data" / "packs" / "examine.json"
WIKI = "https://oldschool.runescape.wiki/w/"


def pack() -> dict[str, Any]:
    return json.loads(PATH.read_text(encoding="utf-8"))


def test_the_pack_is_hand_written_and_has_questions() -> None:
    assert set(pack()) == {"pack", "questions"}
    assert pack()["questions"], "no examines"


@pytest.mark.parametrize("question", pack()["questions"], ids=lambda q: q["id"])
def test_every_question_is_an_examine_line_with_its_wiki_page(question: dict[str, Any]) -> None:
    assert (question["type"], question["mode"], question["source"]) == (
        "multiple_choice",
        "guess_examine",
        "pack",
    )
    assert question["tags"] == ["examine"]
    assert question["wiki"].startswith(WIKI)
    payload = question["payload"]
    assert set(payload) == {"prompt", "options", "answer_index"}
    assert payload["answer_index"] == 0
    assert 4 <= len(payload["options"]) <= 6
    for value in (payload["prompt"], *payload["options"]):
        assert value.strip() == value and value


def test_no_line_is_asked_twice() -> None:
    """A line under two answers would make both of them right."""
    prompts = [fold(" ".join(q["payload"]["prompt"].split())) for q in pack()["questions"]]
    assert len(prompts) == len(set(prompts))


def test_one_answer_keeps_one_wiki_page() -> None:
    pages: dict[str, set[str]] = {}
    for question in pack()["questions"]:
        payload = question["payload"]
        pages.setdefault(payload["options"][payload["answer_index"]], set()).add(question["wiki"])
    assert {answer: len(found) for answer, found in pages.items() if len(found) > 1} == {}
