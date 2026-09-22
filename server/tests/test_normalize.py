"""``questions/normalize.py``: when two typed answers are the same answer.

T21 Accept: case, accents, punctuation and whitespace are normalised away; an accepted
answer under four characters takes no typo, so "Jad" does not accept "Jam"; a one-character
typo on a full accepted answer is accepted and a different answer is not.
"""

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
