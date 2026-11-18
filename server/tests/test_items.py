"""Items for the lower half of the standings: the drop between rounds, dealt from a test
table, since no real item ships with the drop itself."""

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import replace
from datetime import date
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.rooms import items
from app.rooms.items import Answered, Effect, Item, Worn
from app.rooms.loop import _deals_items
from app.rooms.models import RoomQuestion
from app.ws.protocol import Daily
from tests.conftest import stub_mode
from tests.game_api import (
    AFTER,
    Game,
    answer_after,
    assert_memory_matches_db,
    closed_after,
    reseat,
    seconds_left,
    updated,
)
from tests.test_team_standings import seat_teams

NAMES = ("Zezima", "Woox", "Lynx", "Bob", "Ann")
# Round 1's buckets, so the standings are Zezima, Woox, Lynx, Bob, Ann, then Admin on 0: the
# lowest three positions receive, and the lowest two of those may draw strong.
BUCKETS = {"Zezima": 1, "Woox": 2, "Lynx": 3, "Bob": 4, "Ann": 5}


def anything(questions: Sequence[RoomQuestion]) -> bool:
    return True


def has_choice(questions: Sequence[RoomQuestion]) -> bool:
    return any(q.type == "multiple_choice" for q in questions)


def bonus(worn: Worn, answered: Answered) -> Effect:
    return Effect(100 if answered.credit > 0 else 0, worn)


def save(worn: Worn, answered: Answered) -> Effect:
    if answered.points < 500:
        return Effect(500 - answered.points, None)
    return Effect(0, worn)


def rise(worn: Worn, answered: Mapping[UUID, int]) -> Mapping[UUID, int]:
    if not answered:
        return {}
    return {min(answered, key=lambda question: answered[question]): 50}


BONUS = Item("bonus", "mild", anything, on_answer=bonus)
CHOICE = Item("choice", "mild", has_choice)
SAVE = Item("save", "strong", anything, on_answer=save)
RISE = Item("rise", "strong", anything, settle=rise)
CHARGED = Item("charged", "mild", anything, charges=3)
MANY = tuple(Item(f"plain_{n}", "mild", anything) for n in range(8))


@pytest.fixture
def third_mode(app: FastAPI, client: TestClient) -> Iterator[str]:
    yield from stub_mode(app, "third_round")


def seated(table, *names: str, table_items: Sequence[Item] = (BONUS,), **settings: Any) -> Game:
    """A lobby of ``names`` dealing from ``table_items``: one-question rounds of more_less,
    then the stubs, ten seconds each, standings 30 s; ``settings`` override."""
    rounds = settings.pop("rounds", ["more_less", "second_round"])
    questions = settings.pop("questions", 1)
    game = table(
        *names,
        **{
            "seconds": 10,
            "close_when_all_answered": False,
            "standings_seconds": 30,
            "mode_order": "listed",
            "modes": [{"mode": mode, "questions": questions} for mode in rounds],
            **settings,
        },
    )
    game.app.state.rooms.items = tuple(table_items)
    return game


def play(game: Game, index: int, buckets: Mapping[str, int], wrong: Sequence[str] = ()) -> Any:
    """Question ``index``: each named seat right in its bucket, ``wrong`` wrong, then closed."""
    game.opened(index)
    for seat in game.seats:
        if seat.name in buckets:
            answer_after(game, seat, index, game.right(index), AFTER[buckets[seat.name]])
        elif seat.name in wrong:
            answer_after(game, seat, index, game.wrong(index), AFTER[1])
    game.skip()
    return game.admin.take("question_closed")


def to_standings(game: Game) -> dict[str, Any]:
    return updated(game.admin, lambda m: m["room"]["phase"] == "standings")


def names_of(game: Game, frame: dict[str, Any]) -> dict[str, str]:
    by_id = {seat.id: seat.name for seat in game.seats}
    return {by_id[drop["player_id"]]: drop["item"] for drop in frame["room"]["drops"]}


def held(game: Game) -> dict[str, Worn]:
    return {p.display_name: p.item for p in game.room.players.values() if p.item is not None}


def stored(db) -> dict[str, tuple[str, int, int | None]]:
    rows = db("select display_name, item, item_round, item_charges from players")
    return {
        row["display_name"]: (row["item"], row["item_round"], row["item_charges"])
        for row in rows
        if row["item"] is not None
    }


# --- Who receives, and from which tier -------------------------------------------------


def ranked(*ranks: int) -> list[tuple[UUID, int]]:
    return [(uuid4(), rank) for rank in ranks]


def tiers(rows: list[tuple[UUID, int]]) -> list[str | None]:
    """Each row's tier in standings order, ``None`` for no item."""
    got = items.receivers(rows)
    return [got.get(player) for player, _ in rows]


def test_the_lowest_floor_half_receive_and_the_lowest_ceil_half_of_those_draw_strong() -> None:
    assert tiers(ranked(1, 2, 3, 4)) == [None, None, "mild", "strong"]
    assert tiers(ranked(1, 2, 3, 4, 5)) == [None, None, None, "mild", "strong"]
    assert tiers(ranked(1, 2, 3, 4, 5, 6)) == [None, None, None, "mild", "strong", "strong"]
    assert tiers(ranked(*range(1, 11))) == [None] * 5 + ["mild"] * 2 + ["strong"] * 3


def test_three_scoring_players_receive_nothing() -> None:
    assert items.receivers(ranked(1, 2, 3)) == {}


def test_a_tie_with_the_last_receiving_position_receives_too() -> None:
    # Ten players with the 5th and 6th level: both receive.
    assert tiers(ranked(1, 2, 3, 4, 5, 5, 6, 7, 8, 9)) == (
        [None] * 4 + ["mild"] * 3 + ["strong"] * 3
    )


def test_a_tie_at_the_strong_tier_edge_all_draw_strong() -> None:
    # Eight players, four receive, the lowest two draw strong; the 6th is level with the 7th.
    assert tiers(ranked(1, 2, 3, 4, 5, 6, 6, 7)) == [None] * 4 + ["mild"] + ["strong"] * 3
    assert tiers(ranked(1, 1, 1, 1)) == ["strong"] * 4


def test_the_draw_is_the_room_round_player_and_rematches_and_nothing_else() -> None:
    rows = ranked(*range(1, 41))
    dealt = items.deal(MANY, rows, "AbyssalWhip", 1, [], 0)
    assert dealt == items.deal(MANY, rows, "ABYSSALWHIP", 1, [], 0)
    assert len(dealt) == 20
    assert dealt != items.deal(MANY, rows, "ABYSSALWHIP", 1, [], 1)
    assert dealt != items.deal(MANY, rows, "ABYSSALWHIP", 2, [], 0)
    assert dealt != items.deal(MANY, rows, "DRAGONAXE", 1, [], 0)


def test_the_strong_tier_draws_from_strong_and_mild_and_the_mild_tier_from_mild_only() -> None:
    seen = {
        items.draw((BONUS, SAVE), tier, [], items.seeded("ROOM", 1, uuid4(), 0)).id
        for tier in ("strong", "mild")
        for _ in range(60)
    }
    assert seen == {"bonus", "save"}
    assert {
        items.draw((BONUS, SAVE), "mild", [], items.seeded("ROOM", 1, uuid4(), 0)).id
        for _ in range(60)
    } == {"bonus"}


def test_no_drop_in_a_daily_room_a_team_game_or_with_the_setting_off(table, second_mode) -> None:
    room = seated(table, *NAMES).room
    assert _deals_items(room)
    assert not _deals_items(replace(room, daily=Daily(day=date(2026, 11, 18), number=1)))
    teams = room.settings.model_copy(update={"teams": ["saradomin", "zamorak"]})
    assert not _deals_items(replace(room, settings=teams))
    off = room.settings.model_copy(update={"items": False})
    assert not _deals_items(replace(room, settings=off))


# --- The drop in a game ---------------------------------------------------------------


def test_a_drop_goes_to_the_lowest_floor_half_and_nobody_else(table, second_mode, db) -> None:
    game = seated(table, *NAMES)
    game.start()
    play(game, 0, BUCKETS)
    frame = to_standings(game)

    assert names_of(game, frame) == {"Bob": "bonus", "Ann": "bonus", "Admin": "bonus"}
    assert [d["player_id"] for d in frame["room"]["drops"]] == [
        s["player_id"] for s in frame["standings"][3:]
    ]
    shown = {p["display_name"]: p["item"] for p in frame["players"] if p["item"] is not None}
    assert shown == dict.fromkeys(("Bob", "Ann", "Admin"), {"id": "bonus", "charges": None})
    assert stored(db) == dict.fromkeys(("Bob", "Ann", "Admin"), ("bonus", 1, None))


def test_no_drop_with_three_scoring_players_however_many_seats(table, second_mode, db) -> None:
    game = seated(table, "Zezima", "Woox", "Telly")
    telly = game.players[2]
    game.admin.send(t="set_tv", player_id=telly.id, on=True)
    game.admin.settle()
    game.start()
    play(game, 0, {"Zezima": 1})
    assert to_standings(game)["room"]["drops"] == []
    assert held(game) == {} and stored(db) == {}


def test_no_drop_with_the_setting_off(table, second_mode, db) -> None:
    game = seated(table, *NAMES, items=False)
    game.start()
    play(game, 0, BUCKETS)
    assert to_standings(game)["room"]["drops"] == []
    assert held(game) == {} and stored(db) == {}


def test_no_drop_in_a_team_game(table, second_mode, db) -> None:
    game = seated(table, *NAMES, teams=["saradomin", "zamorak"])
    seat_teams(
        game,
        {name: ("saradomin", "zamorak")[n % 2] for n, name in enumerate(("Admin", *NAMES))},
    )
    game.start()
    play(game, 0, BUCKETS)
    assert to_standings(game)["room"]["drops"] == []
    assert held(game) == {} and stored(db) == {}


def test_no_drop_before_the_first_round_or_after_the_last(table, second_mode, db) -> None:
    game = seated(table, *NAMES)
    game.start()
    assert held(game) == {}
    play(game, 0, BUCKETS)
    to_standings(game)
    assert len(held(game)) == 3
    game.skip()
    play(game, 1, {"Zezima": 1})
    game.admin.take("game_finished")
    assert held(game) == {} and stored(db) == {}


def test_the_strong_items_go_only_to_the_lowest_half_of_the_receivers(
    table, second_mode, db
) -> None:
    game = seated(table, *NAMES, table_items=(SAVE,))
    game.start()
    play(game, 0, BUCKETS)
    assert names_of(game, to_standings(game)) == {"Ann": "save", "Admin": "save"}
    assert set(stored(db)) == {"Ann", "Admin"}


def test_an_item_is_never_dealt_into_a_round_it_does_nothing_in(table, second_mode, db) -> None:
    game = seated(table, *NAMES, table_items=(CHOICE,))
    game.start()
    play(game, 0, BUCKETS)
    assert to_standings(game)["room"]["drops"] == []
    assert stored(db) == {}


def test_the_draw_is_the_same_after_a_restart(table, second_mode, client, evict, db) -> None:
    game = seated(table, *NAMES, table_items=MANY)
    game.start()
    play(game, 0, BUCKETS)
    drops = names_of(game, to_standings(game))
    before = stored(db)
    assert set(before) == {"Bob", "Ann", "Admin"}
    assert {name: item for name, (item, _, _) in before.items()} == drops

    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_after(seat) == 1012
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        welcome = admin.take("welcome")
        assert welcome["room"]["phase"] == "reveal"
        assert {
            p["display_name"]: p["item"]["id"] for p in welcome["players"] if p["item"]
        } == drops
        game.skip(admin)
        assert admin.take("question_open")["question"]["index"] == 1
        assert stored(db) == before


def test_the_draw_is_the_same_after_a_rename(table, second_mode, db) -> None:
    game = seated(table, *NAMES, table_items=MANY)
    bob = game.players[3]
    bob.send(t="set_profile", display_name="Bobby")
    bob.settle()
    game.start()
    play(game, 0, BUCKETS)
    frame = to_standings(game)
    room = game.room
    expected = items.deal(
        MANY,
        [(UUID(s["player_id"]), s["rank"]) for s in frame["standings"]],
        game.code,
        1,
        room.questions[1:2],
        0,
    )
    assert {str(pid): worn.item for pid, worn in expected.items()} == {
        d["player_id"]: d["item"] for d in frame["room"]["drops"]
    }
    assert "Bobby" in stored(db)


def test_a_restart_that_skips_the_standings_still_breaks_and_deals(
    table, second_mode, client, evict, db
) -> None:
    game = seated(table, *NAMES, reveal_seconds=30)
    game.start()
    play(game, 0, BUCKETS)
    assert evict(game.code) is True
    for seat in game.seats:
        assert closed_after(seat) == 1012
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        admin = reseat(game.admin, ws)
        assert admin.take("welcome")["room"]["phase"] == "reveal"
        game.skip(admin)
        assert admin.take("question_open")["question"]["index"] == 1
        assert "standings" not in [m["room"]["phase"] for m in admin.seen if "room" in m]
    assert set(stored(db)) == {"Bob", "Ann", "Admin"}


def test_every_item_is_gone_at_the_end_of_its_round_and_the_next_drop_deals_anew(
    table, second_mode, third_mode, db
) -> None:
    game = seated(table, *NAMES, rounds=["more_less", second_mode, third_mode])
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    assert stored(db) == dict.fromkeys(("Bob", "Ann", "Admin"), ("bonus", 1, None))
    game.skip()

    # Admin's 1000 and the bonus's 100 lift them to the top; Lynx falls into the receivers.
    play(game, 1, {"Admin": 1})
    frame = to_standings(game)
    assert names_of(game, frame) == dict.fromkeys(("Lynx", "Bob", "Ann"), "bonus")
    assert stored(db) == dict.fromkeys(("Lynx", "Bob", "Ann"), ("bonus", 2, None))
    assert set(held(game)) == {"Lynx", "Bob", "Ann"}
    game.skip()

    play(game, 2, {})
    game.admin.take("game_finished")
    assert held(game) == {} and stored(db) == {}


def test_item_points_count_in_points_gained_and_show_as_their_own_reveal_line(
    table, second_mode, db
) -> None:
    game = seated(table, *NAMES)
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    game.skip()
    closed = play(game, 1, {"Bob": 1, "Zezima": 1})

    bob, zezima = game.players[3], game.players[0]
    assert closed["results"][bob.id] == {
        "value": game.right(1),
        "correct": True,
        "credit": 1.0,
        "points": 1000,
        "item_points": 100,
        "item": "bonus",
        "by_book": False,
    }
    assert (closed["results"][zezima.id]["item_points"], closed["results"][zezima.id]["item"]) == (
        0,
        None,
    )
    standing = next(s for s in closed["standings"] if s["player_id"] == bob.id)
    assert (standing["points"], standing["points_gained"]) == (700 + 1100, 1100)
    rows = db("select points, item_points, item from answers where item is not null")
    assert [(r["points"], r["item_points"], r["item"]) for r in rows] == [(1000, 100, "bonus")]
    assert_memory_matches_db(game, db)


def test_question_stats_hold_the_same_credit_with_and_without_an_item(
    table, second_mode, db
) -> None:
    game = seated(table, *NAMES)
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    game.skip()
    closed = play(game, 1, {"Bob": 1, "Zezima": 1}, wrong=["Woox"])
    assert closed["results"][game.players[3].id]["item_points"] == 100

    (row,) = db("select answers, credit_sum, correct from question_stats")
    assert (row["answers"], row["credit_sum"], row["correct"]) == (3, 2.0, 2)
    credits = db("select credit from answer_timings order by credit")
    assert [r["credit"] for r in credits] == [0.0, 1.0, 1.0]


def test_a_reconnecting_player_gets_their_held_item_back(table, second_mode, client) -> None:
    game = seated(table, *NAMES, table_items=(CHARGED,))
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        welcome = reseat(game.players[3], ws).take("welcome")
    assert welcome["you"]["item"] == {"id": "charged", "charges": 3}
    assert welcome["room"]["drops"] == [
        {"player_id": seat.id, "item": "charged"}
        for seat in (game.players[3], game.players[4], game.admin)
    ]


def test_the_standings_run_4_seconds_longer_when_a_drop_has_receivers(table, second_mode) -> None:
    game = seated(table, *NAMES)
    game.start()
    play(game, 0, BUCKETS)
    assert 32 < seconds_left(to_standings(game)) <= 34


def test_the_standings_run_as_set_when_a_drop_has_none(table, second_mode) -> None:
    game = seated(table, *NAMES, table_items=(CHOICE,))
    game.start()
    play(game, 0, BUCKETS)
    assert seconds_left(to_standings(game)) <= 30


def test_with_the_standings_off_items_are_still_dealt(table, second_mode, db) -> None:
    game = seated(table, *NAMES, standings_seconds=0)
    game.start()
    play(game, 0, BUCKETS)
    assert game.admin.take("question_open")["question"]["index"] == 1
    assert stored(db) == dict.fromkeys(("Bob", "Ann", "Admin"), ("bonus", 1, None))


def test_a_round_cut_short_still_drops(table, second_mode, db) -> None:
    game = seated(table, *NAMES, questions=2, reveal_seconds=30)
    game.start()
    play(game, 0, BUCKETS)
    game.admin.send(t="end_round", index=0)
    assert names_of(game, to_standings(game)) == dict.fromkeys(("Bob", "Ann", "Admin"), "bonus")
    assert set(stored(db)) == {"Bob", "Ann", "Admin"}


def test_an_item_that_breaks_on_use_leaves_its_slot_empty(table, second_mode, db) -> None:
    game = seated(table, *NAMES, table_items=(SAVE,), questions=2)
    game.start()
    play(game, 0, BUCKETS)
    play(game, 1, {})
    to_standings(game)
    game.skip()
    ann = game.players[4]

    closed = play(game, 2, {}, wrong=["Ann"])
    assert (closed["results"][ann.id]["points"], closed["results"][ann.id]["item_points"]) == (
        0,
        500,
    )
    assert set(held(game)) == {"Admin"} and set(stored(db)) == {"Admin"}
    closed = play(game, 3, {}, wrong=["Ann"])
    assert closed["results"][ann.id]["item_points"] == 0
    assert_memory_matches_db(game, db)


def test_an_item_settles_at_the_close_of_its_rounds_last_question(table, second_mode, db) -> None:
    game = seated(table, *NAMES, table_items=(RISE,), questions=2)
    game.start()
    play(game, 0, BUCKETS)
    play(game, 1, {})
    to_standings(game)
    game.skip()
    ann = game.players[4]

    play(game, 2, {"Ann": 5})
    closed = play(game, 3, {"Ann": 1})
    standing = next(s for s in closed["standings"] if s["player_id"] == ann.id)
    assert standing["points_gained"] == 600 + 1000 + 50
    rows = db(
        "select q.position, a.points, a.item_points, a.item from answers a"
        " join questions q on q.id = a.question_id join players p on p.id = a.player_id"
        " where p.display_name = 'Ann' order by q.position"
    )
    assert [(r["position"], r["points"], r["item_points"], r["item"]) for r in rows] == [
        (0, 600, 0, None),
        (2, 600, 50, "rise"),
        (3, 1000, 0, None),
    ]
    assert_memory_matches_db(game, db)


def test_a_rematch_empties_every_slot_and_counts_the_game(table, second_mode, db) -> None:
    game = seated(table, *NAMES, questions=1)
    game.start()
    play(game, 0, BUCKETS)
    to_standings(game)
    # As though a slot had outlived the game: the rematch empties it all the same.
    db("update players set item = 'bonus', item_round = 1")
    game.skip()
    play(game, 1, {})
    game.admin.take("game_finished")
    game.admin.send(t="rematch")
    updated(game.admin, lambda m: m["room"]["status"] == "lobby")
    assert game.room.rematches == 1
    assert [r["rematches"] for r in db("select rematches from rooms")] == [1]
    assert stored(db) == {} and held(game) == {}
