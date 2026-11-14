"""How long a question holds the floor before its answers appear ("Websocket protocol" in
ideas/architecture.md).

The client types the host's ask line, then every line on the clue scroll, at one pace and
keeps the answers back until it is done, so the server holds the clock until then: the
typing costs nobody a point. The hold is counted from the open view, the letters the
client will type, with the client's own wording standing in for words the view does not
carry. A count a few letters out only makes the client type a little faster or slower.

The numbers are the client's (``lib/interlude.ts``, section 12 of ideas/design.md).
"""

from typing import Any

from app.modes import Mode, entry
from app.questions.types import TYPES

# Seconds before the typing starts: a random event's NPC walks on first.
TYPE_FROM = 0.4
EVENT_TYPE_FROM = 0.9
# Seconds nothing moves before the answers appear.
SETTLE = 0.2
LETTERS_PER_SECOND = 50
# The pause after each line is what reading it still needs once typed, within these.
READ_LETTERS_PER_SECOND = 25
PAUSE_MIN = 0.5
PAUSE_MAX = 1.0

# The stem's own wording, in letters: "Which costs more on the Grand Exchange?" and the like.
MORE_LESS_ASK = 40
# The host's ask line, which the client picks: its longest, `ASK_MAX` in `lib/modes.ts`.
HOST_ASK = 50


def _text(view: dict[str, Any], key: str) -> str:
    value = view.get(key)
    return value if isinstance(value, str) else ""


def _silent(mode: Mode) -> bool:
    # A mode with no stem asks its standing question in the host's ask line alone.
    return mode.stem is None and not mode.hold_counts_prompt


def stem_lines(type_id: str, mode: str, view: dict[str, Any]) -> list[int]:
    """The letters of each line a question's stem types, in order.

    A quote's prompt and a mode's with no stem are the mode's standing question, which the
    host's ask line says, so the sheet does not type them. A board's answer may be a list, a
    line per entry. A mode this build lacks types its prompt.
    """
    prompt = _text(view, "prompt")
    if type_id == "more_less":
        return [MORE_LESS_ASK]
    if type_id == "price_is_right":
        subject = view.get("subject")
        name = subject.get("name") if isinstance(subject, dict) else None
        return [len(name)] if isinstance(name, str) and name else []
    quote = _text(view, "quote")
    if quote:
        return [len(quote)]
    found = entry(mode)
    if _silent(found):
        return []
    if found.stem == "board":
        return [len(line) for line in prompt.split("\n")]
    return [len(prompt)] if prompt else []


def typed_lines(type_id: str, mode: str, view: dict[str, Any], event: bool) -> list[int]:
    """The letters of each line typed: an event's intro and prompt, or the host's ask and stem."""
    prompt = _text(view, "prompt")
    if event and prompt:
        intro = _text(view, "intro")
        return [len(intro), len(prompt)] if intro else [len(prompt)]
    stem = stem_lines(type_id, mode, view)
    if event:
        return stem
    return [HOST_ASK, *stem] if stem or _silent(entry(mode)) else stem


def hold_seconds(lines: list[int], event: bool) -> float:
    """Seconds from the open to the answers: the typing, a pause after each line, the settle."""
    if not lines and not event:
        return 0.0
    held = EVENT_TYPE_FROM if event else TYPE_FROM
    for letters in lines:
        reading = letters * (1 / READ_LETTERS_PER_SECOND - 1 / LETTERS_PER_SECOND)
        held += letters / LETTERS_PER_SECOND + max(PAUSE_MIN, min(PAUSE_MAX, reading))
    return round(held + SETTLE, 3)


def payload_hold(type_id: str, payload: dict[str, Any], mode: str, event: bool) -> float:
    """Seconds the scroll takes to type a question in before its buttons appear."""
    view = TYPES[type_id].client_view(payload)
    return hold_seconds(typed_lines(type_id, mode, view, event), event)
