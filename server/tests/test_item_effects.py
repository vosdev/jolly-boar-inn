"""The phase-one items' effects: Super restore (4), Ring of Life and Phoenix necklace, on
their own and in a game. The drop that deals them is ``test_items.py``."""

from collections.abc import Iterator, Mapping
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import question_stats
from app.rooms import items
from app.rooms.items import PHOENIX_NECKLACE, RING_OF_LIFE, SUPER_RESTORE, Answered, Item, Worn
from app.rooms.models import RoomQuestion
from tests.conftest import stub_mode
from tests.game_api import AFTER, Game, answer_after, assert_memory_matches_db
from tests.test_items import BUCKETS, NAMES, play, seated, stored, to_standings


def question(type_id: str = "more_less", mode: str = "more_less", host_only: bool = False):
    return RoomQuestion(
        id=uuid4(),
        position=0,
        content_id="q",
        type=type_id,
        mode=mode,
        source="pack",
        payload={},
        host_only=host_only,
        author_player_id=None,
    )


SPEEDY = question()
NUMBER = question("closest_number", "custom")


def restored(band: int | None, credit: float = 1.0, q: RoomQuestion = SPEEDY, charges: int = 4):
    """What one dose does to an answer in ``band``: ``(item points, slot after)``."""
    worn = Worn("super_restore", 1, charges)
    points = items.scoring.points_for(q.scoring, credit, band, q.steps)
    assert SUPER_RESTORE.on_answer is not None
    effect = SUPER_RESTORE.on_answer(worn, Answered(q, credit, band, points))
    return effect.points, effect.worn


def life(points: int) -> tuple[int, Worn | None]:
    worn = Worn("ring_of_life", 1)
    assert RING_OF_LIFE.on_answer is not None
    effect = RING_OF_LIFE.on_answer(worn, Answered(SPEEDY, 1.0, 5, points))
    return effect.points, effect.worn


def rebirth(*points: int) -> dict[int, int]:
    """Phoenix necklace over answers of ``points`` in question order, by their place."""
    answered = {uuid4(): p for p in points}
    places = {qid: n for n, qid in enumerate(answered)}
    assert PHOENIX_NECKLACE.settle is not None
    gained = PHOENIX_NECKLACE.settle(Worn("phoenix_necklace", 1), answered)
    return {places[qid]: p for qid, p in gained.items()}


def wearing(game: Game, name: str) -> Worn | None:
    return next(p.item for p in game.room.players.values() if p.display_name == name)


def result(closed: Mapping[str, Any], seat_id: str) -> tuple[int, int, str | None]:
    row = closed["results"][seat_id]
    return row["points"], row["item_points"], row["item"]


@pytest.fixture
def number_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    yield from stub_mode(app, "number_round", "closest_number")


def two_rounds(second: str, count: int) -> list[dict[str, Any]]:
    """One question of ``more_less`` to deal from, then ``count`` of ``second``."""
    return [{"mode": "more_less", "questions": 1}, {"mode": second, "questions": count}]


# --- Super restore (4) ----------------------------------------------------------------


def test_super_restore_pays_bucket_4_as_bucket_2_and_bucket_2_as_1000() -> None:
    assert restored(4) == (200, Worn("super_restore", 1, 3))
    assert restored(2) == (100, Worn("super_restore", 1, 3))
    assert restored(3, credit=0.6) == (600 - 480, Worn("super_restore", 1, 3))


def test_super_restore_spends_no_charge_on_bucket_1_or_a_wrong_answer() -> None:
    assert restored(1) == (0, Worn("super_restore", 1, 4))
    assert restored(4, credit=0.0) == (0, Worn("super_restore", 1, 4))


def test_super_restore_breaks_with_its_last_charge() -> None:
    assert restored(5, charges=1) == (200, None)


def test_super_restore_pays_an_accuracy_question_as_ever() -> None:
    assert restored(None, q=NUMBER) == (0, Worn("super_restore", 1, 4))


def test_super_restore_boosts_step_scoring_without_steps_as_speed() -> None:
    npc = question("pick_from_list", "whos_that_npc")
    pixel = question("pick_from_list", "pixel_hunt")
    assert restored(4, q=npc) == (200, Worn("super_restore", 1, 3))
    assert restored(4, q=pixel) == (0, Worn("super_restore", 1, 4))


def test_super_restore_in_a_game(table, second_mode, db) -> None:
    game = seated(table, *NAMES, table_items=(SUPER_RESTORE,), modes=two_rounds(second_mode, 6))
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    game.skip()
    bob = game.players[3]
    assert stored(db)["Bob"] == ("super_restore", 1, 4)

    # Bucket 4, 1, 2, 3, 5, then one past the four charges.
    expected = [(4, 700, 200, 3), (1, 1000, 0, 3), (2, 900, 100, 2), (3, 800, 200, 1)]
    expected += [(5, 600, 200, None), (4, 700, 0, None)]
    for index, (band, points, extra, charges) in enumerate(expected, start=1):
        game.opened(index)
        ack = answer_after(game, bob, index, game.right(index), AFTER[band])
        assert ack["band"] == band
        game.skip()
        closed = game.admin.take("question_closed")
        assert result(closed, bob.id) == (points, extra, "super_restore" if extra else None)
        held = wearing(game, "Bob")
        assert (held.charges if held else None) == charges
        assert stored(db).get("Bob", (None, None, None))[2] == charges
    assert_memory_matches_db(game, db)


def test_super_restore_is_never_dealt_into_a_round_without_a_speed_question(
    table, number_round, db
) -> None:
    game = seated(table, *NAMES, table_items=(SUPER_RESTORE,), modes=two_rounds(number_round, 2))
    game.start()
    play(game, 0, BUCKETS)
    assert to_standings(game)["room"]["drops"] == []
    assert stored(db) == {}


# --- Ring of Life ---------------------------------------------------------------------


def test_ring_of_life_raises_0_to_500_and_breaks() -> None:
    assert life(0) == (500, None)
    assert life(499) == (1, None)


def test_ring_of_life_leaves_540_alone_and_stays_on() -> None:
    assert life(540) == (0, Worn("ring_of_life", 1))
    assert life(500) == (0, Worn("ring_of_life", 1))


def test_ring_of_life_in_a_game(table, second_mode, db) -> None:
    game = seated(table, *NAMES, table_items=(RING_OF_LIFE,), modes=two_rounds(second_mode, 4))
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    game.skip()
    ann = game.players[4]
    assert stored(db)["Ann"] == ("ring_of_life", 1, None)

    play(game, 1, {})
    assert wearing(game, "Ann") == Worn("ring_of_life", 1)
    closed = play(game, 2, {"Ann": 5})
    assert result(closed, ann.id) == (600, 0, None)
    assert wearing(game, "Ann") == Worn("ring_of_life", 1)
    closed = play(game, 3, {}, wrong=["Ann"])
    assert result(closed, ann.id) == (0, 500, "ring_of_life")
    assert wearing(game, "Ann") is None and "Ann" not in stored(db)
    closed = play(game, 4, {}, wrong=["Ann"])
    assert result(closed, ann.id) == (0, 0, None)
    assert_memory_matches_db(game, db)


# --- Phoenix necklace -----------------------------------------------------------------


def test_phoenix_necklace_raises_200_of_200_600_900_to_750() -> None:
    assert rebirth(200, 600, 900) == {0: 550}
    assert rebirth(900, 200, 600) == {1: 550}


def test_phoenix_necklace_raises_the_worst_only_when_the_average_is_higher() -> None:
    assert rebirth(900, 900, 900) == {}
    assert rebirth(900, 900, 800) == {2: 100}


def test_phoenix_necklace_raises_the_earlier_of_two_equal_worst_answers() -> None:
    assert rebirth(900, 200, 200) == {1: 350}


def test_phoenix_necklace_needs_two_answered_questions() -> None:
    assert rebirth() == {}
    assert rebirth(0) == {}
    assert rebirth(0, 1000) == {0: 1000}


def test_phoenix_necklace_rounds_the_average_half_up() -> None:
    assert rebirth(0, 600, 901) == {0: 751}


def test_phoenix_necklace_in_a_game(table, second_mode, db) -> None:
    game = seated(table, *NAMES, table_items=(PHOENIX_NECKLACE,), modes=two_rounds(second_mode, 3))
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    game.skip()
    ann, admin = game.players[4], game.admin

    # Ann: 900, 600, then wrong; the 0 rises to 750, on the round's last question.
    # Admin: no answer, 600, 1000; the unanswered question is no part of it, the 600 rises.
    assert play(game, 1, {"Ann": 2})["settled"] == {}
    assert play(game, 2, {"Ann": 5, "Admin": 5})["settled"] == {}
    closed = play(game, 3, {"Admin": 1}, wrong=["Ann"])
    assert result(closed, ann.id) == (0, 750, "phoenix_necklace")
    # Admin's raise is on question 2, so only ``settled`` carries it to this reveal.
    assert result(closed, admin.id) == (1000, 0, None)
    assert closed["settled"] == {
        ann.id: {"item": "phoenix_necklace", "points": 750},
        admin.id: {"item": "phoenix_necklace", "points": 400},
    }
    gained = {s["player_id"]: s["points_gained"] for s in closed["standings"]}
    assert gained[ann.id] == 900 + 600 + 750
    assert gained[admin.id] == 1000 + 1000
    rows = db(
        "select p.display_name, q.position, a.points, a.item_points from answers a"
        " join questions q on q.id = a.question_id join players p on p.id = a.player_id"
        " where a.item = 'phoenix_necklace' order by p.display_name"
    )
    assert [tuple(r) for r in rows] == [("Admin", 2, 600, 400), ("Ann", 3, 0, 750)]
    assert_memory_matches_db(game, db)


@pytest.fixture
def last_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    yield from stub_mode(app, "last_round")


def test_a_round_cut_short_settles_phoenix_into_points_gained_only(
    table, second_mode, last_round, db
) -> None:
    modes = [*two_rounds(second_mode, 3), {"mode": last_round, "questions": 1}]
    game = seated(table, *NAMES, table_items=(PHOENIX_NECKLACE,), modes=modes, reveal_seconds=30)
    game.start()
    play(game, 0, BUCKETS)
    game.skip()
    to_standings(game)
    game.skip()
    ann = game.players[4]

    # Ann: wrong, then 900; the 0 rises to 900 when the host ends the round in the reveal.
    closes = [play(game, 1, {}, wrong=["Ann"])]
    game.skip()
    closes.append(play(game, 2, {"Ann": 2}))
    game.admin.send(t="end_round", index=2)
    frame = to_standings(game)
    gained = {s["player_id"]: s["points_gained"] for s in frame["standings"]}
    assert gained[ann.id] == 0 + 900 + 900
    assert [closed["settled"] for closed in closes] == [{}, {}]
    assert all(m["settled"] == {} for m in game.admin.seen if m["t"] == "question_closed")
    rows = db("select item_points from answers where item = 'phoenix_necklace'")
    assert [r["item_points"] for r in rows] == [900]
    assert_memory_matches_db(game, db)


def test_phoenix_necklace_is_never_dealt_into_a_round_of_two_questions(
    table, second_mode, db
) -> None:
    game = seated(table, *NAMES, table_items=(PHOENIX_NECKLACE,), modes=two_rounds(second_mode, 2))
    game.start()
    play(game, 0, BUCKETS)
    assert to_standings(game)["room"]["drops"] == []
    assert stored(db) == {}


# --- Fit rules ------------------------------------------------------------------------


def test_each_item_fits_only_a_round_it_works_in() -> None:
    hidden = question(host_only=True)
    fits = {item.id: item.fits for item in items.ITEMS}
    assert fits["super_restore"]([NUMBER, SPEEDY])
    assert fits["super_restore"]([question("pick_from_list", "whos_that_npc")])
    assert not fits["super_restore"]([NUMBER, question("pick_from_list", "pixel_hunt")])
    assert not fits["super_restore"]([hidden, NUMBER])
    assert fits["ring_of_life"]([NUMBER])
    assert not fits["ring_of_life"]([hidden])
    assert fits["phoenix_necklace"]([NUMBER, SPEEDY, NUMBER])
    assert not fits["phoenix_necklace"]([NUMBER, SPEEDY])
    assert not fits["phoenix_necklace"]([NUMBER, SPEEDY, hidden])


def test_the_items_and_their_tiers() -> None:
    assert {(item.id, item.tier, item.charges) for item in items.ITEMS} == {
        ("super_restore", "mild", 4),
        ("ring_of_life", "strong", None),
        ("phoenix_necklace", "strong", None),
        ("kebab", "mild", None),
        ("ring_of_charos", "mild", None),
        ("book_of_knowledge", "strong", None),
        ("xp_lamp", "strong", None),
    }


# --- Bookkeeping ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("item", "wrong"),
    [(SUPER_RESTORE, False), (RING_OF_LIFE, True), (PHOENIX_NECKLACE, True)],
    ids=lambda value: value.id if isinstance(value, Item) else str(value),
)
def test_question_stats_and_answer_timings_hold_base_credit_with_each_item(
    table, second_mode, db, item: Item, wrong: bool
) -> None:
    game = seated(table, *NAMES, table_items=(item,), modes=two_rounds(second_mode, 3))
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    game.skip()
    play(game, 1, {"Ann": 4, "Zezima": 1})
    play(game, 2, {"Ann": 4, "Zezima": 1})
    play(game, 3, {"Zezima": 1}, wrong=["Ann"] if wrong else [])

    assert db("select sum(item_points) as n from answers")[0]["n"] > 0
    # What the closes graded, admins left out as both tables leave them.
    credit = {
        q.content_id: sorted(
            a.credit for pid, a in q.answers.items() if not game.room.is_admin(pid)
        )
        for q in game.room.questions
        if question_stats.counts(q)
    }
    assert len(credit) == 3
    stats = {
        r["question_id"]: (r["answers"], r["credit_sum"])
        for r in db("select question_id, answers, credit_sum from question_stats")
    }
    assert stats == {qid: (len(got), sum(got)) for qid, got in credit.items()}
    timed = sorted(r["credit"] for r in db("select credit from answer_timings"))
    assert timed == sorted(c for got in credit.values() for c in got)
