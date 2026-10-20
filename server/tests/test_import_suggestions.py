"""``scripts/import_suggestions.py``: an export from ``/admin`` into the packs and the roster."""

import json
import shutil
import sys
from pathlib import Path
from typing import Any

import pytest

from app import suggestions
from app.config import REPO_ROOT
from app.questions import schema
from app.suggestions import QUESTION_MODES

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import import_suggestions  # noqa: E402

from tests.packs import PACKS_DIR

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
    "type": "multiple_choice",
    "payload": {
        "prompt": "Yuck, I don't like cabbage.",
        "options": ["Onion", "Potato", "Cabbage", "Cabbage seed"],
        "answer_index": 2,
    },
    "mode": "guess_examine",
    "wiki": "https://oldschool.runescape.wiki/w/Cabbage",
    "credit": "AFKFisher",
    "credit_shown": False,
}
# The wiki's infobox_item rows, as its Bucket API answers them.
ITEM_ROWS = [
    {"page_name": "Amulet of glory", "item_name": "Amulet of glory", "item_id": ["1704"]},
    {"page_name": "Abyssal whip", "item_name": "Abyssal whip", "item_id": ["4151"]},
    {"page_name": "Dusty key", "item_name": "Dusty key", "item_id": ["1590"]},
    {"page_name": "Mystery box", "item_name": "Mystery box", "item_id": ["6199", "6200"]},
]


@pytest.fixture
def repo(tmp_path: Path) -> dict[str, Path]:
    """A copy of the shipped packs and roster, and saved wiki rows."""
    packs = tmp_path / "packs"
    shutil.copytree(PACKS_DIR, packs)
    roster = tmp_path / "popular-items.json"
    shutil.copy(REPO_ROOT / "data" / "popular-items.json", roster)
    rows = tmp_path / "items.json"
    rows.write_text(json.dumps(ITEM_ROWS))
    return {"packs": packs, "roster": roster, "items": rows, "dir": tmp_path}


def run(repo: dict[str, Path], export: dict[str, Any]) -> int:
    file = repo["dir"] / "export.json"
    file.write_text(json.dumps(export))
    args = [str(file), "--packs-dir", str(repo["packs"]), "--roster", str(repo["roster"])]
    return import_suggestions.main([*args, "--items-file", str(repo["items"])])


def loads(repo: dict[str, Path]) -> bool:
    """Whether the imported packs load, held to the lists they make themselves."""
    return import_suggestions.check_packs(repo["packs"], {}, repo["roster"].read_text()) == []


def snapshot(repo: dict[str, Path]) -> dict[str, str]:
    files = [*repo["packs"].rglob("*.json"), repo["roster"]]
    return {str(path): path.read_text() for path in sorted(files)}


def examines(repo: dict[str, Path]) -> list[dict[str, Any]]:
    return json.loads((repo["packs"] / "examine.json").read_text())["questions"]


def same_question(stored: dict[str, Any], written: dict[str, Any]) -> bool:
    """Whether ``stored`` is ``written`` with only its options reordered, the answer kept."""
    rest = {k: v for k, v in stored.items() if k not in ("options", "answer_index")}
    right = stored["options"][stored["answer_index"]]
    return (
        sorted(stored["options"]) == sorted(written["options"])
        and right == written["options"][written["answer_index"]]
        and rest == {k: v for k, v in written.items() if k not in ("options", "answer_index")}
    )


def test_an_npc_question_lands_in_its_file_with_its_credit(repo: dict[str, Path]) -> None:
    assert run(repo, {"questions": [QUESTION]}) == 0
    bob = json.loads((repo["packs"] / "random_events" / "bob.json").read_text())
    added = bob["questions"][-1]
    assert added["mode"] == "random_event" and "random_event" not in added
    assert (added["credit"], added["credit_shown"], added["wiki"]) == ("AFKFisher", True, WIKI)
    assert same_question(added["payload"], QUESTION["payload"])
    assert loads(repo)


def test_a_quote_and_its_source_url_reach_the_pack_as_they_are(repo: dict[str, Path]) -> None:
    payload = {
        "prompt": "Who said this?",
        "quote": "Never gonna give you up",
        "options": ["Rick", "Zezima"],
        "answer_index": 0,
    }
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    question = {
        "type": "multiple_choice",
        "payload": payload,
        "mode": "who_said_that",
        "source_url": url,
        "credit": "AFKFisher",
        "credit_shown": False,
    }
    assert run(repo, {"questions": [question]}) == 0
    pack = json.loads((repo["packs"] / "who_said_that.json").read_text())
    added = pack["questions"][-1]
    assert same_question(added["payload"], payload) and added["source_url"] == url
    assert "wiki" not in added
    assert loads(repo)


def test_a_choice_question_is_stored_shuffled_and_its_id_follows() -> None:
    envelope = suggestions.question_envelope(
        {k: v for k, v in QUESTION.items() if "credit" not in k}
    )
    stored = import_suggestions.shuffled(envelope)
    assert stored["payload"]["options"] != QUESTION["payload"]["options"]
    assert same_question(stored["payload"], QUESTION["payload"])
    assert stored["id"] == schema.content_id(stored) != envelope["id"]
    assert list(stored) == list(envelope)


def test_pick_all_that_apply_keeps_its_right_options_sorted() -> None:
    options = ["Dharok", "Torag", "Hazelmere", "Karil", "Zezima", "Guthan"]
    question = {
        "type": "pick_all_that_apply",
        "payload": {"prompt": "Barrows brothers?", "options": options, "answer_indices": [0, 1, 3]},
    }
    payload = import_suggestions.shuffled(question)["payload"]
    assert payload["options"] != options and sorted(payload["options"]) == sorted(options)
    assert payload["answer_indices"] == sorted(payload["answer_indices"])
    assert {payload["options"][i] for i in payload["answer_indices"]} == {
        "Dharok",
        "Torag",
        "Karil",
    }


def test_other_types_are_stored_as_written() -> None:
    question = {"type": "closest_number", "payload": {"prompt": "How many?", "answer": 7}}
    assert import_suggestions.shuffled(question) is question


def test_a_sort_it_out_question_is_appended_to_its_pack(repo: dict[str, Path]) -> None:
    payload = {
        "prompt": "Sort the rings by the level that wears them.",
        "ends": ["Lowest", "Highest"],
        "entries": [
            {"text": "Ring of recoil", "rank": 1},
            {"text": "Berserker ring", "rank": 1, "detail": "Level 1"},
            {"text": "Ring of suffering", "rank": 2},
        ],
        "answer": [0, 1, 2],
        "picks": 2,
    }
    question = {
        "type": "ordering",
        "payload": payload,
        "mode": "sort_it_out",
        "wiki": WIKI,
        "credit": "AFKFisher",
        "credit_shown": True,
    }
    pack = repo["packs"] / "sort_it_out.json"
    before = len(json.loads(pack.read_text())["questions"])
    assert run(repo, {"questions": [question]}) == 0
    added = json.loads(pack.read_text())["questions"]
    assert len(added) == before + 1
    assert added[-1]["payload"] == payload and added[-1]["mode"] == "sort_it_out"
    assert (added[-1]["credit"], added[-1]["wiki"]) == ("AFKFisher", WIKI)
    assert loads(repo)


def test_an_examine_keeps_its_name_first_and_the_packs_tag(repo: dict[str, Path]) -> None:
    assert run(repo, {"questions": [NEW_EXAMINE]}) == 0
    *_, new = examines(repo)
    assert (new["type"], new["mode"], new["tags"]) == (
        "multiple_choice",
        "guess_examine",
        ["examine"],
    )
    assert new["payload"] == {
        "prompt": "Yuck, I don't like cabbage.",
        "options": ["Cabbage", "Onion", "Potato", "Cabbage seed"],
        "answer_index": 0,
    }
    assert new["credit"] == "AFKFisher" and "credit_shown" not in new
    assert loads(repo)


def test_an_examine_line_already_asked_is_skipped(repo: dict[str, Path]) -> None:
    before = snapshot(repo)
    asked = examines(repo)[0]["payload"]["prompt"]
    payload = {**NEW_EXAMINE["payload"], "prompt": asked.upper()}
    assert run(repo, {"questions": [{**NEW_EXAMINE, "payload": payload}]}) == 0
    assert snapshot(repo) == before


def test_an_item_takes_its_id_from_the_wiki_in_name_order(repo: dict[str, Path]) -> None:
    assert '"Amulet of glory"' not in repo["roster"].read_text()
    export = {"items": [{"name": "amulet of glory", "credit": "Woox", "credit_shown": False}]}
    assert run(repo, export) == 0
    items = json.loads(repo["roster"].read_text())["items"]
    at = items.index({"id": 1704, "name": "Amulet of glory"})
    assert items[at - 1]["name"].casefold() < "amulet of glory" < items[at + 1]["name"].casefold()


def test_importing_the_same_file_twice_changes_nothing_the_second_time(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    export = {
        "questions": [QUESTION, NEW_EXAMINE],
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
        ({**QUESTION, "mode": "zoom_quiz"} | {"random_event": None}, "questions[1]"),
        ({**QUESTION, "credit": "<script>"}, "questions[1]"),
        ({key: v for key, v in QUESTION.items() if key != "credit_shown"}, "questions[1]"),
    ],
)
def test_one_invalid_entry_writes_nothing_and_names_it(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str], bad: dict[str, Any], named: str
) -> None:
    before = snapshot(repo)
    export = {"questions": [QUESTION, bad, NEW_EXAMINE]}
    assert run(repo, export) == 1
    assert snapshot(repo) == before
    err = capsys.readouterr().err
    assert named in err and "nothing written" in err


def test_an_examine_of_three_names_writes_nothing(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    before = snapshot(repo)
    payload = {**NEW_EXAMINE["payload"], "options": ["Onion", "Potato", "Cabbage"]}
    assert run(repo, {"questions": [{**NEW_EXAMINE, "payload": payload}]}) == 1
    assert snapshot(repo) == before
    assert (
        "questions[0] $.payload.options: 'guess_examine' offers 4 to 6" in capsys.readouterr().err
    )


def test_an_export_from_before_examines_were_questions_writes_nothing(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str]
) -> None:
    before = snapshot(repo)
    assert run(repo, {"examines": []}) == 1
    assert snapshot(repo) == before
    assert "is not an export" in capsys.readouterr().err


def test_a_round_not_built_yet_is_refused(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    # Every round a player may write for is built, so this one is invented.
    monkeypatch.setitem(QUESTION_MODES, "zoom_quiz", frozenset({"multiple_choice"}))
    unbuilt = {k: v for k, v in QUESTION.items() if k != "random_event"} | {"mode": "zoom_quiz"}
    assert run(repo, {"questions": [unbuilt]}) == 1
    assert "not a round this build plays" in capsys.readouterr().err


def test_an_untradeable_item_takes_its_id_from_the_wiki(repo: dict[str, Path]) -> None:
    assert '"Dusty key"' not in repo["roster"].read_text()
    export = {"items": [{"name": "Dusty key", "credit": "Woox", "credit_shown": True}]}
    assert run(repo, export) == 0
    assert {"id": 1590, "name": "Dusty key"} in json.loads(repo["roster"].read_text())["items"]


def test_the_row_on_the_items_own_page_wins() -> None:
    fire_cape = [
        {"page_name": "Fire cape", "item_name": "Fire cape", "item_id": ["6570"]},
        {"page_name": "Fire cape (animation item)", "item_name": "Fire cape", "item_id": ["10566"]},
    ]
    assert import_suggestions.item_id("fire cape", fire_cape) == (6570, "Fire cape")


@pytest.mark.parametrize(
    ("name", "why"),
    [("Not an item", "is not an item on the wiki"), ("Mystery box", "names several items")],
)
def test_an_item_the_wiki_cannot_pin_down_writes_nothing(
    repo: dict[str, Path], capsys: pytest.CaptureFixture[str], name: str, why: str
) -> None:
    before = snapshot(repo)
    export = {
        "questions": [NEW_EXAMINE],
        "items": [{"name": name, "credit": "Woox", "credit_shown": True}],
    }
    assert run(repo, export) == 1
    assert snapshot(repo) == before
    assert f"items[0]: {name!r} {why}" in capsys.readouterr().err


def test_the_wiki_is_asked_for_the_name_quoted() -> None:
    query = import_suggestions.bucket_query("Zulrah's scales")
    assert ".where('item_name','Zulrah\\'s scales')" in query


def test_a_file_that_is_not_an_export_writes_nothing(repo: dict[str, Path]) -> None:
    before = snapshot(repo)
    assert run(repo, {"questions": "all of them"}) == 1
    assert run(repo, [QUESTION]) == 1  # type: ignore[arg-type]
    assert snapshot(repo) == before


def test_the_roster_is_rewritten_as_it_is_kept() -> None:
    text = (REPO_ROOT / "data" / "popular-items.json").read_text()
    assert import_suggestions.render_roster(text, json.loads(text)["items"]) == text
