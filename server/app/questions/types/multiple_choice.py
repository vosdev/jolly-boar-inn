"""Multiple choice: a question, two to six answers written out, and one of them right.

Payload shape (schema ``$defs/multiple_choice``)::

    {"prompt": str, "options": [str, ...], "answer_index": int,
     "image"?: asset, "explanation"?: str}

The most shared answer shape in the game: Bestiary, Drop Table, Odd One Out, Who Said
That? and Clipped are all this, and so is most of what a host writes for their own
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
from app.questions.types.bounds import Bounds
from app.questions.types.scoring import Scoring

SCORING = Scoring.SPEED
# A sentence and up to six answers to read, which takes longer than four prices: fifteen
# seconds by default, and no more than half a minute before it is a question about
# re-reading rather than knowing.
SECONDS = Bounds(default=15, minimum=5, maximum=30)

_OPEN_KEYS = ("prompt", "image", "options")


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
    return {s.player_id: 1.0 if s.value == payload["answer_index"] else 0.0 for s in submissions}


def validate_value(payload: dict[str, Any], value: Any) -> bool:
    # ``True == 1``, so a ``true`` would otherwise answer option 1; see ``more_less``.
    if isinstance(value, bool) or not isinstance(value, int):
        return False
    return 0 <= value < len(payload["options"])


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
