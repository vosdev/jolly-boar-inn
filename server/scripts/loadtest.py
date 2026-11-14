"""Load test: 30 bots play one room over websockets and check what came back.

Not a unit test and not part of CI: it needs a live server and a live database, and it
takes as long as the game it plays (about twelve and a half minutes at the defaults). Run it
against ``make dev``::

    make loadtest

or inside the compose stack, where the bundled Postgres is not published to the host and
the script has to run on the same side of the bridge as the app::

    docker compose exec app python scripts/loadtest.py

**The server must trust the loopback proxy.** Each bot sends its own ``X-Forwarded-For``
address, on its POSTs and on its websocket handshake, so that thirty players are thirty
addresses to the per-address limits, as they are in a pub behind a real proxy. uvicorn
honours the header from ``FORWARDED_ALLOW_IPS``, which defaults to ``127.0.0.1,::1``: the
Dockerfile's CMD and ``make dev`` both qualify. Narrow it, and every bot shares one address,
trips the connect limits, and the run fails on the 429 or 1008 that follows.

What it asserts, in the order the report prints them (section 8):

1. ``--questions`` questions are played, as ``question_open.total`` counts them, with zero
   ``error`` frames, zero refusals (any HTTP 429 or close 1008 fails the run), and every
   bot reaching ``game_finished``.
2. p99 from sending ``answer`` to receiving ``answer_ack`` is under ``--p99-ms``.
   p50 and p95 are printed next to it, because one number cannot tell a slow tail from a
   slow everything.
3. The ``answers`` table holds exactly one row per acknowledged answer. The expected
   count is what the bots actually sent and had acknowledged, counted as they went --
   never ``bots x questions``, which is a guess about how the run behaved rather than an
   observation of it.
4. All ``game_finished`` frames carry byte-identical standings.
5. Every deliberate drop came back through ``welcome``, at least once to a question
   already answered and once to one still to answer.
6. With ``METRICS_TOKEN`` set, ``jbi_rate_limited_total`` did not move over the run.

**The questions.** One Who Said That? round, multiple choice from a pack the repo commits
with more questions than a round holds, so any checkout plays the count it was asked for.
The server adds random events on top of a round; the script fills every one of those
slots with a multiple-choice question of its own, and picks the round's length and the
event frequency so that round and slots add up to ``--questions`` exactly.

**Bot 0 is the admin.** ``POST /api/rooms`` makes its caller the room's first admin and
hands back that player's session, so the alternative -- creating the room from the script
and having thirty more players join -- would leave a thirty-first player sitting in the
room doing nothing but holding the start button. Bot 0 holds the creator session, sends
``start_game``, and otherwise answers questions like the other twenty-nine.

**On the p99 number.** Every ``RoomManager`` method takes the room's single
``asyncio.Lock``, so simultaneous answers serialise behind it; the number this script
prints is the cost of that queue plus the ``insert into answers`` each turn in the queue
performs. The bots answer at uniformly random points between ``answerable_at`` and
``ends_at`` because that is what thirty people with phones do, not to spread the load out.

**Room settings.** ``close_when_all_answered`` is off, and the admin skips the splash rather
than waiting for the room to be ready. With early close on, the last bot to answer ends
the question, and an answer scheduled a few milliseconds behind it would race that close
and come back ``not_open`` -- a failure of the test's own timing rather than the server's.
"""

import argparse
import asyncio
import ipaddress
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
from websockets.exceptions import ConnectionClosed, InvalidStatus

from app.config import get_settings
from app.modes import questions_bounds
from app.questions.types import TYPES
from app.questions.types.timing import MIN_REVEAL
from app.rooms.settings import NewRoomSettings

DEFAULT_BOTS = 30
DEFAULT_QUESTIONS = 30
# The quickest a host may ask for. A load test has nothing to read on the reveal screen.
DEFAULT_PACE = "teleport"
DEFAULT_P99_MS = 200.0
MODE = "who_said_that"
# Fewest random events first: the round is what the packs supply, the slots are ours.
FREQUENCIES = ("less", "default", "more")

HTTP_TIMEOUT = 15
# How long a bot waits for the welcome that answers its hello before giving up on the run.
WELCOME_TIMEOUT = 30
# From start_game to the first question_open: the splash the admin skips, and the draw.
FIRST_QUESTION_TIMEOUT = 60
# Section 3: the client pings every 30 s. The bots do too, so the run exercises it.
PING_EVERY = 30.0

# Where between answerable_at and ends_at a bot answers, as a fraction of that span. The
# upper bound leaves a margin so a scheduled send cannot arrive after the timer has closed
# the question. Nothing between the two is shaped: it is a flat draw.
ANSWER_FRACTION = (0.05, 0.85)
# A bot that drops after answering answers early, so the reconnect lands while its question
# is still open and the welcome has to bring its answer back.
EARLY_FRACTION = (0.05, 0.40)
OFFLINE_FOR = 0.5
# name_wrong_answers adds a second to every reveal after the pace.
REVEAL_NAMES = 1.0
# What a question costs beyond its frames: the server moving on, the next open's broadcast.
QUESTION_SLACK = 2.0
RUN_SLACK = 60.0
# RFC 2544's benchmarking range: never a real client, and room for every bot of many runs.
ADDRESSES = ipaddress.IPv4Network("198.18.0.0/15")


def percentile(ordered: list[float], p: float) -> float:
    """Nearest-rank percentile of an already sorted list. ``ordered`` must be non-empty.

    Nearest-rank rather than an interpolating definition because the question this
    answers is "how slow was the slow one", and interpolating invents a latency that no
    answer actually had.
    """
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]


def send_time(
    question: dict[str, Any],
    now: float,
    rng: random.Random,
    fraction: tuple[float, float] = ANSWER_FRACTION,
) -> float | None:
    """When to send an answer, in epoch seconds, inside what is left of answerable..ends.

    ``None`` once the question has closed. Drawn from the frame's own timestamps, so a bot
    that heard of the question from a reconnect's welcome draws from what remains.
    """
    ends = _parse_time(question["ends_at"])
    start = max(_parse_time(question["answerable_at"]), now)
    if start >= ends:
        return None
    low, high = fraction
    return start + (ends - start) * rng.uniform(low, high)


def reveal_estimate(question: dict[str, Any], pace: str) -> float:
    """The reveal that follows this question, from its type's timing at the room's pace."""
    options = question["view"].get("options") or ()
    reveal = TYPES[question["type"]].REVEAL.seconds(len(options), pace, MIN_REVEAL)
    return reveal + REVEAL_NAMES


def budget(questions: int, question: dict[str, Any], reveal: float) -> float:
    """Seconds ``questions`` more questions like this one take, with slack to spare."""
    span = _parse_time(question["ends_at"]) - _parse_time(question["opened_at"])
    return questions * (span + reveal + QUESTION_SLACK) + RUN_SLACK


@dataclass(frozen=True)
class Plan:
    """The room that plays exactly ``questions``: a round, and slots the script fills."""

    round_questions: int
    frequency: str
    custom: int

    @property
    def questions(self) -> int:
        return self.round_questions + self.custom


def plan(questions: int) -> Plan | None:
    """A round of ``MODE`` and our own questions in its event slots adding up to ``questions``.

    ``None`` when no round length and frequency do. Slots are counted by the server's own
    settings, so the sum is what the room will store.
    """
    bounds = questions_bounds(MODE)
    for frequency in FREQUENCIES:
        for length in range(min(questions, bounds.maximum), bounds.minimum - 1, -1):
            settings = NewRoomSettings(
                modes=[{"mode": MODE, "questions": length}], random_event_frequency=frequency
            )
            if length + settings.random_event_slots == questions:
                return Plan(length, frequency, settings.random_event_slots)
    return None


def custom_questions(count: int) -> list[dict[str, Any]]:
    """The host's own multiple-choice questions, one per slot, each its own content id."""
    return [
        {
            "type": "multiple_choice",
            "payload": {
                "prompt": f"Load test question {number + 1}: which is first?",
                "options": ["Bronze", "Iron", "Steel", "Mithril"],
                "answer_index": 0,
            },
        }
        for number in range(count)
    ]


def bot_addresses(count: int, rng: random.Random) -> list[str]:
    """One forwarded address per bot, from a run-specific offset so runs share no budget."""
    room = ADDRESSES.num_addresses - count
    start = rng.randrange(room)
    return [str(ADDRESSES[start + index]) for index in range(count)]


def post(url: str, body: dict[str, Any], address: str) -> dict[str, Any]:
    """One JSON POST from ``address``, blocking. Raises ``RunFailed`` with the server's message."""
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "x-forwarded-for": address},
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:400]
        hint = _TRUST_HINT if exc.code == 429 else ""
        raise RunFailed(f"POST {url} -> {exc.code}: {detail}{hint}") from None
    except (urllib.error.URLError, OSError) as exc:
        raise RunFailed(f"POST {url} could not be reached: {exc}") from None


_TRUST_HINT = (
    ". Does the server trust this host's X-Forwarded-For (uvicorn --proxy-headers,"
    " FORWARDED_ALLOW_IPS holding 127.0.0.1)?"
)


def rate_limited_total(base_url: str, token: str) -> float:
    """``jbi_rate_limited_total`` summed over every limiter, from ``/metrics``."""
    request = urllib.request.Request(
        f"{base_url}/metrics", headers={"authorization": f"Bearer {token}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            text = response.read().decode()
    except (urllib.error.URLError, OSError) as exc:
        raise RunFailed(f"GET {base_url}/metrics failed: {exc}") from None
    return sum(
        float(line.rsplit(" ", 1)[1])
        for line in text.splitlines()
        if line.startswith("jbi_rate_limited_total")
    )


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
    pace: str
    rng: random.Random

    acks: list[Ack] = field(default_factory=list)
    # Any `error` frame, refusal or unplanned close, from any bot. Assertion 1 is that this
    # stays empty.
    errors: list[str] = field(default_factory=list)
    # What question_open.total said, and which indexes the admin saw open.
    total: int | None = None
    played: set[int] = field(default_factory=set)
    # Loop time by which the game must have moved on; each question_open pushes it out.
    deadline: float = 0.0
    reveal: float | None = None
    reconnects_attempted: int = 0
    reconnects_completed: int = 0
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

    @staticmethod
    def drops_after_answering(question_index: int) -> bool:
        """Alternate the two halves of the reconnect flow, so a short run covers both."""
        return question_index % 2 == 1

    def on_admin_question(self, question: dict[str, Any]) -> None:
        """Note the count and push the deadline out by what is left of the game."""
        self.total = question["total"]
        self.played.add(question["index"])
        reveal = self.reveal if self.reveal is not None else reveal_estimate(question, self.pace)
        left = question["total"] - question["index"]
        self.deadline = asyncio.get_running_loop().time() + budget(left, question, reveal)


class Bot:
    """One player: a socket, a reconnect loop, and a scheduled answer per question."""

    def __init__(
        self, run: Run, index: int, name: str, session: str, player_id: str, address: str
    ) -> None:
        self.run = run
        self.index = index
        self.name = name
        self.session = session
        self.player_id = player_id
        self.address = address

        self.ws: Any = None
        self.online = asyncio.Event()
        self.idle = asyncio.Event()  # no answer is in flight
        self.idle.set()
        self.done = asyncio.Event()  # game_finished has arrived
        self.leaving = False  # the game is over; stop reconnecting
        self.dropping = False  # this close is ours, not the server's
        self.returning = False  # a drop of ours that has not seen its welcome yet

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
                    additional_headers={"x-forwarded-for": self.address},
                ) as ws:
                    self.ws = ws
                    self.connects += 1
                    await ws.send(json.dumps({"t": "hello", "session": self.session}))
                    async for raw in ws:
                        await self.on_frame(json.loads(raw))
            except ConnectionClosed as exc:
                if not self.dropping and not self.leaving:
                    close = exc.rcvd or exc.sent
                    hint = _TRUST_HINT if close is not None and close.code == 1008 else ""
                    self.run.errors.append(f"bot {self.index} lost its socket: close {close}{hint}")
            except InvalidStatus as exc:
                status = exc.response.status_code
                hint = _TRUST_HINT if status == 429 else ""
                self.run.errors.append(f"bot {self.index} handshake refused: {status}{hint}")
            except (OSError, TimeoutError) as exc:
                if not self.leaving:
                    self.run.errors.append(f"bot {self.index} could not connect: {exc!r}")
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
            case "room_updated" if self.index == 0 and frame["room"]["phase"] == "splash":
                await self.send(
                    {"t": "skip", "phase": "splash", "index": frame["room"]["current_index"]}
                )
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
                pass  # other room_updated frames, pong: nothing here depends on them

    def on_welcome(self, frame: dict[str, Any]) -> None:
        """Rebuild everything from the snapshot, as section 3's reconnect flow requires.

        The only state carried across the gap is what this bot did itself -- which
        questions it has an acknowledgement for. Everything about the room comes from
        here, and the two are cross-checked: a question we were acknowledged for must
        come back with ``your_answer`` set, or the row did not survive.
        """
        question = frame.get("question")
        self.current = question
        if self.returning:
            self.returning = False
            self.run.reconnects_completed += 1
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
        if self.index == 0:
            self.run.on_admin_question(question)
        if qid in self.scheduled or qid in self.answered or not question["you_can_answer"]:
            return
        self.scheduled.add(qid)

        reconnects = not from_welcome and self.run.reconnector_for(question["index"]) == self.index
        after = reconnects and self.run.drops_after_answering(question["index"])
        at = send_time(
            question, time.time(), self.run.rng, EARLY_FRACTION if after else ANSWER_FRACTION
        )
        if at is None:
            self.missed.append(question["index"])
            return
        self._spawn(self.answer_later(question, at - time.time()))
        if reconnects:
            self._spawn(self.drop_and_return(qid, after=after))

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
        if self.index == 0 and frame.get("reveal_seconds") is not None:
            self.run.reveal = frame["reveal_seconds"] + REVEAL_NAMES
        if self.current is not None and self.current["question_id"] == qid:
            self.current = None

    # --- what a bot does ------------------------------------------------------------

    async def answer_later(self, question: dict[str, Any], delay: float) -> None:
        """Wait out this bot's slice of the window, then answer -- once, if still open."""
        qid = question["question_id"]
        index = question["index"]
        await asyncio.sleep(max(0.0, delay))
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
        view = current["view"]
        options = view.get("options")
        if "min" in view:
            # A slider's ends are always on its grid, whatever the range.
            value = self.run.rng.choice((view["min"], view["max"]))
        else:
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

    async def drop_and_return(self, qid: str, *, after: bool) -> None:
        """Close the socket without warning. ``run_socket`` brings it back through hello.

        Before answering, the drop is at once: the answer is drawn after answerable_at, so
        it cannot have gone yet. After answering, it waits for the ack.
        """
        if after:
            while qid not in self.answered:
                current = self.current
                if self.leaving or current is None or current["question_id"] != qid:
                    return
                await asyncio.sleep(0.02)
        # Never drop with an answer in flight. The ack would go down with the socket and
        # the run would be left holding a send it can never match to one, which is the
        # test losing count of itself rather than the server losing an answer.
        await self.idle.wait()
        ws = self.ws
        if ws is None or self.leaving:
            return
        self.dropping = True
        self.returning = True
        self.online.clear()
        self.run.reconnects_attempted += 1
        await ws.close()

    async def stop(self) -> None:
        self.leaving = True
        self.idle.set()
        for task in list(self.tasks):
            task.cancel()
        ws = self.ws
        if ws is not None:
            await ws.close()


def _remaining(question: dict[str, Any]) -> float:
    """What is left of the window, measured from now against the server's ``ends_at``.

    Local wall clock against a server timestamp, which is only safe because this runs on
    localhost against a server whose clock is the same clock.
    """
    return max(0.0, _parse_time(question["ends_at"]) - time.time())


def _parse_time(value: str) -> float:
    return datetime.fromisoformat(value).timestamp()


# --- setting the room up ------------------------------------------------------------


def create_room(
    base_url: str, run: Run, room: Plan, name: str, address: str
) -> tuple[str, str, str]:
    """Create the room as bot 0, who is therefore its admin. Returns code, session, id."""
    created = post(
        f"{base_url}/api/rooms",
        {
            "display_name": name,
            "returning": False,
            "settings": {
                "modes": [{"mode": MODE, "questions": room.round_questions}],
                "random_event_frequency": room.frequency,
                "pace": run.pace,
                "close_when_all_answered": False,
            },
            "custom_questions": custom_questions(room.custom),
        },
        address,
    )
    return created["code"], created["session"], created["player"]["id"]


def join_room(base_url: str, code: str, name: str, address: str) -> tuple[str, str]:
    joined = post(
        f"{base_url}/api/rooms/{code}/join",
        {"returning": False, "display_name": name},
        address,
    )
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


async def play(run: Run, bots: list[Bot]) -> None:
    """Start every socket, start the game, and wait for the last bot to finish."""
    sockets = [asyncio.create_task(bot.run_socket()) for bot in bots]
    pings = [asyncio.create_task(bot.ping_forever()) for bot in bots]
    try:
        try:
            async with asyncio.timeout(WELCOME_TIMEOUT):
                await asyncio.gather(*(bot.online.wait() for bot in bots))
        except TimeoutError:
            away = [bot.index for bot in bots if not bot.online.is_set()]
            raise RunFailed(f"bots {away} never got a welcome") from None

        print(f"  all {len(bots)} bots in the lobby; bot 0 (admin) starts the game")
        run.deadline = asyncio.get_running_loop().time() + FIRST_QUESTION_TIMEOUT
        if not await bots[0].send({"t": "start_game"}):
            raise RunFailed("the admin's start_game could not be sent")
        finished = asyncio.gather(*(bot.done.wait() for bot in bots))
        try:
            await _until_deadline(run, finished)
        except TimeoutError:
            finished.cancel()
            waiting = [bot.index for bot in bots if bot.standings is None]
            run.errors.append(f"the game did not finish in time; bots {waiting} never saw it")
    finally:
        await asyncio.gather(*(bot.stop() for bot in bots), return_exceptions=True)
        for task in sockets + pings:
            task.cancel()
        await asyncio.gather(*sockets, *pings, return_exceptions=True)


async def _until_deadline(run: Run, finished: asyncio.Future[Any]) -> None:
    """Wait for ``finished``; ``TimeoutError`` once ``run.deadline`` passes without it."""
    loop = asyncio.get_running_loop()
    while not finished.done():
        left = run.deadline - loop.time()
        if left <= 0:
            raise TimeoutError
        await asyncio.wait({finished}, timeout=min(left, 1.0))


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


def report(
    run: Run,
    bots: list[Bot],
    code: str,
    rows: int,
    p99_limit: float,
    limited: float | None,
) -> bool:
    """Print every assertion with its numbers. ``True`` if all of them passed."""
    results: list[tuple[bool, str]] = []
    print(f"\n== load test report: room {code} ==\n")

    # 1. The count asked for, no error frames, no refusals.
    finished = sum(1 for bot in bots if bot.standings is not None)
    counted = run.total == run.questions and len(run.played) == run.questions
    ok = counted and not run.errors and finished == len(bots)
    detail = (
        f"{run.total} played ({len(run.played)} opened) of {run.questions} asked,"
        f" {len(run.errors)} errors, {finished}/{len(bots)} bots reached game_finished"
    )
    results.append((ok, f"questions and errors: {detail}"))
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
    asked = len(bots) * (run.total or 0)
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

    # 5. Reconnects.
    both = run.questions < 2 or (run.rejoined_answered >= 1 and run.rejoined_pending >= 1)
    ok = run.reconnects_completed == run.reconnects_attempted and both
    label = (
        f"reconnects: {run.reconnects_completed} completed of {run.reconnects_attempted},"
        f" back to {run.rejoined_answered} already answered,"
        f" {run.rejoined_pending} still to answer, {run.rejoined_between} between questions"
    )
    results.append((ok, label))

    # 6. Rate limiting, as the server counted it.
    if limited is None:
        print("    rate limiting: METRICS_TOKEN is unset, so /metrics was not scraped")
    else:
        results.append((limited == 0, f"jbi_rate_limited_total moved by {limited:g}"))

    print()
    for passed, line in results:
        print(f"  [{'PASS' if passed else 'FAIL'}] {line}")
    print()
    return all(passed for passed, _ in results)


async def main(argv: list[str]) -> int:
    args = parse_args(argv)
    room = plan(args.questions)
    if room is None:
        raise RunFailed(f"no {MODE} round and event frequency add up to {args.questions}")
    run = Run(
        ws_url="",
        bots=args.bots,
        questions=args.questions,
        pace=args.pace,
        rng=random.Random(args.seed),
    )
    base = args.base_url.rstrip("/")
    token = get_settings().metrics_token
    addresses = bot_addresses(args.bots, random.Random())
    print(
        f"setting up: {args.bots} bots, {args.questions} questions ({room.round_questions}"
        f" {MODE}, {room.custom} of our own in its event slots) at {args.pace} pace"
        f" against {base}"
    )
    before = await asyncio.to_thread(rate_limited_total, base, token) if token else None
    code, session, player_id = await asyncio.to_thread(
        create_room, base, run, room, "bot00", addresses[0]
    )
    run.ws_url = f"{_ws_scheme(base)}/ws/{code}"
    bots = [Bot(run, 0, "bot00", session, player_id, addresses[0])]
    for index in range(1, args.bots):
        name = f"bot{index:02d}"
        joined_session, joined_id = await asyncio.to_thread(
            join_room, base, code, name, addresses[index]
        )
        bots.append(Bot(run, index, name, joined_session, joined_id, addresses[index]))
    print(f"  room {code} created by bot 0 (its admin) and joined by {len(bots) - 1} others")

    narrator = asyncio.create_task(progress(run, bots[0]))
    try:
        await play(run, bots)
    finally:
        narrator.cancel()
        await asyncio.gather(narrator, return_exceptions=True)

    rows = await count_answers(args.database_url, code)
    limited = None
    if before is not None:
        limited = await asyncio.to_thread(rate_limited_total, base, token) - before
    return 0 if report(run, bots, code, rows, args.p99_ms, limited) else 1


def _ws_scheme(base: str) -> str:
    return base.replace("https://", "wss://", 1).replace("http://", "ws://", 1)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="the running server")
    parser.add_argument("--bots", type=int, default=DEFAULT_BOTS)
    parser.add_argument("--questions", type=int, default=DEFAULT_QUESTIONS)
    parser.add_argument("--pace", choices=["walk", "run", "teleport"], default=DEFAULT_PACE)
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
