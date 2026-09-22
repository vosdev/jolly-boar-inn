"""The random-event roster: who may interrupt a round, by id, and nothing else.

A random event is a question asked outside the round it belongs to, by an NPC who turns
up for it and leaves -- the way the game this quiz is about has always interrupted people
mid-task. ``rooms/selection.py`` places them and gives each a face from this tuple, never
the same face twice in one room, and ``questions.random_event`` stores which one.

The ids are all the server knows. Who these NPCs are, what they open with and what they
look like is copy, and copy lives on the client (``lib/randomEvents.ts``, from T22) exactly
as a mode's label does in ``lib/modes.ts``. A client that meets an id it has no copy for
draws a generic card for it, so adding one here never breaks an older build.

The roster has to be at least as long as the most events a room can hold -- one per round
after the first -- or the last host to pick every mode would lose a question to a shortage
of faces. ``tests/test_random_events.py`` holds it to that.
"""

RANDOM_EVENTS: tuple[str, ...] = (
    "sandwich_lady",
    "genie",
    "drunken_dwarf",
    "rick_turpentine",
    "sergeant_damien",
    "evil_bob",
    "freaky_forester",
    "mysterious_old_man",
    "quiz_master",
    "mr_mordaut",
    "dr_jekyll",
    "count_check",
)
