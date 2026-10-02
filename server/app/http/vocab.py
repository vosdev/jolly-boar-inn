"""``GET /api/vocab/{name}``: the list a ``pick_from_list`` question is answered from.

A separate fetch rather than a field on ``OpenQuestion``, because it is the same few
hundred entries for every question of the round: sending it per question would put the
answer list on the wire once per question for no gain. The client fetches it once per
session, when the first question naming it arrives (section 3, "Autocomplete
vocabularies").

Knowing the list gives nothing away. It is every item in the roster, not the question's
options, and the answer to any one question is one entry among all of them.

A vocabulary this build does not have -- ``npcs`` before its facts are written, or a name
nobody registered -- is a 404, not an empty list: an empty list is a combobox with
nothing in it, which reads as a bug in the round rather than a round this build cannot
play.
"""

from typing import Any

from fastapi import APIRouter

from app.errors import ApiError
from app.questions import vocab

router = APIRouter(prefix="/api/vocab")


class VocabNotFound(ApiError):
    status, code = 404, "not_found"


@router.get("/{name}")
def get_vocab(name: str) -> dict[str, Any]:
    found = vocab.get(name)
    if found is None:
        raise VocabNotFound(f"no vocabulary named {name!r} in this build")
    return found.view()
