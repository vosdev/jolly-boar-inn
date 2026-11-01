"""Import an export from ``/admin``'s suggestion queue into the packs and the item roster.

The file is ``{"questions": [...], "items": [...]}``, as
``POST /api/admin/suggestions/export`` writes it:

- a question goes into the pack of its mode: an NPC's into ``random_events/<npc>.json``,
  any other into the pack already holding that mode, or a new ``<mode>.json``. Its options
  are stored shuffled, since the form puts the right one first, except a Guess the Examine
  line's: that pack keeps the right name first;
- an item joins ``data/popular-items.json`` under the id the wiki's item infobox gives its
  name, tradeable or not. It gets its inventory icon and, when the wiki has one, its detail
  image in ``data/assets.json``, and ``data/packs/pixel_hunt.json`` is written again from the
  roster, as ``make gen-pixel-hunt`` would.

A Who's That NPC? question names its NPC: the NPC joins ``data/popular-npcs.json`` under the id
of the first infobox row on its wiki page (the page it links, or the one its name spells), and
the question gets that id, its shadow ``npc:<id>`` and the picture's ``data/assets.json`` entry.
A render question's right option names its NPC the same way: the question gets ``npc:<id>``
as its ``image`` and the picture's entry, and the list stays as it is. One query to the
``infobox_monster`` bucket asks for every NPC in the file, and one to ``infobox_npc`` for those
it did not find. A shadow's NPC the list already has is skipped.

A Forgetful Bard question is a verse and its item's name. An item not on the roster joins it as
an ``items`` entry below does, and the question gets the item's id, its ``image`` and ``subject``.

A Drop Table or Minigame Madness question's ``picture_item`` is found the same way and becomes
its payload's ``image``, ``item:<id>``. ``data/assets.json`` gains the item's detail image and
inventory icon when it lacks either, for ``make fetch-assets``.

Each keeps its ``credit``, and ``credit_shown`` when it is true. A round's question keeps its
``difficulty``, or is ``medium`` without one, so every round-pack question has a tier.
Anything a pack or the roster already holds is skipped: a question by content id, an
examine line also by its line, an item by name or id. So a file imported twice changes
nothing the second time.

Every entry is checked before anything is written, and the packs as they would be are
loaded the way the app loads them. One refused entry, or a pack that would not load,
writes nothing and names the problem.

An item's id is asked of the wiki's ``infobox_item`` bucket through ``wiki.py``, once per item
not on the roster yet, so that needs ``WIKI_USER_AGENT``. The row on the item's own page wins
over one on another page (Fire cape's animation item), and a name that still means several ids
is refused, to be edited in ``/admin``. The new items' detail images are found in one more
query. ``--items-file``, ``--npcs-file`` and ``--detail-file`` read saved rows, and a saved list
of the detail image titles that exist, instead.

Usage (from ``server/``)::

    uv run python scripts/import_suggestions.py FILE [--packs-dir DIR] [--roster PATH]
        [--npcs PATH] [--assets PATH] [--items-file PATH] [--npcs-file PATH] [--detail-file PATH]
"""

import argparse
import json
import re
import shutil
import sys
import tempfile
import urllib.parse
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import add_detail_pictures
import wiki
from fetch_assets import Located, WikiSource

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
DEFAULT_NPCS = REPO_ROOT / "data" / "popular-npcs.json"
DEFAULT_ASSETS = REPO_ROOT / "data" / "assets.json"
WIKI_API = "https://oldschool.runescape.wiki/api.php"
SECTIONS = ("questions", "items")
# The rounds whose pack lists the right option first, and asks each line once.
RIGHT_FIRST = frozenset({"guess_examine"})
CREDIT_KEYS = {"credit", "credit_shown"}
# Asked in this order: Who's That NPC? is mostly monsters. Each bucket's name for the id.
NPC_BUCKETS = {"infobox_monster": "id", "infobox_npc": "npc_id"}


@dataclass
class Plan:
    """What an import would change, and what it said about each entry."""

    # Pack files by path, as they will be written.
    packs: dict[Path, dict[str, Any]] = field(default_factory=dict)
    items: list[dict[str, Any]] = field(default_factory=list)
    npcs: list[dict[str, Any]] = field(default_factory=list)
    # ``data/assets.json``, target to wiki file, as it will be written.
    assets: dict[str, str] = field(default_factory=dict)
    added: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    refused: list[str] = field(default_factory=list)


@dataclass
class SavedTitles:
    """The detail image titles a saved list says exist, standing in for the wiki."""

    titles: set[str]
    requests: int = 0

    def locate(self, titles: list[str]) -> Located:
        """Each of ``titles`` the list holds."""
        return Located(
            where={t: t for t in titles if t in self.titles},
            missing=[t for t in titles if t not in self.titles],
        )

    def fetch(self, where: str) -> bytes:
        raise NotImplementedError("a saved list has no files")


def render_pack(data: dict[str, Any]) -> str:
    return json.dumps(data, indent=2) + "\n"


def render_roster(text: str, items: list[dict[str, Any]], key: str = "items") -> str:
    """A list file with ``items`` in place of its ``key`` list, one entry a line, as it is kept."""
    head = text[: text.index(f'"{key}": [') + len(f'"{key}": [')]
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


def has_target(assets: dict[str, str], stem: str) -> bool:
    """Whether ``assets`` holds ``stem`` (``items/4151``) in any format."""
    return any(target.rpartition(".")[0] == stem for target in assets)


def file_title(image: Any) -> str | None:
    """The first file a Bucket ``image`` field names, without ``File:`` or the link around it."""
    first = image[0] if isinstance(image, list) and image else image
    if not isinstance(first, str):
        return None
    found = re.search(r"(?:File:)?([^\[\]|:]+\.(?:png|gif|jpe?g|webp|svg))", first, re.IGNORECASE)
    return found[1].strip() if found else None


def find_item(
    name: str, lookup: Callable[[str], list[dict[str, Any]]]
) -> tuple[int, str, str] | str:
    """``name``'s id, its spelling and its icon on the wiki, or why it has not one id there.

    The wiki matches names exactly, and every item name there starts with a capital, so a
    name typed in lower case is asked again capitalised.
    """
    rows = lookup(name)
    known = item_id(name, rows)
    if isinstance(known, str) and name[:1].islower():
        rows = lookup(name[:1].upper() + name[1:])
        known = item_id(name, rows)
    if isinstance(known, str):
        return known
    number, spelled = known
    icons = (file_title(row.get("image")) for row in rows if str(number) in row.get("item_id", []))
    return number, spelled, next((icon for icon in icons if icon), f"{spelled}.png")


def pictured(
    content: dict[str, Any],
    where: str,
    lookup: Callable[[str], list[dict[str, Any]]],
    plan: Plan,
) -> dict[str, Any] | None:
    """``content`` with its ``picture_item`` made its ``image``, or ``None`` with it refused.

    Adds the item's detail image and inventory icon to the manifest when it lacks either: a
    picture's bytes would match the icon, so the icon is never the picture's own file.
    """
    if "picture_item" not in content:
        return content
    name = content["picture_item"].strip()
    known = find_item(name, lookup)
    if isinstance(known, str):
        plan.refused.append(f"{where}: picture_item {name!r} {known}")
        return None
    number, spelled, icon = known
    if not has_target(plan.assets, f"pictures/item/{number}"):
        plan.assets[f"pictures/item/{number}.png"] = f"{spelled} detail.png"
    if not has_target(plan.assets, f"items/{number}"):
        plan.assets[f"items/{number}.png"] = icon
    rest = {k: v for k, v in content.items() if k != "picture_item"}
    return rest | {"payload": {**content["payload"], "image": f"item:{number}"}}


def wiki_page(url: str) -> str:
    """The page a wiki link is to, as Bucket's ``page_name`` spells it."""
    path = urllib.parse.urlsplit(url).path.removeprefix("/w/")
    return urllib.parse.unquote(path).replace("_", " ")


def npc_named(content: dict[str, Any]) -> str | None:
    """The NPC a Who's That NPC? question shows, as a shadow or a render; ``None`` for others."""
    if content.get("mode") in suggestions.VERSE_MODES:
        return None
    return suggestions.named(content) or suggestions.rendered(content)


def npc_pages(content: dict[str, Any]) -> list[str]:
    """The pages a named NPC may be on: the one its question links, then the one its name spells."""
    name = str(npc_named(content)).strip()
    pages = [wiki_page(content["wiki"]), name, name[:1].upper() + name[1:]]
    return list(dict.fromkeys(pages))


def wanted_npcs(entries: list[Any]) -> list[list[str]]:
    """The pages each of the file's Who's That NPC? questions may be on, to ask in one query."""
    pages: list[list[str]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        content = {k: v for k, v in entry.items() if k not in CREDIT_KEYS}
        if suggestions.errors("question", content) or npc_named(content) is None:
            continue
        pages.append(npc_pages(content))
    return pages


def npc_query(bucket: str, pages: list[str]) -> str:
    """The Bucket query for the infobox rows on any of ``pages``."""
    where = ",".join(f"{{'page_name',{lua_string(page)}}}" for page in pages)
    fields = f"'page_name','{NPC_BUCKETS[bucket]}','image'"
    return f"bucket('{bucket}').select({fields}).where(bucket.Or({where})).run()"


def wiki_npc_rows(source: wiki.Wiki) -> Callable[[list[list[str]]], list[dict[str, Any]]]:
    """Asks the wiki for the infobox rows on each NPC's pages: every monster in one query,
    then in one more the NPCs none of whose pages has a monster on it."""

    def rows(wanted: list[list[str]]) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        for bucket in NPC_BUCKETS:
            on = {row.get("page_name") for row in found}
            left = [page for pages in wanted if not on & set(pages) for page in pages]
            if not left:
                break
            query = urlencode(
                {"action": "bucket", "format": "json", "query": npc_query(bucket, left)}
            )
            id_field = NPC_BUCKETS[bucket]
            found += [
                {("id" if key == id_field else key): value for key, value in row.items()}
                for row in source.get_json(f"{WIKI_API}?{query}").get("bucket", [])
            ]
        return found

    return rows


def npc_id(content: dict[str, Any], rows: list[dict[str, Any]]) -> tuple[int, str, str] | str:
    """A named NPC's id, its name for the list and its picture, or why it has none.

    The first infobox row on its page gives the id, as for every NPC on the list.
    """
    name = str(npc_named(content)).strip()
    for page in npc_pages(content):
        on_page = [row for row in rows if fold(str(row.get("page_name", ""))) == fold(page)]
        ids = [int(i) for row in on_page[:1] for i in row.get("id", []) if str(i).isdigit()]
        if ids:
            spelled = page if fold(page) == fold(name) else name
            picture = file_title(on_page[0].get("image")) or f"{page}.png"
            return ids[0], spelled, picture
    return (
        "is not a monster or NPC on the wiki; correct its name or page in /admin and export again"
    )


def named_npc(
    content: dict[str, Any], where: str, rows: list[dict[str, Any]], plan: Plan
) -> dict[str, Any] | None:
    """A Who's That NPC? question made whole, with its NPC listed; ``None`` if refused or listed.

    Adds the NPC's picture to the manifest when it lacks one.
    """
    known = npc_id(content, rows)
    name = suggestions.named(content)
    if isinstance(known, str):
        plan.refused.append(f"{where}: {name!r} {known}")
        return None
    number, spelled, picture = known
    if any(npc["id"] == number or fold(npc["name"]) == fold(spelled) for npc in plan.npcs):
        plan.skipped.append(f"{where}: {spelled!r} is already in the game")
        return None
    plan.npcs.append({"id": number, "name": spelled})
    if not has_target(plan.assets, f"pictures/npc/{number}"):
        plan.assets[f"pictures/npc/{number}.png"] = picture
    payload = {
        "prompt": content["payload"]["prompt"],
        "vocab": suggestions.NAMED_MODES[content["mode"]],
        "answer_id": number,
        "image": f"npc:{number}",
        "subject": {"name": spelled},
    }
    return {**content, "payload": payload}


def rendered_npc(
    content: dict[str, Any], where: str, rows: list[dict[str, Any]], plan: Plan
) -> dict[str, Any] | None:
    """A render question with its NPC's render as its ``image``; ``None`` if refused.

    Adds the NPC's picture to the manifest when it lacks one.
    """
    known = npc_id(content, rows)
    if isinstance(known, str):
        plan.refused.append(f"{where}: {suggestions.rendered(content)!r} {known}")
        return None
    number, _, picture = known
    if not has_target(plan.assets, f"pictures/npc/{number}"):
        plan.assets[f"pictures/npc/{number}.png"] = picture
    return {**content, "payload": {**content["payload"], "image": f"npc:{number}"}}


def named_item(
    content: dict[str, Any],
    where: str,
    lookup: Callable[[str], list[dict[str, Any]]],
    plan: Plan,
) -> dict[str, Any] | None:
    """A verse made whole, its item added to the roster if new; ``None`` if refused.

    Only an item the roster lacks is asked of the wiki. Its detail image is found with the
    other new items', once every entry has passed.
    """
    name = str(suggestions.named(content))
    item = next((i for i in plan.items if fold(i["name"]) == fold(name)), None)
    if item is None:
        known = find_item(name, lookup)
        if isinstance(known, str):
            plan.refused.append(f"{where}: {name!r} {known}")
            return None
        number, spelled, icon = known
        item = next((i for i in plan.items if i["id"] == number), None)
        if item is None:
            item = {"id": number, "name": spelled}
            plan.items.append(item)
            plan.added.append(f"{where}: {spelled!r} as id {number}")
        if not has_target(plan.assets, f"items/{number}"):
            plan.assets[f"items/{number}.png"] = icon
    payload = {
        "prompt": content["payload"]["prompt"],
        "vocab": suggestions.NAMED_MODES[content["mode"]],
        "answer_id": item["id"],
        "image": f"item:{item['id']}",
        "subject": {"name": item["name"]},
    }
    return {**content, "payload": payload}


def plan_questions(
    entries: list[Any],
    packs_dir: Path,
    ids: set[str],
    plan: Plan,
    lookup: Callable[[str], list[dict[str, Any]]],
    npc_rows: list[dict[str, Any]],
) -> None:
    """``lookup`` gives the wiki's item rows for a name, for a ``picture_item``; ``npc_rows``
    are the infobox rows for every NPC the file names."""
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
        content = pictured(content, where, lookup, plan)
        if content is not None and content["mode"] in suggestions.VERSE_MODES:
            content = named_item(content, where, lookup, plan)
        elif content is not None and suggestions.named(content) is not None:
            content = named_npc(content, where, npc_rows, plan)
        elif content is not None and suggestions.rendered(content) is not None:
            content = rendered_npc(content, where, npc_rows, plan)
        if content is None:
            continue
        mode = content["mode"]
        if mode not in suggestions.NO_DIFFICULTY_MODES:
            content = {"difficulty": "medium"} | content
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


def lua_string(text: str) -> str:
    """``text`` quoted as a Lua string."""
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"


def bucket_query(name: str) -> str:
    """The Bucket query for the item infobox rows named ``name``."""
    return (
        "bucket('infobox_item').select('page_name','item_name','item_id','image')"
        f".where('item_name',{lua_string(name)}).run()"
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
        known = find_item(name, lookup)
        if isinstance(known, str):
            plan.refused.append(f"{where}: {name!r} {known}")
            continue
        number, spelled, icon = known
        if number in on_roster:
            plan.skipped.append(f"{where}: id {number} is already on the roster")
            continue
        if not has_target(plan.assets, f"items/{number}"):
            plan.assets[f"items/{number}.png"] = icon
        names.add(fold(spelled))
        on_roster.add(number)
        plan.items.append({"id": number, "name": spelled})
        plan.added.append(f"{where}: {spelled!r} as id {number}")


def insert_sorted(items: list[dict[str, Any]], new: dict[str, Any]) -> None:
    """Before the first item whose name sorts after it, so an append lands predictably."""
    key = fold(new["name"])
    at = next((i for i, item in enumerate(items) if fold(item["name"]) > key), len(items))
    items.insert(at, new)


def pixel_hunt_pack(
    packs_dir: Path, items: list[dict[str, Any]], assets: dict[str, str]
) -> dict[Path, str]:
    """The Pixel Hunt pack for ``items`` and ``assets`` if it differs from the one on disk."""
    # gen_pixel_hunt imports this module, so it can only be loaded once this one is.
    import gen_pixel_hunt

    out = packs_dir / f"{gen_pixel_hunt.MODE}.json"
    pack = gen_pixel_hunt.generate(items, assets, gen_pixel_hunt.difficulties(out))
    text = gen_pixel_hunt.render(pack)
    return {} if out.is_file() and out.read_text(encoding="utf-8") == text else {out: text}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("file", type=Path, help="the file /admin exported")
    parser.add_argument("--packs-dir", type=Path, default=DEFAULT_PACKS)
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    parser.add_argument("--npcs", type=Path, default=DEFAULT_NPCS)
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--items-file", type=Path, help="saved infobox_item rows, for offline runs")
    parser.add_argument(
        "--npcs-file", type=Path, help="saved monster and NPC infobox rows, for offline runs"
    )
    parser.add_argument(
        "--detail-file", type=Path, help="saved list of detail image titles, for offline runs"
    )
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
        with lists_of(args.roster, args.npcs):
            loaded = load_packs(args.packs_dir)
        roster_text = args.roster.read_text(encoding="utf-8")
        npcs_text = args.npcs.read_text(encoding="utf-8")
        assets = json.loads(args.assets.read_text(encoding="utf-8"))
    except (OSError, ValueError, PackError, vocab.VocabError) as exc:
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

    def npc_lookup(wanted: list[list[str]]) -> list[dict[str, Any]]:
        nonlocal source
        if not wanted:
            return []
        if args.npcs_file is not None:
            saved = json.loads(args.npcs_file.read_text(encoding="utf-8"))
            return [row for row in saved if any(row.get("page_name") in pages for pages in wanted)]
        source = source or wiki.connect()
        return wiki_npc_rows(source)(wanted)

    plan = Plan(
        items=list(json.loads(roster_text)["items"]),
        npcs=list(json.loads(npcs_text)["npcs"]),
        assets=dict(assets),
    )
    for pack in loaded:
        plan.packs[pack.path] = json.loads(pack.path.read_text(encoding="utf-8"))
    ids = {question["id"] for pack in loaded for question in pack.questions}
    original = {path: render_pack(pack) for path, pack in plan.packs.items()}
    roster_before, npcs_before = len(plan.items), len(plan.npcs)
    try:
        questions = data.get("questions", [])
        npc_rows = npc_lookup(wanted_npcs(questions))
        plan_questions(questions, args.packs_dir, ids, plan, lookup, npc_rows)
        plan_items(data.get("items", []), lookup, plan)
        fresh = plan.items[roster_before:]
        if fresh and not plan.refused:
            if args.detail_file is not None:
                saved = json.loads(args.detail_file.read_text(encoding="utf-8"))
                finder: Any = SavedTitles(set(saved))
            else:
                source = source or wiki.connect()
                finder = WikiSource(source)
            found = add_detail_pictures.plan(fresh, plan.assets, finder)
            plan.assets.update(found.added)
            plan.skipped.extend(f"no detail image for {line}" for line in found.missing)
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
    if len(plan.items) > roster_before:
        changed |= pixel_hunt_pack(args.packs_dir, items, plan.assets)
    roster = render_roster(roster_text, items)
    npcs = plan.npcs[:npcs_before]
    for npc in plan.npcs[npcs_before:]:
        insert_sorted(npcs, npc)
    npcs_rendered = render_roster(npcs_text, npcs, "npcs")
    if changed or len(items) > roster_before:
        trouble = check_packs(args.packs_dir, changed, roster, npcs_rendered)
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
    if len(npcs) > npcs_before:
        args.npcs.write_text(npcs_rendered, encoding="utf-8")
    if plan.assets != assets:
        manifest = dict(sorted(plan.assets.items()))
        args.assets.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for target in sorted(plan.assets.keys() - assets.keys()):
        print(f"added {target} to {args.assets.name}: run make fetch-assets")
    for line in plan.added:
        print(f"added {line}")
    for line in plan.skipped:
        print(f"skipped {line}")
    print(f"OK: {len(plan.added)} added, {len(plan.skipped)} skipped")
    return 0


@contextmanager
def lists_of(roster: Path, npcs: Path | None = None) -> Iterator[None]:
    """Hold ``pick_from_list`` questions to the item list this roster makes, and the NPC list.

    The app reads the shipped lists; an import checks the ones it is about to write.
    """
    shipped = dict(vocab.SOURCES)
    vocab.SOURCES["items"] = roster
    if npcs is not None:
        vocab.SOURCES["npcs"] = npcs
    vocab._load.cache_clear()
    try:
        yield
    finally:
        vocab.SOURCES.update(shipped)
        vocab._load.cache_clear()


def check_packs(
    packs_dir: Path, changed: dict[Path, str], roster: str, npcs: str | None = None
) -> list[str]:
    """Why the packs, with ``changed`` written, would not load; empty when they would."""
    with tempfile.TemporaryDirectory() as scratch:
        copy = Path(scratch) / "packs"
        shutil.copytree(packs_dir, copy)
        for path, text in changed.items():
            target = copy / path.relative_to(packs_dir)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
        (Path(scratch) / "roster.json").write_text(roster, encoding="utf-8")
        npc_list = None
        if npcs is not None:
            npc_list = Path(scratch) / "npcs.json"
            npc_list.write_text(npcs, encoding="utf-8")
        with lists_of(Path(scratch) / "roster.json", npc_list):
            try:
                vocab.load_all()
                load_packs(copy)
            except (PackError, vocab.VocabError) as exc:
                return exc.errors
    return []


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
