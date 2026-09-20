"""T6 Accept: create returns ``{code, session, player}`` and the creator is the room's
admin; a bad display name creates no room row; the sixth create from one IP in an hour is
429; ``questions`` rows equal what the modes asked for (the code collision retry is in
test_codes.py plus an end-to-end check here).

T7 Accept: join a finished room is 409; duplicate name is 409; over ``max_players`` is
409; success returns a session; the player appears in ``GET /api/rooms/{code}``.

Plus section 7: the session token is hashed at rest and never rendered back.
"""

import hashlib
import re

import asyncpg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.rooms import state
from app.rooms.settings import RoomSettings
from tests.rooms_api import call, create, join


def sha256(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --- T6: create -------------------------------------------------------------------


def test_create_returns_the_admin_session_and_player(client: TestClient, db) -> None:
    """T6: the creator is the admin; the session is hashed at rest."""
    response = client.post(
        "/api/rooms", json={"display_name": "  Zezima  ", "settings": {}, "custom_questions": []}
    )
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"code", "session", "player"}
    assert len(body["session"]) >= 40
    assert body["player"] == {
        "id": body["player"]["id"],
        "display_name": "Zezima",  # trimmed
        "role": "admin",
        "connected": False,
    }

    (room,) = db("select code, status from rooms")
    assert (room["code"], room["status"]) == (body["code"], "lobby")
    (player,) = db("select id, role, session_token_hash from players")
    assert str(player["id"]) == body["player"]["id"]
    assert player["role"] == "admin"
    assert player["session_token_hash"] == sha256(body["session"])
    assert body["session"] not in str(dict(player))


def test_create_registers_the_room_in_memory_with_its_admin(
    app: FastAPI, client: TestClient
) -> None:
    """The cached copy is never re-read, so it has to hold the admin from the start.

    Reaches into ``manager.rooms`` on purpose: ``get`` would rehydrate a cold room from
    the database and hide the very bug this guards against -- an admin who is locked out
    of the room they just made.
    """
    code, admin = create(client)
    room = app.state.rooms.rooms[code]
    assert [p.role for p in room.players.values()] == ["admin"]
    assert room.find_by_session(admin["session"]) is not None


def test_a_bad_display_name_creates_no_room(client: TestClient, db) -> None:
    """The name is validated before anything is written, so nothing is left behind."""
    for name in ("", "   ", "x" * 25, "<b>bold</b>", "two\nlines", "tab\there"):
        response = client.post("/api/rooms", json={"display_name": name, "settings": {}})
        assert response.status_code == 422, name
        assert response.json()["code"] == "bad_name", name
    for table in ("rooms", "questions", "players"):
        assert db(f"select count(*) as n from {table}")[0]["n"] == 0, table


def test_a_bad_display_name_costs_no_rate_limit_quota(client: TestClient) -> None:
    """The limiter records a hit on every call it allows, so it runs after the name."""
    for _ in range(6):
        response = client.post("/api/rooms", json={"display_name": "", "settings": {}})
        assert response.status_code == 422
    assert client.post("/api/rooms", json={"display_name": "Zezima"}).status_code == 201


def test_a_failed_player_insert_leaves_no_room(
    app: FastAPI, client: TestClient, db, monkeypatch
) -> None:
    """No room without a host: the admin insert aborts the whole transaction.

    ``players_session_idx`` is unique across every room, so a duplicated session token is
    the one way to fail that insert. It must not be mistaken for a code collision and
    retried -- it has to take the room row down with it.
    """
    _, admin = create(client)
    monkeypatch.setattr(state, "new_token", lambda: admin["session"])
    with pytest.raises(asyncpg.UniqueViolationError):
        call(client, app.state.rooms.create, "Other", RoomSettings(), [], "127.0.0.1")
    assert db("select count(*) as n from rooms")[0]["n"] == 1


def test_the_claim_endpoint_is_gone(client: TestClient) -> None:
    """405, not 404: the SPA catch-all claims every path, but only for GET and HEAD."""
    code, _ = create(client)
    assert client.post(f"/api/rooms/{code}/claim", json={}).status_code == 405


def test_code_is_an_uppercase_room_word(client: TestClient) -> None:
    code, _ = create(client)
    assert re.fullmatch(r"[A-Z0-9]+", code)


def test_code_collision_retries_then_appends_digits(app: FastAPI, client: TestClient) -> None:
    """T6: collision retry end to end, with a one-word list."""
    app.state.rooms.words = ("Cabbage",)
    first, _ = create(client)
    second, _ = create(client)
    assert first == "CABBAGE"
    assert re.fullmatch(r"CABBAGE\d\d", second)


def test_questions_rows_equal_what_the_modes_asked_for(client: TestClient, db) -> None:
    """T6: a mode is a round, and its ``questions`` is how long that round is."""
    code, _ = create(client, modes=[{"mode": "more_less", "questions": 7}])
    (room,) = db("select id from rooms where code = $1", code)
    rows = db(
        "select position, question_id, type, source, payload, host_only, round from questions"
        " where room_id = $1 order by position",
        room["id"],
    )
    assert len(rows) == 7
    assert [r["position"] for r in rows] == list(range(7))
    assert len({r["question_id"] for r in rows}) == 7
    # One mode, so one round, however many questions it holds.
    assert [r["round"] for r in rows] == [0] * 7
    for row in rows:
        assert row["type"] == "more_less"
        assert row["source"] == "pack"
        assert row["host_only"] is False
        assert set(row["payload"]) >= {"payload", "tags"}
        assert not set(row["payload"]) & {"id", "type", "source", "host_only"}
        assert row["payload"]["payload"]["answer_index"] in (0, 1)

    code, _ = create(client, modes=[{"mode": "more_less", "questions": 30}])
    (n,) = db(
        "select count(*) as n from questions q join rooms r on r.id = q.room_id where r.code = $1",
        code,
    )
    assert n["n"] == 30


def test_eleventh_create_from_one_ip_is_429(client: TestClient) -> None:
    """T6: sixth create from one IP in an hour is 429."""
    for _ in range(10):
        create(client)
    response = client.post("/api/rooms", json={"display_name": "Zezima"})
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"


def test_create_stores_settings_with_resolved_max_players(client: TestClient, db) -> None:
    code, _ = create(client, modes=[{"mode": "more_less", "seconds": 15}], reveal_seconds=5)
    (row,) = db("select settings from rooms where code = $1", code)
    assert row["settings"] == {
        # ``questions`` was left out, so the mode's own default filled it in.
        "modes": [{"mode": "more_less", "questions": 10, "seconds": 15}],
        "mode_order": "listed",
        "order": "shuffle",
        "reveal_seconds": 5,
        "splash_seconds": 8,
        "close_when_all_answered": True,
        "max_players": 50,
    }


def test_create_rejects_bad_settings(client: TestClient) -> None:
    bad = [
        {"modes": []},
        {"modes": [{"mode": "closest_number"}]},  # not a type this build plays
        {"modes": [{"mode": "more_less"}, {"mode": "more_less"}]},  # a mode is one round
        {"modes": [{"mode": "more_less", "questions": 0}]},  # under the type's minimum
        {"modes": [{"mode": "more_less", "questions": 31}]},  # over it
        {"modes": [{"mode": "more_less", "seconds": 4}]},  # quicker than the type allows
        {"modes": [{"mode": "more_less", "seconds": 21}]},  # slower than it allows
        {"modes": [{"mode": "more_less", "rounds": 2}]},  # not a field
        {"modes": ["more_less"]},  # the old shape: a name, not a round
        {"mode_order": "listed_or_not"},
        {"order": "random"},
        {"reveal_seconds": 60},
        {"splash_seconds": -1},
        {"splash_seconds": 31},
        {"max_players": 0},
        {"bogus": 1},
    ]
    for settings in bad:
        response = client.post("/api/rooms", json={"display_name": "Zezima", "settings": settings})
        assert response.status_code == 422, settings
    response = client.post(
        "/api/rooms", json={"display_name": "Zezima", "settings": {"max_players": 51}}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "bad_settings"
    response = client.post(
        "/api/rooms",
        json={"display_name": "Zezima", "custom_questions": [{"type": "more_less"}]},
    )
    assert response.status_code == 422


def test_create_survives_unparseable_client_address(client: TestClient, db) -> None:
    """TestClient's host is "testclient", which ``inet`` cannot store; must not 500."""
    code, _ = create(client)
    (row,) = db("select creator_ip from rooms where code = $1", code)
    assert row["creator_ip"] is None


# --- T6: read back ----------------------------------------------------------------


def test_get_room_view_and_case_insensitive_code(client: TestClient) -> None:
    code, admin = create(client, modes=[{"mode": "more_less", "questions": 3}])
    response = client.get(f"/api/rooms/{code}")
    assert response.status_code == 200
    assert response.json() == {
        "room": {
            "code": code,
            "status": "lobby",
            "settings": response.json()["room"]["settings"],
            "current_index": None,
            "total": 3,
            "phase": "idle",
            "next_at": None,
            "segment": None,  # no round until the game starts
        },
        "players": [admin["player"]],
    }
    assert admin["session"] not in response.text  # section 7: never rendered back
    assert client.get(f"/api/rooms/{code.lower()}").json()["room"]["code"] == code
    assert client.get("/api/rooms/NOSUCHROOM").status_code == 404


# --- T7: join ---------------------------------------------------------------------


def test_join_a_finished_room_is_409(client: TestClient, db, evict) -> None:
    """T7: a finished room is the only one that is not open for joining."""
    code, _ = create(client)
    db("update rooms set status = 'finished' where code = $1", code)
    evict(code)
    response = join(client, code, "Zezima")
    assert response.status_code == 409
    assert response.json()["code"] == "not_open"


def test_join_success_returns_session_and_appears_in_get(client: TestClient, db) -> None:
    """T7: success returns a session; player appears in GET /api/rooms/{code}."""
    code, admin = create(client)
    response = join(client, code, "  Zezima ")
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"session", "player"}
    assert len(body["session"]) >= 40
    assert body["player"] == {
        "id": body["player"]["id"],
        "display_name": "Zezima",
        "role": "player",
        "connected": False,
    }
    (player,) = db("select session_token_hash from players where display_name = 'Zezima'")
    assert player["session_token_hash"] == sha256(body["session"])
    assert body["session"] != admin["session"]

    view = client.get(f"/api/rooms/{code}").json()
    assert view["room"]["status"] == "lobby"
    assert view["players"] == [admin["player"], body["player"]]


def test_duplicate_name_is_409(client: TestClient) -> None:
    """T7: duplicate name is 409, case-insensitively, after trimming."""
    code, _ = create(client)
    assert join(client, code, "Zezima").status_code == 200
    for name in ("Zezima", "zezima", "ZEZIMA", " Zezima "):
        response = join(client, code, name)
        assert response.status_code == 409, name
        assert response.json()["code"] == "name_taken"
    assert join(client, code, "admin").status_code == 409  # the admin counts too


def test_over_max_players_is_409(client: TestClient) -> None:
    """T7: over ``max_players`` is 409. The admin is one of the players."""
    code, _ = create(client, max_players=2)
    assert join(client, code, "One").status_code == 200
    response = join(client, code, "Two")
    assert response.status_code == 409
    assert response.json()["code"] == "room_full"
    assert len(client.get(f"/api/rooms/{code}").json()["players"]) == 2


def test_join_name_rules(client: TestClient) -> None:
    code, _ = create(client)
    for name in ("", "x" * 25, "a<script>", "tab\there"):
        response = join(client, code, name)
        assert response.status_code == 422, name
        assert response.json()["code"] == "bad_name"
    assert join(client, code, "x" * 24).status_code == 200
    assert join(client, code, "Tom & Jerry").status_code == 200


def test_join_unknown_and_expired_rooms(client: TestClient, db, evict) -> None:
    assert join(client, "NOSUCHROOM", "x").status_code == 404
    code, _ = create(client)
    db("update rooms set expires_at = now() where code = $1", code)
    evict(code)
    response = join(client, code, "x")
    assert response.status_code == 410
    assert response.json()["code"] == "expired"
