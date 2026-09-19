"""``rooms/segments.py``: rounds grouped back out of the questions that carry them."""

from dataclasses import dataclass

from app.rooms.segments import segment_at, segments_of


@dataclass
class Q:
    """The two fields grouping reads. ``RoomQuestion`` has both and much more."""

    round: int
    type: str


def _questions(*rounds: tuple[int, str]) -> list[Q]:
    return [Q(round=number, type=mode) for number, mode in rounds]


def test_no_questions_is_no_rounds() -> None:
    assert segments_of([]) == []


def test_one_round_spans_everything() -> None:
    (only,) = segments_of(_questions((0, "more_less"), (0, "more_less"), (0, "more_less")))
    assert (only.mode, only.index, only.total, only.start, only.count) == (
        "more_less",
        0,
        1,
        0,
        3,
    )


def test_rounds_carry_their_start_and_length() -> None:
    got = segments_of(
        _questions(
            (0, "more_less"),
            (0, "more_less"),
            (1, "free_text"),
            (1, "free_text"),
            (1, "free_text"),
        )
    )
    assert [(s.mode, s.index, s.total, s.start, s.count) for s in got] == [
        ("more_less", 0, 2, 0, 2),
        ("free_text", 1, 2, 2, 3),
    ]


def test_two_rounds_of_the_same_mode_stay_two_rounds() -> None:
    """The reason the round is stored: runs of equal ``type`` would merge these."""
    got = segments_of(_questions((0, "more_less"), (1, "more_less")))
    assert [(s.index, s.start, s.count) for s in got] == [(0, 0, 1), (1, 1, 1)]
    assert {s.mode for s in got} == {"more_less"}


def test_segment_at_finds_the_round_a_position_falls_in() -> None:
    got = segments_of(
        _questions((0, "more_less"), (0, "more_less"), (1, "free_text"), (1, "free_text"))
    )
    assert [segment_at(got, p).index for p in range(4)] == [0, 0, 1, 1]  # type: ignore[union-attr]
    assert segment_at(got, 4) is None
    assert segment_at(got, -1) is None
    assert segment_at([], 0) is None
