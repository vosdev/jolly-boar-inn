from datetime import UTC, datetime, timedelta

import pytest

from app.http.ratelimit import OldestOut, OpenCount, RateLimited, RateLimiter, room_lookup
from app.rooms.errors import RoomNotFound


def test_limit_per_key_within_window() -> None:
    limiter = RateLimiter(limit=2)
    t0 = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
    assert limiter.allow("a", t0)
    assert limiter.allow("a", t0)
    assert not limiter.allow("a", t0)
    assert limiter.allow("b", t0)  # other keys are independent
    assert limiter.allow("a", t0 + timedelta(hours=1, seconds=1))  # window slid


def test_a_refusal_says_when_the_oldest_hit_frees_up() -> None:
    limiter = RateLimiter(limit=2, window=timedelta(seconds=10))
    t0 = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
    limiter.check("a", "slow down", t0)
    limiter.check("a", "slow down", t0 + timedelta(seconds=3))
    with pytest.raises(RateLimited) as refused:
        limiter.check("a", "slow down", t0 + timedelta(seconds=5, milliseconds=500))
    assert refused.value.headers == {"Retry-After": "5"}
    assert refused.value.message == "slow down"
    limiter.check("a", "slow down", t0 + timedelta(seconds=10))


def test_forgets_idle_keys() -> None:
    limiter = RateLimiter(limit=1)
    t0 = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
    limiter.allow("a", t0)
    limiter.allow("b", t0 + timedelta(hours=2))
    assert "a" not in limiter._hits


def test_a_refund_takes_back_one_hit() -> None:
    limiter = RateLimiter(limit=1)
    t0 = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
    assert limiter.allow("a", t0)
    limiter.refund("a", t0)
    assert limiter.allow("a", t0)
    limiter.refund("b", t0)  # nothing recorded: nothing to take back


def test_a_lookup_in_flight_holds_its_charge() -> None:
    """Concurrent guesses cannot all pass the check before the first is counted."""
    misses = RateLimiter(limit=1)
    with room_lookup(misses, "192.0.2.1"):
        with pytest.raises(RateLimited), room_lookup(misses, "192.0.2.1"):
            pass
    with room_lookup(misses, "192.0.2.1"):  # the first found its room, so it was refunded
        pass


def test_a_miss_keeps_its_charge() -> None:
    misses = RateLimiter(limit=1)
    with pytest.raises(RoomNotFound), room_lookup(misses, "192.0.2.1"):
        raise RoomNotFound("no room has that code")
    with pytest.raises(RateLimited), room_lookup(misses, "192.0.2.1"):
        pass


def test_a_stream_of_new_keys_sweeps_at_most_once_a_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Each sweep walks every key, so one per new key costs the loop quadratic time."""
    limiter = RateLimiter(limit=1, window=timedelta(minutes=1))
    t0 = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
    for n in range(10_000):
        limiter.allow(f"live-{n}", t0)
    sweeps = []
    real = limiter._sweep
    monkeypatch.setattr(limiter, "_sweep", lambda cutoff: (sweeps.append(cutoff), real(cutoff)))
    for n in range(100):
        limiter.allow(f"new-{n}", t0 + timedelta(seconds=30))
    assert len(sweeps) <= 1
    limiter.allow("later", t0 + timedelta(minutes=2))
    assert "live-0" not in limiter._hits


def test_an_open_count_refuses_past_its_limit_until_one_leaves() -> None:
    held = OpenCount(limit=2)
    assert held.enter("a")
    assert held.enter("a")
    assert not held.enter("a")
    assert held.enter("b")
    held.leave("a")
    assert held.enter("a")


def test_past_its_limit_the_oldest_open_is_told_to_go() -> None:
    held = OldestOut(limit=2)
    first, second = held.enter("a"), held.enter("a")
    other = held.enter("b")
    third = held.enter("a")
    assert first.is_set()
    assert not any(e.is_set() for e in (second, third, other))
    assert held.held("a") == 2
    held.leave("a", first)
    assert held.held("a") == 2
    held.leave("a", second)
    held.leave("a", third)
    assert held.held("a") == 0
