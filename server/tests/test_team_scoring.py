"""A team game scores on accuracy alone: the ack carries no speed band and the close pays
``1000 x credit``, while ``ACCURACY`` and ``STEP`` questions pay what they always paid."""

from typing import Any
from uuid import UUID

from app.questions.types import more_less, pick_from_list
from app.questions.types.scoring import Scoring
from tests.game_api import AFTER, Game, answer_after, assert_memory_matches_db


def team_table(table: Any, *names: str, **settings: Any) -> Game:
    """A team game of Saradomin against Zamorak, everyone on a team, nobody closing early."""
    game = table(
        *names,
        teams=["saradomin", "zamorak"],
        seconds=10,
        close_when_all_answered=False,
        **settings,
    )
    for index, seat in enumerate(game.seats):
        seat.send(t="set_team", team="saradomin" if index % 2 else "zamorak")
        seat.settle()
    return game


def points_by_name(game: Game, closed: dict[str, Any]) -> dict[str, int]:
    by_name = {s.id: s.name for s in game.seats}
    return {by_name[pid]: row["points"] for pid, row in closed["results"].items()}


def test_a_right_answer_pays_1000_however_late_and_a_wrong_one_nothing(table, db) -> None:
    game = team_table(table, "Zezima", "Woox", "Lynx", "Silent")
    zezima, woox, lynx, _ = game.players
    game.start()
    game.opened(0)
    for seat, right, bucket in ((zezima, True, 1), (woox, True, 5), (lynx, False, 1)):
        value = game.right(0) if right else game.wrong(0)
        ack = answer_after(game, seat, 0, value, AFTER[bucket])
        assert (ack["scoring"], ack["band"]) == ("speed", None)
    game.skip()
    closed = game.admin.take("question_closed")
    assert points_by_name(game, closed) == {"Zezima": 1000, "Woox": 1000, "Lynx": 0}
    points = {s["display_name"]: s["points"] for s in closed["standings"]}
    assert points["Silent"] == 0
    assert_memory_matches_db(game, db)


def test_partial_credit_pays_its_share_of_1000(table, db, monkeypatch) -> None:
    """Ordering's road, driven by ``more_less`` with a ``grade`` that gives 0.6."""
    game = team_table(table, "Zezima")
    (zezima,) = game.players
    monkeypatch.setattr(more_less, "grade", lambda _, subs: {s.player_id: 0.6 for s in subs})
    game.start()
    game.opened(0)
    answer_after(game, zezima, 0, game.right(0), AFTER[4])
    game.skip()
    closed = game.admin.take("question_closed")
    assert closed["results"][zezima.id]["points"] == 600
    rows = db("select player_id, points from answers")
    assert {(row["player_id"], row["points"]) for row in rows} == {(UUID(zezima.id), 600)}


def test_an_accuracy_question_pays_its_usual_points(table, monkeypatch) -> None:
    monkeypatch.setattr(more_less, "SCORING", Scoring.ACCURACY, raising=False)
    game = team_table(table, "Zezima", "Woox")
    zezima, woox = game.players
    game.start()
    game.opened(0)
    for seat, right in ((zezima, True), (woox, False)):
        value = game.right(0) if right else game.wrong(0)
        ack = answer_after(game, seat, 0, value, AFTER[3])
        assert (ack["scoring"], ack["band"]) == ("accuracy", None)
    game.skip()
    closed = game.admin.take("question_closed")
    assert points_by_name(game, closed) == {"Zezima": 1000, "Woox": 0}


def test_a_step_question_pays_the_frame_the_answer_arrived_on(table, monkeypatch) -> None:
    monkeypatch.setattr(more_less, "SCORING", Scoring.STEP, raising=False)
    monkeypatch.setattr(more_less, "steps", pick_from_list.steps, raising=False)
    game = team_table(table, "Zezima", "Woox")
    zezima, woox = game.players
    game.start()
    game.opened(0)
    game.question(0).payload["steps"] = 4
    first = answer_after(game, zezima, 0, game.right(0), 1.0)
    third = answer_after(game, woox, 0, game.right(0), 6.0)
    assert (first["scoring"], first["band"]) == ("step", 1)
    assert (third["scoring"], third["band"]) == ("step", 3)
    game.skip()
    closed = game.admin.take("question_closed")
    assert points_by_name(game, closed) == {"Zezima": 1000, "Woox": 600}
