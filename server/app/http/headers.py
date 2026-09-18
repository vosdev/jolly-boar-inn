"""Response headers from section 7 of ideas/architecture.md, on every response.

``Referrer-Policy: no-referrer`` and ``X-Content-Type-Options: nosniff`` everywhere;
``Cache-Control: no-store`` on ``/api/*`` (static responses keep their own caching).
Pure ASGI so it wraps every route, exception handler and the static fallback alike.
"""

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class SecurityHeaders:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_api = scope["path"] == "/api" or scope["path"].startswith("/api/")

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Referrer-Policy"] = "no-referrer"
                headers["X-Content-Type-Options"] = "nosniff"
                if is_api:
                    headers["Cache-Control"] = "no-store"
            await send(message)

        await self.app(scope, receive, send_with_headers)
