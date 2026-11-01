"""Daily rooms: one player's attempt at the day's set (``app/daily.py``), alone and once.

An attempt is a room born ``playing`` from the stored set, with one player and no lobby,
splash or standings. Nobody else finds it: join, lookup and the public list read it as
missing. Its reveal waits for the player's ``skip`` and moves on by itself after
``DAILY_REVEAL_SECONDS``, so an abandoned attempt still ends.

Once a day is a random token the browser keeps, stored as sha256 in ``daily_attempts``
under the day the attempt started on, so an attempt running past the rollover keeps its
own day's set. The row outlives the room: each close appends its result there, in the
close's transaction.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal, cast
from uuid import UUID

import asyncpg

from app.daily import SET_SIZE, NoDailySet, daily_set, day_of, number_of
from app.errors import ApiError
from app.rooms import codes
from app.rooms.errors import RoomExpired, RoomNotFound
from app.rooms.models import Room, hash_token, new_token, normalize_name
from app.rooms.queries import _question_rows
from app.rooms.settings import RoomSettings
from app.stats import Metric, bump

# Long enough to read any reveal, short enough that a walked-away attempt ends within the hour.
DAILY_REVEAL_SECONDS = 300

Result = Literal["right", "partial", "missed"]

DAILY_SETTINGS = RoomSettings(
    modes=[],
    pace="run",
    standings_seconds=0,
    close_when_all_answered=True,
    name_wrong_answers=False,
    max_players=1,
)


class DailyPlayed(ApiError):
    """Today's attempt is over; ``result`` is what it scored."""

    status, code = 409, "daily_played"

    def __init__(self, result: DailyResult) -> None:
        super().__init__("you have played today's daily already")
        self.result = result


class DailyUnavailable(ApiError):
    status, code = 503, "daily_unavailable"


class DailyNotOpen(ApiError):
    status, code = 404, "daily_not_open"


@dataclass(frozen=True, slots=True)
class DailyResult:
    """A finished attempt: its day, points and one result per question, in play order."""

    day: date
    number: int
    points: int
    results: list[Result]

    @property
    def correct(self) -> int:
        return sum(result == "right" for result in self.results)


def result_of(credit: float | None) -> Result:
    """A question's result from the credit its answer earned; no answer is ``missed``."""
    if credit is None or credit <= 0:
        return "missed"
    return "right" if credit >= 1.0 else "partial"


async def record_close(
    conn: asyncpg.Connection, room: Room, credit: float | None, points: int
) -> None:
    """Append a daily room's close to its attempt; call inside the close's transaction."""
    await conn.execute(
        "update daily_attempts set results = array_append(results, $2), points = points + $3"
        " where room_id = $1",
        room.id,
        result_of(credit),
        points,
    )


async def finish_attempt(conn: asyncpg.Connection, room: Room, at: datetime) -> None:
    """Close a daily room's attempt and count it; call inside the finish's transaction."""
    row = await conn.fetchrow(
        "update daily_attempts set finished_at = $2 where room_id = $1 returning points, results",
        room.id,
        at,
    )
    await bump(conn, Metric.DAILY, "finished")
    if row is not None:
        await bump(conn, Metric.DAILY, "points", row["points"])
        await bump(conn, Metric.DAILY, "correct", row["results"].count("right"))


class DailyRooms:
    """The ``RoomManager`` methods that start and resume a daily attempt."""

    async def start_daily(
        self,
        token: str,
        display_name: str,
        avatar: str | None,
        now: datetime,
        charge: Callable[[], None],
    ) -> tuple[str, str]:
        """The room code and a fresh session for this token's attempt, started if need be.

        An unfinished attempt resumes, whatever its day; ``charge`` runs only before a new one.
        A finished one for today raises ``DailyPlayed``, and a day before the first
        ``DailyNotOpen``.
        """
        day = day_of(now)
        if day < self.settings.daily_first_day:
            raise DailyNotOpen("the daily has not opened yet")
        name = normalize_name(display_name)
        self.check_avatar(avatar)
        token_hash = hash_token(token)
        resumed = await self._resume_daily(token_hash, day, now)
        if resumed is not None:
            return resumed
        charge()
        try:
            return await self._new_daily(token_hash, name, avatar, now)
        except asyncpg.UniqueViolationError:
            # A second start with the same token committed first: that one is the attempt.
            resumed = await self._resume_daily(token_hash, day, now)
            if resumed is None:
                raise
            return resumed

    async def _resume_daily(
        self, token_hash: str, day: date, now: datetime
    ) -> tuple[str, str] | None:
        """Resume this token's unfinished attempt, or refuse today's finished one."""
        pool = await self._pool()
        rows = await pool.fetch(
            "select a.day, a.finished_at, a.points, a.results, r.code from daily_attempts a"
            " left join rooms r on r.id = a.room_id"
            " where a.token_hash = $1 and (a.finished_at is null or a.day = $2)"
            " order by a.day",
            token_hash,
            day,
        )
        for row in rows:
            finished = row["finished_at"] is not None
            if not finished and row["code"] is not None:
                try:
                    return await self._rotate_daily_session(row["code"])
                except RoomNotFound, RoomExpired:
                    pass
            if not finished:
                # Its room is gone, so it can never finish: what it played is its result.
                await pool.execute(
                    "update daily_attempts set finished_at = $3"
                    " where day = $1 and token_hash = $2 and finished_at is null",
                    row["day"],
                    token_hash,
                    now,
                )
            if row["day"] == day:
                raise DailyPlayed(self._daily_result(row["day"], row["points"], row["results"]))
        return None

    async def daily_result(self, token: str, day: date) -> DailyResult | None:
        """This token's finished attempt on ``day``, or ``None``: an end screen's numbers."""
        pool = await self._pool()
        row = await pool.fetchrow(
            "select points, results from daily_attempts"
            " where day = $1 and token_hash = $2 and finished_at is not null",
            day,
            hash_token(token),
        )
        return None if row is None else self._daily_result(day, row["points"], row["results"])

    def _daily_result(self, day: date, points: int, results: Sequence[str]) -> DailyResult:
        number = number_of(day, self.settings.daily_first_day)
        # An attempt whose room went mid-game missed what it never reached.
        played = cast(list[Result], list(results))
        return DailyResult(day, number, points, played + ["missed"] * (SET_SIZE - len(played)))

    async def _rotate_daily_session(self, code: str) -> tuple[str, str]:
        """A new session for a daily room's player; the old one stops working."""
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            if room.daily is None or room.status != "playing" or not room.players:
                raise RoomNotFound(f"no daily room {code}")
            player = next(iter(room.players.values()))
            session = new_token()
            await pool.execute(
                "update players set session_token_hash = $1 where id = $2",
                hash_token(session),
                player.id,
            )
            player.session_hash = hash_token(session)
        return codes.cased(code), session

    async def _new_daily(
        self, token_hash: str, name: str, avatar: str | None, now: datetime
    ) -> tuple[str, str]:
        """Insert the attempt, its room, player and questions in one transaction."""
        pool = await self._pool()
        try:
            drawn = await daily_set(pool, self.packs, self.settings, self.pictures, now, self.rng)
        except NoDailySet:
            raise DailyUnavailable("there is no daily today") from None
        session = new_token()
        avatar = self._pet_for(avatar, ())
        expires_at = now.astimezone(UTC) + timedelta(days=self.settings.room_ttl_days)
        async with pool.acquire() as conn, conn.transaction():
            # First, so a second start with this token fails before a code is spent on it.
            await conn.execute(
                "insert into daily_attempts (day, token_hash, started_at) values ($1, $2, $3)",
                drawn.day,
                token_hash,
                now,
            )
            room_id: UUID | None = None

            async def try_insert(code: str) -> bool:
                nonlocal room_id
                try:
                    async with conn.transaction():
                        room_id = await conn.fetchval(
                            "insert into rooms (code, status, settings, current_index,"
                            " expires_at, daily) values ($1, 'playing', $2, 0, $3, $4)"
                            " returning id",
                            code,
                            DAILY_SETTINGS.model_dump(),
                            expires_at,
                            drawn.day,
                        )
                except asyncpg.UniqueViolationError:
                    return False
                return True

            code = await codes.allocate(self.words, self.code_rng, try_insert)
            assert room_id is not None
            await conn.execute(
                "insert into players (room_id, display_name, session_token_hash, avatar)"
                " values ($1, $2, $3, $4)",
                room_id,
                name,
                hash_token(session),
                avatar,
            )
            await conn.executemany(
                "insert into questions (room_id, position, question_id, type, mode, source,"
                " payload, host_only, round, random_event, author_player_id)"
                " values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
                _question_rows(room_id, list(enumerate(drawn.questions)), None, ()),
            )
            await conn.execute(
                "update daily_attempts set room_id = $3 where day = $1 and token_hash = $2",
                drawn.day,
                token_hash,
                room_id,
            )
            await bump(conn, Metric.DAILY, "started")
        return codes.cased(code), session
