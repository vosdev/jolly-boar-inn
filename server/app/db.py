"""asyncpg pool and the migration runner.

Migrations are ``NNNN_<name>.sql`` files in ``app/migrations/``. The runner records each
applied version in ``schema_migrations`` and applies the rest in lexical order, one
transaction per file. A version recorded in the database whose file is gone means the
code and the database disagree, and the runner refuses to continue.
"""

import json
import logging
import re
from pathlib import Path

import asyncpg

log = logging.getLogger("app.db")

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
_FILENAME = re.compile(r"^(\d{4})_[a-z0-9_]+\.sql$")


class MigrationError(RuntimeError):
    """The migrations on disk cannot be applied or do not match the database."""


async def _init_connection(conn: asyncpg.Connection) -> None:
    """``jsonb`` columns read and write as Python values."""
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog", format="text"
    )


async def create_pool(dsn: str) -> asyncpg.Pool:
    pool = await asyncpg.create_pool(
        dsn, min_size=1, max_size=10, command_timeout=30, init=_init_connection
    )
    assert pool is not None
    return pool


def migration_files(directory: Path = MIGRATIONS_DIR) -> list[tuple[int, Path]]:
    """Every ``NNNN_*.sql`` in ``directory`` as ``(version, path)``, in lexical order."""
    files: list[tuple[int, Path]] = []
    for path in sorted(directory.glob("*.sql")):
        match = _FILENAME.match(path.name)
        if match is None:
            raise MigrationError(f"migration file name is not NNNN_name.sql: {path.name}")
        files.append((int(match.group(1)), path))
    versions = [version for version, _ in files]
    if len(set(versions)) != len(versions):
        raise MigrationError(f"duplicate migration version in {directory}")
    return files


async def run_migrations(pool: asyncpg.Pool, directory: Path = MIGRATIONS_DIR) -> list[int]:
    """Apply every migration not yet recorded. Returns the versions applied by this call."""
    files = migration_files(directory)
    async with pool.acquire() as conn:
        await conn.execute(
            "create table if not exists schema_migrations ("
            " version integer primary key,"
            " applied_at timestamptz not null default now())"
        )
        rows = await conn.fetch("select version from schema_migrations")
        applied = {row["version"] for row in rows}
        missing = applied - {version for version, _ in files}
        if missing:
            raise MigrationError(
                f"database recorded migration(s) {sorted(missing)} that are missing from"
                f" {directory}; refusing to start"
            )
        done: list[int] = []
        for version, path in files:
            if version in applied:
                continue
            try:
                async with conn.transaction():
                    await conn.execute(path.read_text(encoding="utf-8"))
                    await conn.execute(
                        "insert into schema_migrations (version) values ($1)", version
                    )
            except asyncpg.PostgresError as exc:
                raise MigrationError(f"migration {path.name} failed: {exc}") from exc
            log.info("applied migration %s", path.name)
            done.append(version)
    return done
