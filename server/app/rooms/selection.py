"""Pick the questions for a new room. Pure and seeded, so it is testable."""

import random
from collections.abc import Sequence
from typing import Any

from app.questions.packs import Pack
from app.rooms.settings import RoomSettings


def select(
    packs: Sequence[Pack],
    custom: Sequence[dict[str, Any]],
    settings: RoomSettings,
    rng: random.Random,
) -> list[dict[str, Any]]:
    """``settings.question_count`` pack questions of the chosen modes, plus ``custom``.

    Pack questions are drawn without replacement; if the packs hold fewer than asked,
    every matching question is used. ``order == "shuffle"`` mixes custom questions in,
    ``"custom_last"`` keeps them at the end in the order given.
    """
    pool = [q for pack in packs for q in pack.questions if q["type"] in settings.modes]
    picked = rng.sample(pool, min(settings.question_count, len(pool)))
    if settings.order == "shuffle":
        questions = picked + list(custom)
        rng.shuffle(questions)
        return questions
    return picked + list(custom)
