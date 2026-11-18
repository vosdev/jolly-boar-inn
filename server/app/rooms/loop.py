"""The game loop: ``Loop`` drives a room through its questions, and ends or skips them.

The game loop is one ``asyncio.Task`` per room, ``Room.timer``, running
``_run_questions``: open a question, sleep until it closes, close and grade it, sleep
through the reveal, move on. Nothing else drives time. ``skip`` and an early close on
all-answered cut a sleep short through ``Room.advance``, an ``asyncio.Event``, never by
cancelling the task; every sleep is computed from its deadline on the manager's monotonic
clock, so a late wakeup closes immediately instead of drifting and a wall clock that jumps
moves nothing. Wall-clock times are for the wire and the database. The task takes the same
room lock as everything else and, like everything else, sends nothing while holding it.

Between two rounds the loop holds the room in ``standings`` for
``standings_seconds``: the reveal of a round's last question gives way to it, and it gives
way to the next round's splash or first question. It is only ever between rounds. The
game's last question goes straight to ``finished``, whose final standings are the same
picture, and a question inside a round never stops for one.

Scoring is ``rooms/scoring.py``. An answer's band -- its speed bucket, or its
step -- is fixed when it arrives; at the close the type's ``grade`` gives credit, and
``points_for`` pays out on the two, and a worn item (``rooms/items.py``) may add item
points beside them. The answers table is the source of truth for standings: close writes
``correct``, ``points`` and ``item_points``, then re-reads their sum per player into
``Room.totals``. Nothing adds to a running total in memory.

Every change of round breaks the items of the round that ended and deals the next round's,
written before the standings go out, whether or not the standings are shown.
"""

import asyncio
import logging
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg

from app import answer_timings, metrics, question_stats
from app.questions.submission import Submission
from app.questions.types import TYPES, pictured
from app.rooms import items, ready, scoring
from app.rooms.daily_room import finish_attempt, record_close
from app.rooms.errors import BadState
from app.rooms.hold import hold_seconds, typed_lines
from app.rooms.host import RoomHost
from app.rooms.items import Answered, Worn
from app.rooms.models import Broadcast, Player, Room, RoomQuestion, _require_admin
from app.rooms.queries import (
    _count_round_finished,
    _fetch_totals,
    _round_key,
    _round_start,
    _void_question,
)
from app.stats import Metric, bump, duration_bucket
from app.ws.outbox import Frame
from app.ws.protocol import (
    Drop,
    GameFinished,
    PlayerResult,
    QuestionClosed,
    QuestionOpen,
    Segment,
)

log = logging.getLogger("app.rooms")
# Seconds the reveal waits once everyone has answered early, so the last tap is seen to land
# before the answer jumps up.
ALL_ANSWERED_PAUSE_SECONDS = 1.0


def question_hold(question: RoomQuestion) -> float:
    """Seconds the scroll takes to type ``question`` in before its buttons appear."""
    event = question.random_event is not None
    return hold_seconds(
        typed_lines(question.type, question.mode, question.client_view, event), event
    )


def _close_if_everyone_answered(room: Room) -> None:
    """Wake the timer to close the open question early, if nobody connected still owes it.

    An answer, a disconnect and a kick each call this, since any of them can be the change
    that leaves nobody owing one. A phone that drops unanswered is not waited for, because
    it would not have been had it dropped before the others answered, and the order must
    not decide how long the room waits. Lock held.
    """
    question = room.open_question()
    if (
        question is not None
        and room.settings.close_when_all_answered
        and _everyone_answered(room, question)
    ):
        room.advance.set()


def _everyone_answered(room: Room, question: RoomQuestion) -> bool:
    """Has every connected player who is allowed to score answered this question?

    A question nobody may answer (``host_only``) is never "all answered": it runs its
    full time, as "Room lifecycle" says it should.
    """
    eligible = [pid for pid in room.sockets if room.can_answer(question, pid)]
    return bool(eligible) and all(pid in question.answers for pid in eligible)


def _answer_count(room: Room, question: RoomQuestion) -> tuple[int, int]:
    """How many have answered ``question``, of how many can. Lock held.

    The second number is every connected player allowed to answer, plus anyone who
    answered and has since dropped: an answer does not stop counting because its phone
    went to sleep, and the first number never exceeds the second.
    """
    answering = {pid for pid in room.sockets if room.can_answer(question, pid)}
    answering.update(question.answers)
    return len(question.answers), len(answering)


def _waiting(room: Room, question: RoomQuestion) -> list[str]:
    """Who is still to answer ``question``: connected, allowed to, not yet in. Lock held."""
    return [
        str(pid)
        for pid in room.sockets
        if room.can_answer(question, pid) and pid not in question.answers
    ]


def _recount_splash(room: Room, now: float, unready: bool = False) -> None:
    """Start, shorten or stop a splash's countdown to match who is ready. Lock held.

    ``now`` is the manager's clock, which the countdown runs on.

    A no-op outside a splash. Eligible is every connected player who can answer the
    round's first question (``current_index`` points at it during a splash), and only
    their taps count: a player who cannot answer may tap, but holds nobody up either way.

    Only an un-ready (``unready``) stops a running countdown; a connect, a disconnect or a
    kick can start or shorten one but never stop it (``rooms/ready.py`` says why). Any
    change sets ``rescheduled``, so the timer task sleeps to the new ``next_mono``.
    """
    if room.status != "playing" or room.phase != "splash":
        return
    question = room.current
    if question is None:
        return
    eligible = [pid for pid in room.sockets if room.can_answer(question, pid)]
    tapped = sum(1 for pid in eligible if room.players[pid].ready)
    target = ready.countdown(room.next_mono, now, len(eligible), tapped)
    if target is None and not unready:
        return
    if target != room.next_mono:
        room.reschedule(target, now=now, wall=datetime.now(UTC))
        room.rescheduled.set()


async def _wait_for_either(
    first: asyncio.Event, second: asyncio.Event, delay: float | None
) -> None:
    """Wait up to ``delay`` seconds (``None``: for ever) for either event to be set."""
    waiters = [asyncio.ensure_future(first.wait()), asyncio.ensure_future(second.wait())]
    try:
        await asyncio.wait(waiters, timeout=delay, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for waiter in waiters:
            waiter.cancel()


def _stop_timer(room: Room) -> None:
    """Cancel the room's timer task, if it has one, without waiting for it.

    Never awaited here: the task may be blocked on the room lock, which the caller
    usually holds. It takes the cancellation at that await, and every step it could
    still run re-checks that the room is live and playing before it changes anything.
    """
    timer, room.timer = room.timer, None
    if timer is not None and timer is not asyncio.current_task():
        timer.cancel()


def _voidable(room: Room) -> RoomQuestion | None:
    """The question an early end voids: the open one, unless it has just closed."""
    question = room.open_question()
    return question if question is not None and question.closed_at is None else None


def _round_under_way(room: Room) -> Segment | None:
    """The round whose first question has opened and whose last has not closed, if any."""
    segment = room.segment_at(room.current_index or 0)
    if segment is None:
        return None
    first = room.questions[segment.start]
    last = room.questions[segment.start + segment.count - 1]
    return segment if first.shown_at is not None and last.closed_at is None else None


def _last_of_round(room: Room, position: int) -> Segment | None:
    """The round ``position`` ends, if it is that round's last question."""
    segment = room.segment_at(position)
    if segment is None or position != segment.start + segment.count - 1:
        return None
    return segment


def _deals_items(room: Room) -> bool:
    """Whether this room deals items at all: on, and neither a team game nor a daily."""
    return room.settings.items and not room.settings.teams and room.daily is None


async def _write_slots(conn: asyncpg.Connection, slots: Mapping[UUID, Worn | None]) -> None:
    """Store each player's item slot as ``slots`` has it, ``None`` for an empty one."""
    await conn.executemany(
        "update players set item = $2, item_round = $3, item_charges = $4 where id = $1",
        [
            (pid, None, None, None) if worn is None else (pid, worn.item, worn.round, worn.charges)
            for pid, worn in slots.items()
        ],
    )


async def _break_items(conn: asyncpg.Connection, room: Room) -> None:
    """Empty every slot in the room: the round they were for is over. Writes only if any is held."""
    if any(player.item is not None for player in room.players.values()):
        await conn.execute(
            "update players set item = null, item_round = null, item_charges = null"
            " where room_id = $1 and item is not null",
            room.id,
        )


# What ``settle`` added, per wearer: the item, and its points per question.
Settled = dict[UUID, tuple[str, dict[UUID, int]]]


def _keep_settled(room: Room, settled: Settled) -> None:
    """Copy what ``settle`` added onto the answers memory still holds. Lock held."""
    questions = {question.id: question for question in room.questions}
    for pid, (item, gained) in settled.items():
        for qid, points in gained.items():
            answer = questions[qid].answers.get(pid)
            if answer is not None:
                answer.item_points += points
                answer.item = item


def _closed_by(room: Room, question: RoomQuestion) -> Metric:
    """Why the open question is closing now. Lock held.

    Only a skip and everyone having answered wake the timer early, so a wake with everyone
    answered is theirs even when a skip landed in the same moment.
    """
    if not room.advance.is_set():
        return Metric.QUESTIONS_TIMED_OUT
    if room.settings.close_when_all_answered and _everyone_answered(room, question):
        return Metric.QUESTIONS_ALL_ANSWERED
    return Metric.QUESTIONS_SKIPPED


class Loop(RoomHost):
    """The ``RoomManager`` methods that run the timer task and end or skip what it is on."""

    def _live(self, room: Room) -> bool:
        """Is ``room`` still the one in memory under its code, and still playing?"""
        return self.rooms.get(room.code) is room and room.status == "playing"

    async def skip(self, code: str, by: Player, phase: str, index: int) -> None:
        """Admin: cut the splash, the open question, the reveal or the standings short. A
        daily room's player may cut its reveal short, which is its Next button.

        Only if ``phase`` of question ``index`` is still the room's. The second tap of a
        double tap, or a second admin's, lands once the room has moved on, and it must not
        end the phase after the one it meant. It is no error either: what it asked for has
        happened.

        Nothing is broadcast and nothing is awaited here: setting ``advance`` wakes the
        timer task, which owns every state change either way. Each phase clears
        ``advance`` as it starts, so a skip that matched just as the timer moved on by
        itself is spent on the phase it named.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            if room.daily is None or phase != "reveal":
                _require_admin(by)
            if room.status == "playing" and (room.phase, room.current_index) == (phase, index):
                room.advance.set()

    async def end_game(self, code: str, by: Player) -> None:
        """Admin: void whatever is open and finish the game ("Room lifecycle").

        The voided question keeps its answers but is never graded, so those rows stay at
        ``points = null`` and add nothing to anyone's sum.

        Nothing changes in memory, the timer included, until the transaction commits: an
        end the database refused leaves the game running for the host to end again.
        """
        code = code.upper()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            if room.status != "playing":
                raise BadState(f"room {code} is {room.status}, not playing")
            broadcasts = await self._end_game(room)
        for broadcast in broadcasts:
            self._broadcast(broadcast)

    async def _end_game(self, room: Room) -> list[Broadcast]:
        """``end_game`` on a playing room. Lock held; send what it returns."""
        pool = await self._pool()
        voiding = _voidable(room)
        cut_short = _round_under_way(room)
        closed_at = datetime.now(UTC)
        async with pool.acquire() as conn, conn.transaction():
            if voiding is not None:
                await _void_question(conn, voiding, closed_at)
            await conn.execute(
                "update rooms set status = 'finished', finished_at = $2 where id = $1",
                room.id,
                closed_at,
            )
            await bump(conn, Metric.GAMES_ENDED_EARLY)
            await bump(conn, Metric.ENDED_EARLY_AT_ROUND, _round_key(room))
            if cut_short is not None:
                await bump(conn, Metric.ROUNDS_ENDED_EARLY, cut_short.mode)
            await _break_items(conn, room)
        metrics.GAMES.labels(outcome="ended_early").inc()
        _stop_timer(room)
        if voiding is not None:
            voiding.closed_at, voiding.voided = closed_at, True
        return self._finish(room, closed_at)

    async def end_round(self, code: str, by: Player, index: int) -> None:
        """Admin: void whatever is open and cut the round short, on to its standings.

        Only from the round's splash, a question or a reveal, and only while ``index`` is
        still ``current_index``, so a double tap ends one round, as with ``skip``. In the
        game's last round it is ``end_game``.

        The rest of the round stays unshown. ``current_index`` is written as the next
        round's start, so a restart during the standings resumes there (``_recover``)
        rather than in the round that was cut. The timer is replaced rather than woken:
        every phase it could be sleeping in would otherwise need to know about the cut.
        """
        code = code.upper()
        pool = await self._pool()
        async with self._locked(code):
            room = await self._room(code)
            _require_admin(by)
            if (
                room.status != "playing"
                or room.phase not in ("splash", "open", "reveal")
                or room.current_index != index
            ):
                return
            segment = room.segment_at(index)
            assert segment is not None  # every question belongs to a round
            following = segment.start + segment.count
            if following >= len(room.questions):
                broadcasts = await self._end_game(room)
            else:
                voiding = _voidable(room)
                cut_short = _round_under_way(room)
                closed_at = datetime.now(UTC)
                async with pool.acquire() as conn, conn.transaction():
                    if voiding is not None:
                        await _void_question(conn, voiding, closed_at)
                    await conn.execute(
                        "update rooms set current_index = $1 where id = $2", following, room.id
                    )
                    if cut_short is not None:
                        await bump(conn, Metric.ROUNDS_ENDED_EARLY, cut_short.mode)
                    settled = await self._settle_items(conn, room, segment)
                    # Re-read from this round's start: one cut on its splash gained nothing,
                    # and the standings must not repeat the round before's gains.
                    totals = await _fetch_totals(conn, room.id, segment.start)
                _stop_timer(room)
                if voiding is not None:
                    voiding.closed_at, voiding.voided = closed_at, True
                _keep_settled(room, settled)
                room.totals, room.totals_round = totals, segment.start
                room.clear_deadline()
                self._start_timer(room, following, standings_after=following - 1)
                return
        for broadcast in broadcasts:
            self._broadcast(broadcast)

    def _start_timer(
        self,
        room: Room,
        index: int,
        resume_at: float | None = None,
        standings_after: int | None = None,
    ) -> None:
        """Hand the room to its one timer task, starting at ``index``.

        ``start_game`` calls this with the lock released, right after its own broadcast,
        so the first thing the task does cannot overtake it. ``_recover`` calls it
        under the lock instead, passing the ``resume_at`` that starts the task in a reveal
        rather than on an open: there is nothing to overtake in a room that has no sockets
        yet, and the task's first move is to sleep anyway.
        """
        if not self._live(room):
            return
        room.timer = asyncio.create_task(
            self._run_questions(room, index, resume_at, standings_after),
            name=f"room-{room.code}-timer",
        )

    async def _run_questions(
        self,
        room: Room,
        index: int,
        resume_at: float | None = None,
        standings_after: int | None = None,
    ) -> None:
        """The one task per room: open → close → reveal → next, until the game ends.

        Every step takes the room lock again and re-checks that this room is still the
        live one and still playing, so a game that ends underneath the task (``end_game``,
        eviction) stops it at the next step whether or not the cancellation lands first.

        ``resume_at`` enters the loop one step in, in a reveal that ends then, and
        ``index`` is the question that reveal belongs to rather than one to open. It
        rejoins at the top of the loop, so a recovered room that owes the first question
        of a round introduces that round again before opening it.

        ``standings_after`` is the last question of a round ``end_round`` cut short: its
        standings come first, then ``index`` opens as usual.

        A resumed reveal has lost its round's standings, if it had any, but not its drop:
        the items change hands all the same, unseen.

        A step that raises restarts the room (``_restart``) rather than leaving it in
        memory with nothing to move it on.
        """
        try:
            if resume_at is not None:
                await self._sleep_until(room, resume_at)
                if not await self._standings(room, index, shown=False):
                    return
                following = await self._advance(room, index)
                if following is None:
                    return
                index = following
            if standings_after is not None and not await self._standings(room, standings_after):
                return
            while True:
                if not await self._splash(room, index):
                    return
                question = await self._open_question(room, index)
                if question is None or question.ends_mono is None:
                    return
                await self._sleep_until(room, question.ends_mono)
                await self._pause_if_all_answered(room, question)
                reveal_ends = await self._close_question(room, question)
                if reveal_ends is None:
                    return
                await self._sleep_until(room, reveal_ends)
                if not await self._standings(room, index):
                    return
                following = await self._advance(room, index)
                if following is None:
                    return
                index = following
        except asyncio.CancelledError:
            raise
        except Exception:  # a broken question or a database failure must not go silent
            log.exception("room %s: a timer step failed, restarting the room", room.code)
            await self._restart(room)
        finally:
            if room.timer is asyncio.current_task():
                room.timer = None

    async def _sleep_until(self, room: Room, deadline: float) -> None:
        """Wait until ``deadline`` on the manager's clock, or until ``room.advance`` is set.

        The delay is measured against the clock every time rather than counted down, so
        a wakeup that is late (a busy event loop) closes the question immediately instead
        of pushing the rest of the game back by that much.
        """
        delay = max(0.0, deadline - self.clock())
        try:
            async with asyncio.timeout(delay):
                await room.advance.wait()
        except TimeoutError:
            pass

    async def _pause_if_all_answered(self, room: Room, question: RoomQuestion) -> None:
        """Hold a question everyone answered early open ``all_answered_pause`` longer.

        Never past its own end, and not for a timeout, a skip that came first or a room
        that has moved on. The question still takes answers meanwhile.
        """
        async with room.lock:
            if room.open_question() is not question or _closed_by(room, question) != (
                Metric.QUESTIONS_ALL_ANSWERED
            ):
                return
        assert question.ends_mono is not None  # set when the question opened
        await asyncio.sleep(
            min(self.all_answered_pause, max(0.0, question.ends_mono - self.clock()))
        )

    async def _splash(self, room: Room, index: int) -> bool:
        """Introduce the round ``index`` starts, if it starts one. False: the room is gone.

        The splash introduces a *segment*: it runs before a segment's first question and
        before no other. It used to introduce a mode -- "before a question whose mode
        differs from the one before it" -- which was the same rule until random events,
        and is wrong twice over with them: an event would get a splash it must not have,
        and the question after it a second one for a mode already introduced. A segment
        groups an event into the round it interrupts (``segments.py``), and an event is
        never a segment's first question, so it gets no introduction at all: that is what
        makes it an interruption, and the NPC is its own announcement.

        Nothing is written to the database -- ``current_index`` was persisted by
        ``start_game`` or ``_advance`` before this ran, and ``phase`` has never been a
        column, so a restart mid-splash is a restart before a question that never opened,
        which ``_recover`` already knows how to resume.
        """
        async with room.lock:
            if not self._live(room):
                return False
            segment = room.segment_at(index)
            if (
                not self.splashes
                or room.daily is not None
                or segment is None
                or segment.start != index
            ):
                return True
            room.current_index = index
            # No clock: the splash waits for the room (``rooms/ready.py``) or the host.
            room.enter("splash", now=self.clock(), wall=datetime.now(UTC))
            # Each splash is its own ready check: being ready for the last round is not
            # being ready for this one.
            room.reset_ready()
            update = self._room_updated(room)
        self._broadcast(update)
        await self._sleep_through_splash(room)
        return True

    async def _sleep_through_splash(self, room: Room) -> None:
        """Wait out a splash, which ends when the room is ready rather than on a clock.

        ``next_mono`` is ``None`` until the ready check starts a countdown, and it can be
        started, shortened or stopped while this sleeps: each change sets
        ``rescheduled``, and this wakes, reads the new time and sleeps again. ``skip``
        sets ``advance`` and ends it at once, as it ends any other sleep. Reading
        ``next_mono`` and clearing ``rescheduled`` happen with no await between them, so a
        change is never lost between the read and the wait.
        """
        while True:
            target = room.next_mono
            room.rescheduled.clear()
            if room.phase != "splash" or room.advance.is_set():
                return
            if target is None:
                await _wait_for_either(room.advance, room.rescheduled, None)
                continue
            delay = target - self.clock()
            if delay <= 0:
                return
            await _wait_for_either(room.advance, room.rescheduled, delay)

    async def _standings(self, room: Room, index: int, shown: bool = True) -> bool:
        """Change items and hold the standings up if ``index`` ended a round. False: the
        room is gone.

        Only a round's last question ends one, and never the game's last: that one goes
        to ``finished``, whose final screen is these same standings. The round's items
        break and the next round's are dealt first (``_deal``), even with the phase off:
        ``standings_seconds`` at zero, or not ``shown``. A drop with receivers holds the
        standings ``items.DROP_SECONDS`` longer. ``room_updated`` carries the standings
        and the drop: a round ``end_round`` cut short had no reveal to carry them.

        Like the splash, the phase is not written, and a restart here resumes in the
        reveal (``_recover``) and moves straight on, which costs that round its standings
        and nothing else: the drop was written before them, and dealing it again deals the
        same.
        """
        async with room.lock:
            if not self._live(room):
                return False
            segment = _last_of_round(room, index)
            if segment is None or index + 1 >= len(room.questions):
                return True
            drops = await self._deal(room, segment)
            seconds = room.settings.standings_seconds
            if seconds <= 0 or not shown:
                return True
            if drops:
                seconds += items.DROP_SECONDS
            now = self.clock()
            # Clears ``advance``: a skip that landed during the reveal was spent on it.
            room.enter("standings", seconds=seconds, now=now, wall=datetime.now(UTC))
            ends = now + seconds
            update = self._room_updated(room, standings=True)
        self._broadcast(update)
        await self._sleep_until(room, ends)
        return True

    async def _deal(self, room: Room, ended: Segment) -> list[Drop]:
        """Break the items of round ``ended`` and deal the next round's. Lock held.

        Every slot is written before memory, so a restart finds the new items and no old
        one. Returns the drop in standings order, which ``room.drops`` keeps for the view.
        """
        following = room.segments[ended.index + 1]
        standings = room.standings()
        dealt: dict[UUID, Worn] = {}
        if _deals_items(room):
            dealt = items.deal(
                self.items,
                [(s.player_id, s.rank) for s in standings],
                room.code,
                following.index,
                room.questions[following.start : following.start + following.count],
                room.rematches,
            )
        if dealt or any(player.item is not None for player in room.players.values()):
            pool = await self._pool()
            async with pool.acquire() as conn, conn.transaction():
                await _break_items(conn, room)
                await _write_slots(conn, dealt)
        for player in room.players.values():
            player.item = dealt.get(player.id)
        room.drops = [
            Drop(player_id=s.player_id, item=dealt[s.player_id].item)
            for s in standings
            if s.player_id in dealt
        ]
        return room.drops

    async def _settle_items(
        self,
        conn: asyncpg.Connection,
        room: Room,
        segment: Segment,
        slots: Mapping[UUID, Worn | None] | None = None,
    ) -> Settled:
        """Run each worn item's ``settle`` on its wearer's graded answers of ``segment``,
        and add what it gives to those rows. ``slots`` are the ones this close changed and
        memory does not have yet: an item that broke on it settles nothing.
        """
        slots = slots or {}
        worn_now = {
            player.id: slots[player.id] if player.id in slots else player.item
            for player in room.players.values()
        }
        wearers = {
            pid: (worn, item)
            for pid, worn in worn_now.items()
            if worn is not None
            and (item := items.by_id(self.items, worn.item)) is not None
            and item.settle is not None
        }
        if not wearers:
            return {}
        rows = await conn.fetch(
            "select a.player_id, a.question_id, a.points from answers a"
            " join questions q on q.id = a.question_id"
            " where q.room_id = $1 and q.position between $2 and $3"
            " and a.points is not null and a.player_id = any($4::uuid[])"
            " order by q.position",
            room.id,
            segment.start,
            segment.start + segment.count - 1,
            list(wearers),
        )
        answered: dict[UUID, dict[UUID, int]] = {pid: {} for pid in wearers}
        for row in rows:
            answered[row["player_id"]][row["question_id"]] = row["points"]
        settled: Settled = {}
        for pid, (worn, item) in wearers.items():
            assert item.settle is not None
            gained = {q: points for q, points in item.settle(worn, answered[pid]).items() if points}
            if gained:
                settled[pid] = (worn.item, gained)
        await conn.executemany(
            "update answers set item_points = item_points + $1, item = $2"
            " where question_id = $3 and player_id = $4",
            [
                (points, item, qid, pid)
                for pid, (item, gained) in settled.items()
                for qid, points in gained.items()
            ],
        )
        return settled

    async def _open_question(self, room: Room, index: int) -> RoomQuestion | None:
        """``pending → open``: stamp ``shown_at``, broadcast ``question_open``.

        A question opens muted: on screen now, taking answers from ``answerable_at``, and
        open for its own ``seconds`` from then rather than from now, so the typing does not
        come out of the time to answer. It is the same one frame either way; the
        client counts down to ``answerable_at`` itself, so the buttons appearing needs no
        message of its own.
        """
        pool = await self._pool()
        async with room.lock:
            if not self._live(room):
                return None
            if not 0 <= index < len(room.questions):
                return None
            question = room.questions[index]
            shown_at, now = datetime.now(UTC), self.clock()
            segment = room.segment_at(index)
            assert segment is not None  # every question belongs to a round
            async with pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    "update questions set shown_at = $1 where id = $2", shown_at, question.id
                )
                if index == segment.start and room.daily is None:
                    await bump(conn, Metric.ROUNDS_STARTED, segment.mode)
            # Read off the payload only once it is stamped shown: a payload this build cannot
            # draw then raises into a restart that voids it, rather than one that owes it
            # again and fails again.
            seconds = self._answer_seconds(room, question)
            hold = question_hold(question)
            question.shown_at = shown_at
            question.seconds = seconds
            question.answerable_at = shown_at + timedelta(seconds=hold)
            question.ends_at = question.answerable_at + timedelta(seconds=seconds)
            question.answerable_mono = now + hold
            question.ends_mono = question.answerable_mono + seconds
            room.current_index = index
            room.enter("open", now=now, wall=shown_at)
            count = _answer_count(room, question)
            waiting = _waiting(room, question)
            # Only ``you_can_answer`` tells sockets apart, so there are two frames at most.
            frames: dict[bool, Frame] = {}

            def frame(can: bool) -> Frame:
                if can not in frames:
                    view = question.view(
                        room.total,
                        can,
                        segment,
                        count,
                        self._open_picture(question),
                        self._pictures(question),
                        waiting,
                    )
                    frames[can] = Frame(QuestionOpen(question=view).model_dump(mode="json"))
                return frames[can]

            opened = Broadcast(
                [(out, frame(room.can_answer(question, pid))) for pid, out in room.sockets.items()]
            )
        self._broadcast(opened)
        return question

    async def _close_question(self, room: Room, question: RoomQuestion) -> float | None:
        """``open → closed``: grade, write the points, broadcast ``question_closed``.

        Returns when the reveal ends on the manager's clock, or ``None`` if the room
        stopped playing underneath us. This is the only place ``answers.correct`` and
        ``answers.points`` are written, and the standings that go out with the reveal are
        the table's own sum, re-read here once the points are in.

        A worn item's ``on_answer`` runs on each answer after ``points_for``, and the
        round's last question settles every worn item's ``settle``. Both add item points,
        never credit: ``question_stats`` and ``answer_timings`` get the type's credit alone.

        Grading and the reveal run before the write, because a type's bug shows up there,
        and nothing in memory changes until the write has committed. A close that fails
        leaves the question open in both, for the restart to void.
        """
        pool = await self._pool()
        async with room.lock:
            if not self._live(room):
                return None
            if room.phase != "open" or room.current is not question:
                return None
            closed_at, now = datetime.now(UTC), self.clock()
            closed_by = _closed_by(room, question)
            module = TYPES[question.type]
            # Everything in ``answers`` passed ``can_answer`` on the way in, so grading
            # never has to re-check the exclusions.
            credit = module.grade(
                question.payload,
                [Submission(pid, answer.value) for pid, answer in question.answers.items()],
            )
            how = question.scoring
            team = bool(room.settings.teams)
            graded: dict[UUID, tuple[float, bool, int]] = {}
            boosts: dict[UUID, tuple[int, str]] = {}
            slots: dict[UUID, Worn | None] = {}
            for pid, answer in question.answers.items():
                got = scoring.settle_credit(question.type, credit.get(pid, 0.0))
                points = scoring.points_for(how, got, answer.band, question.steps, team=team)
                # Full marks only. Three of five in the right order scores, and is not
                # "correct" for the standings tie-break ("Scoring").
                graded[pid] = (got, got >= 1.0, points)
                worn = room.players[pid].item
                item = None if worn is None else items.by_id(self.items, worn.item)
                if worn is not None and item is not None and item.on_answer is not None:
                    effect = item.on_answer(worn, Answered(question, got, answer.band, points))
                    if effect.points:
                        boosts[pid] = (effect.points, worn.item)
                    if effect.worn != worn:
                        slots[pid] = effect.worn
            ending = _last_of_round(room, question.position)
            reveal = pictured(
                question.type,
                module.reveal(question.payload),
                question.payload,
                self._pictures(question),
            )
            async with pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    "update questions set closed_at = $1 where id = $2", closed_at, question.id
                )
                if room.daily is None:
                    await _count_round_finished(conn, room, question.position, closed_at)
                    await bump(conn, closed_by, question.mode)
                else:
                    # One player: their answer, or a miss.
                    got, _, points = next(iter(graded.values()), (None, False, 0))
                    await record_close(conn, room, got, points)
                if graded:
                    await conn.executemany(
                        "update answers set correct = $1, points = $2, item_points = $3,"
                        " item = $4 where question_id = $5 and player_id = $6",
                        [
                            (correct, points, *boosts.get(pid, (0, None)), question.id, pid)
                            for pid, (_, correct, points) in graded.items()
                        ],
                    )
                if slots:
                    await _write_slots(conn, slots)
                got_credit = {pid: got for pid, (got, _, _) in graded.items()}
                await answer_timings.record(conn, room, question, got_credit, closed_at)
                await question_stats.record(conn, room, question, got_credit)
                settled: Settled = {}
                if ending is not None:
                    settled = await self._settle_items(conn, room, ending, slots)
                round_start = _round_start(room, question.position)
                totals = await _fetch_totals(conn, room.id, round_start)
            question.closed_at = closed_at
            for pid, (got, correct, points) in graded.items():
                answer = question.answers[pid]
                answer.credit, answer.correct, answer.points = got, correct, points
                answer.item_points, answer.item = boosts.get(pid, (0, None))
            for pid, slot in slots.items():
                room.players[pid].item = slot
            _keep_settled(room, settled)
            room.totals = totals
            room.totals_round = round_start
            hold, shown = self._reveal_hold(room, question)
            room.enter("reveal", seconds=hold, reveal_seconds=shown, now=now, wall=closed_at)
            reveal_ends = now + hold
            message = QuestionClosed(
                question_id=str(question.id),
                reveal=reveal,
                picture=self._picture(question),
                results={
                    pid: PlayerResult(
                        value=answer.value,
                        correct=bool(answer.correct),
                        credit=answer.credit or 0.0,
                        points=answer.points or 0,
                        item_points=answer.item_points,
                        item=answer.item,
                    )
                    for pid, answer in question.answers.items()
                },
                unanswered=[
                    pid
                    for pid in room.sockets
                    if room.can_answer(question, pid) and pid not in question.answers
                ],
                standings=room.standings(),
                team_standings=room.team_standings(),
                next_at=room.next_at,
                reveal_seconds=room.reveal_seconds,
                suggested_by=question.suggested_by,
            )
            closed = Broadcast.to_all(room, message.model_dump(mode="json"))
        self._broadcast(closed)
        return reveal_ends

    async def _advance(self, room: Room, index: int) -> int | None:
        """``closed → next pending``, or the end of the game.

        Returns the next index, or ``None`` when the room finished or is no longer ours.
        The index change is not broadcast on its own; the ``question_open`` that follows
        immediately carries it.
        """
        pool = await self._pool()
        async with room.lock:
            if not self._live(room):
                return None
            following = index + 1
            async with pool.acquire() as conn, conn.transaction():
                if following < len(room.questions):
                    await conn.execute(
                        "update rooms set current_index = $1 where id = $2", following, room.id
                    )
                else:
                    finished_at = datetime.now(UTC)
                    await conn.execute(
                        "update rooms set status = 'finished', finished_at = $2 where id = $1",
                        room.id,
                        finished_at,
                    )
                    await _break_items(conn, room)
                    if room.daily is not None:
                        await finish_attempt(conn, room, finished_at)
                    else:
                        await bump(conn, Metric.GAMES_FINISHED)
                        started_at = room.questions[0].shown_at
                        if started_at is not None:
                            await bump(
                                conn,
                                Metric.GAME_DURATIONS,
                                duration_bucket(finished_at - started_at),
                            )
            if following < len(room.questions):
                room.current_index = following
                room.clear_deadline()
                return following
            if room.daily is None:
                metrics.GAMES.labels(outcome="finished").inc()
            broadcasts = self._finish(room, finished_at)
        for broadcast in broadcasts:
            self._broadcast(broadcast)
        return None

    def _finish(self, room: Room, finished_at: datetime) -> list[Broadcast]:
        """``playing → finished`` in memory, once the database says so. Lock held; send
        what it returns.

        ``room_updated`` goes first so a client knows the room is over before the final
        standings land.
        """
        room.status = "finished"
        room.finished_at = finished_at
        room.enter("idle", now=self.clock(), wall=finished_at)
        for player in room.players.values():
            player.item = None
        finished = GameFinished(standings=room.standings(), team_standings=room.team_standings())
        return [
            self._room_updated(room),
            Broadcast.to_all(room, finished.model_dump(mode="json")),
        ]
