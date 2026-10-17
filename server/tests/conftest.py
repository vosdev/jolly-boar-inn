import asyncio
import os
import secrets
from collections.abc import Callable, Iterator
from contextlib import ExitStack
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.config import REPO_ROOT, Settings
from app.db import _init_connection, create_pool, run_migrations
from app.main import create_app
from app.modes import MODES, Mode
from app.questions.packs import Pack
from app.rooms import loop
from app.ws import handler as ws_handler
from tests.game_api import Faults, Game, seat_table
from tests.rooms_api import create, join

BASE = "https://quiz.example"


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--require-db",
        action="store_true",
        help="fail, rather than skip, the database tests when DATABASE_URL_TEST is unset",
    )


@pytest.fixture(autouse=True)
def no_hold(monkeypatch: pytest.MonkeyPatch) -> None:
    """Open every question with its buttons there, rather than after the scroll types it in.

    Every question would otherwise hold every test for a second or more; the tests about
    the hold set their own.
    """
    monkeypatch.setattr(loop, "question_hold", lambda question: 0)


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


def _server_dsn(config: pytest.Config) -> str:
    """``DATABASE_URL_TEST``; without it the database tests skip, or fail where they must.

    CI sets ``CI``, and ``make test`` passes ``--require-db``: a run of either that skipped
    the database tests would pass having tested little of the game.
    """
    server_dsn = _TestEnv().database_url_test
    if server_dsn:
        return server_dsn
    in_ci = os.environ.get("CI", "").lower() not in ("", "0", "false")
    if in_ci or config.getoption("--require-db"):
        pytest.fail("DATABASE_URL_TEST is not set, and this run requires the database tests")
    pytest.skip("DATABASE_URL_TEST not set")


def _on(server_dsn: str, name: str) -> str:
    return urlunsplit(urlsplit(server_dsn)._replace(path="/" + name))


def _run(dsn: str, sql: str) -> None:
    async def go() -> None:
        conn = await asyncpg.connect(dsn)
        try:
            await conn.execute(sql)
        finally:
            await conn.close()

    asyncio.run(go())


@pytest.fixture(scope="session")
def migrated_template(request: pytest.FixtureRequest) -> Iterator[str]:
    """A database migrated once per run, which each test's database is copied from.

    Copying a template is a file copy on the server; running every migration again for
    each of hundreds of tests was most of their setup.
    """
    server_dsn = _server_dsn(request.config)
    name = f"jbi_template_{secrets.token_hex(4)}"
    _run(server_dsn, f'create database "{name}"')
    try:

        async def migrate() -> None:
            pool = await create_pool(_on(server_dsn, name))
            try:
                await run_migrations(pool)
            finally:
                await pool.close()

        asyncio.run(migrate())
        yield name
    finally:
        _run(server_dsn, f'drop database "{name}" with (force)')


@pytest.fixture
def test_db_dsn(request: pytest.FixtureRequest) -> Iterator[str]:
    """DSN of a throwaway database created for this test and dropped afterwards.

    ``DATABASE_URL_TEST`` names a Postgres server; its database is only used to issue
    ``CREATE DATABASE`` / ``DROP DATABASE``. The database comes migrated, unless the test
    is marked ``empty_database``, as the tests of the migrations themselves are.
    """
    server_dsn = _server_dsn(request.config)
    name = f"jbi_test_{secrets.token_hex(4)}"
    if request.node.get_closest_marker("empty_database"):
        _run(server_dsn, f'create database "{name}"')
    else:
        template = request.getfixturevalue("migrated_template")
        _run(server_dsn, f'create database "{name}" template "{template}"')
    try:
        yield _on(server_dsn, name)
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
def clock(app: FastAPI, client: TestClient) -> list[float]:
    """The manager's monotonic clock, frozen; move it with ``clock[0] += seconds``."""
    now = [1000.0]
    app.state.rooms.clock = lambda: now[0]
    return now


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
def lobby(client: TestClient) -> dict[str, Any]:
    """A room of three questions with its admin and one joined player: ``code``,
    ``admin``, ``player``."""
    code, admin = create(client, modes=[{"mode": "more_less", "questions": 3}])
    player = join(client, code, "Zezima").json()
    return {"code": code, "admin": admin, "player": player}


def stub_mode(
    app: FastAPI,
    name: str,
    type_id: str = "more_less",
    questions: list[dict[str, Any]] | None = None,
) -> Iterator[str]:
    """Register mode ``name`` over the ``type_id`` type, with a pack of its own.

    The pack is ``questions``, or else ones copied from the shipped packs, relabelled with
    the mode either way.
    """
    shipped = [q for pack in app.state.packs for q in pack.questions]
    borrowed = questions or [q for q in shipped if q["type"] == type_id][:20]
    assert borrowed, "the shipped packs are the questions this stub copies"
    MODES[name] = Mode(id=name, types=frozenset({type_id}))
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
        app.state.packs.remove(next(p for p in app.state.packs if p.name == name))


@pytest.fixture
def second_mode(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A second playable mode, so a room can be more than one round.

    A mode is a round, and one registered mode would make every room a single round --
    which is exactly what the rounds this feature is about would then never exercise. The
    stub is a second mode over the ``more_less`` type, so a two-mode room plays the way a
    two-mode room will when the second real mode lands -- and its two rounds share an
    answer shape, which is the case a mode exists for.

    Takes ``client`` because the packs are loaded in the app's lifespan, which is what
    entering the test client runs.
    """
    yield from stub_mode(app, "second_round")


@pytest.fixture
def table(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> Iterator[Callable[..., Game]]:
    """``table("Zezima", "Woox", seconds=10)`` -> a lobby with everyone connected.

    Seat 0 is always the admin. Sockets close when the test ends, before the app does.
    """
    # These tests play whole games in a second or two, far faster than anyone taps; the
    # per-socket rate limit is tested on its own in ``test_limits.py``.
    monkeypatch.setattr(ws_handler, "RATE_BURST", 10_000)
    with ExitStack() as stack:
        yield lambda *names, **settings: seat_table(app, client, stack, *names, **settings)


@pytest.fixture
def faults(app: FastAPI, client: TestClient) -> Faults:
    """The manager's database, with statements a test picks failing or stalling."""
    return Faults(app.state.rooms)
