"""CI check: every shipped pack is valid, the NPCs' own files in ``random_events/`` included.

Fails on schema errors, an ``id`` that does not match the content, an ``answer`` that
contradicts the stored facts, a ``mode`` this build does not play or a ``type`` that
disagrees with its mode's, and duplicate ids within or across packs. For random events it
also fails an NPC's file that is not named after a roster id, a question in one that names
its own NPC, and a question anywhere else that names one (``app/questions/packs.py``).

Usage (from ``server/``)::

    uv run python scripts/validate_packs.py [PACKS_DIR]
"""

import sys
from pathlib import Path

from app.questions.packs import EVENTS_DIR, PackError, load_packs

DEFAULT_DIR = Path(__file__).resolve().parents[2] / "data" / "packs"


def main(argv: list[str]) -> int:
    directory = Path(argv[1]) if len(argv) > 1 else DEFAULT_DIR
    try:
        packs = load_packs(directory)
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
