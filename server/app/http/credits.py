"""``GET /api/credits``: the players who wrote pack questions, for the client's ``/credits``.

Counted from the loaded packs rather than kept as a list, so an import that credits someone
new reaches the page with the release that ships it. Only a ``credit_shown`` question counts,
the same opt-in the reveal reads (``rooms/state.py``): a player who asked not to be named on
screen is not named here either.
"""

from collections import Counter
from collections.abc import Iterable
from typing import Any

from fastapi import APIRouter, Request

from app.questions.packs import Pack

router = APIRouter(prefix="/api/credits")


def authors(packs: Iterable[Pack]) -> list[dict[str, Any]]:
    """Each shown credit with its question count, most questions first, then by name."""
    counts = Counter(
        question["credit"]
        for pack in packs
        for question in pack.questions
        if question.get("credit_shown") is True and question.get("credit")
    )
    ranked = sorted(counts.items(), key=lambda entry: (-entry[1], entry[0].casefold()))
    return [{"name": name, "questions": count} for name, count in ranked]


@router.get("")
def get_credits(request: Request) -> dict[str, Any]:
    """The question authors who agreed to be named."""
    return {"authors": authors(request.app.state.packs)}
