"""``/api/suggestions`` for players, and ``/api/admin/suggestions`` for the operator.

A player sends a suggestion with no account: the client shows the form only after a
finished game, which is a courtesy, and the backstop is ``SUGGESTIONS_PER_HOUR`` per
address. ``GET .../allowance`` lets the form say the limit is reached before anything is
typed. As with creating a room, a suggestion is checked before the limiter counts it, so a
typo costs no quota. ``POST .../similar`` names the pack questions one looks like while it
is written, by label alone, under ``SIMILAR_PER_HOUR``.

The admin routes are the one place the server hands out whole questions, answers
included: the operator reviews them there. ``main.py`` mounts them only with
``ADMIN_TOKEN``, behind the same bearer as the rest of ``/api/admin``.
"""

from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app import suggestions
from app.http.admin import require_token
from app.http.ratelimit import RateLimited, client_key
from app.rooms.models import normalize_name

router = APIRouter(prefix="/api/suggestions")
admin_router = APIRouter(prefix="/api/admin/suggestions", dependencies=[Depends(require_token)])


class Suggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: suggestions.Kind
    content: dict[str, Any]
    # ``normalize_name`` holds it to a display name's 1-24; this only bounds what is read.
    credit: str = Field(max_length=200)
    credit_shown: bool = Field(strict=True)


def _host(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("/allowance")
async def allowance(request: Request) -> dict[str, Any]:
    """How many more this address may send this hour, and when the next frees up if none."""
    left, retry_at = request.app.state.suggestions.left(client_key(_host(request)))
    return {"left": left, "retry_at": retry_at}


@router.post("", status_code=201)
async def suggest(body: Suggestion, request: Request) -> dict[str, Any]:
    credit = normalize_name(body.credit)
    content = suggestions.check(body.kind, body.content, body.credit_shown)
    if not request.app.state.suggestions.allow(client_key(_host(request))):
        raise RateLimited("too many suggestions from this address, try again later")
    pool = await request.app.state.database()
    suggestion = await suggestions.add(pool, body.kind, content, credit, body.credit_shown)
    return {"id": suggestion}


class Draft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: dict[str, Any]


@router.post("/similar")
async def similar(body: Draft, request: Request) -> dict[str, Any]:
    """The pack questions a question being written looks like; nothing about suggestions."""
    content = suggestions.check_similar(body.content)
    if not request.app.state.similar.allow(client_key(_host(request))):
        raise RateLimited("too many checks from this address, try again later")
    return {"matches": suggestions.similar_in_packs(request.app.state.packs, content)}


class Edit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: dict[str, Any]
    credit: str = Field(max_length=200)
    credit_shown: bool = Field(strict=True)


class StatusChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["pending", "approved", "rejected"]


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["approved", "imported"]


@admin_router.get("")
async def queue(request: Request, status: suggestions.Status = "pending") -> dict[str, Any]:
    pool = await request.app.state.database()
    return await suggestions.listing(pool, status, request.app.state.packs)


@admin_router.put("/{suggestion}")
async def edit(suggestion: UUID, body: Edit, request: Request) -> dict[str, Any]:
    credit = normalize_name(body.credit)
    pool = await request.app.state.database()
    return await suggestions.edit(pool, suggestion, body.content, credit, body.credit_shown)


@admin_router.post("/{suggestion}/status")
async def change_status(suggestion: UUID, body: StatusChange, request: Request) -> dict[str, Any]:
    pool = await request.app.state.database()
    return await suggestions.set_status(pool, suggestion, body.status)


@admin_router.post("/export")
async def export(body: ExportRequest, request: Request) -> JSONResponse:
    """The file for ``make import-suggestions``. Exporting the approved ones marks them exported."""
    pool = await request.app.state.database()
    file = await suggestions.export(pool, body.status)
    name = f"suggestions-{body.status}-{datetime.now(UTC).date().isoformat()}.json"
    return JSONResponse(file, headers={"Content-Disposition": f'attachment; filename="{name}"'})


@admin_router.post("/imported")
async def imported(request: Request) -> dict[str, int]:
    """Move the exported approved suggestions to imported, once the operator has run the import."""
    pool = await request.app.state.database()
    return {"imported": await suggestions.mark_imported(pool)}
