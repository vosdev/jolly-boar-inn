"""``scripts/check_workflows.py``: a workflow GitHub would drop fails ``make lint``."""

import sys
from pathlib import Path

from app.config import REPO_ROOT

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import check_workflows  # noqa: E402


def test_the_repos_workflows_pass() -> None:
    assert check_workflows.main() == 0


def test_a_colon_in_a_plain_run_line_fails(tmp_path: Path) -> None:
    (tmp_path / "ci.yml").write_text(
        "jobs:\n  map:\n    steps:\n"
        '      - run: echo "$(sed -n \'s/.*"cache_id": *\\([0-9]*\\).*/\\1/p\' x)"\n',
        encoding="utf-8",
    )
    assert check_workflows.main(tmp_path) == 1


def test_a_workflow_without_jobs_fails(tmp_path: Path) -> None:
    (tmp_path / "ci.yml").write_text("name: CI\non: push\n", encoding="utf-8")
    assert check_workflows.problems(tmp_path / "ci.yml") == ["ci.yml: no jobs mapping"]


def test_a_job_without_steps_fails(tmp_path: Path) -> None:
    (tmp_path / "ci.yml").write_text("jobs:\n  map:\n    runs-on: x\n", encoding="utf-8")
    assert check_workflows.problems(tmp_path / "ci.yml") == [
        "ci.yml: job map has neither steps nor uses"
    ]
