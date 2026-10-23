"""Who's That NPC?: a shadow named from the curated list, or a render among look-alikes."""

import json
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds
from app.questions import vocab


def questions() -> list[dict[str, Any]]:
    path = REPO_ROOT / "data" / "packs" / "whos_that_npc.json"
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


def shadows() -> list[dict[str, Any]]:
    return [q for q in questions() if q["type"] == "pick_from_list"]


def renders() -> list[dict[str, Any]]:
    return [q for q in questions() if q["type"] == "multiple_choice"]


def test_whos_that_npc_is_shadows_and_renders() -> None:
    assert MODES["whos_that_npc"].types == {"pick_from_list", "multiple_choice"}
    assert questions_bounds("whos_that_npc").default == 5


def test_the_list_holds_at_least_fifty_names_and_every_one_is_asked() -> None:
    """A name on the list nobody is asked about is only there to be a wrong pick."""
    npcs = vocab.get("npcs")
    assert npcs is not None and len(npcs.entries) >= 50
    assert {q["payload"]["answer_id"] for q in shadows()} == {e.id for e in npcs.entries}


def test_every_question_is_a_shadow_or_a_render() -> None:
    assert len(shadows()) + len(renders()) == len(questions())
    assert renders()


@pytest.mark.parametrize("question", shadows(), ids=lambda q: q["id"])
def test_a_question_shows_its_own_answer_s_picture_under_the_same_line(
    question: dict[str, Any],
) -> None:
    payload = question["payload"]
    assert question["source"] == "pack" and question["tags"] == ["shadow"]
    assert payload["prompt"] == "Who's that NPC?"
    assert payload["vocab"] == "npcs"
    assert payload["image"] == f"npc:{payload['answer_id']}"
    assert "steps" not in payload
    assert question["wiki"].startswith("https://oldschool.runescape.wiki/w/")


@pytest.mark.parametrize("question", renders(), ids=lambda q: q["id"])
def test_a_render_pictures_its_right_option_among_distinct_names(
    question: dict[str, Any],
) -> None:
    payload = question["payload"]
    assert question["source"] == "pack" and question["tags"] == ["render"]
    assert payload["prompt"] == "Who's that NPC?"
    assert payload["image"].startswith("npc:")
    assert len(set(payload["options"])) == len(payload["options"])
    right = payload["options"][payload["answer_index"]]
    assert question["wiki"] == "https://oldschool.runescape.wiki/w/" + right.replace(" ", "_")
    assert "explanation" not in payload
    assert question["difficulty"] in ("medium", "hard")
