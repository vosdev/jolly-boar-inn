"""``data/packs/sort_it_out.json``: the hand-written orders Sort It Out is played from."""

import json
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds, seconds_bounds
from app.questions.types import ordering

PATH = REPO_ROOT / "data" / "packs" / "sort_it_out.json"


def questions() -> list[dict[str, Any]]:
    return json.loads(PATH.read_text(encoding="utf-8"))["questions"]


def test_sort_it_out_plays_ordering_at_its_types_pace() -> None:
    assert MODES["sort_it_out"].types == {"ordering"}
    assert seconds_bounds("sort_it_out") is ordering.SECONDS
    assert questions_bounds("sort_it_out").default == 5


@pytest.mark.parametrize("question", questions(), ids=lambda q: q["id"])
def test_every_question_is_a_sort_it_out_order_with_its_own_prompt(
    question: dict[str, Any],
) -> None:
    assert (question["type"], question["mode"], question["source"]) == (
        "ordering",
        "sort_it_out",
        "pack",
    )
    assert len(question["tags"]) == 1 and question["tags"][0] in {"tier", "combat", "release"}
    assert question["payload"]["prompt"].startswith("Sort ")


@pytest.mark.parametrize(
    "question",
    [q for q in questions() if q["tags"] == ["release"]],
    ids=lambda q: q["id"],
)
def test_a_release_order_explains_itself_with_every_date(question: dict[str, Any]) -> None:
    payload = question["payload"]
    dates = [entry["detail"] for entry in payload["entries"]]
    assert [date for date in dates if date not in payload["explanation"]] == []


def test_a_tier_and_a_release_order_ask_differently() -> None:
    prompts = {q["tags"][0]: q["payload"]["prompt"] for q in questions()}
    assert prompts["tier"] != prompts["release"]
