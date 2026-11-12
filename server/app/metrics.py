"""OpenMetrics gauges, counters and histograms for ``GET /metrics``.

Every label comes from a fixed set (a status, a route template, a message type, a reason),
so no room code, player name, answer or IP address can ever reach a time series.

Gauges are read from ``app.state`` at scrape time with no ``await`` in between, so one
scrape sees one instant of the process's memory.
"""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING, Literal, get_args

from prometheus_client import (
    GC_COLLECTOR,
    PLATFORM_COLLECTOR,
    PROCESS_COLLECTOR,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
)
from prometheus_client.openmetrics.exposition import CONTENT_TYPE_LATEST, generate_latest

from app.config import APP_VERSION
from app.stats import JoinFailure
from app.ws.protocol import ClientMessage, RoomStatus

if TYPE_CHECKING:
    import asyncpg
    from fastapi import FastAPI

    from app.rooms.state import RoomManager

__all__ = ["CONTENT_TYPE_LATEST", "monitor_event_loop_lag", "render"]

GameOutcome = Literal["finished", "ended_early", "abandoned"]
CleanupResult = Literal["ok", "db_unavailable", "error"]
LimiterName = Literal[
    "rooms",
    "lookup_misses",
    "free_codes",
    "joins",
    "join_failures",
    "suggestions",
    "reports",
    "similar",
    "tries",
    "dailies",
    "ws_messages",
    "connects",
]
DisconnectReason = Literal[
    "client",
    "no_hello",
    "bad_hello",
    "bad_message",
    "frame_too_big",
    "rate_limited",
    "unknown_room",
    "internal_error",
    "replaced",
    "kicked",
    "room_gone",
    "room_restarted",
    "send_failed",
    "server_full",
]

ROOM_STATUSES: tuple[str, ...] = get_args(RoomStatus)
GAME_OUTCOMES: tuple[str, ...] = get_args(GameOutcome)
JOIN_FAILURE_REASONS: tuple[str, ...] = get_args(JoinFailure)
CLEANUP_RESULTS: tuple[str, ...] = get_args(CleanupResult)
LIMITERS: tuple[str, ...] = get_args(LimiterName)
WS_DISCONNECT_REASONS: tuple[str, ...] = get_args(DisconnectReason)
WS_MESSAGE_TYPES: tuple[str, ...] = tuple(
    get_args(model.model_fields["t"].annotation)[0]
    for model in get_args(get_args(ClientMessage)[0])
)

REGISTRY = CollectorRegistry()
REGISTRY.register(PROCESS_COLLECTOR)
REGISTRY.register(PLATFORM_COLLECTOR)
REGISTRY.register(GC_COLLECTOR)

ROOMS = Gauge("jbi_rooms", "Rooms in memory, by status.", ["status"], registry=REGISTRY)
ROOMS_WAITING = Gauge(
    "jbi_rooms_waiting",
    "Restored playing rooms waiting for a player to return.",
    registry=REGISTRY,
)
WEBSOCKET_CONNECTIONS = Gauge(
    "jbi_websocket_connections", "Open room websockets.", registry=REGISTRY
)
PLAYERS_CONNECTED = Gauge(
    "jbi_players_connected",
    "Connected players across all rooms in memory.",
    registry=REGISTRY,
)
ROOM_PLAYERS_MAX = Gauge(
    "jbi_room_players_max", "Players in the fullest room in memory.", registry=REGISTRY
)
MAX_PLAYERS_PER_ROOM = Gauge(
    "jbi_max_players_per_room", "Configured player cap per room.", registry=REGISTRY
)
DB_POOL_SIZE = Gauge(
    "jbi_db_pool_size", "Connections currently open in the database pool.", registry=REGISTRY
)
DB_POOL_IDLE = Gauge(
    "jbi_db_pool_idle", "Idle connections in the database pool.", registry=REGISTRY
)

HTTP_REQUESTS = Counter(
    "jbi_http_requests_total",
    "HTTP requests served, by route template and status.",
    ["route", "status"],
    registry=REGISTRY,
)
HTTP_DURATION = Histogram(
    "jbi_http_request_duration_seconds",
    "HTTP request duration in seconds, by route template.",
    ["route"],
    registry=REGISTRY,
)
WS_MESSAGES = Counter(
    "jbi_ws_messages_total",
    "Client websocket messages received, by message type.",
    ["type"],
    registry=REGISTRY,
)
WS_DISCONNECTS = Counter(
    "jbi_ws_disconnects_total",
    "Websockets closed, by reason.",
    ["reason"],
    registry=REGISTRY,
)
RATE_LIMITED = Counter(
    "jbi_rate_limited_total",
    "Requests refused by a rate limiter.",
    ["limiter"],
    registry=REGISTRY,
)
GAMES = Counter(
    "jbi_games_total",
    "Games ended, by outcome.",
    ["outcome"],
    registry=REGISTRY,
)
JOIN_FAILURES = Counter(
    "jbi_join_failures_total",
    "Join failures reported by browsers, by reason.",
    ["reason"],
    registry=REGISTRY,
)
CLEANUP_RUNS = Counter(
    "jbi_cleanup_runs_total",
    "Expired-room cleanup passes, by result.",
    ["result"],
    registry=REGISTRY,
)
CLEANUP_LAST_SUCCESS = Gauge(
    "jbi_cleanup_last_success_timestamp_seconds",
    "Unix timestamp of the last successful expired-room cleanup pass.",
    registry=REGISTRY,
)
CLEANUP_INTERVAL = Gauge(
    "jbi_cleanup_interval_seconds",
    "Configured seconds between expired-room cleanup passes.",
    registry=REGISTRY,
)
EVENT_LOOP_LAG = Histogram(
    "jbi_event_loop_lag_seconds",
    "How late the event loop wakes a sleeping task; every room shares this lag.",
    buckets=(0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=REGISTRY,
)
LAG_PROBE_INTERVAL = 0.1
BUILD_INFO = Gauge("jbi_build_info", "Server version.", ["version"], registry=REGISTRY)
PROCESS_START_TIME = Gauge(
    "jbi_process_start_time_seconds",
    "Unix timestamp when the server process started.",
    registry=REGISTRY,
)

BUILD_INFO.labels(version=APP_VERSION).set(1)
PROCESS_START_TIME.set(time.time())
for _status in ROOM_STATUSES:
    ROOMS.labels(status=_status)
for _outcome in GAME_OUTCOMES:
    GAMES.labels(outcome=_outcome)
for _reason in JOIN_FAILURE_REASONS:
    JOIN_FAILURES.labels(reason=_reason)
for _result in CLEANUP_RESULTS:
    CLEANUP_RUNS.labels(result=_result)
for _limiter in LIMITERS:
    RATE_LIMITED.labels(limiter=_limiter)
for _msg_type in WS_MESSAGE_TYPES:
    WS_MESSAGES.labels(type=_msg_type)
for _disconnect in WS_DISCONNECT_REASONS:
    WS_DISCONNECTS.labels(reason=_disconnect)


async def monitor_event_loop_lag(interval: float = LAG_PROBE_INTERVAL) -> None:
    """Sleep ``interval`` forever and observe how much later than that the loop resumes us."""
    loop = asyncio.get_running_loop()
    while True:
        start = loop.time()
        await asyncio.sleep(interval)
        EVENT_LOOP_LAG.observe(max(0.0, loop.time() - start - interval))


def render(app: FastAPI) -> bytes:
    """Update the in-memory gauges from ``app.state`` and render OpenMetrics text."""
    manager: RoomManager | None = app.state.rooms
    rooms = list(manager.rooms.values()) if manager is not None else []
    counts = dict.fromkeys(ROOM_STATUSES, 0)
    for room in rooms:
        counts[room.status] = counts.get(room.status, 0) + 1
    for status, count in counts.items():
        ROOMS.labels(status=status).set(count)
    ROOMS_WAITING.set(sum(1 for room in rooms if room.awaiting_player))
    WEBSOCKET_CONNECTIONS.set(sum(len(room.sockets) for room in rooms))
    PLAYERS_CONNECTED.set(
        sum(player.connected for room in rooms for player in room.players.values())
    )
    ROOM_PLAYERS_MAX.set(max((len(room.players) for room in rooms), default=0))
    MAX_PLAYERS_PER_ROOM.set(app.state.settings.max_players_per_room)
    CLEANUP_INTERVAL.set(app.state.settings.room_cleanup_interval_seconds)

    pool: asyncpg.Pool | None = app.state.pool
    DB_POOL_SIZE.set(0 if pool is None else pool.get_size())
    DB_POOL_IDLE.set(0 if pool is None else pool.get_idle_size())
    return generate_latest(REGISTRY)
