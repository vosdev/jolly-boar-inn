"""``app/random_events.py``: the roster of NPCs who may interrupt a round, by id.

T22 Accept: every roster id has an event file with at least two questions and a copy entry
in ``client/src/lib/randomEvents.ts``. Only six NPCs had questions written when T22
landed, so the rest are named in ``AWAITING_QUESTIONS``, and the test holds that list to
the truth in both directions: an NPC on it may not have a file, and one off it must have a
proper one. Writing an NPC's questions means taking it off the list, and the list only
ever gets shorter.
"""

import json
import re

from app.config import REPO_ROOT
from app.questions.packs import EVENTS_DIR
from app.random_events import RANDOM_EVENTS

EVENTS = REPO_ROOT / "data" / "packs" / EVENTS_DIR
CLIENT_COPY = REPO_ROOT / "client" / "src" / "lib" / "randomEvents.ts"

# On the roster, with copy on the client, and no questions yet (ideas/random-events.md).
# Until they have some, these NPCs only ever ask a host's own question.
AWAITING_QUESTIONS = {
    "sandwich_lady",
    "tree_spirit",
    "drunken_dwarf",
    "alfred",
    "thurgo",
    "genie",
    "sergeant_damien",
    "wise_old_man",
    "ned",
    "baba_yaga",
}


def test_the_roster_is_at_least_a_dozen_plain_unique_ids() -> None:
    """They are stored in ``questions.random_event`` and looked up on the client. The
    roster no longer has to outnumber a room's events: the least used face repeats."""
    assert len(RANDOM_EVENTS) >= 12
    assert len(set(RANDOM_EVENTS)) == len(RANDOM_EVENTS)
    assert all(re.fullmatch(r"[a-z][a-z0-9_]{0,31}", npc) for npc in RANDOM_EVENTS)


def test_every_npc_has_two_questions_or_is_owed_them() -> None:
    files = {path.stem: path for path in EVENTS.glob("*.json")}
    assert set(files) <= set(RANDOM_EVENTS), "a file named after nobody on the roster"
    assert AWAITING_QUESTIONS <= set(RANDOM_EVENTS)
    written = set(RANDOM_EVENTS) - AWAITING_QUESTIONS
    assert set(files) == written, (
        f"with questions but still listed as owed: {sorted(set(files) & AWAITING_QUESTIONS)};"
        f" listed as written but no file: {sorted(written - set(files))}"
    )
    for npc in written:
        pack = json.loads(files[npc].read_text(encoding="utf-8"))
        assert pack["random_event"] == npc
        assert len(pack["questions"]) >= 2, f"{npc} asks fewer than two questions"


def test_every_npc_has_copy_on_the_client_and_nobody_else_does() -> None:
    """The ids in ``lib/randomEvents.ts`` are this roster, in this order, and no other."""
    source = CLIENT_COPY.read_text(encoding="utf-8")
    ids = re.findall(r"^\s*id: '([a-z0-9_]+)',$", source, flags=re.MULTILINE)
    assert tuple(ids) == RANDOM_EVENTS
