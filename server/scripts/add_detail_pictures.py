"""Give every roster item with a wiki detail image a Pixel Hunt picture in ``data/assets.json``.

Pixel Hunt shows an item's detail image, ``<Name> detail.png``, not its inventory icon. For each
item in ``data/popular-items.json`` the manifest has no ``pictures/item/<id>`` for, this asks
the wiki whether that file exists, all of them in the one ``imageinfo`` query
``fetch_assets.py`` locates files with (50 titles to a request, never page by page), and adds
``pictures/item/<id>.png`` for each that does. A title the wiki redirects is written as the
file it lands on. The items without one are listed and left out; ``make fetch-assets`` then
fetches what was added.

Usage (from ``server/``)::

    uv run python scripts/add_detail_pictures.py
"""

import argparse
import json
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import wiki
from fetch_assets import MANIFEST, REPO_ROOT, ManifestError, Source, WikiSource, load_manifest

ROSTER = REPO_ROOT / "data" / "popular-items.json"


@dataclass
class Plan:
    added: dict[str, str] = field(default_factory=dict)
    # ``<id> <name>`` of each roster item the wiki has no detail image for.
    missing: list[str] = field(default_factory=list)


def has_picture(manifest: dict[str, str], number: int) -> bool:
    """Whether ``manifest`` gives item ``number`` a picture, in any format."""
    return any(t.rpartition(".")[0] == f"pictures/item/{number}" for t in manifest)


def plan(items: list[dict[str, Any]], manifest: dict[str, str], source: Source) -> Plan:
    """The entries to add for ``items`` that have no picture yet, from one lookup in ``source``."""
    wanted = {item["id"]: f"{item['name']} detail.png" for item in items}
    wanted = {
        number: title for number, title in wanted.items() if not has_picture(manifest, number)
    }
    result = Plan()
    if not wanted:
        return result
    located = source.locate(sorted(set(wanted.values())))
    for number, title in sorted(wanted.items()):
        if title in located.where:
            result.added[f"pictures/item/{number}.png"] = located.renamed.get(title, title)
        else:
            result.missing.append(f"{number} {title.removesuffix(' detail.png')}")
    return result


def merged(manifest: dict[str, str], added: dict[str, str]) -> str:
    """``manifest`` with ``added`` in it, sorted and as the file spells it."""
    return json.dumps(dict(sorted((manifest | added).items())), indent=2) + "\n"


def run(
    roster: Path, manifest_path: Path, source: Source, out: Callable[[str], None] = print
) -> Plan:
    """Add what ``source`` has for ``roster`` to ``manifest_path``, and say what it lacks."""
    items = json.loads(roster.read_text(encoding="utf-8"))["items"]
    manifest = load_manifest(manifest_path)
    result = plan(items, manifest, source)
    if result.added:
        manifest_path.write_text(merged(manifest, result.added), encoding="utf-8")
    for line in result.missing:
        out(f"no detail image: {line}")
    out(
        f"{len(result.added)} added, {len(result.missing)} without a detail image,"
        f" {source.requests} request(s)"
    )
    return result


def main(argv: list[str]) -> int:
    argparse.ArgumentParser(description=__doc__.split("\n\n")[0]).parse_args(argv)
    try:
        run(ROSTER, MANIFEST, WikiSource(wiki.connect()))
    except ManifestError as exc:
        for line in exc.errors:
            print(f"data/assets.json: {line}", file=sys.stderr)
        return 1
    except (wiki.MissingUserAgent, OSError, ValueError, KeyError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
