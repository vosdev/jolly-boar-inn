"""``ordering``: three to six entries the player puts in order, ties allowed."""

import copy
import random
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.modes import MODES, Mode
from app.questions import schema
from app.questions.packs import Pack
from app.questions.submission import Submission
from app.questions.types import TYPES, ordering, scoring_of
from app.questions.types.scoring import Scoring
from app.rooms.scoring import points_for
from tests.game_api import answer_after

METALS = ["Bronze", "Iron", "Steel", "Mithril", "Adamant"]

EXAMPLE: dict[str, Any] = {
    "type": "ordering",
    "mode": "custom",
    "source": "room",
    "tags": [],
    "payload": {
        "prompt": "Put these metals in order.",
        "ends": ["Weakest", "Strongest"],
        "entries": [
            {"text": name, "rank": rank, "detail": f"Level {max(1, 10 * (rank - 1))}"}
            for rank, name in enumerate(METALS, start=1)
        ],
        "answer": [0, 1, 2, 3, 4],
        "explanation": "Each metal needs ten more Smithing than the last.",
    },
}
EXAMPLE["id"] = schema.content_id(EXAMPLE)

# Two quests released on one day share a rank, and either may come first.
TIED: dict[str, Any] = {
    "prompt": "Oldest to newest.",
    "ends": ["Oldest", "Newest"],
    "entries": [
        {"text": "Cook's Assistant", "rank": 1},
        {"text": "Demon Slayer", "rank": 1},
        {"text": "Dragon Slayer I", "rank": 2},
        {"text": "Monkey Madness I", "rank": 3},
    ],
    "answer": [0, 1, 2, 3],
}


# The top three of six, the other three there to be left out.
PICKED: dict[str, Any] = {
    "prompt": "The three most valuable, most first.",
    "ends": ["Most valuable", "Least valuable"],
    "entries": [
        {"text": name, "rank": rank}
        for rank, name in enumerate(
            [
                "Twisted bow",
                "Scythe of vitur",
                "Tumeken's shadow",
                "Abyssal whip",
                "Rune platebody",
                "Lobster",
            ],
            start=1,
        )
    ],
    "answer": [0, 1, 2, 3, 4, 5],
    "picks": 3,
}
TOP = ["Twisted bow", "Scythe of vitur", "Tumeken's shadow"]


def payload(**changes: Any) -> dict[str, Any]:
    p = copy.deepcopy(EXAMPLE["payload"])
    p.update(changes)
    return p


def shown(p: dict[str, Any]) -> list[str]:
    return [entry["text"] for entry in ordering.client_view(p)["entries"]]


def value_for(p: dict[str, Any], texts: list[str]) -> list[int]:
    """The answer that puts the entries in the order ``texts`` names."""
    return [shown(p).index(text) for text in texts]


def dense(raw: Iterable[int]) -> list[int]:
    """``raw`` sorted, renumbered from 1 without a gap, ties kept."""
    values = sorted(raw)
    distinct = sorted(set(values))
    return [distinct.index(value) + 1 for value in values]


def credit_for(p: dict[str, Any], value: list[int]) -> float:
    player = uuid4()
    parsed = ordering.parse_value(p, value)
    assert parsed is not None
    return ordering.grade(p, [Submission(player, parsed)])[player]


def test_it_is_registered_and_scored_on_speed() -> None:
    assert TYPES["ordering"] is ordering
    assert scoring_of("ordering") is Scoring.SPEED


def test_example_validates() -> None:
    schema.validate(EXAMPLE)
    tied = {**EXAMPLE, "payload": TIED}
    schema.validate({**tied, "id": schema.content_id(tied)})


def test_three_of_five_in_place_is_credit_0_6_and_540_points_in_bucket_2() -> None:
    swapped = ["Bronze", "Iron", "Steel", "Adamant", "Mithril"]
    credit = credit_for(EXAMPLE["payload"], value_for(EXAMPLE["payload"], swapped))
    assert credit == 0.6
    assert points_for(Scoring.SPEED, credit, 2, None) == 540


@pytest.mark.parametrize(
    ("order", "credit"),
    [
        (METALS, 1.0),
        (list(reversed(METALS)), 0.2),  # only Steel, in the middle
        (["Iron", "Bronze", "Steel", "Mithril", "Adamant"], 0.6),
        (["Adamant", "Bronze", "Iron", "Steel", "Mithril"], 0.0),
    ],
)
def test_credit_is_the_fraction_in_the_right_place(order: list[str], credit: float) -> None:
    assert credit_for(EXAMPLE["payload"], value_for(EXAMPLE["payload"], order)) == credit


def test_two_entries_sharing_a_rank_score_full_credit_in_either_order() -> None:
    first = ["Cook's Assistant", "Demon Slayer", "Dragon Slayer I", "Monkey Madness I"]
    second = ["Demon Slayer", "Cook's Assistant", "Dragon Slayer I", "Monkey Madness I"]
    assert credit_for(TIED, value_for(TIED, first)) == 1.0
    assert credit_for(TIED, value_for(TIED, second)) == 1.0
    # A tied entry is right in either tied place, and only there.
    late = ["Dragon Slayer I", "Demon Slayer", "Cook's Assistant", "Monkey Madness I"]
    assert credit_for(TIED, value_for(TIED, late)) == 0.5


def test_grade_takes_every_answer_at_once() -> None:
    p = EXAMPLE["payload"]
    right, wrong = uuid4(), uuid4()
    credit = ordering.grade(
        p,
        [
            Submission(right, value_for(p, METALS)),
            Submission(wrong, value_for(p, ["Adamant", "Bronze", "Iron", "Steel", "Mithril"])),
        ],
    )
    assert credit == {right: 1.0, wrong: 0.0}


def test_a_payload_in_answer_order_is_not_shown_in_answer_order() -> None:
    assert shown(EXAMPLE["payload"]) != METALS
    for seed in range(300):
        rng = random.Random(seed)
        count = rng.randint(3, 6)
        ranks = dense(rng.randint(1, 3) for _ in range(count))
        if len(set(ranks)) == 1:
            continue
        p = {
            "prompt": f"Question {seed}",
            "ends": ["First", "Last"],
            "entries": [{"text": f"Entry {i}", "rank": r} for i, r in enumerate(ranks)],
            "answer": list(range(count)),
        }
        assert ordering.check(p) == []
        top_to_bottom = list(range(count))
        assert credit_for(p, top_to_bottom) < 1.0, p


def test_a_shuffle_that_lands_on_the_answer_is_rotated_by_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(random.Random, "shuffle", lambda self, items: None)
    assert shown(EXAMPLE["payload"]) == [*METALS[1:], METALS[0]]
    assert shown(TIED) == [
        "Demon Slayer",
        "Dragon Slayer I",
        "Monkey Madness I",
        "Cook's Assistant",
    ]


def test_client_view_gives_the_same_order_every_call() -> None:
    views = [ordering.client_view(copy.deepcopy(EXAMPLE["payload"])) for _ in range(5)]
    assert all(view == views[0] for view in views)


def test_client_view_shows_the_entries_and_the_ends_and_nothing_that_orders_them() -> None:
    pictured = payload(image="item:2349")
    view = ordering.client_view(pictured)
    assert view == {
        "prompt": "Put these metals in order.",
        "ends": ["Weakest", "Strongest"],
        "entries": [{"text": text} for text in shown(pictured)],
    }


def test_reveal_adds_ranks_details_and_the_answer_as_shown_positions() -> None:
    p = EXAMPLE["payload"]
    revealed = ordering.reveal(p)
    assert [entry["text"] for entry in revealed["entries"]] == shown(p)
    assert [revealed["entries"][i]["text"] for i in revealed["answer"]] == METALS
    assert revealed["entries"][revealed["answer"][3]] == {
        "text": "Mithril",
        "rank": 4,
        "detail": "Level 30",
    }
    assert revealed["explanation"] == p["explanation"]


@pytest.mark.parametrize(
    ("value", "parsed"),
    [
        ([4, 3, 2, 1, 0], [4, 3, 2, 1, 0]),
        ([0, 1, 2, 3], None),
        ([0, 1, 2, 3, 3], None),
        ([0, 1, 2, 3, 5], None),
        ([0, 1, 2, 3, True], None),
        ([0, 1, 2, 3, 4.0], None),
        ([0, 1, 2, 3, 4, 0], None),
        ([], None),
        ({"0": 0}, None),
    ],
)
def test_parse_value_takes_every_shown_position_once(value: Any, parsed: Any) -> None:
    assert ordering.parse_value(EXAMPLE["payload"], value) == parsed


def test_check_passes_a_consistent_payload() -> None:
    assert ordering.check(EXAMPLE["payload"]) == []
    assert ordering.check(TIED) == []
    assert ordering.check({**TIED, "answer": [1, 0, 2, 3]}) == []


def test_check_rejects_an_answer_that_does_not_sort_by_rank() -> None:
    assert ordering.check(payload(answer=[0, 1, 3, 2, 4])) == [
        "answer: entries[2] (rank 3) comes after entries[3] (rank 4)"
    ]


def test_check_rejects_an_answer_that_is_not_every_entry_once() -> None:
    message = "answer: must list each of the 5 entries once"
    assert ordering.check(payload(answer=[0, 1, 2, 3])) == [message]
    assert ordering.check(payload(answer=[0, 1, 2, 3, 3])) == [message]
    assert ordering.check(payload(answer=[0, 1, 2, 3, 5])) == [message]


def test_check_rejects_a_payload_that_is_all_ties() -> None:
    entries = [{"text": name, "rank": 1} for name in METALS[:3]]
    assert ordering.check(payload(entries=entries, answer=[0, 1, 2])) == [
        "entries: every rank is the same, so any order is right"
    ]


def test_check_rejects_a_rank_no_entry_has() -> None:
    def ranked(*ranks: int) -> dict[str, Any]:
        entries = [
            {**e, "rank": r} for e, r in zip(EXAMPLE["payload"]["entries"], ranks, strict=True)
        ]
        return payload(entries=entries)

    assert ordering.check(ranked(1, 1, 3, 4, 5)) == ["entries: no entry has rank 2"]
    assert ordering.check(ranked(2, 3, 4, 5, 6)) == ["entries: no entry has rank 1"]
    assert ordering.check(ranked(1, 2, 4, 4, 6)) == ["entries: no entry has rank 3, 5"]


def test_check_rejects_a_duplicate_rank_only_as_a_tie_it_cannot_play() -> None:
    """Equal ranks are a tie, so a shared rank is refused only where it decides nothing."""
    assert ordering.check(payload(entries=TIED["entries"], answer=[0, 1, 2, 3])) == []
    entries = [{**e, "rank": 1 if i < 3 else 2} for i, e in enumerate(TIED["entries"])]
    assert ordering.check({**TIED, "entries": entries, "picks": 2}) == [
        "entries: the first 3 ranks tie, so any 2 of them in any order win"
    ]


def test_check_rejects_two_entries_that_read_the_same() -> None:
    entries = copy.deepcopy(EXAMPLE["payload"]["entries"])
    entries[4]["text"] = " bronze"
    assert ordering.check(payload(entries=entries)) == ["entries[4]: ' bronze' repeats entries[0]"]


def test_with_picks_the_example_validates_and_shows_how_many() -> None:
    picked = {**EXAMPLE, "payload": PICKED}
    schema.validate({**picked, "id": schema.content_id(picked)})
    assert ordering.client_view(PICKED)["picks"] == 3
    assert ordering.check(PICKED) == []


@pytest.mark.parametrize(
    ("order", "credit"),
    [
        (TOP, 1.0),
        (
            ["Scythe of vitur", "Tumeken's shadow", "Twisted bow"],
            0.5,
        ),  # the right three, each misplaced
        (["Twisted bow", "Tumeken's shadow", "Scythe of vitur"], 2 / 3),  # one in place, two half
        (["Twisted bow", "Scythe of vitur", "Lobster"], 2 / 3),  # two in place, one left out
        (["Scythe of vitur", "Abyssal whip", "Tumeken's shadow"], 0.5),  # one in place, one half
        (["Abyssal whip", "Rune platebody", "Lobster"], 0.0),
    ],
)
def test_with_picks_a_right_entry_in_the_wrong_place_earns_half(
    order: list[str], credit: float
) -> None:
    assert credit_for(PICKED, value_for(PICKED, order)) == pytest.approx(credit)


def test_without_picks_a_misplaced_entry_earns_nothing() -> None:
    order = ["Iron", "Steel", "Mithril", "Adamant", "Bronze"]
    assert credit_for(EXAMPLE["payload"], value_for(EXAMPLE["payload"], order)) == 0.0


def test_with_picks_a_tie_at_the_cut_counts_as_picked() -> None:
    entries = copy.deepcopy(PICKED["entries"])
    for entry, rank in zip(entries[3:], [3, 4, 5], strict=True):
        entry["rank"] = rank
    tied = {**PICKED, "entries": entries}
    assert ordering.check(tied) == []
    either = ["Twisted bow", "Scythe of vitur", "Abyssal whip"]
    assert credit_for(tied, value_for(tied, either)) == 1.0
    early = ["Abyssal whip", "Scythe of vitur", "Lobster"]
    assert credit_for(tied, value_for(tied, early)) == pytest.approx(1.5 / 3)


def test_with_picks_exactly_that_many_distinct_positions_are_taken() -> None:
    assert ordering.parse_value(PICKED, [5, 0, 2]) == [5, 0, 2]
    assert ordering.parse_value(PICKED, [5, 0, 2, 1]) is None
    assert ordering.parse_value(PICKED, [5, 0]) is None
    assert ordering.parse_value(PICKED, [5, 5, 2]) is None
    assert ordering.parse_value(PICKED, [5, 0, 6]) is None
    assert ordering.parse_value(PICKED, list(range(6))) is None


def test_with_picks_the_shown_order_never_starts_with_the_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for seed in range(300):
        rng = random.Random(seed)
        count = rng.randint(3, 6)
        picks = rng.randint(2, count - 1)
        ranks = dense(rng.randint(1, 4) for _ in range(count))
        p = {
            "prompt": f"Question {seed}",
            "ends": ["First", "Last"],
            "entries": [{"text": f"Entry {i}", "rank": r} for i, r in enumerate(ranks)],
            "answer": list(range(count)),
            "picks": picks,
        }
        if ordering.check(p):
            continue
        assert credit_for(p, list(range(picks))) < 1.0, p
    monkeypatch.setattr(random.Random, "shuffle", lambda self, items: None)
    assert shown(PICKED)[:3] == ["Scythe of vitur", "Tumeken's shadow", "Abyssal whip"]


def test_check_rejects_picks_that_is_not_fewer_than_the_entries() -> None:
    assert ordering.check(payload(picks=5)) == [
        "picks: is 5 but there are 5 entries; leave it out to order all"
    ]


def test_check_rejects_picks_where_one_more_than_picked_all_tie() -> None:
    def ranked(*ranks: int) -> dict[str, Any]:
        entries = [{**e, "rank": r} for e, r in zip(PICKED["entries"], ranks, strict=True)]
        return {**PICKED, "entries": entries, "picks": 2}

    assert ordering.check(ranked(1, 2, 2, 2, 3, 4)) == []
    assert ordering.check(ranked(1, 1, 1, 2, 3, 4)) == [
        "entries: the first 3 ranks tie, so any 2 of them in any order win"
    ]


@pytest.mark.parametrize(
    ("mutate", "path"),
    [
        (lambda p: p.update(entries=p["entries"][:2], answer=[0, 1]), "$.payload.entries"),
        (
            lambda p: p.update(entries=[{"text": str(n), "rank": 1} for n in range(7)]),
            "$.payload.entries",
        ),
        (lambda p: p["entries"][0].update(rank=0), "$.payload.entries[0].rank"),
        (lambda p: p["entries"][0].update(rank=7), "$.payload.entries[0].rank"),
        (lambda p: p["entries"][0].update(detail="x" * 41), "$.payload.entries[0].detail"),
        (lambda p: p["entries"][0].update(key="a"), "$.payload.entries[0]"),
        (lambda p: p.update(ends=["Weakest"]), "$.payload.ends"),
        (lambda p: p.update(ends=["Weakest", ""]), "$.payload.ends[1]"),
        (lambda p: p.update(answer=[0, 0, 1, 2, 3]), "$.payload.answer"),
        (lambda p: p.pop("ends"), "$.payload"),
        (lambda p: p.update(picks=1), "$.payload.picks"),
        (lambda p: p.update(picks=6), "$.payload.picks"),
    ],
)
def test_schema_rejects(mutate: Any, path: str) -> None:
    q = copy.deepcopy(EXAMPLE)
    mutate(q["payload"])
    q["id"] = schema.content_id(q)
    problems = schema.schema_errors(q)
    assert any(p.startswith(path + ":") or p.startswith(path + "[") for p in problems), problems


@pytest.fixture
def ordering_round(app: FastAPI, client: TestClient) -> Iterator[str]:
    """A round of the one ``EXAMPLE`` question, so the shipped pack's draw cannot vary it."""
    name = "ordering_round"
    MODES[name] = Mode(id=name, types=frozenset({"ordering"}))
    question = {**EXAMPLE, "mode": name}
    app.state.packs.append(
        Pack(
            name=name,
            generated_at="2026-10-04T00:00:00Z",
            questions=(question,),
            path=Path(f"{name}.json"),
        )
    )
    try:
        yield name
    finally:
        del MODES[name]
        app.state.packs.remove(next(p for p in app.state.packs if p.name == name))


def test_a_question_plays_end_to_end(table, ordering_round: str, db) -> None:
    game = table("Zezima", "Woox", modes=[ordering_round], questions=1, seconds=20)
    admin, zezima, woox = game.seats
    game.start()
    views = [message["question"]["view"] for message in game.opened(0)]
    assert all(view == views[0] for view in views)
    order = [entry["text"] for entry in views[0]["entries"]]
    assert order == shown(EXAMPLE["payload"])
    assert all(set(entry) == {"text"} for entry in views[0]["entries"])

    right = [order.index(text) for text in METALS]
    three = [order.index(t) for t in ["Bronze", "Iron", "Steel", "Adamant", "Mithril"]]
    answer_after(game, zezima, 0, right, 1.0)
    game.answer(woox, 0, right[:4])
    assert woox.take("error")["code"] == "bad_value"
    answer_after(game, woox, 0, three, 3.0)
    game.skip()

    closed = admin.take("question_closed")
    assert closed["reveal"]["answer"] == right
    full, partial = closed["results"][zezima.id], closed["results"][woox.id]
    assert full["value"] == right and full["correct"] is True and full["points"] == 1000
    assert partial["value"] == three and partial["correct"] is False
    assert partial["credit"] == 0.6 and partial["points"] == 540
