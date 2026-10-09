"""The Price is Right: one item, four prices, and which of them it goes for.

Payload shape (schema ``$defs/price_is_right``)::

    {"subject": {"name": ..., "asset": ...}, "value": int,
     "options": [int, int, int, int], "answer_index": 0..3, "as_of": "YYYY-MM-DD"}

It is its own type rather than ``multiple_choice`` with four pre-formatted strings, and
``check`` is the reason. With strings, ``"1.6M"`` is text like any other and nothing can
say whether it is the item's price or a typo of it. With integers the payload carries the
price once as a fact, ``value``, and once as the answer, ``options[answer_index]``, and
the two can be held to each other -- the same "derivable answers are still stored, and
checked" rule ``more_less`` keeps with its ``answer_index``. Writing ``1650000`` the way
the game writes coins is the client's job (``lib/gp.ts``), so a pack never bakes in one
build's idea of what a coin amount looks like.

``value`` is the price as the pack states it, which for a generated pack is the Grand
Exchange price already rounded to the grid the distractors sit on. Rounding it on the way
in rather than comparing against a rounded copy keeps the rule one equality: the answer
*is* the price, not something near it.

The options are shown while the question is open -- they are the question -- and only
which one is right waits for the reveal.
"""

from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types import exact
from app.questions.types.scoring import Scoring
from app.questions.types.timing import Timing

SCORING = Scoring.SPEED
# A number per option to weigh against what you remember paying.
ANSWER = Timing(base=6, per_item=1)
REVEAL = Timing(base=6)


def items(payload: dict[str, Any]) -> int:
    """The prices to weigh."""
    return len(payload["options"])


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while the question is open: the item and all four prices."""
    return {
        "subject": dict(payload["subject"]),
        "options": list(payload["options"]),
        "as_of": payload["as_of"],
    }


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus the price and which option it was."""
    return {
        **client_view(payload),
        "value": payload["value"],
        "answer_index": payload["answer_index"],
    }


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    """Full credit for the index of the right option, none for any other."""
    return exact.grade(payload["answer_index"], submissions)


def parse_value(payload: dict[str, Any], value: Any) -> int | None:
    """The index of one of the options, as sent; ``None`` for anything else."""
    return exact.option_index(payload, value)


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: the answer is the stored price, and no other option is."""
    errors: list[str] = []
    options = payload["options"]
    if len(set(options)) != len(options):
        # Two equal prices are two right answers, or two wrong ones that read as one.
        errors.append(f"options: {options} repeats a price")
    answer = options[payload["answer_index"]]
    if answer != payload["value"]:
        errors.append(
            f"answer_index: points at {answer} but the stored price is {payload['value']}"
        )
    return errors
