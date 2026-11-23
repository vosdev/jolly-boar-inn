"""Reports: what the form lists, what a player may send, the limit, and the operator's queue."""

import json
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app import reports
from app.config import Settings
from app.http.ratelimit import REPORTS_PER_HOUR, RateLimiter
from app.main import create_app
from app.modes import TILES
from app.questions.packs import Pack, load_packs, mode_questions
from tests.conftest import BASE
from tests.packs import PACKS_DIR, SHIPPED_MODES

TOKEN = "0123456789abcdef0123456789abcdef"
BEARER = {"Authorization": f"Bearer {TOKEN}"}
PACKS = load_packs(PACKS_DIR)
EXAMINE = mode_questions(PACKS, "guess_examine")[0]
ODD = mode_questions(PACKS, "odd_one_out")[0]
WHIP = 4151
BOX = {"min_x": 3200, "max_x": 3210, "min_y": 3200, "max_y": 3210}
SHOTS = ("screenshot:varrock-square", "screenshot:lumbridge-castle")
FILES = ("a1b2c3d4e5f60718.webp", "0f1e2d3c4b5a6978.webp")
PHOTOS = tuple(
    {
        "id": f"kgp{index}",
        "type": "map_pin",
        "mode": "kgp_recon",
        "difficulty": "easy",
        "payload": {
            "prompt": "Where was this photo taken?",
            "targets": [{"name": place, **BOX}],
            "screenshot": shot,
            "width": 1600,
            "height": 900,
        },
    }
    for index, (shot, place) in enumerate(zip(SHOTS, ("Varrock", "Lumbridge"), strict=True))
)

REPORT = {"mode": "guess_examine", "question": EXAMINE["id"], "text": "That's not its examine."}

ADMIN_ROUTES = (
    ("GET", "/api/admin/reports"),
    ("POST", "/api/admin/reports/00000000-0000-0000-0000-000000000000/status"),
    ("GET", "/api/admin/questions?mode=guess_examine"),
    ("GET", "/api/admin/questions/pictures"),
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


@pytest.fixture
def offline(settings: Settings, dist: Path) -> Iterator[TestClient]:
    """No database: everything a report is refused for is decided before one is needed."""
    configured = settings.model_copy(update={"packs_dir": PACKS_DIR, "admin_token": TOKEN})
    with TestClient(create_app(configured, dist)) as client:
        images = {
            q["payload"].get("image")
            for mode in ("pixel_hunt", "whos_that_npc")
            for q in mode_questions(PACKS, mode)
        }
        client.app.state.rooms.pictures = {asset: "0000000000000000.png" for asset in images}
        client.app.state.rooms.pictures[TILES] = "clean"
        yield client


def send(client: TestClient, body: dict[str, Any]) -> str:
    response = client.post("/api/reports", json=body)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def queue(client: TestClient, status: str = "open") -> dict[str, Any]:
    response = client.get(f"/api/admin/reports?status={status}", headers=BEARER)
    assert response.status_code == 200, response.text
    return response.json()


# --- what the form lists --------------------------------------------------------------


def test_the_form_lists_every_pack_mode_but_none_switched_off(offline: TestClient) -> None:
    modes = offline.get("/api/questions/modes").json()
    shipped = [m for m in reports.pack_modes() if m in SHIPPED_MODES]
    assert modes == [m for m in shipped if m != "random_events_only"]
    assert "random_event" in modes and "custom" not in modes
    assert offline.get("/api/questions?mode=random_events_only").status_code == 422


@pytest.mark.parametrize(
    "mode", [m for m in reports.pack_modes() if m in SHIPPED_MODES or m == "random_events_only"]
)
def test_the_question_list_never_carries_an_answer(offline: TestClient, mode: str) -> None:
    response = offline.get(f"/api/questions?mode={mode}")
    if mode == "random_events_only":
        assert response.status_code == 422
        return
    body = response.json()
    assert body["choices"], mode
    extra = {"whos_that_npc": {"npc"}, "random_event": {"random_event"}}.get(mode, set())
    for choice in body["choices"]:
        assert choice.keys() in ({"id", "label"} | extra, {"id", "label"}), mode
    if body["by"] == "question":
        ids = [choice["id"] for choice in body["choices"]]
        assert ids == [q["id"] for q in mode_questions(PACKS, mode)]
        for question, choice in zip(mode_questions(PACKS, mode), body["choices"], strict=True):
            for field in ("answer", "answer_id", "accepted", "explanation"):
                found = question["payload"].get(field)
                if isinstance(found, str) and len(found) > 3:
                    assert found not in choice["label"], (mode, field)
    flat = json.dumps(body)
    for field in ("answer", "accepted", "explanation", "payload", "wiki"):
        assert f'"{field}' not in flat


def _prompt(question: dict[str, Any]) -> str:
    payload = question["payload"]
    quote = payload.get("quote")
    return payload["prompt"] if quote is None else f"{payload['prompt']} “{quote}”"


# What players read while a question is open, for every pack mode. Typed here, not read
# from ``Mode.report``, so a mode filed under the wrong rule fails, and stated for each mode,
# so a new one is a decision rather than its prompt by default.
READ_AS = {
    "guess_examine": _prompt,
    "sort_it_out": _prompt,
    "who_said_that": _prompt,
    "know_your_content_creator": _prompt,
    "bestiary": _prompt,
    "drop_table": _prompt,
    # Every prompt is the same, so the options tell the questions apart.
    "odd_one_out": lambda q: ", ".join(q["payload"]["options"]),
    "minigame_madness": _prompt,
    "whos_that_npc": lambda q: (
        q["payload"]["subject"]["name"]
        if q["type"] == "pick_from_list"
        else q["payload"]["options"][q["payload"]["answer_index"]]
    ),
    "pixel_hunt": lambda q: q["payload"]["subject"]["name"],
    "forgetful_bard": _prompt,
    # Every prompt is the same and the first clue is what shows first.
    "riddles_of_the_sphinx": lambda q: q["payload"]["clues"][0],
    "scaperune": _prompt,
    "tales_of_gielinor": _prompt,
    "uris_unravelling": _prompt,
    "slayer_master": _prompt,
    "mark_the_map": _prompt,
    # Certer's are pictures, named as Pixel Hunt's are.
    "random_event": lambda q: (
        q["payload"]["subject"]["name"] if q.get("random_event") == "certer" else _prompt(q)
    ),
}
LABELLED = [m for m in reports.pack_modes() if m not in reports.ITEM_MODES and m in SHIPPED_MODES]


def test_every_pack_mode_states_what_players_read() -> None:
    missing = [mode for mode in LABELLED if mode not in READ_AS]
    assert not missing, (
        f"state how the report form labels {missing} in READ_AS: _prompt if players read the "
        "prompt, else what they read while the question is open"
    )


@pytest.mark.parametrize("mode", LABELLED)
def test_each_pack_mode_is_labelled_by_what_players_read(mode: str) -> None:
    read = READ_AS.get(mode, _prompt)
    questions = mode_questions(PACKS, mode)
    assert questions, mode
    for question in questions:
        assert reports.label(question) == read(question), question["id"]


def test_whos_that_npc_is_listed_by_the_npc_and_its_id(offline: TestClient) -> None:
    question = mode_questions(PACKS, "whos_that_npc")[0]
    body = offline.get("/api/questions?mode=whos_that_npc").json()
    assert body["choices"][0] == {
        "id": question["id"],
        "label": question["payload"]["subject"]["name"],
        "npc": question["payload"]["answer_id"],
    }
    assert len({choice["label"] for choice in body["choices"]}) == len(body["choices"])


def test_a_random_event_is_listed_with_its_npc(offline: TestClient) -> None:
    body = offline.get("/api/questions?mode=random_event").json()
    asked = {q["id"]: q["random_event"] for q in mode_questions(PACKS, "random_event")}
    assert {choice["id"]: choice["random_event"] for choice in body["choices"]} == asked


def test_a_price_mode_lists_the_roster(offline: TestClient) -> None:
    body = offline.get("/api/questions?mode=more_less").json()
    assert body["by"] == "item"
    assert {"id": WHIP, "label": "Abyssal whip"} in body["choices"]


def test_odd_one_out_is_named_by_its_options_in_pack_order(offline: TestClient) -> None:
    body = offline.get("/api/questions?mode=odd_one_out").json()
    assert body["choices"][0] == {"id": ODD["id"], "label": ", ".join(ODD["payload"]["options"])}


def test_a_quote_is_named_after_its_prompt(offline: TestClient) -> None:
    quoted = mode_questions(PACKS, "who_said_that")[0]
    body = offline.get("/api/questions?mode=who_said_that").json()
    payload = quoted["payload"]
    assert body["choices"][0]["label"] == f"{payload['prompt']} “{payload['quote']}”"


def test_a_screenshot_choice_carries_its_picture_and_never_its_place(
    offline: TestClient,
) -> None:
    state = offline.app.state
    state.packs = [*PACKS, Pack(name="kgp", generated_at=None, questions=PHOTOS, path=Path("k"))]
    state.rooms.pictures.update(dict(zip(SHOTS, FILES, strict=True)))
    body = offline.get("/api/questions?mode=kgp_recon").json()
    assert body["choices"] == [
        {"id": f"kgp{index}", "label": "Where was this photo taken?", "picture": file}
        for index, file in enumerate(FILES)
    ]
    flat = json.dumps(body)
    for secret in ("Varrock", "Lumbridge", "screenshot:", "targets", "min_x"):
        assert secret not in flat


def test_a_choice_whose_screenshot_this_build_lacks_has_no_picture() -> None:
    packs = [Pack(name="kgp", generated_at=None, questions=PHOTOS, path=Path("k"))]
    listed = reports.choices(packs, "kgp_recon", {SHOTS[0]: "a1b2c3d4e5f60718.webp"})["choices"]
    assert [choice.get("picture") for choice in listed] == ["a1b2c3d4e5f60718.webp", None]


def test_an_unknown_mode_lists_nothing(offline: TestClient) -> None:
    assert offline.get("/api/questions?mode=zoom_quiz").status_code == 422
    assert offline.get("/api/questions?mode=custom").status_code == 422


# --- what a player may send -----------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        {**REPORT, "mode": "zoom_quiz"},
        {**REPORT, "mode": "custom"},
        {**REPORT, "question": "q_0000000000000000"},
        {**REPORT, "question": ODD["id"]},
        {**REPORT, "item": WHIP},
        {"mode": "more_less", "question": EXAMINE["id"], "text": "Wrong."},
        {"mode": "more_less", "item": 999_999_999, "text": "Wrong."},
        {**REPORT, "text": ""},
        {**REPORT, "text": " \n\t "},
        {**REPORT, "text": "x" * (reports.TEXT_MAX + 1)},
        {**REPORT, "text": "x" * (4 * reports.TEXT_MAX + 1)},
        {**REPORT, "text": "bell\x07"},
        {**REPORT, "text": "nul\x00"},
        {**REPORT, "extra": 1},
    ],
)
def test_what_does_not_fit_a_pack_is_a_422(offline: TestClient, body: dict[str, Any]) -> None:
    assert offline.post("/api/reports", json=body).status_code == 422


def test_each_kind_is_stored_open_with_its_snapshot(client: TestClient) -> None:
    send(client, {**REPORT, "text": "  Typo in <b>line</b> one.\r\nAnd two.  "})
    send(client, {"mode": "price_is_right", "item": WHIP, "text": "Its price is way off."})
    send(client, {"mode": "random_event", "text": "Bob asks the same thing twice."})
    found = queue(client)
    assert found["counts"] == {"open": 3, "closed": 0}
    examine, item, other = found["reports"]
    assert examine["question_id"] == EXAMINE["id"]
    assert examine["snapshot"] == EXAMINE
    assert examine["text"] == "Typo in <b>line</b> one.\nAnd two."
    assert item["question_id"] is None
    assert item["snapshot"] == {"id": WHIP, "name": "Abyssal whip"}
    assert other["snapshot"] is None and other["status"] == "open"


def test_the_longest_text_counts_characters_not_bytes(client: TestClient) -> None:
    send(client, {**REPORT, "text": "é" * reports.TEXT_MAX})


def test_a_report_keeps_its_snapshot_once_its_question_has_left_the_pack(
    app: FastAPI, client: TestClient
) -> None:
    send(client, REPORT)
    app.state.packs = [
        replace(pack, questions=tuple(q for q in pack.questions if q is not EXAMINE))
        for pack in PACKS
    ]
    listed = client.get("/api/admin/questions?mode=guess_examine", headers=BEARER).json()
    assert EXAMINE["id"] not in {q["id"] for q in listed["questions"]}
    (report,) = queue(client)["reports"]
    assert report["question_id"] == EXAMINE["id"] and report["snapshot"] == EXAMINE


def test_close_and_reopen_keep_the_report(client: TestClient) -> None:
    report = send(client, REPORT)
    path = f"/api/admin/reports/{report}/status"
    closed = client.post(path, json={"status": "closed"}, headers=BEARER)
    assert closed.status_code == 200 and closed.json()["status"] == "closed"
    assert queue(client)["reports"] == []
    assert [r["id"] for r in queue(client, "closed")["reports"]] == [report]
    assert client.post(path, json={"status": "open"}, headers=BEARER).json()["status"] == "open"
    assert queue(client)["counts"] == {"open": 1, "closed": 0}
    missing = "/api/admin/reports/00000000-0000-0000-0000-000000000000/status"
    assert client.post(missing, json={"status": "closed"}, headers=BEARER).status_code == 404


# --- the limit ------------------------------------------------------------------------


def test_the_fourth_report_in_an_hour_is_a_429(client: TestClient) -> None:
    assert REPORTS_PER_HOUR == 3
    assert client.get("/api/reports/allowance").json() == {"left": 3, "retry_at": None}
    for _ in range(3):
        send(client, REPORT)
    response = client.post("/api/reports", json=REPORT)
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    allowance = client.get("/api/reports/allowance").json()
    assert allowance["left"] == 0 and allowance["retry_at"] is not None


def test_a_refused_report_costs_no_quota(app: FastAPI, client: TestClient) -> None:
    app.state.reports = RateLimiter(limit=1)
    assert client.post("/api/reports", json={**REPORT, "text": ""}).status_code == 422
    send(client, REPORT)


def test_an_ipv6_address_counts_by_its_64(app: FastAPI) -> None:
    with TestClient(ProxyHeadersMiddleware(app, trusted_hosts="testclient")) as proxied:

        def from_(address: str) -> int:
            headers = {"X-Forwarded-For": address}
            return proxied.post("/api/reports", json=REPORT, headers=headers).status_code

        assert [from_(f"2001:db8::{n}") for n in range(1, 5)] == [201, 201, 201, 429]
        assert from_("2001:db8:0:1::1") == 201


# --- the operator's queue -------------------------------------------------------------


def test_the_admin_list_holds_whole_questions(offline: TestClient) -> None:
    response = offline.get("/api/admin/questions?mode=odd_one_out", headers=BEARER)
    assert response.json()["questions"] == mode_questions(PACKS, "odd_one_out")
    events = offline.get("/api/admin/questions?mode=random_event", headers=BEARER).json()
    assert events["questions"] and all(q["random_event"] for q in events["questions"])
    unknown = offline.get("/api/admin/questions?mode=custom", headers=BEARER)
    assert unknown.status_code == 422


def test_the_admin_pictures_name_only_screenshots(offline: TestClient) -> None:
    offline.app.state.rooms.pictures[SHOTS[0]] = "a1b2c3d4e5f60718.webp"
    response = offline.get("/api/admin/questions/pictures", headers=BEARER)
    assert response.json() == {SHOTS[0]: "a1b2c3d4e5f60718.webp"}


def test_without_a_token_the_admin_routes_are_404s(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        for method, path in ADMIN_ROUTES:
            assert client.request(method, path, json={}).status_code == 404, path


def test_without_the_bearer_the_admin_routes_are_401s(settings: Settings, dist: Path) -> None:
    configured = settings.model_copy(update={"admin_token": TOKEN})
    with TestClient(create_app(configured, dist)) as client:
        for method, path in ADMIN_ROUTES:
            assert client.request(method, path, json={}).status_code == 401, path
            wrong = {"Authorization": f"Bearer {TOKEN}x"}
            assert client.request(method, path, json={}, headers=wrong).status_code == 401


def test_a_render_is_listed_by_its_npc_with_no_list_id(offline: TestClient) -> None:
    """A render's NPC is not on the list, so /suggest must not refuse it as a shadow."""
    renders = [q for q in mode_questions(PACKS, "whos_that_npc") if q["type"] == "multiple_choice"]
    body = offline.get("/api/questions?mode=whos_that_npc").json()
    by_id = {choice["id"]: choice for choice in body["choices"]}
    for question in renders:
        payload = question["payload"]
        right = payload["options"][payload["answer_index"]]
        assert by_id[question["id"]] == {"id": question["id"], "label": right}
