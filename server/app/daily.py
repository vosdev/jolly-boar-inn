"""The daily set: ten questions everyone plays, drawn once a day and stored whole.

A day runs from 08:00 UTC to the next 08:00 UTC and is named after the date it opens on, so
before eight a morning still plays yesterday's set. A day's first request draws the set, with
no cron. It is stored whole, so a restart, a deploy or a pack edit cannot change it, and never
seeded from the date, because the packs are public and tomorrow's set could be worked out.

The draw picks a mode first and a question in it second. By question, the largest pools would
fill their two places nearly every day and each new round would dilute the rest. The caps
keep a set varied, and four types hold at most nine questions, so ten always span five.
"""

import random
from collections import Counter
from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import asyncpg

from app.config import Settings
from app.modes import drawable, offered
from app.questions.packs import EVENT_MODE, Pack, live_packs

DAY_OPENS = timedelta(hours=8)
SET_SIZE = 10
MAX_PER_MODE = 2
MAX_PER_TYPE = 2
TYPE_LIMITS = {"multiple_choice": 3}
REST_DAYS = 60
# A draw can corner itself on the caps, and a short pool wants the fewest returning questions.
TRIES = 100


class NoDailySet(RuntimeError):
    """The packs cannot fill a set under the caps, even with every question back in."""


@dataclass(frozen=True, slots=True)
class DailySet:
    """One day's questions, whole, answers included, so never for a client as it stands."""

    day: date
    number: int
    questions: list[dict[str, Any]]


def day_of(now: datetime) -> date:
    """The date the daily window holding ``now`` opened on."""
    return (now.astimezone(UTC) - DAY_OPENS).date()


def number_of(day: date, first_day: date) -> int:
    """A day's number, counting ``first_day`` as #1."""
    return (day - first_day).days + 1


def reuse_key(question: dict[str, Any]) -> str:
    """What the rest period tracks: the id, but a price question's subject.

    A price is in the id, so regenerating the pack would bring the same question back as new.
    """
    payload = question["payload"]
    if question["type"] == "price_is_right":
        return _subject(payload)
    if question["type"] == "more_less":
        items = sorted(_subject(option) for option in payload["options"])
        return " ".join([payload["metric"], *items])
    return question["id"]


def _subject(priced: dict[str, Any]) -> str:
    subject = priced["subject"]
    return subject.get("asset", subject["name"])


def candidates(
    packs: Iterable[Pack], settings: Settings, pictures: Collection[str]
) -> list[dict[str, Any]]:
    """Every question a set may hold: offered rounds' own pools, and the NPCs'."""
    packs = list(packs)
    modes = {
        mode.id
        for mode in offered(settings, packs, pictures)
        if mode.id == EVENT_MODE or (mode.is_round and mode.pool is None)
    }
    return [
        question
        for pack in live_packs(packs)
        for question in pack.questions
        if question["mode"] in modes and drawable(question, pictures)
    ]


def draw(
    pool: Sequence[dict[str, Any]],
    last_used: Mapping[str, date],
    day: date,
    rng: random.Random,
) -> list[dict[str, Any]] | None:
    """A set in play order with the fewest returning questions, or ``None`` if none fits."""
    best: list[dict[str, Any]] | None = None
    fewest = SET_SIZE + 1
    for _ in range(TRIES):
        picked = _attempt(pool, last_used, day, rng)
        if picked is None:
            continue
        returning = sum(not _rested(question, last_used, day) for question in picked)
        if returning < fewest:
            best, fewest = picked, returning
        if not fewest:
            break
    if best is not None:
        rng.shuffle(best)
    return best


def _rested(question: dict[str, Any], last_used: Mapping[str, date], day: date) -> bool:
    used = last_used.get(reuse_key(question))
    return used is None or (day - used).days >= REST_DAYS


def _attempt(
    pool: Sequence[dict[str, Any]],
    last_used: Mapping[str, date],
    day: date,
    rng: random.Random,
) -> list[dict[str, Any]] | None:
    """One pass: rested questions, a random mode at a time, then the oldest-used."""
    rested: dict[str, list[dict[str, Any]]] = {}
    returning: list[dict[str, Any]] = []
    for question in rng.sample(pool, len(pool)):
        if _rested(question, last_used, day):
            rested.setdefault(question["mode"], []).append(question)
        else:
            returning.append(question)
    returning.sort(key=lambda question: last_used[reuse_key(question)])

    picked: list[dict[str, Any]] = []
    keys: set[str] = set()
    modes: Counter[str] = Counter()
    types: Counter[str] = Counter()

    def fits(question: dict[str, Any]) -> bool:
        return (
            modes[question["mode"]] < MAX_PER_MODE
            and types[question["type"]] < TYPE_LIMITS.get(question["type"], MAX_PER_TYPE)
            and reuse_key(question) not in keys
        )

    while len(picked) < SET_SIZE:
        ready = [
            found
            for questions in rested.values()
            if (found := next(filter(fits, questions), None)) is not None
        ]
        question = rng.choice(ready) if ready else next(filter(fits, returning), None)
        if question is None:
            return None
        picked.append(question)
        keys.add(reuse_key(question))
        modes[question["mode"]] += 1
        types[question["type"]] += 1
    return picked


async def daily_set(
    pool: asyncpg.Pool,
    packs: Iterable[Pack],
    settings: Settings,
    pictures: Collection[str],
    now: datetime,
    rng: random.Random,
) -> DailySet:
    """The set for ``now``, drawn and stored if this is its day's first request."""
    day = day_of(now)
    questions = await _stored(pool, day)
    if questions is None:
        rows = await pool.fetch("select day, questions from daily_sets order by day")
        last_used = {reuse_key(q): row["day"] for row in rows for q in row["questions"]}
        drawn = draw(candidates(packs, settings, pictures), last_used, day, rng)
        if drawn is None:
            raise NoDailySet(f"the packs cannot fill the set for {day}")
        # Two first requests can race here; the loser's draw is dropped and both read the winner.
        await pool.execute(
            "insert into daily_sets (day, questions) values ($1, $2) on conflict (day) do nothing",
            day,
            drawn,
        )
        questions = await _stored(pool, day)
        assert questions is not None, "the row was just written, and nothing deletes one"
    return DailySet(day, number_of(day, settings.daily_first_day), questions)


async def _stored(pool: asyncpg.Pool, day: date) -> list[dict[str, Any]] | None:
    return await pool.fetchval("select questions from daily_sets where day = $1", day)
