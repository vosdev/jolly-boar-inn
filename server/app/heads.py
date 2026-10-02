"""Chat heads: the manifest in ``data/heads/heads.json`` (section 5.2 of ideas/design.md).

The manifest is an array of ``{"id", "file", "name"}``, and **the index is the contract**:
``players.avatar`` stores an ``id``, so a head may be redrawn in place and the list may
grow, but an id is never repointed at a different face. The server needs nothing from
it but its length -- an ``avatar`` outside ``0..len-1`` is refused before it is stored --
and loading it validates the rest, so a manifest a client could not draw from is a
server that does not start rather than a gap in somebody's lobby.
"""

import json
import re
from pathlib import Path

from app.config import REPO_ROOT

HEADS_DIR = REPO_ROOT / "data" / "heads"
MANIFEST = HEADS_DIR / "heads.json"
_FILE = re.compile(r"^(\d{3})-[a-z0-9-]+\.png$")


def load_head_count(path: Path = MANIFEST) -> int:
    """How many heads there are, once the manifest is known to be well formed.

    Every entry's ``id`` is its position, its file exists next to the manifest and is
    named ``NNN-<slug>.png`` with ``NNN`` that same id, and names are distinct.
    """
    heads = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(heads, list) or not heads:
        raise ValueError(f"{path}: must be a non-empty JSON array")
    names: set[str] = set()
    for index, head in enumerate(heads):
        if not isinstance(head, dict) or set(head) != {"id", "file", "name"}:
            raise ValueError(f"{path}: entry {index} must be exactly {{id, file, name}}")
        if head["id"] != index:
            raise ValueError(f"{path}: entry {index} has id {head['id']!r}; ids are positions")
        match = _FILE.match(str(head["file"]))
        if match is None or int(match.group(1)) != index:
            raise ValueError(f"{path}: entry {index} file must be {index:03d}-<slug>.png")
        if not (path.parent / head["file"]).is_file():
            raise ValueError(f"{path}: entry {index} names a missing file {head['file']}")
        name = head["name"]
        if not isinstance(name, str) or not name.strip() or name.lower() in names:
            raise ValueError(f"{path}: entry {index} needs a distinct, non-empty name")
        names.add(name.lower())
    return len(heads)
