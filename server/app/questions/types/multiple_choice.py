"""Multiple choice: a question, two to six answers written out, and one of them right.

Payload shape (schema ``$defs/multiple_choice``)::

    {"intro"?: str, "prompt": str, "quote"?: str, "options": [str, ...],
     "answer_index": int, "image"?: asset, "explanation"?: str}

The most shared answer shape in the game: Bestiary, Drop Table, Odd One Out, Who Said
That? and Know Your Content Creator are all this, and so is most of what a host writes for their own
questions. None of those rounds differ in how they are answered, only in what they ask and
how the question looks, which is why they are modes over one type (``app/modes``) and why
nothing here knows which round it is in. The stem above the buttons is the mode's business
on the client.

Answers are the index of the chosen option, like ``more_less`` and ``price_is_right``. The
options are the question, so they are on the wire while it is open; only which one is
right waits for the reveal, with the ``explanation`` that says why.

``check`` refuses two options that read the same. Two identical buttons are either two
right answers, which the index can only name one of, or a right one and a wrong one that a
player cannot tell apart.
"""

from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types import exact
from app.questions.types.scoring import Scoring
from app.questions.types.timing import Timing

SCORING = Scoring.SPEED
# A sentence and its answers to read, two seconds an option; the reveal is one answer lit.
ANSWER = Timing(base=10, per_item=2)
REVEAL = Timing(base=4, per_item=0.5)


def items(payload: dict[str, Any]) -> int:
    """The options to read."""
    return len(payload["options"])


_OPEN_KEYS = ("intro", "prompt", "quote", "image", "options")


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the question and every answer to pick from."""
    view = {key: payload[key] for key in _OPEN_KEYS if key in payload}
    view["options"] = list(payload["options"])
    return view


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus which answer was right and why."""
    shown = {**client_view(payload), "answer_index": payload["answer_index"]}
    if "explanation" in payload:
        shown["explanation"] = payload["explanation"]
    return shown


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    """Full credit for the index of the right option, none for any other."""
    return exact.grade(payload["answer_index"], submissions)


def parse_value(payload: dict[str, Any], value: Any) -> int | None:
    """The index of one of the options, as sent; ``None`` for anything else."""
    return exact.option_index(payload, value)


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: the answer is one of the options, and no two options read the same."""
    errors: list[str] = []
    options = payload["options"]
    if payload["answer_index"] >= len(options):
        errors.append(
            f"answer_index: is {payload['answer_index']} but there are only {len(options)} options"
        )
    seen: dict[str, int] = {}
    for index, option in enumerate(options):
        key = " ".join(option.split()).casefold()
        if key in seen:
            errors.append(f"options[{index}]: {option!r} repeats options[{seen[key]}]")
        else:
            seen[key] = index
    return errors
