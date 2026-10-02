"""``free_text``: a typed answer, forgiven a typo -- for the host's questions only.

The normalisation rules themselves are in ``test_normalize.py``; this is the type around
them: what is on the wire when, what a player may send, and what a payload must hold.
"""

import copy
from typing import Any
from uuid import uuid4

import pytest

from app.config import REPO_ROOT
from app.modes import MODES
from app.questions import schema
from app.questions.packs import load_packs
from app.questions.submission import Submission
from app.questions.types import TYPES, free_text, scoring_of
from app.questions.types.scoring import Scoring

EXAMPLE: dict[str, Any] = {
    "type": "free_text",
    "mode": "custom",
    "source": "room",
    "tags": [],
    "payload": {
        "prompt": "Who has the clan's highest Zulrah kill count?",
        "accepted": ["Zezima", "Zezima the Great"],
        "image": "npc:2042",
        "subject": {"name": "Zezima"},
        "explanation": "4,012 kills and counting.",
    },
}
EXAMPLE["id"] = schema.content_id(EXAMPLE)


def payload(**changes: Any) -> dict[str, Any]:
    p = copy.deepcopy(EXAMPLE["payload"])
    p.update(changes)
    return p


def test_it_is_registered_and_scored_on_speed() -> None:
    assert TYPES["free_text"] is free_text
    assert scoring_of("free_text") is Scoring.SPEED


def test_no_round_plays_it() -> None:
    """It is for the host's own questions, whose answers no shipped list could hold, and
    for the NPCs' random-event questions, written by hand one at a time with their spellings listed.
    No round's pool has one."""
    assert "free_text" not in {t for mode in MODES.values() for t in mode.types}
    shipped = [q for pack in load_packs(REPO_ROOT / "data" / "packs") for q in pack.questions]
    assert {q["mode"] for q in shipped if q["type"] == "free_text"} == {"random_event"}


def test_example_validates() -> None:
    schema.validate(EXAMPLE)


def test_client_view_withholds_every_accepted_answer_and_what_it_names() -> None:
    assert free_text.client_view(EXAMPLE["payload"]) == {
        "prompt": "Who has the clan's highest Zulrah kill count?",
        "image": "npc:2042",
    }


def test_reveal_adds_the_answers_that_counted() -> None:
    assert free_text.reveal(EXAMPLE["payload"]) == {
        **free_text.client_view(EXAMPLE["payload"]),
        "accepted": ["Zezima", "Zezima the Great"],
        "subject": {"name": "Zezima"},
        "explanation": "4,012 kills and counting.",
    }


def test_grade_forgives_the_typo_the_question_allows() -> None:
    exact, typo, wrong = uuid4(), uuid4(), uuid4()
    submissions = [
        Submission(exact, "zezima"),
        Submission(typo, "Zezma"),
        Submission(wrong, "Woox"),
    ]
    assert free_text.grade(EXAMPLE["payload"], submissions) == {
        exact: 1.0,
        typo: 1.0,
        wrong: 0.0,
    }
    strict = payload(max_distance=0)
    assert free_text.grade(strict, submissions) == {exact: 1.0, typo: 0.0, wrong: 0.0}


def test_grade_holds_a_short_answer_to_itself() -> None:
    """ "Jad" does not accept "Jam", whatever ``max_distance`` says."""
    jam, jad = uuid4(), uuid4()
    short = payload(accepted=["Jad"], max_distance=2)
    credit = free_text.grade(short, [Submission(jam, "Jam"), Submission(jad, "JAD")])
    assert credit == {jam: 0.0, jad: 1.0}


@pytest.mark.parametrize(
    ("value", "ok"),
    [("Zezima", True), ("x" * 80, True), ("x" * 81, False), ("", False), (1, False), (None, False)],
)
def test_parse_value_takes_a_string_of_up_to_80(value: Any, ok: bool) -> None:
    assert free_text.parse_value(EXAMPLE["payload"], value) == (value if ok else None)


@pytest.mark.parametrize(
    "value",
    ["\ufdfa" * 5, "a\x00b", "\ud800", "Zez\udfffima"],
)
def test_parse_value_refuses_what_grows_past_80_or_cannot_be_stored(value: str) -> None:
    """U+FDFA is eighteen characters after NFKC; jsonb holds no NUL and no lone surrogate."""
    assert free_text.parse_value(EXAMPLE["payload"], value) is None


def test_parse_value_counts_what_nfkc_leaves() -> None:
    decomposed = "e\u0301" * 40  # eighty code points, forty once each accent is composed
    assert free_text.parse_value(EXAMPLE["payload"], decomposed) == decomposed


def test_check_fails_an_accepted_answer_over_80_once_normalised() -> None:
    assert free_text.check(payload(accepted=["Zezima", "\ufdfa" * 5])) == [
        "accepted[1]: is 90 characters once normalised, over the 80 an answer may be"
    ]


def test_check_fails_an_answer_nobody_could_type() -> None:
    assert free_text.check(EXAMPLE["payload"]) == []
    assert free_text.check(payload(accepted=["Zezima", "?!"])) == [
        "accepted[1]: '?!' is only punctuation and spaces, so nothing can match it"
    ]


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (lambda p: p.update(accepted=[]), "$.payload.accepted"),
        (lambda p: p.update(accepted=["x" * 81]), "$.payload.accepted[0]"),
        (lambda p: p.update(max_distance=3), "$.payload.max_distance"),
        (lambda p: p.pop("accepted"), "$.payload"),
    ],
)
def test_schema_rejects(mutate: Any, path: str) -> None:
    q = copy.deepcopy(EXAMPLE)
    mutate(q["payload"])
    q["id"] = schema.content_id(q)
    problems = schema.schema_errors(q)
    assert any(p.startswith(path + ":") for p in problems), problems
