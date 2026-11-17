"""Both sliders pay on closeness alone: ``1000 x credit`` at any second, and no speed band."""

from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI

from app.questions.submission import Submission
from app.questions.types import TYPES, scoring_of, slider
from app.questions.types.scoring import Scoring
from tests.answers import right_value, wrong_value
from tests.conftest import stub_mode
from tests.game_api import AFTER, Game, answer_after

SLIDERS = ("number_slider", "price_is_right")
SECONDS = 10


def credit_of(type_id: str, payload: dict[str, Any], guess: int) -> float:
    """What the type's own ``grade`` gives ``guess``."""
    submission = Submission(uuid4(), guess)
    return TYPES[type_id].grade(payload, [submission])[submission.player_id]


def partial(type_id: str, payload: dict[str, Any]) -> tuple[int, float]:
    """A guess on the track between the answer and the far end, with credit strictly between
    0 and 1, and that credit."""
    right, far = right_value(type_id, payload), wrong_value(type_id, payload)
    for k in range(1, 50):
        near = round(right + (far - right) * k / 50)
        if payload.get("scale", slider.LOG) == slider.LOG:
            near = slider.round_sig(near, slider.FIGURES)
        if TYPES[type_id].parse_value(payload, near) is None:
            continue
        credit = credit_of(type_id, payload, near)
        if 0 < credit < 1:
            return near, credit
    raise AssertionError(f"no partial guess on {payload}")


@pytest.fixture(params=SLIDERS)
def slider_round(request: pytest.FixtureRequest, app: FastAPI) -> Iterator[str]:
    """A round of one slider type, each type in turn."""
    yield from stub_mode(app, f"{request.param}_round", request.param)


def slider_game(table: Any, slider_round: str, *names: str) -> Game:
    game = table(
        *names,
        modes=[slider_round],
        questions=1,
        seconds=SECONDS,
        close_when_all_answered=False,
    )
    game.start()
    game.opened(0)
    return game


def close(game: Game) -> dict[str, int]:
    game.skip()
    closed = game.admin.take("question_closed")
    by_name = {seat.id: seat.name for seat in game.seats}
    return {by_name[pid]: row["points"] for pid, row in closed["results"].items()}


@pytest.mark.parametrize("type_id", SLIDERS)
def test_the_type_is_scored_on_accuracy(type_id: str) -> None:
    assert scoring_of(type_id) is Scoring.ACCURACY


def test_an_exact_answer_in_the_last_second_pays_1000(table, slider_round: str) -> None:
    game = slider_game(table, slider_round, "Zezima")
    (zezima,) = game.players
    answer_after(game, zezima, 0, game.right(0), SECONDS - 0.5)
    assert close(game) == {"Zezima": 1000}


def test_a_partial_answer_pays_its_share_of_1000_at_any_second(table, slider_round: str) -> None:
    game = slider_game(table, slider_round, "Zezima", "Woox")
    zezima, woox = game.players
    question = game.question(0)
    guess, credit = partial(question.type, question.payload)
    answer_after(game, zezima, 0, guess, AFTER[1])
    answer_after(game, woox, 0, guess, AFTER[5])
    assert close(game) == {"Zezima": round(1000 * credit), "Woox": round(1000 * credit)}


def test_the_ack_carries_accuracy_and_no_band(table, slider_round: str) -> None:
    game = slider_game(table, slider_round, "Zezima", "Woox")
    zezima, woox = game.players
    for seat, seconds in ((zezima, AFTER[1]), (woox, AFTER[5])):
        ack = answer_after(game, seat, 0, game.right(0), seconds)
        assert (ack["scoring"], ack["band"]) == ("accuracy", None)
