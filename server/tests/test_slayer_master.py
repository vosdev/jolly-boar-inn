"""Slayer Master: Konar quo Maten's round on how to fight what Bestiary describes."""

import json
from typing import Any

from app.config import REPO_ROOT
from app.modes import MODES
from app.suggestions import QUESTION_MODES

MODE = "slayer_master"
PACKS = REPO_ROOT / "data" / "packs"
MOVED_FROM_BESTIARY = {
    "q_697de7d11a474386",
    "q_c9050c2e4d4c2ffe",
    "q_86e9052465a63977",
    "q_7897b8d5b9a01755",
    "q_3c7f6b47d51bf704",
}


def pack_questions(name: str = MODE) -> list[dict[str, Any]]:
    """A pack's questions as written."""
    pack = json.loads((PACKS / f"{name}.json").read_text(encoding="utf-8"))
    return pack["questions"]


def test_it_plays_five_questions_of_bestiarys_types_by_default() -> None:
    assert MODES[MODE].types == MODES["bestiary"].types
    assert MODES[MODE].is_round
    assert MODES[MODE].questions is None


def test_every_type_it_plays_takes_a_suggestion() -> None:
    assert QUESTION_MODES[MODE] == MODES[MODE].types


def test_the_pack_is_the_rounds_and_plays_all_its_types() -> None:
    questions = pack_questions()
    assert len(questions) >= 20
    assert all(q["mode"] == MODE and q["difficulty"] and q["wiki"] for q in questions)
    assert {q["type"] for q in questions} == MODES[MODE].types


def test_every_question_is_tagged_with_what_it_covers() -> None:
    tags = {tag for q in pack_questions() for tag in q["tags"]}
    assert tags == {"slayer", "weakness", "bosses", "combat"}
    assert all(q["tags"] for q in pack_questions())


def test_bestiarys_fight_questions_moved_here() -> None:
    assert MOVED_FROM_BESTIARY <= {q["id"] for q in pack_questions()}
    assert not MOVED_FROM_BESTIARY & {q["id"] for q in pack_questions("bestiary")}
