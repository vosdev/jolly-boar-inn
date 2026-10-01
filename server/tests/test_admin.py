"""The admin view's API: there only with a token, behind it, and blind to what rooms hold."""

import hmac
import json
import logging
import socket
import threading
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
import pytest
import uvicorn
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import REPO_ROOT, Settings
from app.http import admin
from app.main import create_app
from tests.conftest import BASE
from tests.game_api import Game

TOKEN = "0123456789abcdef0123456789abcdef"
BEARER = {"Authorization": f"Bearer {TOKEN}"}
ROUTES = ("/api/admin/rooms", "/api/admin/stats")


@pytest.fixture
def app(test_db_dsn: str, dist: Path) -> FastAPI:
    """The conftest's app, with the admin view turned on."""
    settings = Settings(
        _env_file=None,
        database_url=test_db_dsn,
        packs_dir=REPO_ROOT / "data" / "packs",
        public_base_url=BASE,
        admin_token=TOKEN,
    )
    return create_app(settings, dist)


def offline(settings: Settings, dist: Path, token: str = TOKEN) -> TestClient:
    return TestClient(create_app(settings.model_copy(update={"admin_token": token}), dist))


# --- The token ------------------------------------------------------------------------


@pytest.mark.parametrize("token", [None, ""])
def test_without_a_token_every_admin_route_is_a_404(
    settings: Settings, dist: Path, monkeypatch: pytest.MonkeyPatch, token: str | None
) -> None:
    if token is not None:
        monkeypatch.setenv("ADMIN_TOKEN", token)
    configured = Settings(_env_file=None, database_url=settings.database_url)
    assert configured.admin_token == ""
    with TestClient(create_app(configured, dist)) as client:
        for path in (*ROUTES, "/api/admin", "/api/admin/anything"):
            for method in ("GET", "POST", "DELETE"):
                # A typed body, or the 415 for untyped writes would answer first.
                body = None if method == "GET" else {}
                response = client.request(method, path, headers=BEARER, json=body)
                assert response.status_code == 404, (method, path)


def test_a_short_token_refuses_to_start_and_says_why(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "x" * 31)
    with pytest.raises(ValidationError) as info:
        Settings(_env_file=None)
    message = str(info.value)
    assert "ADMIN_TOKEN is 31 characters; it needs at least 32" in message


def test_uuidgen_output_is_long_enough(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "6F1C2B8E-3A4D-4E5F-9A0B-1C2D3E4F5A6B")
    assert Settings(_env_file=None).admin_token == "6F1C2B8E-3A4D-4E5F-9A0B-1C2D3E4F5A6B"


def test_a_token_a_fragment_would_mangle_refuses_to_start(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "a" * 31 + "&")
    with pytest.raises(ValidationError, match="letters, digits and - . _ ~"):
        Settings(_env_file=None)


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": f"Bearer {TOKEN}x"},
        {"Authorization": f"Bearer {TOKEN[:-1]}"},
        {"Authorization": f"Basic {TOKEN}"},
        {"Authorization": TOKEN},
        {"Authorization": "Bearer é".encode("latin-1")},
    ],
)
def test_a_wrong_or_missing_bearer_is_a_401(
    settings: Settings, dist: Path, headers: dict[str, str]
) -> None:
    with offline(settings, dist) as client:
        for path in ROUTES:
            response = client.get(path, headers=headers)
            assert response.status_code == 401, path
            assert response.json()["code"] == "unauthorized"
            assert response.headers["www-authenticate"] == "Bearer"


def test_the_token_is_compared_in_constant_time(
    settings: Settings, dist: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    compared: list[tuple[bytes, bytes]] = []
    real = hmac.compare_digest

    def spy(a: bytes, b: bytes) -> bool:
        compared.append((a, b))
        return real(a, b)

    monkeypatch.setattr(admin.hmac, "compare_digest", spy)
    with offline(settings, dist) as client:
        wrong = client.get("/api/admin/rooms", headers={"Authorization": "Bearer nope"})
        assert wrong.status_code == 401
        assert client.get("/api/admin/rooms", headers=BEARER).status_code == 200
    assert compared == [(b"nope", TOKEN.encode()), (TOKEN.encode(), TOKEN.encode())]


def test_a_token_in_the_query_string_is_not_accepted(settings: Settings, dist: Path) -> None:
    with offline(settings, dist) as client:
        assert client.get(f"/api/admin/rooms?token={TOKEN}").status_code == 401


def test_the_admin_page_sends_no_referrer(settings: Settings, dist: Path) -> None:
    with offline(settings, dist) as client:
        page = client.get("/admin")
    assert page.status_code == 200
    assert page.headers["referrer-policy"] == "no-referrer"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_the_token_never_reaches_the_access_log(
    settings: Settings, dist: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Through a real uvicorn, whose access log is the one an operator keeps."""
    port = _free_port()
    app = create_app(settings.model_copy(update={"admin_token": TOKEN}), dist)
    server = uvicorn.Server(uvicorn.Config(app, port=port, log_config=None, access_log=True))
    thread = threading.Thread(target=server.run)
    caplog.set_level(logging.INFO, logger="uvicorn.access")
    thread.start()
    try:
        for _ in range(500):
            if server.started:
                break
            threading.Event().wait(0.01)
        assert server.started
        base = f"http://127.0.0.1:{port}"
        assert httpx.get(f"{base}/api/admin/rooms", headers=BEARER).status_code == 200
        assert httpx.get(f"{base}/api/admin/rooms?token={TOKEN}").status_code == 401
        assert httpx.get(f"{base}/admin").status_code == 200
    finally:
        server.should_exit = True
        thread.join()
    access = [r.getMessage() for r in caplog.records if r.name == "uvicorn.access"]
    assert len(access) == 3, access
    assert not [line for line in access if TOKEN in line]


# --- What it shows --------------------------------------------------------------------


def get(client: TestClient, path: str) -> dict[str, Any]:
    response = client.get(path, headers=BEARER)
    assert response.status_code == 200, response.text
    return response.json()


def test_the_room_list_is_the_managers_memory(
    app: FastAPI, client: TestClient, table, evict, second_mode: str
) -> None:
    playing: Game = table(
        "Zezima",
        "Woox",
        modes=[{"mode": "more_less", "questions": 1}, {"mode": second_mode, "questions": 1}],
        mode_order="listed",
    )
    lobby: Game = table("Lynx")
    gone: Game = table("Durial")
    playing.start()
    playing.admin.take("question_open")
    assert evict(gone.code)

    live = get(client, "/api/admin/rooms")
    manager = app.state.rooms
    assert [room["code"] for room in live["rooms"]] == [lobby.code, playing.code]
    assert set(manager.rooms) == {lobby.code, playing.code}
    assert live["sockets"] == sum(len(room.sockets) for room in manager.rooms.values()) == 5
    by_code = {room["code"]: room for room in live["rooms"]}
    for code, room in manager.rooms.items():
        shown = by_code[code]
        assert shown["status"] == room.status
        assert shown["players"] == len(room.players)
        assert shown["connected"] == sum(p.connected for p in room.players.values())
        assert shown["waiting"] is room.awaiting_player
        assert shown["deletes_at"] == room.expires_at.isoformat().replace("+00:00", "Z")
    assert by_code[playing.code]["round"] == {"index": 0, "total": 2, "mode": "more_less"}
    assert by_code[lobby.code]["round"] is None
    assert (by_code[playing.code]["connected"], by_code[playing.code]["players"]) == (3, 3)


def test_a_finished_room_shows_when_its_grace_runs_out(
    app: FastAPI, client: TestClient, table
) -> None:
    game: Game = table("Zezima", modes=[{"mode": "more_less", "questions": 1}])
    game.start()
    game.admin.take("question_open")
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    room = app.state.rooms.rooms[game.code]
    (shown,) = get(client, "/api/admin/rooms")["rooms"]
    assert shown["status"] == "finished" and shown["round"] is None
    grace = app.state.settings.finished_room_grace_minutes
    expected = room.finished_at.timestamp() + grace * 60
    assert datetime.fromisoformat(shown["deletes_at"]).timestamp() == expected


def test_stats_are_every_counter_ever_kept(client: TestClient, db, table) -> None:
    db(
        "insert into daily_stats (day, metric, key, count) values"
        " ('2025-10-02', 'rounds_started', 'more_less', 4),"
        " ('2025-10-02', 'games_started', '', 2)"
    )
    table("Zezima")
    counts = get(client, "/api/admin/stats")["counts"]
    assert counts[:2] == [
        {"day": "2025-10-02", "metric": "games_started", "key": "", "count": 2},
        {"day": "2025-10-02", "metric": "rounds_started", "key": "more_less", "count": 4},
    ]
    assert {(c["metric"], c["count"]) for c in counts[2:]} == {
        ("rooms_created", 1),
        ("players_joined", 2),
    }


def strings_in(value: Any) -> Iterator[str]:
    """Every string value inside ``value``, at any depth."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings_in(v)
    elif isinstance(value, list | tuple):
        for v in value:
            yield from strings_in(v)


def test_no_admin_payload_names_anyone_or_holds_a_question_or_answer(
    app: FastAPI, client: TestClient, table
) -> None:
    custom = {
        "type": "multiple_choice",
        "payload": {
            "prompt": "Which clanmate fell asleep at Vorkath?",
            "options": ["Snoozebert", "Nodwell", "Yawnsley"],
            "answer_index": 0,
        },
    }
    created = client.post(
        "/api/rooms",
        json={
            "display_name": "Lynx Titan",
            "returning": False,
            "settings": {"modes": [{"mode": "more_less"}], "random_event_frequency": "more"},
            "custom_questions": [custom],
        },
    )
    assert created.status_code == 201, created.text
    game: Game = table("Zezima", "Woox", modes=[{"mode": "more_less", "questions": 2}])
    game.start()
    game.admin.take("question_open")
    game.answer(game.players[0], 0, game.right(0))
    game.players[0].take("answer_ack")

    payloads = [get(client, path) for path in ROUTES]
    text = json.dumps(payloads)
    secrets_ = {"Lynx Titan", "Zezima", "Woox", created.json()["session"]}
    for room in app.state.rooms.rooms.values():
        for player in room.players.values():
            secrets_ |= {player.display_name, str(player.id), player.session_hash}
        for question in room.questions:
            secrets_ |= {str(question.id), question.content_id}
            secrets_ |= {s for s in strings_in(question.payload) if len(s) >= 4}
    secrets_ |= {s for s in strings_in(game.right(0)) if len(s) >= 4}
    assert "Which clanmate fell asleep at Vorkath?" in secrets_
    # A short secret only counts as a whole value: "more" may be an answer and part of a mode.
    shown = set(strings_in(payloads))
    leaked = sorted(s for s in secrets_ if s in shown or (len(s) >= 8 and s in text))
    assert leaked == []

    live, history = payloads
    assert set(live) == {"rooms", "sockets"}
    for room in live["rooms"]:
        assert set(room) == {
            "code",
            "status",
            "round",
            "connected",
            "players",
            "waiting",
            "created_at",
            "deletes_at",
        }
        assert room["round"] is None or set(room["round"]) == {"index", "total", "mode"}
    assert set(history) == {"counts"}
    assert all(set(count) == {"day", "metric", "key", "count"} for count in history["counts"])
