"""``rooms/duration.py``: the minutes Create and the lobby show, as a ceiling."""

import math
import random

from fastapi.testclient import TestClient

from app.modes import extra_answer_seconds
from app.questions.packs import load_packs, mode_questions
from app.questions.types import TYPES, answer_seconds, reveal_seconds
from app.rooms import selection
from app.rooms.duration import (
    NAMES_SECONDS,
    SPLASH_SECONDS,
    game_seconds,
    question_seconds,
    typical_seconds,
)
from app.rooms.hold import hold_seconds, payload_hold, typed_lines
from app.rooms.settings import NewRoomSettings
from tests.packs import PACKS_DIR
from tests.rooms_api import create, hello

# No prompt to type in, so it holds for no time at all, but in ScapeRune.
OPTIONS = {"options": ["a", "b", "c", "d"]}
MORE_LESS = {
    "metric": "ge_price",
    "direction": "more",
    "options": [
        {"subject": {"name": "Abyssal whip"}, "value": 2},
        {"subject": {"name": "Rune"}, "value": 1},
    ],
    "answer_index": 0,
    "as_of": "2026-09-18",
}
# The host's ask and the stem typed in, a pause after each, rounded up to whole seconds.
MORE_LESS_HOLD = 5


def test_a_question_is_its_full_time_to_answer_and_its_reveal() -> None:
    assert question_seconds("multiple_choice", OPTIONS, "run") == 18 + 6
    assert question_seconds("more_less", MORE_LESS, "walk") == MORE_LESS_HOLD + 13 + 6


def test_a_question_adds_the_hold_it_types_in_for_before_its_answer_time() -> None:
    prompted = {**OPTIONS, "prompt": "Which boss drops the Tanzanite fang?"}
    held = hold_seconds(typed_lines("multiple_choice", "", prompted, False), False)
    assert held > 0
    assert question_seconds("multiple_choice", prompted, "run") == math.ceil(held) + 18 + 6
    as_event = hold_seconds(typed_lines("multiple_choice", "", prompted, True), True)
    assert question_seconds("multiple_choice", prompted, "run", event=True) == (
        math.ceil(as_event) + 18 + 6
    )


def test_a_payload_this_build_cannot_draw_holds_for_nothing_rather_than_failing() -> None:
    """The loop voids such a question at its open, and the lobby's views carry the estimate."""
    assert question_seconds("more_less", {}, "walk") == 13 + 6


def test_a_mode_adds_its_extra_answer_time_before_the_pace() -> None:
    # ScapeRune types its prompt line by line, an empty one included.
    held = math.ceil(payload_hold("multiple_choice", OPTIONS, "scaperune", False))
    assert question_seconds("multiple_choice", OPTIONS, "run", "scaperune") == held + 30 + 6
    assert question_seconds("multiple_choice", OPTIONS, "walk", "scaperune") == held + 38 + 8
    assert question_seconds("multiple_choice", OPTIONS, "run", "who_said_that") == 18 + 6


def test_typical_seconds_averages_a_pool_per_pace() -> None:
    pool = [
        {"type": "more_less", "payload": MORE_LESS},
        {"type": "multiple_choice", "payload": OPTIONS},
    ]
    assert typical_seconds(pool) == {"walk": 27.5, "run": 22.0, "teleport": 18.0}
    assert typical_seconds([]) is None


def test_a_game_adds_a_splash_per_round_and_standings_between_rounds() -> None:
    questions = [("more_less", MORE_LESS, "more_less", False)] * 3 + [
        ("multiple_choice", OPTIONS, "bestiary", False)
    ]
    more_less = MORE_LESS_HOLD + 15
    assert game_seconds(questions, 2, "run", 10) == 3 * more_less + 24 + 2 * SPLASH_SECONDS + 10
    assert game_seconds(questions[:1], 1, "run", 30) == more_less + SPLASH_SECONDS


def test_naming_wrong_answers_adds_its_second_to_every_question() -> None:
    questions = [("more_less", MORE_LESS, "more_less", False)] * 3
    named = game_seconds(questions, 1, "run", 10, names=True)
    assert named == game_seconds(questions, 1, "run", 10) + 3 * NAMES_SECONDS


def test_api_modes_gives_each_mode_its_pack_questions_typical_seconds(client: TestClient) -> None:
    packs = client.app.state.packs
    modes = {mode["id"]: mode["seconds"] for mode in client.get("/api/modes").json()}
    assert modes["more_less"] == {
        pace: MORE_LESS_HOLD + seconds
        for pace, seconds in {"walk": 19.0, "run": 15.0, "teleport": 12.0}.items()
    }
    assert modes["random_event"] == typical_seconds(mode_questions(packs, "random_event"))
    assert modes["bestiary"] == typical_seconds(mode_questions(packs, "bestiary"))
    assert modes["custom"] is None


def test_the_lobby_is_sent_the_estimate_of_the_questions_it_holds(client: TestClient) -> None:
    code, admin = create(
        client,
        modes=[{"mode": "more_less", "questions": 3}],
        pace="teleport",
        random_event_frequency="less",
    )
    with client.websocket_connect(f"/ws/{code}") as ws:
        room = hello(ws, admin["session"])["room"]
    assert (
        room["estimated_seconds"] == 3 * (MORE_LESS_HOLD + 8 + 4 + NAMES_SECONDS) + SPLASH_SECONDS
    )


def test_the_estimate_leaves_the_names_second_out_when_names_are_off(client: TestClient) -> None:
    code, admin = create(
        client,
        modes=[{"mode": "more_less", "questions": 3}],
        pace="teleport",
        random_event_frequency="less",
        name_wrong_answers=False,
    )
    with client.websocket_connect(f"/ws/{code}") as ws:
        room = hello(ws, admin["session"])["room"]
    assert room["estimated_seconds"] == 3 * (MORE_LESS_HOLD + 8 + 4) + SPLASH_SECONDS


def test_the_estimate_covers_a_game_in_which_every_question_runs_its_full_time() -> None:
    """architecture.md section 3: a game's minutes are a ceiling. Summed here the way the loop
    waits: each question's hold before its answer time starts, that time, its reveal, then
    a splash per round and the standings between rounds."""
    packs = load_packs(PACKS_DIR)
    settings = NewRoomSettings(
        modes=[{"mode": m} for m in ("more_less", "bestiary", "who_said_that", "scaperune")],
        mode_order="listed",
    )
    rounds = selection.select(packs, (), settings, random.Random(0))
    questions = [q for _, q in selection.flatten(rounds)]
    estimate = game_seconds(
        [
            (q["type"], q["payload"], q["mode"], q.get("random_event") is not None)
            for q in questions
        ],
        len(rounds),
        settings.pace,
        settings.standings_seconds,
        settings.name_wrong_answers,
    )
    names = NAMES_SECONDS if settings.name_wrong_answers else 0
    waited = 0.0
    for q in questions:
        event = q.get("random_event") is not None
        view = TYPES[q["type"]].client_view(q["payload"])
        waited += hold_seconds(typed_lines(q["type"], q["mode"], view, event), event)
        extra = extra_answer_seconds(q["mode"])
        waited += answer_seconds(q["type"], q["payload"], settings.pace, extra)
        waited += reveal_seconds(q["type"], q["payload"], settings.pace) + names
    waited += SPLASH_SECONDS * len(rounds) + settings.standings_seconds * (len(rounds) - 1)
    assert estimate >= waited, f"the game runs {waited - estimate:.0f}s past its ceiling"
