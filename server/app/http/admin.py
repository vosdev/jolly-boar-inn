"""``GET /api/admin/rooms`` and ``GET /api/admin/stats``: is the instance healthy.

``main.py`` mounts this router only when ``ADMIN_TOKEN`` is set. Every route wants that
token as ``Authorization: Bearer``, compared in constant time.

What leaves here is chosen field by field, never a room or player view passed through: an
operator needs to see the box is healthy, not read a clan's names, answers or questions.
"""

import hmac
import logging
from collections.abc import Callable
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app import stats
from app.errors import ApiError
from app.http.ratelimit import RateLimiter, client_key
from app.rooms import codes
from app.rooms.models import Room
from app.rooms.state import RoomManager

log = logging.getLogger("app.http")


class Unauthorized(ApiError):
    status, code = 401, "unauthorized"
    headers = {"WWW-Authenticate": "Bearer"}


def _admin_bearer(request: Request) -> bool:
    expected: str = request.app.state.settings.admin_token
    scheme, _, given = request.headers.get("authorization", "").partition(" ")
    # Headers arrive as latin-1, so encoding back gives the bytes that were sent.
    sent = given.strip().encode("latin-1")
    return hmac.compare_digest(sent, expected.encode("ascii")) and scheme.lower() == "bearer"


def guarded_bearer(request: Request, kind: str, matches: Callable[[Request], bool]) -> bool:
    """Whether ``matches`` accepts the request's bearer, under the address's failure budget.

    An address that has spent it is refused before anything is compared, so a guess that
    happens to be right is refused too and the guessing learns nothing until the window
    frees up. Only a wrong guess is charged and logged: the operator pays nothing.
    """
    failures: RateLimiter = request.app.state.auth_failures
    host = request.client.host if request.client else ""
    key = client_key(host)
    failures.refuse_if_spent(key, "too many failed tokens from this address, try again later")
    if matches(request):
        return True
    failures.allow(key)
    # The route template, not the raw path: a request can carry anything in its path.
    route = getattr(request.scope.get("route"), "path", None) or "unmatched"
    log.warning("failed %s token from %s on %s", kind, host, route)
    return False


def is_operator(request: Request) -> bool:
    """Whether the request carries the operator's token; false when none is configured.

    Only a request that sends ``Authorization`` is trying a token, so a player who sends
    none is neither charged nor logged.
    """
    expected: str = request.app.state.settings.admin_token
    if expected == "" or "authorization" not in request.headers:
        return False
    return guarded_bearer(request, "admin", _admin_bearer)


def require_token(request: Request) -> None:
    """Refuse the request unless it carries the operator's token; any other is a failure."""
    if not guarded_bearer(request, "admin", _admin_bearer):
        raise Unauthorized("a valid admin token is required")


router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_token)])


class LiveRound(BaseModel):
    index: int  # 0-based
    total: int
    mode: str


class LiveRoom(BaseModel):
    code: str
    status: str
    round: LiveRound | None
    connected: int
    players: int
    # Brought back after a restart and not resumed until a player returns.
    waiting: bool
    created_at: datetime
    # When cleanup will delete it: at expiry, or a finished room's grace after its end.
    deletes_at: datetime


class Live(BaseModel):
    rooms: list[LiveRoom]
    sockets: int


class Count(BaseModel):
    day: date
    metric: str
    key: str
    count: int


class History(BaseModel):
    counts: list[Count]


def live_room(room: Room, grace: timedelta) -> LiveRoom:
    """What the admin page shows of one room in memory."""
    segment = room.current_segment if room.status == "playing" else None
    deletes_at = room.expires_at
    if room.finished_at is not None:
        deletes_at = min(deletes_at, room.finished_at + grace)
    return LiveRoom(
        code=codes.cased(room.code),
        status=room.status,
        round=None
        if segment is None
        else LiveRound(index=segment.index, total=segment.total, mode=segment.mode),
        connected=sum(player.connected for player in room.players.values()),
        players=len(room.players),
        waiting=room.awaiting_player,
        created_at=room.created_at,
        deletes_at=deletes_at,
    )


@router.get("/rooms")
async def rooms(request: Request) -> Live:
    # Nothing awaits between the first room and the last, so this is one moment's picture.
    manager: RoomManager = request.app.state.rooms
    grace = timedelta(minutes=manager.settings.finished_room_grace_minutes)
    in_memory = sorted(manager.rooms.values(), key=lambda room: room.created_at, reverse=True)
    return Live(
        rooms=[live_room(room, grace) for room in in_memory],
        sockets=sum(len(room.sockets) for room in in_memory),
    )


@router.get("/stats")
async def daily(request: Request) -> History:
    pool = await request.app.state.database()
    return History(counts=[Count(**row) for row in await stats.history(pool)])
