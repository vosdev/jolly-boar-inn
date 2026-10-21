"""Fetch the game art the client looks for and the repo does not carry, from the OSRS Wiki.

``data/assets.json`` maps each target, a path under ``client/src/assets/``, to the wiki file
it comes from. Titles are written out rather than derived from an id, because the wiki has
several chatheads for some NPCs and the owner picks which. A target's top folder is its
category (``items``, ``npcs``, ``pets``, ``teams``, ``themes``, ``trophies``): the folder a
client lookup already globs, so a fetched file is used on the next build with no code change.
``logo`` is the exception: the sources ``make logo`` draws the owner's logo from, which the
client never looks for. ``pictures`` is the other: ``pictures/<item|npc>/<id>.<ext>``, a
question's picture, lands in ``.pictures/`` at the repo root, where the build never sees it
under a name that is the answer. Every run but a dry one ends with ``build_pictures.py``,
which copies each into the client under a random name, even when a fetch failed.

Every request goes through ``wiki.py``: the operator's ``WIKI_USER_AGENT`` and one request
a second. One ``imageinfo`` query resolves up to 50 titles to upload URLs, then each file
is one download, so N files take at least N + ceil(N / 50) seconds, and the run says so
before it starts.

It never destroys anything. A target that exists is skipped, so a file the owner placed by
hand survives (``--force`` refetches), and each file is written under a temporary name and
renamed, so an interrupted run leaves no half an image. It trusts nothing it downloads: a
body that is not the image its target names is refused. A title the wiki does not have is
reported and the rest still fetch; either makes the run exit non-zero.

The files are game assets and must never be committed, so every target has to be
git-ignored, and the run refuses before any request if one is not -- or if there is no git
to ask.

Usage (from ``server/``)::

    uv run python scripts/fetch_assets.py [--only CATEGORY]... [--force] [--dry-run]
        [--from-dir DIR]

``--dry-run`` lists what is missing and sends nothing. ``--from-dir`` takes each file from
``DIR``, named as its wiki title (spaces or underscores), instead of the wiki. Neither needs
a User-Agent.
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
import urllib.parse
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

import wiki

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "data" / "assets.json"
ASSETS = REPO_ROOT / "client" / "src" / "assets"
PICTURES = REPO_ROOT / ".pictures"

API = "https://oldschool.runescape.wiki/api.php"
# MediaWiki's limit on titles per query for a client without the bot right.
BATCH = 50
# The folders a client lookup globs, and the logo's sources; a target anywhere else would
# never be used.
CATEGORIES = ("items", "logo", "npcs", "pets", "pictures", "teams", "themes", "trophies")
# What those globs accept, so a fetched file is always one the client picks up.
EXTENSIONS = ("avif", "webp", "png", "jpg", "jpeg", "svg")
TARGET = re.compile(
    rf"^(?P<category>[a-z]+)/(?P<stem>[a-z0-9]+(?:_[a-z0-9]+)*)\.(?P<ext>{'|'.join(EXTENSIONS)})$"
)
# A question's picture is named by the asset id its payload's ``image`` holds.
PICTURE = re.compile(
    rf"^(?P<category>pictures)/(?P<stem>(?:item|npc)/[0-9]{{1,7}})\.(?P<ext>{'|'.join(EXTENSIONS)})$"
)


class ManifestError(ValueError):
    """``data/assets.json`` is malformed. ``errors`` lists every problem."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("\n".join(errors))
        self.errors = errors


class NotIgnored(RuntimeError):
    """A target git would commit, or no git to ask."""


# --- the manifest ---------------------------------------------------------------------


def _no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    keys = [key for key, _ in pairs]
    dupes = sorted({key for key in keys if keys.count(key) > 1})
    if dupes:
        raise ManifestError([f"duplicate target(s): {', '.join(dupes)}"])
    return dict(pairs)


def manifest_errors(manifest: Any) -> list[str]:
    """Every way ``manifest`` breaks the rules; empty when it is sound."""
    if not isinstance(manifest, dict):
        return ["the manifest must be an object of target path to wiki file title"]
    errors: list[str] = []
    if list(manifest) != sorted(manifest):
        errors.append("targets must be sorted")
    stems: dict[str, str] = {}
    for target, title in manifest.items():
        if target.startswith("pictures/"):
            match = PICTURE.match(target)
            shape = "pictures/<item|npc>/<id>"
        else:
            match = TARGET.match(target)
            shape = "<category>/<snake_case_name>"
        if match is None:
            errors.append(f"{target}: not {shape}.<{'|'.join(EXTENSIONS)}>")
            continue
        if match["category"] not in CATEGORIES:
            errors.append(f"{target}: no category {match['category']!r}, only {CATEGORIES}")
        same = f"{match['category']}/{match['stem']}"
        if same in stems:
            errors.append(f"{target}: {stems[same]} is the same file in another format")
        stems[same] = target
        if not isinstance(title, str) or not title.strip():
            errors.append(f"{target}: the title must be a wiki file name")
        elif title.startswith("File:") or "|" in title or title != title.strip():
            errors.append(f"{target}: {title!r} must be the file name alone, without 'File:'")
    return errors


def load_manifest(path: Path) -> dict[str, str]:
    """``path`` parsed and checked. ``ManifestError`` lists everything wrong with it."""
    manifest = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_no_duplicates)
    errors = manifest_errors(manifest)
    if errors:
        raise ManifestError(errors)
    return manifest


def category(target: str) -> str:
    return target.split("/", 1)[0]


def destination(target: str, assets: Path, pictures: Path) -> Path:
    """Where ``target`` is written: a picture into staging, anything else into the client."""
    if category(target) == "pictures":
        return pictures / target.removeprefix("pictures/")
    return assets / target


def git_ignored(paths: Iterable[Path], repo: Path = REPO_ROOT) -> set[Path]:
    """Which of ``paths`` git would leave out of a commit. ``NotIgnored`` without git."""
    paths = list(paths)
    try:
        done = subprocess.run(
            ["git", "-C", str(repo), "check-ignore", "--stdin", "-z"],
            input="\0".join(str(path) for path in paths),
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise NotIgnored(
            "git is not installed, and it is how this script proves nothing it fetches"
            " gets committed"
        ) from exc
    # 1 means none of them is ignored; anything above is git failing.
    if done.returncode > 1:
        raise NotIgnored(
            f"git cannot say what it would commit here ({done.stderr.strip()}); run this"
            " from a git checkout"
        )
    return {Path(line) for line in done.stdout.split("\0") if line}


# --- where the files come from --------------------------------------------------------


@dataclass
class Located:
    """What a source made of the titles it was asked for."""

    where: dict[str, str] = field(default_factory=dict)
    missing: list[str] = field(default_factory=list)
    # A title the wiki answered under another name: correct it in the manifest.
    renamed: dict[str, str] = field(default_factory=dict)


class Source(Protocol):
    requests: int

    def locate(self, titles: list[str]) -> Located: ...

    def fetch(self, where: str) -> bytes: ...


@dataclass
class WikiSource:
    """The live wiki, through ``wiki.py``."""

    wiki: wiki.Wiki
    requests: int = 0

    def locate(self, titles: list[str]) -> Located:
        """Each title's upload URL, ``BATCH`` titles to a query."""
        located = Located()
        for start in range(0, len(titles), BATCH):
            batch = titles[start : start + BATCH]
            query = urllib.parse.urlencode(
                {
                    "action": "query",
                    "prop": "imageinfo",
                    "iiprop": "url",
                    "redirects": "1",
                    "format": "json",
                    "formatversion": "2",
                    "titles": "|".join(f"File:{title}" for title in batch),
                }
            )
            self.requests += 1
            answer = self.wiki.get_json(f"{API}?{query}")["query"]
            hops = {
                step["from"]: step["to"]
                for key in ("normalized", "redirects")
                for step in answer.get(key, [])
            }
            pages = {page["title"]: page for page in answer.get("pages", [])}
            for title in batch:
                name = f"File:{title}"
                seen = {name}
                while name in hops and hops[name] not in seen:
                    name = hops[name]
                    seen.add(name)
                info = pages.get(name, {}).get("imageinfo") or []
                if not info:
                    located.missing.append(title)
                    continue
                located.where[title] = info[0]["url"]
                if name != f"File:{title}":
                    located.renamed[title] = name.removeprefix("File:")
        return located

    def fetch(self, where: str) -> bytes:
        self.requests += 1
        return self.wiki.get_bytes(where)


@dataclass
class DirSource:
    """Files saved from the wiki, named as their titles: no network, no User-Agent."""

    root: Path
    requests: int = 0

    def locate(self, titles: list[str]) -> Located:
        located = Located()
        for title in titles:
            for name in (title, title.replace(" ", "_")):
                if (self.root / name).is_file():
                    located.where[title] = name
                    break
            else:
                located.missing.append(title)
        return located

    def fetch(self, where: str) -> bytes:
        return (self.root / where).read_bytes()


# --- what is written ------------------------------------------------------------------


def looks_like(body: bytes, ext: str) -> bool:
    """Whether ``body`` is an image in the format ``ext`` names, by its first bytes."""
    if ext == "png":
        return body.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in ("jpg", "jpeg"):
        return body.startswith(b"\xff\xd8\xff")
    if ext == "webp":
        return body[:4] == b"RIFF" and body[8:12] == b"WEBP"
    if ext == "avif":
        return body[4:8] == b"ftyp" and body[8:12] in (b"avif", b"avis")
    if ext == "svg":
        head = body[:1024].decode("utf-8", errors="replace").lstrip("﻿ \t\r\n").lower()
        return head.startswith("<svg") or (head.startswith("<?xml") and "<svg" in head)
    return False


def write_atomic(path: Path, body: bytes) -> None:
    """``body`` at ``path`` whole or not at all: written aside, then renamed over."""
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(f".{path.name}.part")
    try:
        part.write_bytes(body)
        os.replace(part, path)
    finally:
        part.unlink(missing_ok=True)


def least_seconds(count: int) -> int:
    """How long ``count`` files take at one request a second, queries included."""
    return count + math.ceil(count / BATCH)


@dataclass
class Report:
    written: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    refused: list[str] = field(default_factory=list)
    renamed: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.missing and not self.refused


def fetch(
    manifest: dict[str, str],
    assets: Path,
    pictures: Path,
    source: Source | None,
    *,
    force: bool = False,
    only: Iterable[str] = (),
    out: Callable[[str], None] = print,
) -> Report:
    """Fetch every missing target from ``source``; with no source, only say what is missing."""
    wanted = set(only)
    chosen = {t: title for t, title in manifest.items() if not wanted or category(t) in wanted}
    report = Report()
    todo: dict[str, str] = {}
    for target, title in chosen.items():
        if not force and destination(target, assets, pictures).exists():
            report.skipped.append(target)
        else:
            todo[target] = title
    if report.skipped:
        out(f"{len(report.skipped)} already there, kept (FORCE=1 fetches them again)")
    if not todo:
        out("nothing to fetch")
        return report
    out(f"{len(todo)} file(s) to fetch, at least {least_seconds(len(todo))} s at one a second")
    if source is None:
        for target, title in todo.items():
            out(f"  {target}  <-  File:{title}")
        return report
    located = source.locate(sorted(set(todo.values())))
    for title, now in sorted(located.renamed.items()):
        report.renamed.append(title)
        out(f"renamed: File:{title} is File:{now} on the wiki; correct it in data/assets.json")
    for target, title in todo.items():
        if title not in located.where:
            report.missing.append(target)
            out(f"missing: {target}: the wiki has no File:{title}")
            continue
        try:
            body = source.fetch(located.where[title])
        except (OSError, ValueError) as exc:
            report.refused.append(target)
            out(f"refused: {target}: {exc}")
            continue
        ext = target.rsplit(".", 1)[1]
        if not looks_like(body, ext):
            report.refused.append(target)
            out(f"refused: {target}: File:{title} is not a .{ext} image, nothing written")
            continue
        write_atomic(destination(target, assets, pictures), body)
        report.written.append(target)
        out(f"wrote {target}")
    out(
        f"{len(report.written)} written, {len(report.skipped)} kept,"
        f" {len(report.missing)} missing, {len(report.refused)} refused"
    )
    return report


# --- CLI ------------------------------------------------------------------------------


def build_pictures() -> int:
    """Copy the staged pictures into the client; ``build_pictures.py``'s exit status."""
    # Imported here: that script imports this one for the paths it shares.
    import build_pictures

    return build_pictures.main([])


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--only", action="append", choices=CATEGORIES, default=[], help="repeatable"
    )
    parser.add_argument("--force", action="store_true", help="fetch files that exist too")
    parser.add_argument("--dry-run", action="store_true", help="list what is missing")
    parser.add_argument("--from-dir", type=Path, help="files saved from the wiki, by title")
    args = parser.parse_args(argv)
    if args.dry_run and args.from_dir is not None:
        parser.error("--dry-run reads from nowhere, so --from-dir means nothing with it")
    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        manifest = load_manifest(MANIFEST)
        targets = [destination(target, ASSETS, PICTURES) for target in manifest]
        tracked = sorted(set(targets) - git_ignored(targets))
        if tracked:
            raise NotIgnored(
                "git would commit these, and they are game assets; ignore them in .gitignore:\n"
                + "\n".join(f"  {path.relative_to(REPO_ROOT)}" for path in tracked)
            )
        source: Source | None
        if args.dry_run:
            source = None
        elif args.from_dir is not None:
            source = DirSource(args.from_dir)
        else:
            source = WikiSource(wiki.connect())
        report = fetch(manifest, ASSETS, PICTURES, source, force=args.force, only=args.only)
        built = 0 if args.dry_run else build_pictures()
    except ManifestError as exc:
        for line in exc.errors:
            print(f"data/assets.json: {line}", file=sys.stderr)
        return 1
    except (wiki.MissingUserAgent, NotIgnored, OSError, ValueError, KeyError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    return 0 if report.ok and built == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
