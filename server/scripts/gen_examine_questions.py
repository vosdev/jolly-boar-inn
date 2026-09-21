"""Generate ``data/packs/examine.json``: Guess the Examine, one question per entry of
``data/examines.json``.

The examines are hand-written rather than fetched. The first version of this mode took
every roster item's examine from the wiki's ``/mapping`` and spent its effort rejecting
the ones that named their own item -- and what survived was accurate and dull. "A sharp
sword." is a fair question and nobody laughs at it. The mode is only worth playing on the
lines people quote to each other, and no filter finds those, so a person picks them.

That also settles what the player picks the answer from: the ``examines`` vocabulary, which
is the same file. Every entry is a question and every question's answer is an entry, so
the list is exactly the set of things that could be the answer. It is short until people
add to it; that is the cost of every line on it being worth asking.

``data/examines.json`` is the source of truth and this pack is derived from it, because a
pack must be self-contained and validated like every other (architecture section 2). The
test suite fails when the two disagree, so an entry added without running this is caught
in CI. Output is a pure function of the file except ``generated_at``, which is kept from
the existing pack whenever the questions are unchanged.

Usage (from ``server/``)::

    uv run python scripts/gen_examine_questions.py [--examines PATH] [--out PATH]
"""

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.questions import schema
from app.questions.packs import pack_errors
from app.questions.vocab import VocabError, build

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXAMINES = REPO_ROOT / "data" / "examines.json"
DEFAULT_OUT = REPO_ROOT / "data" / "packs" / "examine.json"

PACK_NAME = "examine"
MODE = "guess_examine"
VOCAB = "examines"
TAGS = ["examine"]


def load_examines(path: Path) -> list[dict[str, Any]]:
    """The entries, once they are known to make a vocabulary. Raises ``VocabError``."""
    entries = json.loads(path.read_text(encoding="utf-8"))[VOCAB]
    build(VOCAB, entries, path.name)  # distinct ids and names, or nothing at all
    return entries


def make_question(entry: dict[str, Any]) -> dict[str, Any]:
    question: dict[str, Any] = {
        "id": "",
        "type": "pick_from_list",
        "mode": MODE,
        "source": "pack",
        "tags": list(TAGS),
        "payload": {
            "prompt": entry["examine"],
            "vocab": VOCAB,
            "answer_id": entry["id"],
            "subject": {"name": entry["name"]},
        },
    }
    question["id"] = schema.content_id(question)
    return question


def questions(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One per entry, by id, so an appended entry appends a question."""
    return [make_question(entry) for entry in sorted(entries, key=lambda e: e["id"])]


def generate(entries: list[dict[str, Any]], generated_at: str) -> dict[str, Any]:
    """The pack. Checked against the shipped ``examines`` vocabulary, as the server will."""
    pack = {"pack": PACK_NAME, "generated_at": generated_at, "questions": questions(entries)}
    problems = pack_errors(pack, PACK_NAME)
    if problems:
        raise schema.QuestionError(problems)
    return pack


def render(pack: dict[str, Any]) -> str:
    return json.dumps(pack, indent=2, ensure_ascii=False) + "\n"


def previous_stamp(out: Path, wanted: list[dict[str, Any]]) -> str | None:
    """The existing pack's ``generated_at``, if it holds exactly these questions."""
    try:
        existing = json.loads(out.read_text(encoding="utf-8"))
    except OSError, ValueError:
        return None
    if isinstance(existing, dict) and existing.get("questions") == wanted:
        return existing.get("generated_at")
    return None


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--examines", type=Path, default=DEFAULT_EXAMINES)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="pack file to write")
    args = parser.parse_args(argv)
    out: Path = args.out
    try:
        entries = load_examines(args.examines)
        stamp = previous_stamp(out, questions(entries))
        now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        pack = generate(entries, stamp or now)
    except VocabError as exc:
        for line in exc.errors:
            print(line, file=sys.stderr)
        print(f"FAILED: {len(exc.errors)} problem(s) in {args.examines.name}", file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
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
