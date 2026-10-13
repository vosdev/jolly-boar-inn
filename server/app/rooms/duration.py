"""How long a game takes, roughly: what Create and the lobby show as minutes.

A ceiling, not a forecast. Every question runs its full time and its reveal at the room's
pace, as if nobody answered early, so a room that closes when all have answered finishes
sooner. A splash has no clock until the room is ready, so it counts as ``SPLASH_SECONDS``.
"""

from collections.abc import Iterable, Mapping, Sequence
from typing import Any, get_args

from app.questions.types import answer_seconds, reveal_seconds
from app.questions.types.timing import Pace

# The ready check's 10 s countdown plus a few seconds of players tapping ready.
SPLASH_SECONDS = 15
# Added to every reveal that names who got it wrong, at any pace: the names are a second
# thing to read after the answer.
NAMES_SECONDS = 1
PACES: tuple[str, ...] = get_args(Pace)


def question_seconds(type_id: str, payload: dict[str, Any], pace: str) -> int:
    """One question open and revealed at ``pace``."""
    return answer_seconds(type_id, payload, pace) + reveal_seconds(type_id, payload, pace)


def typical_seconds(questions: Iterable[Mapping[str, Any]]) -> dict[str, float] | None:
    """The mean of ``question_seconds`` over pack questions, per pace; ``None`` for none."""
    pool = list(questions)
    if not pool:
        return None
    return {
        pace: round(
            sum(question_seconds(q["type"], q["payload"], pace) for q in pool) / len(pool), 1
        )
        for pace in PACES
    }


def game_seconds(
    questions: Sequence[tuple[str, dict[str, Any]]],
    rounds: int,
    pace: str,
    standings: int,
    names: bool = False,
) -> int:
    """``questions`` as ``(type, payload)``, plus a splash per round and standings between them."""
    played = sum(
        question_seconds(type_id, payload, pace) + (NAMES_SECONDS if names else 0)
        for type_id, payload in questions
    )
    return played + SPLASH_SECONDS * rounds + standings * max(0, rounds - 1)
