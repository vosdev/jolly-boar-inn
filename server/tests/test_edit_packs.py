"""``scripts/edit_packs.py``: an export of ``/admin``'s question changes, applied to the packs."""

import json
import shutil
import sys
from pathlib import Path
from typing import Any

import pytest

from app import question_edits
from app.config import REPO_ROOT
from app.questions import schema

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import edit_packs  # noqa: E402


@pytest.fixture
def repo(tmp_path: Path) -> dict[str, Path]:
    """A copy of the shipped packs and roster."""
    packs = tmp_path / "packs"
    shutil.copytree(REPO_ROOT / "data" / "packs", packs)
    roster = tmp_path / "popular-items.json"
    shutil.copy(REPO_ROOT / "data" / "popular-items.json", roster)
    return {"packs": packs, "roster": roster, "dir": tmp_path}


def run(repo: dict[str, Path], export: dict[str, Any]) -> int:
    file = repo["dir"] / "export.json"
    file.write_text(json.dumps(export))
    args = [str(file), "--packs-dir", str(repo["packs"]), "--roster", str(repo["roster"])]
    return edit_packs.main(args)


def pack(repo: dict[str, Path], name: str) -> list[dict[str, Any]]:
    return json.loads((repo["packs"] / name).read_text())["questions"]


def snapshot(repo: dict[str, Path]) -> dict[str, str]:
    return {str(path): path.read_text() for path in sorted(repo["packs"].rglob("*.json"))}


def reworded(question: dict[str, Any], **payload: Any) -> dict[str, Any]:
    return {**question, "payload": {**question["payload"], **payload}}


def test_an_edit_replaces_its_question_in_place_with_a_new_id(repo: dict[str, Path]) -> None:
    before = pack(repo, "odd_one_out.json")
    target = before[2]
    edit = {"id": target["id"], "question": reworded(target, explanation="Better.")}
    assert run(repo, {"edits": [edit]}) == 0
    after = pack(repo, "odd_one_out.json")
    assert after[:2] == before[:2] and after[3:] == before[3:]
    assert after[2]["payload"]["explanation"] == "Better."
    assert after[2]["id"] == schema.content_id(after[2]) != target["id"]
    assert list(after[2]) == list(target)


def test_an_edit_keeps_the_files_key_order_at_every_depth(repo: dict[str, Path]) -> None:
    target = pack(repo, "sort_it_out.json")[0]
    question = json.loads(json.dumps(target, sort_keys=True))
    question["payload"]["prompt"] = "Reworded: " + target["payload"]["prompt"]
    assert run(repo, {"edits": [{"id": target["id"], "question": question}]}) == 0
    [written] = [
        q for q in pack(repo, "sort_it_out.json") if q["payload"]["prompt"].startswith("Reworded")
    ]
    assert list(written) == list(target)
    assert list(written["payload"]) == list(target["payload"])
    assert [list(entry) for entry in written["payload"]["entries"]] == [
        list(entry) for entry in target["payload"]["entries"]
    ]


def test_a_delete_removes_its_question(repo: dict[str, Path]) -> None:
    before = pack(repo, "drop_table.json")
    assert run(repo, {"deletes": [before[0]["id"]]}) == 0
    assert pack(repo, "drop_table.json") == before[1:]


def test_the_servers_export_applies_to_an_npcs_file(repo: dict[str, Path]) -> None:
    target = pack(repo, "random_events/bob.json")[0]
    played = {**target, "random_event": "bob"}
    after = reworded(played, prompt="A reworded question?")
    after["id"] = schema.content_id(after)
    rows = [{"question_id": target["id"], "action": "edit", "question": after}]
    assert run(repo, question_edits.export_file(rows)) == 0
    [written] = [q for q in pack(repo, "random_events/bob.json") if q["id"] == after["id"]]
    assert written["payload"]["prompt"] == "A reworded question?" and "random_event" not in written


def test_an_edit_may_drop_an_optional_field(repo: dict[str, Path]) -> None:
    target = next(q for q in pack(repo, "drop_table.json") if "wiki" in q)
    question = {k: v for k, v in target.items() if k != "wiki"}
    assert run(repo, {"edits": [{"id": target["id"], "question": question}]}) == 0
    # The wiki is outside the content id, so the question keeps its id.
    [written] = [q for q in pack(repo, "drop_table.json") if q["id"] == target["id"]]
    assert "wiki" not in written


@pytest.mark.parametrize(
    "change",
    [
        lambda q: {"edits": [{"id": q["id"], "question": reworded(q, options=["One"])}]},
        lambda q: {"edits": [{"id": q["id"], "question": {**q, "mode": "drop_table"}}]},
        lambda q: {"edits": [{"id": q["id"], "question": {**q, "random_event": "bob"}}]},
        lambda q: {"deletes": [q["id"], q["id"]]},
        lambda q: {"edits": [{"id": q["id"]}]},
    ],
)
def test_one_refused_change_writes_nothing(
    repo: dict[str, Path], change: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    target = pack(repo, "odd_one_out.json")[0]
    fine = pack(repo, "drop_table.json")[0]["id"]
    export = change(target)
    export["deletes"] = [fine, *export.get("deletes", [])]
    before = snapshot(repo)
    assert run(repo, export) == 1
    assert snapshot(repo) == before
    assert "nothing written" in capsys.readouterr().err


def test_a_change_to_an_id_no_longer_in_the_packs_is_refused_by_name(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    target = pack(repo, "odd_one_out.json")[0]
    gone = "q_0123456789abcdef"
    before = snapshot(repo)
    assert run(repo, {"edits": [{"id": gone, "question": target}], "deletes": [gone]}) == 1
    assert snapshot(repo) == before
    err = capsys.readouterr().err
    assert f"edits[0]: '{gone}' is not in the packs" in err
    assert f"deletes[0]: '{gone}' is not in the packs" in err


def test_a_change_to_a_generated_pack_writes_nothing_and_names_the_pack(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    first, second = pack(repo, "prices.json")[:2]
    edit = {"id": first["id"], "question": reworded(first, explanation="Better.")}
    before = snapshot(repo)
    assert run(repo, {"edits": [edit], "deletes": [second["id"]]}) == 1
    assert snapshot(repo) == before
    err = capsys.readouterr().err
    assert f"edits[0]: {first['id']} is in prices.json, which" in err
    assert f"deletes[0]: {second['id']} is in prices.json, which" in err


def test_packs_that_would_not_load_write_nothing(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    first, second = pack(repo, "odd_one_out.json")[:2]
    before = snapshot(repo)
    assert run(repo, {"edits": [{"id": second["id"], "question": first}]}) == 1
    assert snapshot(repo) == before
    assert "would not load" in capsys.readouterr().err


def test_a_file_that_is_not_an_export_writes_nothing(repo: dict[str, Path]) -> None:
    before = snapshot(repo)
    assert run(repo, {"questions": []}) == 1
    assert snapshot(repo) == before
