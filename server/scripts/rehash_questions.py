"""Rewrite every pack question's ``id`` that no longer matches its content.

Editing a pack by hand changes a question's content hash. This puts each new id in place of
the old one, touching only that string, so the rest of every file stays as it was byte for
byte, and prints ``old -> new`` for each. Packs that would still not load once their ids
match, or a file that is not JSON, write nothing and name the problem.

Usage (from ``server/``)::

    uv run python scripts/rehash_questions.py [--packs-dir DIR] [--roster PATH]
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from import_suggestions import DEFAULT_PACKS, DEFAULT_ROSTER, check_packs

from app.questions import schema


def expected_id(question: Any) -> str | None:
    """The id ``question``'s content hashes to, or None when it has too little to hash."""
    if not isinstance(question, dict) or not isinstance(question.get("type"), str):
        return None
    if not isinstance(question.get("payload"), dict):
        return None
    return schema.content_id(question)


def rehashed(text: str) -> tuple[str, list[tuple[str, str]]]:
    """``text`` with each mismatched question id replaced in place, and the ids changed."""
    questions = json.loads(text).get("questions", [])
    changes: list[tuple[str, str]] = []
    pieces: list[str] = []
    at = 0
    for question in questions if isinstance(questions, list) else []:
        old, new = question.get("id") if isinstance(question, dict) else None, expected_id(question)
        if not isinstance(old, str) or new is None:
            continue
        # Questions sit in the file in list order, so each id is the next one after the last.
        found = re.compile(r'"id":\s*' + re.escape(json.dumps(old))).search(text, at)
        if found is None:
            continue
        if old != new:
            pieces.append(text[at : found.start()] + found.group().replace(old, new))
            changes.append((old, new))
        else:
            pieces.append(text[at : found.end()])
        at = found.end()
    return "".join(pieces) + text[at:], changes


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--packs-dir", type=Path, default=DEFAULT_PACKS)
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    changed: dict[Path, str] = {}
    lines: list[str] = []
    for path in sorted(args.packs_dir.rglob("*.json")):
        try:
            text, changes = rehashed(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, AttributeError) as exc:
            print(f"{path.relative_to(args.packs_dir)}: {exc}", file=sys.stderr)
            print("FAILED: a pack is not readable; nothing written", file=sys.stderr)
            return 1
        if changes:
            changed[path] = text
            where = path.relative_to(args.packs_dir)
            lines.extend(f"{where}: {old} -> {new}" for old, new in changes)

    trouble = check_packs(args.packs_dir, changed, args.roster.read_text(encoding="utf-8"))
    if trouble:
        for line in trouble:
            print(line, file=sys.stderr)
        print("FAILED: the packs would not load; nothing written", file=sys.stderr)
        return 1
    for path, text in changed.items():
        path.write_text(text, encoding="utf-8")
    for line in lines:
        print(line)
    print(f"OK: {len(lines)} id(s) rewritten in {len(changed)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
