"""D7: the ready check's threshold and the time it hurries a splash to. Pure.

The game half -- taps over the socket, disconnects, the splash actually ending -- is in
test_game.py beside the rest of the splash.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.rooms.ready import EVERYONE_READY_SECONDS, THRESHOLD_SECONDS, hurried, threshold

NOW = datetime(2026, 9, 21, 20, 0, tzinfo=UTC)
LATE = NOW + timedelta(seconds=30)


@pytest.mark.parametrize(
    ("eligible", "expected"),
    [
        (1, 1),  # a room of one is exempt: it waits for its only player
        (2, 1),  # the cap: one of two is enough
        (3, 2),  # 80% rounds up to three, and the cap brings it back to two
        (4, 3),
        (5, 4),  # above four the cap never binds
        (7, 6),
        (10, 8),
        (50, 40),
    ],
)
def test_the_threshold_is_eighty_percent_capped_at_one_short(eligible, expected) -> None:
    assert threshold(eligible) == expected


def test_a_threshold_needs_somebody_to_count() -> None:
    with pytest.raises(ValueError):
        threshold(0)


def test_everyone_ready_leaves_three_seconds() -> None:
    assert hurried(LATE, NOW, eligible=5, ready=5) == NOW + timedelta(
        seconds=EVERYONE_READY_SECONDS
    )


def test_the_threshold_leaves_ten_seconds() -> None:
    assert hurried(LATE, NOW, eligible=5, ready=4) == NOW + timedelta(seconds=THRESHOLD_SECONDS)


def test_short_of_the_threshold_changes_nothing() -> None:
    assert hurried(LATE, NOW, eligible=5, ready=3) == LATE


def test_a_room_of_three_with_one_in_the_kitchen_still_hurries() -> None:
    assert hurried(LATE, NOW, eligible=3, ready=2) == NOW + timedelta(seconds=THRESHOLD_SECONDS)


def test_a_room_of_one_waits_for_its_player() -> None:
    assert hurried(LATE, NOW, eligible=1, ready=0) == LATE
    assert hurried(LATE, NOW, eligible=1, ready=1) == NOW + timedelta(
        seconds=EVERYONE_READY_SECONDS
    )


def test_nobody_eligible_changes_nothing() -> None:
    assert hurried(LATE, NOW, eligible=0, ready=0) == LATE


@pytest.mark.parametrize("ready", [0, 4, 5])
def test_the_ready_check_never_lengthens_a_splash(ready) -> None:
    """``min(10s, remaining)``: a splash with two seconds left keeps its two seconds."""
    soon = NOW + timedelta(seconds=2)
    assert hurried(soon, NOW, eligible=5, ready=ready) == soon
