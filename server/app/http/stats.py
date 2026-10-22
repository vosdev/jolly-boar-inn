"""``POST /api/stats/join-failure``: the browser reporting a join failure it showed.

Only the browser knows which failures a player saw: it retries a taken name by itself, and
a room that is not found may be an old link to a game it still remembers. So the server
counts none of them on its own, and takes the browser's word, as it does for the theme.
"""

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict

from app import stats
from app.http.ratelimit import client_key
from app.http.rooms import client_host

router = APIRouter(prefix="/api/stats")


class JoinFailureReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: stats.JoinFailure


@router.post("/join-failure", status_code=204, response_class=Response)
async def join_failure(body: JoinFailureReport, request: Request) -> Response:
    """Count one join failure the player was shown."""
    request.app.state.join_failures.check(
        client_key(client_host(request)),
        "too many join failures reported from this address, try again later",
    )
    pool = await request.app.state.database()
    async with pool.acquire() as conn, conn.transaction():
        await stats.bump(conn, stats.Metric.JOIN_FAILURES, body.reason)
    return Response(status_code=204)
