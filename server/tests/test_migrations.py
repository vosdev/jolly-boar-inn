"""T3 Accept: fresh DB gets all tables; second start is a no-op; migrations are applied
against a throwaway database (the ``test_db_dsn`` fixture, driven by ``DATABASE_URL_TEST``).
"""

import asyncio
from pathlib import Path

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import MIGRATIONS_DIR, MigrationError, create_pool, migration_files, run_migrations
from app.main import create_app

# Section 5 of ideas/architecture.md.
TABLES = {
    "schema_migrations": {"version", "applied_at"},
    "rooms": {
        "id",
        "code",
        "status",
        "settings",
        "current_index",
        "creator_ip",
        "created_at",
        "expires_at",
    },
    "players": {
        "id",
        "room_id",
        "display_name",
        "session_token_hash",
        "role",
        "joined_at",
        "last_seen_at",
    },
    "questions": {
        "id",
        "room_id",
        "position",
        "question_id",
        "type",
        "source",
        "payload",
        "host_only",
        "author_player_id",
        "shown_at",
        "closed_at",
        "voided",
    },
    "answers": {"id", "question_id", "player_id", "value", "received_at", "correct", "points"},
}
INDEXES = {
    "rooms_code_idx",
    "rooms_expires_at_idx",
    "players_session_idx",
    "players_room_name_idx",
    "answers_player_idx",
}


async def _columns(pool: asyncpg.Pool) -> dict[str, set[str]]:
    rows = await pool.fetch(
        "select table_name, column_name from information_schema.columns"
        " where table_schema = 'public'"
    )
    out: dict[str, set[str]] = {}
    for row in rows:
        out.setdefault(row["table_name"], set()).add(row["column_name"])
    return out


async def _versions(pool: asyncpg.Pool) -> list[int]:
    rows = await pool.fetch("select version from schema_migrations order by version")
    return [row["version"] for row in rows]


@pytest.fixture
async def pool(test_db_dsn: str):
    pool = await create_pool(test_db_dsn)
    try:
        yield pool
    finally:
        await pool.close()


def test_migration_files_are_numbered_and_ordered() -> None:
    files = migration_files(MIGRATIONS_DIR)
    assert [version for version, _ in files] == [1, 2]
    assert [path.name for _, path in files] == [
        "0001_init.sql",
        "0002_drop_admin_tokens.sql",
    ]


async def test_fresh_db_gets_all_tables(pool: asyncpg.Pool) -> None:
    """T3: fresh DB gets all tables (and indexes) from section 5."""
    assert await run_migrations(pool) == [1, 2]
    assert await _columns(pool) == TABLES
    rows = await pool.fetch("select indexname from pg_indexes where schemaname = 'public'")
    assert INDEXES <= {row["indexname"] for row in rows}
    assert await _versions(pool) == [1, 2]


async def test_section_5_constraints_hold(pool: asyncpg.Pool) -> None:
    """T3: the schema is section 5, not just tables with those names."""
    await run_migrations(pool)
    with pytest.raises(asyncpg.CheckViolationError):
        await pool.execute(
            "insert into rooms (code, status, settings, expires_at)"
            " values ('ABYSSAL', 'bogus', '{}', now())"
        )
    with pytest.raises(asyncpg.CheckViolationError):  # 0002: no unclaimed rooms any more
        await pool.execute(
            "insert into rooms (code, status, settings, expires_at)"
            " values ('ABYSSAL', 'created', '{}', now())"
        )
    # And exactly one check on the table, so 0002 replaced the old constraint rather
    # than adding a second one beside it under a name that did not match.
    checks = await pool.fetchval(
        "select count(*) from pg_constraint where conrelid = 'rooms'::regclass and contype = 'c'"
    )
    assert checks == 1
    await pool.execute(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('ABYSSAL', 'lobby', '{}', now())"
    )
    with pytest.raises(asyncpg.UniqueViolationError):
        await pool.execute(
            "insert into rooms (code, status, settings, expires_at)"
            " values ('ABYSSAL', 'lobby', '{}', now())"
        )
    room_id = await pool.fetchval("select id from rooms")
    await pool.execute(
        "insert into players (room_id, display_name, session_token_hash)"
        " values ($1, 'Zezima', 'h1')",
        room_id,
    )
    with pytest.raises(asyncpg.UniqueViolationError):  # case-insensitive unique name per room
        await pool.execute(
            "insert into players (room_id, display_name, session_token_hash)"
            " values ($1, 'zezima', 'h2')",
            room_id,
        )
    await pool.execute("delete from rooms")
    assert await pool.fetchval("select count(*) from players") == 0  # cascade


async def test_second_start_is_noop(pool: asyncpg.Pool) -> None:
    """T3: second start is a no-op."""
    assert await run_migrations(pool) == [1, 2]
    before = await pool.fetch("select version, applied_at from schema_migrations")
    assert await run_migrations(pool) == []
    after = await pool.fetch("select version, applied_at from schema_migrations")
    assert [tuple(r) for r in after] == [tuple(r) for r in before]
    assert await _columns(pool) == TABLES


async def test_recorded_migration_missing_from_disk_refuses(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """db.py contract: refuse to start if a recorded migration file is missing."""
    await run_migrations(pool)
    with pytest.raises(MigrationError, match=r"\[1, 2\]"):
        await run_migrations(pool, tmp_path)


async def test_lexical_order_and_one_transaction_per_file(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """db.py contract: lexical order, each file in one transaction, failures stop the run."""
    (tmp_path / "0002_b.sql").write_text("create table b (a_id int references a (id));")
    (tmp_path / "0001_a.sql").write_text("create table a (id int primary key);")
    (tmp_path / "0003_bad.sql").write_text("create table c (id int); insert into c values ('x');")
    with pytest.raises(MigrationError, match="0003_bad.sql"):
        await run_migrations(pool, tmp_path)
    assert set(await _columns(pool)) == {"schema_migrations", "a", "b"}
    assert await _versions(pool) == [1, 2]


def test_lifespan_runs_migrations(test_db_dsn: str, dist: Path) -> None:
    """T3: run at startup in lifespan."""
    settings = Settings(_env_file=None, database_url=test_db_dsn)
    with TestClient(create_app(settings, dist)) as client:
        assert client.get("/api/health").json() == {"ok": True, "db": True}

    async def columns() -> dict[str, set[str]]:
        pool = await create_pool(test_db_dsn)
        try:
            return await _columns(pool)
        finally:
            await pool.close()

    assert asyncio.run(columns()) == TABLES
