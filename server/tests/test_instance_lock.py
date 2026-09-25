"""One process per database: room state lives in one worker's memory, so a second must not start."""

import re
import time
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.main import AnotherInstance, create_app


def _app(dsn: str, dist: Path) -> FastAPI:
    return create_app(Settings(_env_file=None, database_url=dsn), dist)


def _lock_holders(db: Callable) -> list[int]:
    rows = db(
        "select pid from pg_locks where locktype = 'advisory' and granted"
        " and database = (select oid from pg_database where datname = current_database())"
    )
    return [row["pid"] for row in rows]


def test_the_container_runs_one_worker() -> None:
    """An explicit ``--workers`` beats the ``WEB_CONCURRENCY`` some hosts set."""
    cmd = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8").split("\nCMD ")[-1]
    assert re.search(r'"--workers",\s*"1"', cmd), cmd


def test_a_second_instance_on_the_same_database_refuses_to_start(
    test_db_dsn: str, dist: Path
) -> None:
    with TestClient(_app(test_db_dsn, dist)) as first:
        with pytest.raises(AnotherInstance), TestClient(_app(test_db_dsn, dist)):
            pass
        assert first.get("/api/health").status_code == 200


def test_a_stopped_instance_frees_the_database_for_the_next(test_db_dsn: str, dist: Path) -> None:
    with TestClient(_app(test_db_dsn, dist)):
        pass
    with TestClient(_app(test_db_dsn, dist)) as second:
        assert second.get("/api/health").status_code == 200


def test_an_instance_that_started_without_the_database_does_not_share_it(
    test_db_dsn: str, dist: Path, settings: Settings
) -> None:
    """The lock is taken on the first connection, whenever that is, not only at startup."""
    late = create_app(settings, dist)
    with TestClient(late) as client:
        assert client.get("/api/health").status_code == 503
        late.state.settings = Settings(_env_file=None, database_url=test_db_dsn)
        with TestClient(_app(test_db_dsn, dist)):
            assert client.get("/api/health").status_code == 503
            assert client.post("/api/rooms", json={"display_name": "Zezima"}).status_code == 503
        assert client.get("/api/health").status_code == 200


def _lose_the_lock(app: FastAPI, db: Callable) -> int:
    """End the lock's connection from the server side, as a Postgres restart would."""
    [holder] = _lock_holders(db)
    db("select pg_terminate_backend($1)", holder)
    deadline = time.monotonic() + 5
    while _lock_holders(db) or not app.state.instance_lock.is_closed():
        assert time.monotonic() < deadline, "the lock's connection outlived its backend"
        time.sleep(0.01)
    return holder


def test_a_lost_lock_is_taken_again(app: FastAPI, client: TestClient, db: Callable) -> None:
    holder = _lose_the_lock(app, db)
    assert client.get("/api/health").status_code == 200
    [again] = _lock_holders(db)
    assert again != holder


def test_a_lost_lock_that_another_instance_took_stops_this_one(
    app: FastAPI, client: TestClient, db: Callable, test_db_dsn: str, dist: Path
) -> None:
    _lose_the_lock(app, db)
    with TestClient(_app(test_db_dsn, dist)) as other:
        assert client.get("/api/health").status_code == 503
        assert other.get("/api/health").status_code == 200
