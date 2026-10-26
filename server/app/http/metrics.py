"""``GET /metrics`` and the HTTP request metrics middleware.

``main.py`` mounts this router only when ``METRICS_TOKEN`` is set. Every scrape wants that
token as ``Authorization: Bearer``, compared in constant time like ``ADMIN_TOKEN``.
"""

import hmac
import time

from fastapi import APIRouter, Depends, Request, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app import metrics
from app.http.admin import Unauthorized


def require_metrics_token(request: Request) -> None:
    """Refuse the scrape unless it carries ``METRICS_TOKEN``."""
    expected: str = request.app.state.settings.metrics_token
    scheme, _, given = request.headers.get("authorization", "").partition(" ")
    sent = given.strip().encode("latin-1")
    if not hmac.compare_digest(sent, expected.encode("ascii")) or scheme.lower() != "bearer":
        raise Unauthorized("a valid metrics token is required")


router = APIRouter(dependencies=[Depends(require_metrics_token)])


@router.get("/metrics", include_in_schema=False)
async def scrape(request: Request) -> Response:
    return Response(metrics.render(request.app), media_type=metrics.CONTENT_TYPE_LATEST)


class HttpMetrics:
    """Count and time every HTTP request by its matched route template, never the raw URL."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status = 500

        async def record_status(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, record_status)
        finally:
            elapsed = time.perf_counter() - started
            route = getattr(scope.get("route"), "path", None) or "unmatched"
            metrics.HTTP_REQUESTS.labels(route=route, status=str(status)).inc()
            metrics.HTTP_DURATION.labels(route=route).observe(elapsed)
