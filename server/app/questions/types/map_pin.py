"""Pin on the map: the answer is one or more places on the world map, in game tiles.

Payload shape (schema ``$defs/map_pin``)::

    {"intro"?: str, "prompt": str, "image"?: asset, "explanation"?: str, "reach"?: int,
     "targets": [{"name": str, "min_x": int, "max_x": int, "min_y": int, "max_y": int}, ...],
     "bounds"?: {"min_x": int, "max_x": int, "min_y": int, "max_y": int}, "view"?: <the same>,
     "screenshot"?: "screenshot:<name>", "width"?: int, "height"?: int}

A question asks for one pin per target, so the usual question has one target and nothing here
treats it as a special case. The value is a list of ``{x, y}`` either way.

A target is a box of tiles, both edges inside it, because places are not round: all of a tall
town counts and none of the land beside it does. A pin in the box earns 1.0. Outside it, credit
falls in a straight line from its edge to 0 at ``reach`` tiles, so a pin in the wrong country
scores nothing. Speed does not count (``SCORING = ACCURACY``): the time goes on finding the
place. Without a ``reach`` of its own a question takes ``WORLD_REACH``, or a fifth of its
``bounds``: a small map has fewer places to be wrong in, and each tile off is a bigger miss.

Pins carry no label, so they pair with targets by the assignment that scores best: a player
who found all three places is not marked down for tapping them in another order. The client
repeats this search (``pairPins`` in ``lib/pins.ts``) to draw each pin's line, and does not get
the pairing from here because the room echoes what ``parse_value`` returns while the question
is open, so an order that follows the targets would say where they are.

``bounds`` is where the map stops; ``view`` is only where it opens, for a place a player is
asked to find inside one they already know, and the whole map stays a pan away.

A ``screenshot`` is a photo of the place, for a round that asks where it was taken: its
``width`` and ``height`` go out open, for its shape, and the picture by its random name
(``pictured``), as ``picture_pin``'s does. Every photo is 16:9, so every card draws them alike;
``/suggest`` cuts a screenshot to it before it goes up.
"""

import math
from collections.abc import Mapping
from itertools import combinations, permutations
from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types.scoring import Scoring
from app.questions.types.timing import Timing

SCORING = Scoring.ACCURACY
GRACE = 0.0
# Finding a place takes panning and zooming, and a phone is slow at both. Each pin adds that
# again, and a reveal has more lines to read.
ANSWER = Timing(base=20, per_item=10)
REVEAL = Timing(base=8, per_item=2)

WORLD_REACH = 100
# Of the longer side, and never more than the whole map allows.
REGION_REACH_SHARE = 5
# A box any smaller is a spot no pin could be expected to hit.
LEAST_TARGET = 10
# A photo's shape, and how far off it a picture may be in pixels of height, for one shrunk to
# fit ``MAX_SIDE`` and rounded.
PHOTO_SHAPE = (16, 9)
PHOTO_SLACK = 1
# What ``make gen-map`` renders; the schema holds a stored tile to the same rectangle.
SURFACE = {"min_x": 768, "max_x": 4096, "min_y": 1792, "max_y": 4352}

_OPEN_KEYS = ("intro", "prompt", "bounds", "view", "width", "height")
_PIN_KEYS = {"x", "y"}


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the question, the map's region and opening, and
    how many pins."""
    view = {key: payload[key] for key in _OPEN_KEYS if key in payload}
    return {**view, "pins": len(payload["targets"])}


def pictured(
    view: dict[str, Any], payload: dict[str, Any], pictures: Mapping[str, str]
) -> dict[str, Any]:
    """``view`` with the photo of the place, if it has one, by its random name in the client."""
    screenshot = payload.get("screenshot")
    picture = None if screenshot is None else pictures.get(screenshot)
    return view if picture is None else {**view, "picture": picture}


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus where everything was and why."""
    shown = {**client_view(payload), "targets": payload["targets"], "reach": _reach(payload)}
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
    return None if None in pins else pins  # type: ignore[return-value]  # no None past the check


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
    reach = _reach(payload)
    targets = payload["targets"]
    return {s.player_id: _credit(s.value, targets, reach) for s in submissions}


def _reach(payload: dict[str, Any]) -> float:
    if "reach" in payload:
        return payload["reach"]
    bounds = payload.get("bounds")
    if bounds is None:
        return WORLD_REACH
    longer = max(bounds["max_x"] - bounds["min_x"], bounds["max_y"] - bounds["min_y"])
    return min(WORLD_REACH, longer / REGION_REACH_SHARE)


def _credit(pins: list[dict[str, int]], targets: list[dict[str, Any]], reach: float) -> float:
    table = [[pin_credit(pin, target, reach) for target in targets] for pin in pins]
    best = max(
        sum(row[column] for row, column in zip(table, order, strict=True))
        for order in permutations(range(len(targets)))
    )
    return best / len(targets)


def pin_credit(pin: Mapping[str, float], target: dict[str, Any], reach: float) -> float:
    """1.0 in ``target``'s box, falling in a straight line from its edge to 0 at ``reach``."""
    across = max(target["min_x"] - pin["x"], pin["x"] - target["max_x"], 0)
    up = max(target["min_y"] - pin["y"], pin["y"] - target["max_y"], 0)
    off = math.hypot(across, up)
    # A reach of 0 is all or nothing: ``picture_pin`` allows it, where a near miss is wrong.
    if reach <= 0:
        return 1.0 if off == 0 else 0.0
    return max(0.0, 1.0 - off / reach)


def photo_problem(width: int, height: int) -> str | None:
    """Why a ``width`` by ``height`` photo is not 16:9, or ``None`` when it is."""
    across, down = PHOTO_SHAPE
    if abs(width * down / across - height) <= PHOTO_SLACK:
        return None
    return f"screenshot: {width} by {height} is not {across}:{down}"


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: every target is a place of its own, on the map the question shows, and
    any photo of it is 16:9."""
    problems = []
    if "screenshot" in payload:
        shape = photo_problem(payload["width"], payload["height"])
        if shape is not None:
            problems.append(shape)
    bounds = payload.get("bounds")
    for key in ("bounds", "view"):
        area = payload.get(key)
        if area is not None and not (
            area["min_x"] < area["max_x"] and area["min_y"] < area["max_y"]
        ):
            problems.append(f"{key}: {area!r} holds no tile")
    view = payload.get("view")
    if view is not None and bounds is not None and not _within(view, bounds):
        problems.append("view: opens outside the bounds")
    targets = payload["targets"]
    if len({target["name"] for target in targets}) != len(targets):
        problems.append("targets: two share a name, so the reveal could not tell them apart")
    for target in targets:
        problems += _target_problems(target, bounds)
    for first, second in combinations(targets, 2):
        if overlap(first, second):
            problems.append(f"targets: {first['name']!r} overlaps {second['name']!r}")
    return problems


def _target_problems(target: dict[str, Any], bounds: dict[str, int] | None) -> list[str]:
    name = target["name"]
    wide = target["max_x"] - target["min_x"]
    tall = target["max_y"] - target["min_y"]
    if min(wide, tall) < LEAST_TARGET:
        return [f"targets: {name!r} is under {LEAST_TARGET} tiles across"]
    if bounds is None:
        return []
    if _within(target, bounds):
        return []
    return [f"targets: {name!r} is outside the bounds"]


def _within(box: dict[str, Any], area: dict[str, int]) -> bool:
    corners = (box["min_x"], box["min_y"]), (box["max_x"], box["max_y"])
    return all(_inside(x, y, area) for x, y in corners)


def overlap(first: dict[str, Any], second: dict[str, Any]) -> bool:
    """Whether two boxes share a tile."""
    return (
        first["min_x"] <= second["max_x"]
        and second["min_x"] <= first["max_x"]
        and first["min_y"] <= second["max_y"]
        and second["min_y"] <= first["max_y"]
    )
