"""Tales of Gielinor: the Wise Old Man's round, which takes him off the random-event roster."""

import json
import random
import re
from typing import Any

from app.config import REPO_ROOT
from app.modes import MODES
from app.questions.packs import load_packs
from app.random_events import RANDOM_EVENTS
from app.rooms.selection import flatten, select
from app.rooms.settings import ModeSettings, RoomSettings
from app.suggestions import QUESTION_MODES

MODE = "tales_of_gielinor"
PACKS = REPO_ROOT / "data" / "packs"
# Asks the year the game is set in, not when anything was released.
FIFTH_AGE_YEAR = "q_193dd364522d9bb4"


def pack_questions() -> list[dict[str, Any]]:
    """The round's pack as written."""
    pack = json.loads((PACKS / "tales_of_gielinor.json").read_text(encoding="utf-8"))
    return pack["questions"]


def test_it_plays_five_questions_of_bestiarys_types_by_default() -> None:
    assert MODES[MODE].types == MODES["bestiary"].types
    assert MODES[MODE].is_round
    assert MODES[MODE].questions is None


def test_every_type_it_plays_takes_a_suggestion() -> None:
    assert QUESTION_MODES[MODE] == MODES[MODE].types


def test_a_round_host_is_not_on_the_roster() -> None:
    assert "wise_old_man" not in RANDOM_EVENTS
    assert not (PACKS / "random_events" / "wise_old_man.json").exists()


def test_the_wise_old_mans_questions_are_the_rounds() -> None:
    questions = pack_questions()
    assert len(questions) >= 6
    assert all("intro" not in q["payload"] and "random_event" not in q for q in questions)
    assert all(q["mode"] == MODE and q["difficulty"] for q in questions)


def test_a_five_question_round_rarely_repeats() -> None:
    assert len(pack_questions()) >= 30


def test_it_plays_all_of_its_types() -> None:
    assert {q["type"] for q in pack_questions()} == MODES[MODE].types


def test_no_question_asks_when_something_came_out() -> None:
    assert not [
        q["payload"]["prompt"]
        for q in pack_questions()
        if re.search(r"releas|came out|what year|which year", q["payload"]["prompt"], re.I)
        and q["id"] != FIFTH_AGE_YEAR
    ]


def test_a_room_with_the_round_never_draws_him_as_an_event() -> None:
    packs = load_packs(PACKS)
    settings = RoomSettings(
        modes=[ModeSettings(mode=MODE, questions=6)],
        random_event_frequency="more",
    )
    for seed in range(50):
        rounds = select(packs, (), settings, random.Random(seed))
        played = [question for _, question in flatten(rounds)]
        assert len({question["id"] for question in played}) == len(played)
        assert sum(q["mode"] == MODE for q in played) == 6
        assert {q["random_event"] for q in played if "random_event" in q} <= set(RANDOM_EVENTS)
