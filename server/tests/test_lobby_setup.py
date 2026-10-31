"""Configuring the game in the lobby: empty rooms, ``set_settings``, the host's questions and
selection at the start. ``test_rooms.py`` covers what creating a room checks."""

from typing import Any

from fastapi.testclient import TestClient

from tests.rooms_api import begin, create, held, hello, join

ROUND = [{"mode": "more_less", "questions": 5}]
OWN = {
    "type": "multiple_choice",
    "payload": {"prompt": "Which boss drops the fang?", "options": ["A", "B"], "answer_index": 0},
}


def set_settings(ws: Any, **settings: Any) -> dict[str, Any]:
    """Send ``set_settings`` and return the next frame that answers it."""
    ws.send_json({"t": "set_settings", "settings": settings})
    while (frame := ws.receive_json())["t"] not in ("room_updated", "error"):
        pass
    return frame


def own_questions(client: TestClient, code: str, session: str, *questions: Any) -> int:
    body = {"session": session, "custom_questions": list(questions)}
    return client.post(f"/api/rooms/{code}/questions", json=body).status_code


def test_a_new_room_is_a_joinable_lobby_with_no_rounds_and_no_questions(
    client: TestClient, db
) -> None:
    code, admin = create(client, modes=[])
    assert join(client, code, "Zezima").status_code == 200
    room = held(client, code)["room"]
    assert (room["status"], room["settings"]["modes"]) == ("lobby", [])
    assert (room["total"], room["events"], room["estimated_seconds"]) == (0, 0, 0)
    assert db("select id from questions") == []


def test_an_admins_change_reaches_everyone_and_the_numbers_follow(client: TestClient, db) -> None:
    code, admin = create(client, modes=[])
    player = join(client, code, "Zezima").json()
    with (
        client.websocket_connect(f"/ws/{code}") as ws,
        client.websocket_connect(f"/ws/{code}") as other,
    ):
        hello(ws, admin["session"])
        hello(other, player["session"])
        frame = set_settings(ws, modes=ROUND, pace="walk", random_event_frequency="more")
        assert frame["t"] == "room_updated"
        while (heard := other.receive_json())["t"] != "room_updated":
            pass
    for room in (frame["room"], heard["room"]):
        assert room["settings"]["modes"] == ROUND
        assert room["settings"]["pace"] == "walk"
        assert room["total"] == 5 + room["events"]
        assert room["estimated_seconds"] > 0
    assert db("select settings->>'pace' as pace from rooms")[0]["pace"] == "walk"


def test_set_settings_leaves_alone_what_is_not_the_games(client: TestClient) -> None:
    code, admin = create(client, modes=ROUND, teams=["saradomin", "zamorak"])
    before = held(client, code)["room"]["settings"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        frame = set_settings(ws, modes=ROUND, teams=[], max_players=2)
    assert frame["room"]["settings"]["teams"] == ["saradomin", "zamorak"]
    assert frame["room"]["settings"]["max_players"] == before["max_players"]


def test_a_player_cannot_change_the_settings(lobby: dict[str, Any], client: TestClient) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["player"]["session"])
        assert set_settings(ws, modes=ROUND)["code"] == "not_admin"


def test_bad_settings_are_refused_and_the_socket_stays(
    lobby: dict[str, Any], client: TestClient
) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["admin"]["session"])
        assert set_settings(ws, modes=[{"mode": "nope"}])["code"] == "bad_value"
        assert set_settings(ws, standings_seconds=31)["code"] == "bad_value"
        assert set_settings(ws, bogus=1)["code"] == "bad_value"
        assert set_settings(ws, modes=ROUND)["t"] == "room_updated"


def test_surprise_rounds_cannot_change_once_the_doors_are_open(client: TestClient) -> None:
    """Rounds already shown cannot be hidden again, so neither way is allowed."""
    code, admin = create(client, modes=ROUND)
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        assert set_settings(ws, modes=ROUND, hide_rounds=True)["code"] == "bad_value"
        assert set_settings(ws, surprise_modes=2)["code"] == "bad_value"
    code, admin = create(client, modes=ROUND, hide_rounds=True)
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        assert set_settings(ws, modes=ROUND, hide_rounds=False)["code"] == "bad_value"
        assert set_settings(ws, surprise_modes=2, hide_rounds=True)["t"] == "room_updated"


def test_set_settings_outside_the_lobby_is_refused(
    lobby: dict[str, Any], client: TestClient
) -> None:
    begin(client, lobby["code"], lobby["admin"])
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["admin"]["session"])
        assert set_settings(ws, modes=ROUND)["code"] == "bad_state"


def test_the_start_selects_from_the_settings_at_that_moment(client: TestClient, db) -> None:
    code, admin = create(client, modes=[])
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        set_settings(ws, modes=[{"mode": "more_less", "questions": 7}], mode_order="listed")
        set_settings(ws, modes=[{"mode": "price_is_right", "questions": 4}], mode_order="listed")
    assert db("select id from questions") == []
    begin(client, code, admin)
    rows = db("select mode from questions where random_event is null")
    assert [row["mode"] for row in rows] == ["price_is_right"] * 4


def test_a_room_with_no_rounds_will_not_start(client: TestClient, db) -> None:
    code, admin = create(client, modes=[])
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        ws.send_json({"t": "start_game"})
        refusal = ws.receive_json()
    assert (refusal["t"], refusal["code"]) == ("error", "bad_state")
    assert "round" in refusal["message"]
    assert held(client, code)["room"]["status"] == "lobby"


def test_a_failed_selection_leaves_the_room_in_the_lobby_to_try_again(
    client: TestClient, db
) -> None:
    """Too many of the host's own for the slots: nothing is stored, and fixing it is enough."""
    code, admin = create(client, modes=ROUND)
    assert own_questions(client, code, admin["session"], OWN) == 204
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
        ws.send_json({"t": "start_game"})
        refusal = ws.receive_json()
        assert "1 custom questions" in refusal["message"]
    assert db("select status from rooms")[0]["status"] == "lobby"
    assert db("select id from questions") == []
    assert own_questions(client, code, admin["session"]) == 204
    begin(client, code, admin)


def test_questions_sent_in_the_lobby_are_played_as_the_senders_own(client: TestClient, db) -> None:
    code, admin = create(client, modes=[{"mode": "more_less", "questions": 10}])
    assert own_questions(client, code, admin["session"], OWN) == 204
    begin(client, code, admin)
    rows = db("select type, author_player_id from questions where source = 'room'")
    assert [(row["type"], str(row["author_player_id"])) for row in rows] == [
        ("multiple_choice", admin["player"]["id"])
    ]


def test_questions_survive_a_restart_of_the_lobby(client: TestClient, db, evict) -> None:
    code, admin = create(client, modes=[{"mode": "more_less", "questions": 10}])
    assert own_questions(client, code, admin["session"], OWN) == 204
    assert evict(code) is True
    room = held(client, code)["room"]
    assert room["total"] == 10 + room["events"]
    begin(client, code, admin)
    assert len(db("select id from questions where source = 'room'")) == 1


def test_sending_questions_needs_an_admin_of_a_lobby(
    lobby: dict[str, Any], client: TestClient
) -> None:
    code = lobby["code"]
    assert own_questions(client, code, lobby["player"]["session"], OWN) == 403
    assert own_questions(client, code, "nobody", OWN) == 401
    assert own_questions(client, code, lobby["admin"]["session"], {"type": "x"}) == 422
    begin(client, code, lobby["admin"])
    assert own_questions(client, code, lobby["admin"]["session"], OWN) == 409


def test_a_surprise_is_drawn_at_the_start_and_counted_before_it(client: TestClient) -> None:
    code, admin = create(client, surprise_modes=3)
    room = held(client, code)["room"]
    assert (room["rounds"], room["settings"]["surprise_modes"]) == (3, 3)
    assert room["total"] > 0
    begin(client, code, admin)
    settings = client.app.state.rooms.rooms[code].settings  # type: ignore[attr-defined]
    assert (len(settings.modes), settings.surprise_modes) == (3, 3)


def test_a_public_lobby_lists_its_rounds_as_they_are_picked(client: TestClient) -> None:
    body = {"returning": False, "display_name": "Host", "public": True, "settings": {"modes": []}}
    created = client.post("/api/rooms", json=body).json()
    code = created["code"].upper()
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, created["session"])
        assert client.get("/api/rooms/public").json()[0]["rounds"] == 0
        set_settings(ws, modes=ROUND)
        client.app.state.public_rooms = None  # type: ignore[attr-defined]
        assert client.get("/api/rooms/public").json()[0]["rounds"] == 1
