"""Number slider: a question with a number for an answer, picked on a slider between two bounds.

Payload shape (schema ``$defs/number_slider``)::

    {"intro"?: str, "prompt": str, "answer": int, "min": int, "max": int,
     "scale": "linear" | "log", "unit"?: str, "image"?: asset, "explanation"?: str}

``closest_number``'s sibling for questions where close is good enough: less typing, and
credit by how far along the slider a guess lands (``slider.accuracy``) rather than by rank,
so it rides the speed buckets. Where the exact number is the point, a drop rate of 1/1024
say, a question stays ``closest_number``.

A ``linear`` track steps by one; a ``log`` one snaps to three significant figures, so its
answer and ends must sit on that grid for the slider to reach them. The answer lies
strictly inside the range and off the start: on an end or the middle, where the slider
opens, the control would give it away.
"""

from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types import slider
from app.questions.types.scoring import Scoring
from app.questions.types.timing import Timing

SCORING = Scoring.SPEED
ANSWER = Timing(base=15)
REVEAL = Timing(base=8)

_OPEN_KEYS = ("intro", "prompt", "unit", "min", "max", "scale")


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the question, the unit and the slider's range."""
    return {key: payload[key] for key in _OPEN_KEYS if key in payload}


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus the number and why."""
    shown = {**client_view(payload), "answer": payload["answer"]}
    if "explanation" in payload:
        shown["explanation"] = payload["explanation"]
    return shown


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    """Credit by distance along the slider, as a share of its width (``slider.accuracy``)."""
    low, high, scale, answer = payload["min"], payload["max"], payload["scale"], payload["answer"]
    return slider.each(submissions, lambda guess: slider.accuracy(low, high, answer, guess, scale))


def parse_value(payload: dict[str, Any], value: Any) -> int | None:
    """A slider position within the range, as sent; ``None`` for anything else."""
    return slider.parse(payload["min"], payload["max"], value, payload["scale"])


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: a track the slider can draw, and an answer it reaches but does not start on."""
    low, high, scale, answer = payload["min"], payload["max"], payload["scale"], payload["answer"]
    if scale == slider.LOG and low < 1:
        return [f"min: {low} is below 1, where a log slider has no track"]
    if not low < high:
        return [f"max: {high} is not above min {low}"]
    errors = [
        f"{key}: {payload[key]} has more than three significant figures, off the log slider"
        for key in ("min", "max", "answer")
        if not slider.on_track(payload[key], scale)
    ]
    if not low < answer < high:
        errors.append(f"answer: {answer} is not strictly between {low} and {high}")
    elif answer == slider.middle(low, high, scale):
        errors.append(f"answer: {answer} is where the slider starts")
    return errors
