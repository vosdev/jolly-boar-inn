"""Pick from a list: the answer is one entry of a closed vocabulary, picked by id.

Payload shape (schema ``$defs/pick_from_list``)::

    {"prompt": str, "vocab": "items" | "npcs", "answer_id": int,
     "subject"?: {"name", "asset"?}, "image"?: asset, "steps"?: 1..12, "explanation"?: str}

Three modes answer this way -- Guess the Examine now, Who's That NPC? and Pixel Hunt in
Phase 3 -- and all three are questions you can only answer by knowing, not by ruling out
three buttons. The player searches the vocabulary and submits an entry's id; what they
typed to find it never leaves the client. That is the whole design: an id is either the
answer or it is not, so there is no normalisation, no alias list and no Levenshtein
threshold to argue about at the reveal. ``free_text`` keeps those for the host's own
questions, where no list could hold the answer.

``check`` holds a payload to the vocabulary it names: the ``answer_id`` must be in it and
``subject.name`` must be that entry's name. ``validate_packs.py`` runs it, so a roster
edit that drops or renames an item that a question answers to fails CI rather than a
quiz night. For the same reason ``validate_value`` refuses an id the vocabulary does not
have: a submission that could never be right is a malformed one, not a wrong one.

``steps`` is Pixel Hunt's -- how many frames the picture zooms out over. Without it the
question shows one thing, and ``STEP`` scoring falls back to speed (section 6).

The subject is the answer, so it is withheld with ``answer_id`` until the reveal. So is
``image``: an asset reference is ``item:<id>``, and for this type the id *is* the answer.
Phase 3's Pixel Hunt has to show its frames under a name that does not say what they are
of, and until then no ``pick_from_list`` payload's image goes on the wire while it is open.
"""

from typing import Any
from uuid import UUID

from app.questions import vocab
from app.questions.submission import Submission
from app.questions.types.bounds import Bounds
from app.questions.types.scoring import Scoring

SCORING = Scoring.STEP
# A sentence to read, then a search to type and an entry to pick: slower than four buttons.
# Twenty seconds leaves a player who knows it time to find it in the list; a minute is as
# long as it stays a question about knowing rather than about scrolling.
SECONDS = Bounds(default=20, minimum=10, maximum=60)

_OPEN_KEYS = ("prompt", "vocab", "steps")


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the prompt and which list to pick from."""
    return {key: payload[key] for key in _OPEN_KEYS if key in payload}


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus the answer and what it was."""
    shown = {**client_view(payload), "answer_id": payload["answer_id"]}
    for key in ("subject", "image", "explanation"):
        if key in payload:
            shown[key] = payload[key]
    return shown


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    return {s.player_id: 1.0 if s.value == payload["answer_id"] else 0.0 for s in submissions}


def validate_value(payload: dict[str, Any], value: Any) -> bool:
    # ``True == 1``, so a ``true`` would otherwise answer entry 1; see ``more_less``.
    if isinstance(value, bool) or not isinstance(value, int):
        return False
    names = vocab.get(payload["vocab"])
    return names is not None and names.name_of(value) is not None


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: the answer is an entry of its vocabulary, and the subject is its name."""
    names = vocab.get(payload["vocab"])
    if names is None:
        return [f"vocab: {payload['vocab']!r} is not available in this build"]
    answer_id = payload["answer_id"]
    name = names.name_of(answer_id)
    if name is None:
        return [f"answer_id: {answer_id} is not an entry of the {payload['vocab']} vocabulary"]
    subject = payload.get("subject")
    if subject is not None and subject["name"] != name:
        return [
            f"subject.name: {subject['name']!r} but {payload['vocab']} entry {answer_id}"
            f" is {name!r}"
        ]
    return []
