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


def test_custom_is_not_a_round() -> None:
    """T21: the host's questions go in ``custom_questions`` and land as random events."""
    with pytest.raises(ValidationError, match="cannot be picked as a round"):
        RoomSettings(modes=[{"mode": "more_less"}, {"mode": "custom"}])
    with pytest.raises(ValidationError, match="cannot be picked as a round"):
        NewRoomSettings(modes=[{"mode": "custom", "seconds": 20}])


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
        NewRoomSettings(modes=modes, random_events=False)
    modes[-1]["questions"] = 10  # 100 exactly, which is the cap and not over it
    settings = NewRoomSettings(modes=modes, random_events=False)
    assert settings.question_count == MAX_QUESTIONS_PER_ROOM


def test_the_cap_counts_the_random_events_a_room_may_hold(more_modes: list[str]) -> None:
    """Section 4: events are questions the room will play, so they count against it.

    With the packs allowed to interrupt, every slot may end up holding one; without,
    only the host's own are events, and those are counted when they are checked.
    """
    modes = [{"mode": name, "questions": 24} for name in more_modes]  # 96, and 3 slots
    assert NewRoomSettings(modes=modes).random_event_slots == 3  # 99 with every slot filled
    modes[-1]["questions"] = 26  # 98, and 101 with every slot filled
    with pytest.raises(ValidationError, match="101 questions over all rounds and random events"):
        NewRoomSettings(modes=modes)
    quiet = NewRoomSettings(modes=modes, random_events=False)
    quiet.check_custom_questions(2)  # 100
    with pytest.raises(ValueError, match="101 questions"):
        quiet.check_custom_questions(3)


def test_the_host_gets_one_question_per_round_after_the_first(more_modes: list[str]) -> None:
    """T21: never truncated -- refused, with the count and the limit named."""
    settings = NewRoomSettings(modes=[{"mode": name} for name in more_modes[:3]])
    assert settings.random_event_slots == 2
    settings.check_custom_questions(2)
    with pytest.raises(ValueError) as info:
        settings.check_custom_questions(5)
    assert "5 custom questions" in str(info.value)
    assert "a room of 3 modes holds at most 2" in str(info.value)
    one = NewRoomSettings(modes=[{"mode": "more_less"}])
    with pytest.raises(ValueError, match="holds at most 0"):
        one.check_custom_questions(1)


@pytest.mark.parametrize("seconds", [-1, 11])
def test_the_npc_holds_the_floor_for_zero_to_ten_seconds(seconds: int) -> None:
    assert NewRoomSettings(random_event_seconds=10).random_event_seconds == 10
    with pytest.raises(ValidationError):
        NewRoomSettings(random_event_seconds=seconds)


@pytest.mark.parametrize("seconds", [-1, 31])
def test_the_standings_hold_for_zero_to_thirty_seconds(seconds: int) -> None:
    """D9: default 10, 0..30 at creation, zero turning the phase off."""
    assert NewRoomSettings().standings_seconds == 10
    assert NewRoomSettings(standings_seconds=0).standings_seconds == 0
    assert NewRoomSettings(standings_seconds=30).standings_seconds == 30
    with pytest.raises(ValidationError):
        NewRoomSettings(standings_seconds=seconds)


def test_a_room_stored_before_the_standings_reads_as_having_them() -> None:
    """D9 Accept: a room created before the field existed still loads, and plays with the
    default rather than being refused for a missing key."""
    stored = RoomSettings().model_dump()
    del stored["standings_seconds"]
    assert RoomSettings.model_validate(stored).standings_seconds == 10


def test_seconds_for_clamps_a_stored_room_into_the_types_range() -> None:
    settings = RoomSettings(modes=[{"mode": "more_less", "seconds": 45}])
    assert settings.seconds_for("more_less") == 20


def test_a_mode_nobody_picked_plays_at_its_own_pace() -> None:
    """An event is a question of a mode no round was made for: a pack event's own mode,
    or ``custom``. Either plays at that mode's default length."""
    settings = RoomSettings(modes=[{"mode": "more_less", "questions": 4, "seconds": 7}])
    assert settings.seconds_for("more_less") == 7
    assert settings.seconds_for("guess_examine") == 20  # its type's default
    assert settings.seconds_for("custom") == 20  # the mode's own
    assert settings.seconds_for("not_a_mode") == 30  # the registry fallback


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
        {
            "id": "guess_examine",
            "type": "pick_from_list",
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 20, "min": 10, "max": 60},
        },
        {
            # Never a round, so no round length; its questions carry their own types.
            "id": "custom",
            "type": None,
            "questions": None,
            "seconds": {"default": 20, "min": 10, "max": 60},
        },
    ]
