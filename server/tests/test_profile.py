"""The server half: pets through create and join, and ``set_profile``.

Two browsers see each other's pets identically (the ``PlayerView`` both are sent); a
pick or a rename in one reaches the other in the next ``room_updated``; a rename to a
name already taken in the room is rejected and the old name survives unchanged; an
``avatar`` that is not a pickable pet is rejected at the edge rather than stored; a full room of
50 can be given 50 different pets; a client that sends no
``avatar`` and never sends ``set_profile`` still creates, joins and plays.

The refused mid-game rename is in ``test_game.py`` beside the other in-game commands, a room from
before the migration is in ``test_migrations.py``, the pet list is in ``test_pets.py``, and
the client's half in its own tests.
"""

import json
from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.pets import PETS as PETS_JSON
from app.pets import load_pickable_pets
from app.rooms.state import CHANGE_COOLDOWN
from tests.rooms_api import create, held, hello, next_of

PETS = sorted(load_pickable_pets())


def by_id(players: list[dict[str, Any]], player_id: str) -> dict[str, Any]:
    return next(p for p in players if p["id"] == player_id)


# --- create and join --------------------------------------------------------------


def test_create_and_join_store_the_pet_they_were_sent(client: TestClient, db) -> None:
    first, last = PETS[0], PETS[-1]
    response = client.post(
        "/api/rooms",
        json={"returning": False, "display_name": "Admin", "avatar": first, "settings": {}},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["player"]["avatar"] == first
    joined = client.post(
        f"/api/rooms/{body['code']}/join",
        json={"returning": False, "display_name": "Zezima", "avatar": last},
    )
    assert joined.status_code == 200, joined.text
    assert joined.json()["player"]["avatar"] == last
    rows = db("select display_name, avatar from players order by joined_at")
    assert [(r["display_name"], r["avatar"]) for r in rows] == [("Admin", first), ("Zezima", last)]
    room = held(client, body["code"])
    assert [p["avatar"] for p in room["players"]] == [first, last]


def incomplete_pet() -> str:
    """A pet in ``data/pets.json`` that has an icon or a chathead but not both."""
    pets = {pet["id"] for pet in json.loads(PETS_JSON.read_text(encoding="utf-8"))}
    return next(iter(sorted(pets - set(PETS))))


@pytest.mark.parametrize("avatar", ["not_a_pet", "AGGY", "", "3"])
def test_a_pet_nobody_can_pick_is_refused_at_create_and_join(
    client: TestClient, db, avatar: str
) -> None:
    response = client.post(
        "/api/rooms",
        json={"returning": False, "display_name": "Admin", "avatar": avatar, "settings": {}},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "bad_avatar"
    assert db("select * from rooms") == []  # refused before the room existed

    code, _ = create(client)
    response = client.post(
        f"/api/rooms/{code}/join",
        json={"returning": False, "display_name": "Zezima", "avatar": avatar},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "bad_avatar"
    assert len(db("select * from players")) == 1  # only the admin


def test_a_pet_with_only_one_picture_is_refused(client: TestClient, db) -> None:
    response = client.post(
        "/api/rooms",
        json={
            "returning": False,
            "display_name": "Admin",
            "avatar": incomplete_pet(),
            "settings": {},
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "bad_avatar"


@pytest.mark.parametrize("avatar", [3, 1.5, ["aggy"], "x" * 65])
def test_an_avatar_that_is_not_a_short_string_fails_validation(client: TestClient, avatar) -> None:
    response = client.post(
        "/api/rooms",
        json={"returning": False, "display_name": "Admin", "avatar": avatar, "settings": {}},
    )
    assert response.status_code == 422


def test_a_full_room_can_have_fifty_different_pets(app: FastAPI, client: TestClient) -> None:
    """Fifty is ``max_players_per_room``, and every seat can have its own pet."""
    cap = app.state.settings.max_players_per_room
    assert len(PETS) >= cap
    response = client.post(
        "/api/rooms",
        json={"returning": False, "display_name": "Player0", "avatar": PETS[0], "settings": {}},
    )
    code = response.json()["code"]
    for seat in range(1, cap):
        joined = client.post(
            f"/api/rooms/{code}/join",
            json={"returning": False, "display_name": f"Player{seat}", "avatar": PETS[seat]},
        )
        assert joined.status_code == 200, joined.text
    players = held(client, code)["players"]
    assert len(players) == cap
    assert sorted(p["avatar"] for p in players) == sorted(PETS[:cap])


# --- set_profile ------------------------------------------------------------------


def test_a_reroll_and_a_rename_reach_the_other_browser(
    client: TestClient, lobby, db, clock
) -> None:
    """Both browsers see the same pets, and a change in one reaches the other."""
    code, admin, player = lobby["code"], lobby["admin"], lobby["player"]
    with (
        client.websocket_connect(f"/ws/{code}") as one,
        client.websocket_connect(f"/ws/{code}") as two,
    ):
        first = hello(one, admin["session"])
        second = hello(two, player["session"])
        next_of(one, "players_updated")  # the second socket connecting
        assert [p["avatar"] for p in first["players"]] == [p["avatar"] for p in second["players"]]

        two.send_json({"t": "set_profile", "avatar": PETS[12]})
        for ws in (one, two):  # the sender hears it the same way everyone else does
            seen = by_id(next_of(ws, "room_updated")["players"], player["player"]["id"])
            assert (seen["display_name"], seen["avatar"]) == ("Zezima", PETS[12])

        clock[0] += CHANGE_COOLDOWN
        two.send_json({"t": "set_profile", "display_name": "  Woox  "})
        seen = by_id(next_of(one, "room_updated")["players"], player["player"]["id"])
        assert (seen["display_name"], seen["avatar"]) == ("Woox", PETS[12])  # trimmed, pet kept

        clock[0] += CHANGE_COOLDOWN
        two.send_json({"t": "set_profile", "display_name": "Lynx Titan", "avatar": PETS[0]})
        seen = by_id(next_of(one, "room_updated")["players"], player["player"]["id"])
        assert (seen["display_name"], seen["avatar"]) == ("Lynx Titan", PETS[0])

    row = db("select display_name, avatar from players where id = $1", UUID(player["player"]["id"]))
    assert (row[0]["display_name"], row[0]["avatar"]) == ("Lynx Titan", PETS[0])


def test_a_rename_to_a_taken_name_is_refused_and_the_old_one_survives(
    client: TestClient, lobby, db
) -> None:
    code, player = lobby["code"], lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, player["session"])
        # Case-insensitive, like join: "admin" is the admin's "Admin".
        ws.send_json({"t": "set_profile", "display_name": "admin", "avatar": PETS[5]})
        error = next_of(ws, "error")
        assert error["code"] == "name_taken"
        # Neither half of a rejected change lands, the pet included.
        ws.send_json({"t": "ping"})
        assert ws.receive_json()["t"] == "pong"  # the socket is still open, nothing sent
    row = db("select display_name, avatar from players where id = $1", UUID(player["player"]["id"]))
    assert (row[0]["display_name"], row[0]["avatar"]) == ("Zezima", None)
    names = [p["display_name"] for p in held(client, code)["players"]]
    assert names == ["Admin", "Zezima"]


def test_renaming_to_your_own_name_in_another_case_is_allowed(client: TestClient, lobby) -> None:
    code, player = lobby["code"], lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, player["session"])
        ws.send_json({"t": "set_profile", "display_name": "ZEZIMA"})
        seen = by_id(next_of(ws, "room_updated")["players"], player["player"]["id"])
        assert seen["display_name"] == "ZEZIMA"


@pytest.mark.parametrize(
    ("frame", "code"),
    [
        ({"display_name": "   "}, "bad_name"),
        ({"display_name": "x" * 25}, "bad_name"),
        ({"display_name": "<b>bold</b>"}, "bad_name"),
        ({"avatar": "not_a_pet"}, "bad_avatar"),
    ],
)
def test_set_profile_is_validated_like_a_join(
    client: TestClient, lobby, db, frame: dict[str, Any], code: str
) -> None:
    player = lobby["player"]
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, player["session"])
        ws.send_json({"t": "set_profile", **frame})
        assert next_of(ws, "error")["code"] == code
        ws.send_json({"t": "ping"})
        assert ws.receive_json()["t"] == "pong"  # a rejected message, not a protocol error
    row = db("select display_name, avatar from players where id = $1", UUID(player["player"]["id"]))
    assert (row[0]["display_name"], row[0]["avatar"]) == ("Zezima", None)


@pytest.mark.parametrize("frame", [{"avatar": 3}, {"avatar": ["aggy"]}, {"colour": "red"}])
def test_a_malformed_set_profile_is_a_protocol_error(client: TestClient, lobby, frame) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["player"]["session"])
        ws.send_json({"t": "set_profile", **frame})
        assert next_of(ws, "error")["code"] == "bad_message"


def test_a_change_that_changes_nothing_broadcasts_nothing(client: TestClient, lobby) -> None:
    player = lobby["player"]
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, player["session"])
        ws.send_json({"t": "set_profile", "display_name": "Zezima"})
        ws.send_json({"t": "set_profile"})
        ws.send_json({"t": "ping"})
        assert ws.receive_json()["t"] == "pong"  # no room_updated came first


def test_the_change_survives_the_room_leaving_memory(client: TestClient, lobby, evict) -> None:
    code, player = lobby["code"], lobby["player"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, player["session"])
        ws.send_json({"t": "set_profile", "display_name": "Woox", "avatar": PETS[9]})
        next_of(ws, "room_updated")
    assert evict(code)
    seen = by_id(held(client, code)["players"], player["player"]["id"])
    assert (seen["display_name"], seen["avatar"]) == ("Woox", PETS[9])


def test_a_client_that_sends_no_avatar_still_joins_and_plays(client: TestClient) -> None:
    """Its players are the ones the client draws a derived pet."""
    response = client.post(
        "/api/rooms",
        json={"returning": False, "display_name": "Admin", "settings": {}, "custom_questions": []},
    )
    assert response.status_code == 201
    code, admin = response.json()["code"], response.json()
    joined = client.post(
        f"/api/rooms/{code}/join", json={"returning": False, "display_name": "Zezima"}
    )
    assert joined.status_code == 200
    with client.websocket_connect(f"/ws/{code}") as ws:
        welcome = hello(ws, admin["session"])
        assert [p["avatar"] for p in welcome["players"]] == [None, None]
        ws.send_json({"t": "start_game"})
        assert next_of(ws, "room_updated")["room"]["status"] == "playing"
