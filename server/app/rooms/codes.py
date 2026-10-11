"""Room codes: a random word from ``data/room-words.json``, uppercased.

Section 7 of ideas/architecture.md: retry on a unique violation up to
``PLAIN_ATTEMPTS`` times, then append two random digits. ``allocate`` runs that loop
against an insert callback so the retry policy is testable without a database.

The uppercase code is the room's identity; ``cased`` is how it is shown, since words
run together only read as words with their capitals.
"""

import json
import random
import re
from collections.abc import Awaitable, Callable, Collection, Iterator, Sequence
from functools import cache
from pathlib import Path

from app.config import REPO_ROOT

WORDS_PATH = REPO_ROOT / "data" / "room-words.json"
PLAIN_ATTEMPTS = 5
SUFFIXED_ATTEMPTS = 20
_WORD = re.compile(r"^[A-Za-z0-9]{2,32}$")
# A word plus at most the two digits ``candidates`` appends, uppercased.
_CODE = re.compile(r"[A-Z0-9]{2,34}")


class CodeSpaceExhausted(RuntimeError):
    """Every candidate code collided. Practically unreachable with a 200-word list."""


def load_words(path: Path = WORDS_PATH) -> tuple[str, ...]:
    """The word list, validated: a non-empty JSON array of distinct alphanumeric words."""
    words = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(words, list) or not words:
        raise ValueError(f"{path}: must be a non-empty JSON array")
    bad = [w for w in words if not isinstance(w, str) or not _WORD.match(w)]
    if bad:
        raise ValueError(f"{path}: not alphanumeric words: {bad[:5]}")
    if len({w.upper() for w in words}) != len(words):
        raise ValueError(f"{path}: duplicate words (case-insensitive)")
    return tuple(words)


def well_formed(code: str) -> bool:
    """Whether ``code`` has the shape of one ``candidates`` could yield."""
    return _CODE.fullmatch(code) is not None


def drawable(code: str, words: Sequence[str]) -> bool:
    """Whether uppercase ``code`` is one ``candidates`` could draw from ``words``."""
    listed = {word.upper() for word in words}
    word, digits = code[:-2], code[-2:]
    return code in listed or (digits.isdigit() and word in listed)


@cache
def _spellings() -> dict[str, str]:
    return {word.upper(): word for word in load_words()}


def cased(code: str) -> str:
    """``code`` spelled as its word in the list, digits kept; an unlisted code as it is."""
    spellings = _spellings()
    if code in spellings:
        return spellings[code]
    word, digits = code[:-2], code[-2:]
    if digits.isdigit() and word in spellings:
        return spellings[word] + digits
    return code


def candidates(words: Sequence[str], rng: random.Random) -> Iterator[str]:
    """Codes to try, in order: plain words first, then words with two digits appended."""
    for _ in range(PLAIN_ATTEMPTS):
        yield rng.choice(words).upper()
    for _ in range(SUFFIXED_ATTEMPTS):
        yield f"{rng.choice(words).upper()}{rng.randrange(100):02d}"


def first_free(drawn: Sequence[str], taken: Collection[str]) -> str:
    """The first of ``drawn`` not in ``taken``."""
    for code in drawn:
        if code not in taken:
            return code
    raise CodeSpaceExhausted(f"no free room code after {PLAIN_ATTEMPTS + SUFFIXED_ATTEMPTS} tries")


async def allocate(
    words: Sequence[str],
    rng: random.Random,
    try_insert: Callable[[str], Awaitable[bool]],
) -> str:
    """Call ``try_insert`` with candidate codes until one is accepted, and return it."""
    for code in candidates(words, rng):
        if await try_insert(code):
            return code
    raise CodeSpaceExhausted(f"no free room code after {PLAIN_ATTEMPTS + SUFFIXED_ATTEMPTS} tries")
