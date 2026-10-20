"""The operator's popular-item editor: queueing renames and removals, export, and applied."""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import roster_edits
from app.config import Settings
from app.main import create_app
from tests.conftest import BASE
from tests.packs import PACKS_DIR

TOKEN = "0123456789abcdef0123456789abcdef"
BEARER = {"Authorization": f"Bearer {TOKEN}"}
FIRST, SECOND, THIRD = roster_edits.roster()[:3]

ADMIN_ROUTES = (
    ("GET", "/api/admin/roster"),
    ("PUT", f"/api/admin/roster/{FIRST['id']}"),
    ("DELETE", f"/api/admin/roster/{FIRST['id']}"),
    ("GET", "/api/admin/roster-changes"),
    ("DELETE", f"/api/admin/roster-changes/{FIRST['id']}"),
    ("POST", "/api/admin/roster-changes/export"),
    ("POST", "/api/admin/roster-changes/applied"),
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


def rename(client: TestClient, item_id: int, name: Any) -> Any:
    return client.put(f"/api/admin/roster/{item_id}", json={"name": name}, headers=BEARER)


def remove(client: TestClient, item_id: int) -> Any:
    return client.request("DELETE", f"/api/admin/roster/{item_id}", json={}, headers=BEARER)


def changes(client: TestClient) -> list[dict[str, Any]]:
    response = client.get("/api/admin/roster-changes", headers=BEARER)
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
            assert client.request(method, path, json={"name": "x"}).status_code == 401, path


def test_the_roster_is_listed_whole(client: TestClient) -> None:
    listed = client.get("/api/admin/roster", headers=BEARER).json()["items"]
    assert listed == roster_edits.roster() and FIRST in listed


def test_a_rename_queues_without_touching_the_roster(client: TestClient) -> None:
    response = rename(client, FIRST["id"], "  A better name ")
    assert response.status_code == 200, response.text
    assert response.json() | {"updated_at": None} == {
        "item_id": FIRST["id"],
        "action": "rename",
        "name": "A better name",
        "before": FIRST["name"],
        "updated_at": None,
        "exported_at": None,
        "in_roster": True,
    }
    assert [change["item_id"] for change in changes(client)] == [FIRST["id"]]
    assert roster_edits.roster()[0] == FIRST


@pytest.mark.parametrize(
    "name",
    ["", "   ", "x" * 81, "Nul\x00", FIRST["name"], SECOND["name"].upper(), 7],
)
def test_a_name_that_is_no_name_for_the_item_is_a_422(client: TestClient, name: Any) -> None:
    assert rename(client, FIRST["id"], name).status_code == 422
    assert changes(client) == []


def test_a_name_another_pending_rename_takes_is_a_422(client: TestClient) -> None:
    assert rename(client, FIRST["id"], "Shared name").status_code == 200
    assert rename(client, SECOND["id"], "shared NAME").status_code == 422
    assert [change["item_id"] for change in changes(client)] == [FIRST["id"]]


def test_a_second_change_replaces_the_first(client: TestClient) -> None:
    rename(client, FIRST["id"], "First go")
    assert remove(client, FIRST["id"]).status_code == 200
    [only] = changes(client)
    assert only["action"] == "remove" and only["name"] is None and only["before"] == FIRST["name"]
    rename(client, FIRST["id"], "Second go")
    [only] = changes(client)
    assert only["action"] == "rename" and only["name"] == "Second go"


def test_an_id_not_on_the_roster_is_a_404_by_name(client: TestClient) -> None:
    for response in (rename(client, 999999, "Ghost"), remove(client, 999999)):
        assert response.status_code == 404
        assert "item 999999" in response.json()["message"]
    assert changes(client) == []


def test_discard_drops_the_change(client: TestClient) -> None:
    remove(client, FIRST["id"])
    path = f"/api/admin/roster-changes/{FIRST['id']}"
    response = client.request("DELETE", path, json={}, headers=BEARER)
    assert response.json() == {"discarded": FIRST["id"]}
    assert changes(client) == []
    assert client.request("DELETE", path, json={}, headers=BEARER).status_code == 404


def test_export_then_applied_drops_exactly_what_was_exported(client: TestClient) -> None:
    rename(client, SECOND["id"], "Renamed")
    remove(client, THIRD["id"])
    response = client.post("/api/admin/roster-changes/export", json={}, headers=BEARER)
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    assert response.json() == {
        "renames": [{"id": SECOND["id"], "name": "Renamed"}],
        "removes": [THIRD["id"]],
    }
    assert all(change["exported_at"] is not None for change in changes(client))

    # Changed after the export, it is no longer what the file holds.
    rename(client, SECOND["id"], "Renamed again")
    applied = client.post("/api/admin/roster-changes/applied", json={}, headers=BEARER)
    assert applied.json() == {"applied": 1}
    [left] = changes(client)
    assert left["item_id"] == SECOND["id"] and left["exported_at"] is None
