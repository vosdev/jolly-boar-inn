"""A size and nesting cap on ``/api/*`` request bodies, applied before FastAPI parses one.

Without it the whole body is read and ``json.loads``-ed before pydantic's ``max_length``
checks run, and uvicorn sets no limit of its own. The body is read here, counted as it
arrives so a chunked body with no ``Content-Length`` is held to the same cap, then handed
on unchanged.

A suggestion with a picture is the one larger body, and only its route allows one.

A body nested past ``MAX_DEPTH`` is a 422 here: a few thousand levels fit in the size cap,
and the parsing, validation and error echoing after this recurse once per level.
"""

import re

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.suggestion_pictures import MAX_ENCODED

# The largest real body, a create with 20 custom questions, is far below this.
MAX_BODY = 256 * 1024
# A suggested screenshot in base64, and the question around it.
UPLOADS = {("POST", "/api/suggestions"): MAX_ENCODED + MAX_BODY}
# The deepest real body, a custom question envelope, nests well under ten.
MAX_DEPTH = 64


class BodyLimit:
    def __init__(self, app: ASGIApp, limit: int = MAX_BODY) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not (path == "/api" or path.startswith("/api/")):
            await self.app(scope, receive, send)
            return
        limit = UPLOADS.get((scope.get("method", ""), path), self.limit)
        declared = _content_length(scope)
        if declared is not None and declared > limit:
            await self._refuse(scope, receive, send, limit)
            return
        messages: list[Message] = []
        size = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] != "http.request":
                break
            size += len(message.get("body", b""))
            if size > limit:
                await self._refuse(scope, receive, send, limit)
                return
            if not message.get("more_body", False):
                break
        body = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.request")
        if nesting(body) > MAX_DEPTH:
            response = JSONResponse(
                {"code": "too_deep", "message": f"request body nested over {MAX_DEPTH} levels"},
                status_code=422,
            )
            await response(scope, receive, send)
            return
        buffered = iter(messages)

        async def replay() -> Message:
            return next(buffered, None) or await receive()

        await self.app(scope, replay, send)

    async def _refuse(self, scope: Scope, receive: Receive, send: Send, limit: int) -> None:
        response = JSONResponse(
            {"code": "too_large", "message": f"request body over {limit // 1024} KiB"},
            status_code=413,
        )
        await response(scope, receive, send)


# A string, or an unclosed one running to the end, then any bracket. The regex skips a
# picture's megabytes of base64 in C, where a loop over every byte would hold up every room.
_TOKENS = re.compile(rb'"[^"\\]*(?:\\.[^"\\]*)*(?:"|\Z)|[\[\]{}]', re.DOTALL)


def nesting(body: bytes) -> int:
    """How deep the arrays and objects in a JSON text go, strings skipped. Any bytes will do."""
    depth = deepest = 0
    for token in _TOKENS.finditer(body):
        byte = token[0][0]
        if byte in (0x5B, 0x7B):  # [ {
            depth += 1
            deepest = max(deepest, depth)
        elif byte in (0x5D, 0x7D):  # ] }
            depth -= 1
    return deepest


def _content_length(scope: Scope) -> int | None:
    for name, value in scope["headers"]:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None
