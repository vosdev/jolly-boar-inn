"""How long a question holds the floor before its answers appear (architecture section 6).

The client types every line on the clue scroll in at one pace and keeps the answers back
until it is done, so the server holds the clock until then: the typing costs nobody a
point. The hold is counted from the open view, the letters the client will type, with
the client's own wording standing in for a stem's words that the view does not carry. A
count a few letters out only makes the client type a little faster or slower to fit.

The numbers are the client's (``lib/interlude.ts``, section 12 of ideas/design.md).
"""

from typing import Any

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

# The stems' own wording, in letters: "Which costs more on the Grand Exchange?" and the like.
MORE_LESS_ASK = 40
PRICE_ASK = len("What does it go for on the Grand Exchange?")
EXAMINE_ASK = len("What is this the examine of?")


def _text(view: dict[str, Any], key: str) -> str:
    value = view.get(key)
    return value if isinstance(value, str) else ""


def stem_lines(type_id: str, mode: str, view: dict[str, Any]) -> list[int]:
    """The letters of each line a question's stem types, in order."""
    prompt = _text(view, "prompt")
    if type_id == "more_less":
        return [MORE_LESS_ASK]
    if type_id == "price_is_right":
        subject = view.get("subject")
        name = subject.get("name") if isinstance(subject, dict) else None
        return ([len(name)] if isinstance(name, str) and name else []) + [PRICE_ASK]
    if mode == "guess_examine":
        return [EXAMINE_ASK, len(prompt)] if prompt else []
    quote = _text(view, "quote")
    if quote:
        return [len(prompt), len(quote)]
    return [len(prompt)] if prompt else []


def typed_lines(type_id: str, mode: str, view: dict[str, Any], event: bool) -> list[int]:
    """The letters of each line the scroll types: an event's intro and prompt, or the stem."""
    prompt = _text(view, "prompt")
    if event and prompt:
        intro = _text(view, "intro")
        return [len(intro), len(prompt)] if intro else [len(prompt)]
    return stem_lines(type_id, mode, view)


def hold_seconds(lines: list[int], event: bool) -> float:
    """Seconds from the open to the answers: the typing, a pause after each line, the settle."""
    if not lines and not event:
        return 0.0
    held = EVENT_TYPE_FROM if event else TYPE_FROM
    for letters in lines:
        reading = letters * (1 / READ_LETTERS_PER_SECOND - 1 / LETTERS_PER_SECOND)
        held += letters / LETTERS_PER_SECOND + max(PAUSE_MIN, min(PAUSE_MAX, reading))
    return round(held + SETTLE, 3)
