"""App factory and lifespan."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

import asyncpg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import accesslog
from app.config import Settings, get_settings
from app.db import create_pool, run_migrations
from app.errors import ApiError
from app.heads import load_head_count
from app.http import modes, players, rooms, vocab
from app.http.headers import SecurityHeaders
from app.http.ratelimit import RateLimiter
from app.questions import vocab as vocabularies
from app.questions.packs import load_packs
from app.rooms.codes import load_words
from app.rooms.state import RoomManager
from app.static import CLIENT_DIST, mount_client
from app.ws import handler as ws_handler

log = logging.getLogger("app")


class DatabaseUnavailable(ApiError):
    status, code = 503, "db_unavailable"


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


async def ensure_pool(app: FastAPI) -> asyncpg.Pool:
    """The app's pool, connecting now if startup could not. ``DatabaseUnavailable`` if not."""
    if app.state.pool is None:
        try:
            app.state.pool = await connect(app.state.settings)
        except (OSError, asyncpg.PostgresError) as exc:
            log.warning("database unavailable: %s", exc)
            raise DatabaseUnavailable("database unavailable") from exc
    return app.state.pool


async def cleanup_expired_rooms(app: FastAPI) -> None:
    """Section 4's ``any → deleted``, on a timer, for as long as the app runs.

    One pass at startup and one every ``ROOM_CLEANUP_INTERVAL_SECONDS`` after that. The
    first pass matters on a deployment that restarts more often than the interval, which
    would otherwise never reach the first sleep's far side and never clean anything.

    Nothing escapes the loop. A pass that fails -- the database is down, a query times
    out -- is logged and the next one runs on schedule, because an unavailable database
    for one hour should not leave the deployment without a cleanup job until somebody
    restarts it. A database that is simply not there is the one failure that is expected
    rather than surprising, so it is a warning without a traceback; everything else gets
    one. ``CancelledError`` is a ``BaseException``, so the shutdown below still stops
    this immediately.
    """
    interval = app.state.settings.room_cleanup_interval_seconds
    while True:
        try:
            await app.state.rooms.purge_expired()
        except DatabaseUnavailable:
            log.warning("room cleanup skipped: the database is unavailable")
        except Exception:
            log.exception("room cleanup failed; trying again in %d seconds", interval)
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    logging.basicConfig(level=settings.log_level.upper())
    accesslog.install()
    # Before the packs: a pack question is checked against the vocabulary it answers from,
    # and a roster that cannot be one should fail as itself, not as every question on it.
    vocabularies.load_all()
    try:
        app.state.packs = load_packs(settings.packs_dir)
    except FileNotFoundError as exc:
        log.warning("no question packs loaded: %s", exc)
        app.state.packs = []
    app.state.rooms = RoomManager(
        pool=lambda: ensure_pool(app),
        packs=app.state.packs,
        settings=settings,
        words=load_words(),
        heads=load_head_count(),
    )
    app.state.pool = None
    try:
        await ensure_pool(app)
    except DatabaseUnavailable:
        log.warning("will retry the database connection on demand")
    app.state.cleanup = asyncio.create_task(cleanup_expired_rooms(app), name="room-cleanup")
    yield
    app.state.cleanup.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.cleanup  # before the pool goes, like the timers below
    await app.state.rooms.shutdown()  # every room's timer task, before the pool goes
    if app.state.pool is not None:
        await app.state.pool.close()


async def _db_ok(request: Request) -> bool:
    try:
        pool = await ensure_pool(request.app)
        return await pool.fetchval("SELECT 1") == 1
    except DatabaseUnavailable:
        return False
    except (OSError, asyncpg.PostgresError) as exc:
        log.warning("database check failed: %s", exc)
        return False


async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse({"code": exc.code, "message": exc.message}, status_code=exc.status)


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
    app.state.rooms = None
    app.state.cleanup = None
    app.state.ratelimiter = RateLimiter(app.state.settings.rooms_per_ip_per_hour)
    app.add_middleware(SecurityHeaders)
    app.add_exception_handler(ApiError, _api_error)  # type: ignore[arg-type]

    @app.get("/api/health")
    async def health(request: Request) -> JSONResponse:
        db = await _db_ok(request)
        return JSONResponse({"ok": db, "db": db}, status_code=200 if db else 503)

    app.include_router(rooms.router)
    app.include_router(players.router)
    app.include_router(modes.router)
    app.include_router(vocab.router)
    app.include_router(ws_handler.router)
    mount_client(app, client_dist)
    return app


app = create_app()
