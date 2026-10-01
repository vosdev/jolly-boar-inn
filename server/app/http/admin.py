"""``GET /api/admin/rooms`` and ``GET /api/admin/stats``: is the instance healthy.

``main.py`` mounts this router only when ``ADMIN_TOKEN`` is set. Every route wants that
token as ``Authorization: Bearer``, compared in constant time.

What leaves here is chosen field by field, never a room or player view passed through: an
operator needs to see the box is healthy, not read a clan's names, answers or questions.
"""

import hmac
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app import stats
from app.errors import ApiError
from app.rooms.state import Room, RoomManager


class Unauthorized(ApiError):
    status, code = 401, "unauthorized"
    headers = {"WWW-Authenticate": "Bearer"}


def require_token(request: Request) -> None:
    """Refuse the request unless it carries the operator's token."""
    expected: str = request.app.state.settings.admin_token
    scheme, _, given = request.headers.get("authorization", "").partition(" ")
    # Headers arrive as latin-1, so encoding back gives the bytes that were sent.
    sent = given.strip().encode("latin-1")
    if not hmac.compare_digest(sent, expected.encode("ascii")) or scheme.lower() != "bearer":
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
        code=room.code,
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
