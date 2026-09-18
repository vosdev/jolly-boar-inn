"""App factory and lifespan."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.db import create_pool, run_migrations
from app.questions.packs import load_packs
from app.static import CLIENT_DIST, mount_client

log = logging.getLogger("app")


async def connect(settings: Settings) -> asyncpg.Pool:
    """Open the pool and bring the schema up to date.

    Connection errors propagate as ``OSError`` / ``asyncpg.PostgresError`` so callers can
    retry later; a ``MigrationError`` is fatal and closes the pool before propagating.
    """
    pool = await create_pool(settings.database_url)
    try:
        await run_migrations(pool)
    except BaseException:
        await pool.close()
        raise
    return pool


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    logging.basicConfig(level=settings.log_level.upper())
    try:
        app.state.packs = load_packs(settings.packs_dir)
    except FileNotFoundError as exc:
        log.warning("no question packs loaded: %s", exc)
        app.state.packs = []
    app.state.pool = None
    try:
        app.state.pool = await connect(settings)
    except (OSError, asyncpg.PostgresError) as exc:
        log.warning("database unavailable at startup, will retry on demand: %s", exc)
    yield
    if app.state.pool is not None:
        await app.state.pool.close()


async def _db_ok(request: Request) -> bool:
    app = request.app
    try:
        if app.state.pool is None:
            app.state.pool = await connect(app.state.settings)
        return await app.state.pool.fetchval("SELECT 1") == 1
    except (OSError, asyncpg.PostgresError) as exc:
        log.warning("database check failed: %s", exc)
        return False


def create_app(settings: Settings | None = None, client_dist: Path = CLIENT_DIST) -> FastAPI:
    app = FastAPI(
        title="Jolly Boar Inn",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = settings or get_settings()
    app.state.pool = None
    app.state.packs = []

    @app.get("/api/health")
    async def health(request: Request) -> JSONResponse:
        db = await _db_ok(request)
        return JSONResponse({"ok": db, "db": db}, status_code=200 if db else 503)

    mount_client(app, client_dist)
    return app


app = create_app()
