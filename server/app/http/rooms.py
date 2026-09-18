"""``POST /api/rooms``, ``POST /api/rooms/{code}/claim``, ``GET /api/rooms/{code}``."""

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.errors import ApiError
from app.rooms.settings import RoomSettings
from app.rooms.state import RoomManager

router = APIRouter(prefix="/api/rooms")


class RateLimited(ApiError):
    status, code = 429, "rate_limited"


class CreateRoom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    settings: RoomSettings = Field(default_factory=RoomSettings)
    # The custom-question editor is Phase 2; until then only an empty list is accepted.
    custom_questions: list[dict[str, Any]] = Field(default_factory=list, max_length=0)


class Claim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=1, max_length=128)
    display_name: str = Field(max_length=200)


def manager(request: Request) -> RoomManager:
    return request.app.state.rooms


def client_host(request: Request) -> str:
    return request.client.host if request.client else ""


def admin_url(base: str, code: str, token: str) -> str:
    """The token rides in the fragment, which browsers never send to a server."""
    return f"{base.rstrip('/')}/r/{code}/admin#t={token}"


@router.post("", status_code=201)
async def create_room(body: CreateRoom, request: Request) -> JSONResponse:
    ip = client_host(request)
    if not request.app.state.ratelimiter.allow(ip):
        raise RateLimited("too many rooms created from this address, try again later")
    room, token = await manager(request).create(body.settings, body.custom_questions, ip)
    base = request.app.state.settings.public_base_url
    return JSONResponse(
        {"code": room.code, "admin_url": admin_url(base, room.code, token)}, status_code=201
    )


@router.post("/{code}/claim")
async def claim_admin(code: str, body: Claim, request: Request) -> dict[str, Any]:
    player, session = await manager(request).claim_admin(code, body.token, body.display_name)
    return {"session": session, "player": player.view()}


@router.get("/{code}")
async def get_room(code: str, request: Request) -> dict[str, Any]:
    room = await manager(request).get(code)
    return {"room": room.view(), "players": [p.view() for p in room.players.values()]}
