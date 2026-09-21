"""The splash's ready check (D7, section 7.1 of ideas/design.md). Pure and testable.

A splash runs for ``splash_seconds`` unless the room says it is ready sooner. Two things
cut it short, and neither can ever lengthen it:

- **Everyone ready** leaves ``EVERYONE_READY_SECONDS``, enough to register that the round
  is about to start.
- **The threshold reached** leaves ``THRESHOLD_SECONDS``, so one person at the bar does not
  hold up the other seven, and has ten seconds to look up before it goes without them.

Eligible is the connected players who can answer the round's first question. A
disconnected player never holds up a round -- a locked phone is the common case -- so
somebody leaving lowers the threshold rather than stalling it.

``hurried`` only ever returns the time it was given or an earlier one. The server stays the
single source of timing through ``next_at``, and ``splash_seconds`` stays the host's hard
ceiling, exactly as section 4 of ideas/architecture.md has it.
"""

import math
from datetime import datetime, timedelta

EVERYONE_READY_SECONDS = 3
THRESHOLD_SECONDS = 10


def threshold(eligible: int) -> int:
    """How many of ``eligible`` players must be ready before the splash hurries.

    ``min(ceil(0.8 × eligible), eligible - 1)``: a cap, not a floor, so two of three is
    enough in a room of three rather than one person in the kitchen stalling it. Above four
    the cap never binds and it is plain 80%.

    A room of one is the exception. The cap would make its threshold zero and start the
    round before its only player had looked at it, so it is 1: that player taps ready like
    everyone else does.
    """
    if eligible < 1:
        raise ValueError("a threshold needs at least one eligible player")
    if eligible == 1:
        return 1
    return min(math.ceil(0.8 * eligible), eligible - 1)


def hurried(next_at: datetime, now: datetime, eligible: int, ready: int) -> datetime:
    """When the splash should end, given ``ready`` of ``eligible`` players tapped ready.

    ``next_at`` is when it ends as things stand; the answer is never later. Nobody eligible
    leaves it alone: there is nobody to be waiting on, and nobody to have said they are
    ready either, so the host's ceiling (or the host's skip) decides.
    """
    if eligible < 1:
        return next_at
    if ready >= eligible:
        return min(next_at, now + timedelta(seconds=EVERYONE_READY_SECONDS))
    if ready >= threshold(eligible):
        return min(next_at, now + timedelta(seconds=THRESHOLD_SECONDS))
    return next_at
