"""``GET /api/modes``: the game modes this build plays, and how a round of each is paced.

The create form needs a number field per mode with a sane default and a range that the
server will actually accept. Both live in the type modules (``questions/types``), so the
form asks for them rather than carrying a second copy that drifts. Copy -- what a mode is
called and how it is explained -- stays on the client, in ``lib/modes.ts``: it is the one
thing about a mode the server has no opinion on.
"""

from typing import Any

from fastapi import APIRouter

from app.questions.types import TYPES, questions_bounds, seconds_bounds

router = APIRouter(prefix="/api/modes")


@router.get("")
def list_modes() -> list[dict[str, Any]]:
    """Registry order, which is the order the create form lists them in."""
    return [
        {
            "id": type_,
            "questions": questions_bounds(type_).view(),
            "seconds": seconds_bounds(type_).view(),
        }
        for type_ in TYPES
    ]
