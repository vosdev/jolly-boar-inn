"""Per-question totals in ``question_stats``: how players score on each pack question.

A close adds to its question's row inside the transaction that writes ``answers.points``,
so a close that rolls back adds nothing. It sums credit, not points: speed buckets and team
games would skew points. Only hand-written round-pack questions count: no event, host or
voided question, and no price mode, whose pack is regenerated from the roster. Admins'
answers are left out, and
so is a close with fewer than two other players, since a solo player learns the questions
by repeating them.
"""

from collections.abc import Mapping
from uuid import UUID

import asyncpg

from app.reports import ITEM_MODES
from app.rooms.models import Room, RoomQuestion

# Two players at least: a room of one replays the same questions until it knows them.
MIN_PLAYERS = 2


def counts(question: RoomQuestion) -> bool:
    """Whether ``question``'s closes are recorded at all."""
    return (
        question.source == "pack"
        and question.random_event is None
        and question.mode not in ITEM_MODES
        and not question.host_only
    )


async def record(
    conn: asyncpg.Connection, room: Room, question: RoomQuestion, credit: Mapping[UUID, float]
) -> None:
    """Add a graded close's answers, with ``credit`` per player who answered, to its row."""
    if not counts(question):
        return
    present = {pid for pid in room.sockets if question.can_answer(pid)} | set(credit)
    players = {pid for pid in present if not room.is_admin(pid)}
    if len(players) < MIN_PLAYERS:
        return
    got = [credit[pid] for pid in players if pid in credit]
    await conn.execute(
        "insert into question_stats"
        " (question_id, mode, answers, credit_sum, correct, unanswered, games)"
        " values ($1, $2, $3, $4, $5, $6, 1)"
        " on conflict (question_id) do update set"
        " mode = excluded.mode,"
        " answers = question_stats.answers + excluded.answers,"
        " credit_sum = question_stats.credit_sum + excluded.credit_sum,"
        " correct = question_stats.correct + excluded.correct,"
        " unanswered = question_stats.unanswered + excluded.unanswered,"
        " games = question_stats.games + 1",
        question.content_id,
        question.mode,
        len(got),
        sum(got),
        sum(1 for c in got if c >= 1.0),
        len(players) - len(got),
    )
