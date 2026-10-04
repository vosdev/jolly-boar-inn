"""A right and a wrong answer to any question, worked out from its payload.

Game tests answer whatever question the room drew, so they cannot write the value down.
``test_type_contract.py`` holds every type in ``TYPES`` to these: a type without an entry
fails there by name, and each entry's right answer grades 1.0 and its wrong one less.
"""

from collections.abc import Callable
from typing import Any

from app.questions import normalize, vocab
from app.questions.types import ordering
from app.questions.types.free_text import MAX_LENGTH


def _another_option(payload: dict[str, Any]) -> int:
    return next(i for i in range(len(payload["options"])) if i != payload["answer_index"])


def _one_swapped(payload: dict[str, Any]) -> list[int]:
    # One right option traded for a wrong one: still ``picks`` long, and short of full credit.
    right = payload["answer_indices"]
    wrong = next(i for i in range(len(payload["options"])) if i not in right)
    return sorted([*right[:-1], wrong])


def _ends_swapped(payload: dict[str, Any]) -> list[int]:
    # The first and last places hold the lowest and highest rank, which never tie.
    right = ordering.reveal(payload)["answer"]
    return [right[-1], *right[1:-1], right[0]]


def _another_entry(payload: dict[str, Any]) -> int:
    names = vocab.get(payload["vocab"])
    assert names is not None, f"this build has no {payload['vocab']} vocabulary"
    return next(e.id for e in names.entries if e.id != payload["answer_id"])


def _nothing_like_it(payload: dict[str, Any]) -> str:
    # Longer than every accepted answer by more than any typo allowance, so none is near.
    longest = max(len(normalize.normalize(answer)) for answer in payload["accepted"])
    return "q" * min(longest + 3, MAX_LENGTH)


_RIGHT: dict[str, Callable[[dict[str, Any]], Any]] = {
    "more_less": lambda payload: payload["answer_index"],
    "price_is_right": lambda payload: payload["answer_index"],
    "multiple_choice": lambda payload: payload["answer_index"],
    "pick_from_list": lambda payload: payload["answer_id"],
    "closest_number": lambda payload: payload["answer"],
    "free_text": lambda payload: payload["accepted"][0],
    "pick_all_that_apply": lambda payload: payload["answer_indices"],
    "ordering": lambda payload: ordering.reveal(payload)["answer"],
}

_WRONG: dict[str, Callable[[dict[str, Any]], Any]] = {
    "more_less": _another_option,
    "price_is_right": _another_option,
    "multiple_choice": _another_option,
    "pick_from_list": _another_entry,
    "closest_number": lambda payload: payload["answer"] + 1,
    "free_text": _nothing_like_it,
    "pick_all_that_apply": _one_swapped,
    "ordering": _ends_swapped,
}


def _entry(table: dict[str, Callable[[dict[str, Any]], Any]], type_id: str) -> Callable:
    if type_id not in table:
        raise AssertionError(f"{type_id} has no right and wrong answer in tests/answers.py")
    return table[type_id]


def right_value(type_id: str, payload: dict[str, Any]) -> Any:
    """An answer to this question that grades 1.0."""
    return _entry(_RIGHT, type_id)(payload)


def wrong_value(type_id: str, payload: dict[str, Any]) -> Any:
    """A valid answer to this question that grades below 1.0."""
    return _entry(_WRONG, type_id)(payload)
