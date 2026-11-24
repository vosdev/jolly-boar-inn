"""Emotes at the table: who may send one when, the line everyone shares, and the cooldown."""

import random
from typing import Any

import pytest

from app.metrics import REGISTRY
from app.rooms.emotes import EMOTE_COOLDOWN
from tests.game_api import Game, Seat, reseat
from tests.test_daily_play import quick, seat, started  # noqa: F401  # ``quick`` is a fixture


def emote(seat: Seat, name: str = "wave") -> None:
    seat.send(t="emote", emote=name)


def emotes_after_ping(seat: Seat) -> list[dict[str, Any]]:
    """Every ``emote`` frame that reached ``seat`` before the ``pong`` it now asks for."""
    seat.seen.clear()
    seat.settle()
    return [m for m in seat.seen if m["t"] == "emote"]


def refused(seat: Seat, name: str = "wave") -> str:
    emote(seat, name)
    return seat.take("error")["code"]


def limited() -> float:
    return REGISTRY.get_sample_value("jbi_rate_limited_total", {"limiter": "emotes"}) or 0.0


@pytest.fixture
def game(table) -> Game:
    """An admin, two players and a TV in the lobby, with questions that stay open."""
    game = table("Zezima", "Woox", "Telly", seconds=30, reveal_seconds=30)
    telly = game.players[2]
    game.admin.send(t="set_tv", player_id=telly.id, on=True)
    for each in game.seats:
        each.take("room_updated")
    return game


def test_an_emote_reaches_everyone_the_tv_and_sender_included_with_the_same_line(game) -> None:
    zezima = game.players[0]
    emote(zezima, "cheer")
    frames = [each.take("emote") for each in game.seats]
    assert {(f["player_id"], f["emote"], f["line"]) for f in frames} == {
        (zezima.id, "cheer", frames[0]["line"])
    }
    assert frames[0]["line"] in (0, 1)


def test_the_server_picks_either_line(game, clock) -> None:
    game.app.state.rooms.rng = random.Random(7)
    zezima = game.players[0]
    lines = set()
    for _ in range(12):
        emote(zezima)
        lines.add(zezima.take("emote")["line"])
        clock[0] += EMOTE_COOLDOWN
    assert lines == {0, 1}


def test_an_unknown_emote_is_bad_value(game) -> None:
    assert refused(game.players[0], "dance") == "bad_value"


def test_the_tv_is_bad_state(game) -> None:
    assert refused(game.players[2]) == "bad_state"


def test_an_open_question_is_bad_state_until_answered(game) -> None:
    zezima, woox = game.players[:2]
    game.start()
    game.opened(0)
    assert refused(zezima) == "bad_state"
    game.answer(zezima, 0, game.right(0))
    zezima.take("answer_ack")
    emote(zezima)
    assert woox.take("emote")["player_id"] == zezima.id


def test_a_player_who_cannot_answer_the_open_question_may_emote(game) -> None:
    zezima = game.players[0]
    game.start()
    game.opened(0)
    game.question(0).host_only = True  # nobody answers a host's own question
    emote(zezima)
    assert zezima.take("emote")["player_id"] == zezima.id


def test_a_reveal_allows_it(game) -> None:
    zezima = game.players[0]
    game.start()
    game.opened(0)
    game.skip()
    zezima.take("question_closed")
    emote(zezima)
    assert zezima.take("emote")["player_id"] == zezima.id


def test_the_splash_is_bad_state(table) -> None:
    game = table("Zezima", splash=True)
    game.start()
    game.splash(game.players[0])
    assert refused(game.players[0]) == "bad_state"


def test_the_standings_are_bad_state(table) -> None:
    game = table("Zezima", modes=["more_less", "bestiary"], questions=1, standings_seconds=30)
    game.start()
    game.opened(0)
    game.skip()
    game.players[0].take("question_closed")
    game.skip()
    for _ in range(10):
        if game.players[0].take("room_updated")["room"]["phase"] == "standings":
            break
    else:
        raise AssertionError("the standings never came")
    assert refused(game.players[0]) == "bad_state"


def test_the_final_hiscores_are_bad_state(table) -> None:
    game = table("Zezima", questions=1, seconds=30, reveal_seconds=30)
    game.start()
    game.opened(0)
    game.skip()
    game.players[0].take("question_closed")
    game.skip()
    game.players[0].take("game_finished")
    assert refused(game.players[0]) == "bad_state"


def test_a_daily_room_is_bad_state(quick, client) -> None:  # noqa: F811
    code, session = started(client)
    with seat(client, code, session) as ws:
        ws.send_json({"t": "emote", "emote": "wave"})
        for _ in range(10):
            message = ws.receive_json()
            if message["t"] == "error":
                break
        assert message["code"] == "bad_state"


def test_a_second_emote_within_three_seconds_is_dropped_without_an_error(game, clock) -> None:
    zezima, woox = game.players[:2]
    before = limited()
    emote(zezima, "wave")
    emote(zezima, "cry")
    assert [f["emote"] for f in emotes_after_ping(zezima)] == ["wave"]
    assert "error" not in [m["t"] for m in zezima.seen]
    assert limited() == before + 1
    clock[0] += EMOTE_COOLDOWN
    emote(zezima, "cry")
    assert [f["emote"] for f in emotes_after_ping(zezima)] == ["cry"]
    assert [f["emote"] for f in emotes_after_ping(woox)] == ["wave", "cry"]


def test_the_cooldown_is_each_players_own(game) -> None:
    zezima, woox = game.players[:2]
    emote(zezima)
    emote(woox)
    assert [f["player_id"] for f in emotes_after_ping(game.admin)] == [zezima.id, woox.id]


def test_a_reconnecting_player_gets_no_old_emotes(game) -> None:
    zezima, woox = game.players[:2]
    emote(zezima)
    woox.take("emote")
    woox.ws.close()
    with game.client.websocket_connect(f"/ws/{game.code}") as ws:
        again = reseat(woox, ws)
        welcome = again.take("welcome")
        assert "emote" not in welcome and "emotes" not in welcome
        assert emotes_after_ping(again) == []
