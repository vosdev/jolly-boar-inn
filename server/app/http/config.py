"""``GET /api/config``: the instance settings the client's copy quotes, never hardcoded."""

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/config")


@router.get("")
def get_config(request: Request) -> dict[str, int]:
    """How long a room stays open, in hours."""
    return {"room_ttl_hours": request.app.state.settings.room_ttl_days * 24}
