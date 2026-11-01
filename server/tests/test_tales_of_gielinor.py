"""Tales of Gielinor: the Wise Old Man's round, which takes him off the random-event roster."""

import json
import random

from app.config import REPO_ROOT
from app.modes import MODES
from app.questions.packs import load_packs
from app.random_events import RANDOM_EVENTS
from app.rooms.selection import flatten, select
from app.rooms.settings import ModeSettings, RoomSettings
from app.suggestions import QUESTION_MODES

MODE = "tales_of_gielinor"
PACKS = REPO_ROOT / "data" / "packs"


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
    pack = json.loads((PACKS / "tales_of_gielinor.json").read_text(encoding="utf-8"))
    questions = pack["questions"]
    assert len(questions) >= 6
    assert all("intro" not in q["payload"] and "random_event" not in q for q in questions)
    assert all(q["mode"] == MODE and q["difficulty"] for q in questions)


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
