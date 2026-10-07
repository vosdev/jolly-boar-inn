"""Serve the built client (client/dist) with an SPA fallback to index.html."""

from html import escape
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response
from starlette.convertors import PathConvertor, register_url_convertor

CLIENT_DIST = Path(__file__).resolve().parents[2] / "client" / "dist"

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"

# Where the build leaves ``index.html`` the address it is served at (``client/site-branding.ts``):
# a shared link's card has to be absolute, and the address is the server's setting, not the
# build's, so a change of domain needs a restart rather than a rebuild.
BASE_URL_SLOT = "__PUBLIC_BASE_URL__"


class ClientPath(PathConvertor):
    """Any path outside ``/api`` and ``/ws``.

    Those belong to the router. Were this route to match them, it would outrank a route
    that has the path but not the method, and a ``GET`` on a ``POST``-only route would be a
    404 instead of the router's 405.
    """

    regex = r"(?!(?:api|ws)(?:/|$)).*"


register_url_convertor("client", ClientPath())


def mount_client(app: FastAPI, dist: Path = CLIENT_DIST, base_url: str = "") -> None:
    """Register a catch-all GET route. Must be called after every API route."""

    index = dist / "index.html"
    address = escape(base_url.rstrip("/"))

    @app.api_route("/{path:client}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(path: str) -> Response:
        if not index.is_file():
            raise HTTPException(status_code=404, detail="client not built")

        # No real file or client route has one, and it makes ``resolve`` raise.
        if "\0" in path:
            raise HTTPException(status_code=404)
        candidate = (dist / path).resolve()
        if path and candidate.is_relative_to(dist) and candidate.is_file():
            cache = IMMUTABLE if path.startswith("assets/") else NO_CACHE
            return FileResponse(candidate, headers={"Cache-Control": cache})
        page = index.read_text(encoding="utf-8").replace(BASE_URL_SLOT, address)
        return HTMLResponse(page, headers={"Cache-Control": NO_CACHE})
