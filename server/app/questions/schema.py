"""The canonical question schema (``schema/question.schema.json``).

``validate()`` checks a question envelope completely: JSON Schema, content id, the mode it
claims, and the type-level consistency rules (a stored ``answer`` must match the stored
facts). ``content_id()`` derives the stable id from ``type`` and ``payload``.

``mode`` is deliberately not in the id. The same payload asked in two modes is the same
question, and a mode is a name a round goes by: hashing it would make a rename rewrite
every id in the pack, and every room that stored one would stop matching the pack it came
from. ``type`` is in it because it decides what the payload means. ``random_event`` stays
out for the same reason as ``mode``: the same payload asked by two NPCs is one question.
"""

import hashlib
import json
from functools import cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

from app.modes import MODES
from app.questions import text
from app.questions.types import TYPES
from app.random_events import RANDOM_EVENTS

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schema" / "question.schema.json"


class QuestionError(ValueError):
    """A question is invalid. ``errors`` lists every problem found."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


@cache
def load_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@cache
def _validator() -> Draft202012Validator:
    schema = load_schema()
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def canonical_json(value: Any) -> bytes:
    """Sorted keys, no whitespace, UTF-8."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def content_id(question: dict[str, Any]) -> str:
    """``q_`` plus the first 16 hex chars of ``sha256(type + "\\n" + canonical_json(payload))``."""
    material = question["type"].encode("utf-8") + b"\n" + canonical_json(question["payload"])
    return "q_" + hashlib.sha256(material).hexdigest()[:16]


def schema_errors(question: Any) -> list[str]:
    """Every JSON Schema violation, as ``<json path>: <message>``."""
    found = sorted(_validator().iter_errors(question), key=lambda e: e.json_path)
    return [f"{error.json_path}: {error.message}" for error in found]


def consistency_errors(question: dict[str, Any]) -> list[str]:
    """Problems a schema cannot express: unsupported type, a mode this build does not play
    or one the type disagrees with, an NPC where none may ask, wrong id, answer vs facts.

    Assumes the envelope already passes ``schema_errors``.
    """
    module = TYPES.get(question["type"])
    if module is None:
        return [f"$.type: {question['type']!r} is not supported yet"]
    errors = mode_errors(question) + event_errors(question)
    errors += [f"$.payload.{message}" for message in module.check(question["payload"])]
    expected = content_id(question)
    if question["id"] != expected:
        errors.append(f"$.id: {question['id']} does not match content, expected {expected}")
    return errors


def mode_errors(question: dict[str, Any]) -> list[str]:
    """A ``mode`` the registry does not have, a ``type`` other than the ones it plays as, or
    more or fewer options than the round offers.

    The schema can only hold ``mode`` to a pattern, because which modes exist is the
    registry's to say. A pack question with an unknown mode would sit in a pool nobody can
    pick, and one whose type is not among its mode's would be graded as one thing inside a
    round introduced as another.

    A mode that is not a round has no types to disagree with -- its questions are events
    and each carries its own. ``custom`` is also the other half of ``source: room``: a room's own
    question is ``custom`` and nothing else is. A pack question filed under it would sit in
    a pool no round draws from, and a host's question filed under a pack mode would be
    drawn into that mode's rounds as if the packs had shipped it.

    Two types may not be events yet: the client shows what they ask about only inside
    their own round (``_ROUND_ONLY``).
    """
    mode = MODES.get(question["mode"])
    if mode is None:
        return [
            f"$.mode: {question['mode']!r} is not a mode this build plays"
            f" (it plays {', '.join(MODES)})"
        ]
    if (question["source"] == "room") != (mode.id == "custom"):
        return [
            f"$.mode: {question['mode']!r} with source {question['source']!r}:"
            " a room's own questions, and only they, are 'custom'"
        ]
    if mode.is_round and question["type"] not in mode.types:
        return [
            f"$.type: {question['type']!r} disagrees with its mode:"
            f" {mode.id!r} plays as {', '.join(map(repr, sorted(mode.types)))}"
        ]
    if mode.options is not None and question["type"] == "multiple_choice":
        least, most = mode.options
        if not least <= len(question["payload"]["options"]) <= most:
            return [f"$.payload.options: {mode.id!r} offers {least} to {most} options"]
    if not mode.is_round and question["type"] in _ROUND_ONLY:
        return [
            f"$.type: {question['type']!r} is not accepted in {mode.id!r} yet:"
            " a question of it can only be shown inside its own round"
        ]
    return []


# An event's stem is its mode's, and the event modes' stem reads only ``prompt``. As an
# event, ``price_is_right`` would never name its item, and ``more_less``, whose view is its
# whole question, would show nothing while the NPC holds it. Until each has a stem that
# works outside its round, a host or NPC pack writing one would set a question nobody can
# answer.
_ROUND_ONLY = frozenset({"more_less", "price_is_right"})


def event_errors(question: dict[str, Any]) -> list[str]:
    """A ``random_event`` where no NPC may ask, missing where one must, or off the roster.

    The field names who interrupts a round with this question, and only a question that is
    an event can say that: a host's, which may name its NPC or leave it to the draw, and an
    NPC's own, which always names it -- the pack loader stamps it on from the file. On a
    question of a round it would be a face with nothing to interrupt. An id the roster does
    not have is a face nobody can draw, and a host who typed one learns it at creation.
    """
    npc = question.get("random_event")
    if question["mode"] == "random_event" and npc is None:
        return ["$.random_event: an NPC's own question must name the NPC who asks it"]
    if npc is None:
        return []
    mode = MODES.get(question["mode"])
    if mode is None or mode.is_round:
        return [
            f"$.random_event: a {question['mode']!r} question is asked by its round,"
            " not by an NPC; only the host's questions and the NPCs' own may name one"
        ]
    if npc not in RANDOM_EVENTS:
        return [f"$.random_event: {npc!r} is not on the roster (app/random_events.py)"]
    return []


def errors(question: Any) -> list[str]:
    """Characters Postgres cannot store, else schema errors, else consistency errors.

    The characters come first because ``content_id`` cannot hash a lone surrogate.
    """
    return text.errors(question) or schema_errors(question) or consistency_errors(question)


def validate(question: Any) -> None:
    """Raise ``QuestionError`` unless ``question`` is fully valid."""
    found = errors(question)
    if found:
        raise QuestionError(found)
