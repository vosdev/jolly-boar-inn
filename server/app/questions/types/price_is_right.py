"""The Price is Right: one item, a range of prices, and a slider to pick what it goes for.

Payload shape (schema ``$defs/price_is_right``)::

    {"subject": {"name": ..., "asset": ...}, "value": int,
     "min": int, "max": int, "as_of": "YYYY-MM-DD"}

The answer is a price in gp on the slider's grid (``types/slider.py``), and credit is by
how close it lands, however late. Writing ``1650000`` the way the game writes coins is the
client's job (``lib/gp.ts``), so a pack never bakes in one build's idea of what a coin
amount looks like.

``value`` is the Grand Exchange price rounded to two significant figures, the grid the
game's own coin notation lands on exactly, and ``min`` and ``max`` sit on that grid too.
The range is shown while the question is open -- it is the question -- and only the price
waits for the reveal.
"""

from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types import slider
from app.questions.types.scoring import Scoring
from app.questions.types.timing import Timing

SCORING = Scoring.ACCURACY
GRACE = 0.0
ANSWER = Timing(base=15)
REVEAL = Timing(base=6)


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while the question is open: the item and the slider's range."""
    return {
        "subject": dict(payload["subject"]),
        "min": payload["min"],
        "max": payload["max"],
        "as_of": payload["as_of"],
    }


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus the price."""
    return {**client_view(payload), "value": payload["value"]}


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    """Credit by distance along the slider (``slider.credit``)."""
    return slider.grade(payload["min"], payload["max"], payload["value"], submissions)


def parse_value(payload: dict[str, Any], value: Any) -> int | None:
    """A price on the slider's grid within the range, as sent; ``None`` for anything else."""
    return slider.parse(payload["min"], payload["max"], value)


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: the price lies strictly inside the range, all three on the two-figure grid."""
    errors: list[str] = []
    low, value, high = payload["min"], payload["value"], payload["max"]
    for key in ("min", "value", "max"):
        if not slider.on_grid(payload[key], slider.ANSWER_FIGURES):
            errors.append(f"{key}: {payload[key]} has more than two significant figures")
    if not low < value < high:
        # On an end, the slider's stop would give the answer away.
        errors.append(f"value: {value} is not strictly between {low} and {high}")
    return errors
