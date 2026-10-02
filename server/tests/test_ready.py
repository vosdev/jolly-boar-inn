"""The ready check's threshold and the countdown it starts, shortens and stops. Pure.

The game half -- taps over the socket, disconnects, the splash actually ending -- is in
test_game.py beside the rest of the splash.
"""

import pytest

from app.rooms.ready import EVERYONE_READY_SECONDS, THRESHOLD_SECONDS, countdown, threshold

NOW = 1000.0  # the room manager's monotonic clock
TEN = NOW + THRESHOLD_SECONDS
THREE = NOW + EVERYONE_READY_SECONDS


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


def test_short_of_the_threshold_there_is_no_countdown() -> None:
    assert countdown(None, NOW, eligible=5, ready=3) is None


def test_the_threshold_starts_ten_seconds() -> None:
    assert countdown(None, NOW, eligible=5, ready=4) == TEN


def test_the_threshold_again_keeps_the_countdown_running() -> None:
    running = NOW + 4
    assert countdown(running, NOW, eligible=5, ready=4) == running


def test_everyone_ready_is_three_seconds_from_nothing_or_from_ten() -> None:
    assert countdown(None, NOW, eligible=5, ready=5) == THREE
    assert countdown(TEN, NOW, eligible=5, ready=5) == THREE


def test_everyone_ready_never_pushes_a_countdown_back() -> None:
    soon = NOW + 1
    assert countdown(soon, NOW, eligible=5, ready=5) == soon


def test_dropping_below_the_threshold_stops_it() -> None:
    assert countdown(TEN, NOW, eligible=5, ready=3) is None


def test_a_room_of_three_with_one_in_the_kitchen_still_counts() -> None:
    assert countdown(None, NOW, eligible=3, ready=2) == TEN


def test_a_room_of_one_waits_for_its_player() -> None:
    assert countdown(None, NOW, eligible=1, ready=0) is None
    assert countdown(None, NOW, eligible=1, ready=1) == THREE


def test_nobody_eligible_leaves_it_alone() -> None:
    assert countdown(None, NOW, eligible=0, ready=0) is None
    assert countdown(TEN, NOW, eligible=0, ready=0) == TEN
