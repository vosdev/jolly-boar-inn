"""T6 Accept: create returns a fragment URL; claim succeeds once and returns 410 the second
time; wrong token is 410; sixth create from one IP in an hour is 429; ``questions`` rows
equal ``question_count`` (the code collision retry is in test_codes.py plus an
end-to-end check here).

T7 Accept: join before claim is 409; duplicate name is 409; over ``max_players`` is 409;
success returns a session; the player appears in ``GET /api/rooms/{code}``.

Plus section 7: both tokens hashed at rest, one response for wrong and consumed tokens.
"""

import asyncio
import hashlib
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import asyncpg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.db import _init_connection
from app.main import create_app

BASE = "https://quiz.example"


def sha256(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@pytest.fixture
def app(test_db_dsn: str, dist: Path) -> FastAPI:
    settings = Settings(
        _env_file=None,
        database_url=test_db_dsn,
        packs_dir=REPO_ROOT / "data" / "packs",
        public_base_url=BASE,
    )
    return create_app(settings, dist)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


@pytest.fixture
def db(test_db_dsn: str):
    """``db(sql, *args)`` runs a query on the test database from the test thread."""

    def run(sql: str, *args: Any) -> list[asyncpg.Record]:
        async def go() -> list[asyncpg.Record]:
            conn = await asyncpg.connect(test_db_dsn)
            try:
                await _init_connection(conn)  # jsonb as Python values, like the app's pool
                return await conn.fetch(sql, *args)
            finally:
                await conn.close()

        return asyncio.run(go())

    return run


def create(client: TestClient, **settings: Any) -> tuple[str, str]:
    """Create a room, return ``(code, token)``."""
    response = client.post("/api/rooms", json={"settings": settings})
    assert response.status_code == 201, response.text
    body = response.json()
    fragment = urlsplit(body["admin_url"]).fragment
    assert fragment.startswith("t=")
    return body["code"], fragment[2:]


def claim(client: TestClient, code: str, token: str, name: str = "Admin"):
    return client.post(f"/api/rooms/{code}/claim", json={"token": token, "display_name": name})


def join(client: TestClient, code: str, name: str):
    return client.post(f"/api/rooms/{code}/join", json={"display_name": name})


# --- T6: create -------------------------------------------------------------------


def test_create_returns_fragment_url(client: TestClient, db) -> None:
    """T6: create returns a fragment URL; the token is hashed at rest."""
    response = client.post("/api/rooms", json={"settings": {}, "custom_questions": []})
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"code", "admin_url"}
    url = urlsplit(body["admin_url"])
    assert f"{url.scheme}://{url.netloc}" == BASE
    assert url.path == f"/r/{body['code']}/admin"
    assert url.query == ""
    token = url.fragment.removeprefix("t=")
    assert len(token) >= 40 and url.fragment != token

    (row,) = db("select code, status, admin_token_hash, admin_token_consumed_at from rooms")
    assert row["code"] == body["code"]
    assert row["status"] == "created"
    assert row["admin_token_hash"] == sha256(token)
    assert row["admin_token_consumed_at"] is None
    assert token not in str(dict(row))


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


def test_questions_rows_equal_question_count(client: TestClient, db) -> None:
    """T6: ``questions`` rows equal ``question_count``, fixed at creation."""
    code, _ = create(client, question_count=7)
    (room,) = db("select id from rooms where code = $1", code)
    rows = db(
        "select position, question_id, type, source, payload, host_only from questions"
        " where room_id = $1 order by position",
        room["id"],
    )
    assert len(rows) == 7
    assert [r["position"] for r in rows] == list(range(7))
    assert len({r["question_id"] for r in rows}) == 7
    for row in rows:
        assert row["type"] == "higher_lower"
        assert row["source"] == "pack"
        assert row["host_only"] is False
        assert set(row["payload"]) >= {"payload", "tags"}
        assert not set(row["payload"]) & {"id", "type", "source", "host_only"}
        assert row["payload"]["payload"]["answer"] in ("higher", "lower")

    code, _ = create(client, question_count=100)
    (n,) = db(
        "select count(*) as n from questions q join rooms r on r.id = q.room_id where r.code = $1",
        code,
    )
    assert n["n"] == 100


def test_sixth_create_from_one_ip_is_429(client: TestClient) -> None:
    """T6: sixth create from one IP in an hour is 429."""
    for _ in range(5):
        create(client)
    response = client.post("/api/rooms", json={})
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"


def test_create_stores_settings_with_resolved_max_players(client: TestClient, db) -> None:
    code, _ = create(client, question_seconds=45, reveal_seconds=5)
    (row,) = db("select settings from rooms where code = $1", code)
    assert row["settings"] == {
        "question_seconds": 45,
        "question_count": 20,
        "modes": ["higher_lower"],
        "order": "shuffle",
        "reveal_seconds": 5,
        "close_when_all_answered": True,
        "max_players": 50,
    }


def test_create_rejects_bad_settings(client: TestClient) -> None:
    bad = [
        {"question_seconds": 5},
        {"question_count": 0},
        {"modes": []},
        {"modes": ["closest_number"]},
        {"modes": ["higher_lower", "higher_lower"]},
        {"order": "random"},
        {"reveal_seconds": 60},
        {"max_players": 0},
        {"bogus": 1},
    ]
    for settings in bad:
        response = client.post("/api/rooms", json={"settings": settings})
        assert response.status_code == 422, settings
    response = client.post("/api/rooms", json={"settings": {"max_players": 51}})
    assert response.status_code == 422
    assert response.json()["code"] == "bad_settings"
    response = client.post("/api/rooms", json={"custom_questions": [{"type": "higher_lower"}]})
    assert response.status_code == 422


def test_create_survives_unparseable_client_address(client: TestClient, db) -> None:
    """TestClient's host is "testclient", which ``inet`` cannot store; must not 500."""
    code, _ = create(client)
    (row,) = db("select creator_ip from rooms where code = $1", code)
    assert row["creator_ip"] is None


# --- T6: claim --------------------------------------------------------------------


def test_claim_succeeds_once_then_410(client: TestClient, db) -> None:
    """T6: claim succeeds once and returns 410 the second time. Session hashed at rest."""
    code, token = create(client)
    response = claim(client, code, token, "Zezima")
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"session", "player"}
    assert body["player"]["display_name"] == "Zezima"
    assert body["player"]["role"] == "admin"
    assert body["player"]["connected"] is False

    (room,) = db("select status, admin_token_hash, admin_token_consumed_at from rooms")
    assert room["status"] == "lobby"
    assert room["admin_token_hash"] is None
    assert room["admin_token_consumed_at"] is not None
    (player,) = db("select id, role, session_token_hash from players")
    assert str(player["id"]) == body["player"]["id"]
    assert player["role"] == "admin"
    assert player["session_token_hash"] == sha256(body["session"])

    again = claim(client, code, token, "Other")
    assert again.status_code == 410
    assert again.json()["code"] == "token_used"
    assert db("select count(*) as n from players")[0]["n"] == 1


def test_wrong_token_is_410_and_indistinguishable_from_used(client: TestClient, db) -> None:
    """T6: wrong token is 410, with the same body as a consumed token (no oracle)."""
    code, token = create(client)
    wrong = claim(client, code, token[:-1] + ("A" if token[-1] != "A" else "B"))
    assert wrong.status_code == 410
    assert db("select status from rooms")[0]["status"] == "created"  # token still live
    assert db("select count(*) as n from players")[0]["n"] == 0

    assert claim(client, code, token).status_code == 200
    used = claim(client, code, token)
    assert used.status_code == 410
    assert wrong.json() == used.json()


def test_claim_unknown_room_is_404(client: TestClient) -> None:
    response = claim(client, "NOSUCHROOM", "x")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_claim_expired_room_is_410_expired(client: TestClient, db) -> None:
    code, token = create(client)
    db("update rooms set expires_at = now() - interval '1 day' where code = $1", code)
    response = claim(client, code, token)
    assert response.status_code == 410
    assert response.json()["code"] == "expired"


def test_bad_name_does_not_consume_the_token(client: TestClient) -> None:
    code, token = create(client)
    for name in ("", "   ", "x" * 25, "<b>bold</b>", "two\nlines"):
        response = claim(client, code, token, name)
        assert response.status_code == 422, name
        assert response.json()["code"] == "bad_name"
    assert claim(client, code, token, "  Fine  ").status_code == 200


def test_get_room_view_and_case_insensitive_code(client: TestClient) -> None:
    code, token = create(client, question_count=3)
    response = client.get(f"/api/rooms/{code}")
    assert response.status_code == 200
    assert response.json() == {
        "room": {
            "code": code,
            "status": "created",
            "settings": response.json()["room"]["settings"],
            "current_index": None,
            "total": 3,
            "phase": "idle",
        },
        "players": [],
    }
    assert "admin_token_hash" not in response.text
    assert claim(client, code.lower(), token).status_code == 200
    assert client.get(f"/api/rooms/{code.lower()}").json()["room"]["status"] == "lobby"
    assert client.get("/api/rooms/NOSUCHROOM").status_code == 404


# --- T7: join ---------------------------------------------------------------------


def test_join_before_claim_is_409(client: TestClient) -> None:
    """T7: join before claim is 409."""
    code, _ = create(client)
    response = join(client, code, "Zezima")
    assert response.status_code == 409
    assert response.json()["code"] == "not_open"


def test_join_success_returns_session_and_appears_in_get(client: TestClient, db) -> None:
    """T7: success returns a session; player appears in GET /api/rooms/{code}."""
    code, token = create(client)
    admin = claim(client, code, token, "Admin").json()
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
    code, token = create(client)
    claim(client, code, token, "Admin")
    assert join(client, code, "Zezima").status_code == 200
    for name in ("Zezima", "zezima", "ZEZIMA", " Zezima "):
        response = join(client, code, name)
        assert response.status_code == 409, name
        assert response.json()["code"] == "name_taken"
    assert join(client, code, "admin").status_code == 409  # the admin counts too


def test_over_max_players_is_409(client: TestClient) -> None:
    """T7: over ``max_players`` is 409. The admin is one of the players."""
    code, token = create(client, max_players=2)
    claim(client, code, token, "Admin")
    assert join(client, code, "One").status_code == 200
    response = join(client, code, "Two")
    assert response.status_code == 409
    assert response.json()["code"] == "room_full"
    assert len(client.get(f"/api/rooms/{code}").json()["players"]) == 2


def test_join_name_rules(client: TestClient) -> None:
    code, token = create(client)
    claim(client, code, token, "Admin")
    for name in ("", "x" * 25, "a<script>", "tab\there"):
        response = join(client, code, name)
        assert response.status_code == 422, name
        assert response.json()["code"] == "bad_name"
    assert join(client, code, "x" * 24).status_code == 200
    assert join(client, code, "Tom & Jerry").status_code == 200


def test_join_unknown_and_expired_rooms(client: TestClient, db) -> None:
    assert join(client, "NOSUCHROOM", "x").status_code == 404
    code, token = create(client)
    claim(client, code, token)
    db("update rooms set expires_at = now() where code = $1", code)
    response = join(client, code, "x")
    assert response.status_code == 410
    assert response.json()["code"] == "expired"
