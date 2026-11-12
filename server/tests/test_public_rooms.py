"""Public lobbies: a room the host lists shows on everyone's Home while it can be joined."""

import json
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.http import rooms as rooms_http
from tests.rooms_api import hello, join, next_of

MODES = [{"mode": "more_less", "questions": 3}, {"mode": "price_is_right", "questions": 3}]


def create(client: TestClient, public: bool = True, **settings: Any) -> tuple[str, dict[str, Any]]:
    """Create a room as Admin; ``(code, {session, player})`` like ``rooms_api.create``."""
    settings.setdefault("modes", MODES)
    response = client.post(
        "/api/rooms",
        json={"returning": False, "display_name": "Admin", "public": public, "settings": settings},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body["code"], {"session": body["session"], "player": body["player"]}


@contextmanager
def seated(client: TestClient, code: str, session: str) -> Iterator[WebSocketTestSession]:
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, session)
        yield ws


def listed(client: TestClient, clock: list[float]) -> list[dict[str, Any]]:
    """The list as it stands now, past whatever an earlier call left cached."""
    clock[0] += rooms_http.PUBLIC_ROOMS_TTL
    response = client.get("/api/rooms/public")
    assert response.status_code == 200
    return response.json()


def codes(entries: list[dict[str, Any]]) -> list[str]:
    return [entry["code"] for entry in entries]


def test_a_public_lobby_appears_within_the_cache_window(
    client: TestClient, clock: list[float]
) -> None:
    assert client.get("/api/rooms/public").json() == []
    code, admin = create(client)
    with seated(client, code, admin["session"]):
        assert client.get("/api/rooms/public").json() == []
        clock[0] += rooms_http.PUBLIC_ROOMS_TTL
        assert client.get("/api/rooms/public").json() == [
            {
                "code": code,
                "host": {
                    "id": admin["player"]["id"],
                    "display_name": "Admin",
                    "avatar": admin["player"]["avatar"],
                },
                "players": 1,
                "max_players": 50,
                "rounds": 2,
                "modes": ["more_less", "price_is_right"],
            }
        ]


def test_it_drops_off_once_the_game_starts(client: TestClient, clock: list[float]) -> None:
    code, admin = create(client)
    with seated(client, code, admin["session"]) as ws:
        assert codes(listed(client, clock)) == [code]
        ws.send_json({"t": "start_game"})
        next_of(ws, "room_updated")
        assert listed(client, clock) == []


def test_an_unlisted_room_never_appears(client: TestClient, clock: list[float]) -> None:
    code, admin = create(client, public=False)
    with seated(client, code, admin["session"]):
        assert listed(client, clock) == []


def test_a_full_room_or_one_nobody_is_in_is_not_listed(
    client: TestClient, clock: list[float]
) -> None:
    empty, _ = create(client)
    full, admin = create(client, max_players=2)
    assert join(client, full, "Zezima").status_code == 200
    with seated(client, full, admin["session"]):
        assert listed(client, clock) == []
    assert empty not in codes(listed(client, clock))


def test_newest_first_and_capped(
    client: TestClient, clock: list[float], monkeypatch: pytest.MonkeyPatch
) -> None:
    older, first = create(client)
    newer, second = create(client)
    with seated(client, older, first["session"]), seated(client, newer, second["session"]):
        assert codes(listed(client, clock)) == [newer, older]
        monkeypatch.setattr(rooms_http, "PUBLIC_ROOMS_MAX", 1)
        assert codes(listed(client, clock)) == [newer]


def create_at(client: TestClient, address: str) -> tuple[str, dict[str, Any]]:
    """``create`` from ``address``, through a client that believes ``X-Forwarded-For``."""
    response = client.post(
        "/api/rooms",
        json={
            "returning": False,
            "display_name": "Admin",
            "public": True,
            "settings": {"modes": MODES},
        },
        headers={"X-Forwarded-For": address},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body["code"], {"session": body["session"], "player": body["player"]}


@pytest.fixture
def proxied(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(ProxyHeadersMiddleware(app, trusted_hosts="testclient")) as client:
        yield client


def test_one_address_lists_only_a_few_rooms_and_others_still_show(
    app: FastAPI, proxied: TestClient
) -> None:
    """A script making rooms from one address cannot push everyone else's off Home."""
    clock = [1000.0]
    app.state.rooms.clock = lambda: clock[0]
    spam = [create_at(proxied, "192.0.2.1") for _ in range(5)]
    other, host = create_at(proxied, "192.0.2.2")
    with ExitStack() as held:
        for code, admin in [*spam, (other, host)]:
            held.enter_context(seated(proxied, code, admin["session"]))
        shown = codes(listed(proxied, clock))
    assert other in shown
    assert len([code for code, _ in spam if code in shown]) == rooms_http.PUBLIC_ROOMS_PER_ADDRESS


def test_of_one_address_s_rooms_those_somebody_joined_are_listed_first(
    app: FastAPI, proxied: TestClient
) -> None:
    clock = [1000.0]
    app.state.rooms.clock = lambda: clock[0]
    joined, first = create_at(proxied, "192.0.2.1")
    assert join(proxied, joined, "Zezima").status_code == 200
    rooms = [create_at(proxied, "192.0.2.1") for _ in range(3)]
    with ExitStack() as held:
        for code, admin in [(joined, first), *rooms]:
            held.enter_context(seated(proxied, code, admin["session"]))
        shown = codes(listed(proxied, clock))
    assert shown == [rooms[-1][0], joined]


def test_rehydrated_rooms_count_against_their_admin_s_address(
    app: FastAPI, proxied: TestClient
) -> None:
    clock = [1000.0]
    app.state.rooms.clock = lambda: clock[0]
    made = [create_at(proxied, "192.0.2.1") for _ in range(3)]
    assert proxied.portal is not None
    for code, _ in made:
        assert proxied.portal.call(app.state.rooms.evict, code.upper())
    with ExitStack() as held:
        for code, admin in made:
            ws = held.enter_context(
                proxied.websocket_connect(f"/ws/{code}", headers={"X-Forwarded-For": "192.0.2.1"})
            )
            hello(ws, admin["session"])
        assert len(listed(proxied, clock)) == rooms_http.PUBLIC_ROOMS_PER_ADDRESS


def test_a_rehydrated_room_is_still_public(
    client: TestClient, clock: list[float], evict: Any
) -> None:
    code, admin = create(client)
    assert evict(code)
    with seated(client, code, admin["session"]):
        assert codes(listed(client, clock)) == [code]


def test_public_and_invite_only_is_a_422(client: TestClient) -> None:
    response = client.post(
        "/api/rooms",
        json={
            "returning": False,
            "display_name": "Admin",
            "public": True,
            "invite_only": True,
            "settings": {"modes": MODES},
        },
    )
    assert response.status_code == 422


def test_public_rooms_off_serves_an_empty_list(
    app: FastAPI, client: TestClient, clock: list[float]
) -> None:
    manager = app.state.rooms
    manager.settings = manager.settings.model_copy(update={"public_rooms": False})
    code, admin = create(client)
    with seated(client, code, admin["session"]):
        assert listed(client, clock) == []


def test_a_hidden_rounds_room_lists_no_mode_names(client: TestClient, clock: list[float]) -> None:
    code, admin = create(client, hide_rounds=True)
    with seated(client, code, admin["session"]):
        [entry] = listed(client, clock)
    assert entry["rounds"] == 2
    assert "modes" not in entry
    text = json.dumps(entry)
    assert "more_less" not in text
    assert "price_is_right" not in text


def test_the_list_never_carries_a_session_a_key_or_a_question(
    client: TestClient, clock: list[float], db: Any
) -> None:
    code, admin = create(client)
    player = join(client, code, "Zezima").json()
    with seated(client, code, admin["session"]):
        [entry] = listed(client, clock)
    assert set(entry) == {"code", "host", "players", "max_players", "rounds", "modes"}
    assert set(entry["host"]) == {"id", "display_name", "avatar"}
    text = json.dumps(entry)
    assert admin["session"] not in text
    assert player["session"] not in text
    for row in db(
        "select q.id, q.question_id from questions q join rooms r on r.id = q.room_id"
        " where r.code = $1",
        code,
    ):
        assert str(row["id"]) not in text
        assert row["question_id"] not in text
