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
    # A stack, not recursion: a value nested deeper than Python's recursion limit is
    # refused here like any other, rather than raising.
    stack: list[tuple[Any, str]] = [(value, path)]
    while stack:
        item, where = stack.pop()
        if isinstance(item, str):
            ch = unstorable(item)
            if ch is not None:
                found.append(f"{where}: U+{ord(ch):04X} is not a character that can be stored")
        elif isinstance(item, dict):
            for key, child in reversed(item.items()):
                stack.append((child, f"{where}.{key}"))
                if isinstance(key, str):
                    stack.append((key, where))
        elif isinstance(item, list):
            for index in range(len(item) - 1, -1, -1):
                stack.append((item[index], f"{where}[{index}]"))
    return found
