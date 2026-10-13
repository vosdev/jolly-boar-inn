"""``app/random_events.py``: the roster of NPCs who may interrupt a round, by id.

Every roster id has an event file with at least two questions and a copy entry
in ``client/src/lib/randomEvents.ts``, and every event file is named after a roster id.
"""

import json
import re

from app.config import REPO_ROOT
from app.questions.packs import EVENTS_DIR
from app.random_events import RANDOM_EVENTS

EVENTS = REPO_ROOT / "data" / "packs" / EVENTS_DIR
CLIENT_COPY = REPO_ROOT / "client" / "src" / "lib" / "randomEvents.ts"


def test_the_roster_is_at_least_a_dozen_plain_unique_ids() -> None:
    """They are stored in ``questions.random_event`` and looked up on the client. The
    roster no longer has to outnumber a room's events: the least used face repeats."""
    assert len(RANDOM_EVENTS) >= 12
    assert len(set(RANDOM_EVENTS)) == len(RANDOM_EVENTS)
    assert all(re.fullmatch(r"[a-z][a-z0-9_]{0,31}", npc) for npc in RANDOM_EVENTS)


def test_every_npc_has_a_file_of_at_least_two_questions() -> None:
    files = {path.stem: path for path in EVENTS.glob("*.json")}
    assert set(files) <= set(RANDOM_EVENTS), "a file named after nobody on the roster"
    assert set(files) == set(RANDOM_EVENTS), (
        f"on the roster with no file: {sorted(set(RANDOM_EVENTS) - set(files))}"
    )
    for npc, path in files.items():
        pack = json.loads(path.read_text(encoding="utf-8"))
        assert pack["random_event"] == npc
        assert len(pack["questions"]) >= 2, f"{npc} asks fewer than two questions"


def test_every_npc_has_copy_on_the_client_and_nobody_else_does() -> None:
    """The ids in ``lib/randomEvents.ts`` are this roster, in this order, and no other."""
    source = CLIENT_COPY.read_text(encoding="utf-8")
    ids = re.findall(r"^\s*id: '([a-z0-9_]+)',$", source, flags=re.MULTILINE)
    assert tuple(ids) == RANDOM_EVENTS
