"""The Forgetful Bard: Falo sings a verse about an item, and its picture waits for the reveal."""

import json
from typing import Any

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds
from app.questions import vocab

PACK = REPO_ROOT / "data" / "packs" / "forgetful_bard.json"


def verses() -> list[dict[str, Any]]:
    return json.loads(PACK.read_text())["questions"]


def test_a_round_is_answered_from_the_list_and_scored_on_speed() -> None:
    mode = MODES["forgetful_bard"]
    assert mode.types == {"pick_from_list"}
    assert mode.steps is None
    assert questions_bounds("forgetful_bard").default == 5


def test_the_pack_holds_at_least_sixty_different_verses() -> None:
    questions = verses()
    assert len(questions) >= 60
    assert len({q["payload"]["prompt"] for q in questions}) == len(questions)


def test_every_verse_answers_to_a_plain_item_it_never_names() -> None:
    items = vocab.get("items")
    assert items is not None
    for question in verses():
        payload = question["payload"]
        name = items.name_of(payload["answer_id"])
        assert payload["vocab"] == "items"
        assert payload["image"] == f"item:{payload['answer_id']}"
        assert name is not None and "(" not in name
        assert name.lower() not in payload["prompt"].lower()


def test_every_tier_is_played() -> None:
    assert {q["difficulty"] for q in verses()} == {"easy", "medium", "hard"}
