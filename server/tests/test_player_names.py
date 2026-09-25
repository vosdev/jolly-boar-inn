"""D3 Accept: names, the profile, and the popup that stands in front of Create and Join.

Like ``test_app_shell.py``, there is no browser here, so what a test can hold is what the
criteria are made of: a corpus the server will accept every name from, a generator
bounded the way the server is, and the screens wired to the profile rather than to an
empty field.

What a browser confirmed, and a test here cannot: a first-time browser meets the popup on
Create and on Join and gets past it in one tap; a returning browser goes Home to the lobby
in two; the re-roll keeps focus in the field; two browsers with the same stored name both
join one room and come out with different names; with ``localStorage`` throwing, the popup
comes back on each visit and the app still plays.
"""

import json
import re
from pathlib import Path

import pytest

from app.config import REPO_ROOT
from app.rooms.state import NAME_MAX, BadName, normalize_name
from tests.client_source import CLIENT_SRC, read

NAMES_JSON = REPO_ROOT / "data" / "player-names.json"
ROOM_WORDS_JSON = REPO_ROOT / "data" / "room-words.json"
NAMES_TS = CLIENT_SRC / "lib" / "names.ts"

# Section 5.1.2: the numeric suffix is up to three digits, and it always fits.
BASE_MAX = 21
SUFFIX_DIGITS = 3


def names() -> list[str]:
    return json.loads(NAMES_JSON.read_text(encoding="utf-8"))


# --- the rules -----------------------------------------------------------------------

# Shared with ``client/src/lib/names.test.ts``, so the hint a player sees while typing is
# the server's own answer.
CASES = json.loads((Path(__file__).parent / "name_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize(("raw", "stored"), CASES["accepted"])
def test_a_name_is_stored_in_one_spelling(raw: str, stored: str) -> None:
    """NFKC, trimmed, and one space where the player typed several."""
    assert normalize_name(raw) == stored


# A lone surrogate is valid JSON, but Vite's JSON loader refuses to read one.
@pytest.mark.parametrize("raw", [*CASES["refused"], "Dan\ud800"])
def test_a_name_is_latin_letters_digits_spaces_underscores_and_hyphens(raw: str) -> None:
    """Nothing invisible, nothing that reverses the sentence around it, no look-alikes."""
    with pytest.raises(BadName):
        normalize_name(raw)


def test_every_latin_letter_the_rule_names_is_taken_and_nothing_next_to_it() -> None:
    assert normalize_name("\u00c0\u00d6\u00d8\u00f6\u00f8\u00ff\u0100\u024f\u1e00\u1eff")
    for outside in ("\u00bf", "\u00d7", "\u00f7", "\u0250", "\u1dff", "\u1f00"):
        with pytest.raises(BadName, match="Only letters, digits, spaces, _ and - in a name."):
            normalize_name("Dan" + outside)


# --- the corpus ----------------------------------------------------------------------


def test_the_corpus_is_a_list_of_strings_and_big_enough_to_be_random() -> None:
    corpus = names()
    assert isinstance(corpus, list)
    assert all(isinstance(name, str) for name in corpus)
    # Fifty is a full room; a corpus that size would hand out repeats constantly.
    assert len(corpus) >= 150


def test_every_base_leaves_room_for_the_suffix() -> None:
    assert BASE_MAX + SUFFIX_DIGITS == NAME_MAX
    too_long = [name for name in names() if len(name) > BASE_MAX]
    assert too_long == []


def test_the_server_takes_every_name_the_generator_can_make() -> None:
    """The longest suffix on every base, through the server's own rules."""
    for base in names():
        name = base + "9" * SUFFIX_DIGITS
        try:
            assert normalize_name(name) == name
        except BadName as error:  # pragma: no cover - the assertion message is the point
            raise AssertionError(f"{name!r}: {error}") from None


def test_names_are_usernames_not_prose() -> None:
    """One word a person could type on a phone: letters, digits and underscores."""
    odd = [name for name in names() if not re.fullmatch(r"[A-Za-z0-9_]+", name)]
    assert odd == []


def test_no_two_bases_collide_in_a_room() -> None:
    """Rooms compare names case-insensitively, so the corpus does too."""
    lowered = [name.lower() for name in names()]
    assert len(lowered) == len(set(lowered))


def test_no_player_name_is_a_room_word() -> None:
    """Section 5.1.2. The room words are the items and NPCs; a player name is neither.

    This is what stops `CABBAGE` joining room `CABBAGE`, and what keeps the corpus free of
    NPC names: every NPC the app knows by name is in that list.
    """
    words = {word.lower() for word in json.loads(ROOM_WORDS_JSON.read_text(encoding="utf-8"))}
    clashes = [name for name in names() if name.lower() in words]
    assert clashes == []


# --- the generator -------------------------------------------------------------------


def test_the_generator_is_held_to_the_server_s_numbers() -> None:
    source = NAMES_TS.read_text(encoding="utf-8")
    assert f"export const NAME_MAX = {NAME_MAX}" in source
    assert f"export const BASE_MAX = {BASE_MAX}" in source
    assert "data/player-names.json" in source


def test_the_image_can_see_the_corpus() -> None:
    """The client stage copies only client/; the one file it imports from outside must follow."""
    dockerfile = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8")
    client_stage = dockerfile[: dockerfile.index("RUN pnpm build")]
    assert "COPY data/player-names.json ../data/player-names.json" in client_stage


# --- the flow ------------------------------------------------------------------------


def test_the_profile_lives_under_the_jbi_prefix() -> None:
    assert "'jbi:profile'" in read("lib/profile.ts")


def test_create_stops_an_empty_profile() -> None:
    """Section 5.1: no name, no room to host. Join stopped too until D4 made it join-first,
    which ``test_heads.py`` holds it to."""
    source = read("routes/Create.svelte")
    assert re.search(r"\{#if \$profile === null\}\s*<NamePrompt", source)


def test_every_name_field_is_the_re_rollable_one() -> None:
    """A bare text input for a name is a field somebody forgot to give a die."""
    for screen in ("routes/Create.svelte", "routes/Join.svelte"):
        source = read(screen)
        assert "<NameField" in source, screen
        assert 'type="text"' not in source, f"{screen} has its own name input"


def test_the_name_field_cannot_take_more_than_the_server_does() -> None:
    field = read("components/NameField.svelte")
    assert "maxlength={NAME_MAX}" in field


def test_join_turns_the_suffix_over_on_name_taken() -> None:
    join = read("routes/Join.svelte")
    assert "'name_taken'" in join
    assert "resuffix(" in join
    assert re.search(r"const REROLLS = 3\b", join)


def test_the_top_bar_is_given_an_identity_chip() -> None:
    """D2 left the slot; D3 fills it, once, in the shell."""
    app = read("App.svelte")
    assert app.count("<IdentityChip") == 1
    assert "{#snippet identity(" in app
