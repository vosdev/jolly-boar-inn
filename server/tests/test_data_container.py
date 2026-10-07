"""The data scripts run in the ``data`` container, so a host needs only git, docker and make.

A server has no uv, and the runtime image must not get it, so these targets go through
``docker-compose.data.yml`` and the Dockerfile's ``data`` stage, which the runtime never uses.
``make logo`` alone gets the ``logo`` stage on top, so OpenCV and NumPy stay out of the rest.
"""

import os
import re
import subprocess

from app.config import REPO_ROOT

DATA_TARGETS = ("fetch-assets", "gen-price-questions")
FETCH_ASSETS_VARIABLES = ("FORCE", "DRY_RUN", "ONLY", "FROM_DIR")


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


def test_make_logo_runs_in_the_logo_container() -> None:
    makefile = (REPO_ROOT / "Makefile").read_text(encoding="utf-8")
    assert _recipe(makefile, "logo") == ["$(LOGO) scripts/build_logo.py"]
    done = subprocess.run(
        ["make", "-s", "-n", "-C", str(REPO_ROOT), "logo"],
        capture_output=True,
        text=True,
        check=True,
    )
    assert done.stdout.strip().endswith(
        "docker compose -f docker-compose.data.yml run --rm --build logo python"
        " scripts/build_logo.py"
    )


def _fetch_assets_command(*assignments: str) -> str:
    """What ``make fetch-assets`` would run, with nothing set but ``assignments``."""
    env = {k: v for k, v in os.environ.items() if k not in FETCH_ASSETS_VARIABLES}
    done = subprocess.run(
        ["make", "-s", "-n", "-C", str(REPO_ROOT), "fetch-assets", *assignments],
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    return done.stdout.strip()


def test_fetch_assets_takes_its_flags_as_variables() -> None:
    """``make fetch-assets --force`` is make's own flag, so each script flag is a variable."""
    command = _fetch_assets_command("FORCE=1", "DRY_RUN=1", "ONLY=npcs trophies", "FROM_DIR=saved")
    assert command.endswith(
        "scripts/fetch_assets.py --force --dry-run --only npcs --only trophies --from-dir saved"
    )


def test_fetch_assets_without_variables_passes_no_flags() -> None:
    assert _fetch_assets_command().endswith("scripts/fetch_assets.py")
    assert _fetch_assets_command("FORCE=0", "DRY_RUN=0").endswith("scripts/fetch_assets.py")


def _services(compose: str) -> dict[str, str]:
    """Each service's block in ``compose``, by name."""
    parts = re.split(r"^  (\w[\w-]*):\n", compose.split("\nservices:\n", 1)[1], flags=re.M)
    return dict(zip(parts[1::2], parts[2::2], strict=True))


def test_the_compose_services_build_their_stages() -> None:
    compose = (REPO_ROOT / "docker-compose.data.yml").read_text(encoding="utf-8")
    services = _services(compose)
    for name in ("data", "logo"):
        assert re.search(rf"^\s+target: {name}$", services[name], re.MULTILINE), name
        assert re.search(r"^\s+- \.:/repo$", services[name], re.MULTILINE), name


def _stages(dockerfile: str) -> dict[str, str]:
    """Each stage's text in ``dockerfile`` from its ``FROM`` line, by name."""
    parts = re.split(r"^(FROM \S+ AS \w+)$", dockerfile, flags=re.MULTILINE)
    return {
        header.rsplit(" ", 1)[1]: header + body
        for header, body in zip(parts[1::2], parts[2::2], strict=True)
    }


def test_only_the_logo_stage_has_the_logo_group() -> None:
    """The data image, which CI builds, stays without OpenCV and NumPy."""
    stages = _stages((REPO_ROOT / "Dockerfile").read_text(encoding="utf-8"))
    assert "COPY --from=builder /app/server/.venv /app/server/.venv" in stages["data"]
    assert stages["logo"].startswith("FROM data AS logo\n")
    with_group = [name for name, text in stages.items() if "--group logo" in text]
    assert with_group == ["logo"]


def test_the_runtime_never_carries_the_data_stages() -> None:
    """A plain ``docker build`` builds the last stage, and the runtime copies from neither."""
    stages = _stages((REPO_ROOT / "Dockerfile").read_text(encoding="utf-8"))
    assert {"data", "logo"} <= stages.keys()
    assert list(stages)[-1] == "runtime"
    assert "--from=data" not in stages["runtime"]
    assert "--from=logo" not in stages["runtime"]
