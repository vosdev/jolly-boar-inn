"""Uri's Unravelling: clues to solve by hand, with the working checked against the answers."""

import json
import random
import re
from string import ascii_lowercase as LETTERS
from typing import Any

from app.config import REPO_ROOT
from app.modes import MODES, extra_answer_seconds
from app.questions.packs import load_packs
from app.questions.types import answer_seconds
from app.random_events import RANDOM_EVENTS
from app.rooms.hold import stem_lines
from app.rooms.selection import flatten, select
from app.rooms.settings import ModeSettings, RoomSettings
from app.suggestions import QUESTION_MODES

MODE = "uris_unravelling"
PACKS = REPO_ROOT / "data" / "packs"
FOUR = {"options": ["a", "b", "c", "d"]}
CLUES = {"anagram", "cipher", "cryptic"}


def questions() -> list[dict[str, Any]]:
    return json.loads((PACKS / f"{MODE}.json").read_text(encoding="utf-8"))["questions"]


def tagged(tag: str, type_id: str = "multiple_choice") -> list[dict[str, Any]]:
    return [q for q in questions() if tag in q["tags"] and q["type"] == type_id]


def options(question: dict[str, Any]) -> tuple[str, list[str]]:
    """The right option and the decoys."""
    payload = question["payload"]
    right = payload["answer_index"]
    return payload["options"][right], [
        option for index, option in enumerate(payload["options"]) if index != right
    ]


def letters(text: str) -> str:
    return "".join(sorted(re.sub(r"[^a-z]", "", text.lower())))


def shifts(text: str) -> set[str]:
    """Every Caesar shift of ``text``, without its spaces."""
    plain = re.sub(r"[^a-z]", "", text.lower())
    return {
        "".join(LETTERS[(LETTERS.index(c) + shift) % 26] for c in plain) for shift in range(1, 26)
    }


def test_it_plays_bestiarys_types_with_time_to_work_a_clue_out() -> None:
    assert MODES[MODE].types == MODES["bestiary"].types
    assert MODES[MODE].is_round
    assert answer_seconds("multiple_choice", FOUR, "run", extra_answer_seconds(MODE)) == 23


def test_every_type_it_plays_takes_a_suggestion() -> None:
    assert QUESTION_MODES[MODE] == MODES[MODE].types


def test_the_pool_is_big_enough_to_replay_and_plays_every_type() -> None:
    pack = questions()
    assert 40 <= len(pack) <= 50
    assert {q["type"] for q in pack} == MODES[MODE].types
    assert {q["difficulty"] for q in pack} == {"easy", "medium", "hard"}
    assert all("random_event" not in q for q in pack)


def test_a_clue_is_never_typed_in_and_never_a_map_or_coordinates() -> None:
    for question in questions():
        if CLUES & set(question["tags"]) and question["type"] != "matching":
            assert question["type"] == "multiple_choice"
            assert question["payload"]["quote"]
        assert not {"map", "coordinate"} & set(question["tags"])


def test_a_clues_text_is_what_the_sheet_types() -> None:
    question = tagged("anagram")[0]
    quote = question["payload"]["quote"]
    assert stem_lines("multiple_choice", MODE, question["payload"]) == [len(quote)]


def test_every_anagram_spells_its_answer_and_no_decoy() -> None:
    assert tagged("anagram")
    for question in tagged("anagram"):
        answer, decoys = options(question)
        clue = question["payload"]["quote"]
        assert letters(clue) == letters(answer), clue
        for decoy in decoys:
            assert letters(clue) != letters(decoy), clue
            assert abs(len(letters(decoy)) - len(letters(answer))) <= 2, decoy


def test_every_cipher_shifts_to_its_answer_and_to_no_decoy() -> None:
    assert tagged("cipher")
    for question in tagged("cipher"):
        answer, decoys = options(question)
        solved = shifts(question["payload"]["quote"])
        assert re.sub(r"[^a-z]", "", answer.lower()) in solved
        assert not any(re.sub(r"[^a-z]", "", decoy.lower()) in solved for decoy in decoys)


def test_the_matching_clues_solve_to_their_own_field() -> None:
    anagram = tagged("anagram", "matching")[0]["payload"]
    for field, index in zip(anagram["fields"], anagram["answer"], strict=True):
        assert letters(field["text"]) == letters(anagram["options"][index]["text"])
    cipher = tagged("cipher", "matching")[0]["payload"]
    for field, index in zip(cipher["fields"], cipher["answer"], strict=True):
        assert re.sub(r"[^a-z]", "", cipher["options"][index]["text"].lower()) in shifts(
            field["text"]
        )


def test_uri_is_a_round_host_so_never_a_random_event() -> None:
    assert "uri" not in RANDOM_EVENTS
    packs = load_packs(PACKS)
    settings = RoomSettings(
        modes=[ModeSettings(mode=MODE, questions=8)], random_event_frequency="more"
    )
    played = [q for _, q in flatten(select(packs, (), settings, random.Random(1)))]
    assert sum(q["mode"] == MODE for q in played) == 8
