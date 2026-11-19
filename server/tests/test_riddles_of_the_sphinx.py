"""Riddles of the Sphinx: five clues, vaguest first, one a step, the answer from its own list."""

import copy
import json
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.modes import MODES, extra_answer_seconds, problems
from app.modes.mode import Mode
from app.questions import vocab
from app.questions.schema import content_id, errors
from app.questions.types import answer_seconds, pick_from_list
from app.questions.types.scoring import Steps
from app.rooms.hold import HOST_ASK, typed_lines
from tests.game_api import answer_after
from tests.test_team_scoring import points_by_name, team_table

PACK = REPO_ROOT / "data" / "packs" / "riddles_of_the_sphinx.json"


def riddles() -> list[dict[str, Any]]:
    return json.loads(PACK.read_text())["questions"]


def edited(**payload: Any) -> dict[str, Any]:
    question = copy.deepcopy(riddles()[0])
    question["payload"].update(payload)
    question["id"] = content_id(question)
    return question


def test_the_mode_steps_through_five_clues_with_its_picture_held_back() -> None:
    mode = MODES["riddles_of_the_sphinx"]
    assert mode.types == {"pick_from_list"}
    assert mode.clues == 5
    assert mode.steps == Steps(build=4, of=6)
    assert mode.picture_at_reveal


def test_a_clue_stays_ten_seconds_and_the_full_set_twenty() -> None:
    payload = riddles()[0]["payload"]
    extra = extra_answer_seconds("riddles_of_the_sphinx")
    assert answer_seconds("pick_from_list", payload, "run", extra) == 60


def test_every_question_carries_five_clues_on_the_subject_list() -> None:
    subjects = vocab.get("subjects")
    assert subjects is not None
    for question in riddles():
        payload = question["payload"]
        assert payload["vocab"] == "subjects"
        assert len(payload["clues"]) == 5
        assert payload["subject"]["name"] == subjects.name_of(payload["answer_id"])
        assert errors(question) == []


def test_the_list_holds_at_least_fifty_subjects_no_question_asks_about() -> None:
    subjects = vocab.get("subjects")
    assert subjects is not None
    asked = {question["payload"]["answer_id"] for question in riddles()}
    assert len({entry.id for entry in subjects.entries} - asked) >= 50


def test_the_open_view_carries_every_clue_and_never_the_answer() -> None:
    payload = riddles()[0]["payload"]
    view = pick_from_list.client_view(payload)
    assert view["clues"] == payload["clues"]
    assert not {"answer_id", "subject", "image"} & view.keys()


def test_the_reveal_shows_every_clue_and_the_subject() -> None:
    payload = riddles()[0]["payload"]
    shown = pick_from_list.reveal(payload)
    assert shown["clues"] == payload["clues"]
    assert shown["subject"] == payload["subject"]
    assert shown["answer_id"] == payload["answer_id"]


@pytest.mark.parametrize("count", [4, 6])
def test_a_question_without_exactly_five_clues_is_refused(count: int) -> None:
    clues = [f"Clue {n}." for n in range(count)]
    question = edited(clues=clues)
    assert errors(question)


def test_clues_belong_to_no_other_mode() -> None:
    question = copy.deepcopy(
        json.loads((PACK.parent / "pixel_hunt.json").read_text())["questions"][0]
    )
    question["payload"]["clues"] = riddles()[0]["payload"]["clues"]
    question["id"] = content_id(question)
    assert any("clues" in error for error in errors(question))


def test_a_clued_mode_needs_a_step_a_clue() -> None:
    wrong = Mode(id="x", types=frozenset({"pick_from_list"}), steps=Steps(build=3, of=6), clues=5)
    assert any("5 steps" in problem for problem in problems(wrong))


def test_the_hold_types_only_the_sphinxs_ask() -> None:
    payload = riddles()[0]["payload"]
    view = pick_from_list.client_view(payload)
    assert typed_lines("pick_from_list", "riddles_of_the_sphinx", view, False) == [HOST_ASK]


def test_an_answer_pays_the_clue_it_arrived_on(table, pictures) -> None:
    """A clue every 10 s of 60, the last for 20: 1000, 850, 700, 550, then 400."""
    names = ("Zezima", "Woox", "Lynx", "Cow31337", "Durial321", "B0aty")
    game = table(*names, modes=["riddles_of_the_sphinx"], seconds=60, close_when_all_answered=False)
    game.start()
    game.opened(0)
    timings = (0.5, 11.0, 21.0, 31.0, 41.0, 58.0)
    acks = [
        answer_after(game, seat, 0, game.right(0), seconds)
        for seat, seconds in zip(game.players, timings, strict=True)
    ]
    assert [(ack["scoring"], ack["band"]) for ack in acks] == [
        ("step", 1),
        ("step", 2),
        ("step", 3),
        ("step", 4),
        ("step", 5),
        ("step", 5),
    ]
    game.skip()
    closed = game.admin.take("question_closed")
    assert points_by_name(game, closed) == dict(
        zip(names, (1000, 850, 700, 550, 400, 400), strict=True)
    )


def test_a_team_game_keeps_the_clue_steps(table, pictures) -> None:
    game = team_table(table, "Zezima", "Woox", modes=["riddles_of_the_sphinx"], seconds=60)
    zezima, woox = game.players
    game.start()
    game.opened(0)
    first = answer_after(game, zezima, 0, game.right(0), 0.5)
    third = answer_after(game, woox, 0, game.right(0), 21.0)
    assert (first["band"], third["band"]) == (1, 3)
    game.skip()
    closed = game.admin.take("question_closed")
    assert points_by_name(game, closed) == {"Zezima": 1000, "Woox": 700}


def test_the_clues_are_open_but_the_picture_waits_for_the_close(table, pictures) -> None:
    game = table("Zezima", modes=["riddles_of_the_sphinx"], seconds=30)
    game.start()
    question = game.question(0)
    for opened in game.opened(0):
        assert opened["question"]["picture"] is None
        assert opened["question"]["view"]["clues"] == question.payload["clues"]
    game.skip()
    closed = game.admin.take("question_closed")
    assert closed["picture"] == pictures[question.payload["image"]]
    assert closed["reveal"]["clues"] == question.payload["clues"]
