"""``GET /api/modes``: the game modes this build plays, and how a round of each is paced.

The create form needs a number field per mode with a sane default and a range that the
server will actually accept. Both come from the mode registry (``app/modes``), which reads
them off the mode's types unless the mode says otherwise, so the form asks for them rather
than carrying a second copy that drifts. Each mode's ``types`` ride along because which
answer shapes a round is played in is the server's to say, like its pace. Copy -- what a
mode is called and how it is explained -- stays on the client, in ``lib/modes.ts``.

``custom`` and ``random_event`` are listed too, with no types and ``questions`` and
``seconds`` null: they are never a round, and each of their questions is a random event
paced by its own type. The create form offers as a round every mode that has
``questions``, which is every other one.
"""

from typing import Any

from fastapi import APIRouter, Request

from app.modes import offered, questions_bounds, seconds_bounds

router = APIRouter(prefix="/api/modes")


@router.get("")
def list_modes(request: Request) -> list[dict[str, Any]]:
    """Registry order, which is the order the create form lists them in.

    A mode the instance has not switched on (``Mode.setting``) is left out, so the form
    never offers what ``POST /api/rooms`` would refuse.
    """
    return [
        {
            "id": mode.id,
            "types": sorted(mode.types),
            "questions": questions_bounds(mode.id).view() if mode.is_round else None,
            "seconds": seconds_bounds(mode.id).view() if mode.is_round else None,
        }
        for mode in offered(request.app.state.settings)
    ]
