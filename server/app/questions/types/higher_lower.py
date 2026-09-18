"""Higher/lower: is the target's metric higher or lower than the anchor's?

Payload shape (schema ``$defs/higher_lower``)::

    {"metric": "ge_price", "anchor": {"subject": {...}, "value": int},
     "target": {"subject": {...}, "value": int}, "answer": "higher" | "lower",
     "as_of": "YYYY-MM-DD"}

Players see the anchor with its value and the target without one.
"""

from typing import Any
from uuid import UUID

from app.questions.submission import Submission

ANSWERS = ("higher", "lower")


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while the question is open: no answer, no target value."""
    return {
        "metric": payload["metric"],
        "anchor": {
            "subject": dict(payload["anchor"]["subject"]),
            "value": payload["anchor"]["value"],
        },
        "target": {"subject": dict(payload["target"]["subject"])},
        "as_of": payload["as_of"],
    }


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the answer and both values."""
    return {
        "metric": payload["metric"],
        "anchor": {
            "subject": dict(payload["anchor"]["subject"]),
            "value": payload["anchor"]["value"],
        },
        "target": {
            "subject": dict(payload["target"]["subject"]),
            "value": payload["target"]["value"],
        },
        "answer": payload["answer"],
        "as_of": payload["as_of"],
    }


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, bool]:
    return {s.player_id: s.value == payload["answer"] for s in submissions}


def validate_value(payload: dict[str, Any], value: Any) -> bool:
    return isinstance(value, str) and value in ANSWERS


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: ``answer`` must follow from the two stored values."""
    anchor = payload["anchor"]["value"]
    target = payload["target"]["value"]
    if target == anchor:
        return [f"answer: anchor and target both have value {anchor}, so no answer is right"]
    expected = "higher" if target > anchor else "lower"
    if payload["answer"] != expected:
        return [
            f"answer: is {payload['answer']!r} but target value {target}"
            f" is {expected} than anchor value {anchor}"
        ]
    return []
