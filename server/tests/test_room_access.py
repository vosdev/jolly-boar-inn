"""Who can find a room and get into it: the lookup-miss budget and the join cap."""

import secrets
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.http.ratelimit import LOOKUP_WINDOW, RateLimiter
from tests.rooms_api import create, hello, join


@pytest.fixture
def proxied(app: FastAPI) -> Iterator[TestClient]:
    """A client whose every request can claim its own address through ``X-Forwarded-For``."""
    with TestClient(ProxyHeadersMiddleware(app, trusted_hosts="testclient")) as client:
        yield client


def at(address: str) -> dict[str, str]:
    return {"X-Forwarded-For": address}


def budget(app: FastAPI, misses: int) -> None:
    app.state.lookup_misses = RateLimiter(misses, LOOKUP_WINDOW)


def ws_closed_with(client: TestClient, code: str, session: str) -> int:
    with client.websocket_connect(f"/ws/{code}") as ws:
        ws.send_json({"t": "hello", "session": session})
        with pytest.raises(WebSocketDisconnect) as info:
            for _ in range(5):
                ws.receive_json()
    return info.value.code


def test_lookups_of_rooms_that_exist_cost_nothing(app: FastAPI, client: TestClient) -> None:
    code, _ = create(client)
    budget(app, 2)
    for _ in range(10):
        assert client.get(f"/api/rooms/{code}").status_code == 200


def test_past_the_miss_budget_every_lookup_from_that_address_is_refused(
    app: FastAPI, proxied: TestClient
) -> None:
    """Refusing only the misses would still say which codes are live."""
    code, admin = create(proxied)
    budget(app, 3)
    for n in range(3):
        assert proxied.get(f"/api/rooms/NOSUCH{n}", headers=at("192.0.2.1")).status_code == 404

    refused = proxied.get(f"/api/rooms/{code}", headers=at("192.0.2.1"))
    assert refused.status_code == 429
    assert refused.json()["code"] == "rate_limited"
    joined = proxied.post(
        f"/api/rooms/{code}/join",
        json={"returning": False, "display_name": "Zezima"},
        headers=at("192.0.2.1"),
    )
    assert joined.status_code == 429
    removed = proxied.request(
        "DELETE", f"/api/rooms/{code}", json={"session": admin["session"]}, headers=at("192.0.2.1")
    )
    assert removed.status_code == 429

    assert proxied.get(f"/api/rooms/{code}", headers=at("192.0.2.2")).status_code == 200


def test_join_delete_and_socket_misses_share_the_budget(app: FastAPI, client: TestClient) -> None:
    code, _ = create(client)
    budget(app, 3)
    assert join(client, "NOSUCH", "Zezima").status_code == 404
    assert client.request("DELETE", "/api/rooms/NOSUCH", json={"session": "x"}).status_code == 404
    assert ws_closed_with(client, "NOSUCH", "x") == 4004
    assert client.get(f"/api/rooms/{code}").status_code == 429


def test_an_expired_room_is_a_miss(app: FastAPI, client: TestClient, db, evict) -> None:
    code, _ = create(client)
    db("update rooms set expires_at = now() - interval '1 minute' where code = $1", code)
    evict(code)
    budget(app, 1)
    assert client.get(f"/api/rooms/{code}").status_code == 410
    assert client.get(f"/api/rooms/{code}").status_code == 429


def test_a_bad_session_for_a_room_that_exists_is_no_miss(app: FastAPI, client: TestClient) -> None:
    code, _ = create(client)
    budget(app, 1)
    assert ws_closed_with(client, code, "not-a-session") == 4001
    assert client.get(f"/api/rooms/{code}").status_code == 200


def test_a_socket_over_the_budget_without_a_session_is_closed_before_the_room_is_named(
    app: FastAPI, client: TestClient
) -> None:
    code, _ = create(client)
    budget(app, 1)
    assert client.get("/api/rooms/NOSUCH").status_code == 404
    assert ws_closed_with(client, code, "not-a-session") == 1008
    assert ws_closed_with(client, "NOSUCH", "not-a-session") == 1008


def test_past_the_miss_budget_a_player_with_a_session_still_gets_back_in(
    app: FastAPI, client: TestClient
) -> None:
    """One device on a shared address cannot keep the rest from reconnecting.

    A session the room holds already knows the room exists, so letting it in says nothing.
    """
    code, admin = create(client)
    budget(app, 2)
    for n in range(2):
        assert client.get(f"/api/rooms/NOSUCH{n}").status_code == 404
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, admin["session"])
    assert client.get("/api/rooms/NOSUCH9").status_code == 429


def test_a_cross_site_lookup_is_403_and_costs_nothing(app: FastAPI, client: TestClient) -> None:
    """An ``<img>`` on another site is a GET with no preflight, charged to whoever views it."""
    code, _ = create(client)
    budget(app, 1)
    cross_site = {"Sec-Fetch-Site": "cross-site"}
    for target in ["NOSUCH", "NOSUCH", code]:
        refused = client.get(f"/api/rooms/{target}", headers=cross_site)
        assert refused.status_code == 403
    assert app.state.lookup_misses.left("testclient") == (1, None)
    same_site = {"Sec-Fetch-Site": "same-origin"}
    assert client.get("/api/rooms/NOSUCH", headers=same_site).status_code == 404
    assert client.get(f"/api/rooms/{code}", headers=same_site).status_code == 429


def test_joins_past_the_cap_are_refused_per_address(app: FastAPI, proxied: TestClient) -> None:
    code, _ = create(proxied)
    app.state.joins = RateLimiter(2)

    def join_from(address: str, name: str) -> int:
        body = {"returning": False, "display_name": name}
        return proxied.post(f"/api/rooms/{code}/join", json=body, headers=at(address)).status_code

    assert join_from("192.0.2.1", "Zezima") == 200
    assert join_from("192.0.2.1", "Zezima") == 409  # a join that fails costs nothing
    assert join_from("192.0.2.1", "Woox") == 200
    assert join_from("192.0.2.1", "Lynx") == 429
    assert join_from("192.0.2.2", "Lynx") == 200


def test_codes_are_drawn_from_the_system_random(app: FastAPI, client: TestClient) -> None:
    assert isinstance(app.state.rooms.code_rng, secrets.SystemRandom)
