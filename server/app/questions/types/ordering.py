"""Ordering: three to six entries, and the player puts them in order.

Payload shape (schema ``$defs/ordering``)::

    {"intro"?: str, "prompt": str, "image"?: asset, "ends": [first, last],
     "entries": [{"text": str, "rank": int, "detail"?: str}, ...], "answer": [int, ...],
     "explanation"?: str}

``rank`` is what grading reads: a lower rank comes first, and equal ranks are a tie that
may go either way round, such as two quests released on one day. ``answer`` is the order
the reveal shows, entry indices sorted by ``rank``, which only adds the author's choice
among ties. ``ends`` labels the two ends ("Weakest", "Strongest") so the direction is
never in doubt, and ``detail`` is the fact the reveal puts beside an entry.

The open view shows the entries in a shuffle seeded from the payload's content, so every
socket and every reconnect sees one order, and a value is that shown order's positions,
first end first. The entries themselves carry no key: an author writes them in answer
order, so any index or key from the payload would give the answer away.

Credit is the fraction of places holding an entry of the rank that belongs there.
"""

import hashlib
import json
import random
from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types import exact
from app.questions.types.bounds import Bounds
from app.questions.types.scoring import Scoring

SCORING = Scoring.SPEED
# Up to six entries to read and place one by one: longer than ticking boxes, and a phone
# player tapping them in needs the slack more than anyone.
SECONDS = Bounds(default=25, minimum=10, maximum=45)

_OPEN_KEYS = ("intro", "prompt", "image", "ends")


def shown_order(payload: dict[str, Any]) -> list[int]:
    """The payload index of each entry, in the order the open view shows them."""
    material = b"ordering\n" + json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    order = list(range(len(payload["entries"])))
    random.Random(hashlib.sha256(material).digest()).shuffle(order)
    ranks = [payload["entries"][index]["rank"] for index in order]
    # Already in order would hand out full credit for tapping top to bottom. Moving the
    # first to the end cannot leave it in order, since ``check`` refuses all ties.
    if ranks == sorted(ranks):
        order = order[1:] + order[:1]
    return order


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the entries, shuffled, and what either end is."""
    view = {key: payload[key] for key in _OPEN_KEYS if key in payload}
    view["ends"] = list(payload["ends"])
    view["entries"] = [{"text": payload["entries"][i]["text"]} for i in shown_order(payload)]
    return view


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: each shown entry's rank and detail, and the order as shown positions."""
    order = shown_order(payload)
    position = {index: shown for shown, index in enumerate(order)}
    entries = []
    for index in order:
        entry = payload["entries"][index]
        entries.append({key: entry[key] for key in ("text", "rank", "detail") if key in entry})
    shown = {**client_view(payload), "entries": entries}
    shown["answer"] = [position[index] for index in payload["answer"]]
    if "explanation" in payload:
        shown["explanation"] = payload["explanation"]
    return shown


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    """The fraction of places holding an entry of the rank that belongs there."""
    ranks = [payload["entries"][index]["rank"] for index in shown_order(payload)]
    wanted = sorted(ranks)
    credit: dict[UUID, float] = {}
    for s in submissions:
        placed = sum(ranks[shown] == rank for shown, rank in zip(s.value, wanted, strict=True))
        credit[s.player_id] = placed / len(wanted)
    return credit


def parse_value(payload: dict[str, Any], value: Any) -> list[int] | None:
    """Every shown position once, first end first; else ``None``."""
    count = len(payload["entries"])
    # Measured before anything is read, so a huge list is refused without walking it.
    if not isinstance(value, list) or len(value) != count:
        return None
    positions: list[int] = []
    for raw in value:
        shown = exact.whole_number(raw)
        if shown is None:
            return None
        positions.append(shown)
    if sorted(positions) != list(range(count)):
        return None
    return positions


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: ``answer`` lists every entry once, sorted by rank, and not all ranks tie."""
    errors: list[str] = []
    entries, answer = payload["entries"], payload["answer"]
    if sorted(answer) != list(range(len(entries))):
        errors.append(f"answer: must list each of the {len(entries)} entries once")
    else:
        for before, after in zip(answer, answer[1:], strict=False):
            if entries[before]["rank"] > entries[after]["rank"]:
                errors.append(
                    f"answer: entries[{after}] (rank {entries[after]['rank']}) comes after "
                    f"entries[{before}] (rank {entries[before]['rank']})"
                )
    if len({entry["rank"] for entry in entries}) == 1:
        errors.append("entries: every rank is the same, so any order is right")
    seen: dict[str, int] = {}
    for index, entry in enumerate(entries):
        key = " ".join(entry["text"].split()).casefold()
        if key in seen:
            errors.append(f"entries[{index}]: {entry['text']!r} repeats entries[{seen[key]}]")
        else:
            seen[key] = index
    return errors
