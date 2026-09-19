"""T10 Accept: table-driven tests for every bucket edge (exactly 0.10 is bucket 1,
0.1001 is bucket 2, anything past 1.0 clamps to bucket 5), the points each bucket is
worth, and the standings tie-break order. Section 6 of ideas/architecture.md is the table
all of this encodes; the sums those standings are built from are test_game.py's job.

The bucket edges are inclusive and are fractions of the room's ``question_seconds``, so
the same answer speed buckets the same way whatever the question length.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.rooms.scoring import BUCKETS, SLOWEST, bucket, points_for
from app.rooms.settings import RoomSettings
from app.rooms.state import Player, Room, Totals

# The section 6 table, verbatim. If this changes, the game changed.
SECTION_6 = ((0.10, 1000), (0.25, 900), (0.50, 800), (0.75, 700), (1.00, 600))


def test_buckets_are_the_documented_table() -> None:
    assert BUCKETS == SECTION_6
    assert SLOWEST == 5


# --- the edges ----------------------------------------------------------------------

# (fraction of the question's time, bucket). A one-second question makes the fraction
# and the elapsed seconds the same number, so these are the edges themselves.
EDGES = [
    (0.0, 1),
    (0.05, 1),
    (0.0999, 1),
    (0.10, 1),  # exactly a tenth is still the fastest bucket
    (0.1001, 2),  # a hair past it is not
    (0.20, 2),
    (0.25, 2),
    (0.2501, 3),
    (0.50, 3),
    (0.5001, 4),
    (0.75, 4),
    (0.7501, 5),
    (1.00, 5),
    (1.0001, 5),  # past the full time, and therefore clamped
    (2.0, 5),
    (99.0, 5),
]


@pytest.mark.parametrize(("fraction", "expected"), EDGES)
def test_bucket_edges(fraction: float, expected: int) -> None:
    assert bucket(fraction, 1) == expected


@pytest.mark.parametrize(("fraction", "expected"), EDGES)
@pytest.mark.parametrize("question_s", [1, 10, 30, 60, 120])
def test_edges_are_fractions_of_the_question_time(
    question_s: int, fraction: float, expected: int
) -> None:
    """The same fraction buckets the same way at every question length."""
    assert bucket(fraction * question_s, question_s) == expected


# The worked example from section 6: a 30-second question buckets at 0-3, 3-7.5,
# 7.5-15, 15-22.5, 22.5-30 seconds.
@pytest.mark.parametrize(
    ("elapsed_s", "expected"),
    [
        (0.0, 1),
        (2.999, 1),
        (3.0, 1),
        (3.001, 2),
        (7.5, 2),
        (7.501, 3),
        (15.0, 3),
        (15.001, 4),
        (22.5, 4),
        (22.501, 5),
        (30.0, 5),
        (30.001, 5),
        (600.0, 5),
    ],
)
def test_thirty_second_question_in_seconds(elapsed_s: float, expected: int) -> None:
    assert bucket(elapsed_s, 30) == expected


def test_an_answer_from_before_the_question_opened_is_the_fastest_bucket() -> None:
    """Clock skew between the receive time and ``shown_at`` must not produce a 0 or a 6."""
    assert bucket(-1.0, 30) == 1


@pytest.mark.parametrize("elapsed_s", [-5.0, 0.0, 0.1, 3.0, 29.0, 30.0, 1e6])
def test_bucket_is_always_a_valid_bucket(elapsed_s: float) -> None:
    assert 1 <= bucket(elapsed_s, 30) <= SLOWEST


# --- points -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("bucket_number", "points"), [(1, 1000), (2, 900), (3, 800), (4, 700), (5, 600)]
)
def test_points_for_a_correct_answer(bucket_number: int, points: int) -> None:
    assert points_for(True, bucket_number) == points


@pytest.mark.parametrize("bucket_number", [1, 2, 3, 4, 5])
def test_a_wrong_answer_is_worth_nothing_however_fast(bucket_number: int) -> None:
    assert points_for(False, bucket_number) == 0


def test_faster_is_never_worth_less() -> None:
    awarded = [points_for(True, b) for b in range(1, SLOWEST + 1)]
    assert awarded == sorted(awarded, reverse=True)


# --- standings ----------------------------------------------------------------------


def room_with(*scores: tuple[str, int, int]) -> Room:
    """A room whose players have the given ``(name, points, correct answers)``.

    Players join a second apart in the order given, so join time is a real tie-break and
    not an accident of the clock.
    """
    now = datetime(2026, 9, 19, 20, 0, tzinfo=UTC)
    room = Room(
        id=uuid4(),
        code="CABBAGE",
        status="finished",
        settings=RoomSettings(),
        current_index=None,
        total=len(scores),
        created_at=now,
        expires_at=now + timedelta(days=30),
        lock=asyncio.Lock(),
    )
    for seconds, (name, points, correct) in enumerate(scores):
        player_id = uuid4()
        room.players[player_id] = Player(
            id=player_id,
            display_name=name,
            role="player",
            joined_at=now + timedelta(seconds=seconds),
            session_hash="unused",
        )
        if (points, correct) != (0, 0):
            room.totals[player_id] = Totals(points=points, correct=correct)
    return room


def placings(room: Room) -> list[tuple[str, int, int]]:
    return [(s.display_name, s.points, s.rank) for s in room.standings()]


def test_standings_are_sorted_by_points() -> None:
    room = room_with(("Ana", 900, 1), ("Bo", 2700, 3), ("Cy", 1800, 2))
    assert placings(room) == [("Bo", 2700, 1), ("Cy", 1800, 2), ("Ana", 900, 3)]


def test_equal_points_are_broken_by_correct_answers() -> None:
    """1800 from three 600s beats 1800 from two 900s: more right answers, better rank."""
    room = room_with(("Ana", 1800, 2), ("Bo", 1800, 3))
    assert placings(room) == [("Bo", 1800, 1), ("Ana", 1800, 2)]


def test_an_exact_tie_is_broken_by_join_time_and_shares_the_rank() -> None:
    """Section 6: earliest to join is listed first, and ``rank`` is dense."""
    room = room_with(("Early", 600, 1), ("Late", 600, 1), ("Last", 0, 0))
    assert placings(room) == [("Early", 600, 1), ("Late", 600, 1), ("Last", 0, 2)]


def test_rank_is_dense() -> None:
    room = room_with(("Ana", 1000, 1), ("Bo", 500, 1), ("Cy", 500, 1), ("Di", 500, 2), ("Ed", 0, 0))
    assert placings(room) == [
        ("Ana", 1000, 1),
        ("Di", 500, 2),  # same points as Bo and Cy, one more correct answer
        ("Bo", 500, 3),
        ("Cy", 500, 3),
        ("Ed", 0, 4),
    ]


def test_before_anyone_has_scored_everyone_is_first_in_join_order() -> None:
    room = room_with(("Ana", 0, 0), ("Bo", 0, 0), ("Cy", 0, 0))
    assert placings(room) == [("Ana", 0, 1), ("Bo", 0, 1), ("Cy", 0, 1)]


def test_an_empty_room_has_no_standings() -> None:
    assert room_with().standings() == []
