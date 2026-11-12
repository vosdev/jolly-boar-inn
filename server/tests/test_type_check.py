"""mypy holds ``RoomManager``'s mixins to what ``RoomHost`` declares, in ``make lint`` and CI."""

import tomllib
from pathlib import Path

import yaml
from mypy import api

from app.config import REPO_ROOT

SERVER = REPO_ROOT / "server"

PROBE = """\
from app.rooms.joins import Joins
from app.rooms.models import Room


class Probe(Joins):
    def known(self, room: Room) -> None:
        self._broadcast(self._room_updated(room))

    def unknown(self, room: Room) -> None:
        self._broadcast_everything(room)
"""


def test_a_mixin_calling_a_helper_room_manager_lacks_fails(tmp_path: Path) -> None:
    probe = tmp_path / "probe.py"
    probe.write_text(PROBE, encoding="utf-8")
    out, _, status = api.run(
        [
            "--config-file",
            str(SERVER / "pyproject.toml"),
            "--cache-dir",
            str(tmp_path / "cache"),
            str(probe),
        ]
    )
    errors = [line for line in out.splitlines() if ": error:" in line]
    assert status == 1
    assert len(errors) == 1
    assert 'probe.py:10: error: "Probe" has no attribute "_broadcast_everything"' in errors[0]


def test_lint_and_ci_check_every_room_module() -> None:
    config = tomllib.loads((SERVER / "pyproject.toml").read_text(encoding="utf-8"))
    assert config["tool"]["mypy"]["files"] == ["app"]
    makefile = (REPO_ROOT / "Makefile").read_text(encoding="utf-8")
    lint = makefile.split("\nlint:\n", 1)[1].split("\n\n", 1)[0]
    assert "uv run mypy" in lint
    ci = yaml.safe_load((REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text("utf-8"))
    assert {"run": "uv run mypy"} in ci["jobs"]["server"]["steps"]
