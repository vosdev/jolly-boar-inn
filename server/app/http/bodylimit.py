"""A size cap on ``/api/*`` request bodies, applied before FastAPI reads and parses one.

Without it the whole body is read and ``json.loads``-ed before pydantic's ``max_length``
checks run, and uvicorn sets no limit of its own. The body is read here, counted as it
arrives so a chunked body with no ``Content-Length`` is held to the same cap, then handed
on unchanged.
"""

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# The largest real body, a create with 20 custom questions, is far below this.
MAX_BODY = 256 * 1024


class BodyLimit:
    def __init__(self, app: ASGIApp, limit: int = MAX_BODY) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not (path == "/api" or path.startswith("/api/")):
            await self.app(scope, receive, send)
            return
        declared = _content_length(scope)
        if declared is not None and declared > self.limit:
            await self._refuse(scope, receive, send)
            return
        messages: list[Message] = []
        size = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] != "http.request":
                break
            size += len(message.get("body", b""))
            if size > self.limit:
                await self._refuse(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        buffered = iter(messages)

        async def replay() -> Message:
            return next(buffered, None) or await receive()

        await self.app(scope, replay, send)

    async def _refuse(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            {"code": "too_large", "message": f"request body over {self.limit // 1024} KiB"},
            status_code=413,
        )
        await response(scope, receive, send)


def _content_length(scope: Scope) -> int | None:
    for name, value in scope["headers"]:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None
