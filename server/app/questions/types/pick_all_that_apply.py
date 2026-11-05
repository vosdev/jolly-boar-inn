"""Pick all that apply: three to six written answers, and any number of them right.

Payload shape (schema ``$defs/pick_all_that_apply``)::

    {"intro"?: str, "prompt": str, "options": [str, ...], "answer_indices": [int, ...],
     "picks"?: int, "image"?: asset, "explanation"?: str}

Every spider in a list, every boss that drops an item. ``multiple_choice`` names one right
option; this names a set, so its answer is a set of shown positions too, sent as a list and
stored sorted. The options are shown in a shuffle seeded by the payload (``shuffle``), so
an author's habit of listing the right ones first never shows. ``picks`` is how many the
player must pick, said to them while the question is open, and then it is also how many
are right. Without it, any number from one to all of them may be picked.

Credit is the right picks over every option that is right or picked: the exact set is full
credit, and each missed right option or extra wrong one costs, so ticking everything earns
only the share of options that are right. ``check`` refuses a question where no option is
right, and allows one where every option is: a host or suggester may ask that on purpose.
"""

from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types import exact
from app.questions.types.scoring import Scoring
from app.questions.types.shuffle import seeded_order
from app.questions.types.timing import Timing

SCORING = Scoring.SPEED
# Each option is a yes or a no to weigh, and the reveal is the right set against yours.
ANSWER = Timing(base=10, per_item=3)
REVEAL = Timing(base=4, per_item=1)


def items(payload: dict[str, Any]) -> int:
    """The options to weigh."""
    return len(payload["options"])


_OPEN_KEYS = ("intro", "prompt", "options", "picks")


def shown_order(payload: dict[str, Any]) -> list[int]:
    """The payload index of each option, in the order the open view shows them."""
    return seeded_order("pick_all_that_apply", payload, len(payload["options"]))


def _shown_answers(payload: dict[str, Any]) -> list[int]:
    order = shown_order(payload)
    return sorted(order.index(index) for index in payload["answer_indices"])


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the question, the answers shuffled, how many to pick."""
    view = {key: payload[key] for key in _OPEN_KEYS if key in payload}
    view["options"] = [payload["options"][index] for index in shown_order(payload)]
    return view


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus the right answers' shown positions and why."""
    shown = {**client_view(payload), "answer_indices": _shown_answers(payload)}
    if "explanation" in payload:
        shown["explanation"] = payload["explanation"]
    return shown


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    """Right picks over every option that is right or picked: 1.0 only for the exact set."""
    right = set(_shown_answers(payload))
    credit: dict[UUID, float] = {}
    for s in submissions:
        picked = set(s.value)
        credit[s.player_id] = len(picked & right) / len(picked | right)
    return credit


def parse_value(payload: dict[str, Any], value: Any) -> list[int] | None:
    """Distinct shown positions, at least one, ``picks`` of them if set, sorted; else ``None``."""
    options = len(payload["options"])
    # Measured before anything is read, so a huge list is refused without walking it.
    if not isinstance(value, list) or not 1 <= len(value) <= options:
        return None
    indices: list[int] = []
    for raw in value:
        index = exact.whole_number(raw)
        if index is None or not 0 <= index < options:
            return None
        indices.append(index)
    if len(set(indices)) != len(indices):
        return None
    if "picks" in payload and len(indices) != payload["picks"]:
        return None
    return sorted(indices)


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: at least one option right, ``picks`` says how many, no repeats."""
    errors: list[str] = []
    options, answers = payload["options"], payload["answer_indices"]
    if not answers:
        errors.append("answer_indices: no option is right")
    out_of_range = [index for index in answers if not 0 <= index < len(options)]
    if out_of_range:
        errors.append(
            f"answer_indices: {out_of_range} are not options; there are only {len(options)}"
        )
    if answers != sorted(set(answers)):
        errors.append("answer_indices: must be in ascending order, each once")
    if "picks" in payload and payload["picks"] != len(answers):
        errors.append(f"picks: is {payload['picks']} but {len(answers)} options are right")
    seen: dict[str, int] = {}
    for index, option in enumerate(options):
        key = " ".join(option.split()).casefold()
        if key in seen:
            errors.append(f"options[{index}]: {option!r} repeats options[{seen[key]}]")
        else:
            seen[key] = index
    return errors
