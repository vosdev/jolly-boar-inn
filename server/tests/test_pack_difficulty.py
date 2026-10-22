"""Every round pack tags its questions, so a room's difficulty changes what each round draws."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.config import REPO_ROOT

# Only the top level: the random events below it ignore the room's difficulty.
ROUND_PACKS = sorted((REPO_ROOT / "data" / "packs").glob("*.json"))


def questions(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


@pytest.mark.parametrize("path", ROUND_PACKS, ids=lambda path: path.stem)
def test_every_round_pack_question_has_a_difficulty(path: Path) -> None:
    untagged = [question["id"] for question in questions(path) if "difficulty" not in question]
    assert untagged == []


@pytest.mark.parametrize("path", ROUND_PACKS, ids=lambda path: path.stem)
def test_every_round_pack_spans_at_least_two_tiers(path: Path) -> None:
    tiers = {question.get("difficulty", "medium") for question in questions(path)}
    assert len(tiers) >= 2
