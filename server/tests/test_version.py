"""Versioning: `/VERSION` is the app's version, and the two manifests agree with it.

The rule is in ideas/architecture.md, Versioning: a T or D task bumps the minor number, a
fix the patch. The top bar and the image label read `/VERSION` directly; `pyproject.toml`
and `client/package.json` carry copies because their tools want one, and a copy nobody
checks is a copy that drifts. Bump all three, or this fails.
"""

import json
import re
import tomllib

from app.config import REPO_ROOT

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
