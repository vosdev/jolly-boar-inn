"""What Postgres can store of a string that arrived as JSON.

JSON can spell U+0000 and a lone surrogate such as ``"\\ud800"``, and ``json.loads`` takes
both, but neither ``text`` nor ``jsonb`` will store them. Anything a player or host sends
that lands in a column is held to this before it gets there.
"""

from typing import Any


def unstorable(text: str) -> str | None:
    """The first character of ``text`` Postgres refuses, or ``None``."""
    for ch in text:
        if ch == "\x00" or "\ud800" <= ch <= "\udfff":
            return ch
    return None


def errors(value: Any, path: str = "$") -> list[str]:
    """Every string in a JSON value, keys included, that holds such a character."""
    found: list[str] = []
    if isinstance(value, str):
        ch = unstorable(value)
        if ch is not None:
            found.append(f"{path}: U+{ord(ch):04X} is not a character that can be stored")
    elif isinstance(value, dict):
        for key, item in value.items():
            found += errors(key, path) if isinstance(key, str) else []
            found += errors(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found += errors(item, f"{path}[{index}]")
    return found
