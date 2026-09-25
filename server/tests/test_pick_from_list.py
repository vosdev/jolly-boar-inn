"""T20 Accept, the type half: an answer that is not an id in the vocabulary is
``bad_value``, and so is a string; ``validate-packs`` fails a question whose ``answer_id``
is not in its vocabulary. Plus the rest of the six exports, how it scores, and the
shipped ``guess_examine`` pack.
"""

import copy
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, seconds_bounds
from app.questions import schema, vocab
from app.questions.packs import load_packs
from app.questions.submission import Submission
from app.questions.types import TYPES, pick_from_list, scoring_of, steps_of
from app.questions.types.scoring import Scoring
from app.rooms import scoring

SERVER_DIR = REPO_ROOT / "server"
PACKS_DIR = REPO_ROOT / "data" / "packs"

EXAMPLE: dict[str, Any] = {
    "type": "pick_from_list",
    "mode": "guess_examine",
    "source": "pack",
    "tags": ["examine"],
    "payload": {
        "prompt": "A weapon from the abyss.",
        "vocab": "items",
        "answer_id": 4151,
        "subject": {"name": "Abyssal whip", "asset": "item:4151"},
    },
}
EXAMPLE["id"] = schema.content_id(EXAMPLE)


def payload(**changes: Any) -> dict[str, Any]:
    p = copy.deepcopy(EXAMPLE["payload"])
    p.update(changes)
    return p


def envelope(**changes: Any) -> dict[str, Any]:
    q = copy.deepcopy(EXAMPLE)
    q["payload"].update(changes)
    q["id"] = schema.content_id(q)
    return q


def shipped() -> list[dict[str, Any]]:
    pack = next(pack for pack in load_packs(PACKS_DIR) if pack.path.name == "examine.json")
    return list(pack.questions)


# --- registry ---------------------------------------------------------------------------


def test_guess_examine_plays_as_pick_from_list_at_its_types_pace() -> None:
    assert MODES["guess_examine"].types == {"pick_from_list"}
    assert TYPES["pick_from_list"] is pick_from_list
    assert seconds_bounds("guess_examine") is pick_from_list.SECONDS


def test_it_scores_on_steps_which_without_steps_is_speed() -> None:
    """Section 6: one type for Pixel Hunt's frames and Guess the Examine's one line."""
    assert scoring_of("pick_from_list") is Scoring.STEP
    assert scoring.effective(Scoring.STEP, EXAMPLE["payload"].get("steps")) is Scoring.SPEED
    assert scoring.effective(Scoring.STEP, 8) is Scoring.STEP


def test_its_steps_hook_is_how_the_engine_learns_the_frames() -> None:
    assert steps_of("pick_from_list", payload(steps=8)) == 8
    assert steps_of("pick_from_list", EXAMPLE["payload"]) is None


def test_example_validates() -> None:
    schema.validate(EXAMPLE)


# --- parse_value ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "ok"),
    [
        (4151, True),
        (4587, True),  # wrong, but a real entry: a wrong answer, not a malformed one
        (999999, False),  # no such entry
        (-1, False),
        ("Abyssal whip", False),  # typed text is a search, never an answer
        ("4151", False),
        (4151.0, False),
        (True, False),
        (None, False),
    ],
)
def test_parse_value_takes_only_an_id_in_the_vocabulary(value: Any, ok: bool) -> None:
    assert pick_from_list.parse_value(EXAMPLE["payload"], value) == (value if ok else None)


def test_parse_value_refuses_everything_for_a_vocabulary_this_build_lacks() -> None:
    if vocab.get("npcs") is not None:
        pytest.skip("npcs.json exists now")
    assert pick_from_list.parse_value(payload(vocab="npcs"), 4151) is None


# --- check ------------------------------------------------------------------------------


def test_check_passes_a_consistent_payload() -> None:
    assert pick_from_list.check(EXAMPLE["payload"]) == []
    subjectless = payload()
    del subjectless["subject"]
    assert pick_from_list.check(subjectless) == []


def test_check_fails_an_answer_id_missing_from_its_vocabulary() -> None:
    assert pick_from_list.check(payload(answer_id=999999)) == [
        "answer_id: 999999 is not an entry of the items vocabulary"
    ]


def test_check_fails_a_subject_that_is_not_the_entrys_name() -> None:
    wrong = payload(subject={"name": "Abyssal tentacle", "asset": "item:4151"})
    assert pick_from_list.check(wrong) == [
        "subject.name: 'Abyssal tentacle' but items entry 4151 is 'Abyssal whip'"
    ]


def test_check_fails_a_vocabulary_this_build_lacks() -> None:
    if vocab.get("npcs") is not None:
        pytest.skip("npcs.json exists now")
    assert pick_from_list.check(payload(vocab="npcs")) == [
        "vocab: 'npcs' is not available in this build"
    ]


def _validate_packs(directory: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "scripts/validate_packs.py", str(directory)],
        cwd=SERVER_DIR,
        env={**os.environ, "PYTHONPATH": str(SERVER_DIR)},
        capture_output=True,
        text=True,
        check=False,
    )


def test_validate_packs_fails_an_answer_id_missing_from_its_vocabulary(tmp_path: Path) -> None:
    """T20 Accept: a roster edit that drops an item fails CI, not a quiz night. The id
    matches the content, so the vocabulary is the only thing left to complain about."""
    dropped = envelope(answer_id=999999)
    del dropped["payload"]["subject"]
    dropped["id"] = schema.content_id(dropped)
    pack = {"pack": "examine", "generated_at": "2026-09-21T00:00:00Z", "questions": [dropped]}
    (tmp_path / "examine.json").write_text(json.dumps(pack), encoding="utf-8")
    result = _validate_packs(tmp_path)
    assert result.returncode == 1
    assert (
        "examine.json: questions[0] $.payload.answer_id: 999999 is not an entry of the items"
        " vocabulary" in result.stderr
    )
    assert "FAILED: 1 problem(s)" in result.stderr


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (lambda p: p.pop("vocab"), "$.payload"),
        (lambda p: p.update(vocab="quests"), "$.payload.vocab"),
        (lambda p: p.update(answer_id="4151"), "$.payload.answer_id"),
        (lambda p: p.update(steps=13), "$.payload.steps"),
        (lambda p: p.update(accepted=["whip"]), "$.payload"),
        (lambda p: p.update(prompt=""), "$.payload.prompt"),
    ],
)
def test_schema_rejects(mutate: Any, path: str) -> None:
    q = copy.deepcopy(EXAMPLE)
    mutate(q["payload"])
    q["id"] = schema.content_id(q)
    assert any(error.startswith(path) for error in schema.schema_errors(q)), path


# --- the other exports ------------------------------------------------------------------


def test_client_view_withholds_the_answer_and_anything_that_names_it() -> None:
    """The subject *is* the answer here, and an image is ``item:<answer_id>``, so both wait
    for the reveal with ``answer_id``."""
    view = pick_from_list.client_view(EXAMPLE["payload"])
    assert view == {"prompt": "A weapon from the abyss.", "vocab": "items"}
    stepped = pick_from_list.client_view(payload(steps=8, image="item:4151"))
    assert stepped == {**view, "steps": 8}
    assert pick_from_list.reveal(payload(image="item:4151"))["image"] == "item:4151"


def test_reveal_adds_the_answer_and_what_it_was() -> None:
    revealed = pick_from_list.reveal(payload(explanation="From the Abyss."))
    assert revealed == {
        "prompt": "A weapon from the abyss.",
        "vocab": "items",
        "answer_id": 4151,
        "subject": {"name": "Abyssal whip", "asset": "item:4151"},
        "explanation": "From the Abyss.",
    }


def test_grade_is_all_or_nothing_credit_on_the_id() -> None:
    right, wrong, typed = uuid4(), uuid4(), uuid4()
    subs = [Submission(right, 4151), Submission(wrong, 4587), Submission(typed, "Abyssal whip")]
    credit = pick_from_list.grade(EXAMPLE["payload"], subs)
    assert credit == {right: 1.0, wrong: 0.0, typed: 0.0}
    assert all(type(value) is float for value in credit.values())


# --- the shipped pack -------------------------------------------------------------------


def test_every_shipped_question_answers_from_the_examines_list_by_id() -> None:
    """``load_packs`` ran ``check`` on each; this pins down the shape the generator ships."""
    questions = shipped()
    assert questions, "examine.json ships no questions"
    examines = vocab.get("examines")
    assert examines is not None
    prompts = [q["payload"]["prompt"] for q in questions]
    assert len(prompts) == len(set(prompts)), "no examine is two items' answer"
    for q in questions:
        assert (q["type"], q["mode"], q["payload"]["vocab"]) == (
            "pick_from_list",
            "guess_examine",
            "examines",
        )
        assert q["payload"]["subject"]["name"] == examines.name_of(q["payload"]["answer_id"])


def test_no_shipped_answer_leaks_into_the_open_view() -> None:
    for q in shipped():
        view = pick_from_list.client_view(q["payload"])
        assert set(view) == {"prompt", "vocab"}, q["id"]
        assert str(q["payload"]["answer_id"]) not in json.dumps(view), q["id"]
