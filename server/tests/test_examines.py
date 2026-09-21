"""``data/examines.json``: the hand-written examine lines Guess the Examine is played from.

It is the file people contribute to, so it is held to its own ``_comment`` here: every
entry has exactly an id, a name, an examine and a wiki link or null, the text fits the
schema's caps, no two ids or names collide, and the list stays sorted. And the shipped
pack is exactly what ``gen_examine_questions.py`` makes of it, so an entry added without
regenerating fails here rather than quietly never being asked.
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
    assert set(entry) == {"id", "name", "examine", "wiki"}
    assert type(entry["id"]) is int and entry["id"] >= 1
    for key, cap in (("name", MAX_NAME), ("examine", MAX_EXAMINE)):
        value = entry[key]
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


def test_the_list_is_sorted_by_name() -> None:
    names = [fold(entry["name"]) for entry in entries()]
    assert names == sorted(names)


def test_the_file_is_the_examines_vocabulary() -> None:
    """What the combobox offers is exactly the entries: every answer, and nothing else."""
    served = vocab.get("examines")
    assert served is not None
    assert {(e.id, e.name) for e in served.entries} == {(e["id"], e["name"]) for e in entries()}


def test_the_shipped_pack_is_generated_from_the_file() -> None:
    """Run ``make gen-examine-questions`` and commit the pack if this fails."""
    pack = json.loads(gen.DEFAULT_OUT.read_text(encoding="utf-8"))
    assert pack["questions"] == gen.questions(entries())


def test_every_entry_is_one_question_answered_by_its_own_id() -> None:
    by_id = {entry["id"]: entry for entry in entries()}
    made = gen.questions(entries())
    assert len(made) == len(by_id)
    for q in made:
        entry = by_id[q["payload"]["answer_id"]]
        assert q["payload"] == {
            "prompt": entry["examine"],
            "vocab": "examines",
            "answer_id": entry["id"],
            "subject": {"name": entry["name"]},
        }
        assert (q["type"], q["mode"]) == ("pick_from_list", "guess_examine")
