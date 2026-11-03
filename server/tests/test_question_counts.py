"""``GET /api/question-counts``: every question a room can draw, once, by round and by NPC."""

from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.daily import candidates
from app.http.question_counts import counts
from app.questions import vocab
from app.questions.packs import EVENT_MODE, Pack, load_packs
from app.random_events import RANDOM_EVENTS
from tests.packs import PACKS_DIR


def _question(ident: str, mode: str = "bestiary", **extra: Any) -> dict[str, Any]:
    return {"id": ident, "mode": mode, "type": "multiple_choice", "payload": {}, **extra}


def _pack(*questions: dict[str, Any], name: str = "stub") -> Pack:
    return Pack(name, None, questions, Path(f"{name}.json"))


def test_counts_rounds_and_npcs_once_each_in_registry_and_roster_order() -> None:
    packs = [
        _pack(
            _question("o1", "odd_one_out"),
            _question("b1"),
            _question("b2"),
            _question("e1", EVENT_MODE, random_event="reldo"),
            _question("e2", EVENT_MODE, random_event="bob"),
            _question("e3", EVENT_MODE, random_event="bob"),
            _question("custom", "custom"),
            _question("gone", "no_such_mode"),
        ),
        _pack(_question("stale", "more_less"), name="sample"),
    ]
    settings = Settings(_env_file=None, random_event_game_mode=True)
    assert counts(packs, settings, ()) == {
        "modes": {"bestiary": 2, "odd_one_out": 1},
        "random_events": {"bob": 2, "reldo": 1},
    }


def test_a_picture_this_instance_lacks_is_not_counted() -> None:
    shown = {**_question("shown", "pixel_hunt"), "payload": {"image": "item:1"}}
    missing = {**_question("missing", "pixel_hunt"), "payload": {"image": "item:2"}}
    packs = [_pack(shown, missing)]
    assert counts(packs, Settings(_env_file=None), {"item:1"})["modes"] == {"pixel_hunt": 1}


def test_the_shipped_packs_add_up_to_the_drawable_pool() -> None:
    vocab.load_all()
    packs = load_packs(PACKS_DIR)
    pictures = {q["payload"].get("image") for p in packs for q in p.questions}
    settings = Settings(_env_file=None, random_event_game_mode=True)
    result = counts(packs, settings, pictures)
    total = sum(result["modes"].values()) + sum(result["random_events"].values())
    assert total == len(candidates(packs, settings, pictures))
    assert "random_events_only" not in result["modes"]
    assert set(result["random_events"]) == set(RANDOM_EVENTS)


def test_the_endpoint_serves_the_loaded_packs(app: FastAPI, client: TestClient) -> None:
    app.state.packs[:] = [_pack(_question("b1"), _question("e1", EVENT_MODE, random_event="death"))]
    response = client.get("/api/question-counts")
    assert response.status_code == 200
    assert response.json() == {"modes": {"bestiary": 1}, "random_events": {"death": 1}}
