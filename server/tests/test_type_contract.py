"""The rules every question type keeps, checked over ``TYPES``.

Each type's own test file covers what is particular to it. This one holds every type to
the contract the engine relies on without looking: whatever ``parse_value`` lets in grades
to credit in 0..1, nobody answering grades to nothing, a boolean, a null or a megabyte is
refused on arrival, and the open view carries none of what the reveal adds. A new type
adds one entry to ``EXAMPLES`` and gets all of it.
"""

import math
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import pytest

from app.modes import type_questions, type_seconds
from app.questions import schema
from app.questions.submission import Submission
from app.questions.types import TYPES, scoring_of, steps_of
from app.questions.types.scoring import Scoring
from tests import answers


@dataclass(frozen=True)
class Example:
    """One question of a type, and answers to it the contract is tried on."""

    payload: dict[str, Any]
    valid: list[Any]
    invalid: list[Any]
    right: Any
    wrong: Any
    # Every key, at any depth, that ``reveal`` has and ``client_view`` does not.
    secret: frozenset[str]
    scoring: Scoring
    seconds: tuple[int, int, int]
    questions: tuple[int, int, int] = (5, 1, 30)


EXAMPLES: dict[str, Example] = {
    "more_less": Example(
        payload={
            "metric": "ge_price",
            "direction": "more",
            "options": [
                {"subject": {"name": "Abyssal whip", "asset": "item:4151"}, "value": 1650000},
                {"subject": {"name": "Dragon scimitar", "asset": "item:4587"}, "value": 60000},
            ],
            "answer_index": 0,
            "as_of": "2026-09-01",
        },
        valid=[0, 1],
        invalid=[2, -1, "0", 0.0, [0]],
        right=0,
        wrong=1,
        secret=frozenset({"value", "answer_index"}),
        scoring=Scoring.SPEED,
        seconds=(10, 5, 20),
    ),
    "price_is_right": Example(
        payload={
            "subject": {"name": "Abyssal whip", "asset": "item:4151"},
            "value": 1600000,
            "options": [1100000, 1600000, 2100000, 2900000],
            "answer_index": 1,
            "as_of": "2026-09-20",
        },
        valid=[0, 3],
        invalid=[4, -1, "1", 1.0, 1600000],
        right=1,
        wrong=0,
        secret=frozenset({"value", "answer_index"}),
        scoring=Scoring.SPEED,
        seconds=(10, 5, 30),
    ),
    "pick_from_list": Example(
        payload={
            "prompt": "A weapon from the abyss.",
            "vocab": "items",
            "answer_id": 4151,
            "subject": {"name": "Abyssal whip", "asset": "item:4151"},
            "image": "item:4151",
            "explanation": "Dropped by abyssal demons.",
        },
        valid=[4151, 4587],
        invalid=[999999, -1, "Abyssal whip", "4151", 4151.0],
        right=4151,
        wrong=4587,
        secret=frozenset({"answer_id", "subject", "name", "asset", "image", "explanation"}),
        scoring=Scoring.STEP,
        seconds=(20, 10, 60),
    ),
    "multiple_choice": Example(
        payload={
            "prompt": "Which boss drops the Tanzanite fang?",
            "options": ["Zulrah", "Vorkath", "Jad"],
            "answer_index": 0,
            "image": "item:12922",
            "explanation": "It is one of Zulrah's uniques.",
        },
        valid=[0, 2],
        invalid=[3, -1, "0", 0.0],
        right=0,
        wrong=1,
        secret=frozenset({"answer_index", "explanation"}),
        scoring=Scoring.SPEED,
        seconds=(15, 5, 30),
    ),
    "closest_number": Example(
        payload={
            "prompt": "How many Zulrah kills did it take?",
            "answer": 100,
            "unit": "kc",
            "image": "npc:2042",
            "explanation": "Counted from the collection log.",
        },
        valid=[100, 99.5, -3, 0, 10**6],
        invalid=["100", math.inf, -math.inf, math.nan, 10**400],
        right=100,
        wrong=7,
        secret=frozenset({"answer", "explanation"}),
        scoring=Scoring.RANK,
        seconds=(20, 10, 60),
    ),
    "free_text": Example(
        payload={
            "prompt": "Who was the first to 99 in every skill?",
            "accepted": ["Zezima", "Zezzy"],
            "max_distance": 1,
            "image": "npc:3106",
            "subject": {"name": "Zezima"},
            "explanation": "Or so the legend goes.",
        },
        valid=["Zezima", "zezma", "x" * 80],
        invalid=["", "x" * 81, 1, "a\x00b", ["Zezima"]],
        right="zezima",
        wrong="Woox",
        secret=frozenset({"accepted", "subject", "name", "explanation"}),
        scoring=Scoring.SPEED,
        seconds=(20, 10, 60),
    ),
    "pick_all_that_apply": Example(
        payload={
            "prompt": "Which of these are spiders?",
            "options": ["Kalphite Queen", "Sarachnis", "Venenatis", "Scorpia"],
            "answer_indices": [1, 2],
            "picks": 2,
            "image": "npc:8713",
            "explanation": "Scorpia is a scorpion and the Kalphite Queen an insect.",
        },
        valid=[[1, 2], [3, 0], [0, 1]],
        invalid=[[1], [1, 2, 3], [1, 1], [1, 4], [-1, 1], [1, True], 1, "1,2", [1.0, 2.0], []],
        right=[1, 2],
        wrong=[0, 2],
        secret=frozenset({"answer_indices", "explanation"}),
        scoring=Scoring.SPEED,
        seconds=(20, 5, 30),
    ),
    "ordering": Example(
        payload={
            "prompt": "Put these metals in order.",
            "ends": ["Weakest", "Strongest"],
            "entries": [
                {"text": "Bronze", "rank": 1, "detail": "Level 1"},
                {"text": "Iron", "rank": 2, "detail": "Level 10"},
                {"text": "Steel", "rank": 3, "detail": "Level 20"},
                {"text": "Mithril", "rank": 4, "detail": "Level 30"},
            ],
            "answer": [0, 1, 2, 3],
            "image": "item:2349",
            "explanation": "Each needs ten more Smithing than the last.",
        },
        # Shown as Bronze, Iron, Mithril, Steel.
        valid=[[0, 1, 2, 3], [3, 2, 1, 0], [2, 0, 3, 1]],
        invalid=[
            [0, 1, 2],
            [0, 1, 2, 2],
            [0, 1, 2, 4],
            [-1, 0, 1, 2],
            [0, 1, 2, True],
            [0.0, 1, 2, 3],
            [0, 1, 2, 3, 0],
            [],
            "0132",
            0,
        ],
        right=[0, 1, 3, 2],
        wrong=[1, 0, 3, 2],
        secret=frozenset({"rank", "detail", "answer", "explanation"}),
        scoring=Scoring.SPEED,
        seconds=(25, 10, 45),
    ),
}

# Refused by every type, whatever its shape: ``true`` is ``1`` to Python, ``null`` is
# nothing, and a megabyte is no answer to anything.
REFUSED_BY_ALL: list[Any] = [True, False, None, "x" * 2**20, [0] * 2**17, {"value": 0}]


def example(type_id: str) -> Example:
    """The type's entry in ``EXAMPLES``; a type without one fails every rule by name."""
    if type_id not in EXAMPLES:
        pytest.fail(f"{type_id} is in TYPES but has no entry in test_type_contract.EXAMPLES")
    return EXAMPLES[type_id]


def right_value(type_id: str) -> Any:
    """An answer to the type's example question that grades 1.0."""
    return example(type_id).right


def wrong_value(type_id: str) -> Any:
    """An answer to the type's example question that grades below 1.0."""
    return example(type_id).wrong


def keys_anywhere(node: Any) -> Iterator[str]:
    if isinstance(node, dict):
        for key, value in node.items():
            yield key
            yield from keys_anywhere(value)
    elif isinstance(node, list):
        for value in node:
            yield from keys_anywhere(value)


def grade_alone(type_id: str, value: Any) -> float:
    player = uuid4()
    credit = TYPES[type_id].grade(example(type_id).payload, [Submission(player, value)])
    assert set(credit) == {player}
    return credit[player]


per_type = pytest.mark.parametrize("type_id", list(TYPES))


def test_every_type_has_an_example_and_no_example_is_stale() -> None:
    assert EXAMPLES.keys() == TYPES.keys()


@per_type
def test_the_example_is_a_valid_consistent_question(type_id: str) -> None:
    payload = example(type_id).payload
    envelope = {"type": type_id, "mode": "custom", "source": "room", "tags": [], "payload": payload}
    envelope["id"] = schema.content_id(envelope)
    assert schema.schema_errors(envelope) == []
    assert TYPES[type_id].check(payload) == []


@per_type
def test_every_value_parse_value_accepts_grades_to_credit_in_zero_to_one(type_id: str) -> None:
    ex, module = example(type_id), TYPES[type_id]
    parsed = [module.parse_value(ex.payload, v) for v in [*ex.valid, ex.right, ex.wrong]]
    assert None not in parsed
    # Alone, and all at once: ``closest_number`` grades each answer against the others.
    submissions = [Submission(uuid4(), value) for value in parsed]
    together = module.grade(ex.payload, submissions)
    assert set(together) == {s.player_id for s in submissions}
    for credit in [*together.values(), *(grade_alone(type_id, value) for value in parsed)]:
        assert type(credit) is float
        assert 0.0 <= credit <= 1.0


@per_type
def test_parse_value_is_its_own_canonical_form(type_id: str) -> None:
    """What the room stores parses to itself, so a reloaded answer is the answer."""
    ex, module = example(type_id), TYPES[type_id]
    for value in [*ex.valid, ex.right, ex.wrong]:
        canonical = module.parse_value(ex.payload, value)
        assert module.parse_value(ex.payload, canonical) == canonical


@per_type
def test_the_right_answer_is_full_credit_and_the_wrong_one_is_not(type_id: str) -> None:
    module, payload = TYPES[type_id], example(type_id).payload
    assert grade_alone(type_id, module.parse_value(payload, right_value(type_id))) == 1.0
    assert grade_alone(type_id, module.parse_value(payload, wrong_value(type_id))) < 1.0


@per_type
def test_the_game_tests_answers_are_right_and_wrong_as_they_say(type_id: str) -> None:
    """``tests/answers.py``, which every game test answers through, worked out from the
    payload rather than written down, so it holds for whatever question a room draws."""
    module, payload = TYPES[type_id], example(type_id).payload
    right = module.parse_value(payload, answers.right_value(type_id, payload))
    wrong = module.parse_value(payload, answers.wrong_value(type_id, payload))
    assert right is not None and wrong is not None
    assert grade_alone(type_id, right) == 1.0
    assert grade_alone(type_id, wrong) < 1.0


@per_type
def test_nobody_answering_grades_to_nothing(type_id: str) -> None:
    assert TYPES[type_id].grade(example(type_id).payload, []) == {}


@per_type
def test_parse_value_refuses_a_boolean_a_null_a_megabyte_and_the_malformed(type_id: str) -> None:
    ex, module = example(type_id), TYPES[type_id]
    for value in [*REFUSED_BY_ALL, *ex.invalid]:
        assert module.parse_value(ex.payload, value) is None, repr(value)[:40]


@per_type
def test_the_open_view_has_none_of_what_the_reveal_adds(type_id: str) -> None:
    ex, module = example(type_id), TYPES[type_id]
    view = set(keys_anywhere(module.client_view(ex.payload)))
    revealed = set(keys_anywhere(module.reveal(ex.payload)))
    assert view <= revealed
    assert revealed - view == ex.secret


@per_type
def test_an_npc_s_intro_is_shown_open_and_in_the_reveal(type_id: str) -> None:
    """Every type whose schema takes an ``intro`` puts it on the wire from the first frame."""
    if "intro" not in schema.load_schema()["$defs"][type_id]["properties"]:
        return
    ex, module = example(type_id), TYPES[type_id]
    payload = {**ex.payload, "intro": "Don't just stand there on my allotment."}
    envelope = {"type": type_id, "mode": "custom", "source": "room", "tags": [], "payload": payload}
    envelope["id"] = schema.content_id(envelope)
    assert schema.schema_errors(envelope) == []
    assert module.client_view(payload)["intro"] == payload["intro"]
    assert module.reveal(payload)["intro"] == payload["intro"]


@per_type
def test_each_type_states_its_pace_and_its_scoring(type_id: str) -> None:
    ex = example(type_id)
    assert scoring_of(type_id) is ex.scoring
    seconds, questions = type_seconds(type_id), type_questions(type_id)
    assert (seconds.default, seconds.minimum, seconds.maximum) == ex.seconds
    assert (questions.default, questions.minimum, questions.maximum) == ex.questions


@per_type
def test_a_question_without_steps_has_none(type_id: str) -> None:
    """Only a payload that says how many frames it zooms over is scored on them."""
    assert steps_of(type_id, example(type_id).payload) is None
