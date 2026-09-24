"""``questions/normalize.py``: when two typed answers are the same answer.

T21 Accept: case, accents, punctuation and whitespace are normalised away; an accepted
answer under four characters takes no typo, so "Jad" does not accept "Jam"; a one-character
typo on a full accepted answer is accepted and a different answer is not.
"""

import random
import time
from typing import SupportsIndex

import pytest

from app.questions.normalize import SHORT, accepts, distance, normalize


def test_case_does_not_matter() -> None:
    assert normalize("ZeZiMa") == normalize("zezima") == "zezima"


def test_one_accent_has_one_spelling() -> None:
    """NFKC: the decomposed é a phone may send is the composed one a keyboard types."""
    composed, decomposed = "Zézima", "Zézima"
    assert composed != decomposed
    assert normalize(composed) == normalize(decomposed) == "zézima"
    assert normalize("Ｚezima") == "zezima"  # a full-width Z is a Z


def test_a_missing_accent_is_one_typo() -> None:
    """Accents are not stripped; leaving one off is an edit, and the allowance covers it."""
    assert normalize("Zezima") != normalize("Zézima")
    assert accepts("Zezima", ["Zézima"], max_distance=1)
    assert not accepts("Zezima", ["Zézima"], max_distance=0)


def test_punctuation_is_taken_out() -> None:
    assert normalize("K'ril Tsutsaroth") == normalize("Kril Tsutsaroth") == "kril tsutsaroth"
    assert normalize("Zulrah!") == "zulrah"
    assert normalize("TzTok-Jad") == "tztokjad"
    assert normalize("“Vet’ion”") == "vetion"  # curly quotes are punctuation too


def test_whitespace_is_trimmed_and_collapsed() -> None:
    assert normalize("  Dagannoth \t  Rex\n") == "dagannoth rex"


def test_an_answer_under_four_characters_takes_no_typo() -> None:
    """One edit on three letters is a different word: "Jad" does not accept "Jam"."""
    assert SHORT == 4
    assert not accepts("Jam", ["Jad"], max_distance=1)
    assert not accepts("Jam", ["Jad"], max_distance=2)
    assert accepts(" JAD! ", ["Jad"], max_distance=1)
    # The length that counts is the accepted answer's, after normalising it.
    assert not accepts("Ja", ["J.a.d"], max_distance=1)
    assert accepts("Zulk", ["Zulr"], max_distance=1)  # four is long enough


@pytest.mark.parametrize(
    "typo",
    ["Zulrak", "Zullrah", "Zulah", "zulrah the snak", "Zulrah the  Snake!"],
)
def test_a_one_character_typo_on_a_full_answer_is_accepted(typo: str) -> None:
    accepted = ["Zulrah", "Zulrah the snake"]
    assert accepts(typo, accepted, max_distance=1)


def test_a_different_answer_is_not() -> None:
    assert not accepts("Vorkath", ["Zulrah"], max_distance=1)
    assert not accepts("Zulrak", ["Zulrah"], max_distance=0)
    assert not accepts("Zelrek", ["Zulrah"], max_distance=2)  # three edits


def test_nothing_is_never_an_answer() -> None:
    assert not accepts("!!!", ["?!"], max_distance=2)
    assert not accepts("   ", ["Zulrah"], max_distance=2)


def test_any_accepted_spelling_will_do() -> None:
    assert accepts("dds", ["Dragon dagger (p++)", "DDS"], max_distance=1)


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [("", "", 0), ("", "jad", 3), ("kitten", "sitting", 3), ("zulrah", "zulrah", 0)],
)
def test_distance_is_levenshtein(a: str, b: str, expected: int) -> None:
    assert distance(a, b) == distance(b, a) == expected


@pytest.mark.parametrize(
    ("a", "b", "limit", "expected"),
    [
        ("kitten", "sitting", 3, 3),
        ("kitten", "sitting", 2, 3),
        ("kitten", "sitting", 0, 1),
        ("zulrah", "zulrah", 0, 0),
        ("abcdef", "uvwxyz", 2, 3),
        ("jad", "", 1, 2),
        ("x" * 50 + "a", "x" * 50 + "b", 1, 1),
    ],
)
def test_a_limited_distance_stops_one_past_its_limit(
    a: str, b: str, limit: int, expected: int
) -> None:
    assert distance(a, b, limit) == distance(b, a, limit) == expected


def test_a_limited_distance_agrees_with_the_full_one_up_to_its_limit() -> None:
    rng = random.Random(1)
    for _ in range(5000):
        a, b = ("".join(rng.choices("ab", k=rng.randint(0, 9))) for _ in range(2))
        limit = rng.randint(0, 4)
        assert distance(a, b, limit) == min(distance(a, b), limit + 1), (a, b, limit)


def graded_in(answer: str, accepted: list[str], max_distance: int) -> float:
    """Seconds one ``accepts`` takes: grading runs on the event loop every room shares."""
    start = time.perf_counter()
    accepts(answer, accepted, max_distance)
    return time.perf_counter() - start


def test_an_answer_nfkc_blows_up_grades_in_under_10_ms() -> None:
    """U+FDFA is one character that NFKC makes eighteen, so 80 of them become 1,440."""
    bloated = "ﷺ" * 80
    worst = [f"{'x' * 78}{index:02}" for index in range(20)]
    assert graded_in(bloated, worst, 2) < 0.010
    assert graded_in("ﷻ" * 80, ["ﷺ" * 79] * 20, 2) < 0.010


class Counted(str):
    """A string that counts how often one of its characters is read."""

    reads = 0

    def __getitem__(self, index: SupportsIndex | slice) -> str:
        Counted.reads += 1
        return super().__getitem__(index)


def test_a_limited_distance_only_looks_near_the_diagonal() -> None:
    """Strings of one length cannot be skipped, so the band is what keeps them cheap.

    Counted rather than timed, so a slow machine cannot fail it: a full table would read
    a million characters here, the band about six thousand.
    """
    long = "a" * 1_000
    Counted.reads = 0
    assert distance(Counted(long), Counted("b" + long[1:]), 2) == 1
    assert 0 < Counted.reads <= 2 * len(long) * (2 * 2 + 1)
