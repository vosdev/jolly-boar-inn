"""Load the shipped question packs into memory at startup.

Two kinds of file. ``data/packs/*.json`` is ``{"pack": str, "generated_at"?: str,
"questions": [Question, ...]}``, where only a generated pack carries ``generated_at``. The
NPCs' own questions are hand-written, one file per NPC in ``data/packs/random_events/``:
``{"pack": str, "random_event": str, "questions": [...]}``, where ``random_event`` is the
roster id the file is named after (``app/random_events.py``).

The file says who asks, once, so its questions do not: the loader stamps ``random_event``
onto each of them, which is what ``selection`` reads to put the right face on the event.
Three ways to get that wrong, each refused by name:

- a file in the folder named after nobody on the roster, whose questions no NPC could be
  drawn to ask;
- a question in the folder that names an NPC of its own, which would either repeat the
  file or contradict it, and nobody could tell which of the two was meant;
- a question outside the folder that names one, or claims the ``random_event`` mode: a
  pack question anywhere else belongs to a round.

Loading validates every question completely (schema, content id, consistency) and rejects
duplicate ids within and across packs, the event folder included. It also refuses one
``pick_from_list`` prompt asked twice of a vocabulary, compared folded, because a line asked
under two answers has two right entries in the list. A question with a picture is exempt:
the picture is what it asks, so "Who's that NPC?" can head every one. It also refuses a
pack whose questions disagree on ``as_of``: a price mode shows one date for its prices,
not one per question.
``random_event`` is an envelope field and stays out of the content id, so a question moved
from one NPC to another keeps its id. Any problem raises ``PackError``: the app must not
start with a broken pack, and CI runs the same check via ``scripts/validate_packs.py``.
"""

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.questions import schema
from app.questions.vocab import fold
from app.random_events import RANDOM_EVENTS

PACK_KEYS = {"pack", "questions"}
# Only a generated pack has one: a hand-edited file would carry a date nobody updates.
OPTIONAL_PACK_KEYS = {"generated_at"}
EVENT_PACK_KEYS = {"pack", "random_event", "questions"}
# The NPCs' own questions, one file each, under the packs directory.
EVENTS_DIR = "random_events"
EVENT_MODE = "random_event"


class PackError(ValueError):
    """One or more packs are invalid. ``errors`` lists every problem found."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("\n".join(errors))
        self.errors = errors


@dataclass(frozen=True, slots=True)
class Pack:
    name: str
    # ``None`` for a hand-written file.
    generated_at: str | None
    questions: tuple[dict[str, Any], ...]
    path: Path
    # The NPC who asks every question in it, for a file from ``random_events/``.
    random_event: str | None = None


def pack_errors(data: Any, label: str, npc: str | None = None) -> list[str]:
    """Every problem with one parsed pack file, each prefixed with ``label``.

    ``npc`` is the roster id an event file is named after, and ``None`` for any other
    pack. An event file's questions are checked as they will be played, with the NPC
    stamped on, so a question in it gets exactly the checks one in a round's pack does.
    """
    keys = PACK_KEYS if npc is None else EVENT_PACK_KEYS
    optional = OPTIONAL_PACK_KEYS if npc is None else set()
    if not isinstance(data, dict):
        return [f"{label}: pack must be a JSON object"]
    if not keys <= set(data) <= keys | optional or not isinstance(data["pack"], str):
        extra = f", and may have {sorted(optional)}" if optional else ""
        return [f"{label}: pack must have exactly the keys {sorted(keys)}{extra}"]
    if not isinstance(data.get("generated_at", ""), str):
        return [f"{label}: generated_at must be a string"]
    if npc is not None and data["random_event"] != npc:
        return [f"{label}: random_event must be {npc!r}, the NPC the file is named after"]
    if not isinstance(data["questions"], list):
        return [f"{label}: questions must be a list"]
    errors: list[str] = []
    seen: dict[str, int] = {}
    for index, question in enumerate(data["questions"]):
        where = f"{label}: questions[{index}]"
        misplaced = _placement_errors(question, npc)
        if misplaced:
            errors.extend(f"{where} {message}" for message in misplaced)
            continue
        errors.extend(f"{where} {message}" for message in schema.errors(_asked_by(question, npc)))
        if isinstance(question, dict) and isinstance(question.get("id"), str):
            if question["id"] in seen:
                errors.append(
                    f"{where} duplicate id {question['id']} (also at [{seen[question['id']]}])"
                )
            else:
                seen[question["id"]] = index
    return errors or _date_errors(data["questions"], label)


def _date_errors(questions: list[dict[str, Any]], label: str) -> list[str]:
    """Questions whose ``as_of`` differs from the pack's first one."""
    dated = [(i, q["payload"]["as_of"]) for i, q in enumerate(questions) if "as_of" in q["payload"]]
    if not dated:
        return []
    first, date = dated[0]
    return [
        f"{label}: questions[{index}] payload.as_of {other!r} differs from {date!r} at"
        f" [{first}]; a pack's prices are all from one day"
        for index, other in dated
        if other != date
    ]


def _placement_errors(question: Any, npc: str | None) -> list[str]:
    """Whether a question sits in the right kind of file. See the module docstring."""
    if not isinstance(question, dict):
        return []  # the schema's own "is not of type 'object'" says it better
    if npc is not None:
        if "random_event" in question:
            return [
                "$.random_event: a question in an NPC's file does not name the NPC; the file does"
            ]
        if question.get("mode") != EVENT_MODE:
            return [f"$.mode: every question in an NPC's file is {EVENT_MODE!r}"]
        return []
    if "random_event" in question or question.get("mode") == EVENT_MODE:
        return [
            f"$.random_event: only a question in {EVENTS_DIR}/<npc>.json is an NPC's own,"
            " and its file names the NPC"
        ]
    return []


def _asked_by(question: Any, npc: str | None) -> Any:
    return {**question, "random_event": npc} if npc is not None else question


def _repeated_prompts(
    questions: list[dict[str, Any]], label: str, seen: dict[tuple[str, str], tuple[int, str]]
) -> list[str]:
    """``pick_from_list`` prompts already asked of the same vocabulary, recorded in ``seen``."""
    errors: list[str] = []
    for index, question in enumerate(questions):
        if question["type"] != "pick_from_list" or "image" in question["payload"]:
            continue
        payload = question["payload"]
        key = (payload["vocab"], fold(" ".join(payload["prompt"].split())))
        if key in seen:
            answer, where = seen[key]
            errors.append(
                f"{label}: questions[{index}] prompt {payload['prompt']!r} is also asked in"
                f" {where}, answered {answer} there and {payload['answer_id']} here; a line"
                " may have only one answer"
            )
        else:
            seen[key] = (payload["answer_id"], f"{label} questions[{index}]")
    return errors


def mode_questions(packs: Iterable[Pack], mode: str) -> list[dict[str, Any]]:
    """Every pack question of ``mode``, in pack order, answers included."""
    return [question for pack in packs for question in pack.questions if question["mode"] == mode]


def load_packs(directory: Path) -> list[Pack]:
    """Load every ``*.json`` in ``directory`` and in its ``random_events/``.

    Raises ``PackError`` if anything is wrong, and ``FileNotFoundError`` if ``directory``
    is missing. The event folder may be missing: a build with no NPC questions yet still
    plays, and its events are only ever the host's.
    """
    directory = Path(directory)
    if not directory.is_dir():
        raise FileNotFoundError(f"packs directory {directory} does not exist")
    files: list[tuple[Path, str | None]] = [(p, None) for p in sorted(directory.glob("*.json"))]
    files += [(p, p.stem) for p in sorted((directory / EVENTS_DIR).glob("*.json"))]
    packs: list[Pack] = []
    errors: list[str] = []
    seen: dict[str, str] = {}
    prompts: dict[tuple[str, str], tuple[int, str]] = {}
    for path, npc in files:
        label = path.name if npc is None else f"{EVENTS_DIR}/{path.name}"
        if npc is not None and npc not in RANDOM_EVENTS:
            errors.append(
                f"{label}: {npc!r} is not on the roster (app/random_events.py); an NPC's"
                " file is named after its id"
            )
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{label}: not valid JSON: {exc}")
            continue
        found = pack_errors(data, label, npc)
        if found:
            errors.extend(found)
            continue
        for question in data["questions"]:
            if question["id"] in seen:
                errors.append(
                    f"{label}: id {question['id']} also appears in {seen[question['id']]}"
                )
            seen[question["id"]] = label
        errors.extend(_repeated_prompts(data["questions"], label, prompts))
        packs.append(
            Pack(
                name=data["pack"],
                generated_at=data.get("generated_at"),
                questions=tuple(_asked_by(q, npc) for q in data["questions"]),
                path=path,
                random_event=npc,
            )
        )
    if errors:
        raise PackError(errors)
    return packs
