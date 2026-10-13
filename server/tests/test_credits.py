"""``GET /api/credits``: who wrote pack questions, counted from the packs, opt-in only."""

from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.http.credits import authors
from app.questions.packs import Pack


def _pack(*questions: dict[str, Any]) -> Pack:
    return Pack(name="p", generated_at=None, questions=questions, path=Path("p.json"))


def _by(credit: str, shown: bool | None = True) -> dict[str, Any]:
    question: dict[str, Any] = {"credit": credit}
    if shown is not None:
        question["credit_shown"] = shown
    return question


def test_counts_each_shown_credit_across_packs_most_first() -> None:
    packs = [
        _pack(_by("Tayka"), _by("AFKFisher"), {}),
        _pack(_by("Tayka"), _by("AFKFisher"), _by("Tayka"), _by("Zezima")),
    ]
    assert authors(packs) == [
        {"name": "Tayka", "questions": 3},
        {"name": "AFKFisher", "questions": 2},
        {"name": "Zezima", "questions": 1},
    ]


def test_a_credit_not_shown_is_never_named() -> None:
    """The reveal's opt-in: a missing ``credit_shown`` hides the name as ``false`` does."""
    packs = [_pack(_by("Tayka"), _by("Hidden", shown=False), _by("Unsaid", shown=None))]
    assert authors(packs) == [{"name": "Tayka", "questions": 1}]


def test_a_tie_is_ordered_by_name_ignoring_case() -> None:
    packs = [_pack(_by("woox"), _by("Lynx Titan"), _by("Alpha"))]
    assert [a["name"] for a in authors(packs)] == ["Alpha", "Lynx Titan", "woox"]


def test_no_shown_credit_is_an_empty_list() -> None:
    assert authors([_pack({}, _by("Hidden", shown=False))]) == []


def test_the_endpoint_serves_the_loaded_packs(app: FastAPI, client: TestClient) -> None:
    app.state.packs[:] = [_pack(_by("Tayka"), _by("Tayka"), _by("Hidden", shown=False))]
    response = client.get("/api/credits")
    assert response.status_code == 200
    assert response.json() == {"authors": [{"name": "Tayka", "questions": 2}]}
