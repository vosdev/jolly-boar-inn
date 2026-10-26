"""Serve the built client (client/dist) with an SPA fallback to index.html."""

from datetime import UTC, datetime, timedelta
from html import escape
from pathlib import Path
from xml.sax.saxutils import escape as escape_xml

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from starlette.convertors import PathConvertor, register_url_convertor

CLIENT_DIST = Path(__file__).resolve().parents[2] / "client" / "dist"

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"

# Where the build leaves ``index.html`` the address it is served at (``client/site-branding.ts``):
# a shared link's card has to be absolute, and the address is the server's setting, not the
# build's, so a change of domain needs a restart rather than a rebuild.
BASE_URL_SLOT = "__PUBLIC_BASE_URL__"

# Rooms and finished games belong to their players, and a room's page is Join for anyone else.
PRIVATE_PATHS = ("/api/", "/ws/", "/metrics", "/r/", "/history/", "/admin")
# What a newcomer can use without a code or a finished game.
SITEMAP_PATHS = ("/", "/create")
# Every instance runs this code, so its flaws are reported upstream, wherever it is hosted.
SECURITY_CONTACT = "https://github.com/vosdev/jolly-boar-inn/security/advisories/new"
SECURITY_POLICY = "https://github.com/vosdev/jolly-boar-inn/blob/main/SECURITY.md"
# RFC 9116 wants an expiry under a year; one counted from each request never goes stale.
SECURITY_TXT_LIFETIME = timedelta(days=180)


class ClientPath(PathConvertor):
    """Any path outside ``/api``, ``/ws`` and ``/metrics``.

    Those belong to the router. Were this route to match them, it would outrank a route
    that has the path but not the method, and a ``GET`` on a ``POST``-only route would be a
    404 instead of the router's 405.
    """

    regex = r"(?!(?:api|ws|metrics)(?:/|$)).*"


register_url_convertor("client", ClientPath())


def mount_client(app: FastAPI, dist: Path = CLIENT_DIST, base_url: str = "") -> None:
    """Register a catch-all GET route. Must be called after every API route."""

    index = dist / "index.html"
    root = base_url.rstrip("/")
    address = escape(root)

    # Registered before the catch-all, which would otherwise answer them with ``index.html``.
    @app.api_route("/robots.txt", methods=["GET", "HEAD"], include_in_schema=False)
    async def robots() -> Response:
        lines = ["User-agent: *", *(f"Disallow: {path}" for path in PRIVATE_PATHS)]
        lines.append(f"Sitemap: {root}/sitemap.xml")
        return PlainTextResponse("\n".join(lines) + "\n", headers={"Cache-Control": NO_CACHE})

    @app.api_route("/sitemap.xml", methods=["GET", "HEAD"], include_in_schema=False)
    async def sitemap() -> Response:
        urls = "".join(f"<url><loc>{escape_xml(root + path)}</loc></url>" for path in SITEMAP_PATHS)
        body = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n'
        )
        return Response(body, media_type="application/xml", headers={"Cache-Control": NO_CACHE})

    @app.api_route("/.well-known/security.txt", methods=["GET", "HEAD"], include_in_schema=False)
    async def security_txt() -> Response:
        expires = (datetime.now(UTC) + SECURITY_TXT_LIFETIME).strftime("%Y-%m-%dT%H:%M:%SZ")
        lines = [
            f"Contact: {SECURITY_CONTACT}",
            f"Expires: {expires}",
            f"Policy: {SECURITY_POLICY}",
            "Preferred-Languages: en",
            f"Canonical: {root}/.well-known/security.txt",
        ]
        return PlainTextResponse("\n".join(lines) + "\n", headers={"Cache-Control": NO_CACHE})

    @app.api_route("/{path:client}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(path: str) -> Response:
        if not index.is_file():
            raise HTTPException(status_code=404, detail="client not built")

        # No real file or client route has one, and it makes ``resolve`` raise.
        if "\0" in path:
            raise HTTPException(status_code=404)
        candidate = (dist / path).resolve()
        if path and candidate.is_relative_to(dist) and candidate.is_file():
            # A picture's random name changes with its file (``scripts/build_pictures.py``).
            cache = IMMUTABLE if path.startswith(("assets/", "pictures/")) else NO_CACHE
            return FileResponse(candidate, headers={"Cache-Control": cache})
        page = index.read_text(encoding="utf-8").replace(BASE_URL_SLOT, address)
        return HTMLResponse(page, headers={"Cache-Control": NO_CACHE})
