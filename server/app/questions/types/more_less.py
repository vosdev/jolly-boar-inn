"""More or less: of two items, which one's metric is the higher — or the lower?

Payload shape (schema ``$defs/more_less``)::

    {"metric": "ge_price", "direction": "more" | "less",
     "options": [{"subject": {...}, "value": int}, {"subject": {...}, "value": int}],
     "answer_index": 0 | 1, "as_of": "YYYY-MM-DD"}

Players see two names and the direction, and nothing else: no values at all, which is the
whole game. ``direction`` is drawn per question at generation time, so the word on screen
is the thing to read rather than something to learn once and stop noticing.

Answers are the index of the chosen option, matching ``price_is_right`` and
``multiple_choice`` in the schema rather than inventing a second convention.
"""

from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types import exact
from app.questions.types.bounds import Bounds

DIRECTIONS = ("more", "less")
# This shape is meant to be quick: two names, one word to read. Ten seconds is plenty, and
# a minute of it would be forty-five seconds of waiting. Twenty is as far as a host may
# stretch one question before that is all it is.
SECONDS = Bounds(default=10, minimum=5, maximum=20)


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while the question is open: the names and the direction."""
    return {
        "metric": payload["metric"],
        "direction": payload["direction"],
        "options": [{"subject": dict(option["subject"])} for option in payload["options"]],
        "as_of": payload["as_of"],
    }


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: both values and which option was right."""
    return {
        "metric": payload["metric"],
        "direction": payload["direction"],
        "options": [
            {"subject": dict(option["subject"]), "value": option["value"]}
            for option in payload["options"]
        ],
        "answer_index": payload["answer_index"],
        "as_of": payload["as_of"],
    }


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    """Full credit for the index of the right option, none for any other."""
    return exact.grade(payload["answer_index"], submissions)


def parse_value(payload: dict[str, Any], value: Any) -> int | None:
    """The index of one of the options, as sent; ``None`` for anything else."""
    return exact.option_index(payload, value)


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: ``answer_index`` must follow from the two stored values."""
    errors: list[str] = []
    options = payload["options"]
    values = [option["value"] for option in options]
    names = [option["subject"]["name"] for option in options]
    assets = [option["subject"].get("asset") for option in options]
    if len(set(names)) != len(names):
        errors.append(f"options: both options are {names[0]!r}")
    elif len([a for a in assets if a is not None]) != len({a for a in assets if a is not None}):
        errors.append(f"options: both options are asset {assets[0]!r}")
    if values[0] == values[1]:
        errors.append(f"answer_index: both options have value {values[0]}, so no answer is right")
        return errors
    expected = values.index(max(values) if payload["direction"] == "more" else min(values))
    if payload["answer_index"] != expected:
        errors.append(
            f"answer_index: is {payload['answer_index']} but with direction"
            f" {payload['direction']!r} and values {values} the answer is {expected}"
        )
    return errors
