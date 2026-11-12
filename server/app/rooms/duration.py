"""How long a game takes, roughly: what Create and the lobby show as minutes.

A ceiling, not a forecast. Every question holds while it types in (``rooms/hold.py``), then
runs its full time and its reveal at the room's pace, as if nobody answered early, so a room
that closes when all have answered finishes sooner. A splash has no clock until the room is
ready, so it counts as ``SPLASH_SECONDS``.
"""

import math
from collections.abc import Iterable, Mapping, Sequence
from typing import Any, get_args

from app.modes import extra_answer_seconds
from app.questions.types import answer_seconds, reveal_seconds
from app.questions.types.timing import Pace
from app.rooms.hold import payload_hold

# The ready check's 10 s countdown plus a few seconds of players tapping ready.
SPLASH_SECONDS = 15
# Added to every reveal that names who got it wrong, at any pace: the names are a second
# thing to read after the answer.
NAMES_SECONDS = 1
PACES: tuple[str, ...] = get_args(Pace)


def question_seconds(
    type_id: str, payload: dict[str, Any], pace: str, mode: str = "", event: bool = False
) -> int:
    """One question of ``mode`` typed in, open and revealed at ``pace``."""
    return _held(type_id, payload, mode, event) + _timed(type_id, payload, pace, mode)


def _held(type_id: str, payload: dict[str, Any], mode: str, event: bool) -> int:
    """The hold before a question's answer time, in whole seconds rounded up."""
    try:
        return math.ceil(payload_hold(type_id, payload, mode, event))
    except Exception:
        # A payload this build cannot draw never opens: the loop voids it, so it holds
        # nothing, and every view that carries the estimate must not fail with it.
        return 0


def _timed(type_id: str, payload: dict[str, Any], pace: str, mode: str) -> int:
    extra = extra_answer_seconds(mode)
    return answer_seconds(type_id, payload, pace, extra) + reveal_seconds(type_id, payload, pace)


def typical_seconds(questions: Iterable[Mapping[str, Any]]) -> dict[str, float] | None:
    """The mean of ``question_seconds`` over pack questions, per pace; ``None`` for none."""
    pool = list(questions)
    if not pool:
        return None
    # The hold is the same at every pace, and the costly part to count.
    held = sum(
        _held(q["type"], q["payload"], q.get("mode", ""), q.get("random_event") is not None)
        for q in pool
    )
    return {
        pace: round(
            (held + sum(_timed(q["type"], q["payload"], pace, q.get("mode", "")) for q in pool))
            / len(pool),
            1,
        )
        for pace in PACES
    }


def game_seconds(
    questions: Sequence[tuple[str, dict[str, Any], str, bool]],
    rounds: int,
    pace: str,
    standings: int,
    names: bool = False,
) -> int:
    """``questions`` as ``(type, payload, mode, is an event)``, plus a splash per round and
    standings between them."""
    played = sum(
        question_seconds(type_id, payload, pace, mode, event) + (NAMES_SECONDS if names else 0)
        for type_id, payload, mode, event in questions
    )
    return played + SPLASH_SECONDS * rounds + standings * max(0, rounds - 1)
