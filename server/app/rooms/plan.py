"""What a lobby shows before its questions exist: a selection run dry and thrown away."""

import random
from collections.abc import Collection, Sequence
from dataclasses import dataclass

from app.modes import questions_bounds
from app.questions.packs import Pack
from app.rooms import duration, selection
from app.rooms.settings import ModeSettings, RoomSettings

# Fixed, so the same settings always read the same and editing one moves only its own part.
_SEED = 0


@dataclass(frozen=True)
class Plan:
    """The game these settings would play: its rounds, questions, events and minutes."""

    rounds: int
    total: int
    events: int
    seconds: int


def plan(
    packs: Sequence[Pack],
    settings: RoomSettings,
    pictures: Collection[str],
    rounds_offered: Sequence[str],
) -> Plan:
    """A lobby's numbers for ``settings``. A surprise counts as the shortest draw it could be."""
    if settings.surprise_modes:
        shortest = sorted(rounds_offered, key=lambda mode: questions_bounds(mode).default)
        picked = [
            ModeSettings.model_validate({"mode": mode})
            for mode in shortest[: settings.surprise_modes]
        ]
        settings = settings.model_copy(update={"modes": picked})
    rounds = selection.select(packs, (), settings, random.Random(_SEED), pictures)
    questions = [question for _, question in selection.flatten(rounds)]
    return Plan(
        rounds=len(rounds),
        total=len(questions),
        events=sum(question.get("random_event") is not None for question in questions),
        seconds=duration.game_seconds(
            [
                (q["type"], q["payload"], q["mode"], q.get("random_event") is not None)
                for q in questions
            ],
            len(rounds),
            settings.pace,
            settings.standings_seconds,
            settings.name_wrong_answers,
        ),
    )
