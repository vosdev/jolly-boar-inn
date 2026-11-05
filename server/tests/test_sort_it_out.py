"""``data/packs/sort_it_out.json``: the hand-written orders Sort It Out is played from."""

import json
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds

PATH = REPO_ROOT / "data" / "packs" / "sort_it_out.json"


def questions() -> list[dict[str, Any]]:
    return json.loads(PATH.read_text(encoding="utf-8"))["questions"]


def test_sort_it_out_plays_ordering() -> None:
    assert MODES["sort_it_out"].types == {"ordering"}
    assert questions_bounds("sort_it_out").default == 5


@pytest.mark.parametrize("question", questions(), ids=lambda q: q["id"])
def test_every_question_is_a_sort_it_out_order(question: dict[str, Any]) -> None:
    assert (question["type"], question["mode"], question["source"]) == (
        "ordering",
        "sort_it_out",
        "pack",
    )


def test_the_pack_has_twenty_orders() -> None:
    assert len(questions()) >= 20


@pytest.mark.parametrize(
    "question",
    [q for q in questions() if q["tags"] == ["release"]],
    ids=lambda q: q["id"],
)
def test_a_release_order_explains_itself_with_every_date(question: dict[str, Any]) -> None:
    payload = question["payload"]
    dates = [entry["detail"] for entry in payload["entries"]]
    assert [date for date in dates if date not in payload["explanation"]] == []
