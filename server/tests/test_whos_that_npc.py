"""Who's That NPC?: a monster's or NPC's shadow, named from the curated list."""

import json
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds
from app.questions import vocab


def questions() -> list[dict[str, Any]]:
    path = REPO_ROOT / "data" / "packs" / "whos_that_npc.json"
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


def test_whos_that_npc_is_pick_from_list() -> None:
    assert MODES["whos_that_npc"].types == {"pick_from_list"}
    assert questions_bounds("whos_that_npc").default == 5


def test_the_list_holds_at_least_fifty_names_and_every_one_is_asked() -> None:
    """A name on the list nobody is asked about is only there to be a wrong pick."""
    npcs = vocab.get("npcs")
    assert npcs is not None and len(npcs.entries) >= 50
    assert {q["payload"]["answer_id"] for q in questions()} == {e.id for e in npcs.entries}


@pytest.mark.parametrize("question", questions(), ids=lambda q: q["id"])
def test_a_question_shows_its_own_answer_s_picture_under_the_same_line(
    question: dict[str, Any],
) -> None:
    payload = question["payload"]
    assert question["type"] == "pick_from_list" and question["source"] == "pack"
    assert payload["prompt"] == "Who's that NPC?"
    assert payload["vocab"] == "npcs"
    assert payload["image"] == f"npc:{payload['answer_id']}"
    assert "steps" not in payload
    assert question["wiki"].startswith("https://oldschool.runescape.wiki/w/")
