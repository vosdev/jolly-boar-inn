"""``GET /api/daily`` and ``POST /api/daily``: the day's set, played alone and once."""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.daily import day_of, number_of
from app.http.ratelimit import client_key
from app.http.rooms import client_host, manager
from app.rooms.daily_room import DailyPlayed, DailyResult

router = APIRouter(prefix="/api/daily")


class StartDaily(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The browser's own random token, kept across days: one attempt per token per day.
    token: str = Field(min_length=16, max_length=200, strict=True)
    # As on ``CreateRoom``: the profile's name, or one the browser made up.
    display_name: str = Field(max_length=200)
    avatar: str | None = Field(default=None, max_length=64, strict=True)


def result_view(result: DailyResult) -> dict[str, Any]:
    """A finished attempt as the end screen reads it."""
    return {
        "day": result.day.isoformat(),
        "number": result.number,
        "points": result.points,
        "correct": result.correct,
        "results": result.results,
    }


@router.get("")
async def today(request: Request) -> dict[str, Any]:
    """Today's day and number, before anything is started."""
    day = day_of(datetime.now(UTC))
    return {"day": day, "number": number_of(day, request.app.state.settings.daily_first_day)}


@router.post("", response_model=None)
async def start(body: StartDaily, request: Request) -> dict[str, Any] | JSONResponse:
    """Start this token's attempt, or resume its unfinished one: a room code and a session.

    Today's finished attempt is a 409 carrying its result, so a second visit shows it.
    """
    limiter = request.app.state.dailies
    key = client_key(client_host(request))
    try:
        code, session = await manager(request).start_daily(
            body.token,
            body.display_name,
            body.avatar,
            datetime.now(UTC),
            lambda: limiter.check(key, "too many dailies started from this address"),
        )
    except DailyPlayed as played:
        return JSONResponse(
            {"code": played.code, "message": played.message, "result": result_view(played.result)},
            status_code=played.status,
        )
    return {"code": code, "session": session}
