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


def test_a_host_may_name_the_npc_who_asks_it_if_it_is_on_the_roster() -> None:
    """T22: the NPC is a placement, so it is kept and left out of the content id."""
    (named,) = custom.envelopes([{**WRITTEN, "random_event": "death"}])
    assert named["random_event"] == "death"
    assert named["id"] == schema.content_id(WRITTEN)
    with pytest.raises(schema.QuestionError) as info:
        custom.envelopes([{**WRITTEN, "random_event": "rick_turpentine"}])
    assert info.value.errors == [
        "custom_questions[0] $.random_event: 'rick_turpentine' is not on the roster"
        " (app/random_events.py)"
    ]


@pytest.mark.parametrize(("bad", "code"), [("\x00", "0000"), ("\ud800", "D800")])
def test_a_character_the_database_cannot_store_is_refused_by_its_path(bad: str, code: str) -> None:
    """Lone surrogates are valid JSON escapes, and would otherwise break the content id."""
    written = {**WRITTEN, "payload": {**WRITTEN["payload"], "prompt": f"How{bad} many?"}}
    with pytest.raises(schema.QuestionError) as info:
        custom.envelopes([WRITTEN, written])
    assert info.value.errors == [
        f"custom_questions[1] $.payload.prompt: U+{code} is not a character that can be stored"
    ]


def test_a_host_may_not_write_a_price_question_yet() -> None:
    """Neither price type can show its item outside its own round, so the room is refused."""
    priced = {
        "type": "price_is_right",
        "payload": {
            "subject": {"name": "Abyssal whip", "asset": "item:4151"},
            "value": 1600000,
            "options": [1100000, 1600000, 2100000, 2900000],
            "answer_index": 1,
            "as_of": "2026-09-20",
        },
    }
    with pytest.raises(schema.QuestionError) as info:
        custom.envelopes([WRITTEN, priced])
    assert info.value.errors == [
        "custom_questions[1] $.type: 'price_is_right' is not accepted in 'custom' yet:"
        " a question of it can only be shown inside its own round"
    ]


@pytest.mark.parametrize(
    ("claims", "refused"),
    [
        (
            {"source": "community"},
            ["$.source: 'community', but a host's own question is always 'room'"],
        ),
        (
            {"mode": "more_less"},
            ["$.mode: 'more_less', but a host's own question is always 'custom'"],
        ),
        (
            {"mode": "random_event", "source": "community", "random_event": "bob"},
            [
                "$.mode: 'random_event', but a host's own question is always 'custom'",
                "$.source: 'community', but a host's own question is always 'room'",
            ],
        ),
        (
            {"mode": "more_less", "source": "pack"},
            [
                "$.mode: 'more_less', but a host's own question is always 'custom'",
                "$.source: 'pack', but a host's own question is always 'room'",
            ],
        ),
    ],
)
def test_a_host_question_claiming_another_mode_or_source_is_refused(
    claims: dict[str, str], refused: list[str]
) -> None:
    """Only the room's own questions keep their author from scoring on them, so a question
    that claims to be anyone else's would let its author play it."""
    with pytest.raises(schema.QuestionError) as info:
        custom.envelopes([WRITTEN, {**WRITTEN, **claims}])
    assert info.value.errors == [f"custom_questions[1] {problem}" for problem in refused]
