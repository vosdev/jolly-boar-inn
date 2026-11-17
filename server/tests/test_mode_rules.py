"""The committed ``schema/modes.json`` is what the registry produces."""

import json

from app.modes import MODES, PLANNED, UPCOMING
from app.modes.rules import MODES_PATH, REGENERATE, mode_rules, render
from app.questions.types import TYPES, scoring_of
from app.questions.types.timing import MIN_ANSWER
from app.rooms import scoring


def test_committed_mode_rules_are_current() -> None:
    assert MODES_PATH.read_text(encoding="utf-8") == render(), (
        f"{MODES_PATH.name} is stale: run `{REGENERATE}` and commit the result"
    )


def test_every_mode_is_written_whole_and_in_registry_order() -> None:
    rules = json.loads(render())
    assert [mode["id"] for mode in rules["modes"]] == list(MODES)
    assert [entry["id"] for entry in rules["upcoming"]] == list(UPCOMING)
    assert rules["planned"] == list(PLANNED)
    assert set(rules["modes"][0]) == set(MODES["more_less"].__slots__)


def test_a_rule_lands_in_the_file() -> None:
    by_id = {mode["id"]: mode for mode in mode_rules()["modes"]}
    assert by_id["pixel_hunt"]["steps"] == {"build": 17, "of": 25}
    assert by_id["uris_unravelling"]["suggest"]["quote"] is True
    assert by_id["whos_that_npc"]["suggest"]["tags"] == [
        ["pick_from_list", "shadow"],
        ["multiple_choice", "render"],
    ]


def test_the_answer_timings_and_speed_buckets_land_in_the_file(monkeypatch) -> None:
    rules = mode_rules()
    assert set(rules["answer"]) == set(TYPES)
    assert rules["answer"]["multiple_choice"] == {"base": 10, "per_item": 2}
    assert rules["min_answer"] == MIN_ANSWER
    assert rules["buckets"] == [list(edge) for edge in scoring.BUCKETS]
    monkeypatch.setattr(scoring, "BUCKETS", ((0.2, 1000), (1.0, 500)))
    assert mode_rules()["buckets"] == [[0.2, 1000], [1.0, 500]]


def test_each_type_s_scoring_lands_in_the_file() -> None:
    scorings = mode_rules()["scoring"]
    assert scorings == {type_id: str(scoring_of(type_id)) for type_id in TYPES}
    assert scorings["number_slider"] == scorings["price_is_right"] == "accuracy"
    assert scorings["more_less"] == "speed"
