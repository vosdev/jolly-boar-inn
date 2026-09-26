"""Serve the built client (client/dist) with an SPA fallback to index.html."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.convertors import PathConvertor, register_url_convertor

CLIENT_DIST = Path(__file__).resolve().parents[2] / "client" / "dist"

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"


class ClientPath(PathConvertor):
    """Any path outside ``/api`` and ``/ws``.

    Those belong to the router. Were this route to match them, it would outrank a route
    that has the path but not the method, and a ``GET`` on a ``POST``-only route would be a
    404 instead of the router's 405.
    """

    regex = r"(?!(?:api|ws)(?:/|$)).*"


register_url_convertor("client", ClientPath())


def mount_client(app: FastAPI, dist: Path = CLIENT_DIST) -> None:
    """Register a catch-all GET route. Must be called after every API route."""

    index = dist / "index.html"

    @app.api_route("/{path:client}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if not index.is_file():
            raise HTTPException(status_code=404, detail="client not built")

        # No real file or client route has one, and it makes ``resolve`` raise.
        if "\0" in path:
            raise HTTPException(status_code=404)
        candidate = (dist / path).resolve()
        if path and candidate.is_relative_to(dist) and candidate.is_file():
            cache = IMMUTABLE if path.startswith("assets/") else NO_CACHE
            return FileResponse(candidate, headers={"Cache-Control": cache})
        return FileResponse(index, headers={"Cache-Control": NO_CACHE})
