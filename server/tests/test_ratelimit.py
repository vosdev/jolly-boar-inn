from datetime import UTC, datetime, timedelta

import pytest

from app.http.ratelimit import RateLimited, RateLimiter, room_lookup
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
