"""``rooms/selection.py`` contract: pure, seeded, without replacement, one round per mode.

T22 Accept, the selection half: at ``default`` one mode of 10 questions plays 11, and
``less`` and ``more`` give the counts in phase2.md's table; seeded, no two events share a
window of N and none is a round's or the game's first question; a one-mode room gets
events; a custom question's named NPC is the one that asks it, and two naming one NPC are
both honoured; seeded over many rooms, no drawn face repeats while an unused one is left,
and none appears twice running; a room whose slots outnumber the faces repeats the least
used; a pack event never shares its question with another event.
"""

import random
from collections import Counter
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from app.modes import MODES, Mode
from app.questions.packs import Pack
from app.rooms import selection
from app.rooms.selection import Round, TooManyEvents, flatten, place_random_events, select
from app.rooms.settings import EVENT_EVERY, RoomSettings

# Stub rounds over the ``more_less`` type, so a room can be several rounds long before the
# modes that will make it so exist. Selection reads nothing but ``mode``.
STUBS = ("second_round", "third_round", "fourth_round", "fifth_round")
# NPCs with questions of their own in ``EVENT_PACKS``: fewer than the roster, as today.
ASKERS = ("sandwich_lady", "dr_jekyll", "bob", "death", "jane", "krystilia")


def _pack(name: str, mode: str, n: int) -> Pack:
    """Every question is a ``more_less`` whatever its mode, like the stub modes' are."""
    questions = tuple(
        {"id": f"q_{name}_{i}", "type": "more_less", "mode": mode, "payload": {}} for i in range(n)
    )
    return Pack(
        name=name, generated_at="2026-09-18T00:00:00Z", questions=questions, path=Path(name)
    )


def _event_pack(npc: str, types: tuple[str, ...]) -> Pack:
    """An NPC's file as ``load_packs`` hands it over: its NPC stamped on every question."""
    questions = tuple(
        {
            "id": f"q_{npc}_{i}",
            "type": type_,
            "mode": "random_event",
            "payload": {},
            "random_event": npc,
        }
        for i, type_ in enumerate(types)
    )
    return Pack(
        name="random_events", generated_at=None, questions=questions, path=Path(f"{npc}.json")
    )


PACKS = [
    _pack("a", "more_less", 60),
    _pack("b", "more_less", 60),
    *(_pack(stub, stub, 30) for stub in STUBS),
]
# Each NPC has as many four-button questions as ones of the rounds' own type.
EVENT_PACKS = [_event_pack(npc, ("more_less", "multiple_choice") * 5) for npc in ASKERS]


def _custom(n: int, *named: str | None) -> list[dict[str, Any]]:
    """The host's own questions, as ``custom.envelopes`` would hand them over.

    ``named`` gives the first few questions an NPC each; ``None`` leaves one to the draw.
    """
    questions: list[dict[str, Any]] = []
    for i in range(n):
        question = {
            "id": f"q_custom_{i}",
            "type": "multiple_choice",
            "mode": "custom",
            "source": "room",
        }
        if i < len(named) and named[i] is not None:
            question["random_event"] = named[i]
        questions.append(question)
    return questions


def _settings(*modes: tuple[str, int], **overrides: Any) -> RoomSettings:
    """``_settings(("more_less", 5))`` -> a room of one five-question ``more_less`` round."""
    entries = [{"mode": mode, "questions": questions} for mode, questions in modes]
    return RoomSettings(modes=entries, **overrides)


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


def _faces(rounds: list[Round]) -> list[str]:
    return [q["random_event"] for _, _, q in _events(rounds)]


def assert_where_events_go(rounds: list[Round], every: int) -> None:
    """One per window of ``every`` round questions, and always inside a round.

    Inside means a question of the same round on either side of it: so never the game's
    first question, never a round's first, and never followed by one either -- the splash
    that introduces a round never follows an event.
    """
    windows: list[int] = []
    played = 0
    for round_ in rounds:
        for position, question in enumerate(round_.questions):
            if "random_event" not in question:
                played += 1
                continue
            before, after = round_.questions[:position], round_.questions[position + 1 :]
            assert before and "random_event" not in before[-1], "an event starts a round"
            assert after and "random_event" not in after[0], "an event ends a round"
            windows.append((played - 1) // every)
        # The round is still named for, and made of, its own mode around its events.
        assert {q["mode"] for q in round_.questions if "random_event" not in q} == {round_.mode}
    assert len(set(windows)) == len(windows), "two events in one window"


def assert_the_faces_are_fair(faces: list[str], pool: tuple[str, ...]) -> None:
    """No face twice running, and none again while one of ``pool`` has not been seen."""
    seen: set[str] = set()
    for previous, face in zip([None, *faces], faces, strict=False):
        assert face != previous, f"{face} twice running"
        if face in seen:
            assert seen >= set(pool), f"{face} again with {set(pool) - seen} unseen"
        seen.add(face)


@pytest.fixture
def stubs() -> Iterator[tuple[str, ...]]:
    """The stub rounds, registered. ``RoomSettings`` only takes modes the registry knows."""
    for stub in STUBS:
        MODES[stub] = Mode(id=stub, types=frozenset({"more_less"}))
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
    rounds = select(PACKS, [], _settings(("more_less", 150)), random.Random(1))
    got = _questions(rounds)
    assert len(got) == 120
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
    settings = _settings(("more_less", 70), ("second_round", 5))
    rounds = select(PACKS[:1], [], settings, random.Random(1))  # 60 more_less, nothing else
    assert [(r.mode, len(r.questions)) for r in rounds] == [("more_less", 60)]
    assert all(r.questions for r in rounds)


def test_seeded_and_deterministic(stubs: tuple[str, ...]) -> None:
    settings = _settings(
        *((mode, 5) for mode in ("more_less", *STUBS[:3])), random_event_frequency="more"
    )
    packs = PACKS + EVENT_PACKS
    a = select(packs, _custom(2), settings, random.Random(7))
    b = select(packs, _custom(2), settings, random.Random(7))
    c = select(packs, _custom(2), settings, random.Random(8))
    assert a == b
    assert a != c


# --- how often, and where ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("frequency", "round_questions", "played"),
    [
        ("less", 10, 10),
        ("default", 10, 11),
        ("more", 10, 12),
        ("less", 40, 42),
        ("default", 40, 44),
        ("more", 40, 48),
    ],
)
def test_the_frequency_adds_events_on_top_of_the_rounds(
    stubs: tuple[str, ...], frequency: str, round_questions: int, played: int
) -> None:
    """phase2.md's table: one event per 20, 10 or 5 round questions, added, not taken out.

    Forty questions are four rounds of ten, so the windows cross from one round into the
    next and the count still comes out the same.
    """
    modes = ("more_less", *STUBS[:3]) if round_questions == 40 else ("more_less",)
    settings = _settings(
        *((mode, round_questions // len(modes)) for mode in modes),
        random_event_frequency=frequency,
    )
    assert round_questions + settings.random_event_slots == played
    for seed in range(20):
        rounds = select(PACKS + EVENT_PACKS, [], settings, random.Random(seed))
        assert len(_questions(rounds)) == played


@pytest.mark.parametrize("frequency", ["less", "default", "more"])
def test_no_two_events_share_a_window_and_every_one_is_inside_a_round(
    stubs: tuple[str, ...], frequency: str
) -> None:
    """Seeded over many rooms, uneven rounds included, so a window often spans two."""
    settings = _settings(
        ("more_less", 13),
        ("second_round", 4),
        ("third_round", 17),
        ("fourth_round", 6),
        random_event_frequency=frequency,
    )
    for seed in range(100):
        rounds = select(PACKS + EVENT_PACKS, _custom(1), settings, random.Random(seed))
        assert len(_events(rounds)) == 40 // EVENT_EVERY[frequency]
        assert_where_events_go(rounds, EVENT_EVERY[frequency])


def test_a_one_mode_room_gets_events() -> None:
    """One per round after the first gave a one-mode room none at all."""
    settings = _settings(("more_less", 10))
    positions = set()
    for seed in range(200):
        rounds = select(PACKS + EVENT_PACKS, [], settings, random.Random(seed))
        (event,) = _events(rounds)
        assert_where_events_go(rounds, 10)
        positions.add(event[1])
    # Anywhere from after the round's first question to before its last.
    assert positions == set(range(1, 10))


def test_a_window_of_one_question_rounds_has_nowhere_to_put_an_event(
    stubs: tuple[str, ...],
) -> None:
    """Every question in it is its round's last, and an event is never a round's last."""
    settings = _settings(
        *((mode, 1) for mode in ("more_less", *STUBS)), random_event_frequency="more"
    )
    rounds = select(PACKS + EVENT_PACKS, [], settings, random.Random(1))
    assert _events(rounds) == []


@pytest.mark.parametrize(
    "lengths",
    [
        (1, 1, 1, 1, 1),  # one window, every question in it its round's last
        (6, 1, 1, 1, 1),  # the first window has room, the second none
        (2, 1, 1, 1, 1),  # the first question is not its round's last
        (1, 1, 1, 1, 2),  # nor is the last round's first
        (10, 10),
    ],
)
def test_the_settings_promise_exactly_the_slots_the_room_gets(
    stubs: tuple[str, ...], lengths: tuple[int, ...]
) -> None:
    """Counted by the rounds' shape, not their total, so a host is never promised a slot
    that a window of one-question rounds cannot hold."""
    modes = ("more_less", *STUBS)[: len(lengths)]
    settings = _settings(*zip(modes, lengths, strict=True), random_event_frequency="more")
    for seed in range(20):
        rounds = select(PACKS + EVENT_PACKS, [], settings, random.Random(seed))
        assert len(_events(rounds)) == settings.random_event_slots


# --- what: the host's questions, then the NPCs' own ----------------------------------------


def test_the_hosts_questions_take_random_slots_in_the_order_they_were_written(
    stubs: tuple[str, ...],
) -> None:
    settings = _settings(*((mode, 10) for mode in ("more_less", *STUBS[:3])))
    taken = set()
    for seed in range(40):
        rounds = select(PACKS + EVENT_PACKS, _custom(2), settings, random.Random(seed))
        events = _events(rounds)
        assert len(events) == 4
        assert [q["id"] for _, _, q in events if q["mode"] == "custom"] == [
            "q_custom_0",
            "q_custom_1",
        ]
        taken.add(tuple(i for i, (_, _, q) in enumerate(events) if q["mode"] == "custom"))
    assert len(taken) == 6, "every pair of the four slots was drawn at least once"


def test_more_custom_questions_than_slots_is_refused(stubs: tuple[str, ...]) -> None:
    """The settings count the questions the host asked for; a pool that runs short gives
    fewer, and so fewer slots. Dropping a question is the one thing not to do about it."""
    settings = _settings(("more_less", 10), ("second_round", 10))
    select(PACKS, _custom(2), settings, random.Random(1))
    with pytest.raises(TooManyEvents, match="2 custom questions, but this room drew only 10"):
        select(PACKS[:1], _custom(2), settings, random.Random(1))


def test_every_slot_the_host_leaves_takes_an_npcs_own_question(stubs: tuple[str, ...]) -> None:
    """No chance any more: the frequency is the count, and the NPCs fill it."""
    settings = _settings(("more_less", 10), ("second_round", 10), random_event_frequency="more")
    for seed in range(40):
        rounds = select(PACKS + EVENT_PACKS, _custom(1), settings, random.Random(seed))
        events = _events(rounds)
        assert len(events) == 4
        assert sorted(q["mode"] for _, _, q in events) == ["custom", *["random_event"] * 3]
        for _, _, question in events:
            if question["mode"] == "random_event":
                assert question["random_event"] in ASKERS
                assert question["id"].startswith(f"q_{question['random_event']}_")


def test_a_pack_event_prefers_a_type_other_than_the_rounds(stubs: tuple[str, ...]) -> None:
    """Every NPC has both; the rounds are all ``more_less``, so every event is not."""
    settings = _settings(
        *((mode, 10) for mode in ("more_less", *STUBS[:3])), random_event_frequency="more"
    )
    for seed in range(40):
        rounds = select(PACKS + EVENT_PACKS, [], settings, random.Random(seed))
        assert {q["type"] for _, _, q in _events(rounds)} == {"multiple_choice"}


def test_a_pack_event_prefers_a_type_the_round_does_not_play_at_all(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A round of two types is interrupted by neither, while a third is on offer."""
    both = frozenset({"more_less", "multiple_choice"})
    monkeypatch.setitem(MODES, "more_less", Mode(id="more_less", types=both))
    packs = PACKS + [
        _event_pack(npc, ("more_less", "multiple_choice", "closest_number") * 3) for npc in ASKERS
    ]
    settings = _settings(("more_less", 20), random_event_frequency="more")
    for seed in range(20):
        rounds = select(packs, [], settings, random.Random(seed))
        assert {q["type"] for _, _, q in _events(rounds)} == {"closest_number"}


def test_a_pack_event_takes_the_rounds_own_type_rather_than_leave_the_slot_empty() -> None:
    packs = PACKS + [_event_pack(npc, ("more_less",) * 3) for npc in ASKERS]
    rounds = select(packs, [], _settings(("more_less", 20)), random.Random(1))
    assert [q["type"] for _, _, q in _events(rounds)] == ["more_less", "more_less"]


def test_a_slot_stays_empty_only_when_no_question_qualifies(stubs: tuple[str, ...]) -> None:
    """One NPC with one question: it asks once, and the other slots have nobody."""
    settings = _settings(("more_less", 10), ("second_round", 10), random_event_frequency="more")
    rounds = select(
        PACKS + [_event_pack("death", ("multiple_choice",))], [], settings, random.Random(1)
    )
    assert _faces(rounds) == ["death"]
    assert [len(r.questions) for r in rounds] in ([11, 10], [10, 11])


def test_no_npc_questions_at_all_leaves_the_rounds_alone(stubs: tuple[str, ...]) -> None:
    settings = _settings(("more_less", 10), ("second_round", 10))
    rounds = select(PACKS, [], settings, random.Random(1))
    assert _events(rounds) == []
    assert [len(r.questions) for r in rounds] == [10, 10]


def test_a_pack_event_never_repeats_a_question(stubs: tuple[str, ...]) -> None:
    """Sixty NPC questions, forty-eight slots over eighty rounds questions: all different."""
    settings = _settings(
        *((mode, 20) for mode in ("more_less", *STUBS[:3])), random_event_frequency="more"
    )
    for seed in range(20):
        rounds = select(PACKS + EVENT_PACKS, [], settings, random.Random(seed))
        ids = [q["id"] for q in _questions(rounds)]
        assert len(_events(rounds)) == 16
        assert len(set(ids)) == len(ids)


# --- who ---------------------------------------------------------------------------------


def test_a_named_npc_asks_its_hosts_question_and_two_may_name_the_same_one(
    stubs: tuple[str, ...],
) -> None:
    """Even twice running: that is the host's choice, and the server keeps it."""
    settings = _settings(("more_less", 10), ("second_round", 10))
    for seed in range(20):
        rounds = select(
            PACKS + EVENT_PACKS, _custom(2, "death", "death"), settings, random.Random(seed)
        )
        assert _faces(rounds) == ["death", "death"]


def test_a_drawn_face_leaves_the_named_ones_until_everyone_has_been_seen(
    stubs: tuple[str, ...],
) -> None:
    """The host named Death, so nobody draws Death while an NPC is still unseen.

    Four slots and six NPCs: the three drawn faces always have someone unseen to go to.
    """
    settings = _settings(*((mode, 10) for mode in ("more_less", *STUBS[:3])))
    for seed in range(40):
        rounds = select(PACKS + EVENT_PACKS, _custom(1, "death"), settings, random.Random(seed))
        faces = _faces(rounds)
        assert faces.count("death") == 1
        custom = next(q for _, _, q in _events(rounds) if q["mode"] == "custom")
        assert custom["random_event"] == "death"


def test_drawn_faces_never_repeat_while_an_unseen_one_is_left(stubs: tuple[str, ...]) -> None:
    """Seeded over many rooms, and more slots than NPCs with questions, so they must repeat."""
    settings = _settings(
        *((mode, 12) for mode in ("more_less", *STUBS[:3])), random_event_frequency="more"
    )
    for seed in range(100):
        rounds = select(PACKS + EVENT_PACKS, [], settings, random.Random(seed))
        faces = _faces(rounds)
        assert len(faces) == 9 > len(ASKERS)
        assert_the_faces_are_fair(faces, ASKERS)


def test_more_slots_than_faces_repeats_the_least_used(
    stubs: tuple[str, ...], monkeypatch: pytest.MonkeyPatch
) -> None:
    """The host's unnamed questions draw from the whole roster; make it three long."""
    monkeypatch.setattr(selection, "RANDOM_EVENTS", ("genie", "death", "jane"))
    settings = _settings(
        *((mode, 10) for mode in ("more_less", *STUBS[:3])), random_event_frequency="more"
    )
    for seed in range(40):
        faces = _faces(select(PACKS, _custom(8), settings, random.Random(seed)))
        assert len(faces) == 8
        assert_the_faces_are_fair(faces, ("genie", "death", "jane"))
        counts = Counter(faces)
        assert max(counts.values()) - min(counts.values()) <= 1


def test_a_hosts_unnamed_question_may_be_asked_by_an_npc_with_no_questions_yet(
    stubs: tuple[str, ...],
) -> None:
    settings = _settings(
        *((mode, 20) for mode in ("more_less", *STUBS[:3])), random_event_frequency="more"
    )
    faces: set[str] = set()
    for seed in range(20):
        rounds = select(PACKS, _custom(16), settings, random.Random(seed))
        faces |= set(_faces(rounds))
    assert faces == set(selection.RANDOM_EVENTS)


# --- rooms stored before T22 ---------------------------------------------------------------


def test_a_room_stored_with_random_events_true_reads_as_default() -> None:
    settings = RoomSettings.model_validate(
        {"modes": [{"mode": "more_less", "questions": 10}], "random_events": True}
    )
    assert settings.random_event_frequency == "default"
    assert "random_events" not in settings.model_dump()


def test_the_input_rounds_are_left_as_they_were(stubs: tuple[str, ...]) -> None:
    settings = _settings(("more_less", 10), ("second_round", 10))
    rounds = select(PACKS, [], settings, random.Random(1))
    before = [list(r.questions) for r in rounds]
    placed = place_random_events(rounds, _custom(1), [], settings, random.Random(1))
    assert [r.questions for r in rounds] == before
    assert len(_questions(placed)) == 21


# --- flatten ---------------------------------------------------------------------------


def test_flatten_numbers_questions_by_round_in_play_order(stubs: tuple[str, ...]) -> None:
    settings = _settings(("more_less", 3), ("second_round", 4))
    rounds = select(PACKS, [], settings, random.Random(1))
    flat = flatten(rounds)
    assert [number for number, _ in flat] == [0, 0, 0, 1, 1, 1, 1]
    assert [q for _, q in flat] == _questions(rounds)


def test_an_event_carries_the_number_of_the_round_it_interrupts(stubs: tuple[str, ...]) -> None:
    """Which is what ``segments.py`` groups it back into that round by."""
    settings = _settings(("more_less", 3), ("second_round", 7))
    flat = flatten(select(PACKS, _custom(1), settings, random.Random(1)))
    assert len(flat) == 11
    numbers = [number for number, _ in flat]
    assert numbers == sorted(numbers)
    (at,) = [i for i, (_, q) in enumerate(flat) if "random_event" in q]
    assert flat[at][1]["mode"] == "custom"
    assert flat[at - 1][0] == flat[at][0] == flat[at + 1][0]
