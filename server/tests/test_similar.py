"""Similar questions: the score, the player's lookup, and the matches in the operator's queue."""

from collections.abc import Iterator
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.http.ratelimit import SIMILAR_PER_HOUR, RateLimiter
from app.main import create_app
from app.questions.packs import Pack, mode_questions
from app.similar import THRESHOLD, TOP, features, score
from tests.conftest import BASE
from tests.packs import PACKS_DIR
from tests.test_suggestions import TOKEN, WIKI, queue, suggest


@pytest.fixture
def app(test_db_dsn: str, dist: Path) -> FastAPI:
    """The conftest's app, with the admin view turned on."""
    settings = Settings(
        _env_file=None,
        database_url=test_db_dsn,
        packs_dir=PACKS_DIR,
        public_base_url=BASE,
        admin_token=TOKEN,
    )
    return create_app(settings, dist)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


CHOICE = {
    "type": "multiple_choice",
    "mode": "bestiary",
    "payload": {
        "prompt": "Which boss guards the entrance to the Kalphite Lair?",
        "options": ["Kalphite Queen", "Kree'arra", "Zulrah", "Vorkath"],
        "answer_index": 0,
    },
}


MATCHING = {
    "type": "matching",
    "payload": {
        "prompt": "Match each boss to where it is fought.",
        "fields": [{"text": "Zulrah"}, {"text": "Vorkath"}, {"icon": "item:12004"}],
        "options": [{"text": "Zul-Andra"}, {"text": "Ungael"}, {"text": "Kraken Cove"}],
        "answer": [0, 1, 2],
    },
}


def _score(a: dict[str, Any], b: dict[str, Any]) -> int:
    return score(features(a), features(b))


def _with(question: dict[str, Any], **payload: Any) -> dict[str, Any]:
    changed = deepcopy(question)
    changed["payload"].update(payload)
    return changed


# --- the score ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "question",
    [
        CHOICE,
        {
            "type": "pick_all_that_apply",
            "payload": {
                "prompt": "Which of these are Barrows brothers?",
                "options": ["Dharok", "Torag", "Hazelmere", "Karil"],
                "answer_indices": [0, 1, 3],
            },
        },
        {
            "type": "ordering",
            "payload": {
                "prompt": "Oldest quest first",
                "ends": ["Oldest", "Newest"],
                "entries": [
                    {"text": "Cook's Assistant", "rank": 1},
                    {"text": "Dragon Slayer", "rank": 2},
                    {"text": "Song of the Elves", "rank": 3},
                ],
                "answer": [0, 1, 2],
            },
        },
        {"type": "free_text", "payload": {"prompt": "Who runs the inn?", "accepted": ["Bob"]}},
        {"type": "closest_number", "payload": {"prompt": "Max total level?", "answer": 2277}},
        MATCHING,
    ],
)
def test_an_identical_question_scores_100(question: dict[str, Any]) -> None:
    assert _score(question, deepcopy(question)) == 100


def test_case_and_punctuation_change_nothing() -> None:
    shouted = _with(
        CHOICE,
        prompt="WHICH boss guards the entrance to the Kalphite Lair",
        options=["kalphite queen!", "Kree'arra", "Zulrah", "Vorkath"],
    )
    assert _score(CHOICE, shouted) == 100


def test_an_unrelated_question_scores_under_the_threshold() -> None:
    other = {
        "type": "multiple_choice",
        "payload": {
            "prompt": "What colour is a cabbage?",
            "options": ["Green", "Red"],
            "answer_index": 0,
        },
    }
    assert _score(CHOICE, other) < THRESHOLD


def test_a_reworded_question_with_the_same_answer_still_matches() -> None:
    reworded = _with(CHOICE, prompt="Which boss guards the Kalphite Lair's entrance?")
    assert THRESHOLD <= _score(CHOICE, reworded) < 100


def test_odd_one_out_with_its_options_shuffled_scores_100() -> None:
    odd = {
        "type": "multiple_choice",
        "mode": "odd_one_out",
        "payload": {
            "prompt": "Which one doesn't belong?",
            "options": ["Dharok", "Torag", "Hazelmere", "Karil"],
            "answer_index": 2,
        },
    }
    shuffled = _with(odd, options=["Karil", "Hazelmere", "Dharok", "Torag"], answer_index=1)
    assert _score(odd, shuffled) == 100
    assert _score(odd, _with(odd, options=["Ahrim", "Guthan", "Verac", "Zezima"])) == 0


def test_a_free_text_answer_matches_on_any_accepted_spelling() -> None:
    asked = {"type": "free_text", "payload": {"prompt": "Who?", "accepted": ["Kril", "K'ril"]}}
    assert _score(asked, _with(asked, accepted=["k'ril tsutsaroth", "k'ril"])) == 100


def test_a_matching_answer_is_its_pairs_whatever_order_they_are_written_in() -> None:
    written = _with(
        MATCHING,
        options=[{"text": "Kraken Cove"}, {"text": "Ungael"}, {"text": "Zul-Andra"}],
        answer=[2, 1, 0],
    )
    assert _score(MATCHING, written) == 100
    swapped = _with(MATCHING, answer=[1, 0, 2])
    assert THRESHOLD <= _score(MATCHING, swapped) < 100


def test_questions_of_different_types_compare_their_prompts_alone() -> None:
    typed = {
        "type": "free_text",
        "payload": {"prompt": CHOICE["payload"]["prompt"], "accepted": ["x"]},
    }
    assert _score(CHOICE, typed) == 100


def test_whos_that_npc_is_the_npc() -> None:
    pack = {
        "type": "pick_from_list",
        "mode": "whos_that_npc",
        "payload": {
            "prompt": "Who's that NPC?",
            "vocab": "npcs",
            "answer_id": 7241,
            "subject": {"name": "Abyssal demon"},
        },
    }
    named = {
        "type": "pick_from_list",
        "mode": "whos_that_npc",
        "payload": {"prompt": "Who's that NPC?", "subject": {"name": "abyssal DEMON"}},
    }
    assert _score(pack, deepcopy(pack)) == 100
    assert _score(pack, named) == 100
    assert _score(pack, _with(named, subject={"name": "Goblin"})) == 0


def test_a_render_is_the_npc_it_pictures_shadow_or_render() -> None:
    render = {
        "type": "multiple_choice",
        "mode": "whos_that_npc",
        "payload": {
            "prompt": "Who's that NPC?",
            "options": ["Greater demon", "Abyssal demon", "Black demon", "Lesser demon"],
            "answer_index": 1,
            "image": "npc:7241",
        },
    }
    shadow = {
        "type": "pick_from_list",
        "mode": "whos_that_npc",
        "payload": {"prompt": "Who's that NPC?", "vocab": "npcs", "answer_id": 7241},
    }
    suggested = {
        "type": "multiple_choice",
        "mode": "whos_that_npc",
        "payload": {
            **render["payload"],
            "options": ["Abyssal Demon", "Imp", "Jad", "Zulrah"],
            "answer_index": 0,
        },
    }
    del suggested["payload"]["image"]
    assert _score(render, shadow) == 100
    assert _score(render, suggested) == 100
    assert _score(render, _with(suggested, answer_index=1)) == 0


# --- the player's lookup ----------------------------------------------------------------


def _bestiary(app: FastAPI) -> dict[str, Any]:
    return mode_questions(app.state.packs, "bestiary")[0]


def _content(question: dict[str, Any]) -> dict[str, Any]:
    return {key: question[key] for key in ("type", "mode", "payload")}


def similar(client: TestClient, content: dict[str, Any]) -> list[dict[str, Any]]:
    response = client.post("/api/suggestions/similar", json={"content": content})
    assert response.status_code == 200, response.text
    return response.json()["matches"]


def test_a_copied_pack_question_is_named_by_label(app: FastAPI, client: TestClient) -> None:
    copied = _bestiary(app)
    matches = similar(client, _content(copied))
    assert matches[0] == {"mode": "bestiary", "label": copied["payload"]["prompt"], "score": 100}
    assert all(set(match) == {"mode", "label", "score"} for match in matches)


def test_a_question_with_no_round_is_looked_up_too(app: FastAPI, client: TestClient) -> None:
    content = _content(_bestiary(app))
    del content["mode"]
    assert similar(client, content)[0]["score"] == 100


def test_a_new_question_matches_nothing(client: TestClient) -> None:
    assert similar(client, CHOICE) == []


def test_at_most_three_matches_none_under_the_threshold(app: FastAPI, client: TestClient) -> None:
    copied = _bestiary(app)
    near = [
        {**copied, "id": f"q_near{i}", "payload": {**copied["payload"], "prompt": prompt}}
        for i, prompt in enumerate(
            f"{copied['payload']['prompt']}{tail}" for tail in (" Really?", " Truly?", " Hm?", "!!")
        )
    ]
    app.state.packs = [*app.state.packs, Pack("near", None, tuple(near), Path("near.json"))]
    matches = similar(client, _content(copied))
    assert len(matches) == TOP
    assert all(match["score"] >= THRESHOLD for match in matches)


def test_suggestions_are_never_matched(client: TestClient) -> None:
    suggest(
        client,
        {
            "kind": "question",
            "content": {**CHOICE, "wiki": WIKI},
            "credit": "Woox",
            "credit_shown": False,
        },
    )
    assert similar(client, CHOICE) == []


def test_a_bad_body_is_a_422(client: TestClient) -> None:
    for content in ({"type": "multiple_choice"}, {**CHOICE, "mode": "more_less"}):
        response = client.post("/api/suggestions/similar", json={"content": content})
        assert response.status_code == 422
        assert response.json()["code"] == "bad_suggestion"
    response = client.post("/api/suggestions/similar", json={"content": CHOICE, "credit": "x"})
    assert response.status_code == 422


def test_a_lookup_over_the_hourly_limit_is_a_429(app: FastAPI, client: TestClient) -> None:
    assert SIMILAR_PER_HOUR == 120
    app.state.similar = RateLimiter(limit=1)
    similar(client, CHOICE)
    response = client.post("/api/suggestions/similar", json={"content": CHOICE})
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"


# --- the operator's queue ---------------------------------------------------------------


def _question(content: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "question",
        "content": {**content, "wiki": WIKI},
        "credit": "Woox",
        "credit_shown": False,
    }


def test_the_queue_matches_packs_and_other_suggestions_never_itself(
    app: FastAPI, client: TestClient
) -> None:
    copied = _bestiary(app)
    from_pack = suggest(client, _question(_content(copied)))
    first = suggest(client, _question(CHOICE))
    second = suggest(
        client, _question(_with(CHOICE, prompt="Which boss guards the Kalphite Lair?"))
    )
    rows = {row["id"]: row for row in queue(client)["suggestions"]}

    pack_match = rows[from_pack]["matches"][0]
    assert pack_match["score"] == 100 and pack_match["suggestion"] is None
    assert pack_match["question"]["payload"]["answer_index"] == copied["payload"]["answer_index"]

    matched = rows[first]["matches"]
    assert [match["suggestion"] for match in matched] == [second]
    assert matched[0]["question"]["payload"]["options"][0] == "Kalphite Queen"
    assert [match["suggestion"] for match in rows[second]["matches"]] == [first]
    assert all(
        match["suggestion"] != row_id for row_id, row in rows.items() for match in row["matches"]
    )


def test_items_have_no_matches(client: TestClient) -> None:
    suggest(
        client,
        {
            "kind": "item",
            "content": {"name": "Ancient mace"},
            "credit": "Woox",
            "credit_shown": False,
        },
    )
    assert queue(client)["suggestions"][0]["matches"] == []


def test_a_verse_is_flagged_for_its_item_and_otherwise_read_as_any_question() -> None:
    pack = {
        "type": "pick_from_list",
        "mode": "forgetful_bard",
        "payload": {
            "prompt": "Through sixty-three waves of TzHaar I came.",
            "vocab": "items",
            "answer_id": 6570,
            "subject": {"name": "Fire cape"},
        },
    }
    named = {
        "type": "pick_from_list",
        "mode": "forgetful_bard",
        "payload": {"prompt": "A wholly other song.", "subject": {"name": "fire CAPE"}},
    }
    assert _score(pack, named) == 100
    assert _score(pack, _with(named, subject={"name": "Abyssal whip"})) < 60
    copied = {"prompt": pack["payload"]["prompt"], "subject": {"name": "Abyssal whip"}}
    assert _score(pack, {**named, "payload": copied}) >= 60
