"""In-memory per-IP limiter for room creation: at most ``limit`` hits per window."""

import ipaddress
from collections import deque
from datetime import UTC, datetime, timedelta


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


def _expire(hits: deque[datetime], cutoff: datetime) -> None:
    while hits and hits[0] <= cutoff:
        hits.popleft()
