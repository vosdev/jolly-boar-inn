"""``scripts/rehash_questions.py``: mismatched pack ids rewritten in place."""

import json
import shutil
import sys
from pathlib import Path

import pytest

from app.config import REPO_ROOT
from app.questions import schema

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import rehash_questions  # noqa: E402


@pytest.fixture
def repo(tmp_path: Path) -> dict[str, Path]:
    """A copy of the shipped packs and roster."""
    packs = tmp_path / "packs"
    shutil.copytree(REPO_ROOT / "data" / "packs", packs)
    roster = tmp_path / "popular-items.json"
    shutil.copy(REPO_ROOT / "data" / "popular-items.json", roster)
    return {"packs": packs, "roster": roster}


def run(repo: dict[str, Path]) -> int:
    args = ["--packs-dir", str(repo["packs"]), "--roster", str(repo["roster"])]
    return rehash_questions.main(args)


def snapshot(repo: dict[str, Path]) -> dict[str, bytes]:
    return {str(path): path.read_bytes() for path in sorted(repo["packs"].rglob("*.json"))}


def test_a_changed_question_gets_its_new_id_and_nothing_else_moves(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    path = repo["packs"] / "odd_one_out.json"
    question = json.loads(path.read_text())["questions"][1]
    old = question["payload"]["explanation"]
    edited = path.read_text().replace(json.dumps(old), json.dumps(old + " Reworded."), 1)
    path.write_text(edited)
    before = snapshot(repo)
    new = schema.content_id(json.loads(edited)["questions"][1])

    assert run(repo) == 0
    after = snapshot(repo)
    assert after.pop(str(path)) == edited.replace(question["id"], new).encode()
    del before[str(path)]
    assert after == before
    assert f"odd_one_out.json: {question['id']} -> {new}" in capsys.readouterr().out


def test_a_question_in_an_npcs_file_is_rehashed_too(repo: dict[str, Path]) -> None:
    path = next((repo["packs"] / "random_events").glob("*.json"))
    question = json.loads(path.read_text())["questions"][0]
    path.write_text(path.read_text().replace(question["id"], "q_0000000000000000", 1))
    assert run(repo) == 0
    assert json.loads(path.read_text())["questions"][0]["id"] == question["id"]


def test_running_it_twice_changes_nothing_the_second_time(repo: dict[str, Path]) -> None:
    path = repo["packs"] / "drop_table.json"
    question = json.loads(path.read_text())["questions"][0]
    path.write_text(path.read_text().replace(question["id"], "q_0000000000000000", 1))
    assert run(repo) == 0
    once = snapshot(repo)
    assert run(repo) == 0
    assert snapshot(repo) == once


def test_shipped_packs_are_left_alone(repo: dict[str, Path]) -> None:
    before = snapshot(repo)
    assert run(repo) == 0
    assert snapshot(repo) == before


def test_packs_with_another_problem_write_nothing_and_name_it(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    stale = repo["packs"] / "odd_one_out.json"
    question = json.loads(stale.read_text())["questions"][0]
    stale.write_text(stale.read_text().replace(question["id"], "q_0000000000000000", 1))
    broken = repo["packs"] / "drop_table.json"
    data = json.loads(broken.read_text())
    data["questions"][0]["mode"] = "no_such_mode"
    broken.write_text(json.dumps(data, indent=2) + "\n")
    before = snapshot(repo)

    assert run(repo) == 1
    assert snapshot(repo) == before
    err = capsys.readouterr().err
    assert "no_such_mode" in err
    assert "nothing written" in err


def test_a_file_that_is_not_json_writes_nothing(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    stale = repo["packs"] / "odd_one_out.json"
    question = json.loads(stale.read_text())["questions"][0]
    stale.write_text(stale.read_text().replace(question["id"], "q_0000000000000000", 1))
    (repo["packs"] / "drop_table.json").write_text("{ not json")
    before = snapshot(repo)
    assert run(repo) == 1
    assert snapshot(repo) == before
    assert "drop_table.json" in capsys.readouterr().err
