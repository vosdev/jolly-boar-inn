"""Pin on a picture: the answer is one spot on a screenshot, the prop in a prop hunt.

Payload shape (schema ``$defs/picture_pin``)::

    {"intro"?: str, "prompt": str, "screenshot": "screenshot:<name>",
     "width": int, "height": int, "explanation"?: str,
     "target": {"min_x": f, "max_x": f, "min_y": f, "max_y": f}, "reach": f}
    or the same with, in place of ``target`` and ``reach``,
     "grid": {"cols": int, "rows": int}, "cells": [{"col": int, "row": int}, ...]

Every position is a fraction of the picture, 0 to 1 from its top left, so a phone, a desktop and
the TV put the same answer on the same spot whatever size they draw it at. The value is one
point, ``{x, y}``. ``width`` and ``height`` are the screenshot's pixels, for its shape: the
client sizes the picture's box before the file arrives, and distance is measured on the
picture as drawn, not on the unit square, so a 16:9 screenshot grades as evenly across as down.

Free, a target is a box, and grading is ``map_pin``'s: 1.0 inside, then a straight line from its
edge to 0 at ``reach``, both in fractions of the picture's longer side. ``reach`` 0 is all or
nothing, for "which item does not belong", where next to it is plain wrong.

With a ``grid`` the picture is cells, an inventory's 4 by 7, and a tap stands for its cell: the
value is snapped to the cell's middle, and earns 1.0 on a target cell and 0 anywhere else.

The picture goes out inside the view as its random name (``pictured``), never ``screenshot``,
the asset id, which says what the picture is of.
"""

import math
from collections.abc import Mapping
from typing import Any
from uuid import UUID

from app.questions.submission import Submission
from app.questions.types import map_pin
from app.questions.types.scoring import Scoring
from app.questions.types.timing import Timing

SCORING = Scoring.ACCURACY
# One spot on a picture drawn whole: a map pin's base, with no map to pan or zoom.
ANSWER = Timing(base=20)
REVEAL = Timing(base=10)

# Of the longer side: a box any smaller is a spot no finger could be expected to hit.
LEAST_TARGET = 0.02

_OPEN_KEYS = ("intro", "prompt", "width", "height", "grid")
_POINT_KEYS = {"x", "y"}


def client_view(payload: dict[str, Any]) -> dict[str, Any]:
    """What everyone sees while it is open: the question, the picture's shape and any grid."""
    return {key: payload[key] for key in _OPEN_KEYS if key in payload}


def pictured(
    view: dict[str, Any], payload: dict[str, Any], pictures: Mapping[str, str]
) -> dict[str, Any]:
    """``view`` with the screenshot, by its random name in the client."""
    picture = pictures.get(payload["screenshot"])
    return view if picture is None else {**view, "picture": picture}


def reveal(payload: dict[str, Any]) -> dict[str, Any]:
    """Shown after close: the same, plus the target box and its reach, or the target cells."""
    shown = client_view(payload)
    for key in ("target", "reach", "cells", "explanation"):
        if key in payload:
            shown[key] = payload[key]
    return shown


def parse_value(payload: dict[str, Any], value: Any) -> dict[str, float] | None:
    """One point on the picture, both coordinates in 0..1, snapped to its cell on a grid;
    ``None`` for anything else."""
    if not isinstance(value, dict) or value.keys() != _POINT_KEYS:
        return None
    x, y = _fraction(value["x"]), _fraction(value["y"])
    if x is None or y is None:
        return None
    grid = payload.get("grid")
    if grid is None:
        return {"x": x, "y": y}
    col, row = cell_of({"x": x, "y": y}, grid)
    return {"x": (col + 0.5) / grid["cols"], "y": (row + 0.5) / grid["rows"]}


def _fraction(raw: Any) -> float | None:
    # ``True == 1``, so a ``true`` would otherwise be the picture's far edge; see ``exact``.
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return None
    if not math.isfinite(raw) or not 0 <= raw <= 1:
        return None
    return float(raw)


def cell_of(point: dict[str, float], grid: dict[str, int]) -> tuple[int, int]:
    """The ``(col, row)`` of the cell ``point`` falls in; the far edges belong to the last."""
    col = min(math.floor(point["x"] * grid["cols"]), grid["cols"] - 1)
    row = min(math.floor(point["y"] * grid["rows"]), grid["rows"] - 1)
    return col, row


def grade(payload: dict[str, Any], submissions: list[Submission]) -> dict[UUID, float]:
    """Each player's point against the target box, or 1.0 on a target cell and 0 off it."""
    return {s.player_id: _credit(payload, s.value) for s in submissions}


def _credit(payload: dict[str, Any], point: dict[str, float]) -> float:
    grid = payload.get("grid")
    if grid is not None:
        cells = {(cell["col"], cell["row"]) for cell in payload["cells"]}
        return 1.0 if cell_of(point, grid) in cells else 0.0
    across, down = _scale(payload)
    target = payload["target"]
    box = {
        "min_x": target["min_x"] * across,
        "max_x": target["max_x"] * across,
        "min_y": target["min_y"] * down,
        "max_y": target["max_y"] * down,
    }
    pin = {"x": point["x"] * across, "y": point["y"] * down}
    return map_pin.pin_credit(pin, box, payload["reach"])


def _scale(payload: dict[str, Any]) -> tuple[float, float]:
    """What a fraction of the width, and one of the height, is in fractions of the longer side."""
    longer = max(payload["width"], payload["height"])
    return payload["width"] / longer, payload["height"] / longer


def check(payload: dict[str, Any]) -> list[str]:
    """Consistency: a target box with room to hit, or target cells on the grid but not all of it."""
    grid = payload.get("grid")
    if grid is not None:
        return _cell_problems(payload["cells"], grid)
    target = payload["target"]
    if not (target["min_x"] < target["max_x"] and target["min_y"] < target["max_y"]):
        return [f"target: {target!r} holds no spot"]
    across, down = _scale(payload)
    wide = (target["max_x"] - target["min_x"]) * across
    tall = (target["max_y"] - target["min_y"]) * down
    # 0.12 - 0.10 is a hair under 0.02 in floats, and an author wrote 0.02.
    if min(wide, tall) < LEAST_TARGET - 1e-9:
        return [f"target: under {LEAST_TARGET:g} of the picture's longer side across"]
    return []


def _cell_problems(cells: list[dict[str, int]], grid: dict[str, int]) -> list[str]:
    problems = [
        f"cells: {cell!r} is off the {grid['cols']} by {grid['rows']} grid"
        for cell in cells
        if cell["col"] >= grid["cols"] or cell["row"] >= grid["rows"]
    ]
    if len({(cell["col"], cell["row"]) for cell in cells}) >= grid["cols"] * grid["rows"]:
        problems.append("cells: every cell is a target, so any tap would do")
    return problems
