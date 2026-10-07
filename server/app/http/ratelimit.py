"""In-memory per-address limiters: at most ``limit`` hits per window.

Six of them: room creation, joins, join failures reported, suggestions, reports, and lookups of
rooms that turn out not to exist.
The last is what keeps the room list private. The live codes are a few of a few hundred
words, and every request that names a room answers whether it exists, so an address
that keeps asking for rooms that are not there is scanning and is refused for a while.
"""

import ipaddress
from collections import deque
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

from app.errors import ApiError
from app.rooms.state import RoomExpired, RoomNotFound

# A mistyped code or two, or a phone retrying an old link, stays far below this.
LOOKUP_MISSES = 30
LOOKUP_WINDOW = timedelta(minutes=10)
# High enough for a pub on one address, with every player's name clash retried; low
# enough that a kicked player's script cannot keep coming back all evening.
JOINS_PER_HOUR = 100
# A player who keeps missing reports a few; a script inflating the counter stops quickly.
JOIN_FAILURES_PER_HOUR = 30
# Plenty for a player with a notebook of ideas; a script filling the queue stops quickly.
SUGGESTIONS_PER_HOUR = 10
# A player reports what they just met in a game, a question or two; not a review of the packs.
REPORTS_PER_HOUR = 3


class RateLimited(ApiError):
    status, code = 429, "rate_limited"


class RateLimiter:
    def __init__(self, limit: int, window: timedelta = timedelta(hours=1)) -> None:
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[datetime]] = {}

    def allow(self, key: str, now: datetime | None = None) -> bool:
        """Record a hit for ``key`` and return whether it is within the limit."""
        now = now or datetime.now(UTC)
        cutoff = now - self.window
        if key not in self._hits:
            self._sweep(cutoff)  # a new address is the moment to forget idle ones
        hits = self._hits.setdefault(key, deque())
        _expire(hits, cutoff)
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True

    def left(self, key: str, now: datetime | None = None) -> tuple[int, datetime | None]:
        """How many hits ``key`` has left, and when the next frees up if none. Records nothing."""
        now = now or datetime.now(UTC)
        hits = self._hits.get(key, deque())
        _expire(hits, now - self.window)
        left = max(0, self.limit - len(hits))
        return left, (hits[0] + self.window if left == 0 and hits else None)

    def refund(self, key: str, at: datetime) -> None:
        """Take back the hit ``allow`` recorded for ``key`` at ``at``."""
        hits = self._hits.get(key)
        if hits is None:
            return
        try:
            hits.remove(at)
        except ValueError:
            return
        if not hits:
            del self._hits[key]

    def _sweep(self, cutoff: datetime) -> None:
        for key in list(self._hits):
            _expire(self._hits[key], cutoff)
            if not self._hits[key]:
                del self._hits[key]


def client_key(host: str) -> str:
    """The limiter's key for an address: IPv4 as it is, IPv6 by its /64."""
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return host
    if isinstance(address, ipaddress.IPv6Address):
        if address.ipv4_mapped is not None:
            return str(address.ipv4_mapped)
        # A household is given a whole /64, so one address alone would limit nobody.
        return str(ipaddress.IPv6Network((address, 64), strict=False))
    return str(address)


@contextmanager
def room_lookup(misses: RateLimiter, host: str) -> Iterator[None]:
    """Refuse a request naming a room once ``host`` has missed too often; count a miss.

    Every lookup is charged up front and refunded unless it misses, so a burst of
    concurrent guesses cannot all pass the check before the first of them is counted.
    Over the limit, a lookup is refused whether or not its room exists: refusing only
    the misses would answer the question the limit is there to stop answering.
    """
    key, now = client_key(host), datetime.now(UTC)
    if not misses.allow(key, now):
        raise RateLimited("too many rooms not found from this address, try again later")
    missed = False
    try:
        yield
    except RoomNotFound, RoomExpired:
        missed = True
        raise
    finally:
        if not missed:
            misses.refund(key, now)


def _expire(hits: deque[datetime], cutoff: datetime) -> None:
    while hits and hits[0] <= cutoff:
        hits.popleft()
