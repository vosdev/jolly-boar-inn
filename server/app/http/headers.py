"""Response headers from section 7 of ideas/architecture.md, on every response.

``Referrer-Policy: no-referrer`` and ``X-Content-Type-Options: nosniff`` everywhere;
``Cache-Control: no-store`` on ``/api/*`` (static responses keep their own caching).
Pure ASGI so it wraps every route, exception handler and the static fallback alike.

No HSTS: TLS terminates at the reverse proxy, and a self-hoster serving plain HTTP on
a LAN would lock themselves out. It belongs in the proxy config.
"""

from urllib.parse import urlsplit

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


# The built client loads only hashed files from its own origin and has no inline
# script or style, so nothing here needs 'unsafe-inline'. ``img-src data:`` covers
# Vite inlining small assets. ``connect-src 'self'`` also covers the same-origin
# websocket; CSP Level 3 made that explicit.
def content_security_policy(faro_url: str = "") -> str:
    """The CSP, with a Faro receiver on another origin allowed to take the browser's reports."""
    connect = "connect-src 'self'"
    collector = urlsplit(faro_url)
    if collector.scheme and collector.netloc:
        connect += f" {collector.scheme}://{collector.netloc}"
    return "; ".join(
        (
            "default-src 'none'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            "media-src 'self'",
            connect,
            "font-src 'self'",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
        )
    )


class SecurityHeaders:
    def __init__(self, app: ASGIApp, csp: str = content_security_policy()) -> None:
        self.app = app
        self.csp = csp

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_api = scope["path"] in ("/api", "/metrics") or scope["path"].startswith("/api/")

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Referrer-Policy"] = "no-referrer"
                headers["X-Content-Type-Options"] = "nosniff"
                headers["Content-Security-Policy"] = self.csp
                # frame-ancestors covers this for current browsers; keep it for old ones.
                headers["X-Frame-Options"] = "DENY"
                if is_api:
                    headers["Cache-Control"] = "no-store"
            await send(message)

        await self.app(scope, receive, send_with_headers)
