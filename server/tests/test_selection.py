"""``rooms/selection.py`` contract: pure, seeded, without replacement, one round per mode."""

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


def _settings(*modes: tuple[str, int], **overrides: Any) -> RoomSettings:
    """``_settings(("more_less", 5))`` -> a room of one five-question ``more_less`` round."""
    entries = [{"mode": mode, "questions": questions} for mode, questions in modes]
    return RoomSettings(modes=entries, **overrides)


def _questions(rounds: list[Round]) -> list[dict[str, Any]]:
    return [q for round_ in rounds for q in round_.questions]


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


def test_count_without_replacement_and_only_chosen_modes() -> None:
    rounds = select(PACKS, [], _settings(("more_less", 50)), random.Random(1))
    got = _questions(rounds)
    assert len(got) == 50
    assert len({q["id"] for q in got}) == 50
    assert {q["type"] for q in got} == {"more_less"}


def test_a_mode_is_a_round(second_mode: str) -> None:
    """The whole rule: one round per mode, as long as that mode asked to be."""
    settings = _settings(("more_less", 8), ("free_text", 3))
    rounds = select(PACKS, [], settings, random.Random(1))
    assert [(r.mode, len(r.questions)) for r in rounds] == [("more_less", 8), ("free_text", 3)]
    # Every question in a round is that round's mode: what makes a round introducible.
    assert all({q["type"] for q in r.questions} == {r.mode} for r in rounds)


def test_one_mode_is_one_round() -> None:
    rounds = select(PACKS, [], _settings(("more_less", 20)), random.Random(1))
    assert [len(r.questions) for r in rounds] == [20]


def test_listed_order_plays_the_rounds_in_the_order_the_host_arranged(second_mode: str) -> None:
    """``mode_order = "listed"``, the default: what the host listed is what plays."""
    for seed in range(10):
        settings = _settings(("free_text", 2), ("more_less", 2))
        rounds = select(PACKS, [], settings, random.Random(seed))
        assert [r.mode for r in rounds] == ["free_text", "more_less"]


def test_random_order_shuffles_the_rounds(second_mode: str) -> None:
    settings = _settings(("more_less", 2), ("free_text", 2), mode_order="random")
    orders = {
        tuple(r.mode for r in select(PACKS, [], settings, random.Random(seed)))
        for seed in range(20)
    }
    assert orders == {("more_less", "free_text"), ("free_text", "more_less")}


def test_fewer_available_than_asked_shortens_and_then_drops_rounds(second_mode: str) -> None:
    """A mode that has nothing to play gives no round: never an empty one."""
    settings = _settings(("more_less", 40), ("free_text", 5))
    rounds = select(PACKS[:1], [], settings, random.Random(1))  # 30 more_less, no free_text
    assert [(r.mode, len(r.questions)) for r in rounds] == [("more_less", 30)]
    assert all(r.questions for r in rounds)


def test_seeded_and_deterministic() -> None:
    settings = _settings(("more_less", 10))
    a = select(PACKS, CUSTOM, settings, random.Random(7))
    b = select(PACKS, CUSTOM, settings, random.Random(7))
    c = select(PACKS, CUSTOM, settings, random.Random(8))
    assert a == b
    assert a != c


def test_custom_last_keeps_custom_at_the_end() -> None:
    settings = _settings(("more_less", 5), order="custom_last")
    rounds = select(PACKS, CUSTOM, settings, random.Random(1))
    got = _questions(rounds)
    assert len(got) == 6
    assert got[-1] == CUSTOM[0]
    assert rounds[-1].questions == CUSTOM


def test_shuffle_mixes_custom_into_a_round_of_its_own_mode() -> None:
    settings = _settings(("more_less", 20), order="shuffle")
    positions = set()
    for seed in range(20):
        rounds = select(PACKS, CUSTOM, settings, random.Random(seed))
        got = _questions(rounds)
        assert len(got) == 21
        # It joined an existing round rather than adding one of its own.
        assert len(rounds) == 1
        home = next(r for r in rounds if CUSTOM[0] in r.questions)
        assert home.mode == "more_less"
        positions.add(got.index(CUSTOM[0]))
    assert len(positions) > 1, "custom question never moved"


@pytest.mark.parametrize("order", ["shuffle", "custom_last"])
def test_every_round_is_one_mode(order: str) -> None:
    """A custom question of a mode nobody picked trails the game in a round of its own."""
    custom = CUSTOM + [{"id": "q_custom_2", "type": "free_text", "payload": {}}]
    settings = _settings(("more_less", 10), order=order)
    rounds = select(PACKS, custom, settings, random.Random(2))
    for round_ in rounds:
        assert {q["type"] for q in round_.questions} == {round_.mode}
    assert rounds[-1].mode == "free_text"


def test_flatten_numbers_questions_by_round_in_play_order(second_mode: str) -> None:
    settings = _settings(("more_less", 3), ("free_text", 4))
    rounds = select(PACKS, [], settings, random.Random(1))
    flat = flatten(rounds)
    assert [number for number, _ in flat] == [0, 0, 0, 1, 1, 1, 1]
    assert [q for _, q in flat] == _questions(rounds)
