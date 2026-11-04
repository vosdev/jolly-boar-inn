"""Limits that keep one client from taking the single worker down.

Frame size, the first-frame timeout and the per-socket message rate on ``/ws``; the
cooldown on lobby ready and ``set_profile``; the body cap on ``/api/*``; the uvicorn
flags that back them; and the rate limiter's key and its warning about proxies.
"""

import logging
import re
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.config import REPO_ROOT, Settings
from app.http.bodylimit import MAX_BODY
from app.http.ratelimit import (
    CONNECTS_PER_ADDRESS,
    CONNECTS_PER_SESSION,
    RateLimiter,
    client_key,
)
from app.main import create_app
from app.ws import handler as ws_handler
from app.ws.handler import MAX_FRAME, RATE_BURST, TokenBucket
from tests.rooms_api import closed_with, hello, next_of


def until_pong(ws: WebSocketTestSession) -> list[dict[str, Any]]:
    """Every frame before the reply to a ping sent now."""
    ws.send_json({"t": "ping"})
    seen = []
    while (message := ws.receive_json())["t"] != "pong":
        seen.append(message)
    return seen


# --- frames -------------------------------------------------------------------------


def test_an_oversized_first_frame_is_closed_with_1009(client: TestClient) -> None:
    with client.websocket_connect("/ws/ANYTHING") as ws:
        ws.send_text("[" + "{}," * (MAX_FRAME // 3) + "{}]")
        assert closed_with(ws, drain=True) == 1009


def test_an_oversized_frame_after_hello_is_closed_with_1009(client: TestClient, lobby) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["player"]["session"])
        ws.send_text('{"t": "ping", "pad": "' + "x" * MAX_FRAME + '"}')
        assert closed_with(ws, drain=True) == 1009


def test_a_socket_that_never_says_hello_is_closed_with_1008(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ws_handler, "HELLO_TIMEOUT", 0.2)
    with client.websocket_connect("/ws/ANYTHING") as ws:
        assert closed_with(ws, drain=True) == 1008


def test_a_flood_of_messages_is_closed_with_1008_after_the_burst(client: TestClient, lobby) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["player"]["session"])
        for _ in range(100):
            ws.send_json({"t": "ping"})
        pongs = 0
        with pytest.raises(WebSocketDisconnect) as info:
            while True:
                pongs += ws.receive_json()["t"] == "pong"
        assert info.value.code == 1008
        assert pongs <= RATE_BURST


def test_a_session_connecting_too_often_is_closed_with_1008_and_changes_nothing(
    client: TestClient, lobby
) -> None:
    """A reconnect loop is refused before it can replace the socket that is still up."""
    session = lobby["player"]["session"]
    for _ in range(CONNECTS_PER_SESSION - 1):
        with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
            hello(ws, session)
    with client.websocket_connect(f"/ws/{lobby['code']}") as kept:
        hello(kept, session)
        with client.websocket_connect(f"/ws/{lobby['code']}") as refused:
            refused.send_json({"t": "hello", "session": session})
            assert closed_with(refused) == 1008
        assert until_pong(kept) == []


def test_an_address_connecting_too_often_is_closed_with_1008(client: TestClient, lobby) -> None:
    for attempt in range(CONNECTS_PER_ADDRESS):
        with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
            ws.send_json({"t": "hello", "session": f"not-a-session-{attempt}"})
            assert closed_with(ws, drain=True) == 4001
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        ws.send_json({"t": "hello", "session": lobby["player"]["session"]})
        assert closed_with(ws) == 1008


def test_a_burst_of_ready_taps_reaches_the_room_at_most_a_burst_of_times(
    client: TestClient, lobby
) -> None:
    code = lobby["code"]
    with (
        client.websocket_connect(f"/ws/{code}") as watcher,
        client.websocket_connect(f"/ws/{code}") as flooder,
    ):
        hello(watcher, lobby["admin"]["session"])
        hello(flooder, lobby["player"]["session"])
        next_of(watcher, "players_updated")  # the flooder connecting
        for i in range(100):
            flooder.send_json({"t": "ready", "ready": i % 2 == 0})
        assert closed_with(flooder, drain=True) == 1008
        updates = [m for m in until_pong(watcher) if m["t"] == "players_updated"]
        assert len(updates) <= RATE_BURST


def test_the_bucket_refills_at_its_rate_up_to_its_burst() -> None:
    now = [0.0]
    bucket = TokenBucket(rate=10, burst=3, clock=lambda: now[0])
    assert [bucket.take() for _ in range(4)] == [True, True, True, False]
    now[0] += 0.1
    assert bucket.take()
    assert not bucket.take()
    now[0] += 60
    assert [bucket.take() for _ in range(4)] == [True, True, True, False]


# --- cooldowns ----------------------------------------------------------------------


def test_a_lobby_ready_change_within_a_second_is_refused(client: TestClient, lobby, clock) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["player"]["session"])
        ws.send_json({"t": "ready", "ready": True})
        assert next_of(ws, "players_updated")
        ws.send_json({"t": "ready", "ready": False})
        error = next_of(ws, "error")
        assert error["code"] == "bad_state"
        clock[0] += 1
        ws.send_json({"t": "ready", "ready": False})
        mine = next_of(ws, "players_updated")["players"]
        assert not next(p for p in mine if p["id"] == lobby["player"]["player"]["id"])["ready"]


def test_a_profile_change_within_a_second_is_refused(client: TestClient, lobby, clock, db) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["player"]["session"])
        ws.send_json({"t": "set_profile", "display_name": "Woox"})
        next_of(ws, "room_updated")
        ws.send_json({"t": "set_profile", "display_name": "Lynx Titan"})
        assert next_of(ws, "error")["code"] == "bad_state"
        clock[0] += 1
        ws.send_json({"t": "set_profile", "display_name": "Lynx Titan"})
        next_of(ws, "room_updated")
    rows = db("select display_name from players where display_name in ('Woox', 'Lynx Titan')")
    assert [r["display_name"] for r in rows] == ["Lynx Titan"]


def test_a_change_that_changes_nothing_does_not_start_the_cooldown(
    client: TestClient, lobby, clock
) -> None:
    with client.websocket_connect(f"/ws/{lobby['code']}") as ws:
        hello(ws, lobby["player"]["session"])
        ws.send_json({"t": "set_profile", "display_name": "Zezima"})
        ws.send_json({"t": "set_profile", "display_name": "Woox"})
        reply = until_pong(ws)
        assert [m["t"] for m in reply] == ["room_updated"], reply


# --- HTTP bodies --------------------------------------------------------------------


@pytest.fixture
def bare(settings: Settings, dist: Path) -> TestClient:
    """The app without its lifespan: the middleware answers before any route runs."""
    return TestClient(create_app(settings, dist))


def test_a_body_over_the_cap_is_413(bare: TestClient) -> None:
    response = bare.post("/api/rooms", content=b"x" * (1024 * 1024))
    assert response.status_code == 413
    assert response.json()["code"] == "too_large"
    assert response.headers["Cache-Control"] == "no-store"


def test_a_chunked_body_over_the_cap_is_413(bare: TestClient) -> None:
    def chunks():
        for _ in range(MAX_BODY // 1024 + 1):
            yield b"x" * 1024

    response = bare.post("/api/rooms", content=chunks())
    assert "content-length" not in response.request.headers
    assert response.status_code == 413


def test_a_body_under_the_cap_reaches_the_route(client: TestClient) -> None:
    body = {"display_name": "Admin", "pad": "x" * (MAX_BODY - 1024)}
    response = client.post("/api/rooms", json=body)
    assert response.status_code == 422  # pydantic saw it and refused the extra field


# --- JSON-only writes ---------------------------------------------------------------


@pytest.mark.parametrize("content_type", [None, "text/plain", "application/x-www-form-urlencoded"])
@pytest.mark.parametrize(
    ("method", "path"),
    [("POST", "/api/rooms"), ("POST", "/api/rooms/ABYSSAL/join"), ("DELETE", "/api/rooms/ABYSSAL")],
)
def test_a_write_that_is_not_json_is_415(
    bare: TestClient, method: str, path: str, content_type: str | None
) -> None:
    """A cross-site ``no-cors`` fetch can send a body with no type, which FastAPI parses as JSON."""
    headers = {} if content_type is None else {"content-type": content_type}
    response = bare.request(method, path, content=b'{"display_name": "Zezima"}', headers=headers)
    assert response.request.headers.get("content-type") == content_type
    assert response.status_code == 415
    assert response.json()["code"] == "not_json"


def test_a_json_write_with_a_charset_reaches_the_route(client: TestClient) -> None:
    response = client.post(
        "/api/rooms",
        content=b'{"returning": false, "display_name": "Zezima"}',
        headers={"content-type": "application/json; charset=utf-8"},
    )
    assert response.status_code == 201


def test_a_read_needs_no_content_type(bare: TestClient) -> None:
    assert bare.get("/api/modes").status_code == 200


def test_an_oversized_body_is_413_before_its_type_is_checked(bare: TestClient) -> None:
    response = bare.post("/api/rooms", content=b"x" * (1024 * 1024))
    assert "content-type" not in response.request.headers
    assert response.status_code == 413


# --- uvicorn flags ------------------------------------------------------------------


def test_the_container_caps_frames_and_connections() -> None:
    cmd = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8").split("\nCMD ")[-1]
    assert re.search(rf'"--ws-max-size",\s*"{MAX_FRAME}"', cmd), cmd
    assert re.search(r'"--limit-concurrency",\s*"\d+"', cmd), cmd


def test_the_dev_server_caps_frames() -> None:
    makefile = (REPO_ROOT / "Makefile").read_text(encoding="utf-8")
    line = next(li for li in makefile.splitlines() if "uvicorn app.main:app" in li)
    assert f"--ws-max-size {MAX_FRAME}" in line


# --- the rate limiter's key ---------------------------------------------------------


def test_two_addresses_in_one_64_share_a_key() -> None:
    assert client_key("2001:db8:1:2::1") == client_key("2001:db8:1:2:ffff::9")


def test_two_addresses_in_different_64s_do_not() -> None:
    assert client_key("2001:db8:1:2::1") != client_key("2001:db8:1:3::1")


def test_a_mapped_ipv4_address_is_that_ipv4_address() -> None:
    assert client_key("::ffff:192.0.2.1") == client_key("192.0.2.1") == "192.0.2.1"


def test_create_counts_an_ipv6_client_by_its_64(app: FastAPI) -> None:
    with TestClient(ProxyHeadersMiddleware(app, trusted_hosts="testclient")) as proxied:
        app.state.ratelimiter = RateLimiter(limit=1)

        def create_from(address: str) -> int:
            body = {"returning": False, "display_name": "Admin"}
            headers = {"X-Forwarded-For": address}
            return proxied.post("/api/rooms", json=body, headers=headers).status_code

        assert create_from("2001:db8::1") == 201
        assert create_from("2001:db8::2") == 429
        assert create_from("2001:db8:0:1::1") == 201


# --- the proxy warning --------------------------------------------------------------


def behind_uvicorn(settings: Settings, dist: Path, trusted: str) -> TestClient:
    """The app behind uvicorn's own proxy-header handling, trusting ``trusted``."""
    return TestClient(ProxyHeadersMiddleware(create_app(settings, dist), trusted_hosts=trusted))


def warnings(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [r.getMessage() for r in caplog.records if "X-Forwarded-For" in r.getMessage()]


def test_an_ignored_forwarded_for_warns_once(settings, dist, caplog) -> None:
    client = behind_uvicorn(settings, dist, trusted="127.0.0.1")
    with caplog.at_level(logging.WARNING, logger="app.http"):
        client.get("/api/nothing", headers={"X-Forwarded-For": "203.0.113.7"})
        client.get("/api/nothing", headers={"X-Forwarded-For": "203.0.113.8"})
    assert len(warnings(caplog)) == 1
    assert "testclient" in warnings(caplog)[0]
    assert "FORWARDED_ALLOW_IPS" in warnings(caplog)[0]


def test_a_trusted_forwarded_for_does_not_warn(settings, dist, caplog) -> None:
    client = behind_uvicorn(settings, dist, trusted="testclient")
    with caplog.at_level(logging.WARNING, logger="app.http"):
        client.get("/api/nothing", headers={"X-Forwarded-For": "203.0.113.7, 198.51.100.2"})
    assert warnings(caplog) == []


def test_no_forwarded_for_does_not_warn(settings, dist, caplog) -> None:
    client = behind_uvicorn(settings, dist, trusted="127.0.0.1")
    with caplog.at_level(logging.WARNING, logger="app.http"):
        client.get("/api/nothing")
    assert warnings(caplog) == []
