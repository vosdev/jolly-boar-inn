"""``/api/admin/roster``: the popular items whole, and the operator's pending changes to them.

The changes queue in ``app/roster_edits.py`` and reach ``data/popular-items.json`` through
``make edit-roster``. Behind ``ADMIN_TOKEN`` like the rest of ``/api/admin``.
"""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from app import roster_edits
from app.http.admin import require_token

admin_router = APIRouter(prefix="/api/admin/roster", dependencies=[Depends(require_token)])
changes_router = APIRouter(
    prefix="/api/admin/roster-changes", dependencies=[Depends(require_token)]
)


@admin_router.get("")
def items() -> dict[str, Any]:
    return {"items": roster_edits.roster()}


class Rename(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Held to an item name's rules by ``roster_edits``; this only bounds what is read.
    name: str


@admin_router.put("/{item_id}")
async def rename(item_id: int, body: Rename, request: Request) -> dict[str, Any]:
    """Queue a rename."""
    pool = await request.app.state.database()
    return await roster_edits.rename(pool, item_id, body.name)


@admin_router.delete("/{item_id}")
async def remove(item_id: int, request: Request) -> dict[str, Any]:
    """Queue a removal."""
    pool = await request.app.state.database()
    return await roster_edits.remove(pool, item_id)


@changes_router.get("")
async def changes(request: Request) -> dict[str, Any]:
    pool = await request.app.state.database()
    return await roster_edits.listing(pool)


@changes_router.delete("/{item_id}")
async def discard(item_id: int, request: Request) -> dict[str, int]:
    pool = await request.app.state.database()
    await roster_edits.discard(pool, item_id)
    return {"discarded": item_id}


@changes_router.post("/export")
async def export(request: Request) -> JSONResponse:
    """The file for ``make edit-roster``. Every change it holds is marked exported."""
    pool = await request.app.state.database()
    file = await roster_edits.export(pool)
    name = f"roster-changes-{datetime.now(UTC).date().isoformat()}.json"
    return JSONResponse(file, headers={"Content-Disposition": f'attachment; filename="{name}"'})


@changes_router.post("/applied")
async def applied(request: Request) -> dict[str, int]:
    """Drop the exported changes, once the operator has applied them to the roster."""
    pool = await request.app.state.database()
    return {"applied": await roster_edits.mark_applied(pool)}
