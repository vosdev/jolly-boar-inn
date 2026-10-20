"""The operator's pack question editor: queueing edits and deletes, export, and applied."""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.questions import schema
from app.questions.packs import load_packs, mode_questions
from tests.conftest import BASE
from tests.packs import PACKS_DIR

TOKEN = "0123456789abcdef0123456789abcdef"
BEARER = {"Authorization": f"Bearer {TOKEN}"}
PACKS = load_packs(PACKS_DIR)
ODD = mode_questions(PACKS, "odd_one_out")[0]
SECOND_ODD = mode_questions(PACKS, "odd_one_out")[1]
NPC = mode_questions(PACKS, "random_event")[0]
PRICE = mode_questions(PACKS, "price_is_right")[0]

ADMIN_ROUTES = (
    ("GET", "/api/admin/questions/modes"),
    ("PUT", f"/api/admin/questions/{ODD['id']}"),
    ("DELETE", f"/api/admin/questions/{ODD['id']}"),
    ("GET", "/api/admin/question-changes"),
    ("DELETE", f"/api/admin/question-changes/{ODD['id']}"),
    ("POST", "/api/admin/question-changes/export"),
    ("POST", "/api/admin/question-changes/applied"),
)


@pytest.fixture
def app(test_db_dsn: str, dist: Path) -> FastAPI:
    settings = Settings(
        _env_file=None,
        database_url=test_db_dsn,
        packs_dir=PACKS_DIR,
        public_base_url=BASE,
        admin_token=TOKEN,
    )
    return create_app(settings, dist)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


def body_of(question: dict[str, Any], **payload: Any) -> dict[str, Any]:
    """The edit request for ``question``, its payload fields replaced by ``payload``."""
    fields = {
        k: question[k] for k in ("wiki", "source_url", "credit", "credit_shown") if k in question
    }
    return {"payload": {**question["payload"], **payload}, **fields}


def put(client: TestClient, question_id: str, body: dict[str, Any]) -> Any:
    return client.put(f"/api/admin/questions/{question_id}", json=body, headers=BEARER)


def changes(client: TestClient) -> list[dict[str, Any]]:
    response = client.get("/api/admin/question-changes", headers=BEARER)
    assert response.status_code == 200, response.text
    return response.json()["changes"]


def test_without_a_token_the_routes_are_404s(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        for method, path in ADMIN_ROUTES:
            assert client.request(method, path, json={}).status_code == 404, path


def test_without_the_bearer_the_routes_are_401s(settings: Settings, dist: Path) -> None:
    configured = settings.model_copy(update={"admin_token": TOKEN})
    with TestClient(create_app(configured, dist)) as client:
        for method, path in ADMIN_ROUTES:
            assert client.request(method, path, json={}).status_code == 401, path


def test_the_editor_lists_the_hand_written_modes_only(client: TestClient) -> None:
    modes = client.get("/api/admin/questions/modes", headers=BEARER).json()
    assert "odd_one_out" in modes and "random_event" in modes and "guess_examine" in modes
    assert "more_less" not in modes and "price_is_right" not in modes


@pytest.mark.parametrize(
    "body",
    [
        {"payload": {**ODD["payload"], "options": ["Only one"]}},
        {"payload": {**ODD["payload"], "prompt": ""}},
        {"payload": {**ODD["payload"], "answer_index": 9}},
        {"payload": ODD["payload"], "wiki": "https://example.com/not-the-wiki"},
        {"payload": ODD["payload"], "credit_shown": True},
        {"payload": {**ODD["payload"], "prompt": "\x00"}},
        {"payload": ODD["payload"], "mode": "drop_table"},
    ],
)
def test_an_edit_that_breaks_the_schema_is_a_422(client: TestClient, body: dict[str, Any]) -> None:
    assert put(client, ODD["id"], body).status_code == 422
    assert changes(client) == []


def test_an_edit_queues_without_touching_the_packs(client: TestClient) -> None:
    response = put(client, ODD["id"], body_of(ODD, explanation="A better explanation."))
    assert response.status_code == 200, response.text
    [change] = changes(client)
    assert change["question_id"] == ODD["id"] and change["action"] == "edit"
    assert change["before"] == ODD and change["in_packs"] is True
    question = change["question"]
    assert question["payload"]["explanation"] == "A better explanation."
    assert question["id"] == schema.content_id(question) != ODD["id"]
    served = client.get("/api/admin/questions?mode=odd_one_out", headers=BEARER).json()
    assert served["questions"][0] == ODD


def test_a_second_change_replaces_the_first(client: TestClient) -> None:
    put(client, ODD["id"], body_of(ODD, explanation="First."))
    put(client, ODD["id"], body_of(ODD, explanation="Second."))
    [change] = changes(client)
    assert change["question"]["payload"]["explanation"] == "Second."
    client.request("DELETE", f"/api/admin/questions/{ODD['id']}", json={}, headers=BEARER)
    [change] = changes(client)
    assert change["action"] == "delete" and change["question"] is None


def test_an_npc_keeps_its_npc_and_its_credit_is_held_to_the_name_rules(
    client: TestClient,
) -> None:
    body = {**body_of(NPC, prompt="A reworded question?"), "credit": "  Zezima  "}
    assert put(client, NPC["id"], body).status_code == 200
    [change] = changes(client)
    assert change["question"]["random_event"] == NPC["random_event"]
    assert change["question"]["credit"] == "Zezima"


def test_what_the_editor_does_not_list_is_a_404(client: TestClient) -> None:
    assert put(client, "q_0000000000000000", body_of(ODD)).status_code == 404
    assert put(client, PRICE["id"], body_of(PRICE)).status_code == 404
    gone = client.request(
        "DELETE", "/api/admin/questions/q_0000000000000000", json={}, headers=BEARER
    )
    assert gone.status_code == 404


def test_an_edit_that_changes_nothing_or_repeats_another_question_is_a_422(
    client: TestClient,
) -> None:
    assert put(client, ODD["id"], body_of(ODD)).status_code == 422
    assert put(client, ODD["id"], body_of(SECOND_ODD)).status_code == 422
    assert put(client, ODD["id"], body_of(ODD, explanation="Shared.")).status_code == 200
    assert put(client, SECOND_ODD["id"], body_of(ODD, explanation="Shared.")).status_code == 422
    assert len(changes(client)) == 1


def test_discard_drops_the_change(client: TestClient) -> None:
    put(client, ODD["id"], body_of(ODD, explanation="Gone soon."))
    path = f"/api/admin/question-changes/{ODD['id']}"
    assert client.request("DELETE", path, json={}, headers=BEARER).status_code == 200
    assert changes(client) == []
    assert client.request("DELETE", path, json={}, headers=BEARER).status_code == 404


def test_export_then_applied_drops_exactly_what_was_exported(client: TestClient) -> None:
    put(client, NPC["id"], body_of(NPC, prompt="A reworded question?"))
    client.request("DELETE", f"/api/admin/questions/{SECOND_ODD['id']}", json={}, headers=BEARER)
    response = client.post("/api/admin/question-changes/export", json={}, headers=BEARER)
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    file = response.json()
    [edit] = file["edits"]
    assert edit["id"] == NPC["id"] and "random_event" not in edit["question"]
    assert file["deletes"] == [SECOND_ODD["id"]]
    assert all(change["exported_at"] is not None for change in changes(client))

    # Edited after the export, it is no longer what the file holds.
    put(client, NPC["id"], body_of(NPC, prompt="Reworded again?"))
    applied = client.post("/api/admin/question-changes/applied", json={}, headers=BEARER)
    assert applied.json() == {"applied": 1}
    [left] = changes(client)
    assert left["question_id"] == NPC["id"] and left["exported_at"] is None
