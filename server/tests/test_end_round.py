"""``end_round``: the host cuts a round short, voiding what is open, and the room moves on
to that round's standings and then the next round. In the last round it is ``end_game``."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import stub_mode
from tests.game_api import Game, Seat, assert_memory_matches_db, closed_after, reseat, updated


@pytest.fixture
def third_mode(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A third playable mode, for a round that is neither the first nor the last."""
    yield from stub_mode(app, "third_round")


def rounds(*modes: str, questions: int = 2) -> dict[str, Any]:
    """Rounds of ten-second questions, played in the order given."""
    return {
        "seconds": 10,
        "mode_order": "listed",
        "modes": [{"mode": mode, "questions": questions} for mode in modes],
    }


def end_round(game: Game, seat: Seat | None = None) -> None:
    """End the round the room is in, named as an up-to-date client would."""
    (seat or game.admin).send(t="end_round", index=game.room.current_index)


def to_standings(game: Game) -> dict[str, Any]:
    return updated(game.admin, lambda m: m["room"]["phase"] == "standings")


def test_ending_a_round_voids_its_open_question_and_skips_the_rest(table, second_mode, db) -> None:
    game = table(
        "Zezima", reveal_seconds=30, standings_seconds=30, **rounds("more_less", second_mode)
    )
    zezima = game.players[0]
    game.start()
    game.opened(0)
    game.answer(zezima, 0, game.right(0))
    zezima.take("answer_ack")
    end_round(game)

    standings = to_standings(game)["standings"]
    assert [(s["display_name"], s["points"]) for s in standings] == [("Admin", 0), ("Zezima", 0)]
    assert "question_closed" not in game.admin.kinds
    rows = db("select shown_at, voided from questions order by position")
    assert [(row["shown_at"] is not None, row["voided"]) for row in rows] == [
        (True, True),
        (False, False),
        (False, False),
        (False, False),
    ]
    (answer,) = db("select correct, points from answers")
    assert (answer["correct"], answer["points"]) == (None, None)
    assert_memory_matches_db(game, db)

    game.skip()
    assert game.admin.take("question_open")["question"]["index"] == 2


@pytest.mark.parametrize("phase", ["splash", "open", "reveal"])
def test_ending_a_round_goes_to_its_standings_then_the_next_splash(
    table, second_mode, phase
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
    if phase != "splash":
        game.skip()
        game.opened(0)
    if phase == "reveal":
        game.skip()
        game.admin.take("question_closed")
    assert game.room.phase == phase
    end_round(game)

    to_standings(game)
    game.skip()
    assert game.splash()["room"]["segment"]["mode"] == second_mode
    game.skip()
    assert game.admin.take("question_open")["question"]["index"] == 2


def test_the_standings_name_the_next_round_and_only_they_do(table, client, second_mode) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        standings_seconds=30,
        splash=True,
        seconds=10,
        mode_order="listed",
        modes=[{"mode": "more_less", "questions": 2}, {"mode": second_mode, "questions": 3}],
    )
    game.start()
    assert "next_segment" not in game.splash()["room"]
    game.skip()
    game.opened(0)
    end_round(game)

    room = to_standings(game)["room"]
    assert room["next_segment"] == {
        "mode": second_mode,
        "index": 1,
        "total": 2,
        "start": 2,
        "count": 3,
    }
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        welcome = reseat(game.players[0], ws).take("welcome")
    assert welcome["room"]["next_segment"] == room["next_segment"]
    game.skip()
    assert "next_segment" not in game.splash()["room"]


def test_with_standings_off_a_round_ends_straight_into_the_next_splash(table, second_mode) -> None:
    game = table("Zezima", reveal_seconds=30, splash=True, **rounds("more_less", second_mode))
    game.start()
    game.splash()
    game.skip()
    game.opened(0)
    end_round(game)
    assert game.splash()["room"]["segment"]["mode"] == second_mode
    phases = [m["room"]["phase"] for m in game.admin.seen if m["t"] == "room_updated"]
    assert "standings" not in phases


def test_ending_the_last_round_ends_the_game(table, second_mode, db) -> None:
    game = table(
        "Zezima", reveal_seconds=30, standings_seconds=30, **rounds("more_less", second_mode)
    )
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    end_round(game)
    to_standings(game)
    game.skip()
    game.opened(2)
    end_round(game)
    game.admin.take("game_finished")
    assert (game.room.status, game.room.phase, game.room.timer) == ("finished", "idle", None)
    rows = db("select voided from questions order by position")
    assert [row["voided"] for row in rows] == [False, False, True, False]


def test_a_stale_index_the_standings_or_a_player_end_nothing(table, second_mode) -> None:
    game = table(
        "Zezima", reveal_seconds=30, standings_seconds=30, **rounds("more_less", second_mode)
    )
    game.start()
    game.opened(0)
    game.admin.send(t="end_round", index=1)
    end_round(game, game.players[0])
    assert game.players[0].take("error")["code"] == "not_admin"
    game.admin.settle()
    assert "error" not in game.admin.kinds
    assert (game.room.phase, game.room.current_index) == ("open", 0)
    assert not game.room.questions[0].voided

    game.skip()
    game.admin.take("question_closed")
    game.skip()
    game.admin.take("question_open")
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    to_standings(game)
    end_round(game)
    game.admin.settle()
    assert game.room.phase == "standings"
    game.skip()
    assert game.admin.take("question_open")["question"]["index"] == 2


def test_a_round_ended_on_its_splash_gained_nothing(table, second_mode, third_mode) -> None:
    """The standings say +0 for the cut round, not the round before's gains again."""
    game = table(
        "Zezima",
        reveal_seconds=30,
        standings_seconds=30,
        splash=True,
        **rounds("more_less", second_mode, third_mode, questions=1),
    )
    zezima = game.players[0]
    game.start()
    game.splash()
    game.skip()
    game.opened(0)
    game.answer(zezima, 0, game.right(0))
    zezima.take("answer_ack")
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    first = to_standings(game)["standings"]
    assert [(s["display_name"], s["points_gained"]) for s in first] == [
        ("Zezima", 1000),
        ("Admin", 0),
    ]
    game.skip()
    assert game.splash()["room"]["segment"]["mode"] == second_mode
    end_round(game)

    second = to_standings(game)["standings"]
    assert [(s["display_name"], s["points"], s["points_gained"]) for s in second] == [
        ("Zezima", 1000, 0),
        ("Admin", 0, 0),
    ]
    assert [s["previous_rank"] for s in second] == [s["rank"] for s in second]
    game.skip()
    assert game.splash()["room"]["segment"]["mode"] == third_mode


def test_a_restart_during_a_cut_rounds_standings_resumes_at_the_next_round(
    table, client, second_mode, evict
) -> None:
    game = table(
        "Zezima", reveal_seconds=30, standings_seconds=30, **rounds("more_less", second_mode)
    )
    game.start()
    game.opened(0)
    end_round(game)
    to_standings(game)
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_after(seat) == 1012

    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        assert admin.take("welcome")["room"]["phase"] == "reveal"
        game.skip(admin)
        assert admin.take("question_open")["question"]["index"] == 2
