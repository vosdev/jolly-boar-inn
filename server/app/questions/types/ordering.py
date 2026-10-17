"""Ordering: three to six entries, and the player puts them, or the first few, in order.

Payload shape (schema ``$defs/ordering``)::

    {"intro"?: str, "prompt": str, "image"?: asset, "ends": [first, last],
     "entries": [{"text": str, "rank": int, "detail"?: str}, ...], "answer": [int, ...],
     "picks"?: int, "explanation"?: str}

``rank`` is what grading reads: a lower rank comes first, and equal ranks are a tie that
may go either way round, such as two quests released on one day. Ranks run from 1 with no
gap, so a tie at 1 is followed by 2. ``answer`` is the order the reveal shows, entry
indices sorted by ``rank``, which only adds the author's choice among ties. ``ends``
labels the two ends ("Weakest", "Strongest") so the direction is never in doubt, and
``detail`` is the fact the reveal puts beside an entry. With ``picks``, shown open, the
player orders only that many, from the first end: the top three of six, say, with the
other three there to be left out.

The open view shows the entries in a shuffle seeded from the payload's content, so every
socket and every reconnect sees one order, and a value is that shown order's positions,
first end first. The entries themselves carry no key: an author writes them in answer
order, so any index or key from the payload would give the answer away.

Credit is per place, over the places played: 1 for an entry of the rank that belongs
there. With ``picks``, an entry that belongs among the picked but in another place earns
half, so the right three in the wrong order is not scored like three wrong ones. Without
``picks`` every entry belongs somewhere, so the half would pay for any answer at all.
"""

from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types import exact
from app.questions.types.scoring import Scoring
from app.questions.types.shuffle import seeded_order
from app.questions.types.timing import Timing

SCORING = Scoring.SPEED
# Every entry is read and placed one by one, and the reveal sets each in its place with
# its detail beside it: the slowest shape on both counts.
ANSWER = Timing(base=10, per_item=5)
REVEAL = Timing(base=4, per_item=2)


def items(payload: dict[str, Any]) -> int:
    """The entries on screen, picked or not: all of them are read."""
    return len(payload["entries"])


_OPEN_KEYS = ("intro", "prompt", "ends", "picks")


def places(payload: dict[str, Any]) -> int:
    """How many places a value fills: ``picks``, or every entry."""
    return payload.get("picks", len(payload["entries"]))


def shown_order(payload: dict[str, Any]) -> list[int]:
    """The payload index of each entry, in the order the open view shows them."""
    order = seeded_order("ordering", payload, len(payload["entries"]))
    ranks = [payload["entries"][index]["rank"] for index in order]
    played = places(payload)
    # Already in order would hand out full credit for tapping top to bottom. Moving the
    # first to the end leaves the played places in order only if the first ``played + 1``
    # ranks tie, which ``check`` refuses.
    if ranks[:played] == sorted(ranks)[:played]:
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
    """Per place played, 1 for the rank that belongs there, and with ``picks`` half for one
    that belongs in another."""
    ranks = [payload["entries"][index]["rank"] for index in shown_order(payload)]
    wanted = sorted(ranks)[: places(payload)]
    # Ties at the cut count as picked: either of two equal fourths may be the third.
    half = 0.5 if "picks" in payload else 0.0
    credit: dict[UUID, float] = {}
    for s in submissions:
        earned = 0.0
        for shown, rank in zip(s.value, wanted, strict=True):
            if ranks[shown] == rank:
                earned += 1.0
            elif ranks[shown] <= wanted[-1]:
                earned += half
        credit[s.player_id] = earned / len(wanted)
    return credit


def parse_value(payload: dict[str, Any], value: Any) -> list[int] | None:
    """``places`` distinct shown positions, first end first; else ``None``."""
    count = len(payload["entries"])
    # Measured before anything is read, so a huge list is refused without walking it.
    if not isinstance(value, list) or len(value) != places(payload):
        return None
    positions: list[int] = []
    for raw in value:
        shown = exact.whole_number(raw)
        if shown is None:
            return None
        positions.append(shown)
    if len(set(positions)) != len(positions) or not all(0 <= p < count for p in positions):
        return None
    return positions


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: ``answer`` lists every entry once, sorted by rank, the ranks run from 1
    without a gap, and the places played are not all ties."""
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
    ranks = sorted(entry["rank"] for entry in entries)
    # A skipped rank reads as a place nobody fills; ties take one rank and the next follows.
    missing = sorted(set(range(1, ranks[-1] + 1)) - set(ranks))
    if missing:
        errors.append(f"entries: no entry has rank {', '.join(map(str, missing))}")
    picks = payload.get("picks")
    if picks is not None and picks >= len(entries):
        errors.append(
            f"picks: is {picks} but there are {len(entries)} entries; leave it out to order all"
        )
    elif picks is not None and len(set(ranks[: picks + 1])) == 1:
        errors.append(
            f"entries: the first {picks + 1} ranks tie, so any {picks} of them in any order win"
        )
    if len(set(ranks)) == 1:
        errors.append("entries: every rank is the same, so any order is right")
    seen: dict[str, int] = {}
    for index, entry in enumerate(entries):
        key = " ".join(entry["text"].split()).casefold()
        if key in seen:
            errors.append(f"entries[{index}]: {entry['text']!r} repeats entries[{seen[key]}]")
        else:
            seen[key] = index
    return errors
