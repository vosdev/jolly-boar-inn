"""Per-question totals: what each close of a hand-written pack question adds, and what not."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import stub_mode
from tests.game_api import Game
from tests.rooms_api import call
from tests.test_game import TANZANITE, event_rooms, the_event
from tests.test_stats import play_through

SLIDER = {
    "type": "number_slider",
    "source": "pack",
    "difficulty": "medium",
    "payload": {
        "prompt": "How many feathers?",
        "answer": 40,
        "min": 0,
        "max": 100,
        "scale": "linear",
    },
}


@pytest.fixture
def choice_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A round of one hand-written multiple choice question."""
    question = {**TANZANITE, "source": "pack", "difficulty": "easy"}
    yield from stub_mode(app, "choice_round", "multiple_choice", [question])


@pytest.fixture
def slider_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A round of one hand-written slider question, scored by distance."""
    yield from stub_mode(app, "slider_round", "number_slider", [SLIDER])


def stats(db) -> dict[str, dict[str, Any]]:
    rows = db("select * from question_stats")
    return {
        row["question_id"]: {k: v for k, v in row.items() if k != "question_id"} for row in rows
    }


def one_question(table, mode: str, *names: str) -> Game:
    game = table(*names, modes=[mode], questions=1, seconds=30, reveal_seconds=30)
    game.start()
    game.opened(0)
    return game


def close(game: Game) -> None:
    game.skip()
    game.admin.take("question_closed")


def test_a_graded_close_adds_its_answers_credit_correct_unanswered_and_a_game(
    table, choice_round: str, db
) -> None:
    for _ in range(2):
        game = one_question(table, choice_round, "Zezima", "Woox", "Lynx")
        _, zezima, woox, _ = game.seats
        game.answer(zezima, 0, game.right(0))
        game.answer(woox, 0, game.wrong(0))
        zezima.take("answer_ack")
        woox.take("answer_ack")
        close(game)
    content_id = game.question(0).content_id
    assert stats(db) == {
        content_id: {
            "mode": choice_round,
            "answers": 4,
            "credit_sum": 2.0,
            "correct": 2,
            "unanswered": 2,
            "games": 2,
        }
    }


def test_a_distance_scored_answer_adds_its_partial_credit(table, slider_round: str, db) -> None:
    game = one_question(table, slider_round, "Zezima", "Woox")
    _, zezima, woox = game.seats
    game.answer(zezima, 0, 50)  # a tenth of the track off, where credit falls to 0 at a quarter
    game.answer(woox, 0, 40)
    assert zezima.take("answer_ack")
    woox.take("answer_ack")
    close(game)
    (row,) = stats(db).values()
    assert row["credit_sum"] == pytest.approx(1.6)
    assert (row["answers"], row["correct"], row["unanswered"]) == (2, 1, 0)


def test_an_admins_answer_is_not_counted(table, choice_round: str, db) -> None:
    game = one_question(table, choice_round, "Zezima", "Woox")
    admin, zezima, _ = game.seats
    game.answer(admin, 0, game.right(0))
    game.answer(zezima, 0, game.wrong(0))
    admin.take("answer_ack")
    zezima.take("answer_ack")
    close(game)
    (row,) = stats(db).values()
    assert (row["answers"], row["credit_sum"], row["correct"], row["unanswered"]) == (1, 0, 0, 1)


def test_a_close_with_fewer_than_two_other_players_adds_nothing(
    table, choice_round: str, db
) -> None:
    game = one_question(table, choice_round, "Zezima")
    admin, zezima = game.seats
    game.answer(admin, 0, game.right(0))
    game.answer(zezima, 0, game.right(0))
    admin.take("question_closed")
    assert stats(db) == {}


def test_a_price_mode_question_adds_nothing(table, db) -> None:
    game = one_question(table, "more_less", "Zezima", "Woox")
    close(game)
    assert stats(db) == {}


def test_a_voided_question_adds_nothing(table, choice_round: str, db) -> None:
    game = one_question(table, choice_round, "Zezima", "Woox")
    game.answer(game.players[0], 0, game.right(0))
    game.players[0].take("answer_ack")
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    assert stats(db) == {}


@pytest.mark.parametrize("custom", [[], [TANZANITE]], ids=["event", "host"])
def test_event_and_host_questions_add_nothing(table, second_mode: str, db, custom) -> None:
    game = table("Zezima", "Woox", custom=custom, reveal_seconds=30, **event_rooms(second_mode))
    event = the_event(game)
    assert (event.source == "room") == bool(custom)
    game.start()
    play_through(game, len(game.room.questions))
    round_questions = {q.content_id for q in game.room.questions if q.mode == second_mode}
    assert set(stats(db)) == round_questions


def test_rows_survive_cleanup_deleting_the_room(
    app: FastAPI, table, choice_round: str, client: TestClient, db
) -> None:
    game = one_question(table, choice_round, "Zezima", "Woox")
    close(game)
    before = stats(db)
    assert before
    db("update rooms set expires_at = now() - interval '1 minute'")
    assert call(client, app.state.rooms.purge_expired) == 1
    assert stats(db) == before
