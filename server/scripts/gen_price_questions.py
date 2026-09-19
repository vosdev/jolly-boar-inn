"""Generate ``data/packs/prices.json``: more/less questions on GE price and high alch.

Inputs: ``data/popular-items.json`` (the curated roster) and the wiki price API, one
request each to ``/mapping`` (names, high alch) and ``/latest`` (current prices), sent
with a descriptive User-Agent. Untradeable roster items are absent from ``/mapping`` and
are skipped; a roster name that disagrees with ``/mapping`` is an error, because it means
the id is wrong.

The script never runs at app startup or in CI. Run ``make gen-price-questions`` about
monthly and commit the result.

Output is a pure function of the inputs. Pairs are picked with a fixed-seed shuffle, and
``as_of`` and ``generated_at`` come from the newest trade timestamp in ``/latest`` rather
than the wall clock, so re-running against unchanged data reproduces the file byte for
byte and an unchanged file is left untouched.

Usage (from ``server/``)::

    uv run python scripts/gen_price_questions.py [--count 100] [--out PATH]
        [--roster PATH] [--mapping-file PATH --latest-file PATH] [--user-agent UA]

``--mapping-file`` / ``--latest-file`` read saved API responses instead of fetching, for
tests and offline runs.
"""

import argparse
import itertools
import json
import math
import random
import sys
import urllib.request
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.questions import schema
from app.questions.packs import pack_errors

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROSTER = REPO_ROOT / "data" / "popular-items.json"
DEFAULT_OUT = REPO_ROOT / "data" / "packs" / "prices.json"

API_BASE = "https://prices.runescape.wiki/api/v1/osrs"
USER_AGENT = "jolly-boar-inn gen_price_questions (https://github.com/vosdev/jolly-boar-inn)"
TIMEOUT_SECONDS = 30

PACK_NAME = "prices"
DEFAULT_COUNT = 150
SEED = 20260901
# Share of the total per metric; the remainder after rounding goes to the last entry. A
# metric with too few usable pairs is topped up from the others, in this order.
METRIC_SHARE = {"ge_price": 0.7, "high_alch": 0.3}
TAGS = {"ge_price": ["prices", "ge-price"], "high_alch": ["prices", "high-alch"]}
# The question shows two names and no values at all, so a wide gap is still a real
# question about what things cost -- unlike the mode this replaced, which showed one
# price and so needed the pair to be close. What stays out is the coin flip: a pair
# within MIN_RATIO of each other is guesswork however well you know the game.
MIN_RATIO = 1.25
MAX_RATIO = 4.0
# Value ratio at or above which a pair counts as easy / medium; below is hard.
EASY_RATIO = 2.5
MEDIUM_RATIO = 1.6


@dataclass(frozen=True, slots=True)
class Item:
    id: int
    name: str
    ge_price: int | None
    high_alch: int | None

    def value(self, metric: str) -> int | None:
        return self.ge_price if metric == "ge_price" else self.high_alch


class RosterError(ValueError):
    """The roster disagrees with ``/mapping``. ``errors`` lists every problem."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("\n".join(errors))
        self.errors = errors


# --- inputs ---------------------------------------------------------------------------


def fetch_json(url: str, user_agent: str) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
        return json.loads(response.read().decode("utf-8"))


def load_roster(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    items = data["items"]
    ids = [item["id"] for item in items]
    if len(ids) != len(set(ids)):
        dupes = sorted(i for i, n in Counter(ids).items() if n > 1)
        raise RosterError([f"{path.name}: duplicate item id(s) {dupes}"])
    return items


def ge_price(entry: dict[str, Any] | None) -> int | None:
    """Midpoint of the instant-buy and instant-sell prices; either alone if one is missing."""
    if entry is None:
        return None
    high, low = entry.get("high"), entry.get("low")
    if high is None and low is None:
        return None
    if high is None or low is None:
        return high if low is None else low
    return (high + low) // 2


def build_items(
    roster: list[dict[str, Any]], mapping: list[dict[str, Any]], latest: dict[str, Any]
) -> tuple[list[Item], list[str]]:
    """Roster items that ``/mapping`` knows, with their metrics, and notes on the rest.

    Raises ``RosterError`` when a roster name does not match ``/mapping`` exactly.
    """
    by_id = {entry["id"]: entry for entry in mapping}
    prices = latest["data"]
    items: list[Item] = []
    notes: list[str] = []
    errors: list[str] = []
    for roster_item in roster:
        item_id, name = roster_item["id"], roster_item["name"]
        entry = by_id.get(item_id)
        if entry is None:
            notes.append(f"skip {name} ({item_id}): not in /mapping, so not tradeable")
            continue
        if entry["name"] != name:
            errors.append(
                f"{name} ({item_id}): /mapping calls this id {entry['name']!r};"
                " fix the id or the name in the roster"
            )
            continue
        item = Item(
            id=item_id,
            name=name,
            ge_price=ge_price(prices.get(str(item_id))),
            high_alch=entry.get("highalch"),
        )
        if item.ge_price is None:
            notes.append(f"{name} ({item_id}): no price in /latest, skipped for ge_price")
        if item.high_alch is None:
            notes.append(f"{name} ({item_id}): no highalch in /mapping, skipped for high_alch")
        items.append(item)
    if errors:
        raise RosterError(errors)
    return sorted(items, key=lambda item: item.id), notes


def snapshot_time(latest: dict[str, Any], items: list[Item]) -> datetime:
    """The newest trade among the roster items: the moment the prices are as of."""
    stamps = [
        entry[key]
        for item in items
        if (entry := latest["data"].get(str(item.id)))
        for key in ("highTime", "lowTime")
        if entry.get(key) is not None
    ]
    if not stamps:
        raise ValueError("no roster item has a price in /latest")
    return datetime.fromtimestamp(max(stamps), tz=UTC)


# --- selection ------------------------------------------------------------------------


def candidate_pairs(items: list[Item], metric: str) -> list[tuple[Item, Item]]:
    """Every unordered pair with both values known and ``MIN_RATIO``..``MAX_RATIO`` apart."""
    with_value = [item for item in items if item.value(metric) is not None]
    pairs: list[tuple[Item, Item]] = []
    for a, b in itertools.combinations(with_value, 2):
        lo, hi = sorted((a.value(metric), b.value(metric)))
        if lo > 0 and MIN_RATIO <= hi / lo <= MAX_RATIO:
            pairs.append((a, b))
    return pairs


def pick_pairs(
    pairs: list[tuple[Item, Item]], want: int, rng: random.Random
) -> list[tuple[Item, Item]]:
    """``want`` pairs from a seeded shuffle, spreading them over the items.

    A first pass caps how often one item appears; a second pass fills up without the cap
    if the first came up short.
    """
    shuffled = list(pairs)
    rng.shuffle(shuffled)
    item_count = len({item.id for pair in shuffled for item in pair})
    cap = math.ceil(2 * want / item_count) + 1 if item_count else 0
    chosen: list[tuple[Item, Item]] = []
    used: Counter[int] = Counter()
    for limit in (cap, None):
        for pair in shuffled:
            if len(chosen) >= want:
                return chosen
            if pair in chosen:
                continue
            if limit is not None and (used[pair[0].id] >= limit or used[pair[1].id] >= limit):
                continue
            chosen.append(pair)
            used[pair[0].id] += 1
            used[pair[1].id] += 1
    return chosen


def difficulty(anchor_value: int, target_value: int) -> str:
    lo, hi = sorted((anchor_value, target_value))
    ratio = hi / lo
    if ratio >= EASY_RATIO:
        return "easy"
    if ratio >= MEDIUM_RATIO:
        return "medium"
    return "hard"


def make_question(
    metric: str, first: Item, second: Item, direction: str, as_of: str
) -> dict[str, Any]:
    """One ``more_less`` envelope. ``direction`` decides which option is the answer."""
    values = [first.value(metric), second.value(metric)]
    assert values[0] is not None and values[1] is not None
    wanted = max(values) if direction == "more" else min(values)
    question: dict[str, Any] = {
        "id": "",
        "type": "more_less",
        "source": "pack",
        "tags": list(TAGS[metric]),
        "difficulty": difficulty(values[0], values[1]),
        "payload": {
            "metric": metric,
            "direction": direction,
            "options": [
                {"subject": {"name": item.name, "asset": f"item:{item.id}"}, "value": value}
                for item, value in ((first, values[0]), (second, values[1]))
            ],
            "answer_index": values.index(wanted),
            "as_of": as_of,
        },
    }
    question["id"] = schema.content_id(question)
    return question


def metric_counts(count: int) -> dict[str, int]:
    """The ideal split of ``count`` over the metrics, before availability is known."""
    counts = {metric: round(count * share) for metric, share in METRIC_SHARE.items()}
    last = list(METRIC_SHARE)[-1]
    counts[last] += count - sum(counts.values())
    return counts


def allocate(count: int, available: dict[str, int]) -> dict[str, int]:
    """``metric_counts`` clamped to what each metric has, shortfalls topped up from the rest.

    The total is ``count`` unless every metric together has fewer pairs than that.
    """
    counts = {m: min(want, available[m]) for m, want in metric_counts(count).items()}
    short = count - sum(counts.values())
    for metric in METRIC_SHARE:
        extra = min(short, available[metric] - counts[metric])
        counts[metric] += extra
        short -= extra
    return counts


def generate(
    roster: list[dict[str, Any]],
    mapping: list[dict[str, Any]],
    latest: dict[str, Any],
    count: int = DEFAULT_COUNT,
    seed: int = SEED,
) -> tuple[dict[str, Any], list[str]]:
    """The pack and human-readable notes (skipped items, shortfalls). Pure and seeded."""
    items, notes = build_items(roster, mapping, latest)
    stamp = snapshot_time(latest, items)
    as_of = stamp.date().isoformat()
    rng = random.Random(seed)
    questions: list[dict[str, Any]] = []
    pairs = {metric: candidate_pairs(items, metric) for metric in METRIC_SHARE}
    counts = allocate(count, {metric: len(found) for metric, found in pairs.items()})
    ideal = metric_counts(count)
    for metric, want in counts.items():
        if want != ideal[metric]:
            notes.append(
                f"{metric}: {len(pairs[metric])} pair(s) between {MIN_RATIO:g}x and"
                f" {MAX_RATIO:g}x apart, wanted {ideal[metric]}, using {want}"
            )
        chosen = pick_pairs(pairs[metric], want, rng)
        for a, b in chosen:
            first, second = (b, a) if rng.random() < 0.5 else (a, b)
            direction = "more" if rng.random() < 0.5 else "less"
            questions.append(make_question(metric, first, second, direction, as_of))
    if len(questions) < count:
        notes.append(
            f"only {len(questions)} of {count} questions possible; add items of similar value"
            " to the roster"
        )
    pack = {
        "pack": PACK_NAME,
        "generated_at": stamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "questions": questions,
    }
    problems = pack_errors(pack, PACK_NAME)
    if problems:  # a bug in this script, never expected
        raise schema.QuestionError(problems)
    return pack, notes


def render(pack: dict[str, Any]) -> str:
    return json.dumps(pack, indent=2, ensure_ascii=False) + "\n"


# --- CLI ------------------------------------------------------------------------------


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--count", type=int, default=DEFAULT_COUNT, help="questions to generate")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="pack file to write")
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    parser.add_argument("--mapping-file", type=Path, help="saved /mapping response")
    parser.add_argument("--latest-file", type=Path, help="saved /latest response")
    parser.add_argument("--user-agent", default=USER_AGENT)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args(argv)
    if (args.mapping_file is None) != (args.latest_file is None):
        parser.error("--mapping-file and --latest-file go together")
    if args.count < 1:
        parser.error("--count must be at least 1")
    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        roster = load_roster(args.roster)
        if args.mapping_file is not None:
            mapping = json.loads(args.mapping_file.read_text(encoding="utf-8"))
            latest = json.loads(args.latest_file.read_text(encoding="utf-8"))
        else:
            mapping = fetch_json(f"{API_BASE}/mapping", args.user_agent)
            latest = fetch_json(f"{API_BASE}/latest", args.user_agent)
        pack, notes = generate(roster, mapping, latest, count=args.count, seed=args.seed)
    except RosterError as exc:
        for line in exc.errors:
            print(line, file=sys.stderr)
        print(f"FAILED: {len(exc.errors)} roster problem(s)", file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    for line in notes:
        print(line, file=sys.stderr)
    text = render(pack)
    out: Path = args.out
    if out.exists() and out.read_text(encoding="utf-8") == text:
        print(f"{out}: unchanged, {len(pack['questions'])} question(s)")
        return 0
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"{out}: wrote {len(pack['questions'])} question(s), as of {pack['generated_at']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
