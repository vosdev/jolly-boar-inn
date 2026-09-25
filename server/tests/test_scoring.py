"""T10 Accept: table-driven tests for every bucket edge (exactly 0.10 is bucket 1,
0.1001 is bucket 2, anything past 1.0 clamps to bucket 5), the points each bucket is
worth, and the standings tie-break order. Section 6 of ideas/architecture.md is the table
all of this encodes; the sums those standings are built from are test_game.py's job.

T17 Accept: a table per scoring. ``SPEED`` pays a bucket's points times the credit, so
0.6 in bucket 2 is 540; ``STEP`` pays 1000 down to 400 across the steps, 1000 for a
one-step question, and clamps a step past the last; ``RANK`` pays a share of 1000 for the
rung the credit reached and never looks at the clock. The bucket edges above them are
T10's, untouched.

The bucket edges are inclusive and are fractions of the room's ``question_seconds``, so
the same answer speed buckets the same way whatever the question length.
"""

import asyncio
import math
from datetime import UTC, datetime, timedelta
from types import ModuleType
from typing import cast
from uuid import uuid4

import pytest

from app.questions.types import TYPES, scoring_of
from app.questions.types.scoring import Scoring
from app.rooms.scoring import (
    BUCKETS,
    SLOWEST,
    band,
    bucket,
    effective,
    points_for,
    step,
    step_points,
)
from app.rooms.settings import RoomSettings
from app.rooms.state import Player, Room, Totals, settle_credit

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


# --- which scoring ------------------------------------------------------------------


def test_the_scorings_are_the_wire_strings() -> None:
    """``answer_ack.scoring`` is the member itself, so its value is the protocol."""
    assert [s.value for s in Scoring] == ["speed", "rank", "step"]


def test_a_type_that_says_nothing_is_scored_on_speed() -> None:
    assert not hasattr(TYPES["more_less"], "SCORING")
    assert scoring_of("more_less") is Scoring.SPEED


def test_a_type_that_says_something_is_scored_its_way(monkeypatch) -> None:
    stub = ModuleType("closest_number")
    stub.SCORING = Scoring.RANK  # type: ignore[attr-defined]
    monkeypatch.setitem(TYPES, "closest_number", stub)
    assert scoring_of("closest_number") is Scoring.RANK


@pytest.mark.parametrize(
    ("declared", "steps", "scored"),
    [
        (Scoring.SPEED, None, Scoring.SPEED),
        (Scoring.SPEED, 8, Scoring.SPEED),  # steps turn nothing into STEP
        (Scoring.RANK, None, Scoring.RANK),
        (Scoring.RANK, 8, Scoring.RANK),
        (Scoring.STEP, 8, Scoring.STEP),
        (Scoring.STEP, 1, Scoring.STEP),
        (Scoring.STEP, None, Scoring.SPEED),  # a question that never changes
    ],
)
def test_step_without_steps_is_speed(declared: Scoring, steps: int | None, scored: Scoring) -> None:
    assert effective(declared, steps) is scored


# --- SPEED: a bucket's points, times the credit --------------------------------------

# (bucket, credit, points)
SPEED = [
    (1, 1.0, 1000),
    (2, 1.0, 900),
    (3, 1.0, 800),
    (4, 1.0, 700),
    (5, 1.0, 600),
    (2, 0.6, 540),  # three of five in the right place, in bucket 2 (section 6)
    (1, 0.6, 600),
    (5, 0.6, 360),
    (1, 0.5, 500),
    (3, 0.2, 160),
    (4, 1 / 3, 233),
    (5, 2 / 3, 400),
    (1, 0.0, 0),
    (5, 0.0, 0),
]


@pytest.mark.parametrize(("bucket_number", "credit", "points"), SPEED)
def test_speed_points(bucket_number: int, credit: float, points: int) -> None:
    assert points_for(Scoring.SPEED, credit, bucket_number, None) == points


@pytest.mark.parametrize(
    ("bucket_number", "points"), [(1, 1000), (2, 900), (3, 800), (4, 700), (5, 600)]
)
def test_points_for_a_correct_answer(bucket_number: int, points: int) -> None:
    assert points_for(Scoring.SPEED, 1.0, bucket_number, None) == points


@pytest.mark.parametrize("bucket_number", [1, 2, 3, 4, 5])
def test_a_wrong_answer_is_worth_nothing_however_fast(bucket_number: int) -> None:
    assert points_for(Scoring.SPEED, 0.0, bucket_number, None) == 0


@pytest.mark.parametrize("credit", [1.0, 0.6, 0.2])
def test_faster_is_never_worth_less(credit: float) -> None:
    awarded = [points_for(Scoring.SPEED, credit, b, None) for b in range(1, SLOWEST + 1)]
    assert awarded == sorted(awarded, reverse=True)


@pytest.mark.parametrize("bucket_number", [1, 2, 3, 4, 5])
def test_more_right_is_never_worth_less(bucket_number: int) -> None:
    credits = [0.0, 0.2, 1 / 3, 0.5, 0.6, 0.8, 1.0]
    awarded = [points_for(Scoring.SPEED, c, bucket_number, None) for c in credits]
    assert awarded == sorted(awarded)


@pytest.mark.parametrize(("elapsed_s", "expected"), [(0.5, 1), (1.2, 2), (4.0, 3), (12.0, 5)])
def test_the_speed_band_is_the_bucket(elapsed_s: float, expected: int) -> None:
    assert band(Scoring.SPEED, elapsed_s, 10, None) == bucket(elapsed_s, 10) == expected


# --- STEP: the earlier the frame, the more it pays -----------------------------------

# (seconds into a 16-second question of 8 steps, step): two seconds a step.
STEP_EDGES = [
    (-1.0, 1),  # clock skew, as for buckets
    (0.0, 1),
    (1.0, 1),
    (2.0, 1),  # the instant the picture changes still counts for the one it replaced
    (2.001, 2),
    (4.0, 2),
    (4.001, 3),
    (8.0, 4),
    (13.999, 7),
    (14.0, 7),
    (14.001, 8),
    (16.0, 8),
    (16.001, 8),  # past the end, and therefore clamped
    (99.0, 8),
]


@pytest.mark.parametrize(("elapsed_s", "expected"), STEP_EDGES)
def test_step_edges(elapsed_s: float, expected: int) -> None:
    assert step(elapsed_s, 16, 8) == expected


@pytest.mark.parametrize(("elapsed_s", "expected"), STEP_EDGES)
@pytest.mark.parametrize("question_s", [8, 16, 30, 60])
def test_step_edges_are_fractions_of_the_question_time(
    question_s: int, elapsed_s: float, expected: int
) -> None:
    assert step(elapsed_s / 16 * question_s, question_s, 8) == expected


@pytest.mark.parametrize("elapsed_s", [-1.0, 0.0, 15.0, 30.0, 45.0])
def test_one_step_is_always_the_first(elapsed_s: float) -> None:
    assert step(elapsed_s, 30, 1) == 1


@pytest.mark.parametrize(
    ("step_number", "points"),
    [(1, 1000), (2, 914), (3, 829), (4, 743), (5, 657), (6, 571), (7, 486), (8, 400)],
)
def test_step_points_over_eight_steps(step_number: int, points: int) -> None:
    """Section 6's worked example, verbatim."""
    assert step_points(step_number, 8) == points


@pytest.mark.parametrize(
    ("step_number", "steps", "points"),
    [
        (1, 1, 1000),  # one step is the first, not a division by zero
        (2, 1, 1000),
        (1, 2, 1000),
        (2, 2, 400),
        (1, 12, 1000),
        (12, 12, 400),
        (9, 8, 400),  # a step past the last clamps to the last
        (20, 8, 400),
        (0, 8, 1000),  # and one before the first to the first
    ],
)
def test_step_points_ends_and_clamps(step_number: int, steps: int, points: int) -> None:
    assert step_points(step_number, steps) == points


@pytest.mark.parametrize("steps", range(1, 13))
def test_step_points_run_from_the_top_to_the_bottom(steps: int) -> None:
    awarded = [step_points(k, steps) for k in range(1, steps + 1)]
    assert awarded[0] == 1000
    assert awarded[-1] == (1000 if steps == 1 else 400)
    assert awarded == sorted(awarded, reverse=True)
    assert len(set(awarded)) == len(awarded)


# (step, steps, credit, points)
STEPPED = [
    (1, 8, 1.0, 1000),
    (2, 8, 1.0, 914),
    (8, 8, 1.0, 400),
    (2, 8, 0.5, 457),
    (8, 8, 0.0, 0),
    (1, 1, 1.0, 1000),
    (9, 8, 1.0, 400),
]


@pytest.mark.parametrize(("step_number", "steps", "credit", "points"), STEPPED)
def test_step_scoring(step_number: int, steps: int, credit: float, points: int) -> None:
    assert points_for(Scoring.STEP, credit, step_number, steps) == points


def test_the_step_band_is_the_step() -> None:
    assert band(Scoring.STEP, 5.0, 16, 8) == 3


def test_step_without_steps_is_scored_on_speed() -> None:
    """Who's That NPC?: one render, no frames, so being quick is what pays."""
    assert band(Scoring.STEP, 1.2, 10, None) == 2
    assert points_for(Scoring.STEP, 1.0, 2, None) == 900
    assert points_for(Scoring.STEP, 0.6, 2, None) == 540


# --- RANK: the credit is the ranking, and the clock is nobody's business -------------

# Section 6's table: exact, then the closest three, then nothing. A credit between rungs
# is paid at the rung it reached.
RANK = [
    (1.0, 1000),
    (0.95, 750),
    (0.9, 750),
    (0.8, 500),
    (0.7, 250),
    (0.69, 0),
    (0.2, 0),
    (0.0, 0),
]


@pytest.mark.parametrize(("credit", "points"), RANK)
def test_rank_points(credit: float, points: int) -> None:
    assert points_for(Scoring.RANK, credit, None, None) == points


@pytest.mark.parametrize(("credit", "points"), RANK)
def test_rank_ignores_elapsed_time_entirely(credit: float, points: int) -> None:
    """T17 Accept: the same answer scored one second in and at twenty-nine is worth the
    same. There is no band to carry the difference, so there is nothing to pay it on."""
    early = band(Scoring.RANK, 1.0, 30, None)
    late = band(Scoring.RANK, 29.0, 30, None)
    assert early is None and late is None
    assert points_for(Scoring.RANK, credit, early, None) == points
    assert points_for(Scoring.RANK, credit, late, None) == points


@pytest.mark.parametrize("elapsed_s", [-1.0, 0.0, 1.0, 15.0, 29.0, 30.0, 600.0])
def test_rank_has_no_band(elapsed_s: float) -> None:
    assert band(Scoring.RANK, elapsed_s, 30, None) is None
    assert band(Scoring.RANK, elapsed_s, 30, 8) is None


def test_rank_pays_no_attention_to_a_band_it_is_handed() -> None:
    assert {points_for(Scoring.RANK, 0.8, b, None) for b in (None, 1, 5)} == {500}


# --- credit is 0..1 whatever pays it -------------------------------------------------


@pytest.mark.parametrize("credit", [-0.1, 1.0001, 2.0, math.nan])
@pytest.mark.parametrize(
    ("scoring", "band_number", "steps"),
    [(Scoring.SPEED, 1, None), (Scoring.STEP, 1, 8), (Scoring.RANK, None, None)],
)
def test_credit_outside_zero_to_one_is_refused(
    scoring: Scoring, band_number: int | None, steps: int | None, credit: float
) -> None:
    """A type that grades 1.2 has a bug, and paying 1200 for it would hide it."""
    with pytest.raises(ValueError, match="outside 0..1"):
        points_for(scoring, credit, band_number, steps)


@pytest.mark.parametrize(
    ("raw", "settled"),
    [
        (sum([0.1] * 10), 1.0),  # 0.9999999999999999
        (1 - 1e-12, 1.0),
        (1e-12, 0.0),
        (-1e-12, 0.0),
        (0.6, 0.6),
        (1, 1.0),
        (0, 0.0),
    ],
)
def test_credit_is_rounded_before_anything_reads_it(
    raw: float, settled: float, caplog: pytest.LogCaptureFixture
) -> None:
    """Credit summed from fractions is full marks, and a rounding speck is no bug."""
    credit = settle_credit("ordering", raw)
    assert credit == settled
    assert type(credit) is float
    assert math.copysign(1, credit) == 1  # never -0.0
    assert caplog.records == []


@pytest.mark.parametrize(
    ("raw", "settled"),
    [
        (1.2, 1.0),
        (-0.1, 0.0),
        (math.inf, 1.0),
        (-math.inf, 0.0),
        (10**400, 1.0),
        (math.nan, 0.0),
        (None, 0.0),
        ("1", 0.0),
        (True, 0.0),
    ],
)
def test_bad_credit_is_clamped_and_logged_never_raised(
    raw: object, settled: float, caplog: pytest.LogCaptureFixture
) -> None:
    """A type's bug costs its player the question and names the type; it never raises."""
    credit = settle_credit("ordering", raw)
    assert credit == settled
    assert points_for(Scoring.SPEED, credit, 1, None) == round(1000 * settled)
    [record] = caplog.records
    assert record.levelname == "ERROR"
    assert "ordering" in record.getMessage()


# --- a scoring nobody taught the tables ------------------------------------------------


def test_a_scoring_the_tables_do_not_know_fails_loudly() -> None:
    """A fourth ``Scoring`` member added without its table must not slip through as
    ``None`` points or an ``UnboundLocalError`` somewhere in the close."""
    unknown = cast(Scoring, "fourth")
    with pytest.raises(AssertionError):
        band(unknown, 1.0, 10, None)
    with pytest.raises(AssertionError):
        points_for(unknown, 1.0, 1, None)


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
