"""The SQL a room loads, saves and counts itself with, and the rows it is built from."""

import asyncio
from collections import Counter
from collections.abc import Collection, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import asyncpg

from app.rooms import segments
from app.rooms.errors import RoomExpired, RoomNotFound
from app.rooms.models import Player, Room, RoomQuestion, Totals, _gone
from app.rooms.settings import RoomSettings
from app.stats import Metric, bump

# Envelope keys that have their own column in ``questions``; the rest is the payload jsonb.
# ``random_event`` is the NPC asking it: the envelope's own for an NPC's question or a host's
# that names one, a face ``selection`` draws for the rest, and a column either way.
_QUESTION_COLUMNS = frozenset({"id", "type", "mode", "source", "host_only", "random_event"})


def _player_from_row(row: asyncpg.Record) -> Player:
    return Player(
        id=row["id"],
        display_name=row["display_name"],
        avatar=row["avatar"],
        role=row["role"],
        joined_at=row["joined_at"],
        session_hash=row["session_token_hash"],
    )


def _room_from_row(row: asyncpg.Record, total: int, lock: asyncio.Lock) -> Room:
    return Room(
        id=row["id"],
        code=row["code"],
        status=row["status"],
        settings=RoomSettings.stored(row["settings"]),
        current_index=row["current_index"],
        total=total,
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        lock=lock,
        finished_at=row["finished_at"],
        invite_key=row["invite_key"],
        public=row["public"],
    )


def _question_rows(
    room_id: UUID,
    questions: Sequence[tuple[int, dict[str, Any]]],
    author: UUID,
    authored: Collection[str],
) -> list[tuple[Any, ...]]:
    """Rows for ``selection.flatten``'s ``(round, question)`` pairs, position by position.

    ``author`` is the room's creator, and it is written against the questions they wrote
    -- the content ids in ``authored`` -- and nothing else. That column is what keeps them
    from scoring on their own questions (``RoomQuestion.can_answer``). It goes by where a
    question came from rather than by the ``source`` it carries, so a claim in the
    envelope can never be what decides who the author is.
    """
    return [
        (
            room_id,
            position,
            q["id"],
            q["type"],
            q["mode"],
            q["source"],
            {k: v for k, v in q.items() if k not in _QUESTION_COLUMNS},
            bool(q.get("host_only", False)),
            round_,
            q.get("random_event"),
            author if q["id"] in authored else None,
        )
        for position, (round_, q) in enumerate(questions)
    ]


async def _count_game_started(conn: asyncpg.Connection, room: Room) -> None:
    """Count a game starting, with its event frequency and the host's own questions."""
    await bump(conn, Metric.GAMES_STARTED)
    if room.settings.random_event_frequency is not None:
        await bump(conn, Metric.EVENT_FREQUENCY, room.settings.random_event_frequency)
    own = Counter(q.type for q in room.questions if q.source == "room")
    for type_, n in own.items():
        await bump(conn, Metric.CUSTOM_QUESTIONS, type_, n)
    if own:
        await bump(conn, Metric.GAMES_WITH_CUSTOM)


async def _count_round_finished(conn: asyncpg.Connection, room: Room, position: int) -> None:
    """Count the round as finished if ``position``, now closing, is its last question."""
    segment = room.segment_at(position)
    if segment is not None and position == segment.start + segment.count - 1:
        await bump(conn, Metric.ROUNDS_FINISHED, segment.mode)


async def _void_question(conn: asyncpg.Connection, question: RoomQuestion, at: datetime) -> None:
    """Write ``open → voided`` (section 4): the question closes at ``at``, graded nothing.

    Both ways in are a question nobody gets to score: ``end_game``, and a restart that
    found it open. Answers already in the table stay exactly as they arrived, with
    ``correct`` and ``points`` null, which is what ``_fetch_totals`` sums as nothing. The
    caller marks the question voided in memory once the write has committed.
    """
    await conn.execute(
        "update questions set closed_at = $1, voided = true where id = $2", at, question.id
    )


def _suggested_by(source: str, envelope: dict[str, Any]) -> str | None:
    """Who to name in the reveal: a pack question's ``credit``, if ``credit_shown``."""
    if source != "pack" or envelope.get("credit_shown") is not True:
        return None
    return envelope.get("credit")


async def _fetch_questions(conn: asyncpg.Connection, room_id: UUID) -> list[RoomQuestion]:
    rows = await conn.fetch(
        "select id, position, question_id, type, mode, source, payload, host_only, round,"
        " random_event, author_player_id, shown_at, closed_at, voided"
        " from questions where room_id = $1 order by position",
        room_id,
    )
    return [
        RoomQuestion(
            id=row["id"],
            position=row["position"],
            content_id=row["question_id"],
            type=row["type"],
            mode=row["mode"],
            source=row["source"],
            payload=row["payload"]["payload"],
            host_only=row["host_only"],
            round=row["round"],
            random_event=row["random_event"],
            suggested_by=_suggested_by(row["source"], row["payload"]),
            author_player_id=row["author_player_id"],
            shown_at=row["shown_at"],
            closed_at=row["closed_at"],
            voided=row["voided"],
        )
        for row in rows
    ]


async def _fetch_totals(
    conn: asyncpg.Connection, room_id: UUID, round_start: int
) -> dict[UUID, Totals]:
    """Every player's score straight from the ``answers`` table (section 5), and the part
    of it from the round starting at position ``round_start``.

    This query is the source of truth for standings; the in-memory copy is only ever
    replaced by what it returns. Ungraded rows (points null) count for nothing, which is
    what makes a voided question free.
    """
    rows = await conn.fetch(
        "select a.player_id, coalesce(sum(a.points), 0)::int as points,"
        " count(*) filter (where a.correct)::int as correct,"
        " coalesce(sum(a.points) filter (where q.position >= $2), 0)::int as round_points,"
        " count(*) filter (where a.correct and q.position >= $2)::int as round_correct"
        " from answers a join questions q on q.id = a.question_id"
        " where q.room_id = $1 group by a.player_id",
        room_id,
        round_start,
    )
    return {
        row["player_id"]: Totals(
            points=row["points"],
            correct=row["correct"],
            round_points=row["round_points"],
            round_correct=row["round_correct"],
        )
        for row in rows
    }


def _round_start(questions: Sequence[RoomQuestion], position: int | None) -> int:
    """Where the round holding ``position`` starts; 0 for no position."""
    if position is None:
        return 0
    segment = segments.segment_at(segments.segments_of(questions), position)
    return 0 if segment is None else segment.start


async def _fetch_room(conn: asyncpg.Connection, code: str, grace: timedelta) -> asyncpg.Record:
    row = await conn.fetchrow(
        "select id, code, status, settings, current_index, created_at, expires_at, finished_at,"
        " invite_key, public from rooms where code = $1",
        code,
    )
    if row is None:
        raise RoomNotFound(f"no room {code}")
    if _gone(row["expires_at"], row["finished_at"], grace, datetime.now(UTC)):
        raise RoomExpired(f"room {code} has expired")
    return row
