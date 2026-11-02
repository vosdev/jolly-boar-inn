"""``GET /api/daily``, ``POST /api/daily`` and ``POST /api/daily/result``: the day's set,
played alone and once."""

from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.daily import day_of, next_opens, number_of
from app.errors import ApiError
from app.http.ratelimit import client_key
from app.http.rooms import client_host, manager
from app.rooms.daily_room import DailyNotOpen, DailyPlayed, DailyResult

router = APIRouter(prefix="/api/daily")


class StartDaily(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The browser's own random token, kept across days: one attempt per token per day.
    token: str = Field(min_length=16, max_length=200, strict=True)
    # As on ``CreateRoom``: the profile's name, or one the browser made up.
    display_name: str = Field(max_length=200)
    avatar: str | None = Field(default=None, max_length=64, strict=True)


class ResultOf(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=16, max_length=200, strict=True)
    # The attempt's own day, which is yesterday for one that ran past the rollover.
    day: date


class NoResult(ApiError):
    status, code = 404, "no_result"


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
    """Today's day and number, and when the next opens, before anything is started."""
    day = day_of(datetime.now(UTC))
    first_day = request.app.state.settings.daily_first_day
    if day < first_day:
        raise DailyNotOpen("the daily has not opened yet")
    return {
        "day": day,
        "number": number_of(day, first_day),
        "next_at": next_opens(day).isoformat(),
    }


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


@router.post("/result")
async def result(body: ResultOf, request: Request) -> dict[str, Any]:
    """This token's finished attempt on ``day``, for the end screen; it starts nothing."""
    found = await manager(request).daily_result(body.token, body.day, datetime.now(UTC))
    if found is None:
        raise NoResult("no finished daily for that day")
    return result_view(found)
