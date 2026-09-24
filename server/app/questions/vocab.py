"""Closed answer lists for ``pick_from_list``: what a player may pick from, and nothing else.

A ``pick_from_list`` answer is the id of an entry in a named vocabulary, so grading is an
integer comparison and there is no spelling to argue about (architecture section 2 has
why Guess the Examine moved here off ``free_text``). That only holds if the list itself is
sound, and this module is where it is held to that:

- **Names are distinct**, compared the way the client's search compares them -- case and
  accents folded. Two entries a player cannot tell apart in the list are two right-looking
  answers of which the grader accepts one, so a vocabulary that has them refuses to load
  rather than shipping a question nobody can be sure of.
- **Ids are distinct**, because the id is the answer.

``items`` is the curated roster, ``data/popular-items.json``, which exists before any
importer does, so Guess the Examine does not wait for T23. ``npcs`` is
``data/facts/npcs.json``, which T23 writes; until then it is simply absent, and
``GET /api/vocab/npcs`` is a 404 rather than an empty list that would look like a
vocabulary with nobody in it. ``examines`` is ``data/examines.json``, the hand-written lines
Guess the Examine is played from: items, NPCs and scenery alike, so it is a list of its
own rather than a slice of the other two, and its answers are exactly its entries.

Both are read once and never change while the process runs. ``version`` is a hash of the
entries, so a client holding a list from one build can tell it is not this build's. It is
also what makes the list cheap to trust: the client fetches it once per session, and the
server never sends it per question (section 3).
"""

import hashlib
import json
import unicodedata
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from typing import Any

from app.config import REPO_ROOT

SOURCES: dict[str, Path] = {
    "items": REPO_ROOT / "data" / "popular-items.json",
    "npcs": REPO_ROOT / "data" / "facts" / "npcs.json",
    "examines": REPO_ROOT / "data" / "examines.json",
}


class VocabError(ValueError):
    """A vocabulary's source is unusable. ``errors`` lists every problem found."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("\n".join(errors))
        self.errors = errors


def fold(text: str) -> str:
    """Case- and accent-insensitive form of ``text``: what "the same name" means here.

    NFKD splits an accented letter into the letter and its accent, and the accent is then
    dropped, so "Ahrim", "ahrim" and "Āhrim" are one name. ``lib/vocab.ts`` folds the same
    way, so the server's idea of a duplicate and the client's idea of a match agree.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


@dataclass(frozen=True, slots=True)
class Entry:
    id: int
    name: str


@dataclass(frozen=True, slots=True)
class Vocab:
    name: str
    version: str
    entries: tuple[Entry, ...]
    _by_id: dict[int, str] = field(repr=False, compare=False)

    def name_of(self, entry_id: int) -> str | None:
        return self._by_id.get(entry_id)

    def view(self) -> dict[str, Any]:
        """``GET /api/vocab/{name}``."""
        return {
            "vocab": self.name,
            "version": self.version,
            "entries": [{"id": e.id, "name": e.name} for e in self.entries],
        }


def build(name: str, records: Any, label: str) -> Vocab:
    """A vocabulary from a list of ``{"id", "name", ...}`` records. Raises ``VocabError``.

    Other keys on a record are ignored: the roster and the importer's output carry more
    than a combobox needs. Entries are sorted by folded name, the order the list opens in.
    """
    if not isinstance(records, list) or not records:
        raise VocabError([f"{label}: must be a non-empty list of {{id, name}}"])
    errors: list[str] = []
    entries: list[Entry] = []
    ids: dict[int, str] = {}
    names: dict[str, str] = {}
    for index, record in enumerate(records):
        entry_id = record.get("id") if isinstance(record, dict) else None
        entry_name = record.get("name") if isinstance(record, dict) else None
        if isinstance(entry_id, bool) or not isinstance(entry_id, int) or entry_id < 0:
            errors.append(f"{label}: entry {index} needs a non-negative integer id")
            continue
        if not isinstance(entry_name, str) or not entry_name.strip():
            errors.append(f"{label}: entry {index} ({entry_id}) needs a non-empty name")
            continue
        if entry_id in ids:
            errors.append(f"{label}: id {entry_id} is both {ids[entry_id]!r} and {entry_name!r}")
            continue
        key = fold(entry_name)
        if key in names:
            errors.append(
                f"{label}: {entry_name!r} ({entry_id}) and {names[key]!r} read as the same"
                " name, so a player could not tell them apart in the list"
            )
            continue
        ids[entry_id] = entry_name
        names[key] = entry_name
        entries.append(Entry(id=entry_id, name=entry_name))
    if errors:
        raise VocabError(errors)
    entries.sort(key=lambda e: (fold(e.name), e.id))
    material = json.dumps(
        [[e.id, e.name] for e in sorted(entries, key=lambda e: e.id)],
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return Vocab(
        name=name,
        version=hashlib.sha256(material).hexdigest()[:16],
        entries=tuple(entries),
        _by_id=dict(ids),
    )


def read(name: str, path: Path) -> Vocab | None:
    """The vocabulary in ``path``, or ``None`` if the file does not exist yet.

    The roster keeps its entries under ``"items"`` and ``examines.json`` under
    ``"examines"``, each next to a ``_comment``; the importer's files under a key named
    after the vocabulary. A bare list is accepted too.
    """
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    records = data.get(name) if isinstance(data, dict) else data
    return build(name, records, path.name)


def get(name: str) -> Vocab | None:
    """A shipped vocabulary by name; ``None`` for an unknown name or a missing file."""
    # Checked before the cache, because the name comes straight from a URL: caching
    # every unknown one would let anybody grow the process without limit.
    return _load(name) if name in SOURCES else None


@cache
def _load(name: str) -> Vocab | None:
    return read(name, SOURCES[name])


def load_all() -> dict[str, Vocab]:
    """Every vocabulary this build has, so a broken one stops startup rather than a round."""
    return {name: vocab for name in SOURCES if (vocab := get(name)) is not None}
