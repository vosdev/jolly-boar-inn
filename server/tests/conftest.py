import asyncio
import secrets
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.config import REPO_ROOT, Settings


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
