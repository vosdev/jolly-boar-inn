import asyncio
import secrets
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.config import REPO_ROOT, Settings
from app.db import _init_connection
from app.main import create_app
from app.modes import MODES, Mode
from app.questions.packs import Pack

BASE = "https://quiz.example"


@pytest.fixture
def settings() -> Settings:
    # Unreachable port so tests never touch a real database.
    return Settings(_env_file=None, database_url="postgresql://jbi:jbi@127.0.0.1:1/jbi")


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    d = tmp_path / "dist"
    (d / "assets").mkdir(parents=True)
    (d / "index.html").write_text("<!doctype html><title>Jolly Boar Inn</title>")
    (d / "assets" / "index-abc123.js").write_text("console.log('hi')")
    return d


class _TestEnv(BaseSettings):
    """Test-only variables, from the environment or the repo ``.env``."""

    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url_test: str | None = None


def _run(dsn: str, sql: str) -> None:
    async def go() -> None:
        conn = await asyncpg.connect(dsn)
        try:
            await conn.execute(sql)
        finally:
            await conn.close()

    asyncio.run(go())


@pytest.fixture
def test_db_dsn() -> Iterator[str]:
    """DSN of a throwaway database created for this test and dropped afterwards.

    ``DATABASE_URL_TEST`` names a Postgres server; its database is only used to issue
    ``CREATE DATABASE`` / ``DROP DATABASE``. Unset, the tests that need it skip.
    """
    server_dsn = _TestEnv().database_url_test
    if not server_dsn:
        pytest.skip("DATABASE_URL_TEST not set")
    name = f"jbi_test_{secrets.token_hex(4)}"
    dsn = urlunsplit(urlsplit(server_dsn)._replace(path="/" + name))
    _run(server_dsn, f'create database "{name}"')
    try:
        yield dsn
    finally:
        _run(server_dsn, f'drop database "{name}" with (force)')


@pytest.fixture
def app(test_db_dsn: str, dist: Path) -> FastAPI:
    """The app on a throwaway database with the shipped packs."""
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
def db(test_db_dsn: str) -> Callable[..., list[asyncpg.Record]]:
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


@pytest.fixture
def evict(app: FastAPI, client: TestClient) -> Callable[[str], bool]:
    """``evict(code)`` drops the room from the manager's memory, like a process restart.

    Tests that edit a room row behind the app's back call this so the next request
    rehydrates and sees the edit.
    """

    def run(code: str) -> bool:
        assert client.portal is not None
        return client.portal.call(app.state.rooms.evict, code)

    return run


@pytest.fixture
def second_mode(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A second playable mode, so a room can be more than one round.

    A mode is a round, and one registered mode would make every room a single round --
    which is exactly what the rounds this feature is about would then never exercise. The
    stub is a second mode over the ``more_less`` type, with a pack of questions copied from
    the shipped ones and relabelled with its mode, so a two-mode room plays the way a
    two-mode room will when the second real mode lands -- and its two rounds share an
    answer shape, which is the case a mode exists for.

    Takes ``client`` because the packs are loaded in the app's lifespan, which is what
    entering the test client runs.
    """
    name = "second_round"
    shipped = [q for pack in app.state.packs for q in pack.questions]
    borrowed = [q for q in shipped if q["type"] == "more_less"][:20]
    assert borrowed, "the shipped packs are the questions this stub copies"
    MODES[name] = Mode(id=name, type="more_less")
    app.state.packs.append(
        Pack(
            name=name,
            generated_at="2026-09-18T00:00:00Z",
            questions=tuple(
                {**question, "id": f"q_{name}_{index}", "mode": name}
                for index, question in enumerate(borrowed)
            ),
            path=Path(f"{name}.json"),
        )
    )
    try:
        yield name
    finally:
        del MODES[name]
        app.state.packs.pop()
