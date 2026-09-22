"""``app/random_events.py``: the roster of NPCs who may interrupt a round, by id."""

import re

from app.modes import round_modes
from app.random_events import RANDOM_EVENTS


def test_the_roster_outnumbers_the_events_any_room_can_hold() -> None:
    """One event per round after the first, a different face for each: a room with every
    mode picked must still have a face for every slot, or a host's question goes unasked.
    """
    assert len(RANDOM_EVENTS) >= len(round_modes()) - 1
    assert len(RANDOM_EVENTS) >= 12  # the dozen T22 writes copy for; ids must match it


def test_ids_are_unique_and_plain() -> None:
    """They are stored in ``questions.random_event`` and looked up on the client."""
    assert len(set(RANDOM_EVENTS)) == len(RANDOM_EVENTS)
    assert all(re.fullmatch(r"[a-z][a-z0-9_]{0,31}", npc) for npc in RANDOM_EVENTS)
