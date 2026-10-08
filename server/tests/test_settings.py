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
from app.rooms.settings import (
    EVENT_EVERY,
    MAX_QUESTIONS_PER_ROOM,
    ModeSettings,
    NewRoomSettings,
    RoomSettings,
)


@pytest.fixture
def more_modes() -> Iterator[list[str]]:
    """Four more registered modes, for the rules that need a room of several rounds."""
    names = [f"stub_{index}" for index in range(4)]
    for name in names:
        MODES[name] = Mode(id=name, types=frozenset({"more_less"}))
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


def test_a_new_room_shuffles_its_rounds_unless_told_otherwise() -> None:
    assert NewRoomSettings().mode_order == "random"
    assert NewRoomSettings(mode_order="listed").mode_order == "listed"


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
    """The host's questions go in ``custom_questions`` and land as random events."""
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
    """The events count, and there is no off switch: at ``more``, 84 round questions and
    their 16 events are the longest room there is."""
    modes = [{"mode": name, "questions": 21} for name in more_modes]
    settings = NewRoomSettings(modes=modes, random_event_frequency="more")
    assert settings.question_count + settings.random_event_slots == MAX_QUESTIONS_PER_ROOM
    modes[-1]["questions"] = 22
    with pytest.raises(ValidationError, match="102 questions over all rounds and random events"):
        NewRoomSettings(modes=modes, random_event_frequency="more")


def test_the_cap_counts_the_random_events_at_the_frequency_asked_for(
    more_modes: list[str],
) -> None:
    """Section 4: events are questions the room will play, so they count against it,
    whoever ends up asking them -- the host's take slots rather than adding to them."""
    modes = [{"mode": name, "questions": 24} for name in more_modes]  # 96
    assert NewRoomSettings(modes=modes, random_event_frequency="less").random_event_slots == 4
    with pytest.raises(ValidationError, match="105 questions over all rounds and random events"):
        NewRoomSettings(modes=modes)


@pytest.mark.parametrize(
    ("frequency", "questions", "slots"),
    [
        ("less", 10, 0),
        ("default", 10, 1),
        ("more", 10, 2),
        ("less", 40, 2),
        ("default", 40, 4),
        ("more", 40, 8),
        ("default", 19, 1),  # a window is whole or it is not a window
    ],
)
def test_one_event_per_twenty_ten_or_five_round_questions(
    more_modes: list[str], frequency: str, questions: int, slots: int
) -> None:
    """phase2.md's table, which is what Create shows before the room exists."""
    modes = [{"mode": more_modes[0], "questions": questions // 2}]
    modes.append({"mode": more_modes[1], "questions": questions - questions // 2})
    settings = NewRoomSettings(modes=modes, random_event_frequency=frequency)
    assert settings.random_event_slots == slots
    assert EVENT_EVERY[frequency] == {"less": 20, "default": 10, "more": 5}[frequency]


def test_the_frequency_is_one_of_three_and_defaults_to_default() -> None:
    assert NewRoomSettings().random_event_frequency == "default"
    for frequency in ("less", "default", "more"):
        assert NewRoomSettings(random_event_frequency=frequency).random_event_frequency == frequency
    for wrong in ("never", None):
        with pytest.raises(ValidationError, match="random_event_frequency"):
            NewRoomSettings(random_event_frequency=wrong)


def test_a_room_stored_with_t21s_boolean_reads_as_the_frequency_it_meant() -> None:
    """True was "the packs may interrupt too", which is ``default``; false was "only the
    host's questions", which only a stored room can still be. A new room cannot."""
    stored = RoomSettings().model_dump()
    del stored["random_event_frequency"]
    assert RoomSettings.model_validate(
        {**stored, "random_events": True}
    ).random_event_frequency == ("default")
    quiet = RoomSettings.model_validate({**stored, "random_events": False})
    assert quiet.random_event_frequency is None
    assert quiet.random_event_slots == len(quiet.modes) - 1  # the boolean-era count
    assert "random_events" not in quiet.model_dump()
    with pytest.raises(ValidationError, match="random_event_frequency"):
        NewRoomSettings.model_validate({**stored, "random_events": False})
    with pytest.raises(ValidationError, match="random_events"):
        RoomSettings.model_validate({**stored, "random_events": "sometimes"})


def test_a_stored_room_keeps_a_mode_that_left_the_registry() -> None:
    """Its questions carry their own types, so it plays on, at the fallback pace; a room
    being created or built in code is still held to the registry."""
    stored = {"modes": [{"mode": "zoom_quiz", "questions": 4, "seconds": 12}]}
    settings = RoomSettings.stored(stored)
    assert settings.mode_ids == ["zoom_quiz"]
    assert settings.seconds_for("zoom_quiz", "multiple_choice") == 12
    with pytest.raises(ValidationError, match="unsupported"):
        RoomSettings.model_validate(stored)
    with pytest.raises(ValidationError, match="cannot be picked as a round"):
        RoomSettings.model_validate({"modes": [{"mode": "custom"}]})
    assert RoomSettings.stored({"modes": [{"mode": "custom"}]}).mode_ids == ["custom"]


def test_a_stored_room_drops_the_keys_a_newer_build_wrote() -> None:
    """A downgrade must not strand every room the newer release created."""
    stored = {
        **RoomSettings().model_dump(),
        "list_publicly": True,
        "modes": [{"mode": "more_less", "questions": 5, "seconds": 10, "hidden": True}],
    }
    assert RoomSettings.stored(stored) == RoomSettings(
        modes=[{"mode": "more_less", "questions": 5, "seconds": 10}]
    )
    with pytest.raises(ValidationError, match="list_publicly"):
        RoomSettings.model_validate(stored)
    old = {k: v for k, v in stored.items() if k != "random_event_frequency"}
    old["random_events"] = False
    assert RoomSettings.stored(old).random_event_frequency is None  # still translated


def test_the_hosts_questions_are_capped_at_the_slots(more_modes: list[str]) -> None:
    """Never truncated -- refused, naming the count, the limit and the frequency, and
    pointing at ``more`` while there is a ``more`` to point at."""
    settings = NewRoomSettings(modes=[{"mode": name, "questions": 10} for name in more_modes[:3]])
    assert settings.random_event_slots == 3
    settings.check_custom_questions(3)
    with pytest.raises(ValueError) as info:
        settings.check_custom_questions(4)
    message = str(info.value)
    assert "4 custom questions" in message
    assert "30 round questions at random_event_frequency 'default'" in message
    assert "make room for 3 random events: one per 10" in message
    assert "Pick random_event_frequency 'more'" in message
    busy = settings.model_copy(update={"random_event_frequency": "more"})
    busy.check_custom_questions(6)
    with pytest.raises(ValueError, match="make room for 6") as info:
        busy.check_custom_questions(7)
    assert "one per 5. Add questions to the rounds" in str(info.value)
    assert "Pick" not in str(info.value)


def test_one_question_rounds_make_no_room_for_the_hosts_questions(more_modes: list[str]) -> None:
    """Five one-question rounds at ``more`` are one window, and every question in it is its
    round's last, so there is nowhere inside a round for an event. The host hears it here,
    as they would for too few round questions, not once the room has drawn its rounds."""
    ones = [{"mode": name, "questions": 1} for name in ("more_less", *more_modes)]
    settings = NewRoomSettings(modes=ones, random_event_frequency="more")
    assert settings.random_event_slots == 0
    with pytest.raises(ValueError, match="make room for 0 random events: one per 5"):
        settings.check_custom_questions(1)
    longer = NewRoomSettings(
        modes=[{"mode": "more_less", "questions": 6}, *ones[1:]], random_event_frequency="more"
    )
    assert longer.random_event_slots == 1  # ten round questions, but the second window is ones
    longer.check_custom_questions(1)
    with pytest.raises(ValueError, match="10 round questions .* make room for 1 random events"):
        longer.check_custom_questions(2)


def test_the_npc_hold_is_no_longer_a_setting() -> None:
    """A new room cannot ask for one, and a room stored with one still loads."""
    with pytest.raises(ValidationError, match="random_event_seconds"):
        NewRoomSettings(random_event_seconds=2)
    stored = RoomSettings.stored({"modes": [{"mode": "more_less"}], "random_event_seconds": 2})
    assert "random_event_seconds" not in stored.model_dump()


@pytest.mark.parametrize("seconds", [-1, 31])
def test_the_standings_hold_for_zero_to_thirty_seconds(seconds: int) -> None:
    """Default 10, 0..30 at creation, zero turning the phase off."""
    assert NewRoomSettings().standings_seconds == 10
    assert NewRoomSettings(standings_seconds=0).standings_seconds == 0
    assert NewRoomSettings(standings_seconds=30).standings_seconds == 30
    with pytest.raises(ValidationError):
        NewRoomSettings(standings_seconds=seconds)


def test_a_room_stored_before_the_standings_reads_as_having_them() -> None:
    """A room created before the field existed still loads, and plays with the
    default rather than being refused for a missing key."""
    stored = RoomSettings().model_dump()
    del stored["standings_seconds"]
    assert RoomSettings.model_validate(stored).standings_seconds == 10


def test_naming_wrong_answers_is_on_unless_the_host_opts_out() -> None:
    """The names under a reveal are the default, and a stored room without the key reads."""
    assert NewRoomSettings().name_wrong_answers is True
    assert NewRoomSettings(name_wrong_answers=False).name_wrong_answers is False
    stored = RoomSettings().model_dump()
    del stored["name_wrong_answers"]
    assert RoomSettings.model_validate(stored).name_wrong_answers is True


def test_seconds_for_clamps_a_stored_room_into_the_types_range() -> None:
    settings = RoomSettings(modes=[{"mode": "more_less", "seconds": 45}])
    assert settings.seconds_for("more_less", "more_less") == 20


def test_an_event_is_open_for_its_own_types_default() -> None:
    """An event has no round of its own to take a length from, so the question's type
    decides, not the mode it came from or the round it interrupts."""
    settings = RoomSettings(modes=[{"mode": "more_less", "questions": 4, "seconds": 7}])
    assert settings.seconds_for("more_less", "more_less") == 7
    for mode in ("custom", "random_event"):
        assert settings.seconds_for(mode, "more_less") == 10
        assert settings.seconds_for(mode, "multiple_choice") == 15
        assert settings.seconds_for(mode, "closest_number") == 20
    assert settings.seconds_for("custom", "not_a_type") == 30  # the registry fallback


def test_api_modes_serves_the_create_form_what_it_may_offer(client: TestClient) -> None:
    response = client.get("/api/modes")
    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "more_less",
            "types": ["more_less"],
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 10, "min": 5, "max": 20},
        },
        {
            "id": "price_is_right",
            "types": ["price_is_right"],
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 10, "min": 5, "max": 30},
        },
        {
            "id": "guess_examine",
            "types": ["pick_from_list"],
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 20, "min": 10, "max": 60},
        },
        {
            "id": "sort_it_out",
            "types": ["ordering"],
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 25, "min": 10, "max": 45},
        },
        {
            "id": "who_said_that",
            "types": ["multiple_choice"],
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 20, "min": 5, "max": 30},
        },
        {
            "id": "know_your_content_creator",
            "types": ["closest_number", "multiple_choice", "pick_all_that_apply"],
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 20, "min": 10, "max": 60},
        },
        {
            "id": "bestiary",
            "types": [
                "closest_number",
                "free_text",
                "multiple_choice",
                "ordering",
                "pick_all_that_apply",
            ],
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 20, "min": 10, "max": 60},
        },
        {
            "id": "drop_table",
            "types": ["closest_number", "free_text", "multiple_choice", "pick_all_that_apply"],
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 20, "min": 10, "max": 60},
        },
        {
            "id": "odd_one_out",
            "types": ["multiple_choice"],
            "questions": {"default": 5, "min": 1, "max": 30},
            "seconds": {"default": 20, "min": 5, "max": 30},
        },
        {
            # Never a round, so no round length; its questions carry and pace by their types.
            "id": "custom",
            "types": [],
            "questions": None,
            "seconds": None,
        },
        {
            "id": "random_event",
            "types": [],
            "questions": None,
            "seconds": None,
        },
    ]
