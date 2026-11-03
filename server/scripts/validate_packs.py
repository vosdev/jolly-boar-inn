"""CI check: every shipped pack is valid, the NPCs' own files in ``random_events/`` included.

Fails on schema errors, an ``id`` that does not match the content, an ``answer`` that
contradicts the stored facts, a ``mode`` this build does not play or a ``type`` that
disagrees with its mode's, and duplicate ids within or across packs. For random events it
also fails an NPC's file that is not named after a roster id, a question in one that names
its own NPC, and a question anywhere else that names one (``app/questions/packs.py``). A
question that is its picture (a ``pictured`` mode's, or Certer's) must picture its own roster
item, with a detail picture in ``data/assets.json``.

Usage (from ``server/``)::

    uv run python scripts/validate_packs.py [PACKS_DIR]
"""

import sys
from collections.abc import Iterable
from pathlib import Path

from add_detail_pictures import has_picture
from fetch_assets import MANIFEST, load_manifest

from app.modes import needs_picture
from app.questions.packs import EVENTS_DIR, Pack, PackError, load_packs

DEFAULT_DIR = Path(__file__).resolve().parents[2] / "data" / "packs"


def picture_errors(packs: Iterable[Pack], manifest: dict[str, str]) -> list[str]:
    """Each question that is its picture but does not show its own item's detail picture."""
    errors = []
    for pack in packs:
        for question in pack.questions:
            if not needs_picture(question):
                continue
            payload = question["payload"]
            answer = payload.get("answer_id")
            if payload.get("vocab") != "items" or payload.get("image") != f"item:{answer}":
                errors.append(f"{pack.path.name}: {question['id']} must picture its own item")
            elif not has_picture(manifest, answer):
                errors.append(f"{pack.path.name}: {question['id']}: item {answer} has no picture")
    return errors


def main(argv: list[str]) -> int:
    directory = Path(argv[1]) if len(argv) > 1 else DEFAULT_DIR
    try:
        packs = load_packs(directory)
        problems = picture_errors(packs, load_manifest(MANIFEST))
        if problems:
            raise PackError(problems)
    except (FileNotFoundError, PackError) as exc:
        problems = exc.errors if isinstance(exc, PackError) else [str(exc)]
        for line in problems:
            print(line, file=sys.stderr)
        print(f"FAILED: {len(problems)} problem(s) in {directory}", file=sys.stderr)
        return 1
    for pack in packs:
        where = pack.path.name if pack.random_event is None else f"{EVENTS_DIR}/{pack.path.name}"
        print(f"{where}: {len(pack.questions)} question(s) ok")
    total = sum(len(pack.questions) for pack in packs)
    print(f"OK: {total} question(s) in {len(packs)} pack(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
