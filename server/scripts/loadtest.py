"""Load test: 30 bots play one room over websockets and check what came back.

Not a unit test and not part of CI: it needs a live server and a live database, and it
takes as long as the game it plays (about six and a half minutes at the defaults). Run it
against ``make dev``::

    make loadtest

or inside the compose stack, where the bundled Postgres is not published to the host and
the script has to run on the same side of the bridge as the app::

    docker compose exec app python scripts/loadtest.py

What it asserts, in the order the report prints them (section 8):

1. Thirty questions at ``--question-seconds`` complete with zero ``error`` frames.
2. p99 from sending ``answer`` to receiving ``answer_ack`` is under ``--p99-ms``.
   p50 and p95 are printed next to it, because one number cannot tell a slow tail from a
   slow everything.
3. The ``answers`` table holds exactly one row per acknowledged answer. The expected
   count is what the bots actually sent and had acknowledged, counted as they went --
   never ``bots x questions``, which is a guess about how the run behaved rather than an
   observation of it.
4. All thirty ``game_finished`` frames carry byte-identical standings.

**Bot 0 is the admin.** ``POST /api/rooms`` makes its caller the room's first admin and
hands back that player's session, so the alternative -- creating the room from the script
and having thirty more players join -- would leave a thirty-first player sitting in the
room doing nothing but holding the start button. Bot 0 holds the creator session, sends
``start_game``, and otherwise answers questions like the other twenty-nine.

**On the p99 number.** Every ``RoomManager`` method takes the room's single
``asyncio.Lock``, so simultaneous answers serialise behind it; the number this script
prints is the cost of that queue plus the ``insert into answers`` each turn in the queue
performs. The bots answer at uniformly random points inside the question window because
that is what thirty people with phones do, not to spread the load out -- nothing here
staggers them any further, and if the tail is bad the report says so rather than hiding
it behind a wider spread.

**Room settings.** ``close_when_all_answered`` is off and ``splash_seconds`` is zero. The
first is not tidiness: with early close on, the last bot to answer ends the question, and
an answer scheduled a few milliseconds behind it would race that close and come back
``not_open`` -- an assertion failure caused by the test's own timing rather than by the
server. With it off, every question runs its full window and the only thing that closes
one is the clock.
"""

import argparse
import asyncio
import json
import math
import random
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import asyncpg
import websockets
from websockets.exceptions import ConnectionClosed

from app.config import get_settings

DEFAULT_BOTS = 30
DEFAULT_QUESTIONS = 30
DEFAULT_QUESTION_SECONDS = 10
# The floor NewRoomSettings allows. A load test has nothing to read on the reveal screen.
DEFAULT_REVEAL_SECONDS = 3
DEFAULT_P99_MS = 200.0

HTTP_TIMEOUT = 15
# How long a bot waits for the welcome that answers its hello before giving up on the run.
WELCOME_TIMEOUT = 30
# Section 3: the client pings every 30 s. The bots do too, so the run exercises it.
PING_EVERY = 30.0

# Where in a question's window a bot answers, as a fraction of it. The lower bound keeps
# the answer behind the question_open that announced it; the upper bound leaves a margin
# before ends_at so a scheduled send cannot arrive after the timer has closed the
# question. Nothing between the two is shaped: it is a flat draw.
ANSWER_FRACTION = (0.05, 0.85)
# The bot chosen for a question drops this far into the window and stays away this many
# seconds. The range straddles the earliest answer time above on purpose, so that over
# thirty questions some bots reconnect with their answer already in and some with it
# still to come -- the first rebuilds ``your_answer`` from the snapshot, the second
# arrives to a question it has yet to answer. Both are section 3's reconnect flow.
DROP_AT = (0.02, 0.30)
OFFLINE_FOR = 0.5


def percentile(ordered: list[float], p: float) -> float:
    """Nearest-rank percentile of an already sorted list. ``ordered`` must be non-empty.

    Nearest-rank rather than an interpolating definition because the question this
    answers is "how slow was the slow one", and interpolating invents a latency that no
    answer actually had.
    """
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]


def post(url: str, body: dict[str, Any]) -> dict[str, Any]:
    """One JSON POST, blocking. Raises ``RunFailed`` with the server's own message."""
    request = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers={"content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:400]
        raise RunFailed(f"POST {url} -> {exc.code}: {detail}") from None
    except (urllib.error.URLError, OSError) as exc:
        raise RunFailed(f"POST {url} could not be reached: {exc}") from None


class RunFailed(Exception):
    """The run could not be set up or could not be carried out. Not an assertion result."""


@dataclass
class Ack:
    """One measured ``answer`` -> ``answer_ack`` round trip."""

    seconds: float
    bot: int
    question_index: int
    band: int | None


@dataclass
class Run:
    """Everything the bots share: the configuration, and what they collect as they go."""

    ws_url: str
    bots: int
    questions: int
    question_seconds: int
    rng: random.Random

    acks: list[Ack] = field(default_factory=list)
    # Any `error` frame at all, from any bot. Assertion 1 is that this stays empty.
    errors: list[str] = field(default_factory=list)
    # Things that did not fail an assertion but that the report should not swallow.
    warnings: list[str] = field(default_factory=list)
    # What the reconnecting bots came back to, which is the only way to tell from the
    # outside that both halves of the reconnect flow ran rather than one of them twice.
    rejoined_answered: int = 0  # a question this bot had already answered: your_answer set
    rejoined_pending: int = 0  # a question still to answer
    rejoined_between: int = 0  # no question open: a reveal, or the lobby

    def reconnector_for(self, question_index: int) -> int:
        """Which bot drops and comes back during this question.

        One bot per question, rotating, so at the defaults each of the thirty goes
        through the full hello/welcome path exactly once during the game.
        """
        return question_index % self.bots

    def answer_at(self, window: float) -> float:
        low, high = ANSWER_FRACTION
        return window * self.rng.uniform(low, high)


class Bot:
    """One player: a socket, a reconnect loop, and a scheduled answer per question."""

    def __init__(self, run: Run, index: int, name: str, session: str, player_id: str) -> None:
        self.run = run
        self.index = index
        self.name = name
        self.session = session
        self.player_id = player_id

        self.ws: Any = None
        self.online = asyncio.Event()
        self.idle = asyncio.Event()  # no answer is in flight
        self.idle.set()
        self.done = asyncio.Event()  # game_finished has arrived
        self.leaving = False  # the game is over; stop reconnecting
        self.dropping = False  # this close is ours, not the server's

        self.current: dict[str, Any] | None = None  # the open question, as we last saw it
        self.scheduled: set[str] = set()  # question ids we have an answer task for
        self.answered: set[str] = set()  # question ids the server has acknowledged
        # question id -> (perf_counter at send, question index). The index rides along
        # because the ack may arrive after question_closed has cleared ``current``.
        self.pending: dict[str, tuple[float, int]] = {}

        self.sent = 0
        self.acked = 0
        self.missed: list[int] = []  # question indexes we never got an answer in for
        self.connects = 0
        self.standings: list[dict[str, Any]] | None = None
        self.tasks: set[asyncio.Task[None]] = set()

    # --- the socket ---------------------------------------------------------------

    def _spawn(self, coro: Any) -> None:
        task = asyncio.create_task(coro)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    async def send(self, message: dict[str, Any]) -> bool:
        """Send one frame. ``False`` if the socket went away underneath us."""
        ws = self.ws
        if ws is None:
            return False
        try:
            await ws.send(json.dumps(message))
        except ConnectionClosed, RuntimeError, OSError:
            return False
        return True

    async def run_socket(self) -> None:
        """Connect, say hello, read frames; reconnect until the game is over.

        A deliberate drop and a socket the server closed on us take the same path back
        in -- a fresh connection and a fresh ``hello`` -- which is the point: the
        reconnecting bot rebuilds its state from ``welcome`` and from nothing else.
        """
        while not self.leaving:
            try:
                async with websockets.connect(
                    self.run.ws_url,
                    open_timeout=WELCOME_TIMEOUT,
                    close_timeout=2,
                    # Our own `ping` frames are the heartbeat (section 3); the library's
                    # protocol-level ping would only add a second one whose timeout a
                    # busy event loop could trip.
                    ping_interval=None,
                ) as ws:
                    self.ws = ws
                    self.connects += 1
                    await ws.send(json.dumps({"t": "hello", "session": self.session}))
                    async for raw in ws:
                        await self.on_frame(json.loads(raw))
            except ConnectionClosed as exc:
                if not self.dropping and not self.leaving:
                    self.run.warnings.append(
                        f"bot {self.index} lost its socket: close {exc.rcvd or exc.sent}"
                    )
            except (OSError, TimeoutError) as exc:
                if not self.leaving:
                    self.run.warnings.append(f"bot {self.index} could not connect: {exc!r}")
            finally:
                self.ws = None
                self.online.clear()
            if self.leaving:
                break
            self.dropping = False
            await asyncio.sleep(OFFLINE_FOR)

    async def ping_forever(self) -> None:
        while not self.leaving:
            await asyncio.sleep(PING_EVERY)
            if self.online.is_set():
                await self.send({"t": "ping"})

    # --- frames -------------------------------------------------------------------

    async def on_frame(self, frame: dict[str, Any]) -> None:
        match frame.get("t"):
            case "welcome":
                self.on_welcome(frame)
            case "question_open":
                self.on_question(frame["question"], from_welcome=False)
            case "answer_ack":
                self.on_ack(frame)
            case "question_closed":
                self.on_closed(frame)
            case "game_finished":
                self.standings = frame["standings"]
                self.done.set()
                self.leaving = True
                ws = self.ws
                if ws is not None:
                    await ws.close()
            case "error":
                self.run.errors.append(
                    f"bot {self.index} ({self.name}): {frame['code']} - {frame['message']}"
                )
            case _:
                pass  # room_updated, pong: nothing here depends on them

    def on_welcome(self, frame: dict[str, Any]) -> None:
        """Rebuild everything from the snapshot, as section 3's reconnect flow requires.

        The only state carried across the gap is what this bot did itself -- which
        questions it has an acknowledgement for. Everything about the room comes from
        here, and the two are cross-checked: a question we were acknowledged for must
        come back with ``your_answer`` set, or the row did not survive.
        """
        question = frame.get("question")
        self.current = question
        if self.connects > 1:  # a reconnect, not this bot's first hello
            if question is None:
                self.run.rejoined_between += 1
            elif frame.get("your_answer") is not None:
                self.run.rejoined_answered += 1
            else:
                self.run.rejoined_pending += 1
        if question is not None:
            answered_here = question["question_id"] in self.answered
            if answered_here and frame.get("your_answer") is None:
                self.run.errors.append(
                    f"bot {self.index}: welcome for {question['question_id']} lost an"
                    " acknowledged answer (your_answer is null)"
                )
            if frame.get("your_answer") is not None:
                self.answered.add(question["question_id"])
            self.on_question(question, from_welcome=True)
        self.online.set()

    def on_question(self, question: dict[str, Any], *, from_welcome: bool) -> None:
        """Schedule this bot's answer, once per question however we heard about it."""
        qid = question["question_id"]
        self.current = question
        if qid in self.scheduled or qid in self.answered or not question["you_can_answer"]:
            return
        self.scheduled.add(qid)

        if from_welcome:
            # Arriving mid-question: what is left of the window, not the whole of it.
            window = max(0.0, _remaining(question))
        else:
            window = _window(question)
        self._spawn(self.answer_later(question, self.run.answer_at(window)))

        if not from_welcome and self.run.reconnector_for(question["index"]) == self.index:
            self._spawn(self.drop_and_return(window))

    def on_ack(self, frame: dict[str, Any]) -> None:
        qid = frame["question_id"]
        entry = self.pending.pop(qid, None)
        if entry is None:
            self.run.errors.append(f"bot {self.index}: answer_ack for unsent {qid}")
            return
        sent_at, index = entry
        if not self.pending:
            self.idle.set()
        self.answered.add(qid)
        self.acked += 1
        self.run.acks.append(
            Ack(
                seconds=time.perf_counter() - sent_at,
                bot=self.index,
                question_index=index,
                band=frame["band"],
            )
        )

    def on_closed(self, frame: dict[str, Any]) -> None:
        """Check the close agrees with us about whether we answered, then forget it."""
        qid = frame["question_id"]
        mine = self.player_id in frame["results"]
        if qid in self.answered and not mine:
            self.run.errors.append(
                f"bot {self.index}: acknowledged {qid} but is absent from its results"
            )
        if self.current is not None and self.current["question_id"] == qid:
            self.current = None

    # --- what a bot does ------------------------------------------------------------

    async def answer_later(self, question: dict[str, Any], delay: float) -> None:
        """Wait out this bot's slice of the window, then answer -- once, if still open."""
        qid = question["question_id"]
        index = question["index"]
        await asyncio.sleep(delay)
        # A bot that is mid-reconnect waits for its new socket rather than dropping the
        # answer: the gap is half a second and the window has seconds left in it.
        try:
            async with asyncio.timeout(_remaining(question)):
                await self.online.wait()
        except TimeoutError:
            self.missed.append(index)
            return
        current = self.current
        if current is None or current["question_id"] != qid or qid in self.answered:
            self.missed.append(index)
            return
        options = current["view"].get("options")
        value = self.run.rng.randrange(len(options)) if options else 0
        # The clock starts here, before the send, so it covers everything between this
        # bot deciding and the server answering: the frame on the wire, the wait for the
        # room lock, the insert, and the ack coming back.
        self.idle.clear()
        self.pending[qid] = (time.perf_counter(), index)
        if not await self.send({"t": "answer", "question_id": qid, "value": value}):
            self.pending.pop(qid, None)
            self.idle.set()
            self.missed.append(index)
            return
        self.sent += 1

    async def drop_and_return(self, window: float) -> None:
        """Close the socket without warning. ``run_socket`` brings it back through hello."""
        low, high = DROP_AT
        await asyncio.sleep(window * self.run.rng.uniform(low, high))
        # Never drop with an answer in flight. The ack would go down with the socket and
        # the run would be left holding a send it can never match to one, which is the
        # test losing count of itself rather than the server losing an answer.
        await self.idle.wait()
        ws = self.ws
        if ws is None or self.leaving:
            return
        self.dropping = True
        self.online.clear()
        await ws.close()

    async def stop(self) -> None:
        self.leaving = True
        self.idle.set()
        for task in list(self.tasks):
            task.cancel()
        ws = self.ws
        if ws is not None:
            await ws.close()


def _window(question: dict[str, Any]) -> float:
    """How long this question is open, from the server's own two timestamps."""
    opened = _parse_time(question["opened_at"])
    ends = _parse_time(question["ends_at"])
    return max(0.0, ends - opened)


def _remaining(question: dict[str, Any]) -> float:
    """What is left of the window, measured from now against the server's ``ends_at``.

    Local wall clock against a server timestamp, which is only safe because this runs on
    localhost against a server whose clock is the same clock.
    """
    return max(0.0, _parse_time(question["ends_at"]) - time.time())


def _parse_time(value: str) -> float:
    return datetime.fromisoformat(value).timestamp()


# --- setting the room up ------------------------------------------------------------


def create_room(base_url: str, run: Run, name: str) -> tuple[str, str, str]:
    """Create the room as bot 0, who is therefore its admin. Returns code, session, id."""
    created = post(
        f"{base_url}/api/rooms",
        {
            "display_name": name,
            "returning": False,
            "settings": {
                "modes": [
                    {
                        "mode": "more_less",
                        "questions": run.questions,
                        "seconds": run.question_seconds,
                    }
                ],
                "reveal_seconds": DEFAULT_REVEAL_SECONDS,
                "splash_seconds": 0,
                "close_when_all_answered": False,
            },
            "custom_questions": [],
        },
    )
    return created["code"], created["session"], created["player"]["id"]


def join_room(base_url: str, code: str, name: str) -> tuple[str, str]:
    joined = post(f"{base_url}/api/rooms/{code}/join", {"returning": False, "display_name": name})
    return joined["session"], joined["player"]["id"]


async def count_answers(database_url: str, code: str) -> int:
    """Rows in ``answers`` belonging to this room's questions."""
    try:
        conn = await asyncpg.connect(database_url)
    except (OSError, asyncpg.PostgresError) as exc:
        raise RunFailed(
            f"could not reach the database at {_redact(database_url)}: {exc}."
            " Inside the compose stack, run this script in the app container"
            " (docker compose exec app python scripts/loadtest.py);"
            " otherwise pass --database-url."
        ) from None
    try:
        return await conn.fetchval(
            "select count(*) from answers a"
            " join questions q on q.id = a.question_id"
            " join rooms r on r.id = q.room_id"
            " where r.code = $1",
            code.upper(),
        )
    finally:
        await conn.close()


def _redact(database_url: str) -> str:
    """The URL without its password, for an error message someone may paste."""
    if "@" not in database_url or "//" not in database_url:
        return database_url
    scheme, rest = database_url.split("//", 1)
    credentials, host = rest.rsplit("@", 1)
    user = credentials.split(":", 1)[0]
    return f"{scheme}//{user}:***@{host}"


# --- the run ------------------------------------------------------------------------


async def play(run: Run, bots: list[Bot], budget: float) -> None:
    """Start every socket, start the game, and wait for the last bot to finish."""
    sockets = [asyncio.create_task(bot.run_socket()) for bot in bots]
    pings = [asyncio.create_task(bot.ping_forever()) for bot in bots]
    try:
        async with asyncio.timeout(WELCOME_TIMEOUT):
            await asyncio.gather(*(bot.online.wait() for bot in bots))
    except TimeoutError:
        away = [bot.index for bot in bots if not bot.online.is_set()]
        raise RunFailed(f"bots {away} never got a welcome") from None

    print(f"  all {len(bots)} bots in the lobby; bot 0 (admin) starts the game")
    if not await bots[0].send({"t": "start_game"}):
        raise RunFailed("the admin's start_game could not be sent")

    try:
        async with asyncio.timeout(budget):
            await asyncio.gather(*(_wait_for_finish(bot) for bot in bots))
    except TimeoutError:
        waiting = [bot.index for bot in bots if bot.standings is None]
        run.errors.append(f"the game did not finish in time; bots {waiting} never saw it")
    finally:
        await asyncio.gather(*(bot.stop() for bot in bots), return_exceptions=True)
        for task in sockets + pings:
            task.cancel()
        await asyncio.gather(*sockets, *pings, return_exceptions=True)


async def _wait_for_finish(bot: Bot) -> None:
    await bot.done.wait()


async def progress(run: Run, bot: Bot) -> None:
    """One line per question, from the admin's socket, so a long run shows its work."""
    seen = -1
    while not bot.leaving:
        current = bot.current
        if current is not None and current["index"] != seen:
            seen = current["index"]
            done = len(run.acks)
            print(
                f"  q {seen + 1:2d}/{current['total']}  answers acknowledged so far: {done}",
                flush=True,
            )
        await asyncio.sleep(0.25)


# --- the report ---------------------------------------------------------------------


def report(run: Run, bots: list[Bot], code: str, rows: int, p99_limit: float) -> bool:
    """Print every assertion with its numbers. ``True`` if all four passed."""
    results: list[tuple[bool, str]] = []
    print(f"\n== load test report: room {code} ==\n")

    # 1. No error frames.
    finished = sum(1 for bot in bots if bot.standings is not None)
    ok = not run.errors and finished == len(bots)
    detail = f"{len(run.errors)} error frames, {finished}/{len(bots)} bots reached game_finished"
    results.append((ok, f"{run.questions} questions, zero error frames: {detail}"))
    for line in run.errors[:20]:
        print(f"    error: {line}")
    if len(run.errors) > 20:
        print(f"    ... and {len(run.errors) - 20} more")

    # 2. Latency.
    ordered = sorted(ack.seconds for ack in run.acks)
    if ordered:
        p50, p95, p99 = (percentile(ordered, p) * 1000 for p in (50, 95, 99))
        worst = max(run.acks, key=lambda ack: ack.seconds)
        print(
            f"    answer -> answer_ack over {len(ordered)} answers:"
            f" p50 {p50:.1f} ms  p95 {p95:.1f} ms  p99 {p99:.1f} ms"
            f"  max {worst.seconds * 1000:.1f} ms"
            f" (bot {worst.bot}, question {worst.question_index + 1})"
        )
        label = f"p99 {p99:.1f} ms against a {p99_limit:.0f} ms budget"
        results.append((p99 < p99_limit, label))
    else:
        results.append((False, "p99 latency: no answers were acknowledged"))

    # 3. Row count, from what the bots sent rather than from bots x questions.
    sent = sum(bot.sent for bot in bots)
    acked = sum(bot.acked for bot in bots)
    missed = sum(len(bot.missed) for bot in bots)
    asked = len(bots) * run.questions
    print(
        f"    answers: {asked} possible, {sent} sent, {acked} acknowledged,"
        f" {missed} never sent, {rows} rows in the database"
    )
    if sent != acked:
        print(f"    {sent - acked} answers were sent and never acknowledged")
    for bot in bots:
        if bot.missed:
            print(f"    bot {bot.index} skipped questions {[i + 1 for i in bot.missed]}")
    label = f"answers table: {rows} rows against {acked} acknowledged and {sent} sent"
    results.append((rows == acked and sent == acked, label))

    # 4. Identical standings.
    shapes = {json.dumps(bot.standings, sort_keys=True) for bot in bots if bot.standings}
    label = f"standings: {len(shapes)} distinct over {finished}/{len(bots)} finish frames"
    results.append((len(shapes) == 1 and finished == len(bots), label))
    if bots[0].standings:
        print("    final standings, top 5:")
        for standing in bots[0].standings[:5]:
            print(
                f"      {standing['rank']:2d}. {standing['display_name']:<12}"
                f" {standing['points']:>6} points"
            )
    if len(shapes) > 1:
        print(f"    {len(shapes)} different standings across {finished} bots")

    print(
        f"\n    reconnects: {sum(bot.connects - 1 for bot in bots)} over the run,"
        f" rebuilt from welcome as {run.rejoined_answered} already answered,"
        f" {run.rejoined_pending} still to answer, {run.rejoined_between} between questions"
    )
    for line in run.warnings[:10]:
        print(f"    warning: {line}")
    if len(run.warnings) > 10:
        print(f"    ... and {len(run.warnings) - 10} more warnings")

    print()
    for passed, line in results:
        print(f"  [{'PASS' if passed else 'FAIL'}] {line}")
    print()
    return all(passed for passed, _ in results)


async def main(argv: list[str]) -> int:
    args = parse_args(argv)
    run = Run(
        ws_url="",
        bots=args.bots,
        questions=args.questions,
        question_seconds=args.question_seconds,
        rng=random.Random(args.seed),
    )
    base = args.base_url.rstrip("/")
    print(
        f"setting up: {args.bots} bots, {args.questions} questions of"
        f" {args.question_seconds} s against {base}"
    )
    code, session, player_id = await asyncio.to_thread(create_room, base, run, "bot00")
    run.ws_url = f"{_ws_scheme(base)}/ws/{code}"
    bots = [Bot(run, 0, "bot00", session, player_id)]
    for index in range(1, args.bots):
        name = f"bot{index:02d}"
        joined_session, joined_id = await asyncio.to_thread(join_room, base, code, name)
        bots.append(Bot(run, index, name, joined_session, joined_id))
    print(f"  room {code} created by bot 0 (its admin) and joined by {len(bots) - 1} others")

    # The game's own length, plus room for the reveals and a minute of slack.
    budget = args.questions * (args.question_seconds + DEFAULT_REVEAL_SECONDS) + 60
    narrator = asyncio.create_task(progress(run, bots[0]))
    try:
        await play(run, bots, budget)
    finally:
        narrator.cancel()
        await asyncio.gather(narrator, return_exceptions=True)

    rows = await count_answers(args.database_url, code)
    return 0 if report(run, bots, code, rows, args.p99_ms) else 1


def _ws_scheme(base: str) -> str:
    return base.replace("https://", "wss://", 1).replace("http://", "ws://", 1)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="the running server")
    parser.add_argument("--bots", type=int, default=DEFAULT_BOTS)
    parser.add_argument("--questions", type=int, default=DEFAULT_QUESTIONS)
    parser.add_argument("--question-seconds", type=int, default=DEFAULT_QUESTION_SECONDS)
    parser.add_argument(
        "--p99-ms",
        type=float,
        default=DEFAULT_P99_MS,
        help="the p99 answer -> answer_ack budget the run asserts",
    )
    parser.add_argument(
        "--database-url",
        default=get_settings().database_url,
        help="where to count the answers rows; defaults to the server's own DATABASE_URL",
    )
    parser.add_argument("--seed", type=int, default=None, help="fix the answer timing draw")
    return parser.parse_args(argv)


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main(sys.argv[1:])))
    except RunFailed as failure:
        sys.exit(f"load test could not run: {failure}")
    except KeyboardInterrupt:
        sys.exit(130)
