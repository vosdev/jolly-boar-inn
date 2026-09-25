"""Serve the built client (client/dist) with an SPA fallback to index.html."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

CLIENT_DIST = Path(__file__).resolve().parents[2] / "client" / "dist"

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"


def mount_client(app: FastAPI, dist: Path = CLIENT_DIST) -> None:
    """Register a catch-all GET route. Must be called after every API route."""

    index = dist / "index.html"

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path.startswith(("api/", "ws/")) or path in ("api", "ws"):
            raise HTTPException(status_code=404)
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
