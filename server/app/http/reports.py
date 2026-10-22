"""``/api/reports`` for players, and ``/api/admin/reports`` for the operator.

Like a suggestion, a report needs no account: the client offers the form only after a
finished game, and the backstop is ``REPORTS_PER_HOUR`` per address. ``GET .../allowance``
lets the form say the limit is reached before it shows its fields, and a report is checked
before the limiter counts it, so a typo costs no quota.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from app import reports
from app.http.admin import require_token
from app.http.ratelimit import client_key

router = APIRouter(prefix="/api/reports")
admin_router = APIRouter(prefix="/api/admin/reports", dependencies=[Depends(require_token)])


class Report(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: str = Field(max_length=64)
    question: str | None = Field(default=None, max_length=64)
    item: int | None = Field(default=None, strict=True)
    # ``reports.check`` holds it to ``TEXT_MAX``; this only bounds what is read.
    text: str = Field(max_length=4 * reports.TEXT_MAX)


class StatusChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: reports.Status


def _host(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("/allowance")
async def allowance(request: Request) -> dict[str, Any]:
    """How many more this address may send this hour, and when the next frees up if none."""
    left, retry_at = request.app.state.reports.left(client_key(_host(request)))
    return {"left": left, "retry_at": retry_at}


@router.post("", status_code=201)
async def report(body: Report, request: Request) -> dict[str, Any]:
    snapshot, text = reports.check(
        request.app.state.packs,
        request.app.state.settings,
        body.mode,
        body.question,
        body.item,
        body.text,
    )
    request.app.state.reports.check(
        client_key(_host(request)), "too many reports from this address, try again later"
    )
    pool = await request.app.state.database()
    return {"id": await reports.add(pool, body.mode, body.question, snapshot, text)}


@admin_router.get("")
async def queue(request: Request, status: reports.Status = "open") -> dict[str, Any]:
    pool = await request.app.state.database()
    return await reports.listing(pool, status)


@admin_router.post("/{report}/status")
async def change_status(report: UUID, body: StatusChange, request: Request) -> dict[str, Any]:
    pool = await request.app.state.database()
    return await reports.set_status(pool, report, body.status)
