"""``GET /api/question-counts``: how many questions this instance can draw, per round and per NPC.

The footer adds them up and its sheet lists them. A question counts once, where it is
drawn from, so the same pool as the daily set's (``daily.candidates``): an offered round's
own questions, never a round that borrows another's pool, and the NPCs' by who asks them,
never one whose questions repeat a round's pictures (``BUILT_UP``).
"""

from collections import Counter
from collections.abc import Collection, Iterable
from typing import Any

from fastapi import APIRouter, Request

from app.config import Settings
from app.daily import candidates
from app.modes import MODES
from app.questions.packs import EVENT_MODE, Pack
from app.random_events import BUILT_UP, RANDOM_EVENTS

router = APIRouter(prefix="/api/question-counts")


def counts(packs: Iterable[Pack], settings: Settings, pictures: Collection[str]) -> dict[str, Any]:
    """Drawable questions by round mode and by NPC, in registry and roster order."""
    pool = candidates(packs, settings, pictures)
    modes = Counter(q["mode"] for q in pool if q["mode"] != EVENT_MODE)
    npcs = Counter(q["random_event"] for q in pool if q["mode"] == EVENT_MODE)
    return {
        "modes": {mode: modes[mode] for mode in MODES if modes[mode]},
        "random_events": {
            npc: npcs[npc] for npc in RANDOM_EVENTS if npcs[npc] and npc not in BUILT_UP
        },
    }


@router.get("")
def get_counts(request: Request) -> dict[str, Any]:
    state = request.app.state
    # Without its lifespan the app has no rooms, and so no pictures.
    pictures = {} if state.rooms is None else state.rooms.pictures
    return counts(state.packs, state.settings, pictures)
