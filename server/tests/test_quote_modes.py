"""Who Said That? and Know Your Content Creator: two hand-written rounds on four buttons."""

import json
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds, seconds_bounds
from app.questions import schema

QUOTE_MODES = ("who_said_that", "know_your_content_creator")


def questions(mode: str) -> list[dict[str, Any]]:
    path = REPO_ROOT / "data" / "packs" / f"{mode}.json"
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


@pytest.mark.parametrize("mode", QUOTE_MODES)
def test_a_quote_round_is_multiple_choice_with_time_to_read(mode: str) -> None:
    assert MODES[mode].types == {"multiple_choice"}
    seconds = seconds_bounds(mode)
    assert (seconds.default, seconds.minimum, seconds.maximum) == (20, 5, 30)
    assert questions_bounds(mode).default == 5


def test_clipped_is_now_know_your_content_creator() -> None:
    assert "clipped" not in MODES


@pytest.mark.parametrize(
    "question",
    [q for mode in QUOTE_MODES for q in questions(mode)],
    ids=lambda q: q["id"],
)
def test_every_question_is_its_modes_own_with_a_source(question: dict[str, Any]) -> None:
    assert question["type"] == "multiple_choice" and question["source"] == "pack"
    assert question["mode"] in QUOTE_MODES
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
