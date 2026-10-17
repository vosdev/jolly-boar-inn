"""Import an export from ``/admin``'s suggestion queue into the packs and the item roster.

The file is ``{"questions": [...], "items": [...]}``, as
``POST /api/admin/suggestions/export`` writes it:

- a question goes into the pack of its mode: an NPC's into ``random_events/<npc>.json``,
  any other into the pack already holding that mode, or a new ``<mode>.json``. Its options
  are stored shuffled, since the form puts the right one first, except a Guess the Examine
  line's: that pack keeps the right name first;
- an item joins ``data/popular-items.json`` under the id the wiki's item infobox gives its
  name, tradeable or not.

Each keeps its ``credit``, and ``credit_shown`` when it is true. Anything a pack or the
roster already holds is skipped: a question by content id, an examine line also by its
line, an item by name or id. So a file imported twice changes nothing the second time.

Every entry is checked before anything is written, and the packs as they would be are
loaded the way the app loads them. One refused entry, or a pack that would not load,
writes nothing and names the problem.

An item's id is asked of the wiki's ``infobox_item`` bucket through ``wiki.py``, once per item
not on the roster yet, so that needs ``WIKI_USER_AGENT``. The row on the item's own page wins
over one on another page (Fire cape's animation item), and a name that still means several ids
is refused, to be edited in ``/admin``. ``--items-file`` reads saved rows instead.

Usage (from ``server/``)::

    uv run python scripts/import_suggestions.py FILE [--packs-dir DIR] [--roster PATH]
        [--items-file PATH]
"""

import argparse
import json
import shutil
import sys
import tempfile
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import wiki

from app import suggestions
from app.errors import ApiError
from app.modes import MODES
from app.questions import schema, vocab
from app.questions.packs import EVENT_MODE, EVENTS_DIR, PackError, load_packs
from app.questions.types.shuffle import seeded_order
from app.questions.vocab import fold
from app.rooms.models import normalize_name

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PACKS = REPO_ROOT / "data" / "packs"
DEFAULT_ROSTER = REPO_ROOT / "data" / "popular-items.json"
WIKI_API = "https://oldschool.runescape.wiki/api.php"
SECTIONS = ("questions", "items")
# The rounds whose pack lists the right option first, and asks each line once.
RIGHT_FIRST = frozenset({"guess_examine"})
CREDIT_KEYS = {"credit", "credit_shown"}


@dataclass
class Plan:
    """What an import would change, and what it said about each entry."""

    # Pack files by path, as they will be written.
    packs: dict[Path, dict[str, Any]] = field(default_factory=dict)
    items: list[dict[str, Any]] = field(default_factory=list)
    added: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    refused: list[str] = field(default_factory=list)


def render_pack(data: dict[str, Any]) -> str:
    return json.dumps(data, indent=2) + "\n"


def render_roster(text: str, items: list[dict[str, Any]]) -> str:
    """The roster file with ``items`` in place of its list, one item a line, as it is kept."""
    head = text[: text.index('"items": [') + len('"items": [')]
    lines = ",\n".join(
        f'    {{ "id": {item["id"]}, "name": {json.dumps(item["name"])} }}' for item in items
    )
    return f"{head}\n{lines}\n  ]\n}}"


def credited(entry: dict[str, Any], where: str, plan: Plan) -> dict[str, Any] | None:
    """The pack fields for an entry's credit, or ``None`` with the entry refused."""
    credit, shown = entry.get("credit"), entry.get("credit_shown")
    if not isinstance(credit, str) or not isinstance(shown, bool):
        plan.refused.append(f"{where}: needs a credit and a true or false credit_shown")
        return None
    try:
        name = normalize_name(credit)
    except ApiError as exc:
        plan.refused.append(f"{where}: credit {credit!r}: {exc.message}")
        return None
    return {"credit": name, "credit_shown": True} if shown else {"credit": name}


def pack_for(mode: str, npc: str | None, packs_dir: Path, plan: Plan) -> dict[str, Any]:
    """The pack file a question of ``mode`` goes in, loaded into ``plan`` on first use."""
    if mode == EVENT_MODE:
        path = packs_dir / EVENTS_DIR / f"{npc}.json"
        empty = {"pack": EVENTS_DIR, "random_event": npc, "questions": []}
    else:
        holding = [
            path
            for path, data in plan.packs.items()
            if path.parent == packs_dir and any(q["mode"] == mode for q in data["questions"])
        ]
        path = holding[0] if holding else packs_dir / f"{mode}.json"
        empty = {"pack": mode, "questions": []}
    return plan.packs.setdefault(path, empty)


def shuffled(question: dict[str, Any]) -> dict[str, Any]:
    """A choice question with its options in a seeded order and its answers remapped.

    Seeded by the payload, so shuffling an entry imported before gives the same question,
    and its id, again. Any other type is returned as it is.
    """
    payload = question["payload"]
    if question["type"] not in ("multiple_choice", "pick_all_that_apply"):
        return question
    order = seeded_order(question["type"], payload, len(payload["options"]))
    moved = {old: new for new, old in enumerate(order)}
    payload = {**payload, "options": [payload["options"][old] for old in order]}
    if "answer_index" in payload:
        payload["answer_index"] = moved[payload["answer_index"]]
    if "answer_indices" in payload:
        payload["answer_indices"] = sorted(moved[index] for index in payload["answer_indices"])
    entry = {**question, "payload": payload}
    return entry | {"id": schema.content_id(entry)}


def right_first(question: dict[str, Any]) -> dict[str, Any]:
    """A choice question with its right option moved first, the others in the order given."""
    payload = question["payload"]
    options, right = payload["options"], payload["answer_index"]
    moved = [options[right], *options[:right], *options[right + 1 :]]
    entry = {**question, "payload": {**payload, "options": moved, "answer_index": 0}}
    return entry | {"id": schema.content_id(entry)}


def placed(envelope: dict[str, Any], credit: dict[str, Any]) -> dict[str, Any]:
    """A pack entry in the packs' own key order, credit after the envelope fields."""
    entry = {k: v for k, v in envelope.items() if k not in ("payload", "random_event")}
    return entry | credit | {"payload": envelope["payload"]}


def plan_questions(entries: list[Any], packs_dir: Path, ids: set[str], plan: Plan) -> None:
    for index, entry in enumerate(entries):
        where = f"questions[{index}]"
        if not isinstance(entry, dict):
            plan.refused.append(f"{where}: an entry is a JSON object")
            continue
        credit = credited(entry, where, plan)
        content = {k: v for k, v in entry.items() if k not in CREDIT_KEYS}
        found = suggestions.errors("question", content)
        if found:
            plan.refused.extend(f"{where} {problem}" for problem in found)
            continue
        if content["mode"] not in MODES:
            plan.refused.append(f"{where}: {content['mode']!r} is not a round this build plays")
            continue
        if credit is None:
            continue
        mode = content["mode"]
        envelope = suggestions.question_envelope(content)
        envelope = right_first(envelope) if mode in RIGHT_FIRST else shuffled(envelope)
        if envelope["id"] in ids:
            plan.skipped.append(f"{where}: {envelope['id']} is already in a pack")
            continue
        pack = pack_for(mode, content.get("random_event"), packs_dir, plan)
        prompt = fold(content["payload"]["prompt"])
        if mode in RIGHT_FIRST and any(
            q["mode"] == mode and fold(q["payload"]["prompt"]) == prompt for q in pack["questions"]
        ):
            plan.skipped.append(f"{where}: {content['payload']['prompt']!r} is already asked")
            continue
        ids.add(envelope["id"])
        pack["questions"].append(placed(envelope, credit))
        plan.added.append(f"{where}: {envelope['id']} into {mode}")


def bucket_query(name: str) -> str:
    """The Bucket query for the item infobox rows named ``name``, quoted as a Lua string."""
    literal = name.replace("\\", "\\\\").replace("'", "\\'")
    return (
        "bucket('infobox_item').select('page_name','item_name','item_id')"
        f".where('item_name','{literal}').run()"
    )


def wiki_rows(source: wiki.Wiki) -> Callable[[str], list[dict[str, Any]]]:
    """Asks the wiki for the infobox rows of one item name, spelled exactly."""

    def rows(name: str) -> list[dict[str, Any]]:
        query = urlencode({"action": "bucket", "format": "json", "query": bucket_query(name)})
        return source.get_json(f"{WIKI_API}?{query}").get("bucket", [])

    return rows


def item_id(name: str, rows: list[dict[str, Any]]) -> tuple[int, str] | str:
    """The one id the wiki gives ``name`` and its spelling there, or why there is not one."""
    named = [row for row in rows if fold(str(row.get("item_name", ""))) == fold(name)]
    own_page = [row for row in named if fold(str(row.get("page_name", ""))) == fold(name)]
    chosen = own_page or named
    ids = sorted({int(i) for row in chosen for i in row.get("item_id", []) if str(i).isdigit()})
    if not ids:
        return "is not an item on the wiki; correct its name in /admin and export again"
    if len(ids) > 1:
        return f"names several items on the wiki (ids {ids}); edit it in /admin or add it by hand"
    return ids[0], str(chosen[0]["item_name"])


def plan_items(
    entries: list[Any], lookup: Callable[[str], list[dict[str, Any]]], plan: Plan
) -> None:
    """``lookup`` gives the wiki's rows for a name, as typed and then capitalised."""
    names = {fold(item["name"]) for item in plan.items}
    on_roster = {item["id"] for item in plan.items}
    for index, entry in enumerate(entries):
        where = f"items[{index}]"
        if not isinstance(entry, dict):
            plan.refused.append(f"{where}: an entry is a JSON object")
            continue
        credited(entry, where, plan)
        content = {k: v for k, v in entry.items() if k not in CREDIT_KEYS}
        found = suggestions.errors("item", content)
        if found:
            plan.refused.extend(f"{where} {problem}" for problem in found)
            continue
        name = content["name"].strip()
        if fold(name) in names:
            plan.skipped.append(f"{where}: {name!r} is already on the roster")
            continue
        known = item_id(name, lookup(name))
        if isinstance(known, str) and name[:1].islower():
            # The wiki matches names exactly, and every item name there starts with a capital.
            known = item_id(name, lookup(name[:1].upper() + name[1:]))
        if isinstance(known, str):
            plan.refused.append(f"{where}: {name!r} {known}")
            continue
        number, spelled = known
        if number in on_roster:
            plan.skipped.append(f"{where}: id {number} is already on the roster")
            continue
        names.add(fold(spelled))
        on_roster.add(number)
        plan.items.append({"id": number, "name": spelled})
        plan.added.append(f"{where}: {spelled!r} as id {number}")


def insert_sorted(items: list[dict[str, Any]], new: dict[str, Any]) -> None:
    """Before the first item whose name sorts after it, so an append lands predictably."""
    key = fold(new["name"])
    at = next((i for i, item in enumerate(items) if fold(item["name"]) > key), len(items))
    items.insert(at, new)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("file", type=Path, help="the file /admin exported")
    parser.add_argument("--packs-dir", type=Path, default=DEFAULT_PACKS)
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    parser.add_argument("--items-file", type=Path, help="saved infobox_item rows, for offline runs")
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
        print(
            f"FAILED: {args.file} is not an export: lists of {', '.join(SECTIONS)}", file=sys.stderr
        )
        return 1
    try:
        with lists_of(args.roster):
            loaded = load_packs(args.packs_dir)
        roster_text = args.roster.read_text(encoding="utf-8")
    except (OSError, PackError, vocab.VocabError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1

    source: wiki.Wiki | None = None

    def lookup(name: str) -> list[dict[str, Any]]:
        nonlocal source
        if args.items_file is not None:
            saved = json.loads(args.items_file.read_text(encoding="utf-8"))
            return [row for row in saved if row.get("item_name") == name]
        source = source or wiki.connect()
        return wiki_rows(source)(name)

    plan = Plan(items=list(json.loads(roster_text)["items"]))
    for pack in loaded:
        plan.packs[pack.path] = json.loads(pack.path.read_text(encoding="utf-8"))
    ids = {question["id"] for pack in loaded for question in pack.questions}
    original = {path: render_pack(pack) for path, pack in plan.packs.items()}
    roster_before = len(plan.items)
    try:
        plan_questions(data.get("questions", []), args.packs_dir, ids, plan)
        plan_items(data.get("items", []), lookup, plan)
    except (wiki.MissingUserAgent, OSError, ValueError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    if plan.refused:
        for line in plan.refused:
            print(line, file=sys.stderr)
        print(f"FAILED: {len(plan.refused)} problem(s); nothing written", file=sys.stderr)
        return 1

    items = plan.items[:roster_before]
    for item in plan.items[roster_before:]:
        insert_sorted(items, item)
    changed = {path: render_pack(pack) for path, pack in plan.packs.items()}
    changed = {path: text for path, text in changed.items() if original.get(path) != text}
    roster = render_roster(roster_text, items)
    if changed or len(items) > roster_before:
        trouble = check_packs(args.packs_dir, changed, roster)
        if trouble:
            for line in trouble:
                print(line, file=sys.stderr)
            print("FAILED: the packs would not load; nothing written", file=sys.stderr)
            return 1
    for path, text in changed.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    if len(items) > roster_before:
        args.roster.write_text(roster, encoding="utf-8")
    for line in plan.added:
        print(f"added {line}")
    for line in plan.skipped:
        print(f"skipped {line}")
    print(f"OK: {len(plan.added)} added, {len(plan.skipped)} skipped")
    return 0


@contextmanager
def lists_of(roster: Path) -> Iterator[None]:
    """Hold ``pick_from_list`` questions to the item list this roster makes.

    The app reads the shipped roster; an import checks the one it is about to write.
    """
    shipped = dict(vocab.SOURCES)
    vocab.SOURCES["items"] = roster
    vocab._load.cache_clear()
    try:
        yield
    finally:
        vocab.SOURCES.update(shipped)
        vocab._load.cache_clear()


def check_packs(packs_dir: Path, changed: dict[Path, str], roster: str) -> list[str]:
    """Why the packs, with ``changed`` written, would not load; empty when they would."""
    with tempfile.TemporaryDirectory() as scratch:
        copy = Path(scratch) / "packs"
        shutil.copytree(packs_dir, copy)
        for path, text in changed.items():
            target = copy / path.relative_to(packs_dir)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
        (Path(scratch) / "roster.json").write_text(roster, encoding="utf-8")
        with lists_of(Path(scratch) / "roster.json"):
            try:
                vocab.load_all()
                load_packs(copy)
            except (PackError, vocab.VocabError) as exc:
                return exc.errors
    return []


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
