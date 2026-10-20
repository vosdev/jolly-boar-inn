"""Who Said That? and Know Your Content Creator: two hand-written rounds about what people said."""

import json
import random
import uuid
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds
from app.questions import schema
from app.questions.packs import load_packs
from app.questions.submission import Submission
from app.questions.types import TYPES
from app.rooms.selection import select
from app.rooms.settings import RoomSettings
from tests.answers import right_value
from tests.packs import PACKS_DIR

QUOTE_MODES = ("who_said_that", "know_your_content_creator")


def questions(mode: str) -> list[dict[str, Any]]:
    path = REPO_ROOT / "data" / "packs" / f"{mode}.json"
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


def test_who_said_that_is_multiple_choice() -> None:
    assert MODES["who_said_that"].types == {"multiple_choice"}
    assert questions_bounds("who_said_that").default == 5


def test_know_your_content_creator_mixes_three_types() -> None:
    mode = "know_your_content_creator"
    assert MODES[mode].types == {"multiple_choice", "closest_number", "pick_all_that_apply"}
    assert questions_bounds(mode).default == 5


def test_a_know_your_content_creator_round_draws_and_scores_all_three_types() -> None:
    mode = "know_your_content_creator"
    settings = RoomSettings(modes=[{"mode": mode, "questions": len(questions(mode))}])
    (played,) = select(load_packs(PACKS_DIR), [], settings, random.Random(1))
    own = [q for q in played.questions if q["mode"] == mode]
    assert {q["type"] for q in own} == MODES[mode].types
    for question in own:
        payload, player = question["payload"], uuid.uuid4()
        value = TYPES[question["type"]].parse_value(payload, right_value(question["type"], payload))
        credit = TYPES[question["type"]].grade(payload, [Submission(player, value)])
        assert credit[player] == 1.0


def test_clipped_is_now_know_your_content_creator() -> None:
    assert "clipped" not in MODES


@pytest.mark.parametrize(
    "question",
    [q for mode in QUOTE_MODES for q in questions(mode)],
    ids=lambda q: q["id"],
)
def test_every_question_is_its_modes_own_with_a_source(question: dict[str, Any]) -> None:
    assert question["mode"] in QUOTE_MODES and question["source"] == "pack"
    assert question["type"] in MODES[question["mode"]].types
    assert "wiki" in question or "source_url" in question


@pytest.mark.parametrize("question", questions("who_said_that"), ids=lambda q: q["id"])
def test_who_said_that_always_shows_a_quote(question: dict[str, Any]) -> None:
    assert question["payload"]["quote"].strip() != ""


def test_a_source_url_may_be_any_https_link() -> None:
    question = questions("know_your_content_creator")[0]
    del question["wiki"]
    clip = question | {"source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
    assert schema.schema_errors(clip) == []
    plain = question | {"source_url": "http://example.com/clip"}
    assert [e for e in schema.schema_errors(plain) if e.startswith("$.source_url")] != []
