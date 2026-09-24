"""T20 Accept, the vocabulary half: a roster with two entries of the same name refuses to
load, and ``GET /api/vocab/{name}`` serves the list a ``pick_from_list`` round answers
from -- ``items`` from the roster, ``npcs`` a 404 until T23 writes its facts.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.questions import vocab
from app.questions.vocab import VocabError, build, fold

ROSTER = [
    {"id": 4151, "name": "Abyssal whip"},
    {"id": 4587, "name": "Dragon scimitar"},
    {"id": 1333, "name": "Rune scimitar"},
]


def test_fold_ignores_case_and_accents() -> None:
    assert fold("Abyssal Whip") == fold("abyssal whip")
    assert fold("Āhrim's robetop") == fold("ahrim's robetop")
    assert fold("ÉLYSIAN") == "elysian"


def test_entries_open_in_alphabetical_order_whatever_the_roster_order() -> None:
    items = build("items", list(reversed(ROSTER)), "roster")
    assert [e.name for e in items.entries] == ["Abyssal whip", "Dragon scimitar", "Rune scimitar"]
    assert items.name_of(4151) == "Abyssal whip"
    assert items.name_of(9999) is None


@pytest.mark.parametrize("twin", ["Abyssal whip", "abyssal WHIP", "Abyssal whíp"])
def test_two_entries_of_the_same_name_refuse_to_load(twin: str) -> None:
    """T20 Accept. A player could not tell them apart in the list, and the grader would
    accept only one of them."""
    with pytest.raises(VocabError) as info:
        build("items", [*ROSTER, {"id": 12773, "name": twin}], "roster")
    assert info.value.errors == [
        f"roster: {twin!r} (12773) and 'Abyssal whip' read as the same name,"
        " so a player could not tell them apart in the list"
    ]


def test_a_repeated_id_refuses_to_load() -> None:
    with pytest.raises(VocabError, match="id 4151 is both 'Abyssal whip' and 'Whip'"):
        build("items", [*ROSTER, {"id": 4151, "name": "Whip"}], "roster")


@pytest.mark.parametrize(
    "records",
    [[], {"id": 1, "name": "x"}, [{"id": "1", "name": "x"}], [{"id": 1, "name": " "}]],
)
def test_malformed_records_refuse_to_load(records: object) -> None:
    with pytest.raises(VocabError):
        build("items", records, "roster")


def test_the_version_follows_the_entries_and_not_their_order() -> None:
    a = build("items", ROSTER, "roster")
    assert build("items", list(reversed(ROSTER)), "roster").version == a.version
    renamed = [*ROSTER[:2], {"id": 1333, "name": "Rune scimitar (g)"}]
    assert build("items", renamed, "roster").version != a.version
    assert len(a.version) == 16 and int(a.version, 16) >= 0


def test_a_missing_file_is_no_vocabulary_rather_than_an_empty_one(tmp_path: Path) -> None:
    assert vocab.read("npcs", tmp_path / "npcs.json") is None
    path = tmp_path / "npcs.json"
    path.write_text(json.dumps({"npcs": [{"id": 2042, "name": "Zulrah", "combat": 725}]}))
    assert [e.name for e in vocab.read("npcs", path).entries] == ["Zulrah"]


def test_the_shipped_roster_loads_as_the_items_vocabulary() -> None:
    items = vocab.get("items")
    roster = json.loads(vocab.SOURCES["items"].read_text(encoding="utf-8"))["items"]
    assert items is not None
    assert len(items.entries) == len(roster)
    assert items.name_of(4151) == "Abyssal whip"


def test_unknown_names_do_not_grow_the_cache() -> None:
    """Names come straight from the URL, so caching unknown ones is unbounded memory."""
    vocab.get("items")
    before = vocab._load.cache_info().currsize
    for index in range(1000):
        assert vocab.get(f"unknown-{index}") is None
    assert vocab._load.cache_info().currsize == before


# --- GET /api/vocab ---------------------------------------------------------------------


def test_api_vocab_items_serves_the_roster(client: TestClient) -> None:
    response = client.get("/api/vocab/items")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    items = vocab.get("items")
    assert items is not None
    assert body["vocab"] == "items"
    assert body["version"] == items.version
    assert {"id": 4151, "name": "Abyssal whip"} in body["entries"]
    assert len(body["entries"]) == len(items.entries)
    assert set(body["entries"][0]) == {"id", "name"}


@pytest.mark.parametrize("name", ["npcs", "quests"])
def test_api_vocab_is_a_404_for_a_list_this_build_does_not_have(
    client: TestClient, name: str
) -> None:
    """``npcs`` until T23 writes ``data/facts/npcs.json``; anything else always."""
    if name == "npcs" and vocab.get("npcs") is not None:
        pytest.skip("npcs.json exists now")
    response = client.get(f"/api/vocab/{name}")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
