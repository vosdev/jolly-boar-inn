"""The splash's ready check (D7, section 7.1 of ideas/design.md). Pure and testable.

A splash has no clock of its own. It waits for the room, and the room says when:

- **The threshold reached** starts a countdown of ``THRESHOLD_SECONDS``, so one person at
  the bar does not hold up the other seven, and has that long to look up before the round
  goes without them.
- **Everyone ready** brings it down to ``EVERYONE_READY_SECONDS``, enough to register that
  the round is about to start.
- **Dropping back below the threshold** by somebody taking their tap back stops the
  countdown again. Only an un-ready does that: a phone locking or waking changes who is
  eligible, and a countdown that stopped and started with every one of those would never
  finish in a room of people with phones in their pockets.

The host's skip overrides all of it. Eligible is the connected players who can answer the
round's first question: a disconnected player never holds up a round, so somebody leaving
lowers the threshold rather than stalling it.
"""

import math

EVERYONE_READY_SECONDS = 3
THRESHOLD_SECONDS = 10


def threshold(eligible: int) -> int:
    """How many of ``eligible`` players must be ready before the countdown starts.

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


def countdown(running: float | None, now: float, eligible: int, ready: int) -> float | None:
    """When the splash should end, given ``ready`` of ``eligible`` players tapped ready.

    Times are on the room manager's monotonic clock, so a wall clock that jumps mid-splash
    neither ends the countdown early nor holds it up. ``running`` is the countdown as it
    stands, ``None`` for none running. A running countdown is never pushed later: reaching
    the threshold again keeps it, and everyone being ready only ever brings it closer.
    ``None`` back means the room is short of the threshold, which the caller only acts on
    for an un-ready (see the module docstring).

    Nobody eligible leaves it as it is: there is nobody to wait on, and nobody who can
    have said they are ready either, so the host's skip decides.
    """
    if eligible < 1:
        return running
    if ready >= eligible:
        soon = now + EVERYONE_READY_SECONDS
        return soon if running is None else min(running, soon)
    if ready >= threshold(eligible):
        return running if running is not None else now + THRESHOLD_SECONDS
    return None
