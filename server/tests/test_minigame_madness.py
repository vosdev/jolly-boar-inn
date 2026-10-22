"""Minigame Madness: a hand-written round about the minigames, in every type it can play."""

import json
import random
from collections import Counter
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, questions_bounds
from app.questions.packs import load_packs
from app.rooms.selection import select
from app.rooms.settings import RoomSettings
from tests.packs import PACKS_DIR

MODE = "minigame_madness"
# The wiki's Minigames page, less holiday events, raids, bosses and the combat minigames.
MINIGAMES = frozenset(
    {
        "barbarian-assault",
        "brimhaven-agility-arena",
        "castle-wars",
        "fishing-trawler",
        "giants-foundry",
        "guardians-of-the-rift",
        "hallowed-sepulchre",
        "last-man-standing",
        "mage-training-arena",
        "mahogany-homes",
        "mastering-mixology",
        "nightmare-zone",
        "pest-control",
        "pyramid-plunder",
        "rogues-den",
        "shades-of-mortton",
        "soul-wars",
        "tai-bwo-wannai-cleanup",
        "temple-trekking",
        "tempoross",
        "tithe-farm",
        "trouble-brewing",
        "volcanic-mine",
        "wintertodt",
    }
)


def questions() -> list[dict[str, Any]]:
    path = REPO_ROOT / "data" / "packs" / f"{MODE}.json"
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


def test_it_plays_seven_types_and_the_pack_holds_each() -> None:
    assert MODES[MODE].types == {
        "multiple_choice",
        "free_text",
        "pick_all_that_apply",
        "ordering",
        "matching",
        "closest_number",
        "number_slider",
    }
    assert questions_bounds(MODE).default == 5
    assert {q["type"] for q in questions()} == MODES[MODE].types


def test_no_type_holds_more_than_half_the_pack() -> None:
    counts = Counter(q["type"] for q in questions())
    assert max(counts.values()) <= len(questions()) / 2, counts


def test_at_least_thirty_questions_over_at_least_twelve_minigames() -> None:
    assert len(questions()) >= 30
    assert len({tag for q in questions() for tag in q["tags"]}) >= 12


def test_no_minigame_is_tagged_on_more_than_fifteen_percent_of_the_pack() -> None:
    counts = Counter(tag for q in questions() for tag in q["tags"])
    assert max(counts.values()) <= 0.15 * len(questions()), counts.most_common(3)


@pytest.mark.parametrize("question", questions(), ids=lambda q: q["id"])
def test_a_question_is_tagged_with_its_minigames_and_links_the_wiki(
    question: dict[str, Any],
) -> None:
    assert question["source"] == "pack" and question["mode"] == MODE
    assert question["tags"] and set(question["tags"]) <= MINIGAMES
    assert question["wiki"].startswith("https://oldschool.runescape.wiki/w/")
    assert question["payload"]["explanation"].strip() != ""


@pytest.mark.parametrize(
    "question",
    [q for q in questions() if "image" in q["payload"]],
    ids=lambda q: q["id"],
)
def test_a_pictured_item_is_still_named_in_its_prompt(question: dict[str, Any]) -> None:
    payload = question["payload"]
    assert question["type"] == "multiple_choice"
    assert payload["image"].startswith("item:")
    assert payload["prompt"].startswith("Which minigame gives the ")
    assert len(payload["options"]) == 4


@pytest.mark.parametrize(
    "question",
    [q for q in questions() if q["type"] == "multiple_choice"],
    ids=lambda q: q["id"],
)
def test_no_distractor_equals_the_answer(question: dict[str, Any]) -> None:
    payload = question["payload"]
    folded = [" ".join(o.split()).casefold() for o in payload["options"]]
    assert len(set(folded)) == len(folded)


def test_a_room_with_the_round_draws_its_questions_in_every_type() -> None:
    packs = load_packs(PACKS_DIR)
    settings = RoomSettings(modes=[{"mode": MODE, "questions": questions_bounds(MODE).maximum}])
    pack_ids = {q["id"] for q in questions()}
    # A round smaller than the pack may leave a type out of one draw, but not out of ten.
    # The random events dropped into the round are not its own.
    drawn = [
        q
        for seed in range(10)
        for q in select(packs, [], settings, random.Random(seed))[0].questions
        if q["mode"] == MODE
    ]
    assert {q["id"] for q in drawn} <= pack_ids
    assert {q["type"] for q in drawn} == MODES[MODE].types
