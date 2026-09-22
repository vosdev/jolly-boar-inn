"""A room's own questions: what a host posts, and the envelope it is stored as.

A host writes a type and a payload and not much else. The rest of the envelope follows
from where the question is going, so it is filled in here rather than asked for: ``mode``
is ``custom``, ``source`` is ``room``, ``tags`` may be empty, and ``id`` is the content id
the server computes for every question it stores (section 2). What a host *did* send is
kept, and has to agree -- an export posted straight back carries all four, and it is
exactly as valid as it was when it came out.

A host may also name the NPC who asks it, ``random_event``, or leave it out and let the
room draw one (``rooms/selection.py``). A name the roster does not have is refused here
with the rest, since a face nobody can draw is a question the host would never see asked
the way they meant it.

Then the whole envelope is held to what a pack question is held to: the schema, the content
id, the mode rule and the type's own ``check``. A room is created with its questions or not
at all, so one bad question refuses the room, and the error names the question by its
place in the list and the field by its path.

``POST /api/rooms`` runs this while it parses the body, before the rate limiter, for the
reason the display name is checked there: fixing a typo in question three should not cost
the host a room from their hourly quota. ``RoomManager.create`` runs it again for callers
that did not come through HTTP, and it changes nothing the second time.
"""

from collections.abc import Sequence
from typing import Any

from app.questions import schema

MODE = "custom"
SOURCE = "room"


def envelopes(raw: Sequence[Any]) -> list[dict[str, Any]]:
    """Every question as a complete, valid envelope. Raises ``schema.QuestionError``."""
    found: list[str] = []
    done: list[dict[str, Any]] = []
    for index, question in enumerate(raw):
        if not isinstance(question, dict):
            found.append(f"custom_questions[{index}]: a question is a JSON object")
            continue
        filled = {"mode": MODE, "source": SOURCE, "tags": [], **question}
        if isinstance(filled.get("type"), str) and "payload" in filled:
            filled.setdefault("id", schema.content_id(filled))
        found += [f"custom_questions[{index}] {problem}" for problem in schema.errors(filled)]
        done.append(filled)
    if found:
        raise schema.QuestionError(found)
    return done
