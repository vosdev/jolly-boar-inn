"""Suggestions: what a player may send, the limit on sending, and the operator's queue."""

import re
from collections.abc import Iterator
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.config import REPO_ROOT, Settings
from app.http.ratelimit import SUGGESTIONS_PER_HOUR, RateLimiter
from app.main import create_app
from app.rooms import state
from app.suggestions import QUESTION_MODES
from tests import client_source
from tests.conftest import BASE

TOKEN = "0123456789abcdef0123456789abcdef"
BEARER = {"Authorization": f"Bearer {TOKEN}"}
WIKI = "https://oldschool.runescape.wiki/w/Barrows_Brothers"

EVENT = {
    "kind": "question",
    "content": {
        "type": "multiple_choice",
        "mode": "random_event",
        "random_event": "bob",
        "wiki": WIKI,
        "payload": {
            "prompt": "Which of these is not a Barrows brother?",
            "options": ["Dharok", "Torag", "Hazelmere", "Karil"],
            "answer_index": 2,
        },
    },
    "credit": "AFKFisher",
    "credit_shown": True,
}
# Every round a player may write for is built, so ``unbuilt_round`` offers one that is not.
UNBUILT = deepcopy(EVENT)
UNBUILT["content"]["mode"] = "zoom_quiz"
del UNBUILT["content"]["random_event"]
EXAMINE = {
    "kind": "examine",
    "content": {
        "name": "Cabbage",
        "prompt": "Yuck, I don't like cabbage.",
        "wiki": "https://oldschool.runescape.wiki/w/Cabbage",
    },
    "credit": "AFKFisher",
    "credit_shown": False,
}
ITEM = {
    "kind": "item",
    "content": {"name": " Ancient mace "},
    "credit": "Woox",
    "credit_shown": False,
}

ADMIN_ROUTES = (
    ("GET", "/api/admin/suggestions"),
    ("PUT", "/api/admin/suggestions/00000000-0000-0000-0000-000000000000"),
    ("POST", "/api/admin/suggestions/00000000-0000-0000-0000-000000000000/status"),
    ("POST", "/api/admin/suggestions/export"),
    ("POST", "/api/admin/suggestions/imported"),
)


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


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


def suggest(client: TestClient, body: dict[str, Any]) -> str:
    response = client.post("/api/suggestions", json=body)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def queue(client: TestClient, status: str = "pending") -> dict[str, Any]:
    response = client.get(f"/api/admin/suggestions?status={status}", headers=BEARER)
    assert response.status_code == 200, response.text
    return response.json()


def approve(client: TestClient, suggestion: str) -> None:
    response = client.post(
        f"/api/admin/suggestions/{suggestion}/status", json={"status": "approved"}, headers=BEARER
    )
    assert response.status_code == 200, response.text


def export(client: TestClient, status: str = "approved") -> dict[str, Any]:
    response = client.post("/api/admin/suggestions/export", json={"status": status}, headers=BEARER)
    assert response.status_code == 200, response.text
    assert response.headers["content-disposition"].startswith("attachment;")
    return response.json()


# --- what a player may send -----------------------------------------------------------


@pytest.fixture
def unbuilt_round(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(QUESTION_MODES, "zoom_quiz", frozenset({"multiple_choice"}))


@pytest.mark.usefixtures("unbuilt_round")
def test_each_kind_is_stored_as_pending_with_its_credit(client: TestClient) -> None:
    for body in (EVENT, UNBUILT, EXAMINE, ITEM):
        suggest(client, body)
    rows = queue(client)["suggestions"]
    assert [row["kind"] for row in rows] == ["question", "question", "examine", "item"]
    assert [row["playable"] for row in rows] == [True, False, True, True]
    assert rows[3]["content"] == {"name": "Ancient mace"}
    assert (rows[0]["credit"], rows[0]["credit_shown"]) == ("AFKFisher", True)
    assert queue(client)["counts"] == {"pending": 4, "approved": 0, "rejected": 0, "imported": 0}


def _with(body: dict[str, Any], **content: Any) -> dict[str, Any]:
    changed = deepcopy(body)
    changed["content"].update(content)
    return changed


def _without(body: dict[str, Any], key: str) -> dict[str, Any]:
    changed = deepcopy(body)
    del changed["content"][key]
    return changed


@pytest.mark.parametrize(
    "body",
    [
        _with(EVENT, payload={**EVENT["content"]["payload"], "options": ["One"] * 7}),
        _with(EVENT, payload={**EVENT["content"]["payload"], "answer_index": 9}),
        _with(EVENT, payload={**EVENT["content"]["payload"], "prompt": ""}),
        _with(EVENT, wiki="https://example.com/w/Bob"),
        _without(EVENT, "wiki"),
        _without(EVENT, "random_event"),
        _with(EVENT, random_event="nobody_at_all"),
        _with(EVENT, mode="release_order"),
        _with(EVENT, type="pick_all_that_apply"),
        _with(UNBUILT, type="free_text"),
        _with(UNBUILT, random_event="bob"),
        _with(EVENT, extra="field"),
        _with(EXAMINE, prompt="x" * 301),
        _with(EXAMINE, name="   "),
        _without(EXAMINE, "wiki"),
        _with(ITEM, name=""),
        _with(ITEM, name="x" * 81),
        _with(ITEM, name="Nul\x00"),
        _with(ITEM, name=" abyssal WHIP "),
        {**ITEM, "credit_shown": True},
    ],
)
def test_what_the_schema_refuses_is_a_422(client: TestClient, body: dict[str, Any]) -> None:
    response = client.post("/api/suggestions", json=body)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "bad_suggestion"
    assert queue(client)["suggestions"] == []


@pytest.mark.parametrize("credit", ["", "   ", "x" * 25, "Zezima<b>", "名前"])
def test_a_credit_that_fails_the_name_rules_is_a_422(client: TestClient, credit: str) -> None:
    response = client.post("/api/suggestions", json={**EVENT, "credit": credit})
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "bad_name"


def test_a_credit_is_held_like_a_display_name(client: TestClient) -> None:
    suggest(client, {**ITEM, "credit": "  Woox   the  Great "})
    assert queue(client)["suggestions"][0]["credit"] == "Woox the Great"


def test_html_is_kept_as_typed(client: TestClient) -> None:
    body = _with(EVENT, payload={**EVENT["content"]["payload"], "prompt": "<b>Bold</b>?"})
    suggest(client, body)
    assert queue(client)["suggestions"][0]["content"]["payload"]["prompt"] == "<b>Bold</b>?"


def test_the_form_offers_the_modes_the_server_takes() -> None:
    source = client_source.read("lib/suggestions.ts")
    rounds = re.search(r"const CHOICE_ROUNDS = \[([^\]]*)\]", source)
    assert rounds is not None
    offered = set(re.findall(r"'([a-z_]+)'", rounds.group(1))) | {"random_event"}
    assert offered == set(QUESTION_MODES)


# --- the limit ------------------------------------------------------------------------


def test_one_suggestion_over_the_hourly_limit_is_a_429(client: TestClient) -> None:
    assert client.get("/api/suggestions/allowance").json() == {
        "left": SUGGESTIONS_PER_HOUR,
        "retry_at": None,
    }
    for _ in range(SUGGESTIONS_PER_HOUR):
        suggest(client, ITEM)
    response = client.post("/api/suggestions", json=ITEM)
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    allowance = client.get("/api/suggestions/allowance").json()
    assert allowance["left"] == 0 and allowance["retry_at"] is not None


def test_a_refused_suggestion_costs_no_quota(app: FastAPI, client: TestClient) -> None:
    app.state.suggestions = RateLimiter(limit=1)
    assert client.post("/api/suggestions", json=_with(ITEM, name="")).status_code == 422
    assert client.post("/api/suggestions", json={**ITEM, "credit": ""}).status_code == 422
    suggest(client, ITEM)


def test_an_ipv6_address_counts_by_its_64(app: FastAPI) -> None:
    with TestClient(ProxyHeadersMiddleware(app, trusted_hosts="testclient")) as proxied:
        app.state.suggestions = RateLimiter(limit=1)

        def from_(address: str) -> int:
            headers = {"X-Forwarded-For": address}
            return proxied.post("/api/suggestions", json=ITEM, headers=headers).status_code

        assert from_("2001:db8::1") == 201
        assert from_("2001:db8::2") == 429
        assert from_("2001:db8:0:1::1") == 201


# --- the operator's queue -------------------------------------------------------------


def test_without_a_token_the_queue_routes_are_404s(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        for method, path in ADMIN_ROUTES:
            assert client.request(method, path, json={}).status_code == 404, path


def test_without_the_bearer_the_queue_routes_are_401s(settings: Settings, dist: Path) -> None:
    configured = settings.model_copy(update={"admin_token": TOKEN})
    with TestClient(create_app(configured, dist)) as client:
        for method, path in ADMIN_ROUTES:
            response = client.request(method, path, json={})
            assert response.status_code == 401, path
            wrong = {"Authorization": f"Bearer {TOKEN}x"}
            assert client.request(method, path, json={}, headers=wrong).status_code == 401


@pytest.mark.usefixtures("unbuilt_round")
def test_export_holds_approved_playable_suggestions_in_creates_format(client: TestClient) -> None:
    event, unbuilt, examine, item = (suggest(client, b) for b in (EVENT, UNBUILT, EXAMINE, ITEM))
    suggest(client, _with(ITEM, name="Pending forever"))
    for suggestion in (event, unbuilt, examine, item):
        approve(client, suggestion)
    file = export(client)
    content = EVENT["content"]
    assert file == {
        "questions": [
            {
                "type": "multiple_choice",
                "payload": content["payload"],
                "random_event": "bob",
                "mode": "random_event",
                "wiki": WIKI,
                "credit": "AFKFisher",
                "credit_shown": True,
            }
        ],
        "examines": [{**EXAMINE["content"], "credit": "AFKFisher", "credit_shown": False}],
        "items": [{"name": "Ancient mace", "credit": "Woox", "credit_shown": False}],
    }
    approved = {row["id"]: row for row in queue(client, "approved")["suggestions"]}
    assert approved[unbuilt]["exported_at"] is None
    assert all(approved[s]["exported_at"] is not None for s in (event, examine, item))


def test_marking_imported_moves_only_what_was_exported(client: TestClient) -> None:
    first = suggest(client, ITEM)
    approve(client, first)
    export(client)
    later = suggest(client, _with(ITEM, name="Ahrim's hood"))
    approve(client, later)
    response = client.post("/api/admin/suggestions/imported", headers=BEARER, json={})
    assert response.json() == {"imported": 1}
    assert [row["id"] for row in queue(client, "imported")["suggestions"]] == [first]
    assert [row["id"] for row in queue(client, "approved")["suggestions"]] == [later]
    again = export(client, "imported")
    assert again["items"] == [{"name": "Ancient mace", "credit": "Woox", "credit_shown": False}]
    assert queue(client, "approved")["suggestions"][0]["exported_at"] is None


def test_an_edit_is_checked_and_must_be_exported_again(client: TestClient) -> None:
    suggestion = suggest(client, EXAMINE)
    approve(client, suggestion)
    export(client)
    url = f"/api/admin/suggestions/{suggestion}"
    kind_changed = client.put(url, headers=BEARER, json={**ITEM, "kind": "item"})
    assert kind_changed.status_code == 422
    edited = {
        "content": {**EXAMINE["content"], "name": "Cabbage (Draynor)"},
        "credit": "AFKFisher",
        "credit_shown": True,
    }
    response = client.put(url, headers=BEARER, json=edited)
    assert response.status_code == 200, response.text
    row = response.json()
    assert row["content"]["name"] == "Cabbage (Draynor)" and row["credit_shown"] is True
    assert row["exported_at"] is None
    refused = client.put(url, headers=BEARER, json={**edited, "content": {"name": "No line"}})
    assert refused.status_code == 422
    missing = client.put(
        "/api/admin/suggestions/00000000-0000-0000-0000-000000000000", headers=BEARER, json=edited
    )
    assert missing.status_code == 404


def test_an_edit_holds_an_item_to_the_same_rules(client: TestClient) -> None:
    url = f"/api/admin/suggestions/{suggest(client, ITEM)}"
    body = {"content": ITEM["content"], "credit": "Woox", "credit_shown": False}
    assert client.put(url, headers=BEARER, json=body).status_code == 200
    shown = client.put(url, headers=BEARER, json={**body, "credit_shown": True})
    assert shown.status_code == 422, shown.text
    on_roster = client.put(url, headers=BEARER, json={**body, "content": {"name": "Abyssal whip"}})
    assert on_roster.status_code == 422, on_roster.text


def test_reject_and_reopen(client: TestClient) -> None:
    suggestion = suggest(client, ITEM)
    url = f"/api/admin/suggestions/{suggestion}/status"
    assert client.post(url, headers=BEARER, json={"status": "rejected"}).status_code == 200
    assert queue(client, "rejected")["counts"]["rejected"] == 1
    assert client.post(url, headers=BEARER, json={"status": "imported"}).status_code == 422
    assert client.post(url, headers=BEARER, json={"status": "pending"}).status_code == 200
    assert len(queue(client)["suggestions"]) == 1


# --- the credit in a game -------------------------------------------------------------


def _credit_every(app: FastAPI, mode: str, **credit: Any) -> None:
    for pack in app.state.packs:
        for question in pack.questions:
            if question["mode"] == mode:
                question.update(credit)


def test_a_reveal_names_the_suggester_who_asked_to_be(app: FastAPI, table) -> None:
    _credit_every(app, "more_less", credit="AFKFisher", credit_shown=True)
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    game.skip()
    assert {seat.take("question_closed")["suggested_by"] for seat in game.seats} == {"AFKFisher"}


def test_a_reveal_leaves_out_a_suggester_who_did_not(app: FastAPI, table) -> None:
    _credit_every(app, "more_less", credit="AFKFisher")
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    game.skip()
    assert "suggested_by" not in game.admin.take("question_closed")


def test_only_a_pack_question_names_its_suggester() -> None:
    envelope = {"credit": "Zezima", "credit_shown": True}
    assert state._suggested_by("pack", envelope) == "Zezima"
    assert state._suggested_by("room", envelope) is None
    assert state._suggested_by("pack", {"credit": "Zezima"}) is None
