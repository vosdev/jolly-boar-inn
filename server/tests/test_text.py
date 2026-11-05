"""``questions.text``: which strings Postgres cannot store, found anywhere in a JSON value."""

from typing import Any

from app.questions import text


def test_errors_names_each_unstorable_string_by_its_path_keys_first() -> None:
    value = {"a\x00": ["ok", "bad\ud800"], "b": {"c": "\x00"}}
    assert text.errors(value) == [
        "$: U+0000 is not a character that can be stored",
        "$.a\x00[1]: U+D800 is not a character that can be stored",
        "$.b.c: U+0000 is not a character that can be stored",
    ]


def test_errors_walks_a_value_deeper_than_the_recursion_limit() -> None:
    value: Any = "\x00"
    for _ in range(10_000):
        value = [value]
    assert text.errors(value) == [
        "$" + "[0]" * 10_000 + ": U+0000 is not a character that can be stored"
    ]
