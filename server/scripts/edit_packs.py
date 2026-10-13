"""Apply an export of ``/admin``'s question changes to the packs.

The file is ``{"edits": [{"id", "question"}], "deletes": [id, ...]}``, as
``POST /api/admin/question-changes/export`` writes it. Each change names a question by
its id in the packs as they are:

- an edit replaces the question where it stands in its file, keeping the file's key
  order, and its id is recomputed from the new content. It keeps its type and mode, and an
  NPC's question stays in its NPC's file;
- a delete removes the question from its file.

Every change is checked before anything is written, and the packs as they would be are
loaded the way the app loads them. A change to an id the packs no longer hold, one id
changed twice, a change to a generated pack (one with ``generated_at``, which its generator
rewrites), a question the schema refuses, or packs that would not load write nothing and
name the problem.

Usage (from ``server/``)::

    uv run python scripts/edit_packs.py FILE [--packs-dir DIR] [--roster PATH]
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from import_suggestions import DEFAULT_PACKS, DEFAULT_ROSTER, check_packs, lists_of, render_pack

from app.questions import schema, vocab
from app.questions.packs import PackError, load_packs

SECTIONS = ("edits", "deletes")


def shaped(value: Any, like: Any) -> Any:
    """``value`` with its objects' keys in ``like``'s order, at every depth, new keys last.

    The database hands a question back with its keys in its own order, and an edit should
    show in git as the lines it changed, not as the whole question reordered. A list's
    items follow the item at the same place, or its first for an item added.
    """
    if isinstance(value, dict):
        model = like if isinstance(like, dict) else {}
        keys = [key for key in model if key in value] + [key for key in value if key not in model]
        return {key: shaped(value[key], model.get(key)) for key in keys}
    if isinstance(value, list):
        models = like if isinstance(like, list) and like else [None]
        return [shaped(item, models[min(i, len(models) - 1)]) for i, item in enumerate(value)]
    return value


def placed(before: dict[str, Any], question: dict[str, Any]) -> dict[str, Any]:
    """``question`` in ``before``'s key order, its id recomputed."""
    entry = shaped(question, before)
    entry["id"] = schema.content_id(entry)
    return entry


def plan(
    data: dict[str, Any], files: dict[Path, dict[str, Any]], npcs: dict[Path, str | None]
) -> list[str]:
    """Apply ``data`` to ``files`` in place; every refused change, by name."""
    where: dict[str, tuple[Path, int]] = {
        question["id"]: (path, index)
        for path, file in files.items()
        for index, question in enumerate(file["questions"])
    }
    refused: list[str] = []
    changed: set[str] = set()
    gone: dict[Path, set[int]] = {}

    def claim(label: str, question_id: Any) -> tuple[Path, int] | None:
        if not isinstance(question_id, str) or question_id not in where:
            refused.append(f"{label}: {question_id!r} is not in the packs")
            return None
        if question_id in changed:
            refused.append(f"{label}: {question_id} is changed twice")
            return None
        path = where[question_id][0]
        if "generated_at" in files[path]:
            refused.append(
                f"{label}: {question_id} is in {path.name}, which `make gen-price-questions`"
                " rewrites: change the roster (`make edit-roster`) or the generator instead"
            )
            return None
        changed.add(question_id)
        return where[question_id]

    for index, entry in enumerate(data.get("edits", [])):
        label = f"edits[{index}]"
        if not isinstance(entry, dict) or set(entry) != {"id", "question"}:
            refused.append(f"{label}: an edit is {{id, question}}")
            continue
        found = claim(label, entry["id"])
        question = entry["question"]
        if found is None:
            continue
        path, at = found
        before = files[path]["questions"][at]
        if not isinstance(question, dict) or "random_event" in question:
            refused.append(f"{label}: a question object, naming no NPC; its file does that")
            continue
        if (question.get("type"), question.get("mode")) != (before["type"], before["mode"]):
            refused.append(f"{label}: an edit keeps the type and mode of {entry['id']}")
            continue
        after = placed(before, question)
        npc = npcs[path]
        problems = schema.errors(after if npc is None else {**after, "random_event": npc})
        refused.extend(f"{label} {problem}" for problem in problems)
        files[path]["questions"][at] = after

    for index, question_id in enumerate(data.get("deletes", [])):
        found = claim(f"deletes[{index}]", question_id)
        if found is not None:
            gone.setdefault(found[0], set()).add(found[1])

    for path, indices in gone.items():
        questions = files[path]["questions"]
        files[path]["questions"] = [q for i, q in enumerate(questions) if i not in indices]
    return refused


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("file", type=Path, help="the file /admin exported")
    parser.add_argument("--packs-dir", type=Path, default=DEFAULT_PACKS)
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        data = json.loads(args.file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"FAILED: {args.file}: {exc}", file=sys.stderr)
        return 1
    if (
        not isinstance(data, dict)
        or set(data) - set(SECTIONS)
        or not all(isinstance(section, list) for section in data.values())
    ):
        print(f"FAILED: {args.file} is not an export: lists of edits and deletes", file=sys.stderr)
        return 1
    try:
        with lists_of(args.roster):
            loaded = load_packs(args.packs_dir)
        roster = args.roster.read_text(encoding="utf-8")
    except (OSError, PackError, vocab.VocabError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1

    files = {pack.path: json.loads(pack.path.read_text(encoding="utf-8")) for pack in loaded}
    npcs = {pack.path: pack.random_event for pack in loaded}
    original = {path: render_pack(file) for path, file in files.items()}
    with lists_of(args.roster):
        refused = plan(data, files, npcs)
    if refused:
        for line in refused:
            print(line, file=sys.stderr)
        print(f"FAILED: {len(refused)} problem(s); nothing written", file=sys.stderr)
        return 1

    changed = {path: render_pack(file) for path, file in files.items()}
    changed = {path: text for path, text in changed.items() if original[path] != text}
    trouble = check_packs(args.packs_dir, changed, roster)
    if trouble:
        for line in trouble:
            print(line, file=sys.stderr)
        print("FAILED: the packs would not load; nothing written", file=sys.stderr)
        return 1
    for path, text in changed.items():
        path.write_text(text, encoding="utf-8")
    edits, deletes = len(data.get("edits", [])), len(data.get("deletes", []))
    print(f"OK: {edits} edited, {deletes} deleted, in {len(changed)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
