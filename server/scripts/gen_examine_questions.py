"""Generate ``data/packs/examine.json``: Guess the Examine, one question per roster item.

Input: ``data/popular-items.json`` (the curated roster), ``data/examine-allowed.json``
(names let through the name check, below) and the wiki price API's ``/mapping``, the
same response ``gen_price_questions.py`` fetches for names and high alch and throws the
examine text out of. One request, sent with a descriptive User-Agent. Untradeable roster
items are absent from ``/mapping``, so there is no examine to ask about and they are
skipped; a roster name that disagrees with ``/mapping`` is an error, as it is there.

Selecting is trivial -- every usable item is one question, answered by picking it from
the ``items`` vocabulary -- so this script's real work is **rejection**. An examine is not
a question when:

- **it gives the name away**: it contains the whole name, or any word of the name longer
  than three characters. "A sharp sword." is fine; "An abyssal whip." is the answer
  written on the card. A word counts as present when an examine word starts with it, so
  "Arrows with bronze heads." gives away "Bronze arrow" through its plural. Words of three
  characters or fewer ("of", "2h", "sq", "bow") are too common to give anything away,
  which is the only reason there is a length at all. The examine is rejected, never
  masked: "An ______ whip." is a fill-in-the-blank, not a guess.
- **another roster item shares it**. "A vicious, curved sword." is three scimitars, and
  the list would hold three right-looking answers of which the grader accepts one.

The first rule is a heuristic and the second is not, so only the first has an escape
hatch. ``data/examine-allowed.json`` lists item names whose examine is worth asking even
though it trips the name check -- "Yuck I don't like cabbage." names the answer, and is
the kind of line a quiz night is for. It is by name, like everything a person edits here,
and a name that is not on the roster is an error rather than an entry that silently
does nothing. It cannot let a shared examine through: the allow list is taste, and two
right answers is not a matter of taste.

The summary says how many roster items were used and how many were rejected and why, and
the rejection rate over the items that had an examine to judge. The roster, not a target
count, decides how big the pack is (``ideas/phase2.md``, "Pack sizes are roster-bound").

The script never runs at app startup or in CI. Run ``make gen-examine-questions`` when the
roster or the allow list changes, or about monthly with the price pack, and commit the
result. Output is a pure function of the inputs except ``generated_at``, which
``/mapping`` gives nothing to derive from: it is kept from the existing file whenever the
questions are unchanged, so a re-run against unchanged data leaves the file untouched.

Usage (from ``server/``)::

    uv run python scripts/gen_examine_questions.py [--out PATH] [--roster PATH]
        [--allow PATH] [--mapping-file PATH] [--user-agent UA]

``--mapping-file`` reads a saved ``/mapping`` response instead of fetching, for tests and
offline runs.
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from gen_price_questions import API_BASE, RosterError, fetch_json, load_roster

from app.questions import schema
from app.questions.packs import pack_errors
from app.questions.vocab import fold

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROSTER = REPO_ROOT / "data" / "popular-items.json"
DEFAULT_ALLOW = REPO_ROOT / "data" / "examine-allowed.json"
DEFAULT_OUT = REPO_ROOT / "data" / "packs" / "examine.json"

USER_AGENT = "jolly-boar-inn gen_examine_questions (https://github.com/vosdev/jolly-boar-inn)"

PACK_NAME = "examine"
MODE = "guess_examine"
TAGS = ["examine"]
# A name word of this many characters or fewer never gives an examine away on its own.
SHORT_WORD = 3
# The share of judged examines above which the summary warns: the roster or the allow
# list needs a look, because the mode is losing more items than it keeps.
MAX_REJECTION_RATE = 1 / 3
# The schema's cap on a prompt. No examine in the game comes near it, but a pack that
# failed validation over one would be a worse surprise than a skipped item.
MAX_PROMPT = 300

SHARED = "examine shared with another roster item"
GIVEAWAY = "examine gives the name away"


@dataclass(frozen=True, slots=True)
class Rejection:
    id: int
    name: str
    examine: str
    reason: str
    detail: str


@dataclass(slots=True)
class Result:
    questions: list[dict[str, Any]]
    rejected: list[Rejection]
    allowed: list[str]
    skipped: list[str]
    notes: list[str]

    @property
    def judged(self) -> int:
        """Items that had an examine to accept or reject: the rejection rate's denominator."""
        return len(self.questions) + len(self.rejected)

    @property
    def rejection_rate(self) -> float:
        return len(self.rejected) / self.judged if self.judged else 0.0


# --- inputs ---------------------------------------------------------------------------


def load_allowed(path: Path, roster: list[dict[str, Any]]) -> set[str]:
    """The allow list's names. Raises ``RosterError`` for one the roster does not have."""
    if not path.exists():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    names = data.get("names") if isinstance(data, dict) else None
    if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
        raise RosterError([f"{path.name}: must be an object with a list of strings, 'names'"])
    known = {item["name"] for item in roster}
    errors = [
        f"{path.name}: {name!r} is not a roster item name; names must match"
        " data/popular-items.json exactly"
        for name in names
        if name not in known
    ]
    errors += [
        f"{path.name}: {name!r} is listed more than once"
        for name in sorted({n for n in names if names.count(n) > 1})
    ]
    if errors:
        raise RosterError(errors)
    return set(names)


# --- rejection ------------------------------------------------------------------------


def words(text: str) -> list[str]:
    """``text`` folded and split into runs of letters and digits.

    Folding is the vocabulary's own (case and accents), so "Ahrim's" is ``["ahrim", "s"]``
    here exactly as it is to the combobox's search.
    """
    return re.findall(r"[^\W_]+", fold(text))


def giveaway(name: str, examine: str) -> str | None:
    """Why ``examine`` answers its own question, or ``None`` if it does not."""
    name_words, examine_words = words(name), words(examine)
    span = len(name_words)
    if any(examine_words[i : i + span] == name_words for i in range(len(examine_words) - span + 1)):
        return "contains the whole name"
    hits = [
        word
        for word in dict.fromkeys(name_words)
        if len(word) > SHORT_WORD and any(e.startswith(word) for e in examine_words)
    ]
    if hits:
        return "contains " + ", ".join(repr(word) for word in hits) + " from the name"
    return None


def make_question(item_id: int, name: str, examine: str) -> dict[str, Any]:
    question: dict[str, Any] = {
        "id": "",
        "type": "pick_from_list",
        "mode": MODE,
        "source": "pack",
        "tags": list(TAGS),
        "payload": {
            "prompt": examine,
            "vocab": "items",
            "answer_id": item_id,
            "subject": {"name": name, "asset": f"item:{item_id}"},
        },
    }
    question["id"] = schema.content_id(question)
    return question


def select(
    roster: list[dict[str, Any]], mapping: list[dict[str, Any]], allowed: set[str]
) -> Result:
    """Every roster item as a question, a rejection or a skip. Raises ``RosterError``."""
    by_id = {entry["id"]: entry for entry in mapping}
    result = Result(questions=[], rejected=[], allowed=[], skipped=[], notes=[])
    errors: list[str] = []
    candidates: list[tuple[int, str, str]] = []
    for roster_item in roster:
        item_id, name = roster_item["id"], roster_item["name"]
        entry = by_id.get(item_id)
        if entry is None:
            result.skipped.append(f"{name} ({item_id}): not in /mapping, so no examine")
            continue
        if entry["name"] != name:
            errors.append(
                f"{name} ({item_id}): /mapping calls this id {entry['name']!r};"
                " fix the id or the name in the roster"
            )
            continue
        examine = " ".join(str(entry.get("examine") or "").split())
        if not examine:
            result.skipped.append(f"{name} ({item_id}): /mapping has no examine for it")
        elif len(examine) > MAX_PROMPT:
            result.skipped.append(f"{name} ({item_id}): examine longer than {MAX_PROMPT}")
        else:
            candidates.append((item_id, name, examine))
    if errors:
        raise RosterError(errors)

    sharing: dict[str, list[str]] = defaultdict(list)
    for _, name, examine in candidates:
        sharing[fold(examine)].append(name)

    for item_id, name, examine in candidates:
        others = [other for other in sharing[fold(examine)] if other != name]
        if others:
            result.rejected.append(
                Rejection(item_id, name, examine, SHARED, "also " + ", ".join(others))
            )
            if name in allowed:
                result.notes.append(
                    f"allow list: {name} is listed, but its examine is shared with"
                    f" {', '.join(others)}; the list cannot hold two right answers"
                )
            continue
        why = giveaway(name, examine)
        if why is not None and name not in allowed:
            result.rejected.append(Rejection(item_id, name, examine, GIVEAWAY, why))
            continue
        if why is not None:
            result.allowed.append(name)
        elif name in allowed:
            result.notes.append(f"allow list: {name} passes the name check without it")
        result.questions.append(make_question(item_id, name, examine))
    return result


# --- assembly -------------------------------------------------------------------------


def generate(
    roster: list[dict[str, Any]],
    mapping: list[dict[str, Any]],
    allowed: set[str],
    generated_at: str,
) -> tuple[dict[str, Any], Result]:
    """The pack and what went into it. Pure: ``generated_at`` is the caller's to choose.

    The pack is checked against the shipped ``items`` vocabulary, which is what the server
    will check it against, so a roster passed here that the app does not ship shows up as
    the same ``answer_id`` errors a stale pack would.
    """
    result = select(roster, mapping, allowed)
    pack = {"pack": PACK_NAME, "generated_at": generated_at, "questions": result.questions}
    problems = pack_errors(pack, PACK_NAME)
    if problems:
        raise schema.QuestionError(problems)
    return pack, result


def summary(result: Result) -> list[str]:
    """What the run used and rejected, and why: the lines ``main`` prints."""
    lines = [
        f"{result.judged} roster item(s) with an examine: used {len(result.questions)},"
        f" rejected {len(result.rejected)} ({result.rejection_rate:.0%})"
    ]
    by_reason: dict[str, list[Rejection]] = defaultdict(list)
    for rejection in result.rejected:
        by_reason[rejection.reason].append(rejection)
    for reason in (SHARED, GIVEAWAY):
        if by_reason[reason]:
            lines.append(f"  rejected, {reason}: {len(by_reason[reason])}")
            lines += [f"    {r.name}: {r.examine!r} ({r.detail})" for r in by_reason[reason]]
    if result.allowed:
        lines.append(
            f"  kept by the allow list despite the name check: {len(result.allowed)}"
            f" ({', '.join(result.allowed)})"
        )
    if result.skipped:
        lines.append(f"  skipped, nothing to judge: {len(result.skipped)}")
        lines += [f"    {line}" for line in result.skipped]
    if result.rejection_rate > MAX_REJECTION_RATE:
        lines.append(
            f"WARNING: over a third of the examines were rejected; grow the roster, or add"
            f" the good ones to {DEFAULT_ALLOW.name}"
        )
    return lines


def render(pack: dict[str, Any]) -> str:
    return json.dumps(pack, indent=2, ensure_ascii=False) + "\n"


# --- CLI ------------------------------------------------------------------------------


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="pack file to write")
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    parser.add_argument("--allow", type=Path, default=DEFAULT_ALLOW, help="allow list")
    parser.add_argument("--mapping-file", type=Path, help="saved /mapping response")
    parser.add_argument("--user-agent", default=USER_AGENT)
    return parser.parse_args(argv)


def previous_stamp(out: Path, questions: list[dict[str, Any]]) -> str | None:
    """The existing file's ``generated_at``, if it holds exactly these questions."""
    try:
        existing = json.loads(out.read_text(encoding="utf-8"))
    except OSError, ValueError:
        return None
    if isinstance(existing, dict) and existing.get("questions") == questions:
        return existing.get("generated_at")
    return None


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    out: Path = args.out
    try:
        roster = load_roster(args.roster)
        allowed = load_allowed(args.allow, roster)
        if args.mapping_file is not None:
            mapping = json.loads(args.mapping_file.read_text(encoding="utf-8"))
        else:
            mapping = fetch_json(f"{API_BASE}/mapping", args.user_agent)
        now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        pack, result = generate(roster, mapping, allowed, now)
        kept = previous_stamp(out, pack["questions"])
        if kept is not None:
            pack["generated_at"] = kept
    except RosterError as exc:
        for line in exc.errors:
            print(line, file=sys.stderr)
        print(f"FAILED: {len(exc.errors)} roster problem(s)", file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    for line in result.notes:
        print(line, file=sys.stderr)
    for line in summary(result):
        print(line)
    text = render(pack)
    count = f"{len(pack['questions'])} {MODE} question(s)"
    if out.exists() and out.read_text(encoding="utf-8") == text:
        print(f"{out}: unchanged, {count}")
        return 0
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"{out}: wrote {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
