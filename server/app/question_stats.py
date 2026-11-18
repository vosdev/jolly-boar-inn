"""Per-question totals in ``question_stats``: how players score on each pack question.

A close adds to its question's row inside the transaction that writes ``answers.points``,
so a close that rolls back adds nothing. It sums credit, not points: speed buckets and team
games would skew points. Only hand-written pack questions count, the NPCs' included: no
host or voided question, and no price mode, whose pack is regenerated from the roster.
Admins' answers and the Book of Knowledge's are left out, and so is a close with fewer than
two other players, since a solo player learns the questions by repeating them. A daily
room's one player counts while connected: a daily is played once, so each answer is a first
sight.
"""

from collections.abc import Iterable, Mapping
from typing import Any
from uuid import UUID

import asyncpg

from app.modes import entry
from app.questions.packs import Pack, mode_questions
from app.rooms.models import Room, RoomQuestion

TOTALS = ("answers", "credit_sum", "correct", "unanswered", "games")

# Two players at least: a room of one replays the same questions until it knows them.
MIN_PLAYERS = 2


def counts(question: RoomQuestion) -> bool:
    """Whether ``question``'s closes are recorded at all."""
    return (
        question.source == "pack"
        and entry(question.mode).report != "item"
        and not question.host_only
    )


def players(room: Room, question: RoomQuestion, credit: Mapping[UUID, float]) -> set[UUID]:
    """Who a close of ``question`` counts, answered or not; nobody if it counts not at all."""
    if not counts(question):
        return set()
    present = {pid for pid in room.sockets if room.can_answer(question, pid)} | set(credit)
    # The Book of Knowledge answered for them: neither an answer of theirs nor a miss.
    booked = {pid for pid, answer in question.answers.items() if answer.by_book}
    counted = {pid for pid in present - booked if not room.is_admin(pid)}
    if len(counted) < (1 if room.daily is not None else MIN_PLAYERS):
        return set()
    return counted


async def record(
    conn: asyncpg.Connection, room: Room, question: RoomQuestion, credit: Mapping[UUID, float]
) -> None:
    """Add a graded close's answers, with ``credit`` per player who answered, to its row."""
    counted = players(room, question, credit)
    if not counted:
        return
    got = [credit[pid] for pid in counted if pid in credit]
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
        len(counted) - len(got),
    )


async def listing(
    pool: asyncpg.Pool, packs: Iterable[Pack], modes: Iterable[str]
) -> list[dict[str, Any]]:
    """Every pack question of ``modes``, whole, with its totals; zeros for one never counted.

    A row whose id the packs no longer hold, left by a payload edit, is not listed.
    """
    rows = await pool.fetch("select question_id, " + ", ".join(TOTALS) + " from question_stats")
    totals = {row["question_id"]: {key: row[key] for key in TOTALS} for row in rows}
    zero = dict.fromkeys(TOTALS, 0)
    return [
        {"question": question, **totals.get(question["id"], zero)}
        for mode in modes
        for question in mode_questions(packs, mode)
    ]
