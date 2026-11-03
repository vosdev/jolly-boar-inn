"""Random Events Only: a round of the NPCs' questions, offered only where the instance says so.

Selection is tested with stub packs in ``test_selection.py``; here the flag, the endpoints it
guards, and a room created with the mode read back from the database.
"""

import random
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.modes import MODES, offered
from app.questions.packs import load_packs
from tests.packs import PACKS_DIR
from tests.rooms_api import begin, create

MODE = "random_events_only"
SEED = 0
PACKS = load_packs(PACKS_DIR)


@pytest.fixture
def on(test_db_dsn: str, dist: Path) -> Iterator[TestClient]:
    """An app on a server that has switched the mode on."""
    settings = Settings(
        _env_file=None,
        database_url=test_db_dsn,
        packs_dir=PACKS_DIR,
        random_event_game_mode=True,
    )
    with TestClient(create_app(settings, dist)) as client:
        yield client


def _create(client: TestClient, **settings: Any) -> Any:
    return client.post(
        "/api/rooms",
        json={"returning": False, "display_name": "Admin", "settings": settings},
    )


def test_every_gating_setting_is_a_real_setting() -> None:
    for mode in MODES.values():
        assert mode.setting is None or mode.setting in Settings.model_fields, mode.id
        assert mode.pool is None or mode.pool in MODES, mode.id


def test_the_mode_is_not_offered_unless_switched_on() -> None:
    assert MODE not in [m.id for m in offered(Settings(_env_file=None), PACKS)]
    switched_on = Settings(_env_file=None, random_event_game_mode=True)
    assert MODE in [m.id for m in offered(switched_on, PACKS)]


def test_off_it_is_left_out_of_the_create_form(client: TestClient) -> None:
    assert MODE not in [m["id"] for m in client.get("/api/modes").json()]


def test_on_the_create_form_gets_its_pace(on: TestClient) -> None:
    entry = next(m for m in on.get("/api/modes").json() if m["id"] == MODE)
    assert entry["types"] == [
        "closest_number",
        "free_text",
        "matching",
        "multiple_choice",
        "number_slider",
        "ordering",
        "pick_all_that_apply",
        "pick_from_list",
    ]
    assert entry["questions"] == {"default": 10, "min": 1, "max": 20}


def test_off_a_room_asking_for_it_is_refused(client: TestClient, db) -> None:
    response = _create(client, modes=[{"mode": MODE}])
    assert response.status_code == 403
    assert response.json()["code"] == "mode_not_offered"
    assert db("select count(*) as n from rooms")[0]["n"] == 0


def test_it_is_refused_before_the_limiter_counts_the_attempt(client: TestClient) -> None:
    for _ in range(client.app.state.settings.rooms_per_ip_per_hour + 1):
        assert _create(client, modes=[{"mode": MODE}]).status_code == 403
    code, _ = create(client, modes=[{"mode": "more_less", "questions": 3}])
    assert code


def test_a_room_of_it_plays_npc_questions_in_one_round(on: TestClient, db) -> None:
    response = _create(on, modes=[{"mode": MODE, "questions": 12}], random_event_frequency="more")
    assert response.status_code == 201, response.text
    body = response.json()
    begin(on, body["code"].upper(), body)
    room = on.app.state.rooms.rooms[body["code"].upper()]
    assert [(s.mode, s.count) for s in room.segments] == [(MODE, 14)]
    rows = db("select mode, round, random_event from questions order by position")
    assert len(rows) == 14  # twelve, and the two events ``more`` adds to twelve
    assert {row["round"] for row in rows} == {0}
    assert all(row["random_event"] is not None for row in rows)
    assert [row["mode"] for row in rows].count(MODE) == 12
    assert {row["mode"] for row in rows} <= {MODE, "random_event"}
    assert rows[0]["mode"] == MODE


def test_the_round_is_capped_at_twenty(on: TestClient) -> None:
    assert _create(on, modes=[{"mode": MODE, "questions": 21}]).status_code == 422
    assert _create(on, modes=[{"mode": MODE, "questions": 20}]).status_code == 201


def test_a_second_round_can_not_reuse_the_questions_the_events_took(on: TestClient, db) -> None:
    _create(on, modes=[{"mode": MODE, "questions": 20}], random_event_frequency="more")
    ids = [row["question_id"] for row in db("select question_id from questions")]
    assert len(ids) == len(set(ids))


def test_a_round_of_it_plays_through_every_question_type(table, app) -> None:
    """The pool mixes three answer shapes, so the one-question round every mode gets in
    ``test_game.py`` would test whichever the draw landed on."""
    # An unseeded draw of 20 from the pack sometimes misses a type; this seed's hits all three.
    app.state.rooms.rng = random.Random(SEED)
    game = table("Zezima", "Woox", modes=[MODE], questions=20, seconds=10)
    zezima, woox = game.players
    game.start()
    questions = game.room.questions
    # The pool's one ``pick_all_that_apply`` may or may not be drawn; its own end-to-end
    # test is in ``test_pick_all_that_apply.py``.
    assert {q.type for q in questions} >= {"multiple_choice", "free_text", "closest_number"}
    for index in range(len(questions)):
        game.opened(index)
        game.answer(zezima, index, game.right(index))
        zezima.take("answer_ack")
        game.answer(woox, index, game.wrong(index))
        woox.take("answer_ack")
        game.skip()
        closed = game.admin.take("question_closed")
        assert closed["results"][zezima.id]["correct"] is True
        assert closed["results"][woox.id]["points"] <= closed["results"][zezima.id]["points"]
        if index + 1 < len(questions):
            game.skip()
    finished = game.admin.take("game_finished")
    assert finished["standings"][0]["display_name"] == "Zezima"
