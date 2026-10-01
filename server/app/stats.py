"""Daily counters in ``daily_stats``: how much the instance is played, never by whom.

Each counter is bumped inside the transaction of the event it counts, so an event that
rolls back counts nothing. The table has no foreign key, so cleanup deleting a room leaves
what that room counted.

A game ends exactly one way: early, finished, or abandoned when its room is deleted or
expires mid-game. A round, keyed by its mode, starts when its first question opens and
finishes when its last one closes, graded or voided by a restart; ``end_game`` between
those two ends it early, and its room going then abandons it.
"""

from enum import StrEnum

import asyncpg


class Metric(StrEnum):
    ROOMS_CREATED = "rooms_created"
    GAMES_STARTED = "games_started"
    GAMES_ENDED_EARLY = "games_ended_early"
    GAMES_FINISHED = "games_finished"
    GAMES_ABANDONED = "games_abandoned"
    # The host counts as a joined player too, so returning can never outnumber joined.
    PLAYERS_JOINED = "players_joined"
    PLAYERS_RETURNING = "players_returning"
    ROUNDS_STARTED = "rounds_started"
    ROUNDS_ENDED_EARLY = "rounds_ended_early"
    ROUNDS_FINISHED = "rounds_finished"
    ROUNDS_ABANDONED = "rounds_abandoned"


async def bump(conn: asyncpg.Connection, metric: Metric, key: str = "", by: int = 1) -> None:
    """Add ``by`` to today's (UTC) ``metric`` under ``key``; call inside the event's transaction."""
    await conn.execute(
        "insert into daily_stats (day, metric, key, count)"
        " values ((now() at time zone 'utc')::date, $1, $2, $3)"
        " on conflict (day, metric, key) do update set count = daily_stats.count + $3",
        metric.value,
        key,
        by,
    )


async def joined(conn: asyncpg.Connection, returning: bool) -> None:
    """Count one player into a room, the host included."""
    await bump(conn, Metric.PLAYERS_JOINED)
    if returning:
        await bump(conn, Metric.PLAYERS_RETURNING)


async def history(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    """Every counter ever kept, oldest day first: ``day``, ``metric``, ``key``, ``count``."""
    return await pool.fetch(
        "select day, metric, key, count from daily_stats order by day, metric, key"
    )
