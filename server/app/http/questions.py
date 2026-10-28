"""``GET /api/questions``: what Report and Suggest list; ``/api/admin/questions``: whole ones.

The player's list names each question without its answer (``reports.label``), or lists
the roster's items for a price mode. The packs are public in the repository, so the list
gives nothing away that a reveal would not. The admin routes return pack questions whole,
answers included, with how players score on each (``app/question_stats.py``), and queue
the operator's edits of them (``app/question_edits.py``), behind ``ADMIN_TOKEN`` like the
rest of ``/api/admin``.
"""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app import question_edits, question_stats, reports
from app.http.admin import require_token
from app.questions.packs import mode_questions

router = APIRouter(prefix="/api/questions")
admin_router = APIRouter(prefix="/api/admin/questions", dependencies=[Depends(require_token)])
changes_router = APIRouter(
    prefix="/api/admin/question-changes", dependencies=[Depends(require_token)]
)


@router.get("/modes")
def modes(request: Request) -> list[str]:
    """The modes a player may report from, in registry order."""
    state = request.app.state
    return reports.report_modes(state.settings, state.packs, state.rooms.pictures)


@router.get("")
def choices(mode: str, request: Request) -> dict[str, Any]:
    state = request.app.state
    if mode not in reports.report_modes(state.settings, state.packs, state.rooms.pictures):
        raise reports.BadMode(f"{mode!r} is not a mode with pack questions here")
    return reports.choices(request.app.state.packs, mode)


@admin_router.get("")
def questions(mode: str, request: Request) -> dict[str, Any]:
    if mode not in reports.pack_modes():
        raise reports.BadMode(f"{mode!r} is not a mode with pack questions")
    return {"questions": mode_questions(request.app.state.packs, mode)}


@admin_router.get("/modes")
def editable_modes() -> list[str]:
    """The modes the editor lists, in registry order."""
    return question_edits.edit_modes()


@admin_router.get("/stats")
async def stats(request: Request, mode: str | None = None) -> dict[str, Any]:
    """The editor's questions of ``mode``, or of every mode, each with how players score on it."""
    modes = question_edits.edit_modes()
    if mode is not None:
        if mode not in modes:
            raise reports.BadMode(f"{mode!r} is not a mode the editor lists")
        modes = [mode]
    pool = await request.app.state.database()
    return {"questions": await question_stats.listing(pool, request.app.state.packs, modes)}


class Edit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payload: dict[str, Any]
    difficulty: str | None = None
    wiki: str | None = None
    source_url: str | None = None
    # The schema holds it to a display name; this only bounds what is read.
    credit: str | None = Field(default=None, max_length=200)
    credit_shown: bool | None = Field(default=None, strict=True)


@admin_router.put("/{question_id}")
async def edit(question_id: str, body: Edit, request: Request) -> dict[str, Any]:
    """Queue an edit; a field left out is one the question no longer has."""
    pool = await request.app.state.database()
    given = body.model_dump(exclude_none=True)
    return await question_edits.edit(pool, request.app.state.packs, question_id, given)


@admin_router.delete("/{question_id}")
async def delete(question_id: str, request: Request) -> dict[str, Any]:
    pool = await request.app.state.database()
    return await question_edits.delete(pool, request.app.state.packs, question_id)


@changes_router.get("")
async def changes(request: Request) -> dict[str, Any]:
    pool = await request.app.state.database()
    return await question_edits.listing(pool, request.app.state.packs)


@changes_router.delete("/{question_id}")
async def discard(question_id: str, request: Request) -> dict[str, str]:
    pool = await request.app.state.database()
    await question_edits.discard(pool, question_id)
    return {"discarded": question_id}


@changes_router.post("/export")
async def export(request: Request) -> JSONResponse:
    """The file for ``make edit-packs``. Every change it holds is marked exported."""
    pool = await request.app.state.database()
    file = await question_edits.export(pool)
    name = f"question-changes-{datetime.now(UTC).date().isoformat()}.json"
    return JSONResponse(file, headers={"Content-Disposition": f'attachment; filename="{name}"'})


@changes_router.post("/applied")
async def applied(request: Request) -> dict[str, int]:
    """Drop the exported changes, once the operator has applied them to the packs."""
    pool = await request.app.state.database()
    return {"applied": await question_edits.mark_applied(pool)}
