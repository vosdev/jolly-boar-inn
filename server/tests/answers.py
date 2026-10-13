"""A right and a wrong answer to any question, worked out from its payload.

Game tests answer whatever question the room drew, so they cannot write the value down.
``test_type_contract.py`` holds every type in ``TYPES`` to these: a type without an entry
fails there by name, and each entry's right answer grades 1.0 and its wrong one less.
"""

from collections.abc import Callable
from typing import Any

from app.questions import normalize, vocab
from app.questions.types import multiple_choice, ordering, pick_all_that_apply
from app.questions.types.free_text import MAX_LENGTH


def _another_option(payload: dict[str, Any]) -> int:
    return next(i for i in range(len(payload["options"])) if i != payload["answer_index"])


def _another_shown_option(payload: dict[str, Any]) -> int:
    return _another_option({**payload, **multiple_choice.reveal(payload)})


def _only_wrong(payload: dict[str, Any]) -> list[int]:
    # Only wrong options, so no credit and a round can expect no points. ``picks`` may ask for
    # more than there are wrong ones; then one right option traded for a wrong one, short of
    # full credit but not of all of it.
    right = pick_all_that_apply.reveal(payload)["answer_indices"]
    wrong = [i for i in range(len(payload["options"])) if i not in right]
    if "picks" not in payload:
        return wrong
    if len(wrong) >= payload["picks"]:
        return wrong[: payload["picks"]]
    return sorted([*right[:-1], wrong[0]])


def _rotated_past_ties(payload: dict[str, Any]) -> list[int]:
    # Rotated by its largest tie, the right order moves every rank off its place, so a round
    # can expect no points; that holds wherever the entries number twice that tie or more.
    # The first place is always wrong, so it grades below 1.0 even then, picks or not.
    # With ``picks`` a rotated pick still earns its half, so entries past the cut go first.
    shown = ordering.reveal(payload)
    right = shown["answer"]
    ranks = [shown["entries"][index]["rank"] for index in right]
    places = ordering.places(payload)
    unpicked = [index for index, rank in zip(right, ranks, strict=True) if rank > ranks[places - 1]]
    if "picks" in payload and len(unpicked) >= places:
        return unpicked[:places]
    tie = max(ranks.count(rank) for rank in ranks)
    return (right[tie:] + right[:tie])[:places]


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
    "multiple_choice": lambda payload: multiple_choice.reveal(payload)["answer_index"],
    "pick_from_list": lambda payload: payload["answer_id"],
    "closest_number": lambda payload: payload["answer"],
    "free_text": lambda payload: payload["accepted"][0],
    "pick_all_that_apply": lambda payload: pick_all_that_apply.reveal(payload)["answer_indices"],
    # With ``picks`` only the first places are played, and a longer answer is refused.
    "ordering": lambda payload: ordering.reveal(payload)["answer"][: ordering.places(payload)],
}

_WRONG: dict[str, Callable[[dict[str, Any]], Any]] = {
    "more_less": _another_option,
    "price_is_right": _another_option,
    "multiple_choice": _another_shown_option,
    "pick_from_list": _another_entry,
    "closest_number": lambda payload: payload["answer"] + 1,
    "free_text": _nothing_like_it,
    "pick_all_that_apply": _only_wrong,
    "ordering": _rotated_past_ties,
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
