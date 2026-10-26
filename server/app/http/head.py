"""``HEAD`` under ``/api`` answers as the ``GET`` it mirrors, without the body.

FastAPI registers a ``GET`` route for ``GET`` alone, so a ``HEAD`` fell through to the
static catch-all, which 404s anything under ``/api``. Uptime checkers and ``curl -I`` send
``HEAD``. Running it as ``GET`` here, once, covers every route present and future, and
keeps the ``GET``'s status and headers, ``Content-Length`` included, as HTTP asks. A path
with no ``GET`` gets the router's own 404 or 405.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send


class HeadAsGet:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if not (
            scope["type"] == "http"
            and scope["method"] == "HEAD"
            and (path in ("/api", "/metrics") or path.startswith("/api/"))
        ):
            await self.app(scope, receive, send)
            return

        async def send_without_body(message: Message) -> None:
            if message["type"] == "http.response.body":
                if message.get("more_body", False):
                    return
                message = {"type": "http.response.body", "body": b"", "more_body": False}
            await send(message)

        await self.app({**scope, "method": "GET"}, receive, send_without_body)
