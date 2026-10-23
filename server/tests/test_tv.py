"""The room's TV (section 6): ``set_tv`` marks one player in the lobby as the screen that
shows the question to the room. The TV is no admin, keeps no ready or team, and its role
is a column, so it survives a restart. In the game it only watches: it answers nothing and
counts for nothing.
"""

import time
from uuid import UUID

import asyncpg
import pytest

from app.rooms.errors import BadState
from app.rooms.ready import EVERYONE_READY_SECONDS, THRESHOLD_SECONDS
from tests.game_api import Game, Seat, seconds_left, tap
from tests.rooms_api import call, create_fast, hello, join


@pytest.fixture
def game(table) -> Game:
    """An admin and two players in the lobby, connected."""
    return table("Zezima", "Woox", seconds=10, reveal_seconds=1)


def roles(message: dict) -> list[str]:
    return [p["role"] for p in message["players"]]


def mark(game: Game, seat: Seat, on: bool = True, by: Seat | None = None) -> dict:
    """``set_tv`` from ``by`` (the admin by default); the ``room_updated`` it causes."""
    (by or game.admin).send(t="set_tv", player_id=seat.id, on=on)
    return game.players[-1].take("room_updated")


def stored_roles(db) -> list[str]:
    return [r["role"] for r in db("select role from players order by joined_at")]


def test_set_tv_on_makes_a_player_the_tv_in_room_updated_and_a_later_welcome(game, db) -> None:
    tv = game.players[0]
    assert roles(mark(game, tv)) == ["admin", "tv", "player"]
    assert stored_roles(db) == ["admin", "tv", "player"]
    with game.client.websocket_connect(f"/ws/{game.code}") as ws:
        welcome = hello(ws, tv.session)
        assert welcome["you"]["role"] == "tv"
        assert roles(welcome) == ["admin", "tv", "player"]


def test_marking_a_second_player_moves_the_tv(game, db) -> None:
    first, second = game.players
    mark(game, first)
    assert roles(mark(game, second)) == ["admin", "player", "tv"]
    assert stored_roles(db) == ["admin", "player", "tv"]


def test_set_tv_off_makes_the_tv_a_player(game, db) -> None:
    tv = game.players[0]
    mark(game, tv)
    assert roles(mark(game, tv, on=False)) == ["admin", "player", "player"]
    assert stored_roles(db) == ["admin", "player", "player"]


def test_a_player_cannot_set_the_tv(game) -> None:
    player, other = game.players
    player.send(t="set_tv", player_id=other.id, on=True)
    assert player.take("error")["code"] == "not_admin"
    assert game.room.players[UUID(other.id)].role == "player"


def test_set_tv_outside_the_lobby_is_bad_state(game) -> None:
    game.start()
    game.opened(0)
    game.admin.send(t="set_tv", player_id=game.players[0].id, on=True)
    assert game.admin.take("error")["code"] == "bad_state"
    assert game.room.players[UUID(game.players[0].id)].role == "player"


def test_the_last_admin_cannot_be_the_tv(game, db) -> None:
    game.admin.send(t="set_tv", player_id=game.admin.id, on=True)
    assert game.admin.take("error")["code"] == "bad_state"
    assert stored_roles(db) == ["admin", "player", "player"]


def test_an_admin_may_mark_themselves_while_another_admin_remains(game, db) -> None:
    other = game.players[0]
    game.admin.send(t="promote", player_id=other.id)
    game.players[-1].take("room_updated")
    assert roles(mark(game, game.admin)) == ["tv", "admin", "player"]
    # No longer an admin, so the former admin's own admin messages are refused.
    game.admin.send(t="set_tv", player_id=other.id, on=True)
    assert game.admin.take("error")["code"] == "not_admin"


@pytest.mark.parametrize("frame", [{"t": "start_game"}, {"t": "skip", "phase": "open", "index": 0}])
def test_the_tv_is_not_an_admin(game, frame: dict) -> None:
    tv = game.players[0]
    mark(game, tv)
    tv.send(**frame)
    assert tv.take("error")["code"] == "not_admin"
    assert game.room.status == "lobby"


def test_promote_of_the_tv_is_bad_state(game, db) -> None:
    tv = game.players[0]
    mark(game, tv)
    game.admin.send(t="promote", player_id=tv.id)
    assert game.admin.take("error")["code"] == "bad_state"
    assert stored_roles(db) == ["admin", "tv", "player"]


def test_the_tv_can_be_kicked(game, db) -> None:
    tv = game.players[0]
    mark(game, tv)
    game.admin.send(t="kick", player_id=tv.id)
    assert roles(game.players[1].take("room_updated")) == ["admin", "player"]


def test_the_tv_role_survives_a_restart(game, evict, db) -> None:
    tv = game.players[0]
    mark(game, tv)
    assert evict(game.code)
    with game.client.websocket_connect(f"/ws/{game.code}") as ws:
        welcome = hello(ws, game.admin.session)
        assert roles(welcome) == ["admin", "tv", "player"]
    assert game.room.players[UUID(tv.id)].role == "tv"


def test_the_tv_is_unready_and_cannot_ready(game) -> None:
    tv = game.players[0]
    tap(game, tv)
    update = mark(game, tv)
    assert [p["ready"] for p in update["players"]] == [False, False, False]
    tv.send(t="ready", ready=True)
    assert tv.take("error")["code"] == "bad_state"


def test_the_tv_is_teamless_and_ignored_by_the_team_check(table, db) -> None:
    game = table("Zezima", "Woox", "Lynx", seconds=10, teams=["saradomin", "zamorak"])
    admin, first, second, tv = game.seats
    for seat, team in [(admin, "saradomin"), (first, "zamorak"), (second, "zamorak")]:
        seat.send(t="set_team", team=team)
        seat.settle()
    tv.send(t="set_team", team="saradomin")
    tv.settle()
    update = mark(game, tv)
    assert [p["team"] for p in update["players"]] == ["saradomin", "zamorak", "zamorak", None]
    assert db("select team from players where id = $1", UUID(tv.id))[0]["team"] is None
    tv.send(t="set_team", team="zamorak")
    assert tv.take("error")["code"] == "bad_state"
    admin.send(t="move_team", player_id=tv.id, team="zamorak")
    assert admin.take("error")["code"] == "bad_state"
    admin.send(t="start_game")
    assert admin.take("question_open")["question"]["index"] == 0


def test_the_database_holds_one_tv_a_room(game, db) -> None:
    mark(game, game.players[0])
    with pytest.raises(asyncpg.UniqueViolationError):
        db("update players set role = 'tv' where id = $1", UUID(game.players[1].id))


# --- the TV sits out the game --------------------------------------------------------


def test_the_tv_cannot_answer_and_its_answer_is_excluded(game, db) -> None:
    tv = game.players[0]
    mark(game, tv)
    game.start()
    frames = zip(game.seats, game.opened(0), strict=True)
    opened = {seat.name: m["question"]["you_can_answer"] for seat, m in frames}
    assert opened == {game.admin.name: True, "Zezima": False, "Woox": True}
    game.answer(tv, 0, game.right(0))
    assert tv.take("error")["code"] == "excluded"
    assert db("select count(*) as n from answers")[0]["n"] == 0


def test_of_and_unanswered_leave_out_the_tv(game) -> None:
    tv, woox = game.players
    mark(game, tv)
    game.start()
    assert {m["question"]["of"] for m in game.opened(0)} == {2}
    game.answer(game.admin, 0, game.right(0))
    assert game.admin.take("answer_ack")["of"] == 2
    game.skip()
    assert game.admin.take("question_closed")["unanswered"] == [woox.id]


def test_waiting_names_who_is_still_to_answer_and_never_the_tv(game) -> None:
    tv, woox = game.players
    mark(game, tv)
    game.start()
    assert [m["question"]["waiting"] for m in game.opened(0)] == [[game.admin.id, woox.id]] * 3
    game.answer(game.admin, 0, game.right(0))
    game.admin.take("answer_ack")
    assert tv.take("answer_count")["waiting"] == [woox.id]


def test_everyone_but_the_tv_answering_closes_the_question(game) -> None:
    mark(game, game.players[0])
    game.start()
    game.opened(0)
    started = time.monotonic()
    for seat in (game.admin, game.players[1]):
        game.answer(seat, 0, game.right(0))
        seat.take("answer_ack")
    game.admin.take("question_closed")
    assert time.monotonic() - started < 5  # not the ten seconds the question had


def test_a_splash_counts_neither_the_tv_nor_its_threshold(table) -> None:
    """Two players and a TV: one tap of two starts the count, two bring it to three seconds."""
    game = table("Zezima", "Woox", seconds=10, splash=True)
    tv, woox = game.players
    mark(game, tv)
    game.start()
    game.splash()
    one = tap(game, game.admin)
    assert EVERYONE_READY_SECONDS < seconds_left(one) <= THRESHOLD_SECONDS
    both = tap(game, woox)
    assert 0 < seconds_left(both) <= EVERYONE_READY_SECONDS


def test_standings_and_game_finished_leave_out_the_tv(table) -> None:
    game = table("Zezima", "Woox", seconds=1, reveal_seconds=1)
    tv = game.players[0]
    mark(game, tv)
    game.start()
    closed = game.admin.take("question_closed")
    assert tv.id not in {s["player_id"] for s in closed["standings"]}
    finished = tv.take("game_finished")
    assert [s["player_id"] for s in finished["standings"]] == [game.admin.id, game.players[1].id]


def test_start_game_with_only_the_tv_connected_is_refused(app, client) -> None:
    room, admin, _ = create_fast(app, client)
    body = join(client, room.code, "Zezima").json()
    manager = app.state.rooms
    with client.websocket_connect(f"/ws/{room.code}") as ws:
        hello(ws, body["session"])
        call(client, manager.set_tv, room.code, admin, UUID(body["player"]["id"]), True)
        with pytest.raises(BadState) as info:
            call(client, manager.start_game, room.code, admin)
    assert info.value.message == "nobody but the TV is connected to play"
    assert call(client, manager.get, room.code).status == "lobby"
