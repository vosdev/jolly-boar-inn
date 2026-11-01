"""The daily set: what a day may hold, and that a day only ever holds one set."""

import asyncio
import random
from collections import Counter
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import asyncpg
import pytest

from app.config import Settings
from app.daily import (
    REST_DAYS,
    SET_SIZE,
    NoDailySet,
    candidates,
    daily_set,
    day_of,
    draw,
    number_of,
    reuse_key,
)
from app.db import create_pool
from app.questions import vocab
from app.questions.packs import EVENT_MODE, Pack, load_packs
from tests.packs import PACKS_DIR

DAY = date(2026, 12, 1)
MORNING = datetime(2026, 12, 1, 12, tzinfo=UTC)
TYPES = (
    "multiple_choice",
    "free_text",
    "ordering",
    "matching",
    "closest_number",
    "number_slider",
    "pick_all_that_apply",
    "pick_from_list",
)
ROUNDS = (
    "bestiary",
    "drop_table",
    "odd_one_out",
    "who_said_that",
    "sort_it_out",
    "minigame_madness",
    "know_your_content_creator",
    "guess_examine",
    "whos_that_npc",
    "more_less",
    "price_is_right",
)


def question(ident: str, mode: str = "bestiary", kind: str = "multiple_choice", **extra: Any):
    return {"id": ident, "mode": mode, "type": kind, "payload": {}, **extra}


def varied(count: int, prefix: str = "q") -> list[dict[str, Any]]:
    """``count`` questions spread over eleven modes and eight types."""
    return [question(f"{prefix}{n}", ROUNDS[n % 11], TYPES[n % 8]) for n in range(count)]


def price(ident: str, asset: str) -> dict[str, Any]:
    payload = {"subject": {"name": asset, "asset": asset}, "value": 5, "min": 1, "max": 9}
    return {"id": ident, "mode": "price_is_right", "type": "price_is_right", "payload": payload}


def more_less(ident: str, first: str, second: str, metric: str = "ge_price", direction="more"):
    options = [{"subject": {"name": a, "asset": a}, "value": 1} for a in (first, second)]
    payload = {"metric": metric, "direction": direction, "options": options}
    return {"id": ident, "mode": "more_less", "type": "more_less", "payload": payload}


def pack(*questions: dict[str, Any], name: str = "stub") -> Pack:
    return Pack(name, None, questions, Path(f"{name}.json"))


def ids(questions: list[dict[str, Any]]) -> set[str]:
    return {q["id"] for q in questions}


def picked(pool: list[dict[str, Any]], last_used=None, seed: int = 1) -> list[dict[str, Any]]:
    found = draw(pool, last_used or {}, DAY, random.Random(seed))
    assert found is not None
    return found


def assert_within_caps(questions: list[dict[str, Any]]) -> None:
    modes = Counter(q["mode"] for q in questions)
    types = Counter(q["type"] for q in questions)
    assert len(questions) == SET_SIZE
    assert max(modes.values()) <= 2
    assert types["multiple_choice"] <= 3
    assert max(n for kind, n in types.items() if kind != "multiple_choice") <= 2
    assert len(types) >= 5


@pytest.fixture(scope="module")
def shipped() -> list[Pack]:
    vocab.load_all()
    return load_packs(PACKS_DIR)


@pytest.fixture
def settings(test_db_dsn: str) -> Settings:
    return Settings(_env_file=None, database_url=test_db_dsn, daily_first_day=date(2026, 11, 20))


@pytest.fixture
async def pool(test_db_dsn: str) -> AsyncIterator[asyncpg.Pool]:
    pool = await create_pool(test_db_dsn)
    try:
        yield pool
    finally:
        await pool.close()


@pytest.mark.parametrize(
    ("now", "day"),
    [
        (datetime(2026, 12, 2, 7, 59, 59, tzinfo=UTC), date(2026, 12, 1)),
        (datetime(2026, 12, 2, 8, 0, 0, tzinfo=UTC), date(2026, 12, 2)),
        (datetime(2027, 1, 1, 0, 0, 0, tzinfo=UTC), date(2026, 12, 31)),
    ],
)
def test_a_day_opens_at_eight_utc(now: datetime, day: date) -> None:
    assert day_of(now) == day


def test_a_day_is_cut_in_utc_whatever_the_clock_reports() -> None:
    amsterdam = datetime(2026, 12, 2, 8, 30, tzinfo=ZoneInfo("Europe/Amsterdam"))
    assert day_of(amsterdam) == date(2026, 12, 1)


def test_the_number_counts_from_the_first_day() -> None:
    first = date(2026, 11, 20)
    assert number_of(first, first) == 1
    assert number_of(DAY, first) == 12


def test_the_first_day_comes_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DAILY_FIRST_DAY", "2026-11-20")
    assert Settings(_env_file=None).daily_first_day == date(2026, 11, 20)


@pytest.mark.parametrize("seed", range(30))
def test_a_set_from_the_shipped_packs_keeps_every_cap(shipped: list[Pack], seed: int) -> None:
    pictures = {q["payload"].get("image") for p in shipped for q in p.questions}
    pool = candidates(shipped, Settings(_env_file=None), pictures)
    assert_within_caps(picked(pool, seed=seed))


@pytest.mark.parametrize("seed", range(30))
def test_all_npcs_together_count_as_one_mode(seed: int) -> None:
    npcs = [
        question(f"npc{n}", EVENT_MODE, TYPES[n % 8], random_event=f"npc_{n % 5}")
        for n in range(40)
    ]
    assert Counter(q["mode"] for q in picked(npcs + varied(40), seed=seed))[EVENT_MODE] <= 2


def test_the_draw_goes_by_mode_not_by_pool_size() -> None:
    large = [question(f"big{n}", "large", TYPES[n % 8]) for n in range(5000)]
    drawn = Counter(q["mode"] for seed in range(200) for q in picked(large + varied(44), seed=seed))
    # One mode in twelve: by question it would hold both its places in every set, 400 in all.
    assert drawn["large"] < 300


@pytest.mark.parametrize("enabled", [False, True])
def test_only_offered_rounds_and_the_npcs_are_candidates(enabled: bool) -> None:
    packs = [
        pack(
            question("round"),
            question("npc", EVENT_MODE, random_event="bob"),
            question("all_npcs", "random_events_only"),
            question("custom", "custom"),
            question("no_such_mode", "gone"),
            {**question("shown", "pixel_hunt", "pick_from_list"), "payload": {"image": "item:1"}},
            {**question("unseen", "pixel_hunt", "pick_from_list"), "payload": {"image": "item:2"}},
        )
    ]
    settings = Settings(_env_file=None, random_event_game_mode=enabled)
    assert ids(candidates(packs, settings, {"item:1"})) == {"round", "npc", "shown"}


def test_the_sample_pack_is_never_a_candidate() -> None:
    packs = [pack(question("kept")), pack(more_less("stale", "a", "b"), name="sample")]
    assert ids(candidates(packs, Settings(_env_file=None), ())) == {"kept"}


def test_a_set_comes_in_a_random_order() -> None:
    orders = {tuple(q["id"] for q in picked(varied(10), seed=seed)) for seed in range(5)}
    assert len(orders) > 1


def test_a_question_rests_exactly_sixty_days() -> None:
    rested = varied(40, "rested")
    resting = varied(40, "resting")
    last_used = {q["id"]: DAY - timedelta(days=REST_DAYS) for q in rested}
    last_used |= {q["id"]: DAY - timedelta(days=REST_DAYS - 1) for q in resting}
    assert ids(picked(rested + resting, last_used)) <= ids(rested)


def test_no_question_returns_inside_sixty_days_over_months() -> None:
    pool = varied(800)
    last_used: dict[str, date] = {}
    rng = random.Random(3)
    for offset in range(150):
        day = DAY + timedelta(days=offset)
        found = draw(pool, last_used, day, rng)
        assert found is not None
        assert_within_caps(found)
        for q in found:
            used = last_used.get(q["id"])
            assert used is None or (day - used).days >= REST_DAYS
            last_used[q["id"]] = day


def test_a_short_pool_brings_back_the_oldest_used() -> None:
    pool = varied(40)
    rested, used = pool[:7], pool[7:]
    last_used = {q["id"]: DAY - timedelta(days=n + 1) for n, q in enumerate(used)}
    drawn = picked(pool, last_used)
    assert_within_caps(drawn)
    assert ids(drawn) == ids(rested) | ids(used[-3:])


def test_a_pool_used_up_yesterday_still_gives_a_set() -> None:
    pool = varied(40)
    assert_within_caps(picked(pool, {q["id"]: DAY - timedelta(days=1) for q in pool}))


def test_a_pool_the_caps_cannot_fill_gives_no_set() -> None:
    assert draw([question(str(n)) for n in range(50)], {}, DAY, random.Random(1)) is None


def test_a_regenerated_price_question_is_still_the_same_question() -> None:
    assert reuse_key(price("old", "item:1")) == reuse_key(price("new", "item:1"))
    assert reuse_key(price("old", "item:1")) != reuse_key(price("old", "item:2"))
    pair = reuse_key(more_less("old", "item:1", "item:2"))
    assert pair == reuse_key(more_less("new", "item:2", "item:1", direction="less"))
    assert pair != reuse_key(more_less("old", "item:1", "item:2", metric="high_alch"))


@pytest.mark.parametrize("seed", range(20))
def test_a_regenerated_price_question_rests_too(seed: int) -> None:
    fresh = [price("regenerated", "item:1")]
    last_used = {reuse_key(price("old", "item:1")): DAY - timedelta(days=1)}
    assert "regenerated" not in ids(picked(varied(40) + fresh, last_used, seed))


@pytest.mark.parametrize("seed", range(20))
def test_one_set_never_asks_about_the_same_item_twice(seed: int) -> None:
    twins = [price("first", "item:1"), price("second", "item:1")]
    assert not {"first", "second"} <= ids(picked(varied(10) + twins, seed=seed))


async def test_two_requests_on_one_day_get_one_set_in_one_order(
    pool: asyncpg.Pool, settings: Settings
) -> None:
    packs = [pack(*varied(200))]
    first = await daily_set(pool, packs, settings, (), MORNING, random.Random(1))
    later = MORNING + timedelta(hours=8)
    second = await daily_set(pool, packs, settings, (), later, random.Random(2))
    assert second == first
    assert (first.day, first.number) == (DAY, 12)
    assert_within_caps(first.questions)


async def test_two_first_requests_at_once_get_one_set(
    pool: asyncpg.Pool, settings: Settings
) -> None:
    packs = [pack(*varied(200))]
    sets = await asyncio.gather(
        *(daily_set(pool, packs, settings, (), MORNING, random.Random(n)) for n in range(5))
    )
    assert all(found == sets[0] for found in sets)
    assert await pool.fetchval("select count(*) from daily_sets") == 1


async def test_the_set_rolls_over_at_eight_utc(pool: asyncpg.Pool, settings: Settings) -> None:
    packs = [pack(*varied(200))]
    night = datetime(2026, 12, 2, 7, 59, 59, tzinfo=UTC)
    before = await daily_set(pool, packs, settings, (), night, random.Random(1))
    after = await daily_set(
        pool, packs, settings, (), night + timedelta(seconds=1), random.Random(1)
    )
    assert before.day == DAY
    assert after.day == DAY + timedelta(days=1)
    assert after.number == before.number + 1
    assert not ids(before.questions) & ids(after.questions)


async def test_the_set_survives_a_restart_and_a_pack_edit(
    test_db_dsn: str, settings: Settings
) -> None:
    pool = await create_pool(test_db_dsn)
    try:
        before = await daily_set(
            pool, [pack(*varied(200))], settings, (), MORNING, random.Random(1)
        )
    finally:
        await pool.close()
    pool = await create_pool(test_db_dsn)
    try:
        after = await daily_set(
            pool, [pack(*varied(200, "edited"))], settings, (), MORNING, random.Random(2)
        )
    finally:
        await pool.close()
    assert after == before


async def test_a_stored_day_counts_as_used(pool: asyncpg.Pool, settings: Settings) -> None:
    used = varied(40, "used")
    await pool.execute(
        "insert into daily_sets (day, questions) values ($1, $2)", DAY - timedelta(days=1), used
    )
    packs = [pack(*used, *varied(40, "new"))]
    found = await daily_set(pool, packs, settings, (), MORNING, random.Random(1))
    assert not ids(found.questions) & ids(used)


async def test_a_pool_the_caps_cannot_fill_stores_nothing(
    pool: asyncpg.Pool, settings: Settings
) -> None:
    with pytest.raises(NoDailySet):
        await daily_set(pool, [], settings, (), MORNING, random.Random(1))
    assert await pool.fetchval("select count(*) from daily_sets") == 0
