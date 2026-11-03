"""Write ``data/packs/pixel_hunt.json`` and Certer's ``random_events/certer.json``: one question
each per roster item with a picture.

Offline: it reads ``data/popular-items.json`` and ``data/assets.json`` and asks the wiki
nothing. An item without a detail picture in the manifest (``add_detail_pictures.py`` adds
them) is left out, as is one on ``BLOCKLIST``: a picture that gives its name away or looks
like another item's. A question keeps the difficulty the pack already gives its item, so the
owner's retags survive a re-run; a new one is ``medium``. Certer asks the same items in his own
words, so his questions have ids of their own, and the room sketches each one. Packs that
would not load write nothing.

Usage (from ``server/``)::

    uv run python scripts/gen_pixel_hunt.py [--packs-dir DIR] [--roster PATH] [--manifest PATH]
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from add_detail_pictures import has_picture
from fetch_assets import MANIFEST, load_manifest
from import_suggestions import DEFAULT_PACKS, DEFAULT_ROSTER, check_packs

from app.questions import schema

MODE = "pixel_hunt"
PROMPT = "Which item is this?"
CERTER = "certer"
CERTER_PROMPT = "What is this item?"
# What Certer opens with, one per item by its id, so a re-run keeps every question's id.
CERTER_INTROS = (
    "Ah, hello there! My brothers and I can't agree on what this is. Could you settle it?",
    "Good day! I sketched this from memory, and now I can't recall what it was. Can you?",
    "Pardon me, adventurer. Could you help me identify this? I'll be ever so grateful.",
)
# Item ids whose picture should not be asked about.
BLOCKLIST: frozenset[int] = frozenset()


def question(item: dict[str, Any], difficulty: str) -> dict[str, Any]:
    """The one question for ``item``: its picture, answered from the item list."""
    built: dict[str, Any] = {
        "type": "pick_from_list",
        "mode": MODE,
        "source": "pack",
        "tags": [],
        "payload": {
            "prompt": PROMPT,
            "vocab": "items",
            "answer_id": item["id"],
            "image": f"item:{item['id']}",
            "subject": {"name": item["name"]},
        },
        "difficulty": difficulty,
    }
    return {"id": schema.content_id(built), **built}


def certer_question(item: dict[str, Any]) -> dict[str, Any]:
    """Certer's question for ``item``: the same picture, asked as a random event."""
    built: dict[str, Any] = {
        "type": "pick_from_list",
        "mode": "random_event",
        "source": "pack",
        "tags": [],
        "payload": {
            "intro": CERTER_INTROS[item["id"] % len(CERTER_INTROS)],
            "prompt": CERTER_PROMPT,
            "vocab": "items",
            "answer_id": item["id"],
            "image": f"item:{item['id']}",
            "subject": {"name": item["name"]},
        },
    }
    return {"id": schema.content_id(built), **built}


def generate(
    items: list[dict[str, Any]],
    manifest: dict[str, str],
    kept: dict[int, str],
    blocklist: frozenset[int] = BLOCKLIST,
) -> dict[str, Any]:
    """The pack for ``items``, in roster order, with ``kept``'s difficulty per item id."""
    return {
        "pack": MODE,
        "questions": [
            question(item, kept.get(item["id"], "medium"))
            for item in items
            if item["id"] not in blocklist and has_picture(manifest, item["id"])
        ],
    }


def generate_certer(
    items: list[dict[str, Any]],
    manifest: dict[str, str],
    blocklist: frozenset[int] = BLOCKLIST,
) -> dict[str, Any]:
    """Certer's event file for ``items``, in roster order: the items Pixel Hunt asks."""
    return {
        "pack": "random_events",
        "random_event": CERTER,
        "questions": [
            certer_question(item)
            for item in items
            if item["id"] not in blocklist and has_picture(manifest, item["id"])
        ],
    }


def difficulties(path: Path) -> dict[int, str]:
    """The difficulty the pack at ``path`` gives each item, or nothing without one."""
    if not path.is_file():
        return {}
    questions = json.loads(path.read_text(encoding="utf-8"))["questions"]
    return {q["payload"]["answer_id"]: q["difficulty"] for q in questions}


def render(pack: dict[str, Any]) -> str:
    return json.dumps(pack, indent=2, ensure_ascii=False) + "\n"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--packs-dir", type=Path, default=DEFAULT_PACKS)
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    out = args.packs_dir / f"{MODE}.json"
    certer_out = args.packs_dir / "random_events" / f"{CERTER}.json"
    roster = args.roster.read_text(encoding="utf-8")
    items = json.loads(roster)["items"]
    manifest = load_manifest(args.manifest)
    packs = {
        out: generate(items, manifest, difficulties(out)),
        certer_out: generate_certer(items, manifest),
    }
    texts = {path: render(pack) for path, pack in packs.items()}
    problems = check_packs(args.packs_dir, texts, roster)
    if problems:
        for line in problems:
            print(line, file=sys.stderr)
        print(f"FAILED: {out} and {certer_out} not written", file=sys.stderr)
        return 1
    for path, text in texts.items():
        path.write_text(text, encoding="utf-8")
        print(f"{path}: {len(packs[path]['questions'])} of {len(items)} items")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
