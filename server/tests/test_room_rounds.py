"""A room groups its rounds once per question list, and every view reads that grouping."""

from collections.abc import Iterator
from time import monotonic, sleep
from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.rooms import segments
from tests.conftest import stub_mode
from tests.game_api import reseat, updated
from tests.test_end_round import rounds
from tests.test_lobby_setup import set_settings
from tests.test_rematch import finish, rematch


@pytest.fixture
def third_mode(app: FastAPI, client: TestClient) -> Iterator[str]:
    yield from stub_mode(app, "third_round")


@pytest.fixture
def groupings(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """How many times ``segments_of`` has run, as a one-item list the test reads."""
    calls = [0]
    original = segments.segments_of

    def counted(questions: Any) -> Any:
        calls[0] += 1
        return original(questions)

    monkeypatch.setattr(segments, "segments_of", counted)
    return calls


def test_rounds_are_grouped_once_per_start_and_rehydrate_and_never_per_frame(
    table, client, second_mode, evict, groupings
) -> None:
    game = table("Zezima", reveal_seconds=30, **rounds("more_less", second_mode))
    groupings[0] = 0

    game.start()
    game.opened(0)
    assert groupings[0] == 1

    game.skip()
    game.admin.take("question_closed")
    assert groupings[0] == 1

    zezima = game.players[0]
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        reseat(zezima, ws).take("welcome")
        assert groupings[0] == 1
    deadline = monotonic() + 5
    while game.room.players[UUID(zezima.id)].connected:
        assert monotonic() < deadline, "the disconnect never landed"
        sleep(0.005)
    assert groupings[0] == 1

    assert evict(game.code) is True
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        reseat(game.admin, ws).take("welcome")
    assert groupings[0] == 2


def test_after_a_rematch_the_lobby_and_the_next_game_show_the_new_plans_rounds(
    table, second_mode, third_mode
) -> None:
    game = table("Zezima", hide_rounds=True, reveal_seconds=30, **rounds("more_less", second_mode))
    finish(game)
    assert rematch(game)["room"]["rounds"] == 2

    three = rounds("more_less", second_mode, third_mode)
    del three["seconds"]
    lobby = set_settings(game.admin.ws, hide_rounds=True, random_event_frequency="less", **three)

    assert lobby["t"] == "room_updated"
    assert lobby["room"]["rounds"] == 3
    assert (lobby["room"]["segment"], lobby["room"]["played"]) == (None, [])
    assert lobby["room"]["estimated_seconds"] == game.room.plan.seconds
    game.start()
    playing = updated(game.admin, lambda m: m["room"]["status"] == "playing")
    assert playing["room"]["segment"] == {
        "mode": "more_less",
        "index": 0,
        "total": 3,
        "start": 0,
        "count": 2,
    }


def test_after_a_restart_mid_game_the_splash_names_the_next_round(
    table, client, second_mode, evict
) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        standings_seconds=30,
        splash=True,
        **rounds("more_less", second_mode),
    )
    game.start()
    game.splash()
    game.skip()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    assert evict(game.code) is True

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        welcome = admin.take("welcome")
        assert welcome["room"]["segment"] == {
            "mode": "more_less",
            "index": 0,
            "total": 2,
            "start": 0,
            "count": 2,
        }
        game.skip(admin)
        assert admin.take("question_open")["question"]["index"] == 1
        game.skip(admin)
        admin.take("question_closed")
        game.skip(admin)
        updated(admin, lambda m: m["room"]["phase"] == "standings")
        game.skip(admin)
        splash = game.splash(admin)
    assert splash["room"]["segment"] == {
        "mode": second_mode,
        "index": 1,
        "total": 2,
        "start": 2,
        "count": 2,
    }
