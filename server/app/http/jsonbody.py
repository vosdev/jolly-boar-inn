"""``415 not_json`` for an ``/api/*`` write whose body is not declared ``application/json``.

FastAPI parses a body with no ``Content-Type`` as JSON. A cross-site
``fetch(url, {mode: 'no-cors', method: 'POST', body: blob})`` sends exactly that without a
preflight, so any page could make its visitors join rooms from their own addresses. A
declared ``application/json`` is not a simple content type: the browser has to ask first,
and with no CORS headers here the answer is no.
"""

from email.message import Message

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

WRITES = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class JsonBody:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if (
            scope["type"] == "http"
            and scope["method"] in WRITES
            and (path == "/api" or path.startswith("/api/"))
            and not _is_json(scope)
        ):
            response = JSONResponse(
                {"code": "not_json", "message": "send the body as application/json"},
                status_code=415,
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


def _is_json(scope: Scope) -> bool:
    for name, value in scope["headers"]:
        if name == b"content-type":
            parser = Message()
            parser["content-type"] = value.decode("latin-1")
            return parser.get_content_type() == "application/json"
    return False
