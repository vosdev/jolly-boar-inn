"""Join requests: asking an invite-only room's admins to be let in without its key."""

import json
import time
from typing import Any

import httpx
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession

from app.rooms.joins import MAX_JOIN_REQUESTS, REQUEST_LIFETIME_SECONDS
from tests.rooms_api import hello, next_of
from tests.test_invite_links import create_keyed, join, key_of


def ask(client: TestClient, code: str, name: str) -> httpx.Response:
    return client.post(
        f"/api/rooms/{code}/requests", json={"returning": False, "display_name": name}
    )


def ticket(client: TestClient, code: str, name: str) -> str:
    response = ask(client, code, name)
    assert response.status_code == 201, response.text
    return str(response.json()["ticket"])


def poll(client: TestClient, code: str, ticket: str) -> httpx.Response:
    return client.post(f"/api/rooms/{code}/requests/poll", json={"ticket": ticket})


def cancel(client: TestClient, code: str, ticket: str) -> httpx.Response:
    return client.post(f"/api/rooms/{code}/requests/cancel", json={"ticket": ticket})


def asking(frame: dict[str, Any]) -> list[str]:
    return [r["display_name"] for r in frame["room"]["requests"]]


def requests_change(ws: WebSocketTestSession) -> list[str]:
    return asking(next_of(ws, "room_updated"))


def decide(ws: WebSocketTestSession, frame: dict[str, Any], accept: bool) -> None:
    ws.send_json({"t": "decide_request", "request_id": frame["id"], "accept": accept})


def test_the_host_sees_the_request_and_letting_them_in_joins_them(client: TestClient) -> None:
    code, admin = create_keyed(client)
    with client.websocket_connect(f"/ws/{code}") as host:
        assert hello(host, admin["session"])["room"]["requests"] == []
        mine = ticket(client, code, "Zezima")
        update = next_of(host, "room_updated")
        assert asking(update) == ["Zezima"]
        assert poll(client, code, mine).json() == {"status": "waiting"}
        decide(host, update["room"]["requests"][0], accept=True)
        assert requests_change(host) == []
        admitted = poll(client, code, mine).json()
        assert admitted["status"] == "accepted"
        assert admitted["player"]["display_name"] == "Zezima"
        players = next_of(host, "room_updated")["players"]
        assert [p["display_name"] for p in players] == ["Admin", "Zezima"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        assert hello(ws, admitted["session"])["you"]["display_name"] == "Zezima"
    # The ticket was spent on the session.
    assert poll(client, code, mine).json()["code"] == "request_gone"


def test_turning_them_away_tells_them_and_lets_nobody_in(client: TestClient) -> None:
    code, admin = create_keyed(client)
    with client.websocket_connect(f"/ws/{code}") as host:
        hello(host, admin["session"])
        mine = ticket(client, code, "Zezima")
        decide(host, next_of(host, "room_updated")["room"]["requests"][0], accept=False)
        assert requests_change(host) == []
        response = poll(client, code, mine)
        assert response.status_code == 403
        assert response.json()["code"] == "request_denied"
    # Told once; the ticket is spent.
    assert poll(client, code, mine).json()["code"] == "request_gone"
    assert client.get(f"/api/rooms/{code}").json()["players"] == 1


def test_a_cancelled_request_leaves_the_host_list(client: TestClient) -> None:
    code, admin = create_keyed(client)
    with client.websocket_connect(f"/ws/{code}") as host:
        hello(host, admin["session"])
        mine = ticket(client, code, "Zezima")
        assert requests_change(host) == ["Zezima"]
        assert cancel(client, code, mine).status_code == 204
        assert requests_change(host) == []
    assert poll(client, code, mine).json()["code"] == "request_gone"
    assert cancel(client, code, mine).status_code == 204


def test_a_requester_who_stops_polling_drops_off(client: TestClient) -> None:
    client.app.state.rooms.request_stale_seconds = 0.2  # type: ignore[attr-defined]
    code, admin = create_keyed(client)
    with client.websocket_connect(f"/ws/{code}") as host:
        hello(host, admin["session"])
        started = time.monotonic()
        mine = ticket(client, code, "Zezima")
        assert requests_change(host) == ["Zezima"]
        assert requests_change(host) == []
        assert time.monotonic() - started >= 0.2
    assert poll(client, code, mine).json()["code"] == "request_gone"


def test_a_request_nobody_answers_lapses(client: TestClient, clock: list[float]) -> None:
    code, admin = create_keyed(client)
    with client.websocket_connect(f"/ws/{code}") as host:
        hello(host, admin["session"])
        mine = ticket(client, code, "Zezima")
        assert requests_change(host) == ["Zezima"]
        clock[0] += REQUEST_LIFETIME_SECONDS
        assert poll(client, code, mine).json()["code"] == "request_gone"
        assert requests_change(host) == []


def test_requests_are_capped_per_room(client: TestClient) -> None:
    code, _ = create_keyed(client)
    for n in range(MAX_JOIN_REQUESTS):
        ticket(client, code, f"Guest {n}")
    response = ask(client, code, "One Too Many")
    assert response.status_code == 409
    assert response.json()["code"] == "requests_full"


def test_a_name_in_the_room_or_already_asking_is_taken(client: TestClient) -> None:
    code, _ = create_keyed(client)
    ticket(client, code, "Zezima")
    for name in ("admin", "ZEZIMA"):
        response = ask(client, code, name)
        assert response.status_code == 409
        assert response.json()["code"] == "name_taken"


def test_a_room_anyone_can_join_takes_no_requests(client: TestClient) -> None:
    code, _ = create_keyed(client, invite_only=False)
    response = ask(client, code, "Zezima")
    assert response.status_code == 409
    assert response.json()["code"] == "bad_state"


def test_starting_the_game_turns_every_requester_away(client: TestClient) -> None:
    code, admin = create_keyed(client, modes=[{"mode": "more_less", "questions": 5}])
    with client.websocket_connect(f"/ws/{code}") as host:
        hello(host, admin["session"])
        mine = ticket(client, code, "Zezima")
        next_of(host, "room_updated")
        host.send_json({"t": "start_game"})
        assert "requests" in next_of(host, "room_updated")["room"]
        assert client.app.state.rooms.rooms[code].requests == {}  # type: ignore[attr-defined]
    assert poll(client, code, mine).json()["code"] == "not_open"
    assert ask(client, code, "Woox").json()["code"] == "not_open"


def test_only_an_admin_decides_and_a_non_admin_never_sees_who_asked(client: TestClient) -> None:
    code, admin = create_keyed(client)
    key = key_of(client, code, admin["session"])
    player = join(client, code, "Woox", key=key).json()
    with (
        client.websocket_connect(f"/ws/{code}") as host,
        client.websocket_connect(f"/ws/{code}") as guest,
    ):
        hello(host, admin["session"])
        seen = [hello(guest, player["session"])]
        next_of(host, "players_updated")
        ticket(client, code, "Zezima")
        request = next_of(host, "room_updated")["room"]["requests"][0]
        seen.append(next_of(guest, "room_updated"))
        decide(guest, request, accept=True)
        assert next_of(guest, "error")["code"] == "not_admin"
        assert "Zezima" not in json.dumps(seen)
        assert all("requests" not in frame["room"] for frame in seen)
        # Promoted, they are sent the list like any other admin.
        host.send_json({"t": "promote", "player_id": player["player"]["id"]})
        assert asking(next_of(guest, "room_updated")) == ["Zezima"]


def test_a_request_is_answered_once(client: TestClient) -> None:
    code, admin = create_keyed(client)
    with client.websocket_connect(f"/ws/{code}") as host:
        hello(host, admin["session"])
        ticket(client, code, "Zezima")
        request = next_of(host, "room_updated")["room"]["requests"][0]
        decide(host, request, accept=False)
        next_of(host, "room_updated")
        decide(host, request, accept=True)
        assert next_of(host, "error")["code"] == "bad_state"


def test_a_full_room_lets_nobody_else_in(client: TestClient) -> None:
    code, admin = create_keyed(client, max_players=2)
    with client.websocket_connect(f"/ws/{code}") as host:
        hello(host, admin["session"])
        first = ticket(client, code, "Zezima")
        next_of(host, "room_updated")
        ticket(client, code, "Woox")
        requests = next_of(host, "room_updated")["room"]["requests"]
        decide(host, requests[0], accept=True)
        next_of(host, "room_updated")
        assert poll(client, code, first).json()["status"] == "accepted"
        next_of(host, "room_updated")
        decide(host, requests[1], accept=True)
        assert next_of(host, "error")["code"] == "bad_state"
    assert ask(client, code, "Durial").json()["code"] == "room_full"
