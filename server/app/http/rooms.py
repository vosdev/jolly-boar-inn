"""``POST /api/rooms``, ``GET /api/rooms/{code}``, ``DELETE /api/rooms/{code}``."""

from typing import Any

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.errors import ApiError
from app.rooms.settings import NewRoomSettings
from app.rooms.state import RoomManager, normalize_name

router = APIRouter(prefix="/api/rooms")


class RateLimited(ApiError):
    status, code = 429, "rate_limited"


class CreateRoom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The creator is the room's admin, so the name is needed up front. 200 is the outer
    # bound on what is worth reading; ``normalize_name`` holds it to 1-24.
    display_name: str = Field(max_length=200)
    settings: NewRoomSettings = Field(default_factory=NewRoomSettings)
    # The custom-question editor is Phase 2; until then only an empty list is accepted.
    custom_questions: list[dict[str, Any]] = Field(default_factory=list, max_length=0)


class DeleteRoom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # A session token is 32 random bytes urlsafe-encoded; the bound is only there so an
    # oversized body is refused before it is compared against anything.
    session: str = Field(max_length=200)


def manager(request: Request) -> RoomManager:
    return request.app.state.rooms


def client_host(request: Request) -> str:
    return request.client.host if request.client else ""


@router.post("", status_code=201)
async def create_room(body: CreateRoom, request: Request) -> dict[str, Any]:
    ip = client_host(request)
    # Before the limiter, which records a hit on every call it allows: a handful of
    # typos in the name field should not cost a host their hourly quota.
    name = normalize_name(body.display_name)
    if not request.app.state.ratelimiter.allow(ip):
        raise RateLimited("too many rooms created from this address, try again later")
    room, player, session = await manager(request).create(
        name, body.settings, body.custom_questions, ip
    )
    return {"code": room.code, "session": session, "player": player.view()}


@router.get("/{code}")
async def get_room(code: str, request: Request) -> dict[str, Any]:
    room = await manager(request).get(code)
    return {"room": room.view(), "players": [p.view() for p in room.players.values()]}


@router.delete("/{code}", status_code=204, response_class=Response)
async def delete_room(code: str, body: DeleteRoom, request: Request) -> Response:
    """Remove a room at its host's request; the code is free again immediately.

    The session goes in the body, never in the URL (section 7): a ``DELETE`` with a JSON
    body is the same shape as the ``POST``s around it, and the only other place a token
    ever travels is the first websocket frame. ``bad_session`` and ``not_admin`` are what
    a caller who is not an admin of this room gets, so the room's existence is the only
    thing an unauthenticated request can learn -- and its code was already in their hands.
    """
    await manager(request).delete(code, body.session)
    return Response(status_code=204)
