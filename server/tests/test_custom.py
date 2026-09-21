"""``questions/custom.py``: a host's question as they wrote it, and as it is stored.

The HTTP side -- the 422s, and no room left behind -- is in ``test_rooms.py``.
"""

import pytest

from app.questions import custom, schema

WRITTEN = {
    "type": "closest_number",
    "payload": {"prompt": "How many Zulrah kills?", "answer": 1234},
}


def test_what_follows_from_where_it_is_going_is_filled_in() -> None:
    (envelope,) = custom.envelopes([WRITTEN])
    assert envelope == {
        **WRITTEN,
        "mode": "custom",
        "source": "room",
        "tags": [],
        "id": schema.content_id(WRITTEN),
    }
    schema.validate(envelope)


def test_what_the_host_sent_is_kept_and_checking_twice_changes_nothing() -> None:
    written = {**WRITTEN, "tags": ["clan"], "host_only": True, "author": "Zezima"}
    once = custom.envelopes([written])
    assert once[0]["tags"] == ["clan"] and once[0]["host_only"] is True
    assert custom.envelopes(once) == once


def test_every_problem_is_named_by_its_question_and_its_field() -> None:
    broken = {"type": "closest_number", "payload": {"prompt": "", "answer": "lots"}}
    with pytest.raises(schema.QuestionError) as info:
        custom.envelopes([WRITTEN, broken, "not a question"])
    assert info.value.errors == [
        "custom_questions[1] $.payload.answer: 'lots' is not of type 'number'",
        "custom_questions[1] $.payload.prompt: '' should be non-empty",
        "custom_questions[2]: a question is a JSON object",
    ]


def test_a_question_with_no_type_is_refused_rather_than_hashed() -> None:
    with pytest.raises(schema.QuestionError, match=r"custom_questions\[0\] \$: 'type'"):
        custom.envelopes([{"payload": {}}])
