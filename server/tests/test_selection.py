"""``rooms/selection.py`` contract: pure, seeded, without replacement, in rounds."""

import random
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from app.questions.packs import Pack
from app.questions.types import TYPES, more_less
from app.rooms.selection import Round, flatten, select
from app.rooms.settings import RoomSettings


def _pack(name: str, qtype: str, n: int) -> Pack:
    questions = tuple({"id": f"q_{name}_{i}", "type": qtype, "payload": {}} for i in range(n))
    return Pack(
        name=name, generated_at="2026-09-18T00:00:00Z", questions=questions, path=Path(name)
    )


PACKS = [
    _pack("a", "more_less", 30),
    _pack("b", "more_less", 30),
    _pack("c", "free_text", 30),
]
CUSTOM: list[dict[str, Any]] = [{"id": "q_custom_1", "type": "more_less", "payload": {}}]


def _questions(rounds: list[Round]) -> list[dict[str, Any]]:
    return [q for round_ in rounds for q in round_.questions]


def test_count_without_replacement_and_only_chosen_modes() -> None:
    settings = RoomSettings(question_count=50, questions_per_round=5, modes=["more_less"])
    rounds = select(PACKS, [], settings, random.Random(1))
    got = _questions(rounds)
    assert len(got) == 50
    assert len({q["id"] for q in got}) == 50
    assert {q["type"] for q in got} == {"more_less"}


def test_rounds_are_questions_per_round_long() -> None:
    settings = RoomSettings(question_count=20, questions_per_round=5, modes=["more_less"])
    rounds = select(PACKS, [], settings, random.Random(1))
    assert [len(r.questions) for r in rounds] == [5, 5, 5, 5]


def test_a_count_that_does_not_divide_leaves_a_short_last_round() -> None:
    settings = RoomSettings(question_count=13, questions_per_round=5, modes=["more_less"])
    rounds = select(PACKS, [], settings, random.Random(1))
    assert [len(r.questions) for r in rounds] == [5, 5, 3]
    assert len(_questions(rounds)) == 13


@pytest.fixture
def second_mode() -> Iterator[str]:
    """A second registered type, so round order can be tested before one exists.

    ``RoomSettings`` only takes modes the registry knows, and the registry is one module
    long. The stub is never played -- selection reads nothing but ``type`` -- so it only
    has to be a key.
    """
    TYPES["free_text"] = more_less  # a stand-in; selection never calls into it
    yield "free_text"
    del TYPES["free_text"]


def test_modes_take_turns_and_never_repeat_next_to_each_other(second_mode: str) -> None:
    settings = RoomSettings(
        question_count=24, questions_per_round=4, modes=["more_less", "free_text"]
    )
    rounds = select(PACKS, [], settings, random.Random(3))
    modes = [r.mode for r in rounds]
    assert len(modes) == 6
    assert set(modes) == {"more_less", "free_text"}
    assert all(a != b for a, b in zip(modes, modes[1:], strict=False))
    # Every question in a round is that round's mode: what makes a round introducible.
    assert all({q["type"] for q in r.questions} == {r.mode} for r in rounds)


def test_fewer_available_than_asked_shortens_and_then_drops_rounds() -> None:
    """A mode that runs out gives a short round, then none: never an empty one."""
    settings = RoomSettings(question_count=100, questions_per_round=20, modes=["more_less"])
    rounds = select(PACKS[:1], [], settings, random.Random(1))
    assert [len(r.questions) for r in rounds] == [20, 10]
    assert len(_questions(rounds)) == 30
    assert all(r.questions for r in rounds)


def test_seeded_and_deterministic() -> None:
    settings = RoomSettings(question_count=10, questions_per_round=5)
    a = select(PACKS, CUSTOM, settings, random.Random(7))
    b = select(PACKS, CUSTOM, settings, random.Random(7))
    c = select(PACKS, CUSTOM, settings, random.Random(8))
    assert a == b
    assert a != c


def test_custom_last_keeps_custom_at_the_end() -> None:
    settings = RoomSettings(question_count=5, questions_per_round=5, order="custom_last")
    rounds = select(PACKS, CUSTOM, settings, random.Random(1))
    got = _questions(rounds)
    assert len(got) == 6
    assert got[-1] == CUSTOM[0]
    assert rounds[-1].questions == CUSTOM


def test_shuffle_mixes_custom_into_a_round_of_its_own_mode() -> None:
    settings = RoomSettings(question_count=20, questions_per_round=5, order="shuffle")
    positions = set()
    for seed in range(20):
        rounds = select(PACKS, CUSTOM, settings, random.Random(seed))
        got = _questions(rounds)
        assert len(got) == 21
        # It joined an existing round rather than adding one of its own.
        assert len(rounds) == 4
        home = next(r for r in rounds if CUSTOM[0] in r.questions)
        assert home.mode == "more_less"
        positions.add(got.index(CUSTOM[0]))
    assert len(positions) > 1, "custom question never moved"


@pytest.mark.parametrize("order", ["shuffle", "custom_last"])
def test_every_round_is_one_mode(order: str) -> None:
    custom = CUSTOM + [{"id": "q_custom_2", "type": "free_text", "payload": {}}]
    settings = RoomSettings(
        question_count=10, questions_per_round=5, order=order, modes=["more_less"]
    )
    rounds = select(PACKS, custom, settings, random.Random(2))
    for round_ in rounds:
        assert {q["type"] for q in round_.questions} == {round_.mode}


def test_flatten_numbers_questions_by_round_in_play_order() -> None:
    settings = RoomSettings(question_count=7, questions_per_round=3, modes=["more_less"])
    rounds = select(PACKS, [], settings, random.Random(1))
    flat = flatten(rounds)
    assert [number for number, _ in flat] == [0, 0, 0, 1, 1, 1, 2]
    assert [q for _, q in flat] == _questions(rounds)
