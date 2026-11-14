"""In-memory per-address limiters: at most ``limit`` hits per window.

Room creation, free codes for the create page, joins, join failures reported,
suggestions, checks for similar questions, suggestion tries, reports, websocket connects,
and lookups of rooms that turn out not to exist. The last is what keeps the room list
private. The live codes are a few of a few hundred words, and every request that names a
room answers whether it exists, so an address that keeps asking for rooms that are not
there is scanning and is refused for a while.
"""

import ipaddress
import math
from collections import deque
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

from app import metrics
from app.errors import ApiError
from app.metrics import LimiterName
from app.rooms.errors import RoomExpired, RoomNotFound

# A host rerolling the code for one they like; a script listing taken codes slowly.
FREE_CODES = 5
FREE_CODES_WINDOW = timedelta(seconds=10)
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
# A check per pause in typing, debounced: a long evening of writing, not a crawl of the packs.
SIMILAR_PER_HOUR = 120
# Each pause in writing fetches the view again and each answer tried is one more.
TRIES_PER_HOUR = 600
# A player reports what they just met in a game, a question or two; not a review of the packs.
REPORTS_PER_HOUR = 3
# Daily starts per address, refreshes and resumes aside: a household on one address plays a
# few each, and a private window is a new start.
DAILIES_PER_HOUR = 10
# Each connect welcomes the socket under the room lock and can tell everyone else; a phone
# waking from sleep a few times a minute stays far below these, a reconnect loop does not.
CONNECTS_PER_SESSION = 10
CONNECTS_PER_ADDRESS = 30
CONNECTS_WINDOW = timedelta(minutes=1)
# Sockets open at once that have not said hello yet. An honest client says it the moment the
# socket opens, so a pub reconnecting together holds a few for milliseconds each.
PENDING_HELLOS_PER_ADDRESS = 10


class RateLimited(ApiError):
    status, code = 429, "rate_limited"

    def __init__(self, message: str, retry_after: timedelta | None = None) -> None:
        super().__init__(message)
        # Whole seconds, rounded up, so a client that waits them out is never refused again.
        if retry_after is not None:
            self.headers = {"Retry-After": str(max(1, math.ceil(retry_after.total_seconds())))}


class RateLimiter:
    def __init__(
        self,
        limit: int,
        window: timedelta = timedelta(hours=1),
        name: LimiterName = "rooms",
    ) -> None:
        self.limit = limit
        self.window = window
        self.name: LimiterName = name
        self._hits: dict[str, deque[datetime]] = {}
        self._swept: datetime | None = None

    def allow(self, key: str, now: datetime | None = None) -> bool:
        """Record a hit for ``key`` and return whether it is within the limit."""
        now = now or datetime.now(UTC)
        cutoff = now - self.window
        # A new key is the moment to forget idle ones, but at most once a window: a stream of
        # new keys would otherwise walk the whole table each, quadratic in the stream's rate.
        if key not in self._hits and (self._swept is None or self._swept <= cutoff):
            self._sweep(cutoff)
            self._swept = now
        hits = self._hits.setdefault(key, deque())
        _expire(hits, cutoff)
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True

    def check(self, key: str, message: str, now: datetime | None = None) -> None:
        """Record a hit for ``key``, or raise ``RateLimited`` saying when the next frees up."""
        now = now or datetime.now(UTC)
        if self.allow(key, now):
            return
        metrics.RATE_LIMITED.labels(limiter=self.name).inc()
        _, free_at = self.left(key, now)
        raise RateLimited(message, None if free_at is None else free_at - now)

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


class OpenCount:
    """How many of something each key holds open right now, refused past ``limit``."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self._open: dict[str, int] = {}

    def enter(self, key: str) -> bool:
        """Count one more open for ``key``; ``False``, counting nothing, if it holds ``limit``."""
        held = self._open.get(key, 0)
        if held >= self.limit:
            return False
        self._open[key] = held + 1
        return True

    def leave(self, key: str) -> None:
        """Count one fewer open for ``key``."""
        held = self._open.get(key, 0) - 1
        if held > 0:
            self._open[key] = held
        else:
            self._open.pop(key, None)


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
    misses.check(key, "too many rooms not found from this address, try again later", now)
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
