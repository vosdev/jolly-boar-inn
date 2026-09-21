"""``data/examines.json``: the hand-written examine lines Guess the Examine is played from.

It is the file people contribute to, so it is held to its own ``_comment`` here: every
entry has exactly an id, a name, a list of examine lines and a wiki link or null, the text
fits the schema's caps, no two ids, names or lines collide, and the list stays sorted. And
the shipped pack is exactly what ``gen_examine_questions.py`` makes of it, so a line added
without regenerating fails here, saying what to run, rather than never being asked.
"""

import json
import sys
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.questions import vocab
from app.questions.vocab import fold

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import gen_examine_questions as gen  # noqa: E402

PATH = REPO_ROOT / "data" / "examines.json"
WIKI = "https://oldschool.runescape.wiki/w/"
# The schema's caps: an answer is a ``short_text``, an examine is a ``prompt``.
MAX_NAME, MAX_EXAMINE = 120, 300


def entries() -> list[dict[str, Any]]:
    return json.loads(PATH.read_text(encoding="utf-8"))["examines"]


def test_the_file_has_entries_and_only_the_documented_keys() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    assert set(data) == {"_comment", "examines"}
    assert entries(), "no examines"


@pytest.mark.parametrize("entry", entries(), ids=lambda e: e.get("name", "?"))
def test_every_entry_is_well_formed(entry: dict[str, Any]) -> None:
    assert set(entry) == {"id", "name", "examines", "wiki"}
    assert type(entry["id"]) is int and entry["id"] >= 1
    assert isinstance(entry["examines"], list) and entry["examines"], "examines"
    texts = [("name", entry["name"], MAX_NAME)]
    texts += [("examines", line, MAX_EXAMINE) for line in entry["examines"]]
    for key, value, cap in texts:
        assert isinstance(value, str) and value.strip() == value and value, key
        assert len(value) <= cap, key
    assert entry["wiki"] is None or (
        isinstance(entry["wiki"], str) and entry["wiki"].startswith(WIKI)
    )


def test_no_two_entries_share_an_id() -> None:
    ids = [entry["id"] for entry in entries()]
    assert len(ids) == len(set(ids))


def test_no_two_names_read_as_the_same_answer() -> None:
    names = [fold(entry["name"]) for entry in entries()]
    assert len(names) == len(set(names))


def test_no_line_is_under_two_names_or_twice_under_one() -> None:
    assert gen.line_errors(entries(), PATH.name) == []


def test_line_errors_names_the_line_and_both_answers() -> None:
    twice = [
        {"id": 1, "name": "Miner", "examines": ["Mines things.", "Covered in dust."]},
        {"id": 2, "name": "Dwarf", "examines": ["mines  things."]},
        {"id": 3, "name": "Empty", "examines": []},
    ]
    assert gen.line_errors(twice, "examines.json") == [
        "examines.json: 'mines  things.' is under 'Miner' and 'Dwarf'; a line may have only"
        " one answer",
        "examines.json: 'Empty' needs a list of one or more examines",
    ]


def test_the_list_is_sorted_by_name() -> None:
    names = [fold(entry["name"]) for entry in entries()]
    assert names == sorted(names)


def test_the_file_is_the_examines_vocabulary() -> None:
    """What the combobox offers is exactly the entries: every answer, and nothing else."""
    served = vocab.get("examines")
    assert served is not None
    assert {(e.id, e.name) for e in served.entries} == {(e["id"], e["name"]) for e in entries()}


def test_the_shipped_pack_is_generated_from_the_file() -> None:
    pack = json.loads(gen.DEFAULT_OUT.read_text(encoding="utf-8"))
    shipped = [q["payload"]["prompt"] for q in pack["questions"]]
    wanted = [q["payload"]["prompt"] for q in gen.questions(entries())]
    stale = "data/packs/examine.json is out of date: run `make gen-examine-questions` and commit it"
    assert shipped == wanted, stale
    assert pack["questions"] == gen.questions(entries()), stale


def test_every_line_is_one_question_answered_by_its_entrys_id() -> None:
    by_id = {entry["id"]: entry for entry in entries()}
    made = gen.questions(entries())
    assert len(made) == sum(len(entry["examines"]) for entry in entries())
    for q in made:
        entry = by_id[q["payload"]["answer_id"]]
        assert q["payload"]["prompt"] in entry["examines"]
        assert q["payload"] == {
            "prompt": q["payload"]["prompt"],
            "vocab": "examines",
            "answer_id": entry["id"],
            "subject": {"name": entry["name"]},
        }
        assert (q["type"], q["mode"]) == ("pick_from_list", "guess_examine")


def test_an_entry_with_several_lines_is_one_answer_asked_several_ways() -> None:
    miners = {"id": 99, "name": "Miner", "examines": ["One.", "Two.", "Three."], "wiki": None}
    made = gen.questions([miners])
    assert [q["payload"]["prompt"] for q in made] == ["One.", "Two.", "Three."]
    assert {q["payload"]["answer_id"] for q in made} == {99}
    assert len({q["id"] for q in made}) == 3
