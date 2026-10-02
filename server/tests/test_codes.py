"""Room codes from ``data/room-words.json``; collision retry unit-tested with a
stubbed word list (section 7: five plain tries, then two digits appended)."""

import random
import re

import pytest

from app.rooms import codes

STUB = ("Cabbage",)


def test_shipped_word_list_is_valid() -> None:
    words = codes.load_words()
    assert len(words) >= 100
    assert all(re.fullmatch(r"[A-Za-z0-9]+", w) for w in words)
    assert len({w.upper() for w in words}) == len(words)


def test_load_words_rejects_bad_files(tmp_path) -> None:
    for content in ("[]", '{"a": 1}', '["ok", "not ok"]', '["Same", "same"]'):
        path = tmp_path / "words.json"
        path.write_text(content)
        with pytest.raises(ValueError):
            codes.load_words(path)


def test_every_candidate_is_well_formed() -> None:
    words = codes.load_words()
    assert all(codes.well_formed(c) for c in codes.candidates(words, random.Random(1)))
    assert codes.well_formed("CABBAGE07")


@pytest.mark.parametrize("code", ["", "A", "X" * 35, "cabbage", "ABC-12", "ÄBC", "ABC DEF"])
def test_a_code_no_candidate_could_be_is_not_well_formed(code: str) -> None:
    assert not codes.well_formed(code)


def test_candidates_plain_then_digit_suffixed() -> None:
    got = list(codes.candidates(STUB, random.Random(1)))
    assert got[: codes.PLAIN_ATTEMPTS] == ["CABBAGE"] * codes.PLAIN_ATTEMPTS
    assert len(got) == codes.PLAIN_ATTEMPTS + codes.SUFFIXED_ATTEMPTS
    assert all(re.fullmatch(r"CABBAGE\d\d", c) for c in got[codes.PLAIN_ATTEMPTS :])


async def test_allocate_retries_on_collision_then_appends_digits() -> None:
    """Code collision retry with a stubbed word list."""
    tried: list[str] = []

    async def insert(code: str) -> bool:
        tried.append(code)
        return code != "CABBAGE"  # the plain word is always taken

    code = await codes.allocate(STUB, random.Random(2), insert)
    assert tried[:-1] == ["CABBAGE"] * codes.PLAIN_ATTEMPTS
    assert re.fullmatch(r"CABBAGE\d\d", code)
    assert tried[-1] == code


async def test_allocate_returns_first_free_code() -> None:
    async def insert(code: str) -> bool:
        return True

    assert await codes.allocate(STUB, random.Random(3), insert) == "CABBAGE"


async def test_allocate_gives_up_eventually() -> None:
    async def insert(code: str) -> bool:
        return False

    with pytest.raises(codes.CodeSpaceExhausted):
        await codes.allocate(STUB, random.Random(4), insert)
