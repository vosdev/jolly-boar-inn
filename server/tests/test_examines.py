"""``data/packs/examine.json``: the hand-written examine lines Guess the Examine is played from.

It is the file people contribute to, so it is held to rules here: every
question is a ``guess_examine`` line answered from the ``examines`` vocabulary, carries the
wiki page its author checked, has no ``generated_at``, and keeps its text tidy. The loader
already refuses an id under two names, a name under two ids and a line under two answers.
"""

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT
from app.questions import vocab

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
        "pick_from_list",
        "guess_examine",
        "pack",
    )
    assert question["tags"] == ["examine"]
    assert question["wiki"].startswith(WIKI)
    payload = question["payload"]
    assert set(payload) == {"prompt", "vocab", "answer_id", "subject"}
    assert payload["vocab"] == "examines"
    assert type(payload["answer_id"]) is int and payload["answer_id"] >= 1
    assert set(payload["subject"]) == {"name"}
    for value in (payload["prompt"], payload["subject"]["name"]):
        assert value.strip() == value and value


def test_one_answer_keeps_one_wiki_page() -> None:
    pages: dict[int, set[str]] = {}
    for question in pack()["questions"]:
        pages.setdefault(question["payload"]["answer_id"], set()).add(question["wiki"])
    assert {answer: len(found) for answer, found in pages.items() if len(found) > 1} == {}


def test_the_vocabulary_is_one_entry_per_answer_named_by_its_subject() -> None:
    """What the combobox offers is exactly the answers asked: every one, and nothing else."""
    served = vocab.get("examines")
    assert served is not None
    asked = {
        (q["payload"]["answer_id"], q["payload"]["subject"]["name"]) for q in pack()["questions"]
    }
    assert {(e.id, e.name) for e in served.entries} == asked
    assert len(served.entries) == len(asked)


def test_api_vocab_examines_serves_the_packs_answers(client: TestClient) -> None:
    response = client.get("/api/vocab/examines")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"vocab", "version", "entries"}
    assert body == vocab.get("examines").view()
    assert all(set(entry) == {"id", "name"} for entry in body["entries"])
