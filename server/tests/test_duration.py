"""``rooms/duration.py``: the minutes Create and the lobby show, as a ceiling."""

from fastapi.testclient import TestClient

from app.questions.packs import mode_questions
from app.rooms.duration import SPLASH_SECONDS, game_seconds, question_seconds, typical_seconds
from tests.rooms_api import create, hello

OPTIONS = {"options": ["a", "b", "c", "d"]}


def test_a_question_is_its_full_time_to_answer_and_its_reveal() -> None:
    assert question_seconds("multiple_choice", OPTIONS, "run") == 18 + 6
    assert question_seconds("more_less", {}, "walk") == 13 + 6


def test_typical_seconds_averages_a_pool_per_pace() -> None:
    pool = [{"type": "more_less", "payload": {}}, {"type": "multiple_choice", "payload": OPTIONS}]
    assert typical_seconds(pool) == {"walk": 25.0, "run": 19.5, "teleport": 15.5}
    assert typical_seconds([]) is None


def test_a_game_adds_a_splash_per_round_and_standings_between_rounds() -> None:
    questions = [("more_less", {})] * 3 + [("multiple_choice", OPTIONS)]
    assert game_seconds(questions, 2, "run", 10) == 3 * 15 + 24 + 2 * SPLASH_SECONDS + 10
    assert game_seconds(questions[:1], 1, "run", 30) == 15 + SPLASH_SECONDS


def test_api_modes_gives_each_mode_its_pack_questions_typical_seconds(client: TestClient) -> None:
    packs = client.app.state.packs
    modes = {mode["id"]: mode["seconds"] for mode in client.get("/api/modes").json()}
    assert modes["more_less"] == {"walk": 19.0, "run": 15.0, "teleport": 12.0}
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
    assert room["estimated_seconds"] == 3 * (8 + 4) + SPLASH_SECONDS
