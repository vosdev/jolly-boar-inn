"""``schema/modes.json``: the registry as data, for the client to read the rules it applies.

The client imports the file (``client/src/lib/modeRules.ts``) instead of keeping its own
lists of which modes take a quote or how a round's picture shows, so a rule changed in
``MODES`` reaches the forms in the same build. Each type's answer timing and the speed buckets
ride along, so How to play's sample questions stay open and pay as long and as much as a
room. Every field of ``Mode`` is written, not only those the client reads today, so a new
rule needs no change here. A test fails when the committed file differs from what the
registry produces.
"""

import dataclasses
import json
from typing import Any

from app.config import REPO_ROOT
from app.modes import MODES, PLANNED, UPCOMING
from app.questions.types import TYPES
from app.questions.types.timing import MIN_ANSWER
from app.rooms import scoring

MODES_PATH = REPO_ROOT / "schema" / "modes.json"
REGENERATE = "make gen-modes"


def _plain(value: Any) -> Any:
    """A registry value as JSON holds it: a set sorted, a tuple a list, a record an object."""
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {f.name: _plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, frozenset | set):
        return sorted(value)
    if isinstance(value, tuple | list):
        return [_plain(item) for item in value]
    return value


def mode_rules() -> dict[str, Any]:
    """Every mode in registry order, the upcoming rounds' suggestion rules, the planned ids,
    each type's answer timing at run pace with its floor, and the speed buckets."""
    return {
        "modes": [_plain(mode) for mode in MODES.values()],
        "upcoming": [{"id": key, "suggest": _plain(rules)} for key, rules in UPCOMING.items()],
        "planned": list(PLANNED),
        "answer": {type_id: _plain(module.ANSWER) for type_id, module in TYPES.items()},
        "min_answer": MIN_ANSWER,
        "buckets": _plain(scoring.BUCKETS),
    }


def render() -> str:
    """The rules as the committed file holds them."""
    return json.dumps(mode_rules(), indent=2, ensure_ascii=False) + "\n"
