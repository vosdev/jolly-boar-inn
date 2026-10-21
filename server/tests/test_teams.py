"""Team games: ``settings.teams`` names the gods playing, and every player starts teamless."""

from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.rooms.settings import NewRoomSettings, RoomSettings
from app.rooms.teams import GODS
from tests.rooms_api import create, create_fast, hello, join, next_of

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
    # Nothing assigns a team yet, so the row is written directly: a stored team reads back.
    db("update players set team = 'zaros' where id = $1", UUID(admin["player"]["id"]))
    assert evict(code)
    with client.websocket_connect(f"/ws/{code}") as ws:
        assert hello(ws, admin["session"])["you"]["team"] == "zaros"


def test_a_room_stored_before_teams_reads_as_none() -> None:
    assert RoomSettings.stored({"modes": ROUND}).teams == []
