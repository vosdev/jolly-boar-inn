"""The canonical question schema (``schema/question.schema.json``).

``validate()`` checks a question envelope completely: JSON Schema, content id, the mode it
claims, and the type-level consistency rules (a stored ``answer`` must match the stored
facts). ``content_id()`` derives the stable id from ``type`` and ``payload``.

``mode`` is deliberately not in the id. The same payload asked in two modes is the same
question, and a mode is a name a round goes by: hashing it would make a rename rewrite
every id in the pack, and every room that stored one would stop matching the pack it came
from. ``type`` is in it because it decides what the payload means.
"""

import hashlib
import json
from functools import cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

from app.modes import MODES
from app.questions.types import TYPES

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
    or one the type disagrees with, wrong id, answer vs facts.

    Assumes the envelope already passes ``schema_errors``.
    """
    module = TYPES.get(question["type"])
    if module is None:
        return [f"$.type: {question['type']!r} is not supported yet"]
    errors = mode_errors(question)
    errors += [f"$.payload.{message}" for message in module.check(question["payload"])]
    expected = content_id(question)
    if question["id"] != expected:
        errors.append(f"$.id: {question['id']} does not match content, expected {expected}")
    return errors


def mode_errors(question: dict[str, Any]) -> list[str]:
    """A ``mode`` the registry does not have, or a ``type`` other than the one it plays as.

    The schema can only hold ``mode`` to a pattern, because which modes exist is the
    registry's to say. A pack question with an unknown mode would sit in a pool nobody can
    pick, and one whose type disagrees with its mode's would be graded as one thing inside
    a round introduced as another.
    """
    mode = MODES.get(question["mode"])
    if mode is None:
        return [
            f"$.mode: {question['mode']!r} is not a mode this build plays"
            f" (it plays {', '.join(MODES)})"
        ]
    if question["type"] != mode.type:
        return [
            f"$.type: {question['type']!r} disagrees with its mode:"
            f" {mode.id!r} plays as {mode.type!r}"
        ]
    return []


def errors(question: Any) -> list[str]:
    """Schema errors, or if the schema is satisfied, consistency errors."""
    return schema_errors(question) or consistency_errors(question)


def validate(question: Any) -> None:
    """Raise ``QuestionError`` unless ``question`` is fully valid."""
    found = errors(question)
    if found:
        raise QuestionError(found)
