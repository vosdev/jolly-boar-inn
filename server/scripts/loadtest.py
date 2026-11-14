"""Load test: rooms of bots play over websockets, and the run checks what came back.

Needs a live server and its database, so it is not a unit test. ``make loadtest-smoke`` is the
short profile CI runs (three rooms of ten, three questions, about a minute); ``make loadtest``
plays one room of thirty for thirty questions. Against ``make dev``, or inside the compose
stack, where the bundled Postgres is not published to the host::

    docker compose exec app python scripts/loadtest.py --rooms 18 --bots 50

**The server must trust the loopback proxy.** Each bot sends its own ``X-Forwarded-For``
address, on its POSTs and its websocket handshake, so that every player is its own address to
the per-address limits, as in a pub behind a real proxy. uvicorn honours the header from
``FORWARDED_ALLOW_IPS``, which defaults to ``127.0.0.1,::1``: the Dockerfile's CMD and
``make dev`` both qualify. Narrow it, and the bots share one address and trip the limits.

**Shape.** ``--rooms`` rooms of ``--bots`` players each, bot 0 of every room its admin (it
creates the room, so it holds the creator session and sends ``start_game``). ``--ramp``
spreads the room starts over that many seconds, ``--procs`` splits the rooms over processes,
since one process drives about 300 bots before its own loop lags, and ``--games`` plays the
whole set that many times back to back, in fresh rooms. The scheduling clock is the server's,
from ``welcome.server_time``, so the script can point at another host.

**Scenarios** (``--scenario``):

- ``steady``: answers drawn flat between ``answerable_at`` and ``ends_at``, one bot per room
  dropping and coming back per question, alternately before and after answering.
- ``buzzer``: every bot answers at ``answerable_at`` + 2 s. The slowest ack is the number.
- ``reconnect-storm``: every bot drops at the middle of every question and comes back 0.2 s
  later, as after a restart or a proxy reload.
- ``slow-readers``: ``--slow-readers`` extra players per room open a raw socket at the second
  half of the game, say hello and never read again. Their sockets must be closed within 60 s,
  and the other bots' ack p99 must stay within 1.5x of the first half's.
- ``join-burst``: every join of every room at once, ``--join-concurrency`` in flight.

**What a run asserts**, every check printed with its numbers:

- Every room played ``--questions`` questions to ``game_finished``, with zero ``error`` frames,
  refusals (HTTP 429, close 1008) or unplanned closes.
- Ack p99 (``answer`` sent to ``answer_ack`` read) under ``--p99-ms``, overall and in the worst
  room; one ``answers`` row per acknowledged answer in every room, counted from what the bots
  had acknowledged rather than ``bots x questions``; byte-identical standings inside each room.
- Every deliberate drop came back through ``welcome``, a ``welcome`` never lost an
  acknowledged answer, and, with ``METRICS_TOKEN`` set, ``jbi_rate_limited_total`` stayed put.

``--smoke`` stops there: those are loose enough for a shared runner. Otherwise, also:

- ``/api/health``, polled four times a second, answered 200 every time, p99 under 250 ms (in a
  storm: the slowest under 1 s). In ``steady``, the server's lag histogram saw nothing over
  100 ms. With ``--server-pid`` (Linux, same host), CPU and RSS are sampled each second: RSS per
  socket under 80 KB once a run holds 300 sockets, and with ``--games`` the RSS after the last
  game within 10% of the first's.
- The scenario's targets: buzzer slowest ack under 200 ms; storm reconnect -> welcome p99 under
  2 s; slow readers as above; join-burst join p99 under 1 s and no 5xx.

**Invalid runs.** Each bot process times a 50 ms sleep. When its p99 overshoots by 20 ms or
more the harness, not the server, was the bottleneck: the run says INVALID and exits 2.

``--json PATH`` writes the report, ``--compare OLD.json`` fails when ack p99, CPU per room or
RSS per socket are more than ``--compare-factor`` times the old run's (ratios, since hosts
differ).

**The questions.** One Who Said That? round, multiple choice from a pack the repo commits with
more questions than a round holds. The server adds random events on top; the script fills
every slot with a multiple-choice question of its own, picking the round's length and event
frequency so that the two add up to ``--questions``. ``close_when_all_answered`` is off, so an
answer scheduled a few milliseconds behind the last one never races an early close.

**On the ack number.** Every ``RoomManager`` method takes the room's lock, so simultaneous
answers queue behind it; the ack is the cost of that queue plus each turn's ``insert``.
"""

import argparse
import asyncio
import base64
import ipaddress
import json
import math
import multiprocessing
import os
import random
import re
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import asyncpg
import websockets
from websockets.exceptions import ConnectionClosed, InvalidStatus

from app.config import APP_VERSION, REPO_ROOT, get_settings
from app.modes import questions_bounds
from app.questions.types import TYPES
from app.questions.types.timing import MIN_REVEAL
from app.rooms.settings import NewRoomSettings

SCENARIOS = ("steady", "buzzer", "reconnect-storm", "slow-readers", "join-burst")
DEFAULT_ROOMS = 1
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
# Every process waits here for the others' rooms to exist, so a ramp or a burst starts together.
BARRIER_TIMEOUT = 300

# Where between answerable_at and ends_at a bot answers, as a fraction of that span. The
# upper bound leaves a margin so a scheduled send cannot arrive after the timer has closed
# the question. Nothing between the two is shaped: it is a flat draw.
ANSWER_FRACTION = (0.05, 0.85)
# A bot that drops after answering answers early, so the reconnect lands while its question
# is still open and the welcome has to bring its answer back.
EARLY_FRACTION = (0.05, 0.40)
OFFLINE_FOR = 0.5
STORM_OFFLINE_FOR = 0.2
BUZZER_AFTER = 2.0
# name_wrong_answers adds a second to every reveal after the pace.
REVEAL_NAMES = 1.0
# What a question costs beyond its frames: the server moving on, the next open's broadcast.
QUESTION_SLACK = 2.0
RUN_SLACK = 60.0
# RFC 2544's benchmarking range: never a real client, and room for every bot of many runs.
ADDRESSES = ipaddress.IPv4Network("198.18.0.0/15")

# Joins outside join-burst: quick to set up, and gentle enough not to be the thing measured.
SETUP_CONCURRENCY = 8
DEFAULT_JOIN_CONCURRENCY = 60
DEFAULT_SLOW_READERS = 5
# A stalled socket's receive buffer, small so that it is full after a frame or two.
SLOW_RCVBUF = 4096
# How often a stalled socket looks at its own connection. The server's FIN waits behind the
# data it never read, so a ws ping is the probe: once the server has let go, it answers RST.
SLOW_PROBE_EVERY = 1.0
SLOW_GRACE = 5.0

HEALTH_EVERY = 0.25
HEALTH_TIMEOUT = 5.0
PROBE_SLEEP = 0.05
JOIN_BUCKETS_MS = (50, 100, 250, 500, 1000, 2500, 5000)

# The targets. A run fails on any of them; none is loosened to make a run pass.
SERVER_LAG_LIMIT_S = 0.1
HEALTH_P99_MS = 250.0
STORM_HEALTH_MAX_MS = 1000.0
BOT_LAG_P99_MS = 20.0
RSS_PER_SOCKET_KB = 80.0
# Below this many sockets the rooms, the packs and the pool outweigh the sockets in RSS.
RSS_MIN_SOCKETS = 300
RSS_DRIFT = 0.10
BUZZER_LAST_ACK_MS = 200.0
STORM_WELCOME_P99_MS = 2000.0
SLOW_CLOSED_WITHIN = 60.0
SLOW_P99_RATIO = 1.5
JOIN_P99_MS = 1000.0
DEFAULT_COMPARE_FACTOR = 1.5
COMPARED = (
    ("ack p99 (ms)", ("acks", "p99_ms")),
    ("CPU per room (% of a core)", ("server", "process", "cpu_pct_per_room")),
    ("RSS per socket (KB)", ("server", "process", "rss_per_socket_kb")),
)

EXIT_PASSED, EXIT_FAILED, EXIT_INVALID = 0, 1, 2


# --- arithmetic -----------------------------------------------------------------------


def percentile(ordered: list[float], p: float) -> float:
    """Nearest-rank percentile of an already sorted list. ``ordered`` must be non-empty.

    Nearest-rank rather than an interpolating definition because the question this
    answers is "how slow was the slow one", and interpolating invents a latency that no
    answer actually had.
    """
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]


def stats(seconds: list[float]) -> dict[str, Any]:
    """Count, p50, p95, p99 and max of ``seconds``, in milliseconds."""
    if not seconds:
        return {"count": 0}
    ordered = sorted(seconds)
    out: dict[str, Any] = {"count": len(ordered)}
    for p in (50, 95, 99):
        out[f"p{p}_ms"] = round(percentile(ordered, p) * 1000, 2)
    out["max_ms"] = round(ordered[-1] * 1000, 2)
    return out


def histogram(seconds: list[float], bounds_ms: tuple[int, ...] = JOIN_BUCKETS_MS) -> dict[str, int]:
    """How many of ``seconds`` fall at or under each bound and not the one before it."""
    counts = dict.fromkeys([*(str(b) for b in bounds_ms), "+Inf"], 0)
    for value in seconds:
        ms = value * 1000
        key = next((str(b) for b in bounds_ms if ms <= b), "+Inf")
        counts[key] += 1
    return counts


def send_time(
    question: dict[str, Any],
    now: float,
    rng: random.Random,
    fraction: tuple[float, float] = ANSWER_FRACTION,
) -> float | None:
    """When to send an answer, in server epoch seconds, inside what is left of answerable..ends.

    ``None`` once the question has closed. Drawn from the frame's own timestamps, so a bot
    that heard of the question from a reconnect's welcome draws from what remains.
    """
    ends = _parse_time(question["ends_at"])
    start = max(_parse_time(question["answerable_at"]), now)
    if start >= ends:
        return None
    low, high = fraction
    return start + (ends - start) * rng.uniform(low, high)


def buzzer_time(question: dict[str, Any], now: float) -> float | None:
    """``answerable_at`` + 2 s, or the middle of a shorter window; ``None`` once closed."""
    answerable = _parse_time(question["answerable_at"])
    ends = _parse_time(question["ends_at"])
    if now >= ends:
        return None
    return max(now, answerable + min(BUZZER_AFTER, (ends - answerable) / 2))


def storm_time(question: dict[str, Any]) -> float:
    """The middle of the answer window, when a storm drops every socket."""
    answerable = _parse_time(question["answerable_at"])
    return answerable + (_parse_time(question["ends_at"]) - answerable) / 2


def slow_from(questions: int) -> int:
    """The question index at which slow readers stall: the second half of the game."""
    return questions // 2


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


def slow_readers_per_room(args: argparse.Namespace) -> int:
    """The stalled sockets each room adds: only the slow-readers scenario has any."""
    return args.slow_readers if args.scenario == "slow-readers" else 0


def problems(args: argparse.Namespace, max_players: int) -> list[str]:
    """What makes these arguments a run the server cannot play; empty when they are fine."""
    found = []
    if args.rooms < 1 or args.bots < 1 or args.games < 1:
        found.append("--rooms, --bots and --games must each be at least 1")
    if not 1 <= args.procs <= max(1, args.rooms):
        found.append(f"--procs must be between 1 and --rooms ({args.rooms})")
    if args.ramp < 0:
        found.append("--ramp must not be negative")
    if args.join_concurrency < 1:
        found.append("--join-concurrency must be at least 1")
    per_room = args.bots + slow_readers_per_room(args)
    if per_room > max_players:
        found.append(f"{per_room} players per room is more than the server's {max_players}")
    if args.scenario == "slow-readers":
        if args.slow_readers < 1:
            found.append("slow-readers needs --slow-readers of at least 1")
        if args.questions < 2:
            found.append("slow-readers needs --questions of at least 2: a half to compare with")
        if urlsplit(args.base_url).scheme != "http":
            found.append("slow-readers opens raw sockets, so --base-url must be http://")
    if plan(args.questions) is None:
        found.append(f"no {MODE} round and event frequency add up to {args.questions}")
    return found


@dataclass(frozen=True)
class RoomSpec:
    """One room a worker plays: its place in the run, its addresses and its start offset."""

    index: int
    game: int
    addresses: list[str]
    seed: int | None
    offset: float
    narrate: bool


@dataclass(frozen=True)
class WorkerPlan:
    """Everything one bot process needs, picklable so it can cross into a spawned process."""

    base_url: str
    questions: int
    pace: str
    scenario: str
    bots: int
    slow_readers: int
    concurrency: int
    rooms: list[RoomSpec]


def worker_plans(args: argparse.Namespace, game: int, addresses: list[str]) -> list[WorkerPlan]:
    """Deal this game's rooms round-robin over ``--procs`` processes, each its own addresses.

    ``addresses`` is the whole run's, ``games x rooms`` blocks of one per player; a room
    takes the block at its global index, so no two rooms or games share an address.
    """
    slow = slow_readers_per_room(args)
    per_room = args.bots + slow
    burst = args.scenario == "join-burst"
    concurrency = max(1, args.join_concurrency // args.procs) if burst else SETUP_CONCURRENCY
    specs: list[list[RoomSpec]] = [[] for _ in range(args.procs)]
    for index in range(args.rooms):
        block = (game * args.rooms + index) * per_room
        specs[index % args.procs].append(
            RoomSpec(
                index=index,
                game=game,
                addresses=addresses[block : block + per_room],
                seed=None if args.seed is None else args.seed * 100_003 + game * args.rooms + index,
                offset=index * args.ramp / args.rooms,
                narrate=index == 0,
            )
        )
    return [
        WorkerPlan(
            base_url=args.base_url.rstrip("/"),
            questions=args.questions,
            pace=args.pace,
            scenario=args.scenario,
            bots=args.bots,
            slow_readers=slow,
            concurrency=concurrency,
            rooms=rooms,
        )
        for rooms in specs
    ]


# --- HTTP -----------------------------------------------------------------------------


class RunFailed(Exception):
    """The run could not be set up or could not be carried out. Not an assertion result."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


_TRUST_HINT = (
    ". Does the server trust this host's X-Forwarded-For (uvicorn --proxy-headers,"
    " FORWARDED_ALLOW_IPS holding 127.0.0.1)?"
)


def post(url: str, body: dict[str, Any], address: str) -> tuple[int, dict[str, Any]]:
    """One blocking JSON POST from ``address``: status and body, or ``RunFailed``."""
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "x-forwarded-for": address},
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:400]
        hint = _TRUST_HINT if exc.code == 429 else ""
        raise RunFailed(f"POST {url} -> {exc.code}: {detail}{hint}", exc.code) from None
    except (urllib.error.URLError, OSError) as exc:
        raise RunFailed(f"POST {url} could not be reached: {exc}", 0) from None


def scrape(base_url: str, token: str) -> dict[str, float]:
    """Every series on ``/metrics``, by its full name with labels."""
    request = urllib.request.Request(
        f"{base_url}/metrics", headers={"authorization": f"Bearer {token}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            return parse_metrics(response.read().decode())
    except (urllib.error.URLError, OSError) as exc:
        raise RunFailed(f"GET {base_url}/metrics failed: {exc}") from None


def parse_metrics(text: str) -> dict[str, float]:
    """Prometheus text format as ``{'name{labels}': value}``, comments skipped."""
    series = {}
    for line in text.splitlines():
        if line and not line.startswith("#"):
            name, _, value = line.rpartition(" ")
            try:
                series[name] = float(value)
            except ValueError:
                continue
    return series


_LABEL = re.compile(r'="([^"]*)"')


def _by_label(series: dict[str, float], name: str) -> dict[str, float]:
    return {
        _LABEL.findall(key)[0]: value
        for key, value in series.items()
        if key.startswith(name + "{") and _LABEL.findall(key)
    }


def metrics_summary(before: dict[str, float], after: dict[str, float]) -> dict[str, Any]:
    """What moved on ``/metrics`` over the run: lag, disconnects and refusals, by label."""

    def moved(name: str) -> dict[str, float]:
        old = _by_label(before, name)
        return {
            label: value - old.get(label, 0.0) for label, value in _by_label(after, name).items()
        }

    lag = moved("jbi_event_loop_lag_seconds_bucket")
    count = after.get("jbi_event_loop_lag_seconds_count", 0.0) - before.get(
        "jbi_event_loop_lag_seconds_count", 0.0
    )
    under = lag.get(str(SERVER_LAG_LIMIT_S), count)
    limited = moved("jbi_rate_limited_total")
    return {
        "lag_buckets": lag,
        "lag_samples": count,
        "lag_over_100ms": count - under,
        "ws_disconnects": {k: v for k, v in moved("jbi_ws_disconnects_total").items() if v},
        "rate_limited": {k: v for k, v in limited.items() if v},
        "rate_limited_total": sum(limited.values()),
        "db_pool_size": after.get("jbi_db_pool_size"),
    }


class HealthPoller(threading.Thread):
    """``GET /api/health`` four times a second, from a thread so a busy bot loop cannot skew it."""

    def __init__(self, base_url: str) -> None:
        super().__init__(daemon=True)
        self.url = f"{base_url}/api/health"
        self.samples: list[tuple[float, int]] = []
        self.halt = threading.Event()

    def run(self) -> None:
        while not self.halt.is_set():
            start = time.perf_counter()
            try:
                with urllib.request.urlopen(self.url, timeout=HEALTH_TIMEOUT) as response:
                    response.read()
                    status = response.status
            except urllib.error.HTTPError as exc:
                status = exc.code
            except urllib.error.URLError, OSError:
                status = 0
            took = time.perf_counter() - start
            self.samples.append((took, status))
            self.halt.wait(max(0.0, HEALTH_EVERY - took))


class ProcessSampler(threading.Thread):
    """CPU ticks and RSS of the server process each second, from ``/proc`` (Linux, same host)."""

    def __init__(self, pid: int) -> None:
        super().__init__(daemon=True)
        self.pid = pid
        self.samples: list[tuple[float, int, int]] = []
        self.marks: list[int] = []
        self.halt = threading.Event()
        self.sample()
        if not self.samples:
            raise RunFailed(f"--server-pid {pid}: no readable /proc/{pid}")

    def sample(self) -> None:
        try:
            stat = Path(f"/proc/{self.pid}/stat").read_text()
            status = Path(f"/proc/{self.pid}/status").read_text()
        except OSError:
            return
        fields = stat.rsplit(")", 1)[1].split()
        ticks = int(fields[11]) + int(fields[12])
        rss = next(int(line.split()[1]) for line in status.splitlines() if line.startswith("VmRSS"))
        self.samples.append((time.monotonic(), ticks, rss))

    def mark(self) -> None:
        """Note the latest sample as a game's end."""
        self.sample()
        self.marks.append(len(self.samples) - 1)

    def run(self) -> None:
        while not self.halt.wait(1.0):
            self.sample()


def process_summary(
    samples: list[tuple[float, int, int]],
    marks: list[int],
    rooms: int,
    sockets: int,
    ticks_per_second: float,
) -> dict[str, Any] | None:
    """CPU and RSS over the run from ``ProcessSampler``'s samples; ``None`` with fewer than two."""
    if len(samples) < 2:
        return None
    cpu = [
        (b[1] - a[1]) / ticks_per_second / (b[0] - a[0]) * 100
        for a, b in zip(samples, samples[1:], strict=False)
        if b[0] > a[0]
    ]
    span = samples[-1][0] - samples[0][0]
    average = (samples[-1][1] - samples[0][1]) / ticks_per_second / span * 100 if span else 0.0
    idle = samples[0][2]
    peak = max(s[2] for s in samples)
    return {
        "cpu_pct_avg": round(average, 2),
        "cpu_pct_peak": round(max(cpu, default=0.0), 2),
        "cpu_pct_per_room": round(average / rooms, 3),
        "rss_idle_kb": idle,
        "rss_peak_kb": peak,
        "rss_end_kb": samples[-1][2],
        "rss_per_socket_kb": round((peak - idle) / sockets, 2) if sockets else None,
        "rss_game_end_kb": [samples[i][2] for i in marks],
        "sockets": sockets,
    }


# --- one room -------------------------------------------------------------------------


@dataclass
class Ack:
    """One measured ``answer`` -> ``answer_ack`` round trip."""

    seconds: float
    bot: int
    question_index: int
    band: int | None


@dataclass
class Run:
    """One room's configuration, and what its bots collect as they go."""

    ws_url: str
    bots: int
    questions: int
    pace: str
    rng: random.Random
    scenario: str = "steady"

    acks: list[Ack] = field(default_factory=list)
    # Any `error` frame, refusal or unplanned close, from any bot. The first check is that
    # this stays empty.
    errors: list[str] = field(default_factory=list)
    closes: Counter[str] = field(default_factory=Counter)
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
    # Connect attempt to welcome, in seconds: every bot's first, and every reconnect's.
    first_welcomes: list[float] = field(default_factory=list)
    welcomes: list[float] = field(default_factory=list)
    # Server clock minus ours, from welcome.server_time. The largest sample is the one the
    # least delayed in transit, so the closest to the true offset.
    offset: float | None = None
    server_version: str | None = None
    stall_at: int | None = None
    stall: asyncio.Event = field(default_factory=asyncio.Event)

    @property
    def offline_for(self) -> float:
        return STORM_OFFLINE_FOR if self.scenario == "reconnect-storm" else OFFLINE_FOR

    def server_now(self) -> float:
        """Now on the server's clock, as far as the welcomes tell."""
        return time.time() + (self.offset or 0.0)

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
        if self.stall_at is not None and question["index"] >= self.stall_at:
            self.stall.set()


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
        self.attempt_at = 0.0  # perf_counter when the current connect began

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
            self.attempt_at = time.perf_counter()
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
                    self.run.closes[str(close.code if close else "none")] += 1
                    hint = _TRUST_HINT if close is not None and close.code == 1008 else ""
                    self.run.errors.append(f"bot {self.index} lost its socket: close {close}{hint}")
            except InvalidStatus as exc:
                status = exc.response.status_code
                self.run.closes[f"http {status}"] += 1
                hint = _TRUST_HINT if status == 429 else ""
                self.run.errors.append(f"bot {self.index} handshake refused: {status}{hint}")
            except (OSError, TimeoutError) as exc:
                if not self.leaving:
                    self.run.closes["unreachable"] += 1
                    self.run.errors.append(f"bot {self.index} could not connect: {exc!r}")
            finally:
                self.ws = None
                self.online.clear()
            if self.leaving:
                break
            self.dropping = False
            await asyncio.sleep(self.run.offline_for)

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
        waited = time.perf_counter() - self.attempt_at
        sample = _parse_time(frame["server_time"]) - time.time()
        run = self.run
        run.offset = sample if run.offset is None else max(run.offset, sample)
        run.server_version = frame.get("server_version")
        question = frame.get("question")
        self.current = question
        if self.returning:
            self.returning = False
            run.reconnects_completed += 1
            run.welcomes.append(waited)
            if question is None:
                run.rejoined_between += 1
            elif frame.get("your_answer") is not None:
                run.rejoined_answered += 1
            else:
                run.rejoined_pending += 1
        elif self.connects == 1:
            run.first_welcomes.append(waited)
        if question is not None:
            answered_here = question["question_id"] in self.answered
            if answered_here and frame.get("your_answer") is None:
                run.errors.append(
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

        now = self.run.server_now()
        scenario = self.run.scenario
        storm = scenario == "reconnect-storm" and not from_welcome
        reconnects = (
            scenario not in ("buzzer", "reconnect-storm")
            and not from_welcome
            and self.run.reconnector_for(question["index"]) == self.index
        )
        after = reconnects and self.run.drops_after_answering(question["index"])
        if scenario == "buzzer":
            at = buzzer_time(question, now)
        else:
            fraction = EARLY_FRACTION if after else ANSWER_FRACTION
            at = send_time(question, now, self.run.rng, fraction)
        if at is None:
            self.missed.append(question["index"])
            return
        self._spawn(self.answer_later(question, at - now))
        if reconnects:
            self._spawn(self.drop_and_return(qid, after=after))
        elif storm:
            self._spawn(self.drop_and_return(qid, at=storm_time(question)))

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
        # answer: the gap is under a second and the window has seconds left in it.
        try:
            async with asyncio.timeout(_remaining(question, self.run.server_now())):
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

    async def drop_and_return(
        self, qid: str, *, after: bool = False, at: float | None = None
    ) -> None:
        """Close the socket without warning. ``run_socket`` brings it back through hello.

        Before answering, the drop is at once: the answer is drawn after answerable_at, so
        it cannot have gone yet. After answering, it waits for the ack. A storm drops at
        ``at`` on the server's clock, answered or not.
        """
        if at is not None:
            await asyncio.sleep(max(0.0, at - self.run.server_now()))
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
        current = self.current
        if ws is None or self.leaving or current is None or current["question_id"] != qid:
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


def _remaining(question: dict[str, Any], now: float) -> float:
    """What is left of the window at ``now`` on the server's clock."""
    return max(0.0, _parse_time(question["ends_at"]) - now)


def _parse_time(value: str) -> float:
    return datetime.fromisoformat(value).timestamp()


def _ws_frame(opcode: int, payload: bytes) -> bytes:
    """One masked client frame, as RFC 6455 requires of a client."""
    mask = os.urandom(4)
    size = len(payload)
    if size < 126:
        head = struct.pack("!BB", 0x80 | opcode, 0x80 | size)
    else:
        head = struct.pack("!BBH", 0x80 | opcode, 0x80 | 126, size)
    return head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload))


def _tcp_gone(sock: socket.socket) -> bool:
    """Whether the server has let go of this socket, without reading from it.

    A ws ping of our own reaches a server that still holds the socket as a frame it
    answers, and one that has closed it as data for a closed socket, which it refuses with
    a reset. The kernel's own state then says so.
    """
    try:
        sock.send(_ws_frame(0x9, b""))
    except BlockingIOError:
        pass
    except OSError:
        return True
    tcp_info = getattr(socket, "TCP_INFO", None)
    if tcp_info is None:
        return False
    established = 1
    return sock.getsockopt(socket.IPPROTO_TCP, tcp_info, 1)[0] != established


async def stall(run: Run, base_url: str, session: str, address: str) -> float | None:
    """A player whose phone stops reading: hello, then nothing. Seconds until the server let go.

    ``None`` if it still held the socket ``SLOW_CLOSED_WITHIN`` seconds (and a grace) later.
    A raw socket, since a websocket library reads on its own whatever its caller does.
    """
    await run.stall.wait()
    loop = asyncio.get_running_loop()
    parts = urlsplit(base_url)
    host, port = parts.hostname or "127.0.0.1", parts.port or 80
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, SLOW_RCVBUF)
    sock.setblocking(False)
    try:
        await loop.sock_connect(sock, (host, port))
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET {run.ws_url.split(parts.netloc, 1)[1]} HTTP/1.1\r\nHost: {parts.netloc}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
            f"X-Forwarded-For: {address}\r\n\r\n"
        )
        await loop.sock_sendall(sock, handshake.encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = await loop.sock_recv(sock, 1)
            if not chunk:
                raise OSError("closed during the handshake")
            head += chunk
        status = head.split(b"\r\n", 1)[0].decode(errors="replace")
        if " 101 " not in status:
            run.errors.append(f"slow reader handshake refused: {status}")
            return None
        hello = json.dumps({"t": "hello", "session": session}).encode()
        await loop.sock_sendall(sock, _ws_frame(0x1, hello))
        started = loop.time()
        while loop.time() - started < SLOW_CLOSED_WITHIN + SLOW_GRACE:
            await asyncio.sleep(SLOW_PROBE_EVERY)
            if _tcp_gone(sock):
                return loop.time() - started
        return None
    except OSError as exc:
        run.errors.append(f"slow reader could not connect: {exc!r}")
        return None
    finally:
        sock.close()


# --- setting a room up ----------------------------------------------------------------


def create_room(
    base_url: str, run: Run, room: Plan, name: str, address: str
) -> tuple[str, str, str]:
    """Create the room as bot 0, who is therefore its admin. Returns code, session, id."""
    _, created = post(
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
    _, joined = post(
        f"{base_url}/api/rooms/{code}/join",
        {"returning": False, "display_name": name},
        address,
    )
    return joined["session"], joined["player"]["id"]


def timed_join(
    base_url: str, code: str, name: str, address: str
) -> tuple[float, int, tuple[str, str] | None, str | None]:
    """One join: seconds, HTTP status (0 unreachable), session and id, or the failure."""
    start = time.perf_counter()
    try:
        joined = join_room(base_url, code, name, address)
    except RunFailed as failure:
        return time.perf_counter() - start, failure.status or 0, None, str(failure)
    return time.perf_counter() - start, 200, joined, None


async def count_answers(database_url: str, codes: list[str]) -> dict[str, int]:
    """Rows in ``answers`` belonging to each room's questions."""
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
        rows = await conn.fetch(
            "select r.code, count(a.question_id) as n from rooms r"
            " join questions q on q.room_id = r.id"
            " left join answers a on a.question_id = q.id"
            " where r.code = any($1::text[]) group by r.code",
            [code.upper() for code in codes],
        )
    finally:
        await conn.close()
    found = {row["code"]: row["n"] for row in rows}
    return {code: found.get(code.upper(), 0) for code in codes}


def _redact(database_url: str) -> str:
    """The URL without its password, for an error message someone may paste."""
    if "@" not in database_url or "//" not in database_url:
        return database_url
    scheme, rest = database_url.split("//", 1)
    credentials, host = rest.rsplit("@", 1)
    user = credentials.split(":", 1)[0]
    return f"{scheme}//{user}:***@{host}"


def _ws_scheme(base: str) -> str:
    return base.replace("https://", "wss://", 1).replace("http://", "ws://", 1)


@dataclass
class Room:
    """A room as one worker plays it: the shared run, its bots, and the stalled players."""

    spec: RoomSpec
    run: Run
    bots: list[Bot]
    code: str
    slow: list[tuple[str, str]] = field(default_factory=list)
    stalled: list[float | None] = field(default_factory=list)

    def result(self, slow_readers: int) -> dict[str, Any]:
        """What the parent needs of this room, as plain data."""
        run = self.run
        shapes = {json.dumps(b.standings, sort_keys=True) for b in self.bots if b.standings}
        return {
            "code": self.code,
            "index": self.spec.index,
            "game": self.spec.game,
            "bots": len(self.bots),
            "slow_readers": slow_readers,
            "total": run.total,
            "played": len(run.played),
            "acks": [[a.seconds, a.question_index] for a in run.acks],
            "sent": sum(b.sent for b in self.bots),
            "acked": sum(b.acked for b in self.bots),
            "missed": sum(len(b.missed) for b in self.bots),
            "finished": sum(1 for b in self.bots if b.standings is not None),
            "standings_distinct": len(shapes),
            "top": (self.bots[0].standings or [])[:5],
            "errors": run.errors,
            "closes": dict(run.closes),
            "reconnects": {
                "attempted": run.reconnects_attempted,
                "completed": run.reconnects_completed,
                "answered": run.rejoined_answered,
                "pending": run.rejoined_pending,
                "between": run.rejoined_between,
            },
            "first_welcomes": run.first_welcomes,
            "welcomes": run.welcomes,
            "stalled": self.stalled,
            "stall_at": run.stall_at,
            "server_version": run.server_version,
            "offset_ms": None if run.offset is None else round(run.offset * 1000, 2),
        }


# --- playing --------------------------------------------------------------------------


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


async def progress(room: Room) -> None:
    """One line per question, from the first room's admin, so a long run shows its work."""
    seen = -1
    bot = room.bots[0]
    while not bot.leaving:
        current = bot.current
        if current is not None and current["index"] != seen:
            seen = current["index"]
            print(
                f"  room {room.code} q {seen + 1:2d}/{current['total']}"
                f"  answers acknowledged so far: {len(room.run.acks)}",
                flush=True,
            )
        await asyncio.sleep(0.25)


async def play_room(room: Room, base_url: str, start_at: float) -> None:
    """Wait for this room's turn in the ramp, play it, and see its stalled sockets out."""
    await asyncio.sleep(max(0.0, start_at - time.time()))
    stalls = [asyncio.create_task(stall(room.run, base_url, s, a)) for s, a in room.slow]
    narrator = asyncio.create_task(progress(room)) if room.spec.narrate else None
    try:
        await play(room.run, room.bots)
    except RunFailed as failure:
        room.run.errors.append(str(failure))
    finally:
        if narrator is not None:
            narrator.cancel()
    if stalls and not room.run.stall.is_set():
        room.run.errors.append("the game ended before its slow readers stalled")
        for task in stalls:
            task.cancel()
    room.stalled = [
        r
        for r in await asyncio.gather(*stalls, return_exceptions=True)
        if not isinstance(r, BaseException)
    ]


async def _loop_lag(samples: list[float]) -> None:
    loop = asyncio.get_running_loop()
    while True:
        start = loop.time()
        await asyncio.sleep(PROBE_SLEEP)
        samples.append(loop.time() - start - PROBE_SLEEP)


async def run_worker(work: WorkerPlan, barrier: Any = None) -> dict[str, Any]:
    """Set up and play this process's rooms; what they collected, as plain data."""
    loop = asyncio.get_running_loop()
    lag: list[float] = []
    probe = asyncio.create_task(_loop_lag(lag))
    pool = ThreadPoolExecutor(max_workers=work.concurrency)
    room_plan = plan(work.questions)
    assert room_plan is not None
    base = work.base_url
    try:

        async def create(spec: RoomSpec) -> Room:
            run = Run(
                ws_url="",
                bots=work.bots,
                questions=work.questions,
                pace=work.pace,
                rng=random.Random(spec.seed),
                scenario=work.scenario,
            )
            if work.slow_readers:
                run.stall_at = slow_from(work.questions)
            address = spec.addresses[0]
            code, session, player_id = await loop.run_in_executor(
                pool, create_room, base, run, room_plan, "bot00", address
            )
            run.ws_url = f"{_ws_scheme(base)}/ws/{code}"
            return Room(spec, run, [Bot(run, 0, "bot00", session, player_id, address)], code)

        rooms = await asyncio.gather(*(create(spec) for spec in work.rooms))
        if barrier is not None:
            await asyncio.to_thread(barrier.wait, BARRIER_TIMEOUT)
        started = time.time()

        jobs = []
        for room in rooms:
            for index in range(1, work.bots + work.slow_readers):
                slow = index >= work.bots
                name = f"slow{index - work.bots:02d}" if slow else f"bot{index:02d}"
                address = room.spec.addresses[index]
                jobs.append((room, index, name, address, slow))
        timings = await asyncio.gather(
            *(
                loop.run_in_executor(pool, timed_join, base, room.code, name, address)
                for room, _, name, address, _ in jobs
            )
        )
        joins = []
        for (room, index, name, address, slow), (took, status, joined, failure) in zip(
            jobs, timings, strict=True
        ):
            joins.append([took, status])
            if joined is None:
                room.run.errors.append(f"{name} could not join: {failure}")
            elif slow:
                room.slow.append((joined[0], address))
            else:
                room.bots.append(Bot(room.run, index, name, joined[0], joined[1], address))
        await asyncio.gather(*(play_room(room, base, started + room.spec.offset) for room in rooms))
    finally:
        probe.cancel()
        pool.shutdown(wait=False)
    return {
        "rooms": [room.result(work.slow_readers) for room in rooms],
        "joins": joins,
        "loop_lag": stats(lag),
    }


def _worker_process(work: WorkerPlan, barrier: Any, out: str) -> None:
    try:
        result = asyncio.run(run_worker(work, barrier))
    except (RunFailed, threading.BrokenBarrierError) as failure:
        result = {"failed": str(failure) or type(failure).__name__}
    Path(out).write_text(json.dumps(result))


def run_workers(works: list[WorkerPlan]) -> list[dict[str, Any]]:
    """Play every worker's rooms: in this process for one, in spawned processes for more."""
    if len(works) == 1:
        return [asyncio.run(run_worker(works[0]))]
    context = multiprocessing.get_context("spawn")
    barrier = context.Barrier(len(works))
    with tempfile.TemporaryDirectory() as folder:
        outs = [os.path.join(folder, f"{i}.json") for i in range(len(works))]
        procs = [
            context.Process(target=_worker_process, args=(work, barrier, out))
            for work, out in zip(works, outs, strict=True)
        ]
        for proc in procs:
            proc.start()
        for proc in procs:
            proc.join()
        results = []
        for number, (proc, out) in enumerate(zip(procs, outs, strict=True)):
            if not os.path.exists(out):
                raise RunFailed(f"bot process {number} exited {proc.exitcode} with no result")
            result = json.loads(Path(out).read_text())
            if "failed" in result:
                raise RunFailed(f"bot process {number}: {result['failed']}")
            results.append(result)
    return results


# --- the report -----------------------------------------------------------------------


def _git_sha() -> str | None:
    try:
        done = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=5
        )
    except OSError, subprocess.SubprocessError:
        return None
    return done.stdout.strip() or None


def build_report(
    args: dict[str, Any],
    workers: list[dict[str, Any]],
    rows: dict[str, int],
    metrics: dict[str, Any] | None,
    health: list[tuple[float, int]] | None,
    process: dict[str, Any] | None,
) -> dict[str, Any]:
    """The run as one JSON-able document: what ``--json`` writes and the checks read."""
    rooms = [room for worker in workers for room in worker["rooms"]]
    acks = [(s, q) for room in rooms for s, q in room["acks"]]
    per_question: dict[int, list[float]] = {}
    for seconds, index in acks:
        per_question.setdefault(index, []).append(seconds)
    errors = [f"room {room['code']}: {e}" for room in rooms for e in room["errors"]]
    closes: Counter[str] = Counter()
    for room in rooms:
        closes.update(room["closes"])
    reconnects = {
        key: sum(room["reconnects"][key] for room in rooms)
        for key in ("attempted", "completed", "answered", "pending", "between")
    }
    joins = [took for worker in workers for took, _ in worker["joins"]]
    statuses = Counter(str(status) for worker in workers for _, status in worker["joins"])
    lags = [worker["loop_lag"] for worker in workers]
    report: dict[str, Any] = {
        "tool": "loadtest",
        "version": APP_VERSION,
        "server_version": next((r["server_version"] for r in rooms if r["server_version"]), None),
        "git_sha": _git_sha(),
        "started_at": args.get("started_at"),
        "args": {k: v for k, v in args.items() if k != "started_at"},
        "scenario": args["scenario"],
        "acks": stats([s for s, _ in acks]),
        "per_question": [
            {"question": index + 1, **stats(values)}
            for index, values in sorted(per_question.items())
        ],
        "rooms": [
            {
                "code": room["code"],
                "game": room["game"],
                "bots": room["bots"],
                "questions_total": room["total"],
                "played": room["played"],
                "acks": stats([s for s, _ in room["acks"]]),
                "sent": room["sent"],
                "acked": room["acked"],
                "missed": room["missed"],
                "rows": rows.get(room["code"]),
                "finished": room["finished"],
                "standings_distinct": room["standings_distinct"],
                "errors": len(room["errors"]),
                "offset_ms": room["offset_ms"],
            }
            for room in rooms
        ],
        "top": rooms[0]["top"] if rooms else [],
        "error_count": len(errors),
        "errors": errors[:50],
        "closes": dict(closes),
        "reconnects": {
            **reconnects,
            "welcome": stats([w for room in rooms for w in room["welcomes"]]),
            "first_welcome": stats([w for room in rooms for w in room["first_welcomes"]]),
        },
        "joins": {**stats(joins), "histogram_ms": histogram(joins), "statuses": dict(statuses)},
        "server": {
            "metrics": metrics,
            "health": None
            if health is None
            else {
                **stats([took for took, _ in health]),
                "failures": sum(1 for _, status in health if status != 200),
            },
            "process": process,
        },
        "harness": {
            "procs": len(workers),
            "loop_lag": max(lags, key=lambda lag: lag.get("p99_ms", 0.0)) if lags else {},
            "per_proc": lags,
        },
    }
    stall_at = next((room["stall_at"] for room in rooms if room["stall_at"] is not None), None)
    if stall_at is not None:
        stalled = [s for room in rooms for s in room["stalled"]]
        closed = [s for s in stalled if s is not None]
        report["slow_readers"] = {
            "expected": sum(room["slow_readers"] for room in rooms),
            "stalled": len(stalled),
            "closed": len(closed),
            "closed_after_max_s": round(max(closed), 1) if closed else None,
            "stall_from_question": stall_at + 1,
            "before": stats([s for s, q in acks if q < stall_at]),
            "during": stats([s for s, q in acks if q >= stall_at]),
        }
    return report


def validity(report: dict[str, Any]) -> tuple[bool, str]:
    """Whether the bot processes kept up: a lagging harness measures itself, not the server."""
    lag = report["harness"]["loop_lag"]
    p99 = lag.get("p99_ms")
    if p99 is None:
        return True, "bot loop lag: no samples"
    return p99 < BOT_LAG_P99_MS, (
        f"bot loop lag p99 {p99:.1f} ms (max {lag['max_ms']:.1f}) against {BOT_LAG_P99_MS:.0f} ms,"
        f" worst of {report['harness']['procs']} process(es)"
    )


def evaluate(report: dict[str, Any]) -> list[dict[str, Any]]:
    """Every check the run's arguments call for, each passed or not with its numbers."""
    args = report["args"]
    scenario = report["scenario"]
    rooms = report["rooms"]
    asked = args["questions"]
    limit = args["p99_ms"]
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, detail: str) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    complete = [
        r
        for r in rooms
        if r["finished"] == r["bots"] and r["questions_total"] == asked and r["played"] == asked
    ]
    check(
        "rooms",
        len(complete) == len(rooms) and report["error_count"] == 0,
        f"{len(complete)}/{len(rooms)} rooms played {asked} questions to game_finished,"
        f" {report['error_count']} errors",
    )
    acks = report["acks"]
    if acks["count"]:
        check("ack p99", acks["p99_ms"] < limit, f"{acks['p99_ms']:.1f} ms against {limit:.0f} ms")
        worst = max(rooms, key=lambda r: r["acks"].get("p99_ms", math.inf))
        p99 = worst["acks"].get("p99_ms", math.inf)
        check("worst room ack p99", p99 < limit, f"{p99:.1f} ms in {worst['code']}")
    else:
        check("ack p99", False, "no answers were acknowledged")
    off = [r for r in rooms if not r["rows"] == r["acked"] == r["sent"]]
    check(
        "answers rows",
        not off,
        f"{len(rooms) - len(off)}/{len(rooms)} rooms hold one row per acknowledged answer"
        + "".join(
            f"; {r['code']}: {r['rows']} rows, {r['acked']} acked, {r['sent']} sent"
            for r in off[:5]
        ),
    )
    split = [r for r in rooms if r["standings_distinct"] != 1]
    check("standings", not split, f"{len(rooms) - len(split)}/{len(rooms)} rooms agree on one")
    rc = report["reconnects"]
    if scenario != "buzzer":
        both = scenario == "reconnect-storm" or asked < 2 or (rc["answered"] and rc["pending"])
        check(
            "reconnects",
            rc["completed"] == rc["attempted"] > 0 and both,
            f"{rc['completed']} of {rc['attempted']} back, to {rc['answered']} answered,"
            f" {rc['pending']} still to answer, {rc['between']} between questions",
        )
    metrics = report["server"]["metrics"]
    if metrics is not None:
        check(
            "rate limiting",
            metrics["rate_limited_total"] == 0,
            f"jbi_rate_limited_total moved by {metrics['rate_limited_total']:g}"
            f" {metrics['rate_limited']}",
        )
    if args.get("smoke"):
        return checks

    if metrics is not None and scenario == "steady":
        check(
            "server loop lag",
            metrics["lag_over_100ms"] == 0,
            f"{metrics['lag_over_100ms']:g} of {metrics['lag_samples']:g} probes over 100 ms",
        )
    health = report["server"]["health"]
    if health is not None and health["count"]:
        if scenario == "reconnect-storm":
            ok = health["max_ms"] < STORM_HEALTH_MAX_MS
            limit_text = f"max {health['max_ms']:.0f} ms against {STORM_HEALTH_MAX_MS:.0f}"
        else:
            ok = health["p99_ms"] < HEALTH_P99_MS
            limit_text = f"p99 {health['p99_ms']:.0f} ms against {HEALTH_P99_MS:.0f}"
        check(
            "health",
            ok and health["failures"] == 0,
            f"{limit_text}, {health['failures']} of {health['count']} not 200",
        )
    process = report["server"]["process"]
    if process is not None:
        sockets = process["sockets"]
        if sockets >= RSS_MIN_SOCKETS and process["rss_per_socket_kb"] is not None:
            check(
                "RSS per socket",
                process["rss_per_socket_kb"] < RSS_PER_SOCKET_KB,
                f"{process['rss_per_socket_kb']:.0f} KB over {sockets} sockets"
                f" against {RSS_PER_SOCKET_KB:.0f}",
            )
        ends = process["rss_game_end_kb"]
        if len(ends) >= 2:
            check(
                "RSS across games",
                ends[-1] <= ends[0] * (1 + RSS_DRIFT),
                f"{ends[0]} KB after game 1, {ends[-1]} KB after game {len(ends)}",
            )

    if scenario == "buzzer" and acks["count"]:
        check(
            "buzzer last ack",
            acks["max_ms"] < BUZZER_LAST_ACK_MS,
            f"{acks['max_ms']:.1f} ms against {BUZZER_LAST_ACK_MS:.0f}",
        )
    if scenario == "reconnect-storm":
        welcome = rc["welcome"]
        check(
            "storm welcome p99",
            welcome["count"] > 0 and welcome.get("p99_ms", math.inf) < STORM_WELCOME_P99_MS,
            f"reconnect -> welcome p99 {welcome.get('p99_ms', math.nan):.0f} ms"
            f" (max {welcome.get('max_ms', math.nan):.0f}) over {welcome['count']}"
            f" against {STORM_WELCOME_P99_MS:.0f}",
        )
    slow = report.get("slow_readers")
    if scenario == "slow-readers" and slow is not None:
        check(
            "slow readers closed",
            slow["closed"] == slow["expected"],
            f"{slow['closed']} of {slow['expected']} closed within {SLOW_CLOSED_WITHIN:.0f} s,"
            f" the last after {slow['closed_after_max_s']} s",
        )
        before, during = slow["before"].get("p99_ms"), slow["during"].get("p99_ms")
        check(
            "others beside slow readers",
            before is not None and during is not None and during <= before * SLOW_P99_RATIO,
            f"ack p99 {during} ms while stalled against {before} ms before"
            f" (at most {SLOW_P99_RATIO}x)",
        )
    if scenario == "join-burst":
        joins = report["joins"]
        errors = sum(n for status, n in joins["statuses"].items() if status.startswith("5"))
        check(
            "join burst",
            joins["count"] > 0 and joins.get("p99_ms", math.inf) < JOIN_P99_MS and errors == 0,
            f"join p99 {joins.get('p99_ms', math.nan):.0f} ms"
            f" (max {joins.get('max_ms', math.nan):.0f})"
            f" over {joins['count']} against {JOIN_P99_MS:.0f}, {errors} 5xx",
        )
    return checks


def _dig(document: dict[str, Any], path: tuple[str, ...]) -> Any:
    for key in path:
        if not isinstance(document, dict):
            return None
        document = document.get(key)  # type: ignore[assignment]
    return document


def compare(old: dict[str, Any], new: dict[str, Any], factor: float) -> list[dict[str, Any]]:
    """A check per metric both runs hold: passed while new is at most ``factor`` x old."""
    checks = []
    for name, path in COMPARED:
        before, after = _dig(old, path), _dig(new, path)
        if not isinstance(before, int | float) or not isinstance(after, int | float) or before <= 0:
            continue
        ratio = after / before
        checks.append(
            {
                "name": f"compare {name}",
                "passed": ratio <= factor,
                "detail": f"{before:g} -> {after:g}, {ratio:.2f}x against {factor:g}x",
            }
        )
    return checks


def _spread(s: dict[str, Any]) -> str:
    return f"p50 {s['p50_ms']:.1f} ms  p99 {s['p99_ms']:.1f} ms  max {s['max_ms']:.1f} ms"


def print_report(report: dict[str, Any]) -> None:
    """Every number worth reading, then every check, then whether the run counts."""
    acks = report["acks"]
    print(f"\n== load test report: {report['scenario']}, {len(report['rooms'])} rooms ==\n")
    if acks["count"]:
        print(f"    answer -> answer_ack over {acks['count']} answers: {_spread(acks)}")
    for room in sorted(report["rooms"], key=lambda r: -r["acks"].get("p99_ms", 0))[:10]:
        p99 = room["acks"].get("p99_ms", 0)
        print(
            f"    room {room['code']:<22} {room['finished']}/{room['bots']} finished,"
            f" {room['acked']} acked, {room['rows']} rows, p99 {p99:.1f} ms"
        )
    for line in report["errors"][:20]:
        print(f"    error: {line}")
    if report["error_count"] > 20:
        print(f"    ... and {report['error_count'] - 20} more")
    rc = report["reconnects"]
    for label, w in (("first connect", rc["first_welcome"]), ("reconnect", rc["welcome"])):
        if w["count"]:
            print(f"    {label} -> welcome: {_spread(w)}")
    joins = report["joins"]
    if joins["count"]:
        print(f"    joins: {_spread(joins)}, by ms {joins['histogram_ms']}")
    server = report["server"]
    if server["health"] and server["health"]["count"]:
        h = server["health"]
        print(f"    /api/health: {_spread(h)}, {h['failures']} not 200")
    if server["metrics"]:
        m = server["metrics"]
        print(
            f"    server: {m['lag_over_100ms']:g} lag probes over 100 ms,"
            f" disconnects {m['ws_disconnects']}, pool {m['db_pool_size']}"
        )
    else:
        print("    server metrics: METRICS_TOKEN is unset, so /metrics was not scraped")
    if server["process"]:
        p = server["process"]
        print(
            f"    server process: CPU {p['cpu_pct_avg']:.1f}% avg, {p['cpu_pct_peak']:.0f}% peak,"
            f" {p['cpu_pct_per_room']:.2f}% per room;"
            f" RSS {p['rss_idle_kb']} -> {p['rss_peak_kb']} KB,"
            f" {p['rss_per_socket_kb']} KB per socket"
        )
    if report.get("slow_readers"):
        sr = report["slow_readers"]
        print(
            f"    slow readers: {sr['closed']}/{sr['expected']} closed,"
            f" the last after {sr['closed_after_max_s']} s"
        )
    print()
    for item in report["checks"]:
        print(f"  [{'PASS' if item['passed'] else 'FAIL'}] {item['name']}: {item['detail']}")
    print(f"  [{'VALID' if report['valid'] else 'INVALID'}] {report['validity']}\n")


# --- the run --------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    base = args.base_url.rstrip("/")
    token = get_settings().metrics_token
    before = scrape(base, token) if token else None
    max_players = int(
        (before or {}).get("jbi_max_players_per_room") or get_settings().max_players_per_room
    )
    found = problems(args, max_players)
    if found:
        raise RunFailed("; ".join(found))
    room_plan = plan(args.questions)
    assert room_plan is not None
    per_room = args.bots + slow_readers_per_room(args)
    addresses = bot_addresses(args.games * args.rooms * per_room, random.Random())
    print(
        f"setting up: {args.scenario}, {args.games} x {args.rooms} rooms of {args.bots} bots"
        f" over {args.procs} process(es), {args.questions} questions ({room_plan.round_questions}"
        f" {MODE}, {room_plan.custom} of our own) at {args.pace} pace against {base}",
        flush=True,
    )
    started_at = datetime.now(UTC).isoformat()
    health = HealthPoller(base)
    sampler = ProcessSampler(args.server_pid) if args.server_pid else None
    health.start()
    if sampler is not None:
        sampler.start()
    workers: list[dict[str, Any]] = []
    try:
        for game in range(args.games):
            workers += run_workers(worker_plans(args, game, addresses))
            if sampler is not None:
                sampler.mark()
    finally:
        health.halt.set()
        if sampler is not None:
            sampler.halt.set()
        health.join()
    after = scrape(base, token) if token else None
    codes = [room["code"] for worker in workers for room in worker["rooms"]]
    rows = asyncio.run(count_answers(args.database_url, codes))
    process = None
    if sampler is not None:
        process = process_summary(
            sampler.samples,
            sampler.marks,
            args.rooms,
            args.rooms * per_room,
            os.sysconf("SC_CLK_TCK"),
        )
    record = {**vars(args), "started_at": started_at}
    record.pop("database_url", None)
    report = build_report(
        record,
        workers,
        rows,
        metrics_summary(before, after) if before is not None and after is not None else None,
        health.samples,
        process,
    )
    report["checks"] = evaluate(report)
    if args.compare:
        old = json.loads(Path(args.compare).read_text())
        report["checks"] += compare(old, report, args.compare_factor)
    report["valid"], report["validity"] = validity(report)
    report["passed"] = all(item["passed"] for item in report["checks"])
    print_report(report)
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2) + "\n")
        print(f"  report written to {args.json}")
    if not report["valid"]:
        return EXIT_INVALID
    return EXIT_PASSED if report["passed"] else EXIT_FAILED


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n")[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="the running server")
    parser.add_argument("--rooms", type=int, default=DEFAULT_ROOMS)
    parser.add_argument(
        "--bots", type=int, default=DEFAULT_BOTS, help="players per room, its admin included"
    )
    parser.add_argument("--questions", type=int, default=DEFAULT_QUESTIONS)
    parser.add_argument("--pace", choices=["walk", "run", "teleport"], default=DEFAULT_PACE)
    parser.add_argument("--scenario", choices=SCENARIOS, default="steady")
    parser.add_argument(
        "--ramp", type=float, default=0.0, help="seconds to spread room starts over"
    )
    parser.add_argument("--procs", type=int, default=1, help="bot processes to split rooms over")
    parser.add_argument("--games", type=int, default=1, help="games to play back to back")
    parser.add_argument("--slow-readers", type=int, default=DEFAULT_SLOW_READERS)
    parser.add_argument("--join-concurrency", type=int, default=DEFAULT_JOIN_CONCURRENCY)
    parser.add_argument(
        "--p99-ms",
        type=float,
        default=DEFAULT_P99_MS,
        help="the p99 answer -> answer_ack budget the run asserts",
    )
    parser.add_argument("--smoke", action="store_true", help="only the loose checks CI runs")
    parser.add_argument("--server-pid", type=int, help="sample this process's CPU and RSS")
    parser.add_argument("--json", help="write the report here")
    parser.add_argument("--compare", help="a report from an earlier run to hold this one against")
    parser.add_argument("--compare-factor", type=float, default=DEFAULT_COMPARE_FACTOR)
    parser.add_argument(
        "--database-url",
        default=get_settings().database_url,
        help="where to count the answers rows; defaults to the server's own DATABASE_URL",
    )
    parser.add_argument("--seed", type=int, default=None, help="fix the answer timing draw")
    return parser.parse_args(argv)


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except RunFailed as failure:
        sys.exit(f"load test could not run: {failure}")
    except KeyboardInterrupt:
        sys.exit(130)
