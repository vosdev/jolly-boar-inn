"""``POST /api/rooms/{code}/join``."""

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from app.http.rooms import manager

router = APIRouter(prefix="/api/rooms")


class Join(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(max_length=200)
    avatar: int | None = Field(default=None, ge=0, le=32767, strict=True)  # as on ``CreateRoom``


@router.post("/{code}/join")
async def join(code: str, body: Join, request: Request) -> dict[str, Any]:
    player, session = await manager(request).join(code, body.display_name, body.avatar)
    return {"session": session, "player": player.view()}
