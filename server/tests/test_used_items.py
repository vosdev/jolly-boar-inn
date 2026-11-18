"""The items a player uses on an open question: Kebab, Ring of Charos (a), Book of Knowledge
and XP lamp, with ``use_item``. The drop that deals them is ``test_items.py``."""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import question_stats
from app.questions.types import TYPES
from app.questions.types.scoring import Scoring
from app.rooms import items, scoring
from app.rooms.items import (
    BOOK_OF_KNOWLEDGE,
    KEBAB,
    RING_OF_CHAROS,
    XP_LAMP,
    Answered,
    Item,
    Worn,
)
from tests.conftest import stub_mode
from tests.game_api import (
    AFTER,
    Game,
    Seat,
    answer_after,
    assert_memory_matches_db,
    reply,
    reseat,
)
from tests.test_item_effects import question, result, two_rounds, wearing
from tests.test_items import BUCKETS, NAMES, play, seated, stored, to_standings


@pytest.fixture
def choice_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    yield from stub_mode(app, "choice_round", "multiple_choice")


def dealt(table, item: Item, mode: str, count: int = 2, **settings: Any) -> Game:
    """A game dealing ``item`` from round 1, now at round 2's first question, not yet open.

    Bob, Ann and the admin receive a mild item; Ann and the admin a strong one.
    """
    game = seated(table, *NAMES, table_items=(item,), modes=two_rounds(mode, count), **settings)
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    game.skip()
    return game


def use(game: Game, seat: Seat, index: int, after: float | None = None) -> dict[str, Any]:
    """``seat`` uses their item on question ``index``, ``after`` seconds into its answering
    time when given; returns the ``item_used``, or the ``error``."""
    question = game.question(index)
    if after is not None:
        question.answerable_mono = game.app.state.rooms.clock() - after
    seat.send(t="use_item", question_id=str(question.id))
    return reply(seat, lambda m: m["t"] == "item_used")


def close(game: Game) -> dict[str, Any]:
    game.skip()
    return game.admin.take("question_closed")


def uuid(seat: Seat) -> UUID:
    return UUID(seat.id)


def gained(closed: dict[str, Any], seat: Seat) -> int:
    return next(s["points_gained"] for s in closed["standings"] if s["player_id"] == seat.id)


def paid(item: Item, credit: float, points: int, q=None) -> int:
    assert item.use is not None
    return item.use.pays(Answered(q or question("multiple_choice"), credit, 2, points))


# --- Kebab ------------------------------------------------------------------------------


def test_kebab_eaten_before_or_after_answering_pays_300_on_its_own_line(
    table, choice_round, db
) -> None:
    game = dealt(table, KEBAB, choice_round)
    bob, ann, admin = game.players[3], game.players[4], game.admin
    game.opened(1)
    assert use(game, bob, 1, AFTER[2]) == {
        "t": "item_used",
        "question_id": str(game.question(1).id),
        "item": "kebab",
    }
    answer_after(game, bob, 1, game.right(1), AFTER[2])
    answer_after(game, ann, 1, game.right(1), AFTER[2])
    assert use(game, ann, 1)["item"] == "kebab"
    answer_after(game, admin, 1, game.right(1), AFTER[2])
    closed = close(game)

    assert result(closed, bob.id) == (900, 300, "kebab")
    assert result(closed, ann.id) == (900, 300, "kebab")
    assert gained(closed, bob) == 900 + 300
    assert wearing(game, "Bob") is None and wearing(game, "Ann") is None
    assert "Bob" not in stored(db) and "Ann" not in stored(db)
    # Uneaten, it pays nothing and stays on through the round.
    assert result(closed, admin.id) == (900, 0, None)
    assert wearing(game, "Admin") == Worn("kebab", 1)
    assert_memory_matches_db(game, db)


def test_kebab_eaten_on_a_question_left_unanswered_pays_nothing_and_is_gone(
    table, choice_round, db
) -> None:
    game = dealt(table, KEBAB, choice_round)
    bob = game.players[3]
    game.opened(1)
    assert use(game, bob, 1, AFTER[2])["item"] == "kebab"
    closed = close(game)

    assert bob.id not in closed["results"]
    assert gained(closed, bob) == 0
    assert wearing(game, "Bob") is None and "Bob" not in stored(db)
    assert db("select count(*) as n from answers where item = 'kebab'")[0]["n"] == 0


# --- Ring of Charos (a) -----------------------------------------------------------------


def test_charos_pays_double_for_full_credit_and_takes_back_anything_less() -> None:
    assert paid(RING_OF_CHAROS, 1.0, 900) == 900
    assert paid(RING_OF_CHAROS, 0.6, 540) == -540
    assert paid(RING_OF_CHAROS, 0.0, 0) == 0


def test_a_charmed_question_pays_the_wearer_double_and_everyone_else_single(
    table, choice_round, db
) -> None:
    game = dealt(table, RING_OF_CHAROS, choice_round)
    zezima, bob, ann, admin = game.players[0], game.players[3], game.players[4], game.admin
    game.opened(1)
    assert use(game, bob, 1, AFTER[2])["item"] == "ring_of_charos"
    assert use(game, admin, 1, AFTER[2])["item"] == "ring_of_charos"
    for seat in (zezima, bob, ann):
        answer_after(game, seat, 1, game.right(1), AFTER[2])
    answer_after(game, admin, 1, game.wrong(1), AFTER[2])
    closed = close(game)

    assert result(closed, bob.id) == (900, 900, "ring_of_charos")
    assert result(closed, ann.id) == (900, 0, None)
    assert result(closed, zezima.id) == (900, 0, None)
    assert result(closed, admin.id) == (0, 0, None)
    assert wearing(game, "Bob") is None and wearing(game, "Admin") is None
    assert wearing(game, "Ann") == Worn("ring_of_charos", 1)
    assert_memory_matches_db(game, db)


def test_a_charmed_partial_answer_pays_0_as_negative_item_points(
    table, choice_round, db, monkeypatch: pytest.MonkeyPatch
) -> None:
    game = dealt(table, RING_OF_CHAROS, choice_round)
    bob = game.players[3]
    game.opened(1)
    monkeypatch.setattr(
        TYPES["multiple_choice"], "grade", lambda payload, subs: {s.player_id: 0.6 for s in subs}
    )
    use(game, bob, 1, AFTER[2])
    answer_after(game, bob, 1, game.right(1), AFTER[2])
    closed = close(game)

    assert result(closed, bob.id) == (540, -540, "ring_of_charos")
    assert gained(closed, bob) == 0
    rows = db("select points, item_points from answers where item = 'ring_of_charos'")
    assert [tuple(r) for r in rows] == [(540, -540)]
    assert_memory_matches_db(game, db)


def test_charos_charmed_then_left_unanswered_is_gone_and_pays_nothing(
    table, choice_round, db
) -> None:
    game = dealt(table, RING_OF_CHAROS, choice_round)
    bob = game.players[3]
    game.opened(1)
    use(game, bob, 1, AFTER[2])
    closed = close(game)
    assert bob.id not in closed["results"]
    assert wearing(game, "Bob") is None and "Bob" not in stored(db)

    game.opened(2)
    assert use(game, bob, 2, AFTER[2])["code"] == "bad_state"
    answer_after(game, bob, 2, game.right(2), AFTER[2])
    assert result(close(game), bob.id) == (900, 0, None)


# --- Book of Knowledge ------------------------------------------------------------------


def test_the_book_pays_full_credit_at_the_taps_speed_bucket(table, choice_round, db) -> None:
    game = dealt(table, BOOK_OF_KNOWLEDGE, choice_round)
    zezima, ann = game.players[0], game.players[4]
    game.opened(1)
    used = use(game, ann, 1, AFTER[3])
    assert used["item"] == "book_of_knowledge"
    ack = ann.take("answer_ack")
    assert (ack["scoring"], ack["band"], ack["answered"]) == ("speed", 3, 1)
    assert zezima.take("answer_count")["answered"] == 1
    closed = close(game)

    row = closed["results"][ann.id]
    assert row == {
        "value": None,
        "correct": True,
        "credit": 1.0,
        "points": 800,
        "item_points": 0,
        "item": None,
        "by_book": True,
    }
    assert wearing(game, "Ann") is None and "Ann" not in stored(db)
    rows = db("select value, correct, points, by_book from answers where by_book")
    assert [tuple(r) for r in rows] == [(None, True, 800, True)]
    assert_memory_matches_db(game, db)


def test_the_book_on_a_step_question_pays_the_step_the_tap_lands_in(table, pictures, db) -> None:
    game = dealt(table, BOOK_OF_KNOWLEDGE, "pixel_hunt", count=1)
    ann = game.players[4]
    game.opened(1)
    q = game.question(1)
    assert q.seconds is not None and q.steps is not None
    # Mid-step, so a slow run lands on the same one.
    tapped = 0.42 * q.seconds
    use(game, ann, 1, tapped)
    ack = ann.take("answer_ack")
    step = scoring.band(Scoring.STEP, tapped, q.seconds, q.steps)
    assert step is not None and step > 1
    assert (ack["scoring"], ack["band"]) == ("step", step)
    closed = close(game)
    points = scoring.points_for(Scoring.STEP, 1.0, step, q.steps)
    assert result(closed, ann.id) == (points, 0, None)
    assert closed["results"][ann.id]["by_book"] is True


@contextmanager
def stubbed(app: FastAPI, name: str, type_id: str) -> Iterator[str]:
    modes = stub_mode(app, name, type_id)
    try:
        yield next(modes)
    finally:
        next(modes, None)


@pytest.mark.parametrize(
    "type_id",
    [
        "multiple_choice",
        "free_text",
        "ordering",
        "matching",
        "pick_all_that_apply",
        "closest_number",
        "number_slider",
        "more_less",
    ],
)
def test_the_book_answers_every_type_alike(table, app, client, db, type_id: str) -> None:
    with stubbed(app, f"book_{type_id}", type_id) as mode:
        game = dealt(table, BOOK_OF_KNOWLEDGE, mode, count=1)
        ann = game.players[4]
        game.opened(1)
        use(game, ann, 1, AFTER[1])
        ann.take("answer_ack")
        closed = close(game)
        row = closed["results"][ann.id]
        assert (row["credit"], row["correct"], row["by_book"], row["value"]) == (
            1.0,
            True,
            True,
            None,
        )
        assert row["points"] == 1000


def test_a_book_answer_counts_for_the_standings_and_neither_stats_table(
    table, choice_round, db
) -> None:
    game = dealt(table, BOOK_OF_KNOWLEDGE, choice_round)
    zezima, woox, ann = game.players[0], game.players[1], game.players[4]
    game.opened(1)
    use(game, ann, 1, AFTER[1])
    ann.take("answer_ack")
    answer_after(game, zezima, 1, game.right(1), AFTER[1])
    answer_after(game, woox, 1, game.wrong(1), AFTER[1])
    closed = close(game)

    assert gained(closed, ann) == 1000
    standing = next(s for s in closed["standings"] if s["player_id"] == ann.id)
    assert standing["points"] == db_points(db, ann)
    q = game.question(1)
    assert question_stats.counts(q)
    stats = db("select answers, credit_sum, correct, unanswered from question_stats")
    # Zezima right, Woox wrong, Lynx and Bob silent; Ann's book is in no column.
    assert [tuple(r) for r in stats] == [(2, 1.0, 1, 2)]
    timed = sorted(r["credit"] for r in db("select credit from answer_timings"))
    assert timed == [0.0, 1.0]
    correct = db(
        "select count(*) as n from answers a join players p on p.id = a.player_id"
        " where p.display_name = 'Ann' and a.correct and a.by_book"
    )
    assert correct[0]["n"] == 1


def db_points(db, seat: Seat) -> int:
    rows = db(
        "select coalesce(sum(points + item_points), 0) as n from answers where player_id = $1",
        uuid(seat),
    )
    return rows[0]["n"]


def test_a_book_answer_closes_the_question_once_everyone_is_in(table, choice_round) -> None:
    game = dealt(table, BOOK_OF_KNOWLEDGE, choice_round, close_when_all_answered=True)
    ann = game.players[4]
    game.opened(1)
    for seat in game.seats:
        if seat is not ann:
            answer_after(game, seat, 1, game.right(1), AFTER[2])
    use(game, ann, 1, AFTER[2])
    closed = game.admin.take("question_closed", limit=60)
    assert closed["results"][ann.id]["by_book"] is True


# --- XP lamp ----------------------------------------------------------------------------


def test_a_rubbed_question_pays_the_wearer_double_after_credit_and_speed(
    table, choice_round, db
) -> None:
    game = dealt(table, XP_LAMP, choice_round)
    ann, admin = game.players[4], game.admin
    game.opened(1)
    assert use(game, ann, 1, AFTER[3])["item"] == "xp_lamp"
    answer_after(game, ann, 1, game.right(1), AFTER[3])
    answer_after(game, admin, 1, game.right(1), AFTER[3])
    closed = close(game)
    assert result(closed, ann.id) == (800, 800, "xp_lamp")
    assert gained(closed, ann) == 1600
    assert result(closed, admin.id) == (800, 0, None)
    assert wearing(game, "Ann") is None and "Ann" not in stored(db)

    game.opened(2)
    answer_after(game, admin, 2, game.right(2), AFTER[3])
    assert result(close(game), admin.id) == (800, 0, None)
    assert_memory_matches_db(game, db)


def test_the_lamp_doubles_partial_credit_and_the_kebab_pays_300() -> None:
    assert paid(XP_LAMP, 0.6, 540) == 540
    assert paid(XP_LAMP, 0.0, 0) == 0
    assert paid(KEBAB, 0.0, 0) == 300


# --- Refusals ---------------------------------------------------------------------------


def test_using_an_item_outside_an_open_question_is_not_open(table, choice_round) -> None:
    game = seated(table, *NAMES, table_items=(KEBAB,), modes=two_rounds(choice_round, 2))
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    bob = game.players[3]
    # The standings dealt it, and no question of its round is open yet.
    assert wearing(game, "Bob") == Worn("kebab", 1)
    assert use(game, bob, 1)["code"] == "not_open"
    game.skip()
    game.opened(1)
    # Still typing in: answers are not taken yet, and neither is an item.
    game.question(1).answerable_mono = game.app.state.rooms.clock() + 5
    assert use(game, bob, 1)["code"] == "not_open"
    bob.send(t="use_item", question_id=str(game.question(0).id))
    assert reply(bob, lambda m: m["t"] == "item_used")["code"] == "not_open"
    close(game)
    assert use(game, bob, 1)["code"] == "not_open"
    assert wearing(game, "Bob") == Worn("kebab", 1)


@pytest.mark.parametrize(
    "item", [RING_OF_CHAROS, BOOK_OF_KNOWLEDGE, XP_LAMP], ids=lambda item: item.id
)
def test_an_item_for_before_answering_is_refused_after_it(table, choice_round, item) -> None:
    game = dealt(table, item, choice_round)
    ann = game.players[4]
    game.opened(1)
    answer_after(game, ann, 1, game.right(1), AFTER[2])
    assert use(game, ann, 1)["code"] == "already_answered"
    assert wearing(game, "Ann") == Worn(item.id, 1)


def test_using_an_item_without_one_is_bad_state(table, choice_round) -> None:
    game = dealt(table, KEBAB, choice_round)
    zezima, bob = game.players[0], game.players[3]
    game.opened(1)
    assert use(game, zezima, 1, AFTER[2])["code"] == "bad_state"
    assert use(game, bob, 1, AFTER[2])["item"] == "kebab"
    assert use(game, bob, 1, AFTER[2])["code"] == "bad_state"


def test_an_item_that_works_by_itself_is_not_used(table, choice_round) -> None:
    game = dealt(table, items.RING_OF_LIFE, choice_round)
    ann = game.players[4]
    game.opened(1)
    assert use(game, ann, 1, AFTER[2])["code"] == "bad_state"


@pytest.mark.parametrize("item", [RING_OF_CHAROS, XP_LAMP], ids=lambda item: item.id)
def test_charos_and_the_lamp_are_refused_on_more_or_less(table, second_mode, item) -> None:
    game = seated(table, *NAMES, table_items=(item,), modes=two_rounds(second_mode, 2))
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    game.skip()
    ann = game.players[4]
    game.room.players[uuid(ann)].item = Worn(item.id, 1)
    game.opened(1)
    assert use(game, ann, 1, AFTER[2])["code"] == "bad_state"


@pytest.mark.parametrize("item", [RING_OF_CHAROS, XP_LAMP], ids=lambda item: item.id)
def test_charos_and_the_lamp_are_never_dealt_into_a_round_of_only_more_or_less(
    table, second_mode, db, item
) -> None:
    game = seated(table, *NAMES, table_items=(item,), modes=two_rounds(second_mode, 3))
    game.start()
    play(game, 0, BUCKETS)
    assert to_standings(game)["room"]["drops"] == []
    assert stored(db) == {}


def test_each_used_item_fits_only_a_round_it_works_in() -> None:
    more_less, choice = question(), question("multiple_choice")
    hidden = question("multiple_choice", host_only=True)
    for item in (RING_OF_CHAROS, XP_LAMP):
        assert not item.fits([more_less, more_less])
        assert not item.fits([more_less, hidden])
        assert item.fits([more_less, choice])
    for item in (KEBAB, BOOK_OF_KNOWLEDGE):
        assert item.fits([more_less])
        assert not item.fits([hidden])


# --- What the wearer and the others see -------------------------------------------------


def test_a_use_shows_to_nobody_else_until_the_reveal(table, choice_round, db) -> None:
    game = dealt(table, XP_LAMP, choice_round)
    zezima, ann = game.players[0], game.players[4]
    game.opened(1)
    use(game, ann, 1, AFTER[2])
    answer_after(game, ann, 1, game.right(1), AFTER[2])
    zezima.settle()
    assert "item_used" not in zezima.kinds
    assert "players_updated" not in zezima.kinds[zezima.kinds.index("question_open") :]
    # The slot clears at the close, not at the tap.
    assert wearing(game, "Ann") == Worn("xp_lamp", 1)
    assert stored(db)["Ann"] == ("xp_lamp", 1, None)
    close(game)
    assert wearing(game, "Ann") is None


def test_a_reload_after_a_use_keeps_it_spent(table, client, choice_round) -> None:
    game = dealt(table, KEBAB, choice_round)
    zezima, bob = game.players[0], game.players[3]
    game.opened(1)
    use(game, bob, 1, AFTER[2])
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        welcome = reseat(bob, ws).take("welcome")
        assert welcome["question"]["item_used"] is True
        assert welcome["you"]["item"] == {"id": "kebab", "charges": None}
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        assert reseat(zezima, ws).take("welcome")["question"]["item_used"] is False


def test_a_book_reload_reads_as_answered(table, client, choice_round) -> None:
    game = dealt(table, BOOK_OF_KNOWLEDGE, choice_round)
    ann = game.players[4]
    game.opened(1)
    use(game, ann, 1, AFTER[2])
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        welcome = reseat(ann, ws).take("welcome")
    assert welcome["question"]["item_used"] is True
    assert welcome["your_answer"] is None
    assert welcome["question"]["answered"] == 1
