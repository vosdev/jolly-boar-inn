"""The committed ``schema/modes.json`` is what the registry produces."""

import json

from app.modes import MODES, PLANNED, UPCOMING
from app.modes.rules import MODES_PATH, REGENERATE, mode_rules, render


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
