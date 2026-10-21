"""Team games: ``settings.teams`` names the gods playing, and every player starts teamless."""

from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.rooms.lobby import CHANGE_COOLDOWN
from app.rooms.settings import NewRoomSettings, RoomSettings
from app.rooms.teams import GODS
from tests.rooms_api import closed_with, create, create_fast, held, hello, join, next_of

ROUND = [{"mode": "more_less", "questions": 3}]


def post(client: TestClient, **settings: Any) -> Any:
    return client.post(
        "/api/rooms",
        json={
            "returning": False,
            "display_name": "Admin",
            "settings": {"modes": ROUND, **settings},
        },
    )


@pytest.mark.parametrize(
    "teams",
    [list(GODS[:2]), ["saradomin", "zaros"], list(GODS[1:5]), list(GODS)],
)
def test_a_room_is_created_with_two_to_six_gods(client: TestClient, teams: list[str]) -> None:
    response = post(client, teams=teams)
    assert response.status_code == 201, response.text
    code = response.json()["code"].upper()
    assert client.get(f"/api/rooms/{code}").status_code == 200
    with client.websocket_connect(f"/ws/{code}") as ws:
        assert hello(ws, response.json()["session"])["room"]["settings"]["teams"] == teams


@pytest.mark.parametrize(
    "teams",
    [
        ["saradomin"],
        [*GODS, "saradomin"],
        ["saradomin", "saradomin"],
        ["saradomin", "seren"],
        ["zamorak", "saradomin"],
        "saradomin",
        None,
    ],
    ids=["one", "seven", "duplicate", "unknown", "out_of_order", "not_a_list", "null"],
)
def test_any_other_teams_is_a_422(client: TestClient, teams: Any) -> None:
    assert post(client, teams=teams).status_code == 422


def test_no_teams_is_an_empty_list_and_plays_as_today(app: FastAPI, client: TestClient) -> None:
    assert NewRoomSettings().teams == []
    room, _, session = create_fast(app, client)
    assert room.settings.teams == []
    with client.websocket_connect(f"/ws/{room.code}") as ws:
        welcome = hello(ws, session)
        assert welcome["room"]["settings"]["teams"] == []
        ws.send_json({"t": "start_game"})
        assert next_of(ws, "question_open")["question"]["index"] == 0


def test_a_joined_player_is_teamless(client: TestClient) -> None:
    code, admin = create(client, modes=ROUND, teams=["saradomin", "zamorak"])
    with client.websocket_connect(f"/ws/{code}") as admin_ws:
        welcome = hello(admin_ws, admin["session"])
        assert welcome["you"]["team"] is None
        response = join(client, code, "Zezima")
        assert response.status_code == 200, response.text
        assert response.json()["player"]["team"] is None
        players = next_of(admin_ws, "room_updated")["players"]
        assert [p["team"] for p in players] == [None, None]
    with client.websocket_connect(f"/ws/{code}") as ws:
        welcome = hello(ws, response.json()["session"])
        assert welcome["you"]["team"] is None
        assert [p["team"] for p in welcome["players"]] == [None, None]


def test_a_stored_team_room_rehydrates_with_its_teams(
    client: TestClient, evict: Any, db: Any
) -> None:
    teams = ["zamorak", "armadyl", "zaros"]
    code, admin = create(client, modes=ROUND, teams=teams)
    assert evict(code)
    with client.websocket_connect(f"/ws/{code}") as ws:
        welcome = hello(ws, admin["session"])
        assert welcome["room"]["settings"]["teams"] == teams
        assert welcome["you"]["team"] is None
    # Written behind the app's back so the read path alone is under test.
    db("update players set team = 'zaros' where id = $1", UUID(admin["player"]["id"]))
    assert evict(code)
    with client.websocket_connect(f"/ws/{code}") as ws:
        assert hello(ws, admin["session"])["you"]["team"] == "zaros"


def test_a_room_stored_before_teams_reads_as_none() -> None:
    assert RoomSettings.stored({"modes": ROUND}).teams == []


# --- Picking a team ----------------------------------------------------------------

TWO = ["saradomin", "zamorak"]


@pytest.fixture
def team_lobby(client: TestClient) -> dict[str, Any]:
    """A team room of Saradomin and Zamorak with its admin and one joined player."""
    code, admin = create(client, modes=ROUND, teams=TWO)
    player = join(client, code, "Zezima").json()
    return {"code": code, "admin": admin, "player": player}


def teams_of(players: list[dict[str, Any]]) -> dict[str, str | None]:
    return {p["display_name"]: p["team"] for p in players}


def refused(ws: Any, frame: dict[str, Any]) -> str:
    """Send ``frame``; the code of the ``error`` it gets, the socket still open after it."""
    ws.send_json(frame)
    code = next_of(ws, "error")["code"]
    ws.send_json({"t": "ping"})
    assert next_of(ws, "pong")
    return code


def test_set_team_joins_a_team_and_everyone_hears_it(
    client: TestClient, team_lobby: dict[str, Any], db: Any, clock: Any
) -> None:
    code, admin, player = team_lobby["code"], team_lobby["admin"], team_lobby["player"]
    with (
        client.websocket_connect(f"/ws/{code}") as one,
        client.websocket_connect(f"/ws/{code}") as two,
    ):
        hello(one, admin["session"])
        hello(two, player["session"])
        next_of(one, "players_updated")  # the second socket connecting
        two.send_json({"t": "set_team", "team": "zamorak"})
        for ws in (one, two):
            players = next_of(ws, "players_updated")["players"]
            assert teams_of(players) == {"Admin": None, "Zezima": "zamorak"}
        # One change a second, like ready.
        assert refused(two, {"t": "set_team", "team": "saradomin"}) == "bad_state"
        clock[0] += CHANGE_COOLDOWN
        two.send_json({"t": "set_team", "team": "saradomin"})
        assert teams_of(next_of(one, "players_updated")["players"])["Zezima"] == "saradomin"
    row = db("select team from players where id = $1", UUID(player["player"]["id"]))
    assert row[0]["team"] == "saradomin"


def test_set_team_while_ready_or_to_a_god_not_playing_is_refused(
    client: TestClient, team_lobby: dict[str, Any], clock: Any
) -> None:
    code, player = team_lobby["code"], team_lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, player["session"])
        assert refused(ws, {"t": "set_team", "team": "zaros"}) == "bad_value"
        ws.send_json({"t": "set_team", "team": "saradomin"})
        next_of(ws, "players_updated")
        clock[0] += CHANGE_COOLDOWN
        ws.send_json({"t": "ready", "ready": True})
        assert next_of(ws, "players_updated")["players"][1]["ready"] is True
        clock[0] += CHANGE_COOLDOWN
        assert refused(ws, {"t": "set_team", "team": "zamorak"}) == "bad_state"
    assert teams_of(held(client, code)["players"])["Zezima"] == "saradomin"


def test_a_god_nobody_plays_for_is_a_protocol_error(
    client: TestClient, team_lobby: dict[str, Any]
) -> None:
    with client.websocket_connect(f"/ws/{team_lobby['code']}") as ws:
        hello(ws, team_lobby["player"]["session"])
        ws.send_json({"t": "set_team", "team": "seren"})
        assert next_of(ws, "error")["code"] == "bad_message"
        assert closed_with(ws) == 4008


@pytest.mark.parametrize("team", [None, ""])
def test_set_team_never_takes_no_team(
    client: TestClient, team_lobby: dict[str, Any], team: Any
) -> None:
    with client.websocket_connect(f"/ws/{team_lobby['code']}") as ws:
        hello(ws, team_lobby["player"]["session"])
        ws.send_json({"t": "set_team", "team": team})
        assert next_of(ws, "error")["code"] == "bad_message"


def test_move_team_moves_a_ready_player_and_keeps_them_ready(
    client: TestClient, team_lobby: dict[str, Any], db: Any
) -> None:
    code, admin, player = team_lobby["code"], team_lobby["admin"], team_lobby["player"]
    player_id = player["player"]["id"]
    with (
        client.websocket_connect(f"/ws/{code}") as one,
        client.websocket_connect(f"/ws/{code}") as two,
    ):
        hello(one, admin["session"])
        hello(two, player["session"])
        next_of(one, "players_updated")
        for frame in ({"t": "set_team", "team": "saradomin"}, {"t": "ready", "ready": True}):
            two.send_json(frame)
            for ws in (one, two):
                next_of(ws, "players_updated")
        one.send_json({"t": "move_team", "player_id": player_id, "team": "zamorak"})
        for ws in (one, two):
            players = next_of(ws, "players_updated")["players"]
            moved = next(p for p in players if p["id"] == player_id)
            assert (moved["team"], moved["ready"]) == ("zamorak", True)
    row = db("select team from players where id = $1", UUID(player_id))
    assert row[0]["team"] == "zamorak"


def test_move_team_reaches_a_disconnected_player(
    client: TestClient, team_lobby: dict[str, Any]
) -> None:
    code, admin, player = team_lobby["code"], team_lobby["admin"], team_lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        ws.send_json({"t": "move_team", "player_id": player["player"]["id"], "team": "zamorak"})
        assert teams_of(next_of(ws, "players_updated")["players"])["Zezima"] == "zamorak"


def test_move_team_from_a_player_is_not_admin(
    client: TestClient, team_lobby: dict[str, Any]
) -> None:
    code, admin, player = team_lobby["code"], team_lobby["admin"], team_lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, player["session"])
        frame = {"t": "move_team", "player_id": admin["player"]["id"], "team": "zamorak"}
        assert refused(ws, frame) == "not_admin"
    assert teams_of(held(client, code)["players"])["Admin"] is None


def test_move_team_to_a_god_not_playing_or_nobody_is_refused(
    client: TestClient, team_lobby: dict[str, Any]
) -> None:
    code, admin, player = team_lobby["code"], team_lobby["admin"], team_lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        frame = {"t": "move_team", "player_id": player["player"]["id"], "team": "guthix"}
        assert refused(ws, frame) == "bad_value"
        frame = {"t": "move_team", "player_id": str(UUID(int=1)), "team": "zamorak"}
        assert refused(ws, frame) == "bad_state"


def test_a_teamless_player_cannot_ready_up(client: TestClient, team_lobby: dict[str, Any]) -> None:
    code, player = team_lobby["code"], team_lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, player["session"])
        assert refused(ws, {"t": "ready", "ready": True}) == "bad_state"
    assert [p["ready"] for p in held(client, code)["players"]] == [False, False]


def move(ws: Any, player: dict[str, Any], team: str) -> None:
    ws.send_json({"t": "move_team", "player_id": player["player"]["id"], "team": team})
    next_of(ws, "players_updated")


def test_start_game_is_refused_with_a_teamless_player_even_a_disconnected_one(
    client: TestClient, team_lobby: dict[str, Any]
) -> None:
    code, admin = team_lobby["code"], team_lobby["admin"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        move(ws, admin, "saradomin")
        assert refused(ws, {"t": "start_game"}) == "bad_state"  # Zezima never connected
    assert held(client, code)["room"]["status"] == "lobby"


def test_start_game_is_refused_with_everyone_on_one_team(
    client: TestClient, team_lobby: dict[str, Any]
) -> None:
    code, admin, player = team_lobby["code"], team_lobby["admin"], team_lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        move(ws, admin, "saradomin")
        move(ws, player, "saradomin")
        assert refused(ws, {"t": "start_game"}) == "bad_state"
        move(ws, player, "zamorak")
        ws.send_json({"t": "start_game"})
        assert next_of(ws, "room_updated")["room"]["status"] == "playing"


def test_teams_are_fixed_once_the_game_starts(
    client: TestClient, team_lobby: dict[str, Any]
) -> None:
    code, admin, player = team_lobby["code"], team_lobby["admin"], team_lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        move(ws, admin, "saradomin")
        move(ws, player, "zamorak")
        ws.send_json({"t": "start_game"})
        next_of(ws, "room_updated")
        assert refused(ws, {"t": "set_team", "team": "zamorak"}) == "bad_state"
        frame = {"t": "move_team", "player_id": player["player"]["id"], "team": "saradomin"}
        assert refused(ws, frame) == "bad_state"


def test_both_messages_are_refused_in_a_room_without_teams(
    client: TestClient, lobby: dict[str, Any]
) -> None:
    code, admin, player = lobby["code"], lobby["admin"], lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        assert refused(ws, {"t": "set_team", "team": "saradomin"}) == "bad_state"
        frame = {"t": "move_team", "player_id": player["player"]["id"], "team": "saradomin"}
        assert refused(ws, frame) == "bad_state"
        ws.send_json({"t": "ready", "ready": True})  # a room without teams readies as ever
        assert next_of(ws, "players_updated")["players"][0]["ready"] is True
    assert [p["team"] for p in held(client, code)["players"]] == [None, None]
