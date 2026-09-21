"""``rooms/settings.py``: a mode is a round, and a round is paced by its own mode.

The two models are one shape with two policies (see the module docstring there), so what
is tested here is which of them holds which: ``RoomSettings`` loads anything a room was
ever stored with, ``NewRoomSettings`` is what a host may ask for today.

``GET /api/modes`` is tested here too. It is the same policy, served to the create form
so the form's number fields cannot drift from what the server will accept.
"""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.modes import MODES, Mode
from app.rooms.settings import MAX_QUESTIONS_PER_ROOM, ModeSettings, NewRoomSettings, RoomSettings


@pytest.fixture
def more_modes() -> Iterator[list[str]]:
    """Four more registered modes, for the rules that need a room of several rounds."""
    names = [f"stub_{index}" for index in range(4)]
    for name in names:
        MODES[name] = Mode(id=name, type="more_less")
    yield names
    for name in names:
        del MODES[name]


def test_a_mode_takes_its_numbers_from_its_own_type() -> None:
    """``{"mode": "more_less"}`` is a whole round: the type says how long and how many."""
    entry = ModeSettings(mode="more_less")
    assert (entry.questions, entry.seconds) == (5, 10)
    assert ModeSettings(mode="more_less", seconds=6).questions == 5  # only what was left out


def test_the_default_room_is_one_round_of_the_first_type() -> None:
    settings = RoomSettings()
    assert settings.mode_ids == ["more_less"]
    assert settings.mode_order == "listed"


def test_rounds_are_the_modes(more_modes: list[str]) -> None:
    settings = NewRoomSettings(
        modes=[{"mode": "more_less", "questions": 8}, {"mode": more_modes[0], "questions": 3}]
    )
    assert settings.mode_ids == ["more_less", more_modes[0]]
    assert settings.question_count == 11


def test_a_mode_is_one_round() -> None:
    with pytest.raises(ValidationError, match="unique"):
        RoomSettings(modes=[{"mode": "more_less"}, {"mode": "more_less"}])


def test_only_modes_this_build_plays() -> None:
    with pytest.raises(ValidationError, match="unsupported"):
        RoomSettings(modes=[{"mode": "closest_number"}])


@pytest.mark.parametrize(
    "entry",
    [
        {"mode": "more_less", "questions": 0},
        {"mode": "more_less", "questions": 31},
        {"mode": "more_less", "seconds": 4},
        {"mode": "more_less", "seconds": 21},
    ],
)
def test_a_host_stays_inside_the_types_own_range(entry: dict[str, Any]) -> None:
    NewRoomSettings(modes=[{"mode": "more_less"}])  # the same call, inside the range
    with pytest.raises(ValidationError):
        NewRoomSettings(modes=[entry])


def test_the_stored_model_loads_what_a_host_may_not_ask_for() -> None:
    """A room created under one set of bounds still loads after the bounds move."""
    settings = RoomSettings(modes=[{"mode": "more_less", "questions": 40, "seconds": 1}])
    assert settings.question_count == 40
    with pytest.raises(ValidationError):
        NewRoomSettings(**settings.model_dump())


def test_a_room_may_not_be_longer_than_the_cap(more_modes: list[str]) -> None:
    modes = [{"mode": name, "questions": 30} for name in more_modes]
    assert sum(entry["questions"] for entry in modes) > MAX_QUESTIONS_PER_ROOM
    with pytest.raises(ValidationError, match="limit"):
        NewRoomSettings(modes=modes)
    modes[-1]["questions"] = 10  # 100 exactly, which is the cap and not over it
    assert NewRoomSettings(modes=modes).question_count == MAX_QUESTIONS_PER_ROOM


def test_seconds_for_clamps_a_stored_room_into_the_types_range() -> None:
    settings = RoomSettings(modes=[{"mode": "more_less", "seconds": 45}])
    assert settings.seconds_for("more_less") == 20


def test_a_mode_nobody_picked_falls_back_to_its_types_own_pace() -> None:
    """A room's own question can be of a type no round was made for (Phase 2)."""
    settings = RoomSettings(modes=[{"mode": "more_less", "questions": 4, "seconds": 7}])
    assert settings.seconds_for("free_text") == 30  # the registry fallback
    assert settings.questions_for("free_text") == 5
    assert (settings.seconds_for("more_less"), settings.questions_for("more_less")) == (7, 4)


def test_api_modes_serves_the_create_form_what_it_may_offer(client: TestClient) -> None:
    response = client.get("/api/modes")
    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "more_less",
            "type": "more_less",
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 10, "min": 5, "max": 20},
        },
        {
            "id": "price_is_right",
            "type": "price_is_right",
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 10, "min": 5, "max": 30},
        },
    ]
