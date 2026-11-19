"""``POST /api/rooms``, ``GET /api/rooms/free-code``,
``GET /api/rooms/public``, ``GET /api/rooms/{code}``,
``POST /api/rooms/{code}/questions``, ``DELETE /api/rooms/{code}``."""

from collections import Counter
from typing import Any, Self
from uuid import UUID

from fastapi import APIRouter, Request, Response
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.errors import ApiError
from app.http.ratelimit import client_key, room_lookup
from app.modes import offered
from app.rooms import codes
from app.rooms.errors import BadQuestion
from app.rooms.models import Room, normalize_name
from app.rooms.settings import MAX_QUESTIONS_PER_ROOM, NewRoomSettings
from app.rooms.state import RoomManager
from app.stats import Arrival, Device, Theme

router = APIRouter(prefix="/api/rooms")


class CreateRoom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The creator is the room's admin, so the name is needed up front. 200 is the outer
    # bound on what is worth reading; ``normalize_name`` holds it to 1-``NAME_MAX``.
    display_name: str = Field(max_length=200)
    # A pet's id from ``data/pets.json``. Optional: the server picks one if none is sent.
    avatar: str | None = Field(default=None, max_length=64, strict=True)
    # Whether this browser had a profile when the page loaded. Counted, never stored.
    returning: bool = Field(strict=True)
    # Sent only the first time this browser reports each. Counted, never stored.
    theme: Theme | None = None
    device: Device | None = None
    # Only a link carrying the room's key joins it. Not a setting: settings reach everyone.
    invite_only: bool = Field(default=False, strict=True)
    # Listed on Home for anyone to join; a key would defeat that, so it excludes one.
    public: bool = Field(default=False, strict=True)
    # The code the create page showed, from ``free-code``. Left out, the server draws one.
    code: str | None = Field(default=None, max_length=40, strict=True)
    settings: NewRoomSettings = Field(default_factory=NewRoomSettings)
    # The host's own questions, each a random event in a round it does not belong to. The
    # bound is only the outer one; the start decides how many this room has room for.
    # Checked by ``create``, after the attempt is counted: a bank of them is the dear part.
    custom_questions: list[dict[str, Any]] = Field(
        default_factory=list, max_length=MAX_QUESTIONS_PER_ROOM
    )

    @model_validator(mode="after")
    def _public_or_keyed(self) -> Self:
        if self.public and self.invite_only:
            raise ValueError("a public room cannot be invite-only")
        return self


class SetQuestions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session: str = Field(max_length=200)  # as on ``DeleteRoom``
    # Checked once the session is an admin's in a lobby, so a stranger's bank costs nothing.
    custom_questions: list[dict[str, Any]] = Field(max_length=MAX_QUESTIONS_PER_ROOM)


class DeleteRoom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # A session token is 32 random bytes urlsafe-encoded; the bound is only there so an
    # oversized body is refused before it is compared against anything.
    session: str = Field(max_length=200)


def manager(request: Request) -> RoomManager:
    return request.app.state.rooms


def client_host(request: Request) -> str:
    return request.client.host if request.client else ""


class ModeNotOffered(ApiError):
    status, code = 403, "mode_not_offered"


class CrossSite(ApiError):
    status = 403


def refused_questions(exc: BadQuestion) -> RequestValidationError:
    """A bad question as the 422 it was when the body's parsing checked it."""
    return RequestValidationError(
        [
            {
                "type": "value_error",
                "loc": ("body", "custom_questions"),
                "msg": f"Value error, {exc.message}",
            }
        ]
    )


def refuse_cross_site(request: Request) -> None:
    """403 for a lookup another site's page made, before it costs the visitor's address.

    An ``<img>`` on any page is a GET with no preflight, so without this every visitor of
    that page would spend their address's miss budget, and their pub's with it.
    """
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise CrossSite("look a room up from this site")


@router.post("", status_code=201)
async def create_room(body: CreateRoom, request: Request) -> dict[str, Any]:
    ip = client_host(request)
    state = request.app.state
    state.room_attempts.check(
        client_key(ip), "too many attempts to create a room from this address, try again later"
    )
    available = {mode.id for mode in offered(state.settings, state.packs, state.rooms.pictures)}
    # A surprise room's modes are drawn from the offered ones, so it names none of its own.
    picked = [] if body.settings.surprise_modes else body.settings.modes
    unavailable = [e.mode for e in picked if e.mode not in available]
    if unavailable:
        # Like a bad name, before the limiter has counted the attempt.
        raise ModeNotOffered(f"this server does not offer {', '.join(unavailable)}")
    # Before the limiter, which records a hit on every call it allows: a handful of
    # typos in the name field should not cost a host their hourly quota.
    name = normalize_name(body.display_name)
    manager(request).check_avatar(body.avatar)
    manager(request).check_code(body.code)
    try:
        room, player, session = await manager(request).create(
            name,
            body.settings,
            body.custom_questions,
            body.avatar,
            body.returning,
            body.invite_only,
            body.public,
            Arrival(theme=body.theme, device=body.device),
            body.code,
            client_key(ip),
            charge=lambda: state.ratelimiter.check(
                client_key(ip), "too many rooms created from this address, try again later"
            ),
        )
    except BadQuestion as exc:
        raise refused_questions(exc) from None
    # ``expires_at`` lets the host's "rooms you created" list drop a room once its code
    # may belong to someone else.
    return {
        "code": codes.cased(room.code),
        "session": session,
        "player": player.view(),
        "expires_at": room.expires_at,
    }


class PublicHost(BaseModel):
    id: UUID
    display_name: str
    avatar: str | None


class PublicRoom(BaseModel):
    """One room on Home's list: only what joining it would show anyway."""

    code: str
    host: PublicHost
    players: int
    max_players: int
    rounds: int
    # Left out of a room with ``hide_rounds``, whose lobby names none either.
    modes: list[str] | None = None


PUBLIC_ROOMS_MAX = 50
# Rooms from one creating address, so a script cannot push everyone else's off the list.
PUBLIC_ROOMS_PER_ADDRESS = 2
# Long enough that a crowd of open Home pages costs one walk over the rooms per window.
PUBLIC_ROOMS_TTL = 5.0


def public_room(room: Room) -> PublicRoom:
    host = next(p for p in room.players.values() if p.role == "admin")
    return PublicRoom(
        code=codes.cased(room.code),
        host=PublicHost(id=host.id, display_name=host.display_name, avatar=host.avatar),
        players=len(room.players),
        max_players=room.max_players,
        rounds=room.round_count,
        **({} if room.settings.hide_rounds else {"modes": [m.mode for m in room.settings.modes]}),
    )


def listable(room: Room) -> bool:
    """Public, joinable, and somebody is there to play with."""
    return (
        room.public
        and room.status == "lobby"
        and len(room.players) < room.max_players
        and any(player.connected for player in room.players.values())
    )


def public_rooms(rooms: RoomManager) -> list[PublicRoom]:
    """The listable rooms in memory, newest first, a few from any one creating address.

    Memory rather than Postgres, because a lobby nobody is connected to is not worth a
    stranger's visit, and a room only has connected players while it is in memory. Which
    rooms make the cut prefers those somebody has already joined, then the newest.
    """
    preferred = sorted(
        filter(listable, rooms.rooms.values()),
        key=lambda room: (len(room.players) > 1, room.created_at),
        reverse=True,
    )
    per_address: Counter[str] = Counter()
    kept: list[Room] = []
    for room in preferred:
        if len(kept) == PUBLIC_ROOMS_MAX:
            break
        if room.creator_key is not None:
            if per_address[room.creator_key] == PUBLIC_ROOMS_PER_ADDRESS:
                continue
            per_address[room.creator_key] += 1
        kept.append(room)
    kept.sort(key=lambda room: room.created_at, reverse=True)
    return [public_room(room) for room in kept]


@router.get("/free-code")
async def free_code(request: Request) -> dict[str, str]:
    """A code no room holds right now, for the create page to show and send back."""
    request.app.state.free_codes.check(
        client_key(client_host(request)),
        "too many room codes asked for, try again in a few seconds",
    )
    return {"code": codes.cased(await manager(request).free_code())}


@router.get("/public", response_model_exclude_unset=True)
async def list_public_rooms(request: Request) -> list[PublicRoom]:
    """Home's list of rooms anyone may join, shared by every caller for a few seconds."""
    rooms = manager(request)
    if not rooms.settings.public_rooms:
        return []
    now = rooms.clock()
    cached: tuple[float, list[PublicRoom]] | None = getattr(request.app.state, "public_rooms", None)
    if cached is None or now >= cached[0]:
        cached = (now + PUBLIC_ROOMS_TTL, public_rooms(rooms))
        request.app.state.public_rooms = cached
    return cached[1]


@router.get("/{code}")
async def get_room(code: str, request: Request) -> dict[str, Any]:
    """What the join page needs before joining, and nothing about who is in the room."""
    refuse_cross_site(request)
    with room_lookup(request.app.state.lookup_misses, client_host(request)):
        room = await manager(request).get_listed(code)
    return {"status": room.status, "players": len(room.players)}


@router.post("/{code}/questions", status_code=204, response_class=Response)
async def set_questions(code: str, body: SetQuestions, request: Request) -> Response:
    """Replace the host's own questions in a lobby; the session is in the body, as on delete."""
    request.app.state.question_changes.check(
        client_key(client_host(request)),
        "too many question changes from this address, try again later",
    )
    with room_lookup(request.app.state.lookup_misses, client_host(request)):
        try:
            await manager(request).set_questions(code, body.session, body.custom_questions)
        except BadQuestion as exc:
            raise refused_questions(exc) from None
    return Response(status_code=204)


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
