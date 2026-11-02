"""Pin on the map: the answer is one or more places on the world map, in game tiles.

Payload shape (schema ``$defs/map_pin``)::

    {"intro"?: str, "prompt": str, "image"?: asset, "explanation"?: str,
     "targets": [{"name": str, "x": int, "y": int, "radius": int}, ...],
     "bounds"?: {"min_x": int, "max_x": int, "min_y": int, "max_y": int}}

A question asks for one pin per target, so the usual question has one target and nothing here
treats it as a special case. The value is a list of ``{x, y}`` either way.

A pin earns 1.0 within its target's radius and ``exp(-outside / falloff)`` beyond it, however
far: the map is its own difficulty, and a pin in the wrong country still shows you knew it was
on land. Speed does not count (``SCORING = ACCURACY``): the time goes on finding the place.
``bounds`` shrink the map to a region and the falloff with it, so ten tiles off in a small map
costs what a hundred does on the whole world.

Pins carry no label, so they pair with targets by the assignment that scores best: a player
who found all three places is not marked down for tapping them in another order. The client
repeats this search (``pairPins`` in ``lib/map.ts``) to draw each pin's line, and does not get
the pairing from here because the room echoes what ``parse_value`` returns while the question
is open, so an order that follows the targets would say where they are.
"""

import math
from itertools import permutations
from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types.scoring import Scoring
from app.questions.types.timing import Timing

SCORING = Scoring.ACCURACY
# Finding a place takes panning and zooming, and a phone is slow at both. Each pin adds that
# again, and a reveal has more lines to read.
ANSWER = Timing(base=20, per_item=10)
REVEAL = Timing(base=8, per_item=2)

WORLD_FALLOFF = 300.0
# Against the longer side, so a region loses points as quickly as its size suggests.
REGION_FALLOFF_SHARE = 10
# What ``make gen-map`` renders; the schema holds a stored tile to the same rectangle.
SURFACE = {"min_x": 768, "max_x": 4096, "min_y": 1792, "max_y": 4352}

_OPEN_KEYS = ("intro", "prompt", "bounds")
_PIN_KEYS = {"x", "y"}


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the question, the map's region and how many pins."""
    view = {key: payload[key] for key in _OPEN_KEYS if key in payload}
    return {**view, "pins": len(payload["targets"])}


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus where everything was and why."""
    shown = {**client_view(payload), "targets": payload["targets"]}
    if "explanation" in payload:
        shown["explanation"] = payload["explanation"]
    return shown


def items(payload: dict[str, Any]) -> int:
    """Each pin is a place to find."""
    return len(payload["targets"])


def parse_value(payload: dict[str, Any], value: Any) -> list[dict[str, int]] | None:
    """One whole tile on the map per target, in the order sent; ``None`` for anything else."""
    if not isinstance(value, list) or len(value) != len(payload["targets"]):
        return None
    area = payload.get("bounds", SURFACE)
    pins = [_tile(pin, area) for pin in value]
    return None if None in pins else pins


def _tile(pin: Any, area: dict[str, int]) -> dict[str, int] | None:
    if not isinstance(pin, dict) or pin.keys() != _PIN_KEYS:
        return None
    x, y = pin["x"], pin["y"]
    # ``True == 1``, so a ``true`` would otherwise be a coordinate; see ``exact``.
    if type(x) is not int or type(y) is not int or not _inside(x, y, area):
        return None
    return {"x": x, "y": y}


def _inside(x: int, y: int, area: dict[str, int]) -> bool:
    return area["min_x"] <= x < area["max_x"] and area["min_y"] <= y < area["max_y"]


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    """Each player's pins at their best pairing, as the mean of the targets' credit."""
    falloff = _falloff(payload.get("bounds"))
    targets = payload["targets"]
    return {s.player_id: _credit(s.value, targets, falloff) for s in submissions}


def _falloff(bounds: dict[str, int] | None) -> float:
    if bounds is None:
        return WORLD_FALLOFF
    longer = max(bounds["max_x"] - bounds["min_x"], bounds["max_y"] - bounds["min_y"])
    return min(WORLD_FALLOFF, longer / REGION_FALLOFF_SHARE)


def _credit(pins: list[dict[str, int]], targets: list[dict[str, Any]], falloff: float) -> float:
    table = [[_pin_credit(pin, target, falloff) for target in targets] for pin in pins]
    best = max(
        sum(row[column] for row, column in zip(table, order, strict=True))
        for order in permutations(range(len(targets)))
    )
    return best / len(targets)


def _pin_credit(pin: dict[str, int], target: dict[str, Any], falloff: float) -> float:
    outside = math.hypot(pin["x"] - target["x"], pin["y"] - target["y"]) - target["radius"]
    return 1.0 if outside <= 0 else math.exp(-outside / falloff)


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: every target is its own place, on the map the question shows."""
    problems = []
    bounds = payload.get("bounds")
    if bounds is not None and not (
        bounds["min_x"] < bounds["max_x"] and bounds["min_y"] < bounds["max_y"]
    ):
        problems.append(f"bounds: {bounds!r} holds no tile")
    targets = payload["targets"]
    if len({(target["x"], target["y"]) for target in targets}) != len(targets):
        problems.append("targets: two share a tile, so one pin would answer both")
    if len({target["name"] for target in targets}) != len(targets):
        problems.append("targets: two share a name, so the reveal could not tell them apart")
    for target in targets:
        if bounds is not None and not _inside(target["x"], target["y"], bounds):
            problems.append(f"targets: {target['name']!r} is outside the bounds")
    return problems
