"""Daily counters in ``daily_stats``: how much the instance is played, never by whom.

Each counter is bumped inside the transaction of the event it counts, so an event that
rolls back counts nothing. The table has no foreign key, so cleanup deleting a room leaves
what that room counted.

A game ends exactly one way: early, finished, or abandoned when its room is deleted or
expires mid-game. A round, keyed by its mode, starts when its first question opens and
finishes when its last one closes, graded or voided by a restart; ``end_game`` between
those two ends it early, and its room going then abandons it.

The two peaks are the one exception to counting: each keeps the day's highest value seen.

A key is only ever one of a fixed set of values (a mode, a type, or a ``Literal`` below),
so no key can carry a name or anything else a player typed.
"""

from dataclasses import dataclass
from datetime import timedelta
from enum import StrEnum
from typing import Literal

import asyncpg

# Kept equal to ``THEMES`` in ``client/src/lib/theme.ts`` by ``tests/test_stats.py``.
Theme = Literal[
    "jolly",
    "pollnivneach",
    "jungle",
    "party_room",
    "zanaris",
    "tzhaar",
    "wilderness",
    "gauntlet",
    "corrupted_gauntlet",
    "morytania",
]
Device = Literal["mobile", "desktop"]
# How the player reached the room: Home's public list, an invite link with its key, a code
# typed on Home, or a plain link to the room.
Route = Literal["public", "invite", "code", "link"]
# Every way a join can fail that the player is shown, as the browser reports it.
JoinFailure = Literal[
    "not_found",
    "name_taken",
    "room_full",
    "not_joinable",
    "bad_key",
    "requests_full",
    "request_denied",
]

# ``Metric.DAILY``'s keys: attempts started, finished and run out, and the finished ones' sums.
DailyKey = Literal["started", "finished", "ran_out", "points", "correct"]


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
    # Keyed by the question's own mode, so a random event counts under its NPC mode.
    QUESTIONS_ALL_ANSWERED = "questions_all_answered"
    QUESTIONS_TIMED_OUT = "questions_timed_out"
    QUESTIONS_SKIPPED = "questions_skipped"
    # Per game started, keyed by the room's ``random_event_frequency``.
    EVENT_FREQUENCY = "event_frequency"
    # Per game started: the host's own questions keyed by type, and the games that had any.
    CUSTOM_QUESTIONS = "custom_questions"
    GAMES_WITH_CUSTOM = "games_with_custom"
    # Finished games only, keyed by ``duration_bucket``.
    GAME_DURATIONS = "game_durations"
    # Once per browser: it sends each again only when it differs from what it had counted.
    THEMES = "themes"
    DEVICES = "devices"
    JOIN_ROUTES = "join_routes"
    # As the browser reports them, since only it knows which ones its player saw.
    JOIN_FAILURES = "join_failures"
    # Per game started, keyed by ``players_bucket``; the host is a player.
    GAME_PLAYERS = "game_players"
    # Finished rounds, keyed ``mode/bucket`` by ``round_bucket``.
    ROUND_DURATIONS = "round_durations"
    # The round, 1-based and keyed by ``round_key``, a game was in when it ended that way.
    ENDED_EARLY_AT_ROUND = "ended_early_at_round"
    ABANDONED_AT_ROUND = "abandoned_at_round"
    # The day's highest, never a sum: connected players, and the unfinished rooms with any.
    PEAK_PLAYERS = "peak_players"
    PEAK_ROOMS = "peak_rooms"
    # Daily attempts, keyed ``started``, ``finished`` and ``ran_out`` (nobody there at the end);
    # ``points`` and ``correct`` sum the finished ones', so each over ``finished`` is the day's
    # average. No game metric counts one.
    DAILY = "daily"


@dataclass(frozen=True)
class Arrival:
    """What a browser says about itself on the way into a room. Counted, never stored."""

    theme: Theme | None = None
    device: Device | None = None
    via: Route | None = None


# A browser that reported nothing, as every caller but the HTTP bodies is.
UNREPORTED = Arrival()


# Upper bounds in minutes; a game past the last is ``60+``.
DURATION_BUCKETS = (10, 20, 30, 45, 60)
# Upper bounds in minutes; a round past the last is ``10+``.
ROUND_BUCKETS = (2, 5, 10)
# Lower bounds of each players bucket; a game of 20 or more is ``20+``.
PLAYER_BUCKETS = (1, 2, 5, 10, 20)
# Rounds past this one count under ``8+``.
LAST_ROUND_KEY = 8


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


async def peak(conn: asyncpg.Connection, metric: Metric, value: int) -> None:
    """Raise today's (UTC) ``metric`` to ``value`` if that is higher than it already is."""
    await conn.execute(
        "insert into daily_stats (day, metric, key, count)"
        " values ((now() at time zone 'utc')::date, $1, '', $2)"
        " on conflict (day, metric, key)"
        " do update set count = greatest(daily_stats.count, excluded.count)",
        metric.value,
        value,
    )


async def joined(conn: asyncpg.Connection, returning: bool, arrival: Arrival) -> None:
    """Count one player into a room, the host included, and what their browser reported."""
    await bump(conn, Metric.PLAYERS_JOINED)
    if returning:
        await bump(conn, Metric.PLAYERS_RETURNING)
    if arrival.theme is not None:
        await bump(conn, Metric.THEMES, arrival.theme)
    if arrival.device is not None:
        await bump(conn, Metric.DEVICES, arrival.device)
    if arrival.via is not None:
        await bump(conn, Metric.JOIN_ROUTES, arrival.via)


def duration_bucket(length: timedelta) -> str:
    """The ``GAME_DURATIONS`` key for a game that lasted ``length``: ``0-10`` up to ``60+``."""
    return _bucket(length.total_seconds() / 60, DURATION_BUCKETS)


def _bucket(minutes: float, bounds: tuple[int, ...]) -> str:
    low = 0
    for high in bounds:
        if minutes < high:
            return f"{low}-{high}"
        low = high
    return f"{low}+"


def round_bucket(mode: str, length: timedelta) -> str:
    """The ``ROUND_DURATIONS`` key for a round of ``mode`` that lasted ``length``."""
    return f"{mode}/{_bucket(length.total_seconds() / 60, ROUND_BUCKETS)}"


def players_bucket(players: int) -> str:
    """The ``GAME_PLAYERS`` key for a game started with ``players``: ``1``, ``2-4`` to ``20+``."""
    for low, high in zip(PLAYER_BUCKETS, PLAYER_BUCKETS[1:], strict=False):
        if players < high:
            return str(low) if high - low == 1 else f"{low}-{high - 1}"
    return f"{PLAYER_BUCKETS[-1]}+"


def round_key(index: int) -> str:
    """The ``*_AT_ROUND`` key for the round at 0-based ``index``: ``1`` to ``8+``."""
    return str(index + 1) if index + 1 < LAST_ROUND_KEY else f"{LAST_ROUND_KEY}+"


async def history(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    """Every counter ever kept, oldest day first: ``day``, ``metric``, ``key``, ``count``."""
    return await pool.fetch(
        "select day, metric, key, count from daily_stats order by day, metric, key"
    )
