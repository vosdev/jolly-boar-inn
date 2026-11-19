"""App factory and lifespan."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

import asyncpg
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import accesslog, metrics, profiling
from app.config import APP_VERSION, Settings, get_settings
from app.db import create_pool, run_migrations
from app.errors import ApiError
from app.http import (
    admin,
    credits,
    daily,
    modes,
    players,
    question_counts,
    questions,
    reports,
    rooms,
    roster,
    stats,
    suggestions,
    vocab,
)
from app.http import metrics as http_metrics
from app.http.bodylimit import BodyLimit
from app.http.forwarded import UntrustedForwardWarning
from app.http.head import HeadAsGet
from app.http.headers import SecurityHeaders, content_security_policy
from app.http.jsonbody import JsonBody
from app.http.metrics import HttpMetrics
from app.http.ratelimit import (
    CONNECTS_PER_ADDRESS,
    CONNECTS_PER_SESSION,
    CONNECTS_WINDOW,
    DAILIES_PER_HOUR,
    DAILY_REQUESTS_PER_HOUR,
    FREE_CODES,
    FREE_CODES_WINDOW,
    JOIN_FAILURES_PER_HOUR,
    JOINS_PER_HOUR,
    LOOKUP_MISSES,
    LOOKUP_WINDOW,
    PENDING_HELLOS_PER_ADDRESS,
    QUESTION_CHANGES_PER_HOUR,
    REPORTS_PER_HOUR,
    ROOM_ATTEMPTS_PER_HOUR,
    SIMILAR_PER_HOUR,
    SUGGESTIONS_PER_HOUR,
    TRIES_PER_HOUR,
    UNHELLOED_PER_ADDRESS,
    OldestOut,
    OpenCount,
    RateLimiter,
)
from app.map import tile_picture
from app.pets import assign_missing_pets, load_pickable_pets
from app.pictures import load_pictures
from app.questions import vocab as vocabularies
from app.questions.packs import load_packs
from app.rooms.codes import load_words
from app.rooms.state import RoomManager
from app.static import CLIENT_DIST, mount_client
from app.ws import handler as ws_handler

log = logging.getLogger("app")


class DatabaseUnavailable(ApiError):
    status, code = 503, "db_unavailable"


# Any constant does, as long as every process that shares a database uses the same one.
INSTANCE_LOCK = 0x4A42_4900
# A minute adds at most that much to the 15 an idle room is kept, for a walk over memory.
IDLE_SWEEP_SECONDS = 60


class AnotherInstance(RuntimeError):
    """Another process already holds this database's instance lock."""


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


async def take_instance_lock(dsn: str) -> asyncpg.Connection:
    """A connection holding the instance lock for as long as it stays open.

    Every room lives in one process's memory, so a second process on the same database
    would load its own copy of a room and run a second timer over it. ``AnotherInstance``
    if some other process holds the lock.
    """
    conn = await asyncpg.connect(dsn)
    try:
        taken = await conn.fetchval("select pg_try_advisory_lock($1)", INSTANCE_LOCK)
    except BaseException:
        await conn.close()
        raise
    if not taken:
        await conn.close()
        raise AnotherInstance("another process is serving rooms from this database")
    return conn


async def _connect(app: FastAPI) -> asyncpg.Pool:
    """The pool, taking the instance lock first whenever this process does not hold it.

    A lock connection that closed (a Postgres restart) released the lock, so it is taken
    again before the next query rather than letting another process share the rooms.
    """
    async with app.state.connecting:
        lock = app.state.instance_lock
        if lock is None or lock.is_closed():
            app.state.instance_lock = None
            app.state.instance_lock = await take_instance_lock(app.state.settings.database_url)
        if app.state.pool is None:
            pool = await connect(app.state.settings)
            try:
                await assign_missing_pets(pool, app.state.rooms.pets)
            except BaseException:
                await pool.close()
                raise
            app.state.pool = pool
    return app.state.pool


async def ensure_pool(app: FastAPI) -> asyncpg.Pool:
    """The app's pool, connecting now if startup could not. ``DatabaseUnavailable`` if not."""
    try:
        return await _connect(app)
    except AnotherInstance as exc:
        log.error("%s; refusing to touch it", exc)
        raise DatabaseUnavailable("database unavailable") from exc
    except (OSError, asyncpg.PostgresError) as exc:
        log.warning("database unavailable: %s", exc)
        raise DatabaseUnavailable("database unavailable") from exc


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
            metrics.CLEANUP_RUNS.labels(result="db_unavailable").inc()
            log.warning("room cleanup skipped: the database is unavailable")
        except Exception:
            metrics.CLEANUP_RUNS.labels(result="error").inc()
            log.exception("room cleanup failed; trying again in %d seconds", interval)
        else:
            metrics.CLEANUP_RUNS.labels(result="ok").inc()
            metrics.CLEANUP_LAST_SUCCESS.set_to_current_time()
        await asyncio.sleep(interval)


async def evict_idle_rooms(app: FastAPI) -> None:
    """``RoomManager.evict_idle`` every ``IDLE_SWEEP_SECONDS``, for as long as the app runs.

    Its own task rather than a step of the hourly cleanup: it touches no database, so a
    pass is a walk over memory, and an hour would let an idle room outstay its 15 minutes
    fivefold. A pass that fails is logged and the next one runs on schedule.
    """
    while True:
        await asyncio.sleep(IDLE_SWEEP_SECONDS)
        try:
            await app.state.rooms.evict_idle()
        except Exception:
            log.exception("idle room sweep failed; trying again in %d seconds", IDLE_SWEEP_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    logging.basicConfig(level=settings.log_level.upper())
    accesslog.install()
    profiling.start(settings)
    # Before the packs: a pack question is checked against the vocabulary it answers from,
    # and a roster that cannot be one should fail as itself, not as every question on it.
    vocabularies.load_all()
    try:
        app.state.packs = load_packs(settings.packs_dir)
    except FileNotFoundError as exc:
        log.warning("no question packs loaded: %s", exc)
        app.state.packs = []
    app.state.rooms = RoomManager(
        pool=app.state.database,
        packs=app.state.packs,
        settings=settings,
        words=load_words(),
        pets=load_pickable_pets(),
        pictures=load_pictures(
            client=Path(settings.client_pictures or app.state.client_dist / "pictures")
        )
        | tile_picture(client=Path(settings.client_map or app.state.client_dist / "map")),
    )
    app.state.pool = None
    app.state.instance_lock = None
    try:
        await _connect(app)  # AnotherInstance escapes: this process must not start
    except (OSError, asyncpg.PostgresError) as exc:
        log.warning("database unavailable, will retry on demand: %s", exc)
    app.state.cleanup = asyncio.create_task(cleanup_expired_rooms(app), name="room-cleanup")
    app.state.idle_sweep = asyncio.create_task(evict_idle_rooms(app), name="idle-rooms")
    app.state.lag_probe = asyncio.create_task(
        metrics.monitor_event_loop_lag(), name="event-loop-lag"
    )
    yield
    app.state.lag_probe.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.lag_probe
    app.state.idle_sweep.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.idle_sweep
    app.state.cleanup.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.cleanup  # before the pool goes, like the timers below
    await app.state.rooms.shutdown()  # every room's timer task, before the pool goes
    if app.state.pool is not None:
        await app.state.pool.close()
    if app.state.instance_lock is not None:
        await app.state.instance_lock.close()


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
    return JSONResponse(
        {"code": exc.code, "message": exc.message}, status_code=exc.status, headers=exc.headers
    )


class _AsciiJSONResponse(JSONResponse):
    def render(self, content: object) -> bytes:
        return json.dumps(content, separators=(",", ":")).encode("ascii")


async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """FastAPI's own 422 body without the input, escaped to ASCII.

    Echoing the input would hand a 7 MB upload back several times over before any rate limit
    counts it. A ``loc`` still names the keys sent, and a lone surrogate from a ``\\ud800``
    escape has no UTF-8 encoding, so the default response would turn the 422 into a 500.
    """
    errors = [
        {key: value for key, value in error.items() if key not in ("input", "ctx")}
        for error in exc.errors()
    ]
    return _AsciiJSONResponse({"detail": jsonable_encoder(errors)}, status_code=422)


def create_app(settings: Settings | None = None, client_dist: Path = CLIENT_DIST) -> FastAPI:
    app = FastAPI(
        title="Jolly Boar Inn",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = settings or get_settings()
    app.state.client_dist = client_dist
    app.state.pool = None
    app.state.instance_lock = None
    app.state.connecting = asyncio.Lock()
    app.state.database = lambda: ensure_pool(app)
    app.state.packs = []
    app.state.rooms = None
    app.state.cleanup = None
    app.state.idle_sweep = None
    app.state.ratelimiter = RateLimiter(app.state.settings.rooms_per_ip_per_hour, name="rooms")
    app.state.room_attempts = RateLimiter(ROOM_ATTEMPTS_PER_HOUR, name="room_attempts")
    app.state.question_changes = RateLimiter(QUESTION_CHANGES_PER_HOUR, name="question_changes")
    app.state.lookup_misses = RateLimiter(LOOKUP_MISSES, LOOKUP_WINDOW, name="lookup_misses")
    app.state.free_codes = RateLimiter(FREE_CODES, FREE_CODES_WINDOW, name="free_codes")
    app.state.joins = RateLimiter(JOINS_PER_HOUR, name="joins")
    app.state.join_failures = RateLimiter(JOIN_FAILURES_PER_HOUR, name="join_failures")
    app.state.suggestions = RateLimiter(SUGGESTIONS_PER_HOUR, name="suggestions")
    app.state.reports = RateLimiter(REPORTS_PER_HOUR, name="reports")
    app.state.similar = RateLimiter(SIMILAR_PER_HOUR, name="similar")
    app.state.tries = RateLimiter(TRIES_PER_HOUR, name="tries")
    app.state.dailies = RateLimiter(DAILIES_PER_HOUR, name="dailies")
    app.state.daily_requests = RateLimiter(DAILY_REQUESTS_PER_HOUR, name="daily_requests")
    app.state.connects = RateLimiter(CONNECTS_PER_ADDRESS, CONNECTS_WINDOW, name="connects")
    app.state.session_connects = RateLimiter(CONNECTS_PER_SESSION, CONNECTS_WINDOW, name="connects")
    app.state.pending_hellos = OldestOut(PENDING_HELLOS_PER_ADDRESS)
    app.state.unhelloed = OpenCount(UNHELLOED_PER_ADDRESS)
    app.state.sockets = OpenCount(app.state.settings.max_sockets)
    app.add_middleware(JsonBody)  # inside BodyLimit, so an oversized body is a 413 first
    app.add_middleware(BodyLimit)
    app.add_middleware(HttpMetrics)
    app.add_middleware(HeadAsGet)
    app.add_middleware(UntrustedForwardWarning)
    csp = content_security_policy(app.state.settings.faro_url)
    app.add_middleware(SecurityHeaders, csp=csp)  # last, so it wraps the others' responses too
    app.add_exception_handler(ApiError, _api_error)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_error)  # type: ignore[arg-type]

    @app.get("/api/health")
    async def health(request: Request) -> JSONResponse:
        db = await _db_ok(request)
        return JSONResponse(
            {"ok": db, "db": db, "version": APP_VERSION}, status_code=200 if db else 503
        )

    app.include_router(rooms.router)
    app.include_router(daily.router)
    app.include_router(players.router)
    app.include_router(stats.router)
    app.include_router(modes.router)
    app.include_router(vocab.router)
    app.include_router(credits.router)
    app.include_router(question_counts.router)
    app.include_router(suggestions.router)
    app.include_router(reports.router)
    app.include_router(questions.router)
    # Unset, the admin routes are not there at all, so each is the 404 of any unknown path.
    if app.state.settings.admin_token:
        app.include_router(admin.router)
        app.include_router(suggestions.admin_router)
        app.include_router(reports.admin_router)
        app.include_router(questions.admin_router)
        app.include_router(questions.changes_router)
        app.include_router(roster.admin_router)
        app.include_router(roster.changes_router)
    if app.state.settings.metrics_token:
        app.include_router(http_metrics.router)
    app.include_router(ws_handler.router)
    mount_client(app, client_dist, app.state.settings.public_base_url, app.state.settings.faro_url)
    return app


app = create_app()
