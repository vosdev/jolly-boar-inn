"""``rematch``: a finished room goes back to its lobby for another game at the same table."""

from typing import Any

from app.stats import Metric
from tests.game_api import Game, updated
from tests.test_stats import counts


def finish(game: Game, answerer: int = 0) -> dict[str, Any]:
    """Play every question, one player answering each right; the ``game_finished`` frame."""
    game.start()
    seat = game.players[answerer]
    for index in range(game.room.total):
        game.admin.take("question_open")
        game.answer(seat, index, game.right(index))
        seat.take("answer_ack")
        game.skip()
        game.admin.take("question_closed")
        game.skip()
    return game.admin.take("game_finished")


def in_lobby(message: dict[str, Any]) -> bool:
    return message["room"]["status"] == "lobby"


def rematch(game: Game) -> dict[str, Any]:
    """Send the room back to its lobby; the admin's ``room_updated`` saying so."""
    game.admin.send(t="rematch")
    game.started = False
    return updated(game.admin, lambda m: m["t"] == "room_updated" and in_lobby(m))


def content_ids(db, code: str) -> list[str]:
    rows = db(
        "select q.question_id from questions q join rooms r on r.id = q.room_id"
        " where r.code = $1 order by q.position",
        code,
    )
    return [row["question_id"] for row in rows]


def test_rematch_returns_a_finished_room_to_the_lobby_with_its_players_and_settings(
    table, db
) -> None:
    game = table("Zezima", "Woox", seconds=10, reveal_seconds=30)
    before = game.room
    settings, players = before.settings, set(before.players)
    finish(game)
    game.players[1].send(t="ready", ready=True)
    expires = game.room.expires_at

    message = rematch(game)

    room = game.room
    assert message["room"]["status"] == "lobby"
    assert message["room"]["finished_at"] is None
    assert {p["id"] for p in message["players"]} == {str(pid) for pid in players}
    assert not any(p["ready"] for p in message["players"])
    assert room.settings == settings
    assert room.expires_at > expires
    (row,) = db("select status, finished_at, current_index from rooms where code = $1", game.code)
    assert (row["status"], row["finished_at"], row["current_index"]) == ("lobby", None, None)


def test_a_player_or_a_room_not_finished_cannot_rematch(table) -> None:
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.admin.send(t="rematch")
    assert game.admin.take("error")["code"] == "bad_state"
    game.start()
    game.admin.take("question_open")
    game.admin.send(t="rematch")
    assert game.admin.take("error")["code"] == "bad_state"
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    game.players[0].send(t="rematch")
    assert game.players[0].take("error")["code"] == "not_admin"
    assert game.room.status == "finished"


def test_the_new_game_starts_with_no_scores_or_answers(table, db) -> None:
    game = table("Zezima", seconds=10, reveal_seconds=30)
    final = finish(game)
    assert any(s["points"] > 0 for s in final["standings"])

    message = rematch(game)

    assert all(s["points"] == 0 for s in message["standings"])
    assert db("select count(*) as n from answers")[0]["n"] == 0
    assert content_ids(db, game.code) == []
    game.start()
    game.admin.take("question_open")
    assert all(s.points == 0 for s in game.room.standings())


def test_the_new_game_asks_none_of_the_previous_questions(table, db) -> None:
    game = table("Zezima", seconds=10, reveal_seconds=30)
    finish(game)
    first = content_ids(db, game.code)
    rematch(game)
    (row,) = db("select played_question_ids from rooms where code = $1", game.code)
    assert sorted(row["played_question_ids"]) == sorted(first)

    finish(game)
    second = content_ids(db, game.code)
    assert len(second) == len(first)
    assert not set(first) & set(second)
    rematch(game)
    (row,) = db("select played_question_ids from rooms where code = $1", game.code)
    assert sorted(row["played_question_ids"]) == sorted(first + second)


def test_stats_count_two_games_and_one_rematch(table, db) -> None:
    game = table("Zezima", seconds=10, reveal_seconds=30)
    finish(game)
    rematch(game)
    finish(game)
    today = counts(db)
    assert today[(Metric.GAMES_STARTED, "")] == 2
    assert today[(Metric.GAMES_FINISHED, "")] == 2
    assert today[(Metric.REMATCHES, "")] == 1


def test_each_game_finishes_at_its_own_time(table) -> None:
    """Each browser files a game by code and ``finished_at``, so two games are two entries."""
    game = table("Zezima", seconds=10, reveal_seconds=30)
    finish(game)
    first = game.room.finished_at
    rematch(game)
    finish(game)
    assert game.room.finished_at is not None and first is not None
    assert game.room.finished_at > first
