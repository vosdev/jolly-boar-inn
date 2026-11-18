"""Ring of wealth (3): wrong options off a multiple choice question, for its wearer alone.
The drop that deals it is ``test_items.py``."""

from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.questions.types import multiple_choice
from app.rooms import items
from app.rooms.items import RING_OF_WEALTH, Worn
from app.rooms.models import RoomQuestion
from tests.conftest import stub_mode
from tests.game_api import AFTER, Game, answer_after, assert_memory_matches_db, reply, reseat
from tests.test_item_effects import question, result, two_rounds, wearing
from tests.test_items import BUCKETS, NAMES, play, seated, stored, to_standings
from tests.test_used_items import close, dealt

RING = Worn("ring_of_wealth", 1, 3)


def choice(options: int, answer: int = 0, host_only: bool = False) -> RoomQuestion:
    q = question("multiple_choice", host_only=host_only)
    q.payload = {
        "prompt": "Which?",
        "options": [f"Option {n}" for n in range(options)],
        "answer_index": answer,
    }
    return q


def pack(*counts: int) -> list[dict[str, Any]]:
    """Pack questions of ``counts`` options each, every one's answer somewhere else."""
    return [
        {
            "id": f"q_wealth_{n}",
            "type": "multiple_choice",
            "mode": "wealth",
            "source": "pack",
            "tags": [],
            "difficulty": "easy",
            "payload": {
                "prompt": f"Which one, {n}?",
                "options": [f"Option {n}.{i}" for i in range(count)],
                "answer_index": n % count,
            },
        }
        for n, count in enumerate(counts)
    ]


@pytest.fixture
def wealth_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """Six questions of 4, 3, 5, 2, 6 and 4 options."""
    yield from stub_mode(app, "wealth_round", "multiple_choice", pack(4, 3, 5, 2, 6, 4))


@pytest.fixture
def three_options(app: FastAPI, client: TestClient) -> Iterator[str]:
    yield from stub_mode(app, "three_options", "multiple_choice", pack(3, 2, 3))


def removed(q: RoomQuestion, worn: Worn = RING, code: str = "ROOM", player=None):
    return items.removed((RING_OF_WEALTH,), worn, q, code, player or uuid4())


def options(game: Game, index: int) -> int:
    return len(game.question(index).payload["options"])


def opened_by_name(game: Game, index: int) -> dict[str, dict[str, Any]]:
    """Everyone's open question ``index``, by seat name."""
    return {
        seat.name: m["question"] for seat, m in zip(game.seats, game.opened(index), strict=True)
    }


def wrong_ones(q: RoomQuestion) -> set[int]:
    right = multiple_choice.shown_answer(q.payload)
    return set(range(len(q.payload["options"]))) - {right}


# --- What it takes off -----------------------------------------------------------------


@pytest.mark.parametrize(("count", "taken"), [(2, 0), (3, 0), (4, 1), (5, 2), (6, 2)])
def test_the_wearer_loses_one_of_four_two_of_five_or_six_and_none_of_three(
    count: int, taken: int
) -> None:
    for answer in range(count):
        for _ in range(20):
            q = choice(count, answer)
            gone = removed(q)
            assert len(gone) == taken
            assert set(gone) <= wrong_ones(q)


def test_every_wrong_option_can_go() -> None:
    q = choice(6, 2)
    seen = {index for _ in range(200) for index in removed(q, player=uuid4())}
    assert seen == wrong_ones(q)


def test_the_pick_is_the_same_for_the_same_room_question_and_player_only() -> None:
    q, player = choice(6, 1), uuid4()
    assert removed(q, code="abyss", player=player) == removed(q, code="ABYSS", player=player)
    picks = {removed(q, player=uuid4()) for _ in range(40)}
    assert len(picks) > 1


def test_nothing_goes_without_a_charge_or_on_another_type() -> None:
    assert removed(choice(4), Worn("ring_of_wealth", 1, 0)) == ()
    assert removed(choice(4, host_only=True)) == ()
    assert removed(question("pick_all_that_apply")) == ()
    assert removed(choice(4), None) == ()


def test_a_charge_spent_and_the_last_one_breaks_it() -> None:
    assert items.spent(RING) == Worn("ring_of_wealth", 1, 2)
    assert items.spent(Worn("ring_of_wealth", 1, 1)) is None


def test_it_fits_only_a_round_with_a_multiple_choice_question_of_four_or_more() -> None:
    assert RING_OF_WEALTH.fits([choice(3), choice(4)])
    assert RING_OF_WEALTH.fits([question(), choice(6)])
    assert not RING_OF_WEALTH.fits([choice(3), choice(2), question()])
    assert not RING_OF_WEALTH.fits([choice(5, host_only=True)])
    assert not RING_OF_WEALTH.fits([question("pick_all_that_apply")])


# --- In a game -------------------------------------------------------------------------


def test_only_the_wearer_sees_options_gone(table, wealth_round, db) -> None:
    game = dealt(table, RING_OF_WEALTH, wealth_round, count=6)
    assert stored(db)["Bob"] == ("ring_of_wealth", 1, 3)
    index = next(i for i in range(1, 7) if options(game, i) >= 4)
    for i in range(1, index):
        play(game, i, {})
    opened = opened_by_name(game, index)

    q = game.question(index)
    full = q.client_view["options"]
    for name in ("Zezima", "Woox", "Lynx"):
        assert opened[name]["removed"] == []
        assert opened[name]["view"]["options"] == full
    for name in ("Bob", "Ann", "Admin"):
        gone = opened[name]["removed"]
        assert len(gone) == items.WEALTH_REMOVES[len(full)]
        assert set(gone) <= wrong_ones(q)
        assert opened[name]["view"]["options"] == full


def test_the_tv_gets_the_full_question(table, wealth_round) -> None:
    game = seated(
        table, *NAMES, "Telly", table_items=(RING_OF_WEALTH,), modes=two_rounds(wealth_round, 6)
    )
    telly = game.players[5]
    game.admin.send(t="set_tv", player_id=telly.id, on=True)
    game.admin.settle()
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    game.skip()
    assert wearing(game, "Bob") == RING
    index = next(i for i in range(1, 7) if options(game, i) >= 4)
    for i in range(1, index):
        play(game, i, {})
    opened = opened_by_name(game, index)
    assert opened["Telly"]["removed"] == []
    assert opened["Telly"]["view"]["options"] == game.question(index).client_view["options"]
    assert opened["Bob"]["removed"] != []


def test_a_charge_goes_only_where_an_option_goes_and_three_break_it(
    table, wealth_round, db
) -> None:
    game = dealt(table, RING_OF_WEALTH, wealth_round, count=6)
    bob = game.players[3]
    charges, emptied = 3, False
    for index in range(1, 7):
        opened = opened_by_name(game, index)
        count = options(game, index)
        takes = items.WEALTH_REMOVES.get(count, 0) if charges else 0
        assert len(opened["Bob"]["removed"]) == takes
        # Answered or not, a question it took options off costs the charge.
        if index % 2:
            answer_after(game, bob, index, game.right(index), AFTER[2])
        closed = close(game)
        if bob.id in closed["results"]:
            assert result(closed, bob.id) == (900, 0, None)
        if takes:
            charges -= 1
        held = wearing(game, "Bob")
        if charges:
            assert held == Worn("ring_of_wealth", 1, charges)
            assert stored(db)["Bob"] == ("ring_of_wealth", 1, charges)
        else:
            assert held is None and "Bob" not in stored(db)
            emptied = True
    assert emptied
    assert_memory_matches_db(game, db)


def test_a_reconnecting_wearer_sees_the_same_options_gone(table, client, wealth_round) -> None:
    game = dealt(table, RING_OF_WEALTH, wealth_round, count=6)
    zezima, bob = game.players[0], game.players[3]
    index = next(i for i in range(1, 7) if options(game, i) >= 5)
    for i in range(1, index):
        play(game, i, {})
    opened = opened_by_name(game, index)
    assert len(opened["Bob"]["removed"]) == 2
    for _ in range(2):
        with client.websocket_connect(f"/ws/{game.code}") as ws:
            welcome = reseat(bob, ws).take("welcome")
            assert welcome["question"]["removed"] == opened["Bob"]["removed"]
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        assert reseat(zezima, ws).take("welcome")["question"]["removed"] == []


def test_an_answer_naming_a_removed_option_is_bad_value(table, wealth_round, db) -> None:
    game = dealt(table, RING_OF_WEALTH, wealth_round, count=6)
    bob, zezima = game.players[3], game.players[0]
    index = next(i for i in range(1, 7) if options(game, i) >= 4)
    for i in range(1, index):
        play(game, i, {})
    opened = opened_by_name(game, index)
    gone = opened["Bob"]["removed"][0]
    qid = str(game.question(index).id)
    bob.send(t="answer", question_id=qid, value=gone)
    assert reply(bob, lambda m: m["t"] == "answer_ack")["code"] == "bad_value"
    # The option is still everyone else's to pick, and Bob may still answer.
    zezima.send(t="answer", question_id=qid, value=gone)
    assert reply(zezima, lambda m: m["t"] == "answer_ack")["t"] == "answer_ack"
    bob.send(t="answer", question_id=qid, value=game.right(index))
    assert reply(bob, lambda m: m["t"] == "answer_ack")["t"] == "answer_ack"


def test_never_dealt_into_a_round_without_four_options(table, three_options, db) -> None:
    game = seated(table, *NAMES, table_items=(RING_OF_WEALTH,), modes=two_rounds(three_options, 3))
    game.start()
    play(game, 0, BUCKETS)
    assert to_standings(game)["room"]["drops"] == []
    assert stored(db) == {}
