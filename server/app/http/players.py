"""``POST /api/rooms/{code}/join``."""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from app.http.ratelimit import RateLimited, client_key, room_lookup
from app.http.rooms import client_host, manager

router = APIRouter(prefix="/api/rooms")


class Join(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(max_length=200)
    avatar: int | None = Field(default=None, ge=0, le=32767, strict=True)  # as on ``CreateRoom``
    returning: bool = Field(strict=True)  # as on ``CreateRoom``
    # From the invite link's fragment. ``token_urlsafe(9)`` is 12 characters; the bound
    # only refuses an oversized body before it is compared.
    key: str | None = Field(default=None, max_length=200)


@router.post("/{code}/join")
async def join(code: str, body: Join, request: Request) -> dict[str, Any]:
    host = client_host(request)
    with room_lookup(request.app.state.lookup_misses, host):
        # Charged before the join and refunded if it fails, like a lookup miss, so a
        # burst of joins cannot all pass the check before the first one is counted.
        key, now = client_key(host), datetime.now(UTC)
        if not request.app.state.joins.allow(key, now):
            raise RateLimited("too many joins from this address, try again later")
        try:
            player, session = await manager(request).join(
                code, body.display_name, body.avatar, body.returning, body.key
            )
        except BaseException:
            request.app.state.joins.refund(key, now)
            raise
    return {"session": session, "player": player.view()}
