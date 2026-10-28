"""Apply an export of ``/admin``'s popular-item changes to the roster.

The file is ``{"renames": [{"id", "name"}], "removes": [id, ...]}``, as
``POST /api/admin/roster-changes/export`` writes it. Each change names an item by its id on
the roster as it is; the roster keeps its order and one item a line. Every change is checked
before anything is written, and the packs are loaded against the roster as it would be. A
change to an id the roster does not hold, one id changed twice, a name that is no item name,
or packs that would not load write nothing and name the problem.

The Pixel Hunt pack is rewritten with the roster, as ``gen_pixel_hunt.py`` would. A rename or
a removal leaves the price pack as it was: run ``make gen-price-questions`` afterwards to
bring it in line.

Usage (from ``server/``)::

    uv run python scripts/edit_roster.py FILE [--packs-dir DIR] [--roster PATH]
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import gen_pixel_hunt
from fetch_assets import MANIFEST, load_manifest
from import_suggestions import DEFAULT_PACKS, DEFAULT_ROSTER, check_packs, render_roster

from app import roster_edits

SECTIONS = ("renames", "removes")


def plan(
    data: dict[str, Any], items: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[str]]:
    """``items`` with ``data`` applied, and every refused change, by name."""
    by_id = {item["id"]: dict(item) for item in items}
    refused: list[str] = []
    changed: set[Any] = set()

    def claim(label: str, item_id: Any) -> bool:
        if isinstance(item_id, bool) or not isinstance(item_id, int) or item_id not in by_id:
            refused.append(f"{label}: item {item_id!r} is not on the roster")
        elif item_id in changed:
            refused.append(f"{label}: item {item_id} is changed twice")
        else:
            changed.add(item_id)
            return True
        return False

    gone: set[int] = set()
    for index, entry in enumerate(data.get("renames", [])):
        label = f"renames[{index}]"
        if not isinstance(entry, dict) or set(entry) != {"id", "name"}:
            refused.append(f"{label}: a rename is {{id, name}}")
            continue
        if not claim(label, entry["id"]):
            continue
        problems = roster_edits.name_problems(entry["name"])
        refused.extend(f"{label} {problem}" for problem in problems)
        if not problems:
            by_id[entry["id"]]["name"] = entry["name"].strip()
    for index, item_id in enumerate(data.get("removes", [])):
        if claim(f"removes[{index}]", item_id):
            gone.add(item_id)
    return [item for item_id, item in by_id.items() if item_id not in gone], refused


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
        text = args.roster.read_text(encoding="utf-8")
        items = json.loads(text)["items"]
    except (OSError, ValueError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    if (
        not isinstance(data, dict)
        or set(data) - set(SECTIONS)
        or not all(isinstance(section, list) for section in data.values())
    ):
        print(
            f"FAILED: {args.file} is not an export: lists of renames and removes", file=sys.stderr
        )
        return 1

    after, refused = plan(data, items)
    if refused:
        for line in refused:
            print(line, file=sys.stderr)
        print(f"FAILED: {len(refused)} problem(s); nothing written", file=sys.stderr)
        return 1

    rendered = render_roster(text, after)
    hunt = args.packs_dir / f"{gen_pixel_hunt.MODE}.json"
    changed = {}
    if hunt.is_file():
        pack = gen_pixel_hunt.generate(
            after, load_manifest(MANIFEST), gen_pixel_hunt.difficulties(hunt)
        )
        changed[hunt] = gen_pixel_hunt.render(pack)
    trouble = check_packs(args.packs_dir, changed, rendered)
    if trouble:
        for line in trouble:
            print(line, file=sys.stderr)
        print("FAILED: the packs would not load; nothing written", file=sys.stderr)
        return 1
    if rendered != text:
        args.roster.write_text(rendered, encoding="utf-8")
    for path, written in changed.items():
        path.write_text(written, encoding="utf-8")
    print(
        f"OK: {len(data.get('renames', []))} renamed, {len(data.get('removes', []))} removed;"
        " run make gen-price-questions to bring the price pack in line"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
