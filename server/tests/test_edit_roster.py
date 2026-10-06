"""``scripts/edit_roster.py``: an export of ``/admin``'s item changes, applied to the roster."""

import json
import shutil
import sys
from pathlib import Path
from typing import Any

import pytest

from app.config import REPO_ROOT

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import edit_roster  # noqa: E402


@pytest.fixture
def repo(tmp_path: Path) -> dict[str, Path]:
    """A copy of the shipped packs and roster."""
    packs = tmp_path / "packs"
    shutil.copytree(REPO_ROOT / "data" / "packs", packs)
    roster = tmp_path / "popular-items.json"
    shutil.copy(REPO_ROOT / "data" / "popular-items.json", roster)
    return {"packs": packs, "roster": roster, "dir": tmp_path}


def run(repo: dict[str, Path], export: Any) -> int:
    file = repo["dir"] / "export.json"
    file.write_text(json.dumps(export))
    args = [str(file), "--packs-dir", str(repo["packs"]), "--roster", str(repo["roster"])]
    return edit_roster.main(args)


def items(repo: dict[str, Path]) -> list[dict[str, Any]]:
    return json.loads(repo["roster"].read_text())["items"]


def test_a_rename_and_a_removal_rewrite_the_roster_in_place(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    before = items(repo)
    first, second, third = before[:3]
    text = repo["roster"].read_text()
    assert (
        run(
            repo,
            {"renames": [{"id": second["id"], "name": " Renamed item "}], "removes": [third["id"]]},
        )
        == 0
    )
    assert items(repo) == [first, {"id": second["id"], "name": "Renamed item"}, *before[3:]]
    # Everything else in the file stays as it was, so git shows only the lines that changed.
    assert repo["roster"].read_text().splitlines()[:2] == text.splitlines()[:2]
    assert "make gen-price-questions" in capsys.readouterr().out


def test_an_empty_export_changes_nothing(repo: dict[str, Path]) -> None:
    text = repo["roster"].read_text()
    assert run(repo, {"renames": [], "removes": []}) == 0
    assert repo["roster"].read_text() == text


def test_a_change_to_an_id_not_on_the_roster_is_refused_by_name(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    text = repo["roster"].read_text()
    assert run(repo, {"renames": [{"id": 999999, "name": "Ghost"}], "removes": [888888]}) == 1
    assert repo["roster"].read_text() == text
    err = capsys.readouterr().err
    assert "renames[0]: item 999999 is not on the roster" in err
    assert "removes[0]: item 888888 is not on the roster" in err


@pytest.mark.parametrize(
    "change",
    [
        lambda a, b: {"renames": [{"id": a["id"], "name": ""}]},
        lambda a, b: {"renames": [{"id": a["id"], "name": "x" * 81}]},
        lambda a, b: {"renames": [{"id": a["id"], "name": "Nul\x00"}]},
        lambda a, b: {"renames": [{"id": a["id"]}]},
        lambda a, b: {"renames": [{"id": a["id"], "name": "One"}], "removes": [a["id"]]},
        lambda a, b: {"removes": [a["id"], a["id"]]},
        # Two items a player could not tell apart would stop the roster loading.
        lambda a, b: {"renames": [{"id": a["id"], "name": b["name"].upper()}]},
        lambda a, b: {
            "renames": [{"id": a["id"], "name": "Same"}, {"id": b["id"], "name": "same"}]
        },
    ],
)
def test_one_refused_change_writes_nothing(repo: dict[str, Path], change: Any) -> None:
    a, b, c = items(repo)[:3]
    export = change(a, b)
    export["removes"] = [c["id"], *export.get("removes", [])]
    text = repo["roster"].read_text()
    assert run(repo, export) == 1
    assert repo["roster"].read_text() == text


def test_a_file_that_is_not_an_export_writes_nothing(repo: dict[str, Path]) -> None:
    text = repo["roster"].read_text()
    assert run(repo, {"items": []}) == 1
    assert run(repo, [1]) == 1
    assert repo["roster"].read_text() == text
