"""Pick the questions for a new room, in rounds. Pure and seeded, so it is testable."""

import random
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from app.questions.packs import Pack
from app.rooms.settings import RoomSettings


@dataclass(frozen=True, slots=True)
class Round:
    """One block of questions, all of one mode, introduced by its own splash."""

    mode: str
    questions: list[dict[str, Any]]


def select(
    packs: Sequence[Pack],
    custom: Sequence[dict[str, Any]],
    settings: RoomSettings,
    rng: random.Random,
) -> list[Round]:
    """The room's rounds: one per mode picked, as long as that mode asked to be.

    A mode is a round. Six modes are six rounds, one mode is one round, and how many
    questions each holds is that mode's own ``questions`` setting -- so the quick modes
    can run long and the slow ones short in the same game.

    ``settings.mode_order`` decides the running order: ``"listed"`` plays the rounds in
    the order the host arranged the modes in, ``"random"`` shuffles them once, here, at
    creation. Either way the order is fixed before the first question is stored, because
    the stored questions *are* the running order.

    Pack questions are drawn without replacement from a pool per mode, so no question
    appears twice in a room. A mode whose pool runs dry gives a short round, or none at
    all -- an empty round is dropped rather than played, because a splash for a round
    with no questions is a screen that introduces nothing.

    ``settings.order`` decides only where the room's own questions go. ``"custom_last"``
    gives them trailing rounds of their own; ``"shuffle"`` mixes each into the round of
    its own mode where there is one, and gives the rest trailing rounds. Either way a
    custom question never splits a round, which is what lets the round a question belongs
    to be the record of what a room is playing.
    """
    pools = {
        entry.mode: [q for pack in packs for q in pack.questions if q["type"] == entry.mode]
        for entry in settings.modes
    }
    for pool in pools.values():
        rng.shuffle(pool)
    order = list(settings.modes)
    if settings.mode_order == "random":
        rng.shuffle(order)

    rounds: list[Round] = []
    for entry in order:
        pool = pools[entry.mode]
        take = min(entry.questions, len(pool))
        if take <= 0:
            continue  # this mode has nothing to play; a round with no questions is not a round
        rounds.append(Round(mode=entry.mode, questions=[pool.pop() for _ in range(take)]))

    return _with_custom(rounds, list(custom), settings, rng)


def _with_custom(
    rounds: list[Round],
    custom: list[dict[str, Any]],
    settings: RoomSettings,
    rng: random.Random,
) -> list[Round]:
    """Place the room's own questions, per ``settings.order``. See ``select``."""
    if not custom:
        return rounds
    leftover: list[dict[str, Any]] = []
    for question in custom:
        home = (
            next((r for r in rounds if r.mode == question["type"]), None)
            if settings.order == "shuffle"
            else None
        )
        if home is None:
            leftover.append(question)
            continue
        home.questions.insert(rng.randrange(len(home.questions) + 1), question)
    # Whatever is left trails the game in the order given, grouped by mode first and then
    # split into rounds as long as that mode's rounds are, so every round is still one
    # mode and the splash and the progress counter read the same everywhere.
    by_mode: dict[str, list[dict[str, Any]]] = {}
    for question in leftover:
        by_mode.setdefault(question["type"], []).append(question)
    for mode, block in by_mode.items():
        per_round = max(1, settings.questions_for(mode))
        for start in range(0, len(block), per_round):
            rounds.append(Round(mode=mode, questions=block[start : start + per_round]))
    return rounds


def flatten(rounds: Sequence[Round]) -> list[tuple[int, dict[str, Any]]]:
    """``(round number, question)`` in play order, which is the order they are stored in."""
    return [(number, q) for number, round_ in enumerate(rounds) for q in round_.questions]
