"""``GET /api/modes``: the game modes this build plays, and how many questions a round holds.

The create form needs a number field per mode with a sane default and a range that the
server will actually accept. Both come from the mode registry (``app/modes``), which reads
them off the mode's types unless the mode says otherwise, so the form asks for them rather
than carrying a second copy that drifts. Each mode's ``types`` ride along because which
answer shapes a round is played in is the server's to say, and so do its ``seconds``: what
one of its pack questions typically takes per pace, for the form's minutes. A price mode
has ``as_of``, the date its prices were fetched, which the splash and footer show instead
of every question; ``None`` for the rest. Copy -- what a
mode is called and how it is explained -- stays on the client, in ``lib/modes.ts``.

``custom`` and ``random_event`` are listed too, with no types and ``questions`` null: they
are never a round, and each of their questions is a random event. The create form offers
as a round every mode that has ``questions``, which is every other one.
"""

from typing import Any

from fastapi import APIRouter, Request

from app.modes import offered, questions_bounds
from app.questions.packs import mode_questions
from app.rooms.duration import typical_seconds

router = APIRouter(prefix="/api/modes")


@router.get("")
def list_modes(request: Request) -> list[dict[str, Any]]:
    """Registry order, which is the order the create form lists them in.

    A mode the instance has not switched on (``Mode.setting``) is left out, so the form
    never offers what ``POST /api/rooms`` would refuse.
    """
    packs = request.app.state.packs
    return [
        {
            "id": mode.id,
            "types": sorted(mode.types),
            "questions": questions_bounds(mode.id).view() if mode.is_round else None,
            "seconds": typical_seconds(pool),
            "as_of": _as_of(pool),
        }
        for mode in offered(request.app.state.settings, packs)
        for pool in [mode_questions(packs, mode.pool or mode.id)]
    ]


def _as_of(pool: list[dict[str, Any]]) -> str | None:
    """The newest ``as_of`` in a pool, or ``None`` for a mode without prices."""
    dates = [q["payload"]["as_of"] for q in pool if "as_of" in q["payload"]]
    return max(dates, default=None)
