"""``rooms/selection.py`` contract: pure, seeded, without replacement, one round per mode.

T21 Accept: three custom questions in a four-mode room land in three different rounds,
none of them the first round and none at a round's first position, seeded and asserted;
``random_events`` with no custom questions still produces pack events, and none of them
shares the mode of the round it interrupts.
"""

import random
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from app.modes import MODES, Mode
from app.questions.packs import Pack
from app.rooms import selection
from app.rooms.selection import (
    PACK_RANDOM_EVENT_CHANCE,
    Round,
    TooManyEvents,
    flatten,
    place_random_events,
    select,
)
from app.rooms.settings import RoomSettings

# Stub rounds over the ``more_less`` type, so a room can be several rounds long before the
# modes that will make it so exist. Selection reads nothing but ``mode``.
STUBS = ("second_round", "third_round", "fourth_round", "fifth_round")


def _pack(name: str, mode: str, n: int) -> Pack:
    """Every question is a ``more_less`` whatever its mode, like the stub modes' are."""
    questions = tuple(
        {"id": f"q_{name}_{i}", "type": "more_less", "mode": mode, "payload": {}} for i in range(n)
    )
    return Pack(
        name=name, generated_at="2026-09-18T00:00:00Z", questions=questions, path=Path(name)
    )


PACKS = [
    _pack("a", "more_less", 30),
    _pack("b", "more_less", 30),
    *(_pack(stub, stub, 30) for stub in STUBS),
]


def _custom(n: int) -> list[dict[str, Any]]:
    """The host's own questions, as ``custom.envelopes`` would hand them over."""
    return [
        {"id": f"q_custom_{i}", "type": "multiple_choice", "mode": "custom", "source": "room"}
        for i in range(n)
    ]


def _settings(*modes: tuple[str, int], **overrides: Any) -> RoomSettings:
    """``_settings(("more_less", 5))`` -> a room of one five-question ``more_less`` round.

    No pack events unless a test asks for them, so the tests about rounds see only rounds.
    """
    entries = [{"mode": mode, "questions": questions} for mode, questions in modes]
    return RoomSettings(modes=entries, **{"random_events": False, **overrides})


def _questions(rounds: list[Round]) -> list[dict[str, Any]]:
    return [q for round_ in rounds for q in round_.questions]


def _events(rounds: list[Round]) -> list[tuple[int, int, dict[str, Any]]]:
    """Every event as ``(round number, position in that round, question)``."""
    return [
        (number, position, q)
        for number, round_ in enumerate(rounds)
        for position, q in enumerate(round_.questions)
        if "random_event" in q
    ]


def assert_the_four_rules(rounds: list[Round]) -> None:
    """Never the first round, never a round's first question, one per round, a new face."""
    events = _events(rounds)
    assert all(number > 0 for number, _, _ in events)
    assert all(position > 0 for _, position, _ in events)
    assert len({number for number, _, _ in events}) == len(events)
    faces = [q["random_event"] for _, _, q in events]
    assert len(set(faces)) == len(faces)
    assert set(faces) <= set(selection.RANDOM_EVENTS)
    # The round is still named for, and made of, its own mode around the event.
    for round_ in rounds:
        assert {q["mode"] for q in round_.questions if "random_event" not in q} == {round_.mode}


@pytest.fixture
def stubs() -> Iterator[tuple[str, ...]]:
    """The stub rounds, registered. ``RoomSettings`` only takes modes the registry knows."""
    for stub in STUBS:
        MODES[stub] = Mode(id=stub, type="more_less")
    yield STUBS
    for stub in STUBS:
        del MODES[stub]


# --- rounds ----------------------------------------------------------------------------


def test_count_without_replacement_and_only_chosen_modes() -> None:
    rounds = select(PACKS, [], _settings(("more_less", 50)), random.Random(1))
    got = _questions(rounds)
    assert len(got) == 50
    assert len({q["id"] for q in got}) == 50
    assert {q["mode"] for q in got} == {"more_less"}


def test_a_mode_is_a_round(stubs: tuple[str, ...]) -> None:
    """The whole rule: one round per mode, as long as that mode asked to be."""
    settings = _settings(("more_less", 8), ("second_round", 3))
    rounds = select(PACKS, [], settings, random.Random(1))
    assert [(r.mode, len(r.questions)) for r in rounds] == [("more_less", 8), ("second_round", 3)]
    # Every question in a round is that round's mode: what makes a round introducible.
    assert all({q["mode"] for q in r.questions} == {r.mode} for r in rounds)


def test_a_pool_is_a_mode_not_a_type(stubs: tuple[str, ...]) -> None:
    """The stub packs are ``more_less`` questions too, but none of them are the
    ``more_less`` mode's: asking for more than packs ``a`` and ``b`` hold gives a short
    round, never a question from a round that merely shares the answer shape."""
    rounds = select(PACKS, [], _settings(("more_less", 90)), random.Random(1))
    got = _questions(rounds)
    assert len(got) == 60
    assert {q["mode"] for q in got} == {"more_less"}


def test_one_mode_is_one_round() -> None:
    rounds = select(PACKS, [], _settings(("more_less", 20)), random.Random(1))
    assert [len(r.questions) for r in rounds] == [20]


def test_listed_order_plays_the_rounds_in_the_order_the_host_arranged(
    stubs: tuple[str, ...],
) -> None:
    """``mode_order = "listed"``, the default: what the host listed is what plays."""
    for seed in range(10):
        settings = _settings(("second_round", 2), ("more_less", 2))
        rounds = select(PACKS, [], settings, random.Random(seed))
        assert [r.mode for r in rounds] == ["second_round", "more_less"]


def test_random_order_shuffles_the_rounds(stubs: tuple[str, ...]) -> None:
    settings = _settings(("more_less", 2), ("second_round", 2), mode_order="random")
    orders = {
        tuple(r.mode for r in select(PACKS, [], settings, random.Random(seed)))
        for seed in range(20)
    }
    assert orders == {("more_less", "second_round"), ("second_round", "more_less")}


def test_fewer_available_than_asked_shortens_and_then_drops_rounds(
    stubs: tuple[str, ...],
) -> None:
    """A mode that has nothing to play gives no round: never an empty one."""
    settings = _settings(("more_less", 40), ("second_round", 5))
    rounds = select(PACKS[:1], [], settings, random.Random(1))  # 30 more_less, nothing else
    assert [(r.mode, len(r.questions)) for r in rounds] == [("more_less", 30)]
    assert all(r.questions for r in rounds)


def test_seeded_and_deterministic(stubs: tuple[str, ...]) -> None:
    settings = _settings(*((mode, 5) for mode in ("more_less", *STUBS[:3])), random_events=True)
    a = select(PACKS, _custom(2), settings, random.Random(7))
    b = select(PACKS, _custom(2), settings, random.Random(7))
    c = select(PACKS, _custom(2), settings, random.Random(8))
    assert a == b
    assert a != c


# --- the host's questions, as random events ----------------------------------------------


@pytest.mark.parametrize("random_events", [False, True])
def test_three_custom_questions_in_a_four_mode_room_take_three_rounds(
    stubs: tuple[str, ...], random_events: bool
) -> None:
    """T21 Accept, seeded and asserted: three rounds after the first, three questions, one
    each -- never the first round, never a round's first position, a new face each time,
    and in the order the host wrote them. Whether the packs may interrupt changes nothing:
    the host's questions have taken every slot there is."""
    custom = _custom(3)
    settings = _settings(
        *((mode, 4) for mode in ("more_less", *STUBS[:3])), random_events=random_events
    )
    positions = set()
    for seed in range(40):
        rounds = select(PACKS, custom, settings, random.Random(seed))
        assert [r.mode for r in rounds] == ["more_less", *STUBS[:3]]
        events = _events(rounds)
        assert [number for number, _, _ in events] == [1, 2, 3]
        assert [{k: v for k, v in q.items() if k != "random_event"} for _, _, q in events] == custom
        assert_the_four_rules(rounds)
        assert [len(r.questions) for r in rounds] == [4, 5, 5, 5]
        positions |= {position for _, position, _ in events}
    assert positions == {1, 2, 3, 4}, "an event lands anywhere after a round's first question"


def test_fewer_custom_questions_than_slots_spread_over_the_game(stubs: tuple[str, ...]) -> None:
    """Which rounds they take is drawn, but the host's order is kept."""
    settings = _settings(*((mode, 3) for mode in ("more_less", *STUBS)))
    taken = set()
    for seed in range(40):
        rounds = select(PACKS, _custom(2), settings, random.Random(seed))
        events = _events(rounds)
        assert [q["id"] for _, _, q in events] == ["q_custom_0", "q_custom_1"]
        assert_the_four_rules(rounds)
        taken.add(tuple(number for number, _, _ in events))
    assert len(taken) > 3
    assert all(0 not in pair for pair in taken)


def test_more_custom_questions_than_rounds_to_interrupt_is_refused(stubs: tuple[str, ...]) -> None:
    """The settings allow one per mode after the first; a mode with nothing to play gives
    no round, and so no slot. Dropping a question is the one thing not to do about it."""
    settings = _settings(("more_less", 3), ("second_round", 3))
    select(PACKS, _custom(1), settings, random.Random(1))
    with pytest.raises(TooManyEvents, match="1 custom questions, but this room only filled 1"):
        select(PACKS[:1], _custom(1), settings, random.Random(1))


def test_the_input_rounds_are_left_as_they_were(stubs: tuple[str, ...]) -> None:
    settings = _settings(("more_less", 3), ("second_round", 3))
    rounds = select(PACKS, [], settings, random.Random(1))
    before = [list(r.questions) for r in rounds]
    placed = place_random_events(rounds, _custom(1), {}, settings, random.Random(1))
    assert [r.questions for r in rounds] == before
    assert len(_questions(placed)) == 7


# --- pack events -----------------------------------------------------------------------


def test_pack_events_interrupt_from_a_mode_the_host_did_not_pick(stubs: tuple[str, ...]) -> None:
    """T21 Accept: no custom questions, and the packs still interrupt -- from the stub
    rounds nobody picked, never from the round being interrupted, never a repeat."""
    picked = ("more_less", *STUBS[:2])
    settings = _settings(*((mode, 5) for mode in picked), random_events=True)
    seen = 0
    for seed in range(40):
        rounds = select(PACKS, [], settings, random.Random(seed))
        assert_the_four_rules(rounds)
        for number, _, question in _events(rounds):
            assert question["mode"] != rounds[number].mode
            assert question["mode"] in STUBS[2:]
            seen += 1
        ids = [q["id"] for q in _questions(rounds)]
        assert len(set(ids)) == len(ids)
    assert seen > 0


def test_a_pack_event_falls_back_to_a_picked_mode_but_never_its_own(
    stubs: tuple[str, ...],
) -> None:
    """With every mode that has questions picked, an event is another round's question:
    another Drop Table question in the Drop Table round is a long round, not an event."""
    settings = _settings(*((mode, 5) for mode in ("more_less", *STUBS)), random_events=True)
    seen = 0
    for seed in range(40):
        rounds = select(PACKS, [], settings, random.Random(seed))
        assert_the_four_rules(rounds)
        for number, _, question in _events(rounds):
            assert question["mode"] != rounds[number].mode
            seen += 1
        ids = [q["id"] for q in _questions(rounds)]
        assert len(set(ids)) == len(ids), "an event repeated a question a round already had"
    assert seen > 0


def test_about_half_the_open_slots_get_a_pack_event(stubs: tuple[str, ...]) -> None:
    settings = _settings(("more_less", 5), ("second_round", 5), random_events=True)
    hits = sum(
        bool(_events(select(PACKS, [], settings, random.Random(seed)))) for seed in range(400)
    )
    assert abs(hits / 400 - PACK_RANDOM_EVENT_CHANCE) < 0.1


def test_the_host_fills_the_slots_before_the_packs_do(
    stubs: tuple[str, ...], monkeypatch: pytest.MonkeyPatch
) -> None:
    """With the chance at one, every slot is filled: the host's first, the packs' after."""
    monkeypatch.setattr(selection, "PACK_RANDOM_EVENT_CHANCE", 1.0)
    settings = _settings(*((mode, 3) for mode in ("more_less", *STUBS)), random_events=True)
    rounds = select(PACKS, _custom(2), settings, random.Random(3))
    events = _events(rounds)
    assert [number for number, _, _ in events] == [1, 2, 3, 4]
    assert sum(q["mode"] == "custom" for _, _, q in events) == 2
    assert_the_four_rules(rounds)


def test_no_face_is_seen_twice_even_when_the_roster_runs_short(
    stubs: tuple[str, ...], monkeypatch: pytest.MonkeyPatch
) -> None:
    """A slot with no face left stays empty; a host's question with none is refused."""
    monkeypatch.setattr(selection, "PACK_RANDOM_EVENT_CHANCE", 1.0)
    monkeypatch.setattr(selection, "RANDOM_EVENTS", ("genie",))
    settings = _settings(*((mode, 3) for mode in ("more_less", *STUBS)), random_events=True)
    rounds = select(PACKS, [], settings, random.Random(3))
    assert [q["random_event"] for _, _, q in _events(rounds)] == ["genie"]
    with pytest.raises(TooManyEvents, match="run out of faces"):
        select(PACKS, _custom(2), settings, random.Random(3))


def test_no_events_at_all_leaves_the_rounds_alone(stubs: tuple[str, ...]) -> None:
    settings = _settings(("more_less", 3), ("second_round", 3))
    rounds = select(PACKS, [], settings, random.Random(1))
    assert _events(rounds) == []
    assert [len(r.questions) for r in rounds] == [3, 3]


# --- flatten ---------------------------------------------------------------------------


def test_flatten_numbers_questions_by_round_in_play_order(stubs: tuple[str, ...]) -> None:
    settings = _settings(("more_less", 3), ("second_round", 4))
    rounds = select(PACKS, [], settings, random.Random(1))
    flat = flatten(rounds)
    assert [number for number, _ in flat] == [0, 0, 0, 1, 1, 1, 1]
    assert [q for _, q in flat] == _questions(rounds)


def test_an_event_carries_the_number_of_the_round_it_interrupts(stubs: tuple[str, ...]) -> None:
    """Which is what ``segments.py`` groups it back into that round by."""
    settings = _settings(("more_less", 3), ("second_round", 4))
    flat = flatten(select(PACKS, _custom(1), settings, random.Random(1)))
    assert [number for number, _ in flat] == [0, 0, 0, 1, 1, 1, 1, 1]
    (event,) = [(number, q) for number, q in flat if "random_event" in q]
    assert event[0] == 1
    assert event[1]["mode"] == "custom"
