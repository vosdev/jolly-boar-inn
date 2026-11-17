"""``matching``: three to six fields, and the player puts the option that belongs on each.

With ``bins``, four to six entries sorted into three or four bins."""

import copy
import json
import random
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.questions import schema
from app.questions.submission import Submission
from app.questions.types import (
    TYPES,
    answer_seconds,
    matching,
    pictured,
    reveal_seconds,
    scoring_of,
)
from app.questions.types.scoring import Scoring
from tests.conftest import stub_mode
from tests.game_api import answer_after
from tests.test_pictures import names_the_id

BOSSES = ["Zulrah", "Vorkath", "Kraken", "Sarachnis"]
LAIRS = ["Zul-Andra", "Ungael", "Kraken Cove", "Forthos Dungeon"]
DECOY = "Karuulm Slayer Dungeon"

EXAMPLE: dict[str, Any] = {
    "type": "matching",
    "mode": "custom",
    "source": "room",
    "tags": [],
    "payload": {
        "prompt": "Match each boss to where it is fought.",
        "fields": [{"text": boss} for boss in BOSSES],
        "options": [
            {"text": "Zul-Andra", "detail": "Tirannwn"},
            {"text": "Ungael", "detail": "By boat from Rellekka"},
            {"text": "Kraken Cove"},
            {"text": "Forthos Dungeon"},
            {"text": DECOY},
        ],
        "answer": [0, 1, 2, 3],
        "explanation": "Each lives alone in its lair.",
    },
}
EXAMPLE["id"] = schema.content_id(EXAMPLE)

WHIP, HAMMER = "0123456789abcdef.png", "fedcba9876543210.png"

# Two drops as icons alone, one with its name too, and one named only.
ICONS: dict[str, Any] = {
    "prompt": "Match each drop to the monster that drops it.",
    "fields": [
        {"icon": "item:4151"},
        {"icon": "item:13576"},
        {"text": "Kraken tentacle", "icon": "item:12004"},
        {"text": "Basilisk jaw"},
    ],
    "options": [
        {"text": "Abyssal demon"},
        {"text": "Lizardman shaman"},
        {"text": "Kraken"},
        {"text": "Basilisk Knight"},
    ],
    "answer": [0, 1, 2, 3],
}


GODS = ["Saradomin", "Zamorak", "Guthix"]
# Two entries to Saradomin, two to Zamorak, one to Guthix.
SORT: dict[str, Any] = {
    "type": "matching",
    "mode": "custom",
    "source": "room",
    "tags": [],
    "payload": {
        "prompt": "Which god does each belong to?",
        "bins": True,
        "fields": [
            {"text": "Saradomin brew"},
            {"text": "Zamorak brew"},
            {"text": "Guthix rest"},
            {"text": "Saradomin sword"},
            {"text": "Zamorakian spear"},
        ],
        "options": [
            {"text": "Saradomin", "detail": "Order"},
            {"text": "Zamorak"},
            {"text": "Guthix"},
        ],
        "answer": [0, 1, 2, 0, 1],
    },
}
SORT["id"] = schema.content_id(SORT)
SORTED = ["Saradomin", "Zamorak", "Guthix", "Saradomin", "Zamorak"]


def sort(**changes: Any) -> dict[str, Any]:
    p = copy.deepcopy(SORT["payload"])
    p.update(changes)
    return p


def payload(**changes: Any) -> dict[str, Any]:
    p = copy.deepcopy(EXAMPLE["payload"])
    p.update(changes)
    return p


def shown(p: dict[str, Any]) -> list[str]:
    return [option["text"] for option in matching.client_view(p)["options"]]


def value_for(p: dict[str, Any], texts: list[str]) -> list[int]:
    """The answer that puts the options ``texts`` names on the fields, in field order."""
    return [shown(p).index(text) for text in texts]


def credit_for(p: dict[str, Any], texts: list[str]) -> float:
    player = uuid4()
    parsed = matching.parse_value(p, value_for(p, texts))
    assert parsed is not None
    return matching.grade(p, [Submission(player, parsed)])[player]


def test_it_is_registered_and_scored_on_speed() -> None:
    assert TYPES["matching"] is matching
    assert scoring_of("matching") is Scoring.SPEED


def test_the_schema_accepts_a_valid_payload_text_or_icon() -> None:
    assert schema.schema_errors(EXAMPLE) == []
    assert matching.check(EXAMPLE["payload"]) == []
    icons = {**EXAMPLE, "payload": ICONS}
    icons["id"] = schema.content_id(icons)
    assert schema.schema_errors(icons) == []
    assert matching.check(ICONS) == []


def _options(count: int) -> list[dict[str, str]]:
    return [{"text": f"Option {n}"} for n in range(count)]


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (
            lambda p: p.update(fields=p["fields"][:2], answer=[0, 1]),
            "$.payload.fields",
        ),
        (
            lambda p: p.update(
                fields=[{"text": f"Field {n}"} for n in range(7)], options=_options(7)
            ),
            "$.payload.fields",
        ),
        (lambda p: p.update(options=_options(7)), "$.payload.options"),
        (lambda p: p["fields"][0].clear(), "$.payload.fields[0]"),
        (lambda p: p["fields"][0].update(icon="https://x/whip.png"), "$.payload.fields[0].icon"),
        (lambda p: p["options"][0].update(detail="x" * 41), "$.payload.options[0].detail"),
        (lambda p: p["options"][0].update(key="a"), "$.payload.options[0]"),
        (lambda p: p.update(answer=[0, 1, 6, 2]), "$.payload.answer[2]"),
        (lambda p: p.pop("answer"), "$.payload"),
    ],
    ids=[
        "two fields",
        "seven fields",
        "seven options",
        "an empty field",
        "an icon that is a url",
        "a long detail",
        "an unknown key",
        "an answer past six",
        "no answer",
    ],
)
def test_the_schema_refuses(mutate: Any, path: str) -> None:
    q = copy.deepcopy(EXAMPLE)
    mutate(q["payload"])
    q["id"] = schema.content_id(q)
    problems = schema.schema_errors(q)
    assert any(p.startswith(path + ":") or p.startswith(path + "[") for p in problems), problems


def test_check_refuses_a_repeated_field() -> None:
    fields = [*EXAMPLE["payload"]["fields"][:3], {"text": " zulrah "}]
    assert matching.check(payload(fields=fields)) == ["fields[3]: repeats fields[0]"]
    icons = copy.deepcopy(ICONS)
    icons["fields"][1] = {"icon": "item:4151"}
    assert matching.check(icons) == ["fields[1]: repeats fields[0]"]


def test_check_refuses_a_repeated_option() -> None:
    options = copy.deepcopy(EXAMPLE["payload"]["options"])
    options[4] = {"text": "kraken  cove"}
    assert matching.check(payload(options=options)) == [
        "options[4]: 'kraken  cove' repeats options[2]"
    ]


def test_check_refuses_an_answer_that_uses_an_option_twice() -> None:
    assert matching.check(payload(answer=[0, 1, 1, 3])) == ["answer: uses an option on two fields"]


def test_check_refuses_fewer_options_than_fields_and_an_answer_per_field_short() -> None:
    assert matching.check(payload(options=_options(3), answer=[0, 1, 2])) == [
        "options: 3 for 4 fields; each field needs one",
        "answer: must name one option for each of the 4 fields",
    ]
    assert matching.check(payload(answer=[0, 1, 2, 7])) == [
        "answer: [7] are not options; there are only 5"
    ]


def test_the_open_view_has_no_answer_and_no_detail() -> None:
    view = matching.client_view(EXAMPLE["payload"])
    assert set(view) == {"prompt", "fields", "options"}
    assert view["fields"] == [{"text": boss} for boss in BOSSES]
    assert all(set(option) == {"text"} for option in view["options"])
    assert sorted(shown(EXAMPLE["payload"])) == sorted([*LAIRS, DECOY])


def test_the_open_view_shuffles_the_same_way_every_call() -> None:
    views = [matching.client_view(copy.deepcopy(EXAMPLE["payload"])) for _ in range(5)]
    assert all(view == views[0] for view in views)


def test_the_open_view_is_never_already_matched() -> None:
    for seed in range(300):
        rng = random.Random(seed)
        fields = rng.randint(3, 6)
        options = rng.randint(fields, 6)
        answer = rng.sample(range(options), fields)
        p = {
            "prompt": f"Question {seed}",
            "fields": [{"text": f"Field {n}"} for n in range(fields)],
            "options": _options(options),
            "answer": answer,
        }
        assert matching.check(p) == []
        as_they_lie = list(range(fields))
        player = uuid4()
        assert matching.grade(p, [Submission(player, as_they_lie)])[player] < 1.0, p


def test_a_shuffle_that_lands_on_the_answer_is_rotated_by_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(random.Random, "shuffle", lambda self, items: None)
    assert shown(EXAMPLE["payload"]) == [*LAIRS[1:], DECOY, LAIRS[0]]


def test_an_icon_field_shows_its_picture_and_never_its_asset() -> None:
    view = matching.client_view(ICONS)
    assert view["fields"] == [{}, {}, {"text": "Kraken tentacle"}, {"text": "Basilisk jaw"}]
    assert "item:" not in json.dumps(view) and "item:" not in json.dumps(matching.reveal(ICONS))
    pictures = {"item:4151": WHIP, "item:12004": HAMMER}
    assert pictured("matching", view, ICONS, pictures)["fields"] == [
        {"picture": WHIP},
        {},
        {"text": "Kraken tentacle", "picture": HAMMER},
        {"text": "Basilisk jaw"},
    ]


def test_the_reveal_adds_details_and_each_field_s_option_as_a_shown_position() -> None:
    p = EXAMPLE["payload"]
    revealed = matching.reveal(p)
    order = shown(p)
    assert revealed["answer"] == [order.index(lair) for lair in LAIRS]
    assert revealed["options"][order.index("Zul-Andra")] == {
        "text": "Zul-Andra",
        "detail": "Tirannwn",
    }
    assert revealed["options"][order.index(DECOY)] == {"text": DECOY}
    assert revealed["explanation"] == p["explanation"]


@pytest.mark.parametrize(
    ("value", "parsed"),
    [
        ([0, 1, 2, 3], [0, 1, 2, 3]),
        ([4, 3, 2, 1], [4, 3, 2, 1]),
        ([0, 1, 2, 2], None),
        ([0, 1, 2], None),
        ([0, 1, 2, 3, 4], None),
        ([0, 1, 2, 5], None),
        ([-1, 1, 2, 3], None),
        ([0, 1, 2, 3.5], None),
        ([0, 1, 2, "3"], None),
        ([0, 1, 2, None], None),
        ("0123", None),
    ],
    ids=[
        "every field",
        "a decoy placed",
        "a repeated position",
        "too few",
        "too many",
        "past the options",
        "negative",
        "a fraction",
        "a string",
        "a null",
        "not a list",
    ],
)
def test_parse_value_takes_one_distinct_shown_position_per_field(value: Any, parsed: Any) -> None:
    assert matching.parse_value(EXAMPLE["payload"], value) == parsed


def test_all_right_is_full_credit() -> None:
    assert credit_for(EXAMPLE["payload"], LAIRS) == 1.0


def test_two_of_four_is_half_credit() -> None:
    swapped = [LAIRS[1], LAIRS[0], LAIRS[2], LAIRS[3]]
    assert credit_for(EXAMPLE["payload"], [LAIRS[0], LAIRS[2], LAIRS[1], LAIRS[3]]) == 0.5
    assert credit_for(EXAMPLE["payload"], swapped) == 0.5


def test_a_decoy_on_a_field_earns_nothing() -> None:
    assert credit_for(EXAMPLE["payload"], [DECOY, *LAIRS[1:]]) == 0.75
    assert credit_for(EXAMPLE["payload"], [LAIRS[1], DECOY, LAIRS[3], LAIRS[0]]) == 0.0


@pytest.mark.parametrize(
    ("fields", "pace", "answer", "reveal"),
    [
        (3, "run", 25, 10),
        (4, "run", 30, 12),
        (6, "run", 40, 16),
        (4, "walk", 38, 15),
        (4, "teleport", 23, 9),
    ],
)
def test_answer_and_reveal_seconds_follow_the_fields_and_the_pace(
    fields: int, pace: str, answer: int, reveal: int
) -> None:
    p = {
        "prompt": "Match them.",
        "fields": [{"text": f"Field {n}"} for n in range(fields)],
        "options": _options(6),
        "answer": list(range(fields)),
    }
    assert answer_seconds("matching", p, pace) == answer
    assert reveal_seconds("matching", p, pace) == reveal


@pytest.fixture
def matching_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A round of the icon question, as a pack's, with two of its three pictures built."""
    question = {"id": "q_matching_icons", "type": "matching", "source": "pack", "tags": []}
    question["payload"] = ICONS
    app.state.rooms.pictures = {"item:4151": WHIP, "item:12004": HAMMER}
    yield from stub_mode(app, "matching_round", "matching", [question])


def test_a_question_plays_end_to_end(table, matching_round: str, db) -> None:
    game = table("Zezima", "Woox", modes=[matching_round], questions=1, seconds=30)
    admin, zezima, woox = game.seats
    game.start()
    opened = game.opened(0)
    views = [message["question"]["view"] for message in opened]
    assert all(view == views[0] for view in views)
    assert views[0]["fields"] == [
        {"picture": WHIP},
        {},
        {"text": "Kraken tentacle", "picture": HAMMER},
        {"text": "Basilisk jaw"},
    ]
    assert not any(
        names_the_id(message, 4151) or names_the_id(message, 13576) for message in opened
    )

    order = [option["text"] for option in views[0]["options"]]
    monsters = [option["text"] for option in ICONS["options"]]
    right = [order.index(text) for text in monsters]
    half = [order.index(text) for text in [monsters[1], monsters[0], *monsters[2:]]]
    answer_after(game, zezima, 0, right, 1.0)
    game.answer(woox, 0, right[:3])
    assert woox.take("error")["code"] == "bad_value"
    answer_after(game, woox, 0, half, 3.0)
    game.skip()

    closed = admin.take("question_closed")
    assert closed["reveal"]["answer"] == right
    assert closed["reveal"]["fields"][0] == {"picture": WHIP}
    assert "item:" not in json.dumps(closed)
    full, partial = closed["results"][zezima.id], closed["results"][woox.id]
    assert full["value"] == right and full["correct"] is True and full["points"] == 1000
    assert partial["value"] == half and partial["credit"] == 0.5 and partial["correct"] is False


def test_the_schema_and_check_take_a_bins_question_with_a_bin_left_empty() -> None:
    assert schema.schema_errors(SORT) == []
    assert matching.check(SORT["payload"]) == []
    empty = sort(options=[*SORT["payload"]["options"], {"text": "Armadyl"}])
    assert matching.check(empty) == []


def test_the_schema_refuses_bins_false_so_one_question_keeps_one_id() -> None:
    q = {**SORT, "payload": sort(bins=False)}
    q["id"] = schema.content_id(q)
    assert any(p.startswith("$.payload.bins:") for p in schema.schema_errors(q))


@pytest.mark.parametrize(
    ("changes", "errors"),
    [
        (
            {"options": [{"text": "Saradomin"}], "answer": [0, 0, 0, 0, 0]},
            ["options: 1 bins; a sort takes 3 to 4"],
        ),
        (
            {"options": [{"text": "Saradomin"}, {"text": "Zamorak"}], "answer": [0, 1, 0, 0, 1]},
            ["options: 2 bins; a sort takes 3 to 4"],
        ),
        (
            {"options": _options(5)},
            ["options: 5 bins; a sort takes 3 to 4"],
        ),
        (
            {"answer": [0, 1, 3, 0, 1]},
            ["answer: [3] are not options; there are only 3"],
        ),
        (
            {"fields": [{"text": f"Entry {n}"} for n in range(3)], "answer": [0, 1, 2]},
            ["fields: 3 entries; a sort takes 4 to 6"],
        ),
    ],
    ids=["one bin", "two bins", "five bins", "an answer past the bins", "three entries"],
)
def test_check_refuses_a_bins_question_out_of_its_bounds(
    changes: dict[str, Any], errors: list[str]
) -> None:
    assert matching.check(sort(**changes)) == errors


@pytest.mark.parametrize("bins", [3, 4])
def test_check_takes_a_sort_into_three_or_four_bins(bins: int) -> None:
    assert matching.check(sort(options=_options(bins), answer=[0, 1, 2, 0, 1])) == []


def test_check_takes_a_repeated_answer_only_with_bins() -> None:
    assert matching.check(SORT["payload"]) == []
    assert "answer: uses an option on two fields" in matching.check(
        {key: value for key, value in SORT["payload"].items() if key != "bins"}
    )


def test_a_bins_value_may_put_one_option_on_several_fields_and_a_plain_one_may_not() -> None:
    assert matching.parse_value(SORT["payload"], [2, 2, 2, 2, 2]) == [2, 2, 2, 2, 2]
    assert matching.parse_value(SORT["payload"], [0, 1, 0, 1, 0]) == [0, 1, 0, 1, 0]
    assert matching.parse_value(SORT["payload"], [0, 1, 3, 1, 0]) is None
    assert matching.parse_value(SORT["payload"], [0, 1, 2, 1]) is None
    assert matching.parse_value(EXAMPLE["payload"], [0, 0, 1, 2]) is None


def test_the_open_view_says_bins_and_never_the_answer() -> None:
    view = matching.client_view(SORT["payload"])
    assert set(view) == {"prompt", "bins", "fields", "options"}
    assert view["bins"] is True
    assert sorted(shown(SORT["payload"])) == sorted(GODS)
    assert "bins" not in matching.client_view(EXAMPLE["payload"])


def test_bins_are_never_rotated_off_a_shuffle(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(random.Random, "shuffle", lambda self, items: None)
    one_each = sort(fields=SORT["payload"]["fields"][:4], answer=[0, 1, 2, 3])
    one_each["options"] = [*one_each["options"], {"text": "Armadyl"}]
    assert matching.shown_order(one_each) == [0, 1, 2, 3]
    assert matching.shown_order(SORT["payload"]) == [0, 1, 2]


def test_credit_is_the_entries_in_their_bin_over_the_entries() -> None:
    p = SORT["payload"]
    assert credit_for(p, SORTED) == 1.0
    assert credit_for(p, ["Saradomin"] * 5) == 0.4
    assert credit_for(p, ["Guthix", "Zamorak", "Guthix", "Zamorak", "Zamorak"]) == 0.6


def test_the_reveal_names_each_entry_s_bin_with_the_bins_details() -> None:
    p = SORT["payload"]
    revealed = matching.reveal(p)
    order = shown(p)
    assert revealed["bins"] is True
    assert revealed["answer"] == [order.index(god) for god in SORTED]
    assert revealed["options"][order.index("Saradomin")] == {"text": "Saradomin", "detail": "Order"}


@pytest.mark.parametrize(("entries", "answer"), [(4, 30), (6, 40)])
def test_a_sort_is_timed_as_any_matching(entries: int, answer: int) -> None:
    p = sort(
        fields=[{"text": f"Entry {n}"} for n in range(entries)],
        answer=[n % 3 for n in range(entries)],
    )
    assert answer_seconds("matching", p, "run") == answer


@pytest.fixture
def sorting_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A round of the gods question, as a pack's."""
    question = {"id": "q_matching_bins", "type": "matching", "source": "pack", "tags": []}
    question["payload"] = SORT["payload"]
    yield from stub_mode(app, "sorting_round", "matching", [question])


def test_a_bins_question_plays_end_to_end(table, sorting_round: str, db) -> None:
    game = table("Zezima", "Woox", modes=[sorting_round], questions=1, seconds=30)
    admin, zezima, woox = game.seats
    game.start()
    view = game.opened(0)[0]["question"]["view"]
    assert view["bins"] is True and "answer" not in view

    order = [option["text"] for option in view["options"]]
    right = [order.index(god) for god in SORTED]
    all_saradomin = [order.index("Saradomin")] * 5
    answer_after(game, zezima, 0, right, 1.0)
    answer_after(game, woox, 0, all_saradomin, 3.0)
    game.skip()

    closed = admin.take("question_closed")
    assert closed["reveal"]["answer"] == right
    full, partial = closed["results"][zezima.id], closed["results"][woox.id]
    assert full["value"] == right and full["correct"] is True and full["points"] == 1000
    assert partial["value"] == all_saradomin and partial["credit"] == 0.4
