"""A run that must include the database tests fails without a database, not skips them.

``make test`` passes ``--require-db`` and CI sets ``CI``; a run of either that quietly
skipped every database test would pass having tested little of the game.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

SERVER = Path(__file__).resolve().parents[1]
A_DATABASE_TEST = "tests/test_migrations.py::test_fresh_db_gets_all_tables"


def without_a_database(*args: str, ci: str | None = None) -> subprocess.CompletedProcess[str]:
    """Run one database test with no database, and ``CI`` set to ``ci`` or unset."""
    # Set but empty, so a ``.env`` that names a database cannot supply one either.
    env = {k: v for k, v in os.environ.items() if k != "CI"} | {"DATABASE_URL_TEST": ""}
    if ci is not None:
        env["CI"] = ci
    return subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", A_DATABASE_TEST, *args],
        cwd=SERVER,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


@pytest.mark.parametrize(
    ("args", "ci"), [(("--require-db",), None), ((), "true")], ids=["--require-db", "CI"]
)
def test_a_run_that_requires_the_database_fails_without_one(
    args: tuple[str, ...], ci: str | None
) -> None:
    run = without_a_database(*args, ci=ci)
    assert run.returncode == 1, run.stdout
    assert "this run requires the database tests" in run.stdout


def test_any_other_run_skips_the_database_tests() -> None:
    run = without_a_database(ci="false")
    assert run.returncode == 0, run.stdout
    assert "1 skipped" in run.stdout
