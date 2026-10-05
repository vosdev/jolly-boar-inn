"""The daily counters: each event counted once, in its own transaction, and nobody named."""

from datetime import UTC, datetime

import asyncpg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.rooms import state
from app.rooms.settings import RoomSettings
from app.stats import Metric
from tests.game_api import Game, reseat
from tests.rooms_api import call, create, join

MORE_LESS = "more_less"


def counts(db) -> dict[tuple[Metric, str], int]:
    """Today's counters by ``(metric, key)``; every row is today's, in UTC."""
    rows = db("select day, metric, key, count from daily_stats")
    assert {row["day"] for row in rows} <= {datetime.now(UTC).date()}
    return {(Metric(row["metric"]), row["key"]): row["count"] for row in rows}


def play_through(game: Game, questions: int) -> None:
    """Skip every open and reveal until the game finishes."""
    for _ in range(questions):
        game.admin.take("question_open")
        game.skip()
        game.admin.take("question_closed")
        game.skip()
    game.admin.take("game_finished")


def test_a_game_counts_each_event_once(table, client: TestClient, db, second_mode: str) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        modes=[
            {"mode": MORE_LESS, "questions": 2, "seconds": 30},
            {"mode": second_mode, "questions": 1, "seconds": 30},
        ],
        mode_order="listed",
    )
    assert join(client, game.code, "Woox", returning=True).status_code == 200
    game.start()
    play_through(game, 3)
    assert counts(db) == {
        (Metric.ROOMS_CREATED, ""): 1,
        (Metric.PLAYERS_JOINED, ""): 3,
        (Metric.PLAYERS_RETURNING, ""): 1,
        (Metric.GAMES_STARTED, ""): 1,
        (Metric.ROUNDS_STARTED, MORE_LESS): 1,
        (Metric.ROUNDS_FINISHED, MORE_LESS): 1,
        (Metric.ROUNDS_STARTED, second_mode): 1,
        (Metric.ROUNDS_FINISHED, second_mode): 1,
        (Metric.GAMES_FINISHED, ""): 1,
    }


def test_ending_mid_round_ends_the_game_and_that_round_early(table, db, second_mode) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        modes=[
            {"mode": MORE_LESS, "questions": 2, "seconds": 30},
            {"mode": second_mode, "questions": 1, "seconds": 30},
        ],
        mode_order="listed",
    )
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    stats = counts(db)
    assert stats[(Metric.ROUNDS_STARTED, MORE_LESS)] == 1
    assert stats[(Metric.ROUNDS_ENDED_EARLY, MORE_LESS)] == 1
    assert stats[(Metric.GAMES_ENDED_EARLY, "")] == 1
    assert not {Metric.ROUNDS_FINISHED, Metric.GAMES_FINISHED} & {m for m, _ in stats}
    assert not {key for _, key in stats} & {second_mode}


def test_ending_in_the_standings_cuts_no_round_short(table, db, second_mode) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        standings_seconds=30,
        modes=[
            {"mode": MORE_LESS, "questions": 1, "seconds": 30},
            {"mode": second_mode, "questions": 1, "seconds": 30},
        ],
        mode_order="listed",
    )
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    game.admin.settle()
    assert game.room.phase == "standings"
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    stats = counts(db)
    assert stats[(Metric.ROUNDS_FINISHED, MORE_LESS)] == 1
    assert stats[(Metric.GAMES_ENDED_EARLY, "")] == 1
    assert Metric.ROUNDS_ENDED_EARLY not in {m for m, _ in stats}
    assert (Metric.ROUNDS_STARTED, second_mode) not in stats


def test_a_restart_that_voids_a_rounds_last_question_finishes_it_once(
    table, client: TestClient, db, evict, second_mode
) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        modes=[
            {"mode": MORE_LESS, "questions": 1, "seconds": 30},
            {"mode": second_mode, "questions": 1, "seconds": 30},
        ],
        mode_order="listed",
    )
    game.start()
    game.opened(0)
    assert evict(game.code) is True
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        reseat(game.admin, ws).take("welcome")
        assert game.room.questions[0].voided is True
    stats = counts(db)
    assert stats[(Metric.ROUNDS_STARTED, MORE_LESS)] == 1
    assert stats[(Metric.ROUNDS_FINISHED, MORE_LESS)] == 1
    assert Metric.ROUNDS_ENDED_EARLY not in {m for m, _ in stats}


def mid_round(table, name: str = "Zezima", **settings) -> Game:
    """A game on the first of a round's two questions."""
    game = table(name, seconds=30, questions=2, **settings)
    game.start()
    game.opened(0)
    return game


def in_splash(table, name: str = "Zezima") -> Game:
    """A game waiting in the splash before its first round."""
    game = table(name, seconds=30, splash=True)
    game.start()
    game.splash()
    return game


def ended_mid_round(table, name: str = "Zezima") -> Game:
    """A game the host ended on the first of a round's two questions."""
    game = mid_round(table, name)
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    return game


def abandoned(db) -> dict[tuple[Metric, str], int]:
    return {k: n for k, n in counts(db).items() if k[0] in ABANDONED}


ABANDONED = {Metric.GAMES_ABANDONED, Metric.ROUNDS_ABANDONED}


@pytest.mark.parametrize(
    ("setup", "expected"),
    [
        (
            mid_round,
            {(Metric.GAMES_ABANDONED, ""): 1, (Metric.ROUNDS_ABANDONED, MORE_LESS): 1},
        ),
        (in_splash, {(Metric.GAMES_ABANDONED, ""): 1}),
        (ended_mid_round, {}),
    ],
)
def test_deleting_a_room_abandons_what_was_under_way(
    table, client: TestClient, db, setup, expected
) -> None:
    game = setup(table)
    session = game.admin.session
    deleted = client.request("DELETE", f"/api/rooms/{game.code}", json={"session": session})
    assert deleted.status_code == 204
    assert abandoned(db) == expected


def test_cleanup_abandons_only_what_was_under_way(
    app: FastAPI, table, client: TestClient, db, second_mode: str
) -> None:
    """Four rooms past their time: mid-round, in a splash, in the lobby, ended mid-round."""
    mid_round(table, "Zezima", modes=[second_mode])
    in_splash(table, "Woox")
    create(client)
    ended_mid_round(table, "Lynx")
    db("update rooms set expires_at = now() - interval '1 minute'")
    assert call(client, app.state.rooms.purge_expired) == 4
    assert abandoned(db) == {
        (Metric.GAMES_ABANDONED, ""): 2,
        (Metric.ROUNDS_ABANDONED, second_mode): 1,
    }


def test_a_rolled_back_creation_counts_nothing(
    app: FastAPI, client: TestClient, db, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A duplicated session token fails the host's insert, after the room row went in."""
    _, admin = create(client)
    before = counts(db)
    monkeypatch.setattr(state, "new_token", lambda: admin["session"])
    with pytest.raises(asyncpg.UniqueViolationError):
        call(client, app.state.rooms.create, "Other", RoomSettings(), [], None, True)
    assert counts(db) == before


def test_a_refused_join_counts_nothing(client: TestClient, db) -> None:
    code, _ = create(client)
    before = counts(db)
    assert join(client, code, "Admin", returning=True).status_code == 409
    assert counts(db) == before


def test_deleting_a_room_leaves_its_counts(client: TestClient, db) -> None:
    code, admin = create(client)
    join(client, code, "Zezima")
    before = counts(db)
    deleted = client.request("DELETE", f"/api/rooms/{code}", json={"session": admin["session"]})
    assert deleted.status_code == 204
    assert db("select count(*) as n from rooms")[0]["n"] == 0
    assert counts(db) == before


def test_two_creations_on_one_day_make_one_row(client: TestClient, db) -> None:
    create(client)
    create(client)
    rows = db("select count from daily_stats where metric = $1", Metric.ROOMS_CREATED.value)
    assert [row["count"] for row in rows] == [2]


def test_returning_is_counted_and_stored_nowhere_else(client: TestClient, db) -> None:
    code, _ = create(client, returning=True)
    join(client, code, "Zezima", returning=True)
    join(client, code, "Woox", returning=False)
    stats = counts(db)
    assert (stats[(Metric.PLAYERS_JOINED, "")], stats[(Metric.PLAYERS_RETURNING, "")]) == (3, 2)
    columns = db(
        "select table_name, column_name from information_schema.columns"
        " where table_schema = 'public' and column_name like '%return%'"
    )
    assert columns == []


@pytest.mark.parametrize("path", ["/api/rooms", "/api/rooms/{code}/join"])
def test_returning_is_required(client: TestClient, path: str) -> None:
    code, _ = create(client)
    response = client.post(path.format(code=code), json={"display_name": "Zezima"})
    assert response.status_code == 422


def test_the_table_names_nobody(db) -> None:
    """``daily_stats`` holds exactly these columns, and must never gain an IP, a name, a room
    code or a player id: the counters exist to say how much the instance is played, and any
    of those would turn them into a record of who played, when, and with whom. Count
    something new as a new metric or key, never as a column that identifies anyone.
    """
    rows = db(
        "select column_name from information_schema.columns"
        " where table_schema = 'public' and table_name = 'daily_stats'"
    )
    assert {row["column_name"] for row in rows} == {"day", "metric", "key", "count"}
