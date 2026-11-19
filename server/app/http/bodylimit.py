"""A size and nesting cap on ``/api/*`` request bodies, applied before FastAPI parses one.

Without it the whole body is read and ``json.loads``-ed before pydantic's ``max_length``
checks run, and uvicorn sets no limit of its own. The body is read here, counted as it
arrives so a chunked body with no ``Content-Length`` is held to the same cap, then handed
on unchanged.

A suggestion with a picture is the one larger body, and only its route allows one.

A body nested past ``MAX_DEPTH`` is a 422 here: a few thousand levels fit in the size cap,
and the parsing, validation and error echoing after this recurse once per level.
"""

from itertools import accumulate, repeat
from operator import add, sub

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.http.ratelimit import OpenCount, client_key
from app.suggestion_pictures import MAX_ENCODED

# The largest real body, a create with 20 custom questions, is far below this.
MAX_BODY = 256 * 1024
# A suggested screenshot in base64, and the question around it.
UPLOADS = {("POST", "/api/suggestions"): MAX_ENCODED + MAX_BODY}
# Bodies over ``MAX_BODY`` held at once, each a few times its size in memory until its
# request ends: from one address, and from everyone.
UPLOADS_PER_ADDRESS = 1
UPLOADS_AT_ONCE = 4
# The deepest real body, a custom question envelope, nests well under ten.
MAX_DEPTH = 64


class BodyLimit:
    def __init__(self, app: ASGIApp, limit: int = MAX_BODY) -> None:
        self.app = app
        self.limit = limit
        self.uploads = OpenCount(UPLOADS_PER_ADDRESS)
        self.all_uploads = OpenCount(UPLOADS_AT_ONCE)

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
        held: list[tuple[OpenCount, str]] = []
        try:
            await self._read(scope, receive, send, limit, declared, held)
        finally:
            for count, key in held:
                count.leave(key)

    async def _read(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
        limit: int,
        declared: int | None,
        held: list[tuple[OpenCount, str]],
    ) -> None:
        if declared is not None and declared > self.limit and not self._enter(scope, held):
            await self._busy(scope, receive, send)
            return
        chunks: list[bytes] = []
        size = 0
        while True:
            message = await receive()
            if message["type"] != "http.request":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > limit:
                await self._refuse(scope, receive, send, limit)
                return
            if size > self.limit and not held and not self._enter(scope, held):
                await self._busy(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        del chunks, chunk, message
        if nesting(body) > MAX_DEPTH:
            response = JSONResponse(
                {"code": "too_deep", "message": f"request body nested over {MAX_DEPTH} levels"},
                status_code=422,
            )
            await response(scope, receive, send)
            return
        # One message with the whole body, let go of once it is handed on: the app keeps its
        # own copy, and a second one here would double what a large upload holds.
        pending: list[Message] = [{"type": "http.request", "body": body, "more_body": False}]
        del body

        async def replay() -> Message:
            return pending.pop() if pending else await receive()

        await self.app(scope, replay, send)

    def _enter(self, scope: Scope, held: list[tuple[OpenCount, str]]) -> bool:
        """Count one more large upload from this address; ``False`` past either cap."""
        client = scope.get("client")
        key = client_key(client[0]) if client else ""
        for count, name in ((self.uploads, key), (self.all_uploads, "")):
            if not count.enter(name):
                return False
            held.append((count, name))
        return True

    async def _busy(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            {"code": "uploads_busy", "message": "too many uploads at once, try again"},
            status_code=503,
        )
        await response(scope, receive, send)

    async def _refuse(self, scope: Scope, receive: Receive, send: Send, limit: int) -> None:
        response = JSONResponse(
            {"code": "too_large", "message": f"request body over {limit // 1024} KiB"},
            status_code=413,
        )
        await response(scope, receive, send)


# Only the quotes and brackets matter to the depth.
_NOT_MARKS = bytes(range(256)).translate(None, b'"[]{}')
_PARENS = bytes.maketrans(b"[]{}", b"()()")
# A pass deletes every innermost pair at once, which costs a scan of what is left. Once fewer
# than one in this many bytes is an innermost pair, walking the peaks between them is cheaper.
_PEAKS_GAP = 12


def nesting(body: bytes) -> int:
    """How deep the arrays and objects in a JSON text go, strings skipped. Any bytes will do.

    Exact for JSON up to ``MAX_DEPTH`` and ``MAX_DEPTH + 1`` past it; bytes that are not JSON
    may count deeper than they go. Each step runs in C over the whole body, so megabytes of
    brackets or tiny strings cannot hold up the event loop, and with it every room.
    """
    if b"\\" in body:
        # Pairs first, so an escaped backslash cannot escape the quote after it.
        body = body.replace(b"\\\\", b"").replace(b'\\"', b"")
    # Deleting two quotes side by side keeps every bracket on its side of a string's edge.
    marks = body.translate(None, _NOT_MARKS).replace(b'""', b"")
    if b'"' in marks:
        # The text between the 1st and 2nd quote, the 3rd and 4th and so on is in a string,
        # and an odd last quote opens one that runs to the end.
        marks = b"".join(marks.split(b'"')[::2])
    brackets = marks.translate(_PARENS)
    passes = 0
    while passes <= MAX_DEPTH:
        if b"(" * (MAX_DEPTH + 1 - passes) in brackets:
            return MAX_DEPTH + 1
        innermost = brackets.count(b"()")
        if innermost == 0 or innermost * _PEAKS_GAP < len(brackets):
            return passes + _deepest_peak(brackets)
        # Each pass takes the depth of JSON down by exactly one.
        brackets = brackets.replace(b"()", b"")
        passes += 1
    return passes


def _deepest_peak(brackets: bytes) -> int:
    """The highest the depth gets over ``(`` and ``)``, from a run of openers to the next."""
    hills = brackets.replace(b")(", b") (").split(b" ")
    rises = list(map(bytes.count, hills, repeat(b"(")))
    falls = map(bytes.count, hills, repeat(b")"))
    # One start more than there are hills: the depth after the last one, never a peak.
    starts = accumulate(map(sub, rises, falls, strict=True), initial=0)
    return max(0, max(map(add, starts, rises, strict=False)))


def _content_length(scope: Scope) -> int | None:
    for name, value in scope["headers"]:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None
