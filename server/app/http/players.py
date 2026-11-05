"""``POST /api/rooms/{code}/join``, and the join requests of a room without its key:
``POST /api/rooms/{code}/requests``, ``.../requests/poll`` and ``.../requests/cancel``."""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.http.ratelimit import client_key, room_lookup
from app.http.rooms import client_host, manager
from app.stats import Arrival, Device, Route, Theme

router = APIRouter(prefix="/api/rooms")


class Join(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(max_length=200)
    avatar: str | None = Field(default=None, max_length=64, strict=True)  # as on ``CreateRoom``
    returning: bool = Field(strict=True)  # as on ``CreateRoom``
    # From the invite link's fragment. ``token_urlsafe(9)`` is 12 characters; the bound
    # only refuses an oversized body before it is compared.
    key: str | None = Field(default=None, max_length=200)
    theme: Theme | None = None  # as on ``CreateRoom``
    device: Device | None = None  # as on ``CreateRoom``
    # How the player got here, which only the browser knows. Counted, never stored.
    via: Route | None = None

    def arrival(self) -> Arrival:
        return Arrival(theme=self.theme, device=self.device, via=self.via)


class AskToJoin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(max_length=200)
    avatar: str | None = Field(default=None, max_length=64, strict=True)
    returning: bool = Field(strict=True)
    # As on ``Join``, and counted only if an admin lets them in.
    theme: Theme | None = None
    device: Device | None = None
    via: Route | None = None

    def arrival(self) -> Arrival:
        return Arrival(theme=self.theme, device=self.device, via=self.via)


class Ticket(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticket: str = Field(max_length=200)  # as a session is bounded on ``DeleteRoom``


@contextmanager
def joining(request: Request) -> Iterator[None]:
    """Count one join against the address, and refund it if the join fails.

    Charged before the join, like a lookup miss, so a burst of joins cannot all pass the
    check before the first one is counted.
    """
    host = client_host(request)
    with room_lookup(request.app.state.lookup_misses, host):
        key, now = client_key(host), datetime.now(UTC)
        request.app.state.joins.check(key, "too many joins from this address, try again later", now)
        try:
            yield
        except BaseException:
            request.app.state.joins.refund(key, now)
            raise


@router.post("/{code}/join")
async def join(code: str, body: Join, request: Request) -> dict[str, Any]:
    with joining(request):
        player, session = await manager(request).join(
            code, body.display_name, body.avatar, body.returning, body.key, body.arrival()
        )
    return {"session": session, "player": player.view()}


@router.post("/{code}/requests", status_code=201)
async def ask_to_join(code: str, body: AskToJoin, request: Request) -> dict[str, Any]:
    """Ask an invite-only room's admins to let you in without its key.

    Charged as a join, so asking costs a code guesser what joining would. The ticket goes
    in the body of every poll, never in a URL, like a session.
    """
    with joining(request):
        ticket = await manager(request).request_join(
            code,
            body.display_name,
            body.avatar,
            body.returning,
            body.arrival(),
            client_key(client_host(request)),
        )
    return {"ticket": ticket}


@router.post("/{code}/requests/poll")
async def poll_request(code: str, body: Ticket, request: Request) -> dict[str, Any]:
    """``waiting``, or ``accepted`` with the session a join returns; a refusal is an error."""
    with room_lookup(request.app.state.lookup_misses, client_host(request)):
        admitted = await manager(request).poll_request(code, body.ticket)
    if admitted is None:
        return {"status": "waiting"}
    player, session = admitted
    return {"status": "accepted", "session": session, "player": player.view()}


@router.post("/{code}/requests/cancel", status_code=204, response_class=Response)
async def cancel_request(code: str, body: Ticket, request: Request) -> Response:
    with room_lookup(request.app.state.lookup_misses, client_host(request)):
        await manager(request).cancel_request(code, body.ticket)
    return Response(status_code=204)
