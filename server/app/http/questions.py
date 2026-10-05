"""``GET /api/questions``: what the report form searches; ``/api/admin/questions``: whole ones.

The player's list names each question without its answer (``reports.label``), or lists
the roster's items for a price mode. The packs are public in the repository, so the list
gives nothing away that a reveal would not. The admin route returns pack questions whole,
answers included, behind ``ADMIN_TOKEN`` like the rest of ``/api/admin``.
"""

from typing import Any

from fastapi import APIRouter, Depends, Request

from app import reports
from app.http.admin import require_token
from app.questions.packs import mode_questions

router = APIRouter(prefix="/api/questions")
admin_router = APIRouter(prefix="/api/admin/questions", dependencies=[Depends(require_token)])


@router.get("/modes")
def modes(request: Request) -> list[str]:
    """The modes a player may report from, in registry order."""
    return reports.report_modes(request.app.state.settings)


@router.get("")
def choices(mode: str, request: Request) -> dict[str, Any]:
    if mode not in reports.report_modes(request.app.state.settings):
        raise reports.BadMode(f"{mode!r} is not a mode with pack questions here")
    return reports.choices(request.app.state.packs, mode)


@admin_router.get("")
def questions(mode: str, request: Request) -> dict[str, Any]:
    if mode not in reports.pack_modes():
        raise reports.BadMode(f"{mode!r} is not a mode with pack questions")
    return {"questions": mode_questions(request.app.state.packs, mode)}
