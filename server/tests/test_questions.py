"""The hand-written sample pack validates; a mutated ``answer`` fails the
consistency check; ``content_id`` is stable across key order; ``client_view`` has no
``answer``; ``grade`` works. Plus the schema file, the loader, and the CI script.
"""

import copy
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import modes
from app.config import REPO_ROOT, Settings
from app.main import create_app
from app.modes import MODES, Mode, questions_bounds, seconds_bounds
from app.questions import schema
from app.questions.packs import PackError, load_packs
from app.questions.submission import Submission
from app.questions.types import (
    TYPES,
    closest_number,
    free_text,
    more_less,
    multiple_choice,
    ordering,
    pick_all_that_apply,
    pick_from_list,
    price_is_right,
)
from app.questions.types.bounds import Bounds

PACKS_DIR = REPO_ROOT / "data" / "packs"
SERVER_DIR = REPO_ROOT / "server"

EXAMPLE: dict[str, Any] = {
    "type": "more_less",
    "mode": "more_less",
    "source": "pack",
    "tags": ["prices"],
    "payload": {
        "metric": "ge_price",
        "direction": "more",
        "options": [
            {"subject": {"name": "Abyssal whip", "asset": "item:4151"}, "value": 1650000},
            {"subject": {"name": "Dragon scimitar", "asset": "item:4587"}, "value": 60000},
        ],
        "answer_index": 0,
        "as_of": "2026-09-01",
    },
}
EXAMPLE["id"] = schema.content_id(EXAMPLE)


def question(**changes: Any) -> dict[str, Any]:
    q = copy.deepcopy(EXAMPLE)
    q.update(changes)
    return q


def variant(second_value: int) -> dict[str, Any]:
    """A valid question with its own content id."""
    q = question()
    q["payload"]["options"][1]["value"] = second_value
    q["payload"]["answer_index"] = 1 if second_value > 1650000 else 0
    q["id"] = schema.content_id(q)
    return q


def _write_pack(path: Path, questions: list[dict[str, Any]], name: str = "test") -> None:
    pack = {"pack": name, "generated_at": "2026-09-18T00:00:00Z", "questions": questions}
    path.write_text(json.dumps(pack))


# --- sample pack -------------------------------------------------------------------


def test_sample_pack_validates() -> None:
    """A hand-written sample.json with 5 higher/lower questions validates."""
    packs = load_packs(PACKS_DIR)
    sample = next(pack for pack in packs if pack.path.name == "sample.json")
    assert sample.name == "sample"
    assert len(sample.questions) == 5
    assert {q["type"] for q in sample.questions} == {"more_less"}
    for q in sample.questions:
        schema.validate(q)
        assert q["id"] == schema.content_id(q)


def test_validate_packs_script_passes_on_shipped_packs() -> None:
    """Scripts/validate_packs.py, the check CI runs."""
    result = _validate_packs(PACKS_DIR)
    assert result.returncode == 0, result.stderr
    assert "sample.json: 5 question(s) ok" in result.stdout


def _validate_packs(directory: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "scripts/validate_packs.py", str(directory)],
        cwd=SERVER_DIR,
        env={**os.environ, "PYTHONPATH": str(SERVER_DIR)},
        capture_output=True,
        text=True,
        check=False,
    )


def test_validate_packs_script_fails_on_broken_pack(tmp_path: Path) -> None:
    bad = question()
    bad["payload"]["answer_index"] = 1  # contradicts the values, and the id no longer matches
    _write_pack(tmp_path / "bad.json", [bad])
    result = _validate_packs(tmp_path)
    assert result.returncode == 1
    assert "bad.json: questions[0] $.payload.answer_index" in result.stderr
    assert "FAILED" in result.stderr


def test_validate_packs_script_fails_on_a_mode_this_build_does_not_play(tmp_path: Path) -> None:
    """A ``more_less`` question claiming a mode nobody plays is refused, by name.

    Everything else about it is right, the id included, so the mode is the only thing
    the script can be complaining about.
    """
    _write_pack(tmp_path / "zoom.json", [question(mode="zoom_quiz")])
    result = _validate_packs(tmp_path)
    assert result.returncode == 1
    assert "zoom.json: questions[0] $.mode: 'zoom_quiz' is not a mode" in result.stderr
    assert "FAILED: 1 problem(s)" in result.stderr


# --- consistency -------------------------------------------------------------------


def test_mutated_answer_fails_consistency_check() -> None:
    """A mutated ``answer_index`` fails the consistency check."""
    mutated = question()
    mutated["payload"]["answer_index"] = 1
    assert schema.schema_errors(mutated) == []  # still a well-formed question
    problems = schema.consistency_errors(mutated)
    assert any(p.startswith("$.payload.answer_index") for p in problems), problems
    assert any(p.startswith("$.id") for p in problems), problems  # content changed, id did not
    with pytest.raises(schema.QuestionError):
        schema.validate(mutated)
    assert more_less.check(mutated["payload"]) != []
    assert more_less.check(EXAMPLE["payload"]) == []


def test_direction_decides_the_answer() -> None:
    payload = copy.deepcopy(EXAMPLE["payload"])
    payload["direction"] = "less"
    assert more_less.check(payload) != []  # answer_index 0 is the dearer one
    payload["answer_index"] = 1
    assert more_less.check(payload) == []


def test_equal_values_are_inconsistent() -> None:
    payload = copy.deepcopy(EXAMPLE["payload"])
    payload["options"][1]["value"] = payload["options"][0]["value"]
    assert more_less.check(payload) != []


def test_duplicate_options_are_inconsistent() -> None:
    """Two of the same item is a generator bug; catch it at pack load, not in a room."""
    payload = copy.deepcopy(EXAMPLE["payload"])
    payload["options"][1]["subject"] = dict(payload["options"][0]["subject"])
    assert more_less.check(payload) != []


def test_wrong_id_fails_consistency_check() -> None:
    wrong = question(id="q_0000000000000000")
    assert schema.schema_errors(wrong) == []
    assert any(p.startswith("$.id") for p in schema.consistency_errors(wrong))


def test_unsupported_type_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    """A type the schema knows and this build cannot play is refused, so packs cannot ship
    one ahead of its module. Now every type in the schema file has a module, so one
    is taken out of the registry to show it."""
    monkeypatch.delitem(TYPES, "closest_number")
    q = {
        "type": "closest_number",
        "mode": "more_less",
        "source": "pack",
        "tags": [],
        "payload": {"prompt": "How many?", "answer": 3},
    }
    q["id"] = schema.content_id(q)
    assert schema.schema_errors(q) == []
    assert schema.consistency_errors(q) == ["$.type: 'closest_number' is not supported yet"]


def test_an_unknown_mode_is_reported() -> None:
    q = question(mode="zoom_quiz")
    assert schema.schema_errors(q) == []  # the schema holds a mode to a pattern, no more
    assert schema.consistency_errors(q) == [
        "$.mode: 'zoom_quiz' is not a mode this build plays"
        " (it plays more_less, price_is_right, guess_examine, sort_it_out, who_said_that,"
        " know_your_content_creator, bestiary, drop_table, odd_one_out, random_events_only,"
        " custom, random_event)"
    ]


def test_a_type_that_disagrees_with_its_mode_is_reported() -> None:
    """The other half of the pack rule: Odd One Out is multiple choice only."""
    q = question(mode="odd_one_out")
    assert schema.consistency_errors(q) == [
        "$.type: 'more_less' disagrees with its mode: 'odd_one_out' plays as 'multiple_choice'"
    ]
    with pytest.raises(schema.QuestionError, match="disagrees with its mode"):
        schema.validate(q)


def test_two_modes_may_share_a_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(MODES, "stub", Mode(id="stub", types=frozenset({"more_less"})))
    schema.validate(question(mode="stub"))


def test_a_round_of_several_types_takes_a_question_of_any_of_them(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    both = frozenset({"more_less", "multiple_choice"})
    monkeypatch.setitem(MODES, "mixed", Mode(id="mixed", types=both, seconds=Bounds(12, 5, 30)))
    schema.validate(question(mode="mixed"))
    monkeypatch.setitem(
        MODES, "mixed", Mode(id="mixed", types=frozenset({"multiple_choice", "free_text"}))
    )
    assert schema.consistency_errors(question(mode="mixed")) == [
        "$.type: 'more_less' disagrees with its mode:"
        " 'mixed' plays as 'free_text', 'multiple_choice'"
    ]


def test_any_mode_that_is_not_a_round_may_name_an_npc(monkeypatch: pytest.MonkeyPatch) -> None:
    """Events are recognised by the registry, not by the two names that ship today."""
    monkeypatch.setitem(MODES, "pool", Mode(id="pool", types=frozenset(), is_round=False))
    assert schema.event_errors(question(mode="pool", random_event="death")) == []
    (problem,) = schema.event_errors(question(mode="not_a_mode", random_event="death"))
    assert problem.startswith("$.random_event: a 'not_a_mode' question is asked by its round")


def own(**changes: Any) -> dict[str, Any]:
    """A host's question of a type an event may be."""
    return {**NPC_QUESTION, "mode": "custom", "source": "room", **changes}


def test_custom_is_the_mode_of_a_rooms_own_questions_and_nothing_else() -> None:
    """``custom`` has no type to agree with, and it is the other half of ``room``."""
    schema.validate(own())
    message = "a room's own questions, and only they, are 'custom'"
    for wrong in (question(mode="custom"), question(source="room")):
        (problem,) = schema.consistency_errors(wrong)
        assert problem.startswith("$.mode:") and message in problem


def test_validate_packs_script_fails_on_a_custom_question(tmp_path: Path) -> None:
    """A pack question filed under ``custom`` would sit in a pool no round draws from."""
    _write_pack(tmp_path / "custom.json", [question(mode="custom")])
    result = _validate_packs(tmp_path)
    assert result.returncode == 1
    assert "custom.json: questions[0] $.mode: 'custom' with source 'pack'" in result.stderr


PRICE_QUESTION: dict[str, Any] = {
    "type": "price_is_right",
    "mode": "price_is_right",
    "source": "pack",
    "tags": ["prices"],
    "payload": {
        "subject": {"name": "Armadyl chestplate", "asset": "item:11828"},
        "value": 35000000,
        "options": [35000000, 41000000, 58000000, 79000000],
        "answer_index": 0,
        "as_of": "2026-09-20",
    },
}
PRICE_QUESTION["id"] = schema.content_id(PRICE_QUESTION)


@pytest.mark.parametrize("priced", [EXAMPLE, PRICE_QUESTION], ids=["more_less", "price_is_right"])
def test_a_price_type_is_refused_as_an_event(priced: dict[str, Any]) -> None:
    """Only its own round shows the item it asks about, so as an event it would ask nothing."""
    schema.validate(priced)
    for mode, source, npc in (("custom", "room", None), ("random_event", "pack", "death")):
        event = {**priced, "mode": mode, "source": source}
        if npc is not None:
            event["random_event"] = npc
        assert schema.consistency_errors(event) == [
            f"$.type: {priced['type']!r} is not accepted in {mode!r} yet:"
            " a question of it can only be shown inside its own round"
        ]


def test_validate_packs_fails_a_price_question_in_an_npcs_file(tmp_path: Path) -> None:
    _write_npc(tmp_path, "death", [{**PRICE_QUESTION, "mode": "random_event"}])
    result = _validate_packs(tmp_path)
    assert result.returncode == 1
    assert (
        "random_events/death.json: questions[0] $.type: 'price_is_right' is not accepted in"
        " 'random_event' yet" in result.stderr
    )


def test_no_shipped_event_is_of_a_price_type() -> None:
    """The refusal broke nothing that ships: every pack still loads."""
    events = [
        q for pack in load_packs(PACKS_DIR) for q in pack.questions if not MODES[q["mode"]].is_round
    ]
    assert events
    assert {q["type"] for q in events}.isdisjoint({"more_less", "price_is_right"})


# --- the NPCs' own questions ----------------------------------------------------------

NPC_QUESTION: dict[str, Any] = {
    "type": "multiple_choice",
    "mode": "random_event",
    "source": "pack",
    "tags": ["cooking"],
    "payload": {
        "prompt": "What Cooking level do you need to cook a shark?",
        "options": ["76", "80", "85", "90"],
        "answer_index": 1,
    },
}
NPC_QUESTION["id"] = schema.content_id(NPC_QUESTION)


def _write_npc(directory: Path, npc: str, questions: list[dict[str, Any]], **extra: Any) -> Path:
    """An NPC's file, the way ``ideas/random-events.md`` has it written."""
    folder = directory / "random_events"
    folder.mkdir(exist_ok=True)
    path = folder / f"{npc}.json"
    body = {"pack": "random_events", "random_event": npc, "questions": questions, **extra}
    path.write_text(json.dumps(body))
    return path


def test_an_npcs_file_is_loaded_with_its_npc_on_every_question(tmp_path: Path) -> None:
    """The file says who asks, once; the loader stamps it on, and the id ignores it."""
    _write_pack(tmp_path / "a.json", [question()])
    _write_npc(tmp_path, "sandwich_lady", [NPC_QUESTION])
    packs = load_packs(tmp_path)
    (theirs,) = [pack for pack in packs if pack.random_event is not None]
    assert (theirs.random_event, theirs.generated_at) == ("sandwich_lady", None)
    (asked,) = theirs.questions
    assert asked == {**NPC_QUESTION, "random_event": "sandwich_lady"}
    assert schema.content_id(asked) == NPC_QUESTION["id"]
    result = _validate_packs(tmp_path)
    assert result.returncode == 0, result.stderr
    assert "random_events/sandwich_lady.json: 1 question(s) ok" in result.stdout


def test_validate_packs_fails_a_seven_option_question(tmp_path: Path) -> None:
    seven = copy.deepcopy(NPC_QUESTION)
    seven["payload"]["options"] = ["70", "76", "80", "85", "90", "94", "99"]
    seven["id"] = schema.content_id(seven)
    _write_npc(tmp_path, "sandwich_lady", [seven])
    result = _validate_packs(tmp_path)
    assert result.returncode == 1
    assert "sandwich_lady.json: questions[0] $.payload.options" in result.stderr, result.stderr


def test_validate_packs_fails_an_npcs_file_named_after_nobody_on_the_roster(
    tmp_path: Path,
) -> None:
    _write_npc(tmp_path, "rick_turpentine", [NPC_QUESTION])
    result = _validate_packs(tmp_path)
    assert result.returncode == 1
    assert (
        "random_events/rick_turpentine.json: 'rick_turpentine' is not on the roster"
        in result.stderr
    )


def test_validate_packs_fails_a_question_in_an_npcs_file_that_names_its_own_npc(
    tmp_path: Path,
) -> None:
    """Even when it names the same NPC as the file: saying it twice is how the two drift."""
    for npc in ("death", "sandwich_lady"):
        _write_npc(tmp_path, "sandwich_lady", [{**NPC_QUESTION, "random_event": npc}])
        result = _validate_packs(tmp_path)
        assert result.returncode == 1
        assert (
            "random_events/sandwich_lady.json: questions[0] $.random_event: a question in an"
            " NPC's file does not name the NPC; the file does" in result.stderr
        )


def test_validate_packs_fails_a_question_outside_the_folder_that_names_an_npc(
    tmp_path: Path,
) -> None:
    """A pack question anywhere else belongs to a round, whatever mode it claims."""
    _write_pack(tmp_path / "a.json", [question(random_event="death")])
    _write_pack(tmp_path / "b.json", [{**NPC_QUESTION, "random_event": "death"}], name="b")
    result = _validate_packs(tmp_path)
    assert result.returncode == 1
    for label in ("a.json", "b.json"):
        assert (
            f"{label}: questions[0] $.random_event: only a question in random_events/<npc>.json"
            in result.stderr
        )
    assert "FAILED: 2 problem(s)" in result.stderr


def test_validate_packs_fails_an_npcs_file_that_disagrees_with_its_name_or_mode(
    tmp_path: Path,
) -> None:
    _write_npc(tmp_path, "death", [NPC_QUESTION])
    (tmp_path / "random_events" / "death.json").write_text(
        json.dumps({"pack": "random_events", "random_event": "jane", "questions": [NPC_QUESTION]})
    )
    _write_npc(tmp_path, "bob", [{**question(), "mode": "more_less"}])
    result = _validate_packs(tmp_path)
    assert result.returncode == 1
    assert "random_events/death.json: random_event must be 'death'" in result.stderr
    assert "random_events/bob.json: questions[0] $.mode: every question in an NPC's file is" in (
        result.stderr
    )


def test_an_npcs_question_needs_its_npc_and_a_rounds_question_may_not_have_one() -> None:
    """The envelope rule behind the folder rule, which a host's question is held to too."""
    assert schema.consistency_errors(NPC_QUESTION) == [
        "$.random_event: an NPC's own question must name the NPC who asks it"
    ]
    schema.validate({**NPC_QUESTION, "random_event": "sandwich_lady"})
    (problem,) = schema.consistency_errors(question(random_event="death"))
    assert problem.startswith("$.random_event: a 'more_less' question is asked by its round")
    schema.validate(own(random_event="death"))
    assert schema.consistency_errors(own(random_event="nobody")) == [
        "$.random_event: 'nobody' is not on the roster (app/random_events.py)"
    ]
    assert schema.schema_errors(own(random_event="Death!"))


def test_the_shipped_npc_files_are_every_npcs_own() -> None:
    """Each shipped question is the ``random_event`` mode and carries its file's NPC."""
    events = [pack for pack in load_packs(PACKS_DIR) if pack.random_event is not None]
    assert events
    for pack in events:
        assert pack.path.stem == pack.random_event
        assert {(q["mode"], q["random_event"]) for q in pack.questions} == {
            ("random_event", pack.random_event)
        }


# --- content id ---------------------------------------------------------------------


def test_content_id_is_stable_across_key_order() -> None:
    """``content_id`` is stable across key order."""
    reordered = json.loads(
        json.dumps(
            {
                "payload": {
                    "as_of": "2026-09-01",
                    "answer_index": 0,
                    "options": [
                        {
                            "value": 1650000,
                            "subject": {"asset": "item:4151", "name": "Abyssal whip"},
                        },
                        {
                            "value": 60000,
                            "subject": {"asset": "item:4587", "name": "Dragon scimitar"},
                        },
                    ],
                    "direction": "more",
                    "metric": "ge_price",
                },
                "tags": ["prices"],
                "source": "pack",
                "mode": "more_less",
                "type": "more_less",
            }
        )
    )
    assert list(reordered["payload"]) != list(EXAMPLE["payload"])
    assert schema.content_id(reordered) == schema.content_id(EXAMPLE) == EXAMPLE["id"]


def test_content_id_ignores_envelope_and_tracks_type_and_payload() -> None:
    assert schema.content_id(question(tags=["other"], difficulty="hard")) == EXAMPLE["id"]
    assert schema.content_id(question(type="closest_number")) != EXAMPLE["id"]
    changed = question()
    changed["payload"]["options"][1]["value"] += 1
    assert schema.content_id(changed) != EXAMPLE["id"]


def test_content_id_ignores_mode() -> None:
    """Section 2: the same payload in two modes is the same question, and renaming a mode
    must not rewrite a pack's ids -- which is why the shipped packs took ``mode`` without
    being regenerated."""
    assert schema.content_id(question(mode="drop_table")) == EXAMPLE["id"]
    for pack in load_packs(PACKS_DIR):
        for q in pack.questions:
            assert schema.content_id({k: v for k, v in q.items() if k != "mode"}) == q["id"]


def test_content_id_follows_documented_algorithm() -> None:
    canonical = json.dumps(
        EXAMPLE["payload"], sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    digest = hashlib.sha256(("more_less\n" + canonical).encode("utf-8")).hexdigest()
    assert schema.content_id(EXAMPLE) == "q_" + digest[:16]
    assert schema.canonical_json({"b": "ü", "a": [1, {"d": 2, "c": 3}]}) == (
        '{"a":[1,{"c":3,"d":2}],"b":"ü"}'.encode()
    )


# --- more_less type module ------------------------------------------------------------


def test_registry_has_every_shipped_type() -> None:
    assert TYPES == {
        "more_less": more_less,
        "price_is_right": price_is_right,
        "pick_from_list": pick_from_list,
        "multiple_choice": multiple_choice,
        "closest_number": closest_number,
        "free_text": free_text,
        "pick_all_that_apply": pick_all_that_apply,
        "ordering": ordering,
    }
    for module in TYPES.values():
        for name in ("client_view", "reveal", "grade", "parse_value", "check"):
            assert callable(getattr(module, name))


def test_more_less_sets_its_own_pace() -> None:
    """A long round of short questions: the mode is two names and one word to read."""
    questions, seconds = questions_bounds("more_less"), seconds_bounds("more_less")
    assert (questions.default, questions.minimum, questions.maximum) == (5, 1, 30)
    assert (seconds.default, seconds.minimum, seconds.maximum) == (10, 5, 20)


def test_a_type_without_a_pace_of_its_own_gets_the_fallbacks() -> None:
    """``app/modes``: declaring neither is allowed, and unremarkable."""
    assert questions_bounds("not_a_mode") is modes.QUESTIONS
    assert seconds_bounds("not_a_mode") is modes.SECONDS


def test_client_view_has_no_answer() -> None:
    """Unit test for ``client_view`` (no ``answer_index``, and no values at all)."""
    payload = EXAMPLE["payload"]
    view = more_less.client_view(payload)
    assert "answer_index" not in view
    assert all("value" not in option for option in view["options"])
    assert [o["subject"] for o in view["options"]] == [o["subject"] for o in payload["options"]]
    assert view["metric"] == "ge_price"
    assert view["direction"] == "more"
    encoded = json.dumps(view)
    for option in payload["options"]:
        assert str(option["value"]) not in encoded
    view["options"][0]["subject"]["name"] = "changed"  # a copy, not an alias of the payload
    assert payload["options"][0]["subject"]["name"] == "Abyssal whip"


def test_reveal_has_answer_and_both_values() -> None:
    payload = EXAMPLE["payload"]
    revealed = more_less.reveal(payload)
    assert revealed["answer_index"] == 0
    assert revealed["options"] == payload["options"]
    assert revealed["direction"] == "more"


def test_grade() -> None:
    """Unit test for ``grade``: it returns credit, and ``more_less`` has no
    partial answers, so every credit is all or nothing."""
    right, wrong, odd = uuid4(), uuid4(), uuid4()
    submissions = [Submission(right, 0), Submission(wrong, 1), Submission(odd, "0")]
    credit = more_less.grade(EXAMPLE["payload"], submissions)
    assert credit == {right: 1.0, wrong: 0.0, odd: 0.0}
    # ``True == 1.0``, so the equality above would pass on the old booleans too.
    assert all(type(value) is float for value in credit.values())
    assert more_less.grade(EXAMPLE["payload"], []) == {}


@pytest.mark.parametrize(
    ("value", "ok"),
    [(0, True), (1, True), (2, False), (-1, False), ("0", False), (None, False), (0.0, False)],
)
def test_parse_value(value: Any, ok: bool) -> None:
    assert more_less.parse_value(EXAMPLE["payload"], value) == (value if ok else None)


@pytest.mark.parametrize("value", [True, False])
def test_parse_value_rejects_booleans(value: bool) -> None:
    """``bool`` is an ``int`` and ``True == 1``: ``true`` must not answer option 1."""
    assert more_less.parse_value(EXAMPLE["payload"], value) is None


# --- JSON Schema ------------------------------------------------------------------------


def test_schema_file_is_draft_2020_12_and_loads() -> None:
    loaded = schema.load_schema()
    assert loaded["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert set(loaded["$defs"]) >= {
        "more_less",
        "price_is_right",
        "multiple_choice",
        "free_text",
        "closest_number",
        "pick_from_list",
    }
    schema.validate(EXAMPLE)


def test_schema_accepts_optional_envelope_fields() -> None:
    schema.validate(
        question(difficulty="easy", author="Zezima", added_at="2026-09-01", host_only=True)
    )


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (lambda q: q.pop("tags"), "$"),
        (lambda q: q.update(id="q_xyz"), "$.id"),
        (lambda q: q.update(type="trivia"), "$.type"),
        (lambda q: q.pop("mode"), "$"),
        (lambda q: q.update(mode="Drop Table"), "$.mode"),
        (lambda q: q.update(mode="m" * 33), "$.mode"),
        (lambda q: q.update(mode=""), "$.mode"),
        (lambda q: q.update(source="wiki"), "$.source"),
        (lambda q: q.update(extra=1), "$"),
        (lambda q: q.update(tags=["Bad Tag"]), "$.tags[0]"),
        (lambda q: q.update(tags=["a", "a"]), "$.tags"),
        (lambda q: q.update(tags=[str(i) for i in range(11)]), "$.tags"),
        (lambda q: q.update(added_at="2026-13-40"), "$.added_at"),
        (lambda q: q["payload"].update(answer_index=2), "$.payload.answer_index"),
        (lambda q: q["payload"].update(direction="dearer"), "$.payload.direction"),
        (lambda q: q["payload"].update(metric="weight"), "$.payload.metric"),
        (lambda q: q["payload"].update(as_of="yesterday"), "$.payload.as_of"),
        (lambda q: q["payload"].pop("as_of"), "$.payload"),
        (lambda q: q["payload"].update(bonus=1), "$.payload"),
        (lambda q: q["payload"]["options"][0].update(value=-1), "$.payload.options[0].value"),
        (lambda q: q["payload"]["options"][0].update(value=1.5), "$.payload.options[0].value"),
        (lambda q: q["payload"]["options"].pop(), "$.payload.options"),
        (
            lambda q: q["payload"]["options"][1]["subject"].update(asset="4587"),
            "$.payload.options[1].subject.asset",
        ),
        (
            lambda q: q["payload"]["options"][1]["subject"].update(name=""),
            "$.payload.options[1].subject.name",
        ),
    ],
)
def test_schema_rejects(mutate: Any, path: str) -> None:
    q = question()
    mutate(q)
    problems = schema.schema_errors(q)
    assert problems, "expected a schema error"
    assert any(p.startswith(path + ":") for p in problems), problems


# --- pack loader -----------------------------------------------------------------------


def test_load_packs_rejects_duplicate_ids_within_a_pack(tmp_path: Path) -> None:
    _write_pack(tmp_path / "a.json", [question(), question(tags=["dup"])], name="a")
    with pytest.raises(PackError) as info:
        load_packs(tmp_path)
    assert info.value.errors == [f"a.json: questions[1] duplicate id {EXAMPLE['id']} (also at [0])"]


def test_load_packs_rejects_duplicate_ids_across_packs(tmp_path: Path) -> None:
    _write_pack(tmp_path / "a.json", [question(), variant(1)], name="a")
    _write_pack(tmp_path / "b.json", [variant(2), question()], name="b")
    with pytest.raises(PackError) as info:
        load_packs(tmp_path)
    assert info.value.errors == [f"b.json: id {EXAMPLE['id']} also appears in a.json"]


def test_load_packs_returns_every_valid_pack(tmp_path: Path) -> None:
    _write_pack(tmp_path / "a.json", [question(), variant(1)], name="a")
    _write_pack(tmp_path / "b.json", [variant(2)], name="b")
    packs = load_packs(tmp_path)
    assert [(p.name, len(p.questions), p.path.name) for p in packs] == [
        ("a", 2, "a.json"),
        ("b", 1, "b.json"),
    ]


def test_load_packs_rejects_bad_json_and_bad_shape(tmp_path: Path) -> None:
    (tmp_path / "broken.json").write_text("{")
    (tmp_path / "shape.json").write_text(json.dumps({"questions": []}))
    with pytest.raises(PackError) as info:
        load_packs(tmp_path)
    assert any(e.startswith("broken.json: not valid JSON") for e in info.value.errors)
    assert any(
        e.startswith("shape.json: pack must have exactly the keys") for e in info.value.errors
    )


def test_load_packs_missing_directory(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_packs(tmp_path / "nope")


def test_load_packs_reports_every_problem(tmp_path: Path) -> None:
    bad_schema = variant(1)
    bad_schema["tags"] = ["Bad"]
    bad_answer = variant(2)
    bad_answer["payload"]["answer_index"] = 1
    _write_pack(tmp_path / "p.json", [bad_schema, bad_answer, question()])
    with pytest.raises(PackError) as info:
        load_packs(tmp_path)
    assert [e.split(" ")[1] for e in info.value.errors] == [
        "questions[0]",
        "questions[1]",
        "questions[1]",
    ]


PACK_BODY = {"pack": "p", "generated_at": "2026-09-18T00:00:00Z", "questions": []}


@pytest.mark.parametrize(
    ("body", "error"),
    [
        ([], "p.json: pack must be a JSON object"),
        ({**PACK_BODY, "generated_at": 1}, "p.json: generated_at must be a string"),
        ({**PACK_BODY, "questions": {}}, "p.json: questions must be a list"),
        (
            {**PACK_BODY, "questions": [{**EXAMPLE, "mode": "random_event"}]},
            "p.json: questions[0] $.random_event: only a question in random_events/<npc>.json",
        ),
        ({**PACK_BODY, "questions": ["q"]}, "p.json: questions[0] $: 'q' is not of type"),
        ({**PACK_BODY, "made_by": "me"}, "p.json: pack must have exactly the keys"),
    ],
    ids=["not an object", "generated_at", "questions", "event mode", "not a question", "extra key"],
)
def test_load_packs_names_what_is_wrong_with_a_pack(tmp_path: Path, body: Any, error: str) -> None:
    (tmp_path / "p.json").write_text(json.dumps(body))
    with pytest.raises(PackError) as info:
        load_packs(tmp_path)
    (found,) = info.value.errors
    assert found.startswith(error), found


def test_a_hand_written_pack_needs_no_generated_at(tmp_path: Path) -> None:
    (tmp_path / "p.json").write_text(json.dumps({"pack": "p", "questions": [EXAMPLE]}))
    (loaded,) = load_packs(tmp_path)
    assert (loaded.generated_at, len(loaded.questions)) == (None, 1)


def _examine(prompt: str, answer_id: int, name: str) -> dict[str, Any]:
    q: dict[str, Any] = {
        "type": "pick_from_list",
        "mode": "guess_examine",
        "source": "pack",
        "tags": ["examine"],
        "payload": {
            "prompt": prompt,
            "vocab": "examines",
            "answer_id": answer_id,
            "subject": {"name": name},
        },
    }
    q["id"] = schema.content_id(q)
    return q


def test_validate_packs_fails_one_prompt_under_two_answers(tmp_path: Path) -> None:
    """Both entries would be right, and the grader accepts one of them."""
    first = _examine("The lowest maintenance pet you will ever have.", 1, "Pet rock")
    second = _examine("the lowest  maintenance pet you will ever have.", 3, "Ectophial")
    _write_pack(tmp_path / "a.json", [first])
    _write_pack(tmp_path / "b.json", [second])
    result = _validate_packs(tmp_path)
    assert result.returncode == 1
    assert (
        "b.json: questions[0] prompt 'the lowest  maintenance pet you will ever have.' is also"
        " asked in a.json questions[0], answered 1 there and 3 here; a line may have only one"
        " answer"
    ) in result.stderr


def test_one_answer_may_be_asked_in_several_lines(tmp_path: Path) -> None:
    _write_pack(
        tmp_path / "a.json",
        [_examine("One line.", 1, "Pet rock"), _examine("Another line.", 1, "Pet rock")],
    )
    assert _validate_packs(tmp_path).returncode == 0


@pytest.mark.parametrize(
    ("npc", "body", "error"),
    [
        (
            "rick_turpentine",
            {"questions": [NPC_QUESTION]},
            "'rick_turpentine' is not on the roster",
        ),
        ("death", {"random_event": "jane"}, "random_event must be 'death'"),
        (
            "death",
            {"questions": [{**NPC_QUESTION, "random_event": "death"}]},
            "questions[0] $.random_event: a question in an NPC's file does not name the NPC",
        ),
        (
            "death",
            {"questions": [{**question(), "mode": "more_less"}]},
            "questions[0] $.mode: every question in an NPC's file is 'random_event'",
        ),
    ],
    ids=["nobody on the roster", "another npc", "names its npc", "a round's mode"],
)
def test_load_packs_names_what_is_wrong_with_an_npcs_file(
    tmp_path: Path, npc: str, body: dict[str, Any], error: str
) -> None:
    _write_npc(tmp_path, npc, [])
    path = tmp_path / "random_events" / f"{npc}.json"
    path.write_text(json.dumps({**json.loads(path.read_text()), **body}))
    with pytest.raises(PackError) as info:
        load_packs(tmp_path)
    (found,) = info.value.errors
    assert found.startswith(f"random_events/{npc}.json: {error}"), found


def test_packs_are_loaded_at_startup(settings: Settings, dist: Path) -> None:
    app = create_app(settings, dist)
    with TestClient(app):
        names = {pack.name for pack in app.state.packs}
    assert "sample" in names


def test_startup_tolerates_missing_packs_dir(
    settings: Settings, dist: Path, tmp_path: Path
) -> None:
    settings = settings.model_copy(update={"packs_dir": tmp_path / "nope"})
    app = create_app(settings, dist)
    with TestClient(app):
        assert app.state.packs == []


def test_startup_fails_on_broken_pack(settings: Settings, dist: Path, tmp_path: Path) -> None:
    bad = question()
    bad["payload"]["answer"] = "higher"
    _write_pack(tmp_path / "bad.json", [bad])
    settings = settings.model_copy(update={"packs_dir": tmp_path})
    with pytest.raises(PackError):
        with TestClient(create_app(settings, dist)):
            pass
