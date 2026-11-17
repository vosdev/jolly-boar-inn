"""Anonymous answer timings: the rows a close adds for tuning scoring, and the ones it does not."""

from collections.abc import Iterator
from datetime import timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import stub_mode
from tests.game_api import AFTER, Game, answer_after, closed_after, left_memory
from tests.rooms_api import call
from tests.test_game import TANZANITE, event_rooms, the_event
from tests.test_question_stats import close, one_question


@pytest.fixture
def choice_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A round of one hand-written multiple choice question."""
    question = {**TANZANITE, "source": "pack", "difficulty": "easy"}
    yield from stub_mode(app, "choice_round", "multiple_choice", [question])


def timings(db) -> list[dict[str, Any]]:
    return [dict(row) for row in db("select * from answer_timings order by elapsed_ms")]


def elapsed_ms(game: Game, seat_id: str) -> int:
    question = game.question(0)
    (answer,) = [a for pid, a in question.answers.items() if str(pid) == seat_id]
    return round((answer.received_at - question.answerable_at) / timedelta(milliseconds=1))


def test_a_close_adds_a_row_per_counted_answer(table, choice_round: str, db) -> None:
    game = one_question(table, choice_round, "Zezima", "Woox", "Lynx")
    _, zezima, woox, _ = game.seats
    answer_after(game, zezima, 0, game.right(0), AFTER[1])
    answer_after(game, woox, 0, game.wrong(0), AFTER[3])
    close(game)
    question = game.question(0)
    closed_at = question.closed_at
    assert closed_at is not None
    common = {
        "type": "multiple_choice",
        "mode": choice_round,
        "scoring": "speed",
        "pace": "run",
        "items": 3,
        "seconds": question.seconds,
        "team": False,
        "played_on": closed_at.date(),
    }
    expected = [
        {**common, "elapsed_ms": elapsed_ms(game, zezima.id), "credit": 1.0},
        {**common, "elapsed_ms": elapsed_ms(game, woox.id), "credit": 0.0},
    ]
    assert timings(db) == sorted(expected, key=lambda row: row["elapsed_ms"])


def test_a_rolled_back_close_adds_nothing(table, choice_round: str, db, faults) -> None:
    game = one_question(table, choice_round, "Zezima", "Woox")
    _, zezima, woox = game.seats
    for seat in (zezima, woox):
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    # After this close's own insert, inside the same transaction.
    faults.fail_once("insert into question_stats")
    game.skip()
    assert left_memory(game)
    assert [closed_after(seat) for seat in game.seats] == [1012, 1012, 1012]
    assert timings(db) == []


def test_an_admins_answer_adds_nothing(table, choice_round: str, db) -> None:
    game = one_question(table, choice_round, "Zezima", "Woox")
    admin, zezima, _ = game.seats
    game.answer(admin, 0, game.right(0))
    game.answer(zezima, 0, game.wrong(0))
    admin.take("answer_ack")
    zezima.take("answer_ack")
    close(game)
    assert [row["credit"] for row in timings(db)] == [0.0]


def test_a_one_player_room_adds_nothing(table, choice_round: str, db) -> None:
    game = one_question(table, choice_round, "Zezima")
    admin, zezima = game.seats
    game.answer(admin, 0, game.right(0))
    game.answer(zezima, 0, game.right(0))
    admin.take("question_closed")
    assert timings(db) == []


def test_a_host_question_adds_nothing(table, second_mode: str, db) -> None:
    settings = {**event_rooms(second_mode), "close_when_all_answered": False}
    game = table("Zezima", "Woox", custom=[TANZANITE], reveal_seconds=30, **settings)
    event = the_event(game)
    assert (event.source, event.type) == ("room", "multiple_choice")
    game.start()
    count = len(game.room.questions)
    for index in range(count):
        game.opened(index)
        for seat in game.players:
            game.answer(seat, index, game.right(index))
            seat.take("answer_ack")
        game.skip()
        game.admin.take("question_closed")
        game.skip()
    game.admin.take("game_finished")
    round_questions = [q for q in game.room.questions if q.mode == second_mode]
    rows = timings(db)
    assert {(row["type"], row["mode"]) for row in rows} == {("more_less", second_mode)}
    assert len(rows) == 2 * len(round_questions)


def test_a_team_games_rows_say_team(table, choice_round: str, db) -> None:
    game = table(
        "Zezima",
        "Woox",
        modes=[choice_round],
        questions=1,
        seconds=30,
        reveal_seconds=30,
        teams=["saradomin", "zamorak"],
    )
    for index, seat in enumerate(game.seats):
        seat.send(t="set_team", team="saradomin" if index % 2 else "zamorak")
        seat.settle()
    game.start()
    game.opened(0)
    for seat in game.players:
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    game.admin.take("question_closed")
    assert [row["team"] for row in timings(db)] == [True, True]


def test_cleanup_deleting_the_room_leaves_its_rows(
    app: FastAPI, table, choice_round: str, client: TestClient, db
) -> None:
    game = one_question(table, choice_round, "Zezima", "Woox")
    game.answer(game.players[0], 0, game.right(0))
    game.players[0].take("answer_ack")
    close(game)
    before = timings(db)
    assert len(before) == 1
    db("update rooms set expires_at = now() - interval '1 minute'")
    assert call(client, app.state.rooms.purge_expired) == 1
    assert timings(db) == before
