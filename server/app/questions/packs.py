"""Load the shipped question packs (``data/packs/*.json``) into memory at startup.

A pack file is ``{"pack": str, "generated_at": str, "questions": [Question, ...]}``.
Loading validates every question completely (schema, content id, consistency) and
rejects duplicate ids within and across packs. Any problem raises ``PackError``: the app
must not start with a broken pack, and CI runs the same check via
``scripts/validate_packs.py``.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.questions import schema

PACK_KEYS = {"pack", "generated_at", "questions"}


class PackError(ValueError):
    """One or more packs are invalid. ``errors`` lists every problem found."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("\n".join(errors))
        self.errors = errors


@dataclass(frozen=True, slots=True)
class Pack:
    name: str
    generated_at: str
    questions: tuple[dict[str, Any], ...]
    path: Path


def pack_errors(data: Any, label: str) -> list[str]:
    """Every problem with one parsed pack file, each prefixed with ``label``."""
    if not isinstance(data, dict):
        return [f"{label}: pack must be a JSON object"]
    if set(data) != PACK_KEYS or not isinstance(data["pack"], str):
        return [f"{label}: pack must have exactly the keys {sorted(PACK_KEYS)}"]
    if not isinstance(data["generated_at"], str):
        return [f"{label}: generated_at must be a string"]
    if not isinstance(data["questions"], list):
        return [f"{label}: questions must be a list"]
    errors: list[str] = []
    seen: dict[str, int] = {}
    for index, question in enumerate(data["questions"]):
        where = f"{label}: questions[{index}]"
        errors.extend(f"{where} {message}" for message in schema.errors(question))
        if isinstance(question, dict) and isinstance(question.get("id"), str):
            if question["id"] in seen:
                errors.append(
                    f"{where} duplicate id {question['id']} (also at [{seen[question['id']]}])"
                )
            else:
                seen[question["id"]] = index
    return errors


def load_packs(directory: Path) -> list[Pack]:
    """Load every ``*.json`` in ``directory``. Raises ``PackError`` if anything is wrong."""
    directory = Path(directory)
    if not directory.is_dir():
        raise FileNotFoundError(f"packs directory {directory} does not exist")
    packs: list[Pack] = []
    errors: list[str] = []
    seen: dict[str, str] = {}
    for path in sorted(directory.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{path.name}: not valid JSON: {exc}")
            continue
        found = pack_errors(data, path.name)
        if found:
            errors.extend(found)
            continue
        for question in data["questions"]:
            if question["id"] in seen:
                errors.append(
                    f"{path.name}: id {question['id']} also appears in {seen[question['id']]}"
                )
            seen[question["id"]] = path.name
        packs.append(
            Pack(
                name=data["pack"],
                generated_at=data["generated_at"],
                questions=tuple(data["questions"]),
                path=path,
            )
        )
    if errors:
        raise PackError(errors)
    return packs
