"""Draft ``data/packs/mark_the_map.json`` once, from the wiki's location pages.

The pack is hand-written: this writes its first draft and refuses to overwrite it after that,
so the owner's cuts, tiers and rewordings are never lost to a re-run. Every page directly in
``Category:Locations`` becomes a question if the map in its infobox is on the surface. The
infobox's map, not the page's first, because a page's body maps show things near the place
(an entrance, an NPC), not the place. The first area among them (a polygon, a rectangle) gives
its bounding box; without one, the first point gets a ``LEAST_TARGET`` box round it. A map's
``width`` and ``height`` are the size of its view, not of the place, so they count for nothing.

Seas, lakes, rivers, regions, realms and places that are not in the game are left out by
category. A free-to-play place starts ``easy`` and any other ``medium``, for the owner to
retier. Names are page titles without a disambiguation suffix, so two pages may end up with
one name: both stay, and are listed for the owner to tell apart.

Usage (from ``server/``)::

    uv run python scripts/gen_locations.py [--packs-dir DIR] [--roster PATH]
"""

import argparse
import json
import math
import re
import sys
import urllib.parse
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import wiki
from import_suggestions import DEFAULT_PACKS, DEFAULT_ROSTER, WIKI_API, check_packs

from app.questions import schema
from app.questions.types.map_pin import LEAST_TARGET, SURFACE

MODE = "mark_the_map"
CATEGORY = "Category:Locations"
LEFT_OUT = (
    "Category:Seas",
    "Category:Bodies of water",
    "Category:Rivers",
    "Category:Regions",
    "Category:Realms",
    "Category:Locations that do not appear in-game",
)
FREE = "Category:Free-to-play locations"
# The wiki takes 50 titles a request.
BATCH = 50
WIKI_PAGE = "https://oldschool.runescape.wiki/w/"

# The wiki's own map ids for the surface; any other is a dungeon, an instance or a realm.
SURFACE_MAPS = {None, "-1", "0"}
OUTLINES = {"polygon", "highlightedarea", "focusarea"}
_POINT = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*[,:]\s*(-?\d+(?:\.\d+)?)\s*$")
_SUFFIX = re.compile(r"\s+\([^()]*\)$")


@dataclass(frozen=True)
class Map:
    """One ``{{Map}}``: its named parameters and its bare coordinates, in order."""

    named: dict[str, str]
    points: list[tuple[float, float]]

    @property
    def kind(self) -> str:
        return self.named.get("mtype", "").lower()

    def on_surface(self) -> bool:
        return self.named.get("mapID") in SURFACE_MAPS and self.named.get("plane", "0") == "0"

    def centre(self) -> tuple[float, float] | None:
        if self.points:
            return self.points[0]
        try:
            return float(self.named["x"]), float(self.named["y"])
        except KeyError, ValueError:
            return None


def templates(text: str, name: str) -> Iterator[str]:
    """The bodies of the templates in ``text`` whose name matches ``name``, a pattern."""
    opening = re.compile(r"\{\{\s*(?:" + name + r")\s*\|", re.IGNORECASE)
    for found in opening.finditer(text):
        depth, at = 1, found.end()
        while at < len(text) and depth:
            pair = text[at : at + 2]
            depth += {"{{": 1, "}}": -1}.get(pair, 0)
            at += 2 if pair in ("{{", "}}") else 1
        if not depth:
            yield text[found.end() : at - 2]


def split(body: str) -> list[str]:
    """``body``'s parameters, split on the pipes outside links and templates."""
    parts, depth, start = [], 0, 0
    for at, char in enumerate(body):
        if char in "[{":
            depth += 1
        elif char in "]}":
            depth -= 1
        elif char == "|" and depth == 0:
            parts.append(body[start:at])
            start = at + 1
    return [*parts, body[start:]]


def parse_map(body: str) -> Map:
    """A ``{{Map}}`` body as named parameters and bare coordinates."""
    named, points = {}, []
    for part in split(body):
        point = _POINT.match(part)
        if point:
            points.append((float(point[1]), float(point[2])))
        elif "=" in part:
            key, value = part.split("=", 1)
            named[key.strip()] = value.strip()
    return Map(named, points)


def infobox_map(text: str) -> str:
    """The value of the location infobox's ``map``, or nothing without one."""
    for body in templates(text, r"Infobox[^|{}]*"):
        for part in split(body):
            key, _, value = part.partition("=")
            if key.strip() == "map":
                return value
    return ""


def box(found: Map) -> dict[str, int] | None:
    """The tiles ``found`` covers on the surface, at least ``LEAST_TARGET`` across."""
    if found.kind in OUTLINES and len(found.points) >= 3:
        xs, ys = [x for x, _ in found.points], [y for _, y in found.points]
        edges = math.floor(min(xs)), math.ceil(max(xs)), math.floor(min(ys)), math.ceil(max(ys))
    else:
        centre = found.centre()
        if centre is None:
            return None
        wide, tall = _size(found)
        x, y = centre
        edges = round(x - wide / 2), round(x + wide / 2), round(y - tall / 2), round(y + tall / 2)
    return _on_surface(_widened(*edges))


def _size(found: Map) -> tuple[float, float]:
    try:
        if found.kind == "rectangle":
            return float(found.named["rectX"]), float(found.named["rectY"])
        if found.kind in ("square", "circle"):
            across = 2 * float(found.named["r"])
            return across, across
    except KeyError, ValueError:
        pass
    return 0, 0


def _widened(min_x: int, max_x: int, min_y: int, max_y: int) -> dict[str, int]:
    def side(low: int, high: int) -> tuple[int, int]:
        short = LEAST_TARGET - (high - low)
        return (low, high) if short <= 0 else (low - short // 2, high + short - short // 2)

    (min_x, max_x), (min_y, max_y) = side(min_x, max_x), side(min_y, max_y)
    return {"min_x": min_x, "max_x": max_x, "min_y": min_y, "max_y": max_y}


def _on_surface(edges: dict[str, int]) -> dict[str, int] | None:
    inside = (
        SURFACE["min_x"] <= edges["min_x"]
        and edges["max_x"] < SURFACE["max_x"]
        and SURFACE["min_y"] <= edges["min_y"]
        and edges["max_y"] < SURFACE["max_y"]
    )
    return edges if inside else None


def place(text: str) -> dict[str, int] | None:
    """Where the page's infobox map puts the place: its first area, else its first point."""
    maps = [parse_map(body) for body in templates(infobox_map(text), "Map")]
    maps = [found for found in maps if found.on_surface()]
    for found in sorted(maps, key=_rank):
        tiles = box(found)
        if tiles is not None:
            return tiles
    return None


def _rank(found: Map) -> int:
    if found.kind in OUTLINES:
        return 0
    return 1 if found.kind == "rectangle" else 2


def name_of(title: str) -> str:
    """What a player is asked to find: the page title without its disambiguation."""
    return _SUFFIX.sub("", title)


def question(title: str, tiles: dict[str, int], difficulty: str) -> dict[str, Any]:
    """The question for one location page."""
    name = name_of(title)
    built: dict[str, Any] = {
        "type": "map_pin",
        "mode": MODE,
        "source": "pack",
        "tags": [],
        "payload": {"prompt": f"Where is {name}?", "targets": [{"name": name, **tiles}]},
        "wiki": WIKI_PAGE + urllib.parse.quote(title.replace(" ", "_"), safe="()"),
        "difficulty": difficulty,
    }
    return {"id": schema.content_id(built), **built}


def draft(
    pages: dict[str, str], left_out: set[str], free: set[str]
) -> tuple[dict[str, Any], list[str]]:
    """The pack for ``pages`` (title to wikitext), and the names more than one question shares."""
    questions = []
    for title in sorted(pages):
        tiles = None if title in left_out else place(pages[title])
        if tiles is not None:
            questions.append(question(title, tiles, "easy" if title in free else "medium"))
    names = Counter(q["payload"]["targets"][0]["name"] for q in questions)
    return {"pack": MODE, "questions": questions}, sorted(n for n, k in names.items() if k > 1)


def members(source: wiki.Wiki, category: str) -> list[str]:
    """The articles directly in ``category``."""
    titles, more = [], {}
    while True:
        query = {"action": "query", "list": "categorymembers", "cmtitle": category}
        query |= {"cmnamespace": "0", "cmlimit": "500", "format": "json", "formatversion": "2"}
        found = source.get_json(f"{WIKI_API}?{urllib.parse.urlencode(query | more)}")
        titles += [page["title"] for page in found["query"]["categorymembers"]]
        if "continue" not in found:
            return titles
        more = found["continue"]


def wikitext(source: wiki.Wiki, titles: list[str]) -> dict[str, str]:
    """Each title's wikitext, ``BATCH`` pages a request."""
    pages = {}
    for start in range(0, len(titles), BATCH):
        query = {"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main"}
        query |= {"titles": "|".join(titles[start : start + BATCH])}
        query |= {"format": "json", "formatversion": "2"}
        found = source.get_json(f"{WIKI_API}?{urllib.parse.urlencode(query)}")
        for page in found["query"]["pages"]:
            if "revisions" in page:
                pages[page["title"]] = page["revisions"][0]["slots"]["main"]["content"]
    return pages


def render(pack: dict[str, Any]) -> str:
    return json.dumps(pack, indent=2, ensure_ascii=False) + "\n"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--packs-dir", type=Path, default=DEFAULT_PACKS)
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    out = args.packs_dir / f"{MODE}.json"
    if out.exists():
        print(f"{out} exists and is edited by hand now: not overwritten", file=sys.stderr)
        return 1
    source = wiki.connect()
    left_out = {title for category in LEFT_OUT for title in members(source, category)}
    free = set(members(source, FREE))
    pages = wikitext(source, members(source, CATEGORY))
    pack, shared = draft(pages, left_out, free)
    text = render(pack)
    problems = check_packs(args.packs_dir, {out: text}, args.roster.read_text(encoding="utf-8"))
    if problems:
        for line in problems:
            print(line, file=sys.stderr)
        print(f"FAILED: {out} not written", file=sys.stderr)
        return 1
    out.write_text(text, encoding="utf-8")
    print(f"{out}: {len(pack['questions'])} of {len(pages)} pages")
    for name in shared:
        print(f"shared name, tell them apart: {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
