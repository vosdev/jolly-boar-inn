"""How long the scroll types a question in before its buttons appear (``rooms/hold.py``)."""

import pytest

from app.rooms.hold import (
    HOST_ASK,
    MORE_LESS_ASK,
    hold_seconds,
    stem_lines,
    typed_lines,
)


def test_a_prompt_types_at_fifty_letters_a_second_then_pauses_and_settles() -> None:
    """A 0.4 s start, 30 letters in 0.6 s, the reading they still need, 200 ms settled."""
    reading = 30 * (1 / 25 - 1 / 50)
    assert hold_seconds([30], event=False) == pytest.approx(0.4 + 0.6 + reading + 0.2)


def test_the_pause_after_a_line_is_half_a_second_to_a_second() -> None:
    assert hold_seconds([3], event=False) == pytest.approx(0.4 + 0.06 + 0.5 + 0.2)
    assert hold_seconds([600], event=False) == pytest.approx(0.4 + 12 + 1 + 0.2)


def test_an_event_starts_typing_after_its_npc_walks_on() -> None:
    """The same formula, with the typing from 900 ms for the entrance, and no cap."""
    assert hold_seconds([30, 30], event=True) - hold_seconds([30, 30], event=False) == (
        pytest.approx(0.5)
    )
    assert hold_seconds([], event=True) == pytest.approx(1.1)


def test_nothing_to_type_holds_nothing() -> None:
    assert hold_seconds([], event=False) == 0


def test_a_text_prompt_is_one_line() -> None:
    assert stem_lines("multiple_choice", "bestiary", {"prompt": "Who?", "options": []}) == [4]


def test_a_quote_types_only_the_quote() -> None:
    view = {"prompt": "Who said it?", "quote": "Hello there"}
    assert stem_lines("multiple_choice", "who_said_that", view) == [11]


def test_whos_that_npc_types_only_the_hosts_ask() -> None:
    view = {"prompt": "Who's that NPC?", "vocab": "npcs"}
    assert stem_lines("pick_from_list", "whos_that_npc", view) == []
    assert typed_lines("pick_from_list", "whos_that_npc", view, event=False) == [HOST_ASK]


def test_an_examine_types_only_the_examine() -> None:
    assert stem_lines("free_text", "guess_examine", {"prompt": "A sword."}) == [8]


def test_more_less_and_price_count_the_stems_own_wording() -> None:
    assert stem_lines("more_less", "more_less", {"metric": "ge_price"}) == [MORE_LESS_ASK]
    view = {"subject": {"name": "Abyssal whip"}, "options": [1, 2, 3, 4]}
    assert stem_lines("price_is_right", "price_is_right", view) == [12]


def test_letters_are_code_points() -> None:
    assert stem_lines("free_text", "custom", {"prompt": "Café 🐗"}) == [6]


def test_an_event_types_its_intro_then_its_prompt() -> None:
    view = {"intro": "Psst!", "prompt": "Which way?"}
    assert typed_lines("multiple_choice", "random_event", view, event=True) == [5, 10]
    assert typed_lines("multiple_choice", "random_event", view, event=False) == [HOST_ASK, 10]


def test_an_event_with_no_prompt_types_its_stem() -> None:
    view = {"intro": "Hm.", "subject": {"name": "Coal"}}
    assert typed_lines("price_is_right", "random_event", view, event=True) == [4]


def test_a_rounds_question_types_the_hosts_ask_line_before_its_stem() -> None:
    view = {"prompt": "Who?", "options": []}
    assert typed_lines("multiple_choice", "bestiary", view, event=False) == [HOST_ASK, 4]
    assert typed_lines("free_text", "guess_examine", {"prompt": "A sword."}, False) == [HOST_ASK, 8]


def test_a_question_with_nothing_on_its_sheet_types_nothing() -> None:
    assert typed_lines("multiple_choice", "bestiary", {"options": []}, event=False) == []
