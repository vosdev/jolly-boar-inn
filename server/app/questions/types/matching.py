"""Matching: three to six fields, and the player puts the option that belongs on each.

Payload shape (schema ``$defs/matching``)::

    {"intro"?: str, "prompt": str, "image"?: asset, "bins"?: true,
     "fields": [{"text"?: str, "icon"?: asset}, ...],
     "options": [{"text": str, "detail"?: str}, ...], "answer": [int, ...],
     "explanation"?: str}

Four bosses and the places they live, say. ``answer`` names the option that belongs on
each field, in field order. Options beyond the fields are decoys, as in
``pick_all_that_apply``, so the last one placed is not given away by elimination. A field
may be an icon instead of a name: an item to match to the monster that drops it.

The fields are shown in the author's order, the options in a shuffle seeded by the
payload (``shuffle``), and a value is one shown option position per field. An icon goes
out as its picture's random name (``pictured``), never its asset id, which may be the
answer. Credit is the fields that hold their option, over the fields.

With ``bins`` the options are three or four bins and the fields four to six entries sorted
into them: free-to-play or members, which god an item belongs to. A bin takes any number
of entries, none included, so ``answer`` and a value may repeat an option.
"""

from collections.abc import Mapping
from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types import exact
from app.questions.types.scoring import Scoring
from app.questions.types.shuffle import seeded_order
from app.questions.types.timing import Timing

SCORING = Scoring.SPEED
GRACE = 0.0
# Each field is read and filled one by one, and the reveal sets each option on its field
# with its detail beside it, as ordering does.
ANSWER = Timing(base=10, per_item=5)
REVEAL = Timing(base=4, per_item=2)
# Over two bins a blind sort averages half credit, a coin flip with partial credit.
BINS = (3, 4)
BIN_ENTRIES = (4, 6)


def items(payload: dict[str, Any]) -> int:
    """The fields to fill."""
    return len(payload["fields"])


# ``bins`` tells the view to draw bins, and gives nothing away.
_OPEN_KEYS = ("intro", "prompt", "bins")


def shown_order(payload: dict[str, Any]) -> list[int]:
    """The payload index of each option, in the order the open view shows them."""
    order = seeded_order("matching", payload, len(payload["options"]))
    if payload.get("bins"):
        return order
    # Every field's option beside it would hand out full credit for dropping them in as
    # they lie. Moving the first to the end moves each of them up one, off its field.
    if all(order.index(option) == field for field, option in enumerate(payload["answer"])):
        order = order[1:] + order[:1]
    return order


def _shown_answer(payload: dict[str, Any]) -> list[int]:
    order = shown_order(payload)
    return [order.index(option) for option in payload["answer"]]


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the fields' names and the options, shuffled."""
    view = {key: payload[key] for key in _OPEN_KEYS if key in payload}
    view["fields"] = [
        {"text": field["text"]} if "text" in field else {} for field in payload["fields"]
    ]
    view["options"] = [{"text": payload["options"][i]["text"]} for i in shown_order(payload)]
    return view


def pictured(
    view: dict[str, Any], payload: dict[str, Any], pictures: Mapping[str, str]
) -> dict[str, Any]:
    """``view`` with each icon field's picture, by its random name in the client."""
    fields = []
    for shown, field in zip(view["fields"], payload["fields"], strict=True):
        picture = pictures.get(field.get("icon", ""))
        fields.append({**shown, "picture": picture} if picture is not None else shown)
    return {**view, "fields": fields}


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: each option's detail, and each field's option as a shown position."""
    options = []
    for index in shown_order(payload):
        option = payload["options"][index]
        options.append({key: option[key] for key in ("text", "detail") if key in option})
    shown = {**client_view(payload), "options": options, "answer": _shown_answer(payload)}
    if "explanation" in payload:
        shown["explanation"] = payload["explanation"]
    return shown


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    """The fields holding the option that belongs there, over the fields."""
    right = _shown_answer(payload)
    credit: dict[UUID, float] = {}
    for s in submissions:
        hits = sum(1 for placed, want in zip(s.value, right, strict=True) if placed == want)
        credit[s.player_id] = hits / len(right)
    return credit


def parse_value(payload: dict[str, Any], value: Any) -> list[int] | None:
    """One shown option position per field, in field order, distinct unless ``bins``; else
    ``None``."""
    count = len(payload["options"])
    # Measured before anything is read, so a huge list is refused without walking it.
    if not isinstance(value, list) or len(value) != len(payload["fields"]):
        return None
    positions: list[int] = []
    for raw in value:
        shown = exact.whole_number(raw)
        if shown is None or not 0 <= shown < count:
            return None
        positions.append(shown)
    if not payload.get("bins") and len(set(positions)) != len(positions):
        return None
    return positions


def _key(text: str) -> str:
    return " ".join(text.split()).casefold()


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: an option per field, and no field or option that reads like another.
    Without ``bins``, none used twice and at least as many options as fields; with it, three
    or four options and four to six fields."""
    errors: list[str] = []
    fields, options, answer = payload["fields"], payload["options"], payload["answer"]
    bins = bool(payload.get("bins"))
    if bins:
        if not BINS[0] <= len(options) <= BINS[1]:
            errors.append(f"options: {len(options)} bins; a sort takes {BINS[0]} to {BINS[1]}")
        if not BIN_ENTRIES[0] <= len(fields) <= BIN_ENTRIES[1]:
            errors.append(
                f"fields: {len(fields)} entries; a sort takes {BIN_ENTRIES[0]} to {BIN_ENTRIES[1]}"
            )
    elif len(options) < len(fields):
        errors.append(f"options: {len(options)} for {len(fields)} fields; each field needs one")
    if len(answer) != len(fields):
        errors.append(f"answer: must name one option for each of the {len(fields)} fields")
    out_of_range = [index for index in answer if not 0 <= index < len(options)]
    if out_of_range:
        errors.append(f"answer: {out_of_range} are not options; there are only {len(options)}")
    if not bins and len(set(answer)) != len(answer):
        errors.append("answer: uses an option on two fields")
    seen: dict[tuple[str, str], int] = {}
    for index, field in enumerate(fields):
        key = (_key(field.get("text", "")), field.get("icon", ""))
        if key in seen:
            errors.append(f"fields[{index}]: repeats fields[{seen[key]}]")
        else:
            seen[key] = index
    texts: dict[str, int] = {}
    for index, option in enumerate(options):
        key = _key(option["text"])
        if key in texts:
            errors.append(f"options[{index}]: {option['text']!r} repeats options[{texts[key]}]")
        else:
            texts[key] = index
    return errors
