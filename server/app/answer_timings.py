"""Anonymous answer timings in ``answer_timings``: the numbers scoring is tuned with.

A close adds one row per counted answer inside the transaction that writes
``answers.points``, so a close that rolls back adds nothing. It counts the answers
``question_stats`` counts, by the same rule, but only those given: a miss has no time.
A row carries no player, room or question id, so cleanup deleting a room leaves it.
"""

from collections.abc import Mapping
from datetime import datetime, timedelta
from uuid import UUID

import asyncpg

from app import question_stats
from app.questions.types import items_of
from app.rooms.models import Room, RoomQuestion


async def record(
    conn: asyncpg.Connection,
    room: Room,
    question: RoomQuestion,
    credit: Mapping[UUID, float],
    closed_at: datetime,
) -> None:
    """Add a row for each counted answer to ``question``, with its settled ``credit``."""
    answered = [pid for pid in question_stats.players(room, question, credit) if pid in credit]
    if not answered:
        return
    # Both set when the question opened.
    assert question.answerable_at is not None and question.seconds is not None
    elapsed = [
        round(
            (question.answers[pid].received_at - question.answerable_at) / timedelta(milliseconds=1)
        )
        for pid in answered
    ]
    await conn.execute(
        "insert into answer_timings (type, mode, scoring, pace, items, seconds, elapsed_ms,"
        " credit, team, played_on)"
        " select $1, $2, $3, $4, $5, $6, elapsed_ms, credit, $7, $8"
        " from unnest($9::integer[], $10::real[]) as t (elapsed_ms, credit)",
        question.type,
        question.mode,
        str(question.scoring),
        room.settings.pace,
        items_of(question.type, question.payload),
        question.seconds,
        bool(room.settings.teams),
        closed_at.date(),
        elapsed,
        [credit[pid] for pid in answered],
    )
