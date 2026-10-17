"""Free text: type the answer, and be forgiven a typo.

Payload shape (schema ``$defs/free_text``)::

    {"intro"?: str, "prompt": str, "accepted": [str, ...], "max_distance"?: 0..2,
     "image"?: asset, "subject"?: {"name", "asset"?}, "explanation"?: str}

No round of many answers plays this, and none should. Guess the Examine started here and
left once every item needed an alias list and every typo needed a
ruling (section 2). It stays for the host's own questions, whose answers -- a clan member's
name, the boss somebody's pet came from -- are in no list the game could ship, and for
hand-written questions with one answer each, the NPCs' and Bestiary's: whoever writes one
lists its spellings once, which is the job that sank a whole generated round of them. The price of
that is ``questions/normalize.py``: case, accents, punctuation and spacing are not what a
player is being asked about, and a typo on a long answer is not a wrong answer.

``accepted`` is every spelling its writer will take, and the first is the one the reveal
shows as *the* answer. ``max_distance`` is how many typos, one by default; an accepted
answer under four characters takes none whatever it says, so "Jad" does not accept "Jam".

``subject`` is what the answer is -- the NPC it names, with its asset -- and waits for the
reveal with ``accepted``, for the reason ``pick_from_list`` withholds its own.
"""

from typing import Any
from uuid import UUID

from app.questions import normalize, text
from app.questions.submission import Submission
from app.questions.types.scoring import Scoring
from app.questions.types.timing import Timing

SCORING = Scoring.SPEED
# A typed or accepted answer, before normalising and after: the wire and the schema
# hold the first, and ``parse_value`` and ``check`` the second.
MAX_LENGTH = 80
DEFAULT_DISTANCE = 1
# An answer to type on a phone, and a reveal that may list the wrong ones.
ANSWER = Timing(base=20)
REVEAL = Timing(base=7)

_OPEN_KEYS = ("intro", "prompt")


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the question, and its picture if it has one."""
    return {key: payload[key] for key in _OPEN_KEYS if key in payload}


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus every answer that counted and what it was."""
    shown = {**client_view(payload), "accepted": list(payload["accepted"])}
    for key in ("subject", "explanation"):
        if key in payload:
            shown[key] = payload[key]
    return shown


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    accepted = payload["accepted"]
    allowed = payload.get("max_distance", DEFAULT_DISTANCE)
    return {
        s.player_id: 1.0 if normalize.accepts(s.value, accepted, allowed) else 0.0
        for s in submissions
    }


def parse_value(payload: dict[str, Any], value: Any) -> str | None:
    """A storable string of up to ``MAX_LENGTH``, as typed; ``None`` for anything else."""
    # The raw cap bounds the NFKC that the normalised cap needs; the normalised one is what
    # bounds grading, since NFKC can make one character eighteen.
    if (
        isinstance(value, str)
        and 0 < len(value) <= MAX_LENGTH
        and text.unstorable(value) is None
        and len(normalize.normalize(value)) <= MAX_LENGTH
    ):
        return value
    return None


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: every accepted answer is something a player could type."""
    problems = []
    for index, answer in enumerate(payload["accepted"]):
        normal = normalize.normalize(answer)
        if not normal:
            problems.append(
                f"accepted[{index}]: {answer!r} is only punctuation and spaces,"
                " so nothing can match it"
            )
        elif len(normal) > MAX_LENGTH:
            problems.append(
                f"accepted[{index}]: is {len(normal)} characters once normalised,"
                f" over the {MAX_LENGTH} an answer may be"
            )
    return problems
