"""``GET /api/modes``: the game modes this build plays, and how a round of each is paced.

The create form needs a number field per mode with a sane default and a range that the
server will actually accept. Both come from the mode registry (``app/modes``), which reads
them off the mode's type unless the mode says otherwise, so the form asks for them rather
than carrying a second copy that drifts. Each mode's ``type`` rides along because which
answer shape a round is played in is the server's to say, like its pace. Copy -- what a
mode is called and how it is explained -- stays on the client, in ``lib/modes.ts``: it is
the one thing about a mode the server has no opinion on.

``custom`` is listed too, with ``type`` and ``questions`` null: it has no type because the
host's questions carry their own, and no round length because it is never a round -- each
of its questions is a random event. Its ``seconds`` is how long one of them stays open. The
create form offers as a round every mode that has ``questions``, which is every other one.
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
            "questions": questions_bounds(mode.id).view() if mode.is_round else None,
            "seconds": seconds_bounds(mode.id).view(),
        }
        for mode in MODES.values()
    ]
