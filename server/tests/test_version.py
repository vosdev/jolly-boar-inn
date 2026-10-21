"""Versioning: `/VERSION` is the app's version, and the two manifests agree with it.

The rule is in ideas/architecture.md, Versioning: a T or D task bumps the minor number, a
fix the patch. The top bar and the image label read `/VERSION` directly; `pyproject.toml`
and `client/package.json` carry copies because their tools want one, and a copy nobody
checks is a copy that drifts. Bump all three, or this fails.
"""

import json
import re
import subprocess
import tomllib

from app.config import APP_VERSION, REPO_ROOT

VERSION = (REPO_ROOT / "VERSION").read_text(encoding="utf-8").strip()


def test_version_is_plain_semver() -> None:
    """No `v` prefix, no suffix: CI makes the tag `v<VERSION>` and compares with sort -V."""
    assert re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", VERSION), VERSION


def test_the_server_manifest_matches() -> None:
    with (REPO_ROOT / "server" / "pyproject.toml").open("rb") as f:
        assert tomllib.load(f)["project"]["version"] == VERSION


def test_the_client_manifest_matches() -> None:
    package = json.loads((REPO_ROOT / "client" / "package.json").read_text(encoding="utf-8"))
    assert package["version"] == VERSION


def test_the_server_reads_the_version_it_sends() -> None:
    """``welcome`` carries it, and a client built from another version reloads on it."""
    assert APP_VERSION == VERSION


def test_the_runtime_image_carries_the_version() -> None:
    """The server reads ``/VERSION`` at startup; only the client stage copied it before."""
    dockerfile = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8")
    runtime = dockerfile[dockerfile.index("AS runtime") :]
    assert "COPY VERSION /app/VERSION" in runtime


def test_the_changelog_lists_every_version_main_has_held() -> None:
    """A stack of PRs merges several bumps at once, and each still needs a What's new entry."""
    git = ["git", "-C", str(REPO_ROOT)]
    shallow = subprocess.run(
        [*git, "rev-parse", "--is-shallow-repository"], capture_output=True, text=True, check=True
    )
    assert shallow.stdout.strip() == "false", "a shallow clone hides VERSION's history"
    log = subprocess.run(
        [*git, "log", "-p", "-m", "--format=", "--", "VERSION"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    held = set(re.findall(r"^\+(\d+\.\d+\.\d+)$", log, re.MULTILINE))
    changelog = (REPO_ROOT / "client" / "src" / "lib" / "changelog.ts").read_text(encoding="utf-8")
    listed = set(re.findall(r"version: '(\d+\.\d+\.\d+)'", changelog))
    missing = sorted(held - listed, key=lambda v: tuple(map(int, v.split("."))))
    assert missing == []
