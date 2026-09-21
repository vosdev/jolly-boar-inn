"""``GET /api/modes``: the game modes this build plays, and how a round of each is paced.

The create form needs a number field per mode with a sane default and a range that the
server will actually accept. Both come from the mode registry (``app/modes``), which reads
them off the mode's type unless the mode says otherwise, so the form asks for them rather
than carrying a second copy that drifts. Each mode's ``type`` rides along because which
answer shape a round is played in is the server's to say, like its pace. Copy -- what a
mode is called and how it is explained -- stays on the client, in ``lib/modes.ts``: it is
the one thing about a mode the server has no opinion on.
"""

from typing import Any

from fastapi import APIRouter

from app.modes import MODES, questions_bounds, seconds_bounds

router = APIRouter(prefix="/api/modes")


@router.get("")
def list_modes() -> list[dict[str, Any]]:
    """Registry order, which is the order the create form lists them in."""
    return [
        {
            "id": mode.id,
            "type": mode.type,
            "questions": questions_bounds(mode.id).view(),
            "seconds": seconds_bounds(mode.id).view(),
        }
        for mode in MODES.values()
    ]
