"""The lobby's "picking a name…": ``editing`` on, off, and every way it clears itself.

Each accept criterion of the feature is a test here, the client's half in its own tests.
"""

import time
from typing import Any
from uuid import UUID

import pytest

from app.rooms.lobby import CHANGE_COOLDOWN
from tests.game_api import Game, Seat, ready_of, tap, updated


def editing_of(message: dict[str, Any]) -> dict[str, bool]:
    return {p["display_name"]: p["editing"] for p in message["players"]}


def edits(game: Game, seat: Seat, on: bool = True) -> dict[str, Any]:
    """``seat`` opens or closes the menu; the update the admin sees it in."""
    seat.send(t="editing", on=on)
    return updated(game.admin, lambda m: editing_of(m).get(seat.name) is on)


def quiet(seat: Seat) -> None:
    """Nothing reached ``seat`` but the ``pong`` it asked for."""
    seat.send(t="ping")
    assert seat.ws.receive_json()["t"] == "pong"


@pytest.fixture
def lobby(table) -> Game:
    return table("Zezima", "Woox")


def test_opening_the_menu_reaches_everybody_and_closing_it_clears_it(lobby: Game, clock) -> None:
    zezima, woox = lobby.players
    opened = edits(lobby, zezima)
    assert opened["t"] == "players_updated"
    assert editing_of(opened) == {"Admin": False, "Zezima": True, "Woox": False}
    assert editing_of(woox.take("players_updated"))["Zezima"] is True
    clock[0] += CHANGE_COOLDOWN
    assert editing_of(edits(lobby, zezima, False))["Zezima"] is False


def test_a_disconnect_clears_it(lobby: Game) -> None:
    zezima = lobby.players[0]
    edits(lobby, zezima)
    zezima.ws.close()
    left = updated(lobby.admin, lambda m: not m["players"][1]["connected"])
    assert editing_of(left)["Zezima"] is False


def test_a_flag_left_on_clears_itself(lobby: Game) -> None:
    lobby.app.state.rooms.editing_seconds = 0.2
    zezima = lobby.players[0]
    started = time.monotonic()
    edits(lobby, zezima)
    cleared = updated(lobby.admin, lambda m: editing_of(m)["Zezima"] is False)
    assert cleared["t"] == "players_updated"
    assert time.monotonic() - started >= 0.2


def test_sending_it_again_restarts_the_expiry_and_broadcasts_nothing(lobby: Game) -> None:
    lobby.app.state.rooms.editing_seconds = 0.5
    zezima = lobby.players[0]
    edits(lobby, zezima)
    time.sleep(0.3)
    zezima.send(t="editing", on=True)
    zezima.settle()
    time.sleep(0.3)  # past the first expiry, inside the second
    assert lobby.room.players[UUID(zezima.id)].editing is True
    updated(lobby.admin, lambda m: editing_of(m)["Zezima"] is False)


def test_a_rename_while_editing_lands_with_the_flag_already_off(lobby: Game) -> None:
    zezima = lobby.players[0]
    edits(lobby, zezima)
    zezima.send(t="set_profile", display_name="Woox Jr")
    renamed = lobby.admin.take("room_updated")
    player = next(p for p in renamed["players"] if p["id"] == zezima.id)
    assert (player["display_name"], player["editing"]) == ("Woox Jr", False)


def test_a_refused_rename_leaves_them_editing(lobby: Game) -> None:
    zezima = lobby.players[0]
    edits(lobby, zezima)
    zezima.send(t="set_profile", display_name="woox")
    assert zezima.take("error")["code"] == "name_taken"
    assert lobby.room.players[UUID(zezima.id)].editing is True


def test_nobody_elses_ready_count_or_start_changes(lobby: Game) -> None:
    zezima, woox = lobby.players
    tap(lobby, lobby.admin)
    tap(lobby, woox)
    editing = edits(lobby, zezima)
    assert ready_of(editing) == {"Admin": True, "Zezima": False, "Woox": True}
    lobby.start()  # Start does not wait for the menu to close
    started = updated(lobby.admin, lambda m: m.get("room", {}).get("status") == "playing")
    assert not any(editing_of(started).values())  # and starting clears it


def test_spamming_open_and_close_is_held_to_two_changes_a_second(lobby: Game, clock) -> None:
    zezima, admin = lobby.players[0], lobby.admin
    admin.seen.clear()
    for _ in range(5):
        zezima.send(t="editing", on=True)
        zezima.send(t="editing", on=False)
    zezima.settle()
    admin.settle()
    # One on and one off got through; every later ``on`` fell inside the cooldown.
    changes = [m for m in admin.seen if m["t"] == "players_updated"]
    assert [editing_of(m)["Zezima"] for m in changes] == [True, False]
    clock[0] += CHANGE_COOLDOWN
    assert editing_of(edits(lobby, zezima))["Zezima"] is True


def test_it_is_ignored_outside_the_lobby(table) -> None:
    game = table("Zezima", seconds=10)
    game.start()
    game.opened(0)
    zezima = game.players[0]
    zezima.send(t="editing", on=True)
    quiet(zezima)
    assert game.room.players[UUID(zezima.id)].editing is False


def test_on_must_be_a_boolean(lobby: Game) -> None:
    lobby.players[0].send(t="editing", on="yes")
    assert lobby.players[0].take("error")["code"] == "bad_message"
