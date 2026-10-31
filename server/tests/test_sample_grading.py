"""The grading How to play's samples copy, on the cases `client/src/lib/samples.test.ts` reads."""

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

from app.questions.submission import Submission
from app.questions.types import ordering, slider
from app.questions.types.scoring import Steps
from app.rooms.scoring import step, step_points

CASES = json.loads(
    (Path(__file__).parent / "sample_grading_cases.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", CASES["steps"])
def test_step_points(case: dict[str, Any]) -> None:
    steps = Steps(build=case["build"], of=case["of"])
    at = step(case["elapsed"], case["seconds"], steps)
    assert step_points(at, steps.count) == case["points"]


@pytest.mark.parametrize("case", CASES["slider"])
def test_slider_credit(case: dict[str, Any]) -> None:
    got = slider.credit(case["min"], case["max"], case["answer"], case["guess"])
    assert got == pytest.approx(case["credit"], abs=1e-9)


@pytest.mark.parametrize("case", CASES["ordering"])
def test_ordering_credit(case: dict[str, Any]) -> None:
    """A case's value names entries; the server takes their shown positions, which it shuffles."""
    ranks = case["ranks"]
    payload: dict[str, Any] = {
        "prompt": "Which comes first?",
        "ends": ["First", "Last"],
        "entries": [{"text": f"Entry {i}", "rank": rank} for i, rank in enumerate(ranks)],
        "answer": sorted(range(len(ranks)), key=lambda i: ranks[i]),
    }
    if "picks" in case:
        payload["picks"] = case["picks"]
    shown = ordering.shown_order(payload)
    player = uuid4()
    value = [shown.index(entry) for entry in case["value"]]
    credit = ordering.grade(payload, [Submission(player, value)])[player]
    assert credit == pytest.approx(case["credit"], abs=1e-9)
