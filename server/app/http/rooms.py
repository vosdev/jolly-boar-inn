"""``POST /api/rooms``, ``GET /api/rooms/{code}``, ``DELETE /api/rooms/{code}``."""

from typing import Any, Self

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.http.ratelimit import RateLimited, client_key, room_lookup
from app.questions import custom
from app.rooms.settings import MAX_QUESTIONS_PER_ROOM, NewRoomSettings
from app.rooms.state import RoomManager, normalize_name

router = APIRouter(prefix="/api/rooms")


class CreateRoom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The creator is the room's admin, so the name is needed up front. 200 is the outer
    # bound on what is worth reading; ``normalize_name`` holds it to 1-24.
    display_name: str = Field(max_length=200)
    # A head id from ``data/heads/heads.json`` (D4). Optional, so a client from before
    # heads still creates rooms; its players are drawn the head derived from their id.
    avatar: int | None = Field(default=None, ge=0, le=32767, strict=True)
    # Whether this browser had a profile when the page loaded. Counted, never stored.
    returning: bool = Field(strict=True)
    # Only a link carrying the room's key joins it. Not a setting: settings reach everyone.
    invite_only: bool = Field(default=False, strict=True)
    settings: NewRoomSettings = Field(default_factory=NewRoomSettings)
    # The host's own questions, each a random event in a round it does not belong to. The
    # bound is only the outer one; ``settings`` decides how many this room has room for.
    custom_questions: list[dict[str, Any]] = Field(
        default_factory=list, max_length=MAX_QUESTIONS_PER_ROOM
    )

    # Both checks run while the body is parsed, so a bad question is a 422 before the
    # rate limiter has counted anything -- the same courtesy as a bad display name.
    @field_validator("custom_questions")
    @classmethod
    def _complete_and_valid(cls, questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return custom.envelopes(questions)

    @model_validator(mode="after")
    def _room_for_them(self) -> Self:
        self.settings.check_custom_questions(len(self.custom_questions))
        return self


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
    manager(request).check_avatar(body.avatar)
    if not request.app.state.ratelimiter.allow(client_key(ip)):
        raise RateLimited("too many rooms created from this address, try again later")
    room, player, session = await manager(request).create(
        name, body.settings, body.custom_questions, body.avatar, body.returning, body.invite_only
    )
    # ``expires_at`` lets the host's "rooms you created" list drop a room once its code
    # may belong to someone else.
    return {
        "code": room.code,
        "session": session,
        "player": player.view(),
        "expires_at": room.expires_at,
    }


@router.get("/{code}")
async def get_room(code: str, request: Request) -> dict[str, Any]:
    """What the join page needs before joining, and nothing about who is in the room."""
    with room_lookup(request.app.state.lookup_misses, client_host(request)):
        room = await manager(request).get(code)
    return {"status": room.status, "players": len(room.players)}


@router.delete("/{code}", status_code=204, response_class=Response)
async def delete_room(code: str, body: DeleteRoom, request: Request) -> Response:
    """Remove a room at its host's request; the code is free again immediately.

    The session goes in the body, never in the URL (section 7): a ``DELETE`` with a JSON
    body is the same shape as the ``POST``s around it, and the only other place a token
    ever travels is the first websocket frame. ``bad_session`` and ``not_admin`` are what
    a caller who is not an admin of this room gets, so the room's existence is the only
    thing an unauthenticated request can learn -- and its code was already in their hands.
    """
    with room_lookup(request.app.state.lookup_misses, client_host(request)):
        await manager(request).delete(code, body.session)
    return Response(status_code=204)
