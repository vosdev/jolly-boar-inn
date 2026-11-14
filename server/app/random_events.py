"""The random-event roster: who may interrupt a round, by id, and nothing else.

A random event is a question asked outside the round it belongs to, by an NPC who turns
up for it and leaves -- the way the game this quiz is about has always interrupted people
mid-task. ``rooms/selection.py`` places them and gives each a face from this tuple, and
``questions.random_event`` stores which one.

Each NPC asks about one subject, and its questions are one file each:
``data/packs/random_events/<id>.json``, named after the id here. ``questions/packs.py``
refuses a file named after anyone else, because a file nobody on the roster owns is a
set of questions nobody can be drawn to ask, and the tests refuse an NPC without one.
``ideas/architecture.md`` §5 is how the themes and the questions are written.

The ids are all the server knows. Who these NPCs are, what they open with and what they
look like is copy, and copy lives on the client (``lib/randomEvents.ts``) exactly as a
mode's label does in ``lib/modes/``. A client that meets an id it has no copy for draws
a generic card for it, so adding one here never breaks an older build.

The roster no longer has to outnumber the events a room can hold. A room at ``more`` has
one event per five round questions and may run out of new faces, so ``selection`` repeats
the least used one instead, and never the same face twice running. An id is stored in a
room's questions, so it is never renamed once it has shipped.
"""

from app.questions.types.scoring import Steps

RANDOM_EVENTS: tuple[str, ...] = (
    "sandwich_lady",
    "lumbridge_cook",
    "dr_jekyll",
    "bob",
    "survival_expert",
    "drunken_dwarf",
    "thurgo",
    "genie",
    "sergeant_damien",
    "krystilia",
    "ned",
    "death",
    "jane",
    "baba_yaga",
    "fairy_queen",
    "reldo",
    "certer",
)

# An NPC whose questions are a picture building up, as Pixel Hunt's are: each needs its
# picture on the instance, and scores on how soon it is named. Certer's always sketches.
BUILT_UP: dict[str, Steps] = {"certer": Steps(build=17, of=25)}
