"""The data scripts run in the ``data`` container, so a host needs only git, docker and make.

A server has no uv, and the runtime image must not get it, so these targets go through
``docker-compose.data.yml`` and the Dockerfile's ``data`` stage, which the runtime never uses.
"""

import re

from app.config import REPO_ROOT

DATA_TARGETS = ("fetch-assets", "gen-price-questions", "gen-examine-questions")


def _recipe(makefile: str, target: str) -> list[str]:
    """The recipe lines of ``target``."""
    lines = makefile.splitlines()
    start = lines.index(f"{target}:") + 1
    recipe = []
    for line in lines[start:]:
        if not line.startswith("\t"):
            break
        recipe.append(line.strip())
    return recipe


def test_the_data_targets_run_in_the_data_container() -> None:
    makefile = (REPO_ROOT / "Makefile").read_text(encoding="utf-8")
    data = next(ln for ln in makefile.splitlines() if ln.startswith("DATA :="))
    assert "docker compose -f docker-compose.data.yml run --rm --build data python" in data
    for target in DATA_TARGETS:
        recipe = _recipe(makefile, target)
        assert recipe and all(ln.startswith("$(DATA) scripts/") for ln in recipe), target
        assert not any("uv" in ln.split() for ln in recipe), target


def test_the_compose_service_builds_the_data_stage() -> None:
    compose = (REPO_ROOT / "docker-compose.data.yml").read_text(encoding="utf-8")
    assert re.search(r"^\s+target: data$", compose, re.MULTILINE)
    assert re.search(r"^\s+- \.:/repo$", compose, re.MULTILINE)


def test_the_runtime_never_carries_the_data_stage() -> None:
    """A plain ``docker build`` builds the last stage, and the runtime copies nothing from data."""
    dockerfile = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8")
    stages = re.findall(r"^FROM \S+ AS (\w+)$", dockerfile, re.MULTILINE)
    assert "data" in stages
    assert stages[-1] == "runtime"
    runtime = dockerfile.split(" AS runtime\n", 1)[1]
    assert "--from=data" not in runtime
