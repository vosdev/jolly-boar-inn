"""``scripts/import_suggestions.py``: an export from ``/admin`` into the packs and the roster."""

import json
import shutil
import sys
from pathlib import Path
from typing import Any

import pytest

from app.config import REPO_ROOT

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import import_suggestions  # noqa: E402

WIKI = "https://oldschool.runescape.wiki/w/Barrows_Brothers"
QUESTION = {
    "type": "multiple_choice",
    "payload": {
        "prompt": "Which of these is not a Barrows brother?",
        "options": ["Dharok", "Torag", "Hazelmere", "Karil"],
        "answer_index": 2,
    },
    "random_event": "bob",
    "mode": "random_event",
    "wiki": WIKI,
    "credit": "AFKFisher",
    "credit_shown": True,
}
NEW_EXAMINE = {
    "name": "Cabbage",
    "prompt": "Yuck, I don't like cabbage.",
    "wiki": "https://oldschool.runescape.wiki/w/Cabbage",
    "credit": "AFKFisher",
    "credit_shown": False,
}
MAPPING = [
    {"id": 1704, "name": "Amulet of glory"},
    {"id": 13576, "name": "Dragon warhammer"},
    {"id": 4151, "name": "Abyssal whip"},
]


@pytest.fixture
def repo(tmp_path: Path) -> dict[str, Path]:
    """A copy of the shipped packs and roster, and a saved /mapping."""
    packs = tmp_path / "packs"
    shutil.copytree(REPO_ROOT / "data" / "packs", packs)
    roster = tmp_path / "popular-items.json"
    shutil.copy(REPO_ROOT / "data" / "popular-items.json", roster)
    mapping = tmp_path / "mapping.json"
    mapping.write_text(json.dumps(MAPPING))
    return {"packs": packs, "roster": roster, "mapping": mapping, "dir": tmp_path}


def run(repo: dict[str, Path], export: dict[str, Any]) -> int:
    file = repo["dir"] / "export.json"
    file.write_text(json.dumps(export))
    args = [str(file), "--packs-dir", str(repo["packs"]), "--roster", str(repo["roster"])]
    return import_suggestions.main([*args, "--mapping-file", str(repo["mapping"])])


def loads(repo: dict[str, Path]) -> bool:
    """Whether the imported packs load, held to the lists they make themselves."""
    return import_suggestions.check_packs(repo["packs"], {}, repo["roster"].read_text()) == []


def snapshot(repo: dict[str, Path]) -> dict[str, str]:
    files = [*repo["packs"].rglob("*.json"), repo["roster"]]
    return {str(path): path.read_text() for path in sorted(files)}


def examines(repo: dict[str, Path]) -> list[dict[str, Any]]:
    return json.loads((repo["packs"] / "examine.json").read_text())["questions"]


def an_existing_examine(repo: dict[str, Path]) -> dict[str, Any]:
    first = examines(repo)[0]
    return {
        **NEW_EXAMINE,
        "name": first["payload"]["subject"]["name"].upper(),
        "prompt": "A second line about the same thing.",
    }


def test_an_npc_question_lands_in_its_file_with_its_credit(repo: dict[str, Path]) -> None:
    assert run(repo, {"questions": [QUESTION]}) == 0
    bob = json.loads((repo["packs"] / "random_events" / "bob.json").read_text())
    added = bob["questions"][-1]
    assert added["mode"] == "random_event" and "random_event" not in added
    assert (added["credit"], added["credit_shown"], added["wiki"]) == ("AFKFisher", True, WIKI)
    assert added["payload"] == QUESTION["payload"]
    assert loads(repo)


def test_an_examine_gets_the_highest_id_plus_one(repo: dict[str, Path]) -> None:
    highest = max(q["payload"]["answer_id"] for q in examines(repo))
    assert run(repo, {"examines": [NEW_EXAMINE, an_existing_examine(repo)]}) == 0
    *_, new, known = examines(repo)
    assert new["payload"]["answer_id"] == highest + 1
    assert new["payload"]["subject"] == {"name": "Cabbage"}
    assert new["credit"] == "AFKFisher" and "credit_shown" not in new
    assert known["payload"]["answer_id"] == examines(repo)[0]["payload"]["answer_id"]
    assert loads(repo)


def test_an_item_takes_its_id_from_mapping_in_name_order(repo: dict[str, Path]) -> None:
    assert '"Amulet of glory"' not in repo["roster"].read_text()
    export = {"items": [{"name": "amulet OF glory", "credit": "Woox", "credit_shown": False}]}
    assert run(repo, export) == 0
    items = json.loads(repo["roster"].read_text())["items"]
    at = items.index({"id": 1704, "name": "Amulet of glory"})
    assert items[at - 1]["name"].casefold() < "amulet of glory" < items[at + 1]["name"].casefold()


def test_importing_the_same_file_twice_changes_nothing_the_second_time(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    export = {
        "questions": [QUESTION],
        "examines": [NEW_EXAMINE],
        "items": [{"name": "Amulet of glory", "credit": "Woox", "credit_shown": True}],
    }
    assert run(repo, export) == 0
    once = snapshot(repo)
    capsys.readouterr()
    assert run(repo, export) == 0
    assert snapshot(repo) == once
    assert capsys.readouterr().out.endswith("OK: 0 added, 3 skipped\n")


def test_an_item_already_on_the_roster_is_skipped(repo: dict[str, Path]) -> None:
    before = snapshot(repo)
    export = {"items": [{"name": "Abyssal whip", "credit": "Woox", "credit_shown": True}]}
    assert run(repo, export) == 0
    assert snapshot(repo) == before


@pytest.mark.parametrize(
    ("bad", "named"),
    [
        ({**QUESTION, "payload": {**QUESTION["payload"], "answer_index": 7}}, "questions[1]"),
        ({**QUESTION, "mode": "odd_one_out"} | {"random_event": None}, "questions[1]"),
        ({**QUESTION, "credit": "<script>"}, "questions[1]"),
        ({key: v for key, v in QUESTION.items() if key != "credit_shown"}, "questions[1]"),
    ],
)
def test_one_invalid_entry_writes_nothing_and_names_it(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str], bad: dict[str, Any], named: str
) -> None:
    before = snapshot(repo)
    export = {"questions": [QUESTION, bad], "examines": [NEW_EXAMINE]}
    assert run(repo, export) == 1
    assert snapshot(repo) == before
    err = capsys.readouterr().err
    assert named in err and "nothing written" in err


def test_a_round_not_built_yet_is_refused(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    unbuilt = {k: v for k, v in QUESTION.items() if k != "random_event"} | {"mode": "odd_one_out"}
    assert run(repo, {"questions": [unbuilt]}) == 1
    assert "not a round this build plays" in capsys.readouterr().err


def test_an_item_mapping_does_not_know_writes_nothing(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    before = snapshot(repo)
    export = {
        "examines": [NEW_EXAMINE],
        "items": [{"name": "Golden gnome", "credit": "Woox", "credit_shown": True}],
    }
    assert run(repo, export) == 1
    assert snapshot(repo) == before
    assert "items[0]: 'Golden gnome' is not on the Grand Exchange" in capsys.readouterr().err


def test_a_file_that_is_not_an_export_writes_nothing(repo: dict[str, Path]) -> None:
    before = snapshot(repo)
    assert run(repo, {"questions": "all of them"}) == 1
    assert run(repo, [QUESTION]) == 1  # type: ignore[arg-type]
    assert snapshot(repo) == before


def test_the_roster_is_rewritten_as_it_is_kept() -> None:
    text = (REPO_ROOT / "data" / "popular-items.json").read_text()
    assert import_suggestions.render_roster(text, json.loads(text)["items"]) == text
