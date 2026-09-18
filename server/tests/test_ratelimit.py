from datetime import UTC, datetime, timedelta

from app.http.ratelimit import RateLimiter


def test_limit_per_key_within_window() -> None:
    limiter = RateLimiter(limit=2)
    t0 = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
    assert limiter.allow("a", t0)
    assert limiter.allow("a", t0)
    assert not limiter.allow("a", t0)
    assert limiter.allow("b", t0)  # other keys are independent
    assert limiter.allow("a", t0 + timedelta(hours=1, seconds=1))  # window slid


def test_forgets_idle_keys() -> None:
    limiter = RateLimiter(limit=1)
    t0 = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
    limiter.allow("a", t0)
    limiter.allow("b", t0 + timedelta(hours=2))
    assert "a" not in limiter._hits
