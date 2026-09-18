"""``rooms/selection.py`` contract: pure, seeded, without replacement."""

import random
from pathlib import Path
from typing import Any

from app.questions.packs import Pack
from app.rooms.selection import select
from app.rooms.settings import RoomSettings


def _pack(name: str, qtype: str, n: int) -> Pack:
    questions = tuple({"id": f"q_{name}_{i}", "type": qtype, "payload": {}} for i in range(n))
    return Pack(
        name=name, generated_at="2026-09-18T00:00:00Z", questions=questions, path=Path(name)
    )


PACKS = [
    _pack("a", "higher_lower", 30),
    _pack("b", "higher_lower", 30),
    _pack("c", "free_text", 30),
]
CUSTOM: list[dict[str, Any]] = [{"id": "q_custom_1", "type": "higher_lower", "payload": {}}]


def test_count_without_replacement_and_only_chosen_modes() -> None:
    settings = RoomSettings(question_count=50, modes=["higher_lower"])
    got = select(PACKS, [], settings, random.Random(1))
    assert len(got) == 50
    assert len({q["id"] for q in got}) == 50
    assert {q["type"] for q in got} == {"higher_lower"}


def test_fewer_available_than_asked_uses_all() -> None:
    settings = RoomSettings(question_count=100, modes=["higher_lower"])
    got = select(PACKS[:1], [], settings, random.Random(1))
    assert len(got) == 30


def test_seeded_and_deterministic() -> None:
    settings = RoomSettings(question_count=10)
    a = select(PACKS, CUSTOM, settings, random.Random(7))
    b = select(PACKS, CUSTOM, settings, random.Random(7))
    c = select(PACKS, CUSTOM, settings, random.Random(8))
    assert a == b
    assert a != c


def test_custom_last_keeps_custom_at_the_end() -> None:
    settings = RoomSettings(question_count=5, order="custom_last")
    got = select(PACKS, CUSTOM, settings, random.Random(1))
    assert len(got) == 6
    assert got[-1] == CUSTOM[0]


def test_shuffle_mixes_custom_in() -> None:
    settings = RoomSettings(question_count=20, order="shuffle")
    positions = set()
    for seed in range(20):
        got = select(PACKS, CUSTOM, settings, random.Random(seed))
        assert len(got) == 21
        positions.add(got.index(CUSTOM[0]))
    assert positions != {20}, "custom question never moved from the end"
