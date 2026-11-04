"""``make lint`` check: every GitHub Actions workflow parses and names its jobs.

GitHub drops a workflow file it cannot parse without a run or a check on the pull request, so
a broken one looks like CI that never started. This catches that before the push.

Usage: ``uv run python scripts/check_workflows.py``.
"""

import sys
from pathlib import Path

import yaml

WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"


def problems(path: Path) -> list[str]:
    """What keeps GitHub from running the workflow at ``path``; empty when it can run."""
    try:
        workflow = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        return [f"{path.name}: {exc}".replace("\n", " ")]
    if not isinstance(workflow, dict) or not isinstance(workflow.get("jobs"), dict):
        return [f"{path.name}: no jobs mapping"]
    return [
        f"{path.name}: job {name} has neither steps nor uses"
        for name, job in workflow["jobs"].items()
        if not isinstance(job, dict) or not ("steps" in job or "uses" in job)
    ]


def main(folder: Path = WORKFLOWS) -> int:
    """Print every problem in ``folder``'s workflows; 1 when there is any."""
    found = [p for path in sorted(folder.glob("*.y*ml")) for p in problems(path)]
    for problem in found:
        print(problem, file=sys.stderr)
    return 1 if found else 0


if __name__ == "__main__":
    raise SystemExit(main())
