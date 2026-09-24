"""One warning per process when ``X-Forwarded-For`` arrives from an address uvicorn ignores.

Behind a proxy that ``FORWARDED_ALLOW_IPS`` does not name, every visitor has the proxy's
address, so they all share one rate-limit bucket. Documenting that has not helped; saying
so in the log the first time it happens does, and the fix is one line in ``.env``.

uvicorn replaces the client address with an entry from ``X-Forwarded-For`` only when it
trusts the sender. So a header whose entries do not include the client address is one
uvicorn ignored.
"""

import logging

from starlette.types import ASGIApp, Receive, Scope, Send

log = logging.getLogger("app.http")


class UntrustedForwardWarning:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.warned = False

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self.warned and scope["type"] in ("http", "websocket"):
            self._check(scope)
        await self.app(scope, receive, send)

    def _check(self, scope: Scope) -> None:
        forwarded = [
            value.decode("latin-1")
            for name, value in scope["headers"]
            if name == b"x-forwarded-for"
        ]
        if not forwarded:
            return
        entries = {entry.strip() for value in forwarded for entry in value.split(",")}
        client = scope.get("client")
        host = client[0] if client else ""
        if host in entries:
            return
        self.warned = True
        log.warning(
            "ignoring X-Forwarded-For from %s, so every client behind it shares one "
            "rate-limit bucket. If %s is your reverse proxy, set FORWARDED_ALLOW_IPS to it.",
            host,
            host,
        )
