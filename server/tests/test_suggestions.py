"""Suggestions: what a player may send, the limit on sending, and the operator's queue."""

import re
from collections.abc import Iterator
from copy import deepcopy
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.config import Settings
from app.http.ratelimit import SUGGESTIONS_PER_HOUR, RateLimiter, client_key
from app.main import create_app
from app.modes import round_modes
from app.questions.submission import Submission
from app.questions.types import matching, multiple_choice
from app.rooms import queries
from app.suggestions import (
    FIXED_PROMPTS,
    INTRO_MODES,
    NO_DIFFICULTY_MODES,
    NO_EXPLANATION_MODES,
    PICTURE_ITEM_MODES,
    QUESTION_MODES,
    QUOTE_MODES,
    check,
)
from tests import client_source
from tests.conftest import BASE
from tests.packs import PACKS_DIR

TOKEN = "0123456789abcdef0123456789abcdef"
BEARER = {"Authorization": f"Bearer {TOKEN}"}
WIKI = "https://oldschool.runescape.wiki/w/Barrows_Brothers"

EVENT = {
    "kind": "question",
    "content": {
        "type": "multiple_choice",
        "mode": "random_event",
        "random_event": "bob",
        "wiki": WIKI,
        "payload": {
            "prompt": "Which of these is not a Barrows brother?",
            "options": ["Dharok", "Torag", "Hazelmere", "Karil"],
            "answer_index": 2,
        },
    },
    "credit": "AFKFisher",
    "credit_shown": True,
}
ODD = {
    "kind": "question",
    "content": {
        "type": "multiple_choice",
        "mode": "odd_one_out",
        "wiki": WIKI,
        "payload": {
            "prompt": "Which one doesn't belong?",
            "options": ["Dharok", "Torag", "Hazelmere", "Karil"],
            "answer_index": 2,
        },
    },
    "credit": "AFKFisher",
    "credit_shown": True,
}
# Every round a player may write for is built, so ``unbuilt_round`` offers one that is not.
UNBUILT = deepcopy(EVENT)
UNBUILT["content"]["mode"] = "zoom_quiz"
del UNBUILT["content"]["random_event"]
EXAMINE = {
    "kind": "question",
    "content": {
        "type": "multiple_choice",
        "mode": "guess_examine",
        "wiki": "https://oldschool.runescape.wiki/w/Cabbage",
        "payload": {
            "prompt": "Yuck, I don't like cabbage.",
            "options": ["Onion", "Cabbage", "Potato", "Cabbage seed"],
            "answer_index": 1,
        },
    },
    "credit": "AFKFisher",
    "credit_shown": False,
}
SORT_IT_OUT = {
    "kind": "question",
    "content": {
        "type": "ordering",
        "mode": "sort_it_out",
        "wiki": "https://oldschool.runescape.wiki/w/Crafting",
        "payload": {
            "prompt": "Sort these gems by the Crafting level that cuts them.",
            "ends": ["Lowest", "Highest"],
            "entries": [
                {"text": "Sapphire", "rank": 1, "detail": "Level 20"},
                {"text": "Emerald", "rank": 2, "detail": "Level 27"},
                {"text": "Ruby", "rank": 3, "detail": "Level 34"},
                {"text": "Diamond", "rank": 4, "detail": "Level 43"},
            ],
            "answer": [0, 1, 2, 3],
            "picks": 3,
            "explanation": "Twenty, 27, 34 and 43.",
        },
    },
    "credit": "AFKFisher",
    "credit_shown": False,
}
MATCHING = {
    "kind": "question",
    "content": {
        "type": "matching",
        "mode": "bestiary",
        "wiki": "https://oldschool.runescape.wiki/w/Bosses",
        "payload": {
            "prompt": "Match each boss to where it is fought.",
            "fields": [{"text": "Zulrah"}, {"text": "Vorkath"}, {"text": "Kraken"}],
            "options": [
                {"text": "Zul-Andra", "detail": "Tirannwn"},
                {"text": "Ungael"},
                {"text": "Kraken Cove"},
                {"text": "Lithkren Vault"},
            ],
            "answer": [0, 1, 2],
        },
    },
    "credit": "AFKFisher",
    "credit_shown": False,
}
# Streamer quotes and facts have no wiki page: a clip is their source.
QUOTE = {
    "kind": "question",
    "content": {
        "type": "multiple_choice",
        "mode": "who_said_that",
        "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "payload": {
            "prompt": "Who said this?",
            "quote": "Never gonna give you up",
            "options": ["Rick", "Zezima", "B0aty"],
            "answer_index": 0,
        },
    },
    "credit": "AFKFisher",
    "credit_shown": False,
}
# Release Order is not built yet, so this one waits in the queue as not playable.
RELEASE_ORDER = {
    **SORT_IT_OUT,
    "content": {
        **SORT_IT_OUT["content"],
        "mode": "release_order",
        "wiki": "https://oldschool.runescape.wiki/w/Update:Quests",
        "payload": {
            "prompt": "Put these quests in the order they came out.",
            "ends": ["Oldest", "Newest"],
            "entries": [
                {"text": "Cook's Assistant", "rank": 1, "detail": "4 January 2001"},
                {"text": "Sheep Shearer", "rank": 1, "detail": "4 January 2001"},
                {"text": "Dragon Slayer", "rank": 2, "detail": "4 January 2001"},
            ],
            "answer": [0, 1, 2],
            "explanation": "Cook's Assistant and Sheep Shearer came out on one day.",
        },
    },
}
ITEM = {
    "kind": "item",
    "content": {"name": " Ancient mace "},
    "credit": "Woox",
    "credit_shown": False,
}

ADMIN_ROUTES = (
    ("GET", "/api/admin/suggestions"),
    ("PUT", "/api/admin/suggestions/00000000-0000-0000-0000-000000000000"),
    ("POST", "/api/admin/suggestions/00000000-0000-0000-0000-000000000000/status"),
    ("POST", "/api/admin/suggestions/export"),
    ("POST", "/api/admin/suggestions/imported"),
)


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


def suggest(client: TestClient, body: dict[str, Any]) -> str:
    response = client.post("/api/suggestions", json=body)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def queue(client: TestClient, status: str = "pending") -> dict[str, Any]:
    response = client.get(f"/api/admin/suggestions?status={status}", headers=BEARER)
    assert response.status_code == 200, response.text
    return response.json()


def approve(client: TestClient, suggestion: str) -> None:
    response = client.post(
        f"/api/admin/suggestions/{suggestion}/status", json={"status": "approved"}, headers=BEARER
    )
    assert response.status_code == 200, response.text


def export(client: TestClient, status: str = "approved") -> dict[str, Any]:
    response = client.post("/api/admin/suggestions/export", json={"status": status}, headers=BEARER)
    assert response.status_code == 200, response.text
    assert response.headers["content-disposition"].startswith("attachment;")
    return response.json()


# --- what a player may send -----------------------------------------------------------


@pytest.fixture
def unbuilt_round(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(QUESTION_MODES, "zoom_quiz", frozenset({"multiple_choice"}))


@pytest.mark.usefixtures("unbuilt_round")
def test_each_kind_is_stored_as_pending_with_its_credit(client: TestClient) -> None:
    for body in (EVENT, UNBUILT, EXAMINE, ITEM):
        suggest(client, body)
    rows = queue(client)["suggestions"]
    assert [row["kind"] for row in rows] == ["question", "question", "question", "item"]
    assert [row["playable"] for row in rows] == [True, False, True, True]
    assert rows[3]["content"] == {"name": "Ancient mace"}
    assert (rows[0]["credit"], rows[0]["credit_shown"]) == ("AFKFisher", True)
    assert queue(client)["counts"] == {"pending": 4, "approved": 0, "rejected": 0, "imported": 0}


def test_an_examine_is_a_question_of_four_to_six_names(client: TestClient) -> None:
    for options in (["Cabbage", "Onion", "Potato", "Leek"], ["Cabbage", *"ABCDE"]):
        suggest(client, _examine(options=options, answer_index=0))
    assert len(queue(client)["suggestions"]) == 2


def _with(body: dict[str, Any], **content: Any) -> dict[str, Any]:
    changed = deepcopy(body)
    changed["content"].update(content)
    return changed


def _examine(**payload: Any) -> dict[str, Any]:
    return _with(EXAMINE, payload={**EXAMINE["content"]["payload"], **payload})


def _ordering(**payload: Any) -> dict[str, Any]:
    return _with(SORT_IT_OUT, payload={**SORT_IT_OUT["content"]["payload"], **payload})


def _without(body: dict[str, Any], key: str) -> dict[str, Any]:
    changed = deepcopy(body)
    del changed["content"][key]
    return changed


EVENT_ORDERING = _with(
    SORT_IT_OUT,
    mode="random_event",
    random_event="bob",
    payload={**SORT_IT_OUT["content"]["payload"], "intro": "Gems, adventurer!"},
)


@pytest.mark.parametrize(
    "body",
    [
        _with(EVENT, payload={**EVENT["content"]["payload"], "options": ["One"] * 7}),
        _with(EVENT, payload={**EVENT["content"]["payload"], "answer_index": 9}),
        _with(EVENT, payload={**EVENT["content"]["payload"], "prompt": ""}),
        _with(EVENT, wiki="https://example.com/w/Bob"),
        _without(EVENT, "wiki"),
        _without(EVENT, "random_event"),
        _with(EVENT, random_event="nobody_at_all"),
        _with(EVENT, mode="release_order"),
        _with(EVENT, type="pick_all_that_apply"),
        _with(UNBUILT, type="free_text"),
        _with(UNBUILT, random_event="bob"),
        _with(EVENT, extra="field"),
        _with(SORT_IT_OUT, type="multiple_choice"),
        _without(QUOTE, "source_url"),
        _with(QUOTE, source_url="http://example.com/clip"),
        _with(QUOTE, source_url="ftp://example.com/clip"),
        _with(QUOTE, source_url=7),
        _with(QUOTE, wiki="https://example.com/w/Rick"),
        _with(QUOTE, mode="bestiary"),
        _with(EVENT, payload={**EVENT["content"]["payload"], "quote": "Said by Bob"}),
        _with(QUOTE, payload={**QUOTE["content"]["payload"], "quote": ""}),
        _with(QUOTE, payload={**QUOTE["content"]["payload"], "quote": "x" * 301}),
        _with(RELEASE_ORDER, type="multiple_choice"),
        _with(RELEASE_ORDER, type="free_text"),
        _with(SORT_IT_OUT, mode="drop_table"),
        _without(EVENT_ORDERING, "random_event"),
        _with(EVENT_ORDERING, random_event="nobody_at_all"),
        _with(EVENT_ORDERING, payload={**EVENT_ORDERING["content"]["payload"], "intro": ""}),
        _ordering(entries=SORT_IT_OUT["content"]["payload"]["entries"][:2], answer=[0, 1]),
        _ordering(ends=["Lowest"]),
        _ordering(prompt=""),
        # What ``ordering.check`` refuses, as a pack question is.
        _ordering(answer=[1, 0, 2, 3]),
        _ordering(
            entries=[
                {"text": "Sapphire", "rank": 1},
                {"text": "Emerald", "rank": 3},
                {"text": "Ruby", "rank": 4},
                {"text": "Diamond", "rank": 5},
            ]
        ),
        _ordering(picks=4),
        _ordering(
            entries=[
                {"text": text, "rank": 1} for text in ("Sapphire", "Emerald", "Ruby", "Diamond")
            ]
        ),
        _with(ODD, payload={**ODD["content"]["payload"], "prompt": "Which is not a brother?"}),
        _examine(prompt="x" * 301),
        _examine(explanation="Cabbages are yucky."),
        _examine(options=["Cabbage", "Onion", "Potato"], answer_index=0),
        _examine(options=["Cabbage", "Onion", "Potato", " cabbage "]),
        _with(_without(EXAMINE, "wiki"), source_url="https://example.com/cabbage"),
        _with(EXAMINE, type="free_text", payload={"prompt": "Yuck.", "accepted": ["Cabbage"]}),
        _with(EVENT, payload={**EVENT["content"]["payload"], "intro": "x" * 151}),
        _with(EVENT, payload={**EVENT["content"]["payload"], "image": "https://example.com/a.png"}),
        _with(EVENT, payload={**EVENT["content"]["payload"], "image": "monster:12"}),
        _with(EVENT, payload={**EVENT["content"]["payload"], "image": "item:"}),
        _with(QUOTE, payload={**QUOTE["content"]["payload"], "intro": "Ahoy."}),
        _with(ITEM, name=""),
        _with(ITEM, name="x" * 81),
        _with(ITEM, name="Nul\x00"),
        _with(ITEM, name=" abyssal WHIP "),
        {**ITEM, "credit_shown": True},
    ],
)
def test_what_the_schema_refuses_is_a_422(client: TestClient, body: dict[str, Any]) -> None:
    response = client.post("/api/suggestions", json=body)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "bad_suggestion"
    assert queue(client)["suggestions"] == []


def test_a_sort_it_out_suggestion_is_stored_and_playable(client: TestClient) -> None:
    tied = [
        {"text": "Sapphire", "rank": 1},
        {"text": "Emerald", "rank": 1},
        {"text": "Ruby", "rank": 2},
        {"text": "Diamond", "rank": 3},
    ]
    for body in (SORT_IT_OUT, _ordering(entries=tied), _ordering(entries=tied, picks=2)):
        suggest(client, body)
    rows = queue(client)["suggestions"]
    assert [row["content"]["payload"].get("picks") for row in rows] == [3, 3, 2]
    assert all(row["playable"] for row in rows)


def test_a_question_needs_a_wiki_page_or_another_source(client: TestClient) -> None:
    both = _with(QUOTE, wiki=WIKI)
    for body in (QUOTE, both, _with(EVENT, source_url="https://example.com/clip")):
        suggest(client, body)
    rows = queue(client)["suggestions"]
    assert [(r["content"].get("wiki"), r["content"].get("source_url")) for r in rows] == [
        (None, QUOTE["content"]["source_url"]),
        (WIKI, QUOTE["content"]["source_url"]),
        (WIKI, "https://example.com/clip"),
    ]
    assert all(r["playable"] for r in rows)


def test_the_form_offers_a_quote_only_to_the_rounds_that_show_one() -> None:
    source = client_source.read("lib/suggestions.ts")
    rounds = re.search(r"const QUOTE_ROUNDS = \[([^\]]*)\]", source)
    assert rounds is not None
    assert set(re.findall(r"'([a-z_]+)'", rounds.group(1))) == set(QUOTE_MODES)


def test_the_form_offers_no_explanation_to_the_rounds_that_show_none() -> None:
    source = client_source.read("lib/suggestions.ts")
    rounds = re.search(r"const NO_EXPLANATION_ROUNDS = \[([^\]]*)\]", source)
    assert rounds is not None
    assert set(re.findall(r"'([a-z_]+)'", rounds.group(1))) == set(NO_EXPLANATION_MODES)


def test_the_form_offers_no_difficulty_to_the_rounds_that_ignore_it() -> None:
    source = client_source.read("lib/suggestions.ts")
    rounds = re.search(r"const NO_DIFFICULTY_ROUNDS = \[([^\]]*)\]", source)
    assert rounds is not None
    assert set(re.findall(r"'([a-z_]+)'", rounds.group(1))) == set(NO_DIFFICULTY_MODES)


def test_an_odd_one_out_question_asks_the_rounds_own_prompt() -> None:
    assert (
        check("question", ODD["content"], True)["payload"]["prompt"] == FIXED_PROMPTS["odd_one_out"]
    )


def test_the_form_holds_the_same_rounds_to_the_same_prompts() -> None:
    source = client_source.read("lib/suggestions.ts")
    fixed = re.findall(r"(\w+): \{ text: \"([^\"]*)\", fixed: true \}", source)
    assert dict(fixed) == FIXED_PROMPTS


def test_a_release_order_suggestion_waits_as_not_playable(client: TestClient) -> None:
    approve(client, suggest(client, RELEASE_ORDER))
    (row,) = queue(client, "approved")["suggestions"]
    assert row["content"] == RELEASE_ORDER["content"]
    assert row["playable"] is False
    assert export(client)["questions"] == []


@pytest.mark.parametrize("credit", ["", "   ", "x" * 13, "Zezima<b>", "名前"])
def test_a_credit_that_fails_the_name_rules_is_a_422(client: TestClient, credit: str) -> None:
    response = client.post("/api/suggestions", json={**EVENT, "credit": credit})
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "bad_name"


def test_a_credit_is_held_like_a_display_name(client: TestClient) -> None:
    suggest(client, {**ITEM, "credit": "  Woox   the  Pro "})
    assert queue(client)["suggestions"][0]["credit"] == "Woox the Pro"


def test_html_is_kept_as_typed(client: TestClient) -> None:
    body = _with(EVENT, payload={**EVENT["content"]["payload"], "prompt": "<b>Bold</b>?"})
    suggest(client, body)
    assert queue(client)["suggestions"][0]["content"]["payload"]["prompt"] == "<b>Bold</b>?"


DROP_RATE = {
    "kind": "question",
    "content": {
        "type": "closest_number",
        "mode": "drop_table",
        "wiki": "https://oldschool.runescape.wiki/w/Dragon_warhammer",
        "payload": {
            "prompt": "A Lizardman shaman drops a Dragon warhammer once in how many kills?",
            "answer": 3000,
            "unit": "kills",
        },
    },
    "credit": "AFKFisher",
    "credit_shown": False,
}


PICK_ALL = _with(
    DROP_RATE,
    type="pick_all_that_apply",
    wiki="https://oldschool.runescape.wiki/w/Dragon_pickaxe",
    payload={
        "prompt": "Which of these drop the Dragon pickaxe?",
        "options": ["King Black Dragon", "Giant Mole", "Kalphite Queen", "Zulrah"],
        "answer_indices": [0, 2],
        "picks": 2,
    },
)


def test_drop_table_takes_a_drop_rate_and_a_pick_all(client: TestClient) -> None:
    suggest(client, DROP_RATE)
    suggest(client, PICK_ALL)
    stored = queue(client)["suggestions"][1]["content"]
    assert stored["type"] == "pick_all_that_apply"
    assert stored["payload"]["answer_indices"] == [0, 2]


TYPED = _with(
    DROP_RATE,
    type="free_text",
    wiki="https://oldschool.runescape.wiki/w/Abyssal_demon",
    payload={
        "prompt": "Which monster drops the Abyssal whip?",
        "accepted": ["Abyssal demon", "Abyssal demons"],
        "max_distance": 2,
    },
)


@pytest.mark.parametrize(
    "body",
    [
        TYPED,
        _with(TYPED, mode="bestiary"),
        _with(SORT_IT_OUT, mode="bestiary"),
        MATCHING,
        _with(MATCHING, mode="drop_table"),
    ],
    ids=[
        "drop_table_free_text",
        "bestiary_free_text",
        "bestiary_ordering",
        "bestiary_matching",
        "drop_table_matching",
    ],
)
def test_bestiary_and_drop_table_take_these_types_and_play_them(
    client: TestClient, body: dict[str, Any]
) -> None:
    approve(client, suggest(client, body))
    (row,) = queue(client, "approved")["suggestions"]
    assert row["content"] == body["content"]
    assert row["playable"] is True
    (question,) = export(client)["questions"]
    content = body["content"]
    assert (question["mode"], question["type"]) == (content["mode"], content["type"])
    assert question["payload"] == body["content"]["payload"]


@pytest.mark.parametrize(
    ("body", "said"),
    [
        (_with(MATCHING, mode="who_said_that"), "'matching' is not offered for 'who_said_that'"),
        (_with(MATCHING, mode="sort_it_out"), "'matching' is not offered for 'sort_it_out'"),
        (
            _with(
                MATCHING,
                payload={
                    **MATCHING["content"]["payload"],
                    "fields": [{"text": "Zulrah"}, {"icon": "item:12004"}, {"text": "Kraken"}],
                },
            ),
            "$.payload.fields[1].icon",
        ),
        (
            _with(MATCHING, payload={**MATCHING["content"]["payload"], "answer": [0, 1, 1]}),
            "uses an option on two fields",
        ),
    ],
    ids=["a round without it", "a sorting round", "an icon", "an option used twice"],
)
def test_a_matching_suggestion_is_refused_where_it_does_not_fit(
    client: TestClient, body: dict[str, Any], said: str
) -> None:
    response = client.post("/api/suggestions", json=body)
    assert response.status_code == 422
    assert said in response.text


def test_an_npc_may_ask_a_matching_and_one_may_come_with_no_round(client: TestClient) -> None:
    npc = _with(MATCHING, mode="random_event", random_event="bob")
    for body in (npc, _without(MATCHING, "mode")):
        suggest(client, body)
    assert [row["content"]["type"] for row in queue(client)["suggestions"]] == ["matching"] * 2


def test_a_pick_all_is_held_to_its_types_check(client: TestClient) -> None:
    unsorted = {**PICK_ALL["content"]["payload"], "answer_indices": [2, 0]}
    response = client.post("/api/suggestions", json=_with(PICK_ALL, payload=unsorted))
    assert response.status_code == 422
    assert "must be in ascending order" in response.text
    response = client.post("/api/suggestions", json=_with(PICK_ALL, mode="odd_one_out"))
    assert response.status_code == 422
    assert "'pick_all_that_apply' is not offered for 'odd_one_out'" in response.text


def test_bestiary_takes_a_number(client: TestClient) -> None:
    number = _with(
        DROP_RATE,
        mode="bestiary",
        wiki="https://oldschool.runescape.wiki/w/General_Graardor",
        payload={"prompt": "What is General Graardor's combat level?", "answer": 624},
    )
    approve(client, suggest(client, number))
    (question,) = export(client)["questions"]
    assert (question["mode"], question["type"]) == ("bestiary", "closest_number")


SLIDER = _with(
    DROP_RATE,
    type="number_slider",
    mode="bestiary",
    wiki="https://oldschool.runescape.wiki/w/General_Graardor",
    payload={
        "prompt": "What is General Graardor's combat level?",
        "answer": 624,
        "min": 100,
        "max": 1000,
        "scale": "log",
    },
)


def test_a_slider_suggestion_keeps_its_bounds_and_plays(client: TestClient) -> None:
    approve(client, suggest(client, SLIDER))
    (question,) = export(client)["questions"]
    assert (question["mode"], question["type"]) == ("bestiary", "number_slider")
    assert question["payload"] == SLIDER["content"]["payload"]


@pytest.mark.parametrize(
    ("changes", "error"),
    [
        ({"min": None}, "'min' is a required property"),
        ({"scale": None}, "'scale' is a required property"),
        ({"min": 1000, "max": 100}, "is not above min"),
        ({"max": 1234}, "more than three significant figures"),
        ({"answer": 1000}, "not strictly between"),
    ],
)
def test_a_slider_suggestion_without_a_usable_track_is_refused(
    client: TestClient, changes: dict[str, Any], error: str
) -> None:
    payload = {**SLIDER["content"]["payload"], **changes}
    payload = {key: value for key, value in payload.items() if value is not None}
    response = client.post("/api/suggestions", json=_with(SLIDER, payload=payload))
    assert response.status_code == 422
    assert error in response.text


def test_a_drop_table_question_names_an_item_to_picture(client: TestClient) -> None:
    approve(client, suggest(client, _with(DROP_RATE, picture_item="  Dragon warhammer ")))
    (row,) = queue(client, "approved")["suggestions"]
    assert row["content"]["picture_item"] == "Dragon warhammer"
    (question,) = export(client)["questions"]
    assert question["picture_item"] == "Dragon warhammer"
    assert "image" not in question["payload"]


@pytest.mark.parametrize(
    ("body", "problem"),
    [
        (_with(DROP_RATE, picture_item="   "), "an item name of 1 to 80"),
        (_with(DROP_RATE, picture_item="x" * 81), "an item name of 1 to 80"),
        (_with(DROP_RATE, picture_item=4151), "an item name of 1 to 80"),
        (_with(DROP_RATE, mode="bestiary", picture_item="Dragon warhammer"), "only drop_table"),
    ],
    ids=["blank", "too_long", "an_id", "bestiary"],
)
def test_only_the_item_rounds_name_a_picture_item(
    client: TestClient, body: dict[str, Any], problem: str
) -> None:
    response = client.post("/api/suggestions", json=body)
    assert response.status_code == 422, response.text
    assert problem in response.text


NPC = {
    "kind": "question",
    "content": {
        "type": "pick_from_list",
        "mode": "whos_that_npc",
        "wiki": "https://oldschool.runescape.wiki/w/Araxxor",
        "payload": {"prompt": "Who's that NPC?", "subject": {"name": "Araxxor"}},
    },
    "credit": "AFKFisher",
    "credit_shown": True,
}


def test_a_whos_that_npc_suggestion_names_an_npc_not_asked_yet(client: TestClient) -> None:
    approve(
        client,
        suggest(
            client,
            _with(NPC, payload={**NPC["content"]["payload"], "subject": {"name": " Araxxor "}}),
        ),
    )
    (row,) = queue(client, "approved")["suggestions"]
    assert row["content"] == NPC["content"]
    assert row["playable"] is True
    (question,) = export(client)["questions"]
    assert question == {**NPC["content"], "credit": "AFKFisher", "credit_shown": True}


def _npc(**payload: Any) -> dict[str, Any]:
    return _with(NPC, payload={**NPC["content"]["payload"], **payload})


@pytest.mark.parametrize(
    ("body", "problem"),
    [
        (_npc(subject={"name": "Vorkath"}), "'Vorkath' is already in the game"),
        (_npc(subject={"name": "  vORKATH "}), "is already in the game"),
        (_npc(prompt="Who's this?"), "always asks"),
        (_npc(answer_id=8058), "only a prompt and subject.name"),
        (_npc(subject={"name": ""}), "a name of 1 to 80"),
        (_without(_with(NPC, source_url="https://example.com/a"), "wiki"), "$.wiki: required"),
        (_with(NPC, type="free_text"), "not offered for 'whos_that_npc'"),
    ],
    ids=["asked", "asked_folded", "prompt", "answer_id", "blank", "no_wiki", "type"],
)
def test_a_whos_that_npc_suggestion_is_refused(
    client: TestClient, body: dict[str, Any], problem: str
) -> None:
    response = client.post("/api/suggestions", json=body)
    assert response.status_code == 422, response.text
    assert problem in response.text


RENDER = {
    "kind": "question",
    "content": {
        "type": "multiple_choice",
        "mode": "whos_that_npc",
        "wiki": "https://oldschool.runescape.wiki/w/Vorkath",
        "difficulty": "hard",
        "payload": {
            "prompt": "Who's that NPC?",
            "options": ["Vorkath", "Galvek", "Elvarg", "Vorki"],
            "answer_index": 0,
        },
    },
    "credit": "AFKFisher",
    "credit_shown": False,
}


def test_a_render_suggestion_may_picture_an_npc_the_shadows_ask_about(
    client: TestClient,
) -> None:
    approve(client, suggest(client, RENDER))
    (question,) = export(client)["questions"]
    assert question == {**RENDER["content"], "credit": "AFKFisher", "credit_shown": False}


def _render(**payload: Any) -> dict[str, Any]:
    return _with(RENDER, payload={**RENDER["content"]["payload"], **payload})


@pytest.mark.parametrize(
    ("body", "problem"),
    [
        (_render(image="npc:8058"), "the import script adds the NPC's render"),
        (_render(explanation="It is Vorkath."), "'whos_that_npc' shows no explanation"),
        (_render(prompt="Which dragon?"), "always asks"),
        (_without(_with(RENDER, source_url="https://example.com/a"), "wiki"), "$.wiki: required"),
    ],
    ids=["image", "explanation", "prompt", "no_wiki"],
)
def test_a_render_suggestion_is_refused(
    client: TestClient, body: dict[str, Any], problem: str
) -> None:
    response = client.post("/api/suggestions", json=body)
    assert response.status_code == 422, response.text
    assert problem in response.text


def test_a_render_can_be_tried_and_answered(client: TestClient) -> None:
    trial = tried(client, RENDER)
    right = trial["reveal"]["answer_index"]
    assert trial["view"]["options"][right] == "Vorkath"
    response = client.post(
        "/api/suggestions/try", json={"content": RENDER["content"], "value": right}
    )
    assert response.json()["result"]["correct"] is True


MINIGAME = "minigame_madness"


@pytest.mark.parametrize(
    "body",
    [
        _with(ODD, mode=MINIGAME, payload={**ODD["content"]["payload"], "prompt": "Who runs it?"}),
        _with(TYPED, mode=MINIGAME),
        _with(PICK_ALL, mode=MINIGAME),
        _with(SORT_IT_OUT, mode=MINIGAME),
        _with(MATCHING, mode=MINIGAME),
        _with(DROP_RATE, mode=MINIGAME),
        _with(SLIDER, mode=MINIGAME),
    ],
    ids=lambda body: body["content"]["type"],
)
def test_minigame_madness_takes_each_of_its_types_and_plays_them(
    client: TestClient, body: dict[str, Any]
) -> None:
    approve(client, suggest(client, body))
    (question,) = export(client)["questions"]
    assert (question["mode"], question["type"]) == (MINIGAME, body["content"]["type"])
    assert question["payload"] == body["content"]["payload"]


def test_minigame_madness_refuses_a_type_it_does_not_play(client: TestClient) -> None:
    response = client.post("/api/suggestions", json=_with(NPC, mode=MINIGAME))
    assert response.status_code == 422, response.text
    assert f"'pick_from_list' is not offered for '{MINIGAME}'" in response.text


def test_a_minigame_madness_question_names_an_item_to_picture(client: TestClient) -> None:
    approve(client, suggest(client, _with(ODD, mode=MINIGAME, picture_item="Fighter torso")))
    (question,) = export(client)["questions"]
    assert question["picture_item"] == "Fighter torso"


def test_the_form_offers_a_picture_item_only_to_the_rounds_that_take_one() -> None:
    source = client_source.read("lib/suggestions.ts")
    rounds = re.search(r"const PICTURE_ITEM_ROUNDS = \[([^\]]*)\]", source)
    assert rounds is not None
    assert set(re.findall(r"'([a-z_]+)'", rounds.group(1))) == set(PICTURE_ITEM_MODES)


# Rounds suggested for on another card: the price rounds play the items players suggest,
# and Random Events Only plays the NPCs' questions.
COVERED_ELSEWHERE = {
    "more_less": "item",
    "price_is_right": "item",
    "random_events_only": "random_event",
}


def test_every_round_on_create_is_suggestable_or_covered_elsewhere() -> None:
    rounds = {mode.id for mode in round_modes()}
    assert sorted(rounds - set(QUESTION_MODES) - set(COVERED_ELSEWHERE)) == []
    assert set(COVERED_ELSEWHERE.values()) <= {"item", *QUESTION_MODES}


def test_know_your_content_creator_takes_a_number(client: TestClient) -> None:
    number = _with(
        DROP_RATE,
        mode="know_your_content_creator",
        wiki="https://oldschool.runescape.wiki/w/Infernal_cape",
        payload={
            "prompt": "How many days after the Inferno came out did Woox get the first cape?",
            "answer": 2,
            "unit": "days",
        },
    )
    suggest(client, number)
    assert queue(client)["suggestions"][0]["content"]["mode"] == "know_your_content_creator"


def test_the_form_offers_the_modes_the_server_takes() -> None:
    source = client_source.read("lib/suggestions.ts")
    offered = {"random_event"}
    for name in ("CHOICE_ROUNDS", "ORDERING_ROUNDS", "NAMED_ROUNDS"):
        rounds = re.search(rf"const {name} = \[([^\]]*)\]", source)
        assert rounds is not None
        offered |= set(re.findall(r"'([a-z_]+)'", rounds.group(1)))
    assert offered == set(QUESTION_MODES)


# --- the limit ------------------------------------------------------------------------


def test_one_suggestion_over_the_hourly_limit_is_a_429(client: TestClient) -> None:
    assert client.get("/api/suggestions/allowance").json() == {
        "left": SUGGESTIONS_PER_HOUR,
        "retry_at": None,
    }
    for _ in range(SUGGESTIONS_PER_HOUR):
        suggest(client, ITEM)
    response = client.post("/api/suggestions", json=ITEM)
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    allowance = client.get("/api/suggestions/allowance").json()
    assert allowance["left"] == 0 and allowance["retry_at"] is not None


def test_the_operator_is_held_to_none_of_the_suggestion_limits(
    app: FastAPI, client: TestClient
) -> None:
    app.state.suggestions = RateLimiter(limit=1)
    app.state.similar = RateLimiter(limit=1)
    app.state.tries = RateLimiter(limit=1)
    draft = {"content": ODD["content"]}
    for _ in range(3):
        assert client.post("/api/suggestions", json=ITEM, headers=BEARER).status_code == 201
        assert (
            client.post("/api/suggestions/similar", json=draft, headers=BEARER).status_code == 200
        )
        assert client.post("/api/suggestions/try", json=draft, headers=BEARER).status_code == 200
    assert client.get("/api/suggestions/allowance", headers=BEARER).json() == {
        "left": 1,
        "retry_at": None,
    }
    suggest(client, ITEM)
    assert client.post("/api/suggestions", json=ITEM).status_code == 429


def test_a_wrong_or_empty_bearer_does_not_lift_the_limits(app: FastAPI, client: TestClient) -> None:
    app.state.suggestions = RateLimiter(limit=1)
    wrong = {"Authorization": f"Bearer {TOKEN}x"}
    empty = {"Authorization": "Bearer "}
    suggest(client, ITEM)
    assert client.post("/api/suggestions", json=ITEM, headers=wrong).status_code == 429
    assert client.post("/api/suggestions", json=ITEM, headers=empty).status_code == 429


def test_an_empty_bearer_is_no_operator_without_a_token(settings: Settings, dist: Path) -> None:
    app = create_app(settings, dist)
    with TestClient(app) as client:
        app.state.suggestions = RateLimiter(limit=1)
        assert app.state.suggestions.allow(client_key("testclient"))
        allowance = client.get("/api/suggestions/allowance", headers={"Authorization": "Bearer "})
        assert allowance.json()["left"] == 0


def test_a_refused_suggestion_costs_no_quota(app: FastAPI, client: TestClient) -> None:
    app.state.suggestions = RateLimiter(limit=1)
    assert client.post("/api/suggestions", json=_with(ITEM, name="")).status_code == 422
    assert client.post("/api/suggestions", json={**ITEM, "credit": ""}).status_code == 422
    suggest(client, ITEM)


def test_an_ipv6_address_counts_by_its_64(app: FastAPI) -> None:
    with TestClient(ProxyHeadersMiddleware(app, trusted_hosts="testclient")) as proxied:
        app.state.suggestions = RateLimiter(limit=1)

        def from_(address: str) -> int:
            headers = {"X-Forwarded-For": address}
            return proxied.post("/api/suggestions", json=ITEM, headers=headers).status_code

        assert from_("2001:db8::1") == 201
        assert from_("2001:db8::2") == 429
        assert from_("2001:db8:0:1::1") == 201


# --- the operator's queue -------------------------------------------------------------


def test_without_a_token_the_queue_routes_are_404s(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        for method, path in ADMIN_ROUTES:
            assert client.request(method, path, json={}).status_code == 404, path


def test_without_the_bearer_the_queue_routes_are_401s(settings: Settings, dist: Path) -> None:
    configured = settings.model_copy(update={"admin_token": TOKEN})
    with TestClient(create_app(configured, dist)) as client:
        for method, path in ADMIN_ROUTES:
            response = client.request(method, path, json={})
            assert response.status_code == 401, path
            wrong = {"Authorization": f"Bearer {TOKEN}x"}
            assert client.request(method, path, json={}, headers=wrong).status_code == 401


@pytest.mark.usefixtures("unbuilt_round")
def test_export_holds_approved_playable_suggestions_in_creates_format(client: TestClient) -> None:
    event, unbuilt, examine, item = (suggest(client, b) for b in (EVENT, UNBUILT, EXAMINE, ITEM))
    suggest(client, _with(ITEM, name="Pending forever"))
    for suggestion in (event, unbuilt, examine, item):
        approve(client, suggestion)
    file = export(client)
    content = EVENT["content"]
    assert file == {
        "questions": [
            {
                "type": "multiple_choice",
                "payload": content["payload"],
                "random_event": "bob",
                "mode": "random_event",
                "wiki": WIKI,
                "credit": "AFKFisher",
                "credit_shown": True,
            },
            {
                "type": "multiple_choice",
                "payload": EXAMINE["content"]["payload"],
                "mode": "guess_examine",
                "wiki": EXAMINE["content"]["wiki"],
                "credit": "AFKFisher",
                "credit_shown": False,
            },
        ],
        "items": [{"name": "Ancient mace", "credit": "Woox", "credit_shown": False}],
    }
    approved = {row["id"]: row for row in queue(client, "approved")["suggestions"]}
    assert approved[unbuilt]["exported_at"] is None
    assert all(approved[s]["exported_at"] is not None for s in (event, examine, item))


def test_a_quote_and_its_source_export_as_they_were_written(client: TestClient) -> None:
    approve(client, suggest(client, QUOTE))
    (question,) = export(client)["questions"]
    assert question == {
        "type": "multiple_choice",
        "payload": QUOTE["content"]["payload"],
        "mode": "who_said_that",
        "source_url": QUOTE["content"]["source_url"],
        "credit": "AFKFisher",
        "credit_shown": False,
    }


def test_an_intro_and_a_picture_are_stored_and_exported(client: TestClient) -> None:
    payload = {**EVENT["content"]["payload"], "intro": "Pssst, adventurer.", "image": "item:12885"}
    suggestion = suggest(client, _with(EVENT, payload=payload))
    (stored,) = queue(client)["suggestions"]
    assert stored["content"]["payload"] == payload
    approve(client, suggestion)
    (question,) = export(client)["questions"]
    assert question["payload"] == payload


def test_an_npc_may_ask_an_ordering_with_an_intro(client: TestClient) -> None:
    approve(client, suggest(client, EVENT_ORDERING))
    (row,) = queue(client, "approved")["suggestions"]
    assert row["content"] == EVENT_ORDERING["content"]
    assert row["playable"] is True
    (question,) = export(client)["questions"]
    assert (question["mode"], question["type"], question["random_event"]) == (
        "random_event",
        "ordering",
        "bob",
    )
    assert question["payload"] == EVENT_ORDERING["content"]["payload"]


def test_the_form_offers_an_intro_only_to_the_rounds_that_show_one() -> None:
    source = client_source.read("lib/suggestions.ts")
    rounds = re.search(r"const INTRO_ROUNDS = \[([^\]]*)\]", source)
    assert rounds is not None
    assert set(re.findall(r"'([a-z_]+)'", rounds.group(1))) == set(INTRO_MODES)


def test_a_sort_it_out_suggestion_exports_with_its_ordering(client: TestClient) -> None:
    approve(client, suggest(client, SORT_IT_OUT))
    (question,) = export(client)["questions"]
    assert question == {
        "type": "ordering",
        "payload": SORT_IT_OUT["content"]["payload"],
        "mode": "sort_it_out",
        "wiki": SORT_IT_OUT["content"]["wiki"],
        "credit": "AFKFisher",
        "credit_shown": False,
    }


def test_marking_imported_moves_only_what_was_exported(client: TestClient) -> None:
    first = suggest(client, ITEM)
    approve(client, first)
    export(client)
    later = suggest(client, _with(ITEM, name="Ahrim's hood"))
    approve(client, later)
    response = client.post("/api/admin/suggestions/imported", headers=BEARER, json={})
    assert response.json() == {"imported": 1}
    assert [row["id"] for row in queue(client, "imported")["suggestions"]] == [first]
    assert [row["id"] for row in queue(client, "approved")["suggestions"]] == [later]
    again = export(client, "imported")
    assert again["items"] == [{"name": "Ancient mace", "credit": "Woox", "credit_shown": False}]
    assert queue(client, "approved")["suggestions"][0]["exported_at"] is None


def test_an_edit_is_checked_and_must_be_exported_again(client: TestClient) -> None:
    suggestion = suggest(client, EXAMINE)
    approve(client, suggestion)
    export(client)
    url = f"/api/admin/suggestions/{suggestion}"
    kind_changed = client.put(url, headers=BEARER, json={**ITEM, "kind": "item"})
    assert kind_changed.status_code == 422
    edited = {
        "content": _examine(prompt="Yuck, I still don't like cabbage.")["content"],
        "credit": "AFKFisher",
        "credit_shown": True,
    }
    response = client.put(url, headers=BEARER, json=edited)
    assert response.status_code == 200, response.text
    row = response.json()
    assert row["content"]["payload"]["prompt"] == "Yuck, I still don't like cabbage."
    assert row["credit_shown"] is True
    assert row["exported_at"] is None
    refused = client.put(url, headers=BEARER, json={**edited, "content": {"name": "No line"}})
    assert refused.status_code == 422
    missing = client.put(
        "/api/admin/suggestions/00000000-0000-0000-0000-000000000000", headers=BEARER, json=edited
    )
    assert missing.status_code == 404


def test_an_edit_holds_an_item_to_the_same_rules(client: TestClient) -> None:
    url = f"/api/admin/suggestions/{suggest(client, ITEM)}"
    body = {"content": ITEM["content"], "credit": "Woox", "credit_shown": False}
    assert client.put(url, headers=BEARER, json=body).status_code == 200
    shown = client.put(url, headers=BEARER, json={**body, "credit_shown": True})
    assert shown.status_code == 422, shown.text
    on_roster = client.put(url, headers=BEARER, json={**body, "content": {"name": "Abyssal whip"}})
    assert on_roster.status_code == 422, on_roster.text


def test_reject_and_reopen(client: TestClient) -> None:
    suggestion = suggest(client, ITEM)
    url = f"/api/admin/suggestions/{suggestion}/status"
    assert client.post(url, headers=BEARER, json={"status": "rejected"}).status_code == 200
    assert queue(client, "rejected")["counts"]["rejected"] == 1
    assert client.post(url, headers=BEARER, json={"status": "imported"}).status_code == 422
    assert client.post(url, headers=BEARER, json={"status": "pending"}).status_code == 200
    assert len(queue(client)["suggestions"]) == 1


# --- difficulty -----------------------------------------------------------------------


def test_a_difficulty_is_kept_through_review_and_export(client: TestClient) -> None:
    suggestion = suggest(client, _with(ODD, difficulty="hard"))
    [row] = queue(client)["suggestions"]
    assert row["content"]["difficulty"] == "hard"
    response = _edit(client, suggestion, _with(ODD, difficulty="easy"))
    assert response.status_code == 200, response.text
    approve(client, suggestion)
    [entry] = export(client)["questions"]
    assert entry["difficulty"] == "easy"


@pytest.mark.parametrize("tier", ["impossible", "Hard", "", 2, None])
def test_an_unknown_difficulty_is_a_422(client: TestClient, tier: Any) -> None:
    assert client.post("/api/suggestions", json=_with(ODD, difficulty=tier)).status_code == 422
    suggestion = suggest(client, ODD)
    assert _edit(client, suggestion, _with(ODD, difficulty=tier)).status_code == 422


def test_a_random_event_question_takes_no_difficulty(client: TestClient) -> None:
    body = _with(EVENT, difficulty="medium")
    assert client.post("/api/suggestions", json=body).status_code == 422
    unplaced = _with(UNPLACED, difficulty="hard")
    assert client.post("/api/suggestions", json=unplaced).status_code == 201


def test_a_question_without_a_difficulty_exports_without_one(client: TestClient) -> None:
    approve(client, suggest(client, ODD))
    [entry] = export(client)["questions"]
    assert "difficulty" not in entry


# --- a question with no round ---------------------------------------------------------


UNPLACED = _without(EVENT, "mode")
del UNPLACED["content"]["random_event"]
FREE_TEXT = _with(
    UNPLACED,
    type="free_text",
    payload={"prompt": "Which brother wields a greataxe?", "accepted": ["Dharok"]},
)


def _status(client: TestClient, suggestion: str, status: str) -> Any:
    return client.post(
        f"/api/admin/suggestions/{suggestion}/status", json={"status": status}, headers=BEARER
    )


def _edit(client: TestClient, suggestion: str, body: dict[str, Any]) -> Any:
    edit = {key: body[key] for key in ("content", "credit", "credit_shown")}
    return client.put(f"/api/admin/suggestions/{suggestion}", headers=BEARER, json=edit)


def test_a_question_with_no_round_takes_the_five_types_and_waits(client: TestClient) -> None:
    unplaced = (UNPLACED, FREE_TEXT, _without(DROP_RATE, "mode"), _without(PICK_ALL, "mode"))
    for body in (*unplaced, _without(SORT_IT_OUT, "mode")):
        suggest(client, body)
    rows = queue(client)["suggestions"]
    assert [row["content"]["type"] for row in rows] == [
        "multiple_choice",
        "free_text",
        "closest_number",
        "pick_all_that_apply",
        "ordering",
    ]
    assert all("mode" not in row["content"] for row in rows)
    assert not any(row["playable"] for row in rows)


@pytest.mark.parametrize(
    "body",
    [
        # What its type's ``check`` refuses: a pick-all needs a wrong option, an ordering a
        # rank for its answer.
        _with(
            _without(PICK_ALL, "mode"),
            payload={**PICK_ALL["content"]["payload"], "answer_indices": [0, 1, 2]},
        ),
        _without(_ordering(answer=[1, 0, 2, 3]), "mode"),
        _with(UNPLACED, payload={**UNPLACED["content"]["payload"], "prompt": ""}),
        _with(UNPLACED, payload={**UNPLACED["content"]["payload"], "answer_index": 9}),
        _with(UNPLACED, mode=None),
        _with(UNPLACED, random_event="bob"),
        _with(UNPLACED, picture_item="Dragon warhammer"),
        _with(UNPLACED, payload={**UNPLACED["content"]["payload"], "quote": "Said by Bob"}),
        _with(UNPLACED, payload={**UNPLACED["content"]["payload"], "intro": "Ahoy."}),
        _without(NPC, "mode"),
        _without(UNPLACED, "wiki"),
    ],
)
def test_a_question_with_no_round_is_held_to_its_type(
    client: TestClient, body: dict[str, Any]
) -> None:
    response = client.post("/api/suggestions", json=body)
    assert response.status_code == 422, response.text
    assert queue(client)["suggestions"] == []


def test_a_question_is_approved_and_exported_only_once_it_has_a_round(client: TestClient) -> None:
    suggestion = suggest(client, UNPLACED)
    refused = _status(client, suggestion, "approved")
    assert refused.status_code == 422, refused.text
    assert refused.json()["code"] == "no_round"
    assert queue(client)["counts"]["approved"] == 0
    placed = _with(UNPLACED, mode="random_event", random_event="bob")
    assert _edit(client, suggestion, placed).status_code == 200
    approve(client, suggestion)
    (question,) = export(client)["questions"]
    assert (question["mode"], question["random_event"]) == ("random_event", "bob")


def test_an_approved_question_keeps_its_round(client: TestClient) -> None:
    suggestion = suggest(client, EXAMINE)
    approve(client, suggestion)
    response = _edit(client, suggestion, _without(EXAMINE, "mode"))
    assert response.status_code == 422, response.text
    assert queue(client, "approved")["suggestions"][0]["content"]["mode"] == "guess_examine"


@pytest.mark.parametrize(
    ("body", "moved"),
    [
        # A round whose types leave its type out.
        (_without(SORT_IT_OUT, "mode"), {"mode": "drop_table"}),
        (FREE_TEXT, {"mode": "who_said_that"}),
        # A round whose rules it breaks: an NPC's question names its NPC and only it does,
        # and Bestiary shows no quote.
        (UNPLACED, {"mode": "random_event"}),
        (_with(UNPLACED, mode="random_event", random_event="bob"), {"mode": "guess_examine"}),
        (QUOTE, {"mode": "bestiary"}),
    ],
)
def test_a_move_to_a_round_it_does_not_fit_is_a_422(
    client: TestClient, body: dict[str, Any], moved: dict[str, Any]
) -> None:
    suggestion = suggest(client, body)
    response = _edit(client, suggestion, _with(body, **moved))
    assert response.status_code == 422, response.text
    assert queue(client)["suggestions"][0]["content"] == body["content"]


def test_a_question_moves_to_another_round_that_takes_it(client: TestClient) -> None:
    suggestion = suggest(client, _without(DROP_RATE, "mode"))
    for mode in ("drop_table", "bestiary"):
        moved = _with(DROP_RATE, mode=mode)
        response = _edit(client, suggestion, moved)
        assert response.status_code == 200, response.text
        assert response.json()["content"]["mode"] == mode


# --- the credit in a game -------------------------------------------------------------


def _credit_every(app: FastAPI, mode: str, **credit: Any) -> None:
    for pack in app.state.packs:
        for question in pack.questions:
            if question["mode"] == mode:
                question.update(credit)


def test_a_reveal_names_the_suggester_who_asked_to_be(app: FastAPI, table) -> None:
    _credit_every(app, "more_less", credit="AFKFisher", credit_shown=True)
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    game.skip()
    assert {seat.take("question_closed")["suggested_by"] for seat in game.seats} == {"AFKFisher"}


def test_a_reveal_leaves_out_a_suggester_who_did_not(app: FastAPI, table) -> None:
    _credit_every(app, "more_less", credit="AFKFisher")
    game = table("Zezima", seconds=10, reveal_seconds=30)
    game.start()
    game.opened(0)
    game.skip()
    assert "suggested_by" not in game.admin.take("question_closed")


def test_only_a_pack_question_names_its_suggester() -> None:
    envelope = {"credit": "Zezima", "credit_shown": True}
    assert queries._suggested_by("pack", envelope) == "Zezima"
    assert queries._suggested_by("room", envelope) is None
    assert queries._suggested_by("pack", {"credit": "Zezima"}) is None


# --- trying a question ------------------------------------------------------------------


def tried(client: TestClient, body: dict[str, Any], value: Any = None) -> dict[str, Any]:
    response = client.post(
        "/api/suggestions/try", json={"content": body["content"], "value": value}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_a_tried_question_shows_the_rooms_shuffle_and_its_reveal(client: TestClient) -> None:
    payload = ODD["content"]["payload"]
    shown = multiple_choice.shown_order(payload)
    trial = tried(client, _without(ODD, "wiki"))
    assert trial["view"]["options"] == [payload["options"][index] for index in shown]
    assert trial["reveal"]["answer_index"] == shown.index(payload["answer_index"])
    assert trial["result"] is None


def test_a_right_answer_earns_full_points_and_a_wrong_one_none(client: TestClient) -> None:
    right = multiple_choice.shown_order(ODD["content"]["payload"]).index(2)
    assert tried(client, ODD, right)["result"] == {
        "value": right,
        "correct": True,
        "credit": 1.0,
        "points": 1000,
    }
    wrong = tried(client, ODD, (right + 1) % 4)["result"]
    assert (wrong["correct"], wrong["points"]) == (False, 0)


def test_partial_credit_is_paid_without_speed(client: TestClient) -> None:
    number = _with(
        DROP_RATE,
        mode="bestiary",
        payload={"prompt": "What is General Graardor's combat level?", "answer": 624, "within": 62},
    )
    result = tried(client, number, 655)["result"]
    assert (result["correct"], result["credit"], result["points"]) == (False, 0.5, 500)


def test_a_partly_right_matching_pays_its_share_of_1000(client: TestClient) -> None:
    payload = MATCHING["content"]["payload"]
    shown = matching.shown_order(payload)
    pairs = [shown.index(0), shown.index(1), shown.index(3)]
    result = tried(client, MATCHING, pairs)["result"]
    expected = matching.grade(payload, [Submission(UUID(int=1), pairs)])[UUID(int=1)]
    assert 0 < expected < 1
    assert result["points"] == round(1000 * expected)


def test_a_whos_that_npc_reveals_its_name_and_takes_no_answer(client: TestClient) -> None:
    trial = tried(client, NPC)
    assert trial["reveal"] == {**trial["view"], "subject": {"name": "Araxxor"}}
    response = client.post("/api/suggestions/try", json={"content": NPC["content"], "value": 1})
    assert response.status_code == 422
    assert response.json()["code"] == "bad_value"


def test_a_value_the_type_refuses_is_a_422(client: TestClient) -> None:
    response = client.post("/api/suggestions/try", json={"content": ODD["content"], "value": 9})
    assert response.status_code == 422
    assert response.json()["code"] == "bad_value"


def test_a_question_that_fails_its_checks_cannot_be_tried(client: TestClient) -> None:
    broken = _examine(answer_index=7)
    response = client.post("/api/suggestions/try", json={"content": broken["content"]})
    assert response.status_code == 422
    assert response.json()["code"] == "bad_suggestion"


def test_tries_over_the_hourly_limit_are_429s(app: FastAPI, client: TestClient) -> None:
    app.state.tries = RateLimiter(limit=1)
    assert client.post("/api/suggestions/try", json={"content": {}}).status_code == 422
    tried(client, ODD)
    response = client.post("/api/suggestions/try", json={"content": ODD["content"]})
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"


def test_trying_stores_nothing(client: TestClient) -> None:
    tried(client, ODD, 0)
    assert queue(client)["suggestions"] == []
