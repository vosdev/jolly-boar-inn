"""Create returns ``{code, session, player}`` and the creator is the room's
admin; a bad display name creates no room row; the sixth create from one IP in an hour is
429; a preferred code is taken as sent, 409 if taken and 422 if no draw could give it;
``free-code`` hands out one no room holds, five per ten seconds; ``questions`` rows equal
what the modes asked for (the code collision retry is in test_codes.py plus an
end-to-end check here).

Join a finished room is 409; duplicate name is 409; over ``max_players`` is
409; success returns a session; the player appears in ``GET /api/rooms/{code}``.

The creation half of custom questions: five custom questions in a three-mode room give 422
naming the limit and the count and create no room; a custom question that fails the schema
gives 422 naming the field and creates no room.

Plus section 7: the session token is hashed at rest and never rendered back.
"""

import hashlib
import json
import re
from datetime import datetime
from typing import Any
from uuid import uuid4

import asyncpg
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.modes import MODES, Mode
from app.questions import schema
from app.random_events import RANDOM_EVENTS
from app.rooms import codes, errors, joins, queries
from app.rooms.settings import RoomSettings
from tests.rooms_api import call, create, held, hello, join


def sha256(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --- create -----------------------------------------------------------------------


def test_create_returns_the_admin_session_and_player(client: TestClient, db) -> None:
    """The creator is the admin; the session is hashed at rest."""
    response = client.post(
        "/api/rooms",
        json={
            "returning": False,
            "display_name": "  Zezima  ",
            "settings": {},
            "custom_questions": [],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"code", "session", "player", "expires_at"}
    assert len(body["session"]) >= 40
    assert body["player"] == {
        "id": body["player"]["id"],
        "display_name": "Zezima",  # trimmed
        "avatar": body["player"]["avatar"],  # none sent, so the server picked one
        "role": "admin",
        "team": None,
        "connected": False,
        "ready": False,
        "editing": False,
    }

    (room,) = db("select code, status from rooms")
    assert (room["code"], room["status"]) == (body["code"].upper(), "lobby")
    (player,) = db("select id, role, session_token_hash from players")
    assert str(player["id"]) == body["player"]["id"]
    assert player["role"] == "admin"
    assert player["session_token_hash"] == sha256(body["session"])
    assert body["session"] not in str(dict(player))


def test_create_returns_when_the_room_expires(client: TestClient, db) -> None:
    """The host's list of rooms needs the stored expiry to know when a code is no longer theirs."""
    response = client.post("/api/rooms", json={"returning": False, "display_name": "Zezima"})
    assert response.status_code == 201
    (room,) = db("select expires_at from rooms")
    assert datetime.fromisoformat(response.json()["expires_at"]) == room["expires_at"]


def test_create_registers_the_room_in_memory_with_its_admin(
    app: FastAPI, client: TestClient
) -> None:
    """The cached copy is never re-read, so it has to hold the admin from the start.

    Reaches into ``manager.rooms`` on purpose: ``get`` would rehydrate a cold room from
    the database and hide the very bug this guards against -- an admin who is locked out
    of the room they just made.
    """
    code, admin = create(client)
    room = app.state.rooms.rooms[code]
    assert [p.role for p in room.players.values()] == ["admin"]
    assert room.find_by_session(admin["session"]) is not None


def test_a_bad_display_name_creates_no_room(client: TestClient, db) -> None:
    """The name is validated before anything is written, so nothing is left behind."""
    for name in ("", "   ", "x" * 13, "<b>bold</b>", "two\nlines", "tab\there"):
        response = client.post(
            "/api/rooms", json={"returning": False, "display_name": name, "settings": {}}
        )
        assert response.status_code == 422, name
        assert response.json()["code"] == "bad_name", name
    for table in ("rooms", "questions", "players"):
        assert db(f"select count(*) as n from {table}")[0]["n"] == 0, table


def test_a_bad_display_name_costs_no_rate_limit_quota(client: TestClient) -> None:
    """The limiter records a hit on every call it allows, so it runs after the name."""
    for _ in range(6):
        response = client.post(
            "/api/rooms", json={"returning": False, "display_name": "", "settings": {}}
        )
        assert response.status_code == 422
    assert (
        client.post("/api/rooms", json={"returning": False, "display_name": "Zezima"}).status_code
        == 201
    )


def test_a_failed_player_insert_leaves_no_room(
    app: FastAPI, client: TestClient, db, monkeypatch
) -> None:
    """No room without a host: the admin insert aborts the whole transaction.

    ``players_session_idx`` is unique across every room, so a duplicated session token is
    the one way to fail that insert. It must not be mistaken for a code collision and
    retried -- it has to take the room row down with it.
    """
    _, admin = create(client)
    monkeypatch.setattr(joins, "new_token", lambda: admin["session"])
    with pytest.raises(asyncpg.UniqueViolationError):
        call(client, app.state.rooms.create, "Other", RoomSettings(), [])
    assert db("select count(*) as n from rooms")[0]["n"] == 1


def test_the_claim_endpoint_is_gone(client: TestClient) -> None:
    """404: no route has the path, and the SPA catch-all stays out of ``/api``."""
    code, _ = create(client)
    assert client.post(f"/api/rooms/{code}/claim", json={}).status_code == 404


def test_code_is_stored_uppercase_and_sent_spelled_as_its_word(client: TestClient, db) -> None:
    response = client.post("/api/rooms", json={"returning": False, "display_name": "Zezima"})
    sent = response.json()["code"]
    (room,) = db("select code from rooms")
    assert re.fullmatch(r"[A-Z0-9]+", room["code"])
    assert sent == codes.cased(room["code"]) != room["code"]
    assert sent in codes.load_words()


def test_the_room_view_spells_the_code_and_any_casing_finds_the_room(client: TestClient) -> None:
    code, admin = create(client)
    assert join(client, code.lower(), "Woox").status_code == 200
    with client.websocket_connect(f"/ws/{codes.cased(code)}") as ws:
        assert hello(ws, admin["session"])["room"]["code"] == codes.cased(code)


def test_code_collision_retries_then_appends_digits(app: FastAPI, client: TestClient) -> None:
    """Collision retry end to end, with a one-word list."""
    app.state.rooms.words = ("Cabbage",)
    first, _ = create(client)
    second, _ = create(client)
    assert first == "CABBAGE"
    assert re.fullmatch(r"CABBAGE\d\d", second)


def test_free_code_is_one_no_room_holds_spelled_as_its_word(
    app: FastAPI, client: TestClient
) -> None:
    app.state.rooms.words = ("Cabbage",)
    create(client)
    response = client.get("/api/rooms/free-code")
    assert response.status_code == 200
    assert re.fullmatch(r"Cabbage\d\d", response.json()["code"])


def test_free_code_past_five_in_ten_seconds_is_429(client: TestClient) -> None:
    for _ in range(5):
        assert client.get("/api/rooms/free-code").status_code == 200
    response = client.get("/api/rooms/free-code")
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    assert 1 <= int(response.headers["retry-after"]) <= 10


def test_create_takes_the_preferred_code(client: TestClient, db) -> None:
    free = client.get("/api/rooms/free-code").json()["code"]
    response = client.post(
        "/api/rooms", json={"returning": False, "display_name": "Zezima", "code": free}
    )
    assert response.status_code == 201
    assert response.json()["code"] == free
    assert [row["code"] for row in db("select code from rooms")] == [free.upper()]


def test_a_taken_preferred_code_is_409_and_creates_no_room(client: TestClient, db) -> None:
    code, _ = create(client)
    response = client.post(
        "/api/rooms",
        json={"returning": False, "display_name": "Zezima", "code": codes.cased(code)},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "code_taken"
    assert len(db("select id from rooms")) == 1
    assert len(db("select id from players")) == 1


@pytest.mark.parametrize("code", ["Zezima", "Cabbage7", "Cabbage123"])
def test_a_code_no_draw_could_give_is_422_before_the_limiter(
    app: FastAPI, client: TestClient, db, code: str
) -> None:
    app.state.rooms.words = ("Cabbage",)
    for _ in range(app.state.settings.rooms_per_ip_per_hour + 1):
        response = client.post(
            "/api/rooms", json={"returning": False, "display_name": "Zezima", "code": code}
        )
        assert response.status_code == 422
        assert response.json()["code"] == "bad_code"
    assert db("select id from rooms") == []


def test_questions_rows_equal_what_the_modes_asked_for(client: TestClient, db) -> None:
    """A mode is a round, and its ``questions`` is how long that round is."""
    code, _ = create(client, modes=[{"mode": "more_less", "questions": 7}])
    (room,) = db("select id from rooms where code = $1", code)
    rows = db(
        "select position, question_id, type, mode, source, payload, host_only, round"
        " from questions"
        " where room_id = $1 order by position",
        room["id"],
    )
    assert len(rows) == 7
    assert [r["position"] for r in rows] == list(range(7))
    assert len({r["question_id"] for r in rows}) == 7
    # One mode, so one round, however many questions it holds.
    assert [r["round"] for r in rows] == [0] * 7
    for row in rows:
        assert row["type"] == "more_less"
        assert row["mode"] == "more_less"
        assert row["source"] == "pack"
        assert row["host_only"] is False
        assert set(row["payload"]) >= {"payload", "tags"}
        assert not set(row["payload"]) & {"id", "type", "mode", "source", "host_only"}
        assert row["payload"]["payload"]["answer_index"] in (0, 1)

    # Thirty at the default frequency: three random events on top, each an NPC's own.
    code, _ = create(client, modes=[{"mode": "more_less", "questions": 30}])
    rows = db(
        "select q.mode, q.source, q.random_event, q.round from questions q"
        " join rooms r on r.id = q.room_id where r.code = $1 order by q.position",
        code,
    )
    assert len(rows) == 33
    assert sum(row["random_event"] is None for row in rows) == 30
    events = [row for row in rows if row["random_event"] is not None]
    assert {(row["mode"], row["source"], row["round"]) for row in events} == {
        ("random_event", "pack", 0)
    }
    assert set(row["random_event"] for row in events) <= set(RANDOM_EVENTS)


def test_one_create_over_the_hourly_limit_from_one_ip_is_429(app, client: TestClient) -> None:
    """One create more than ``ROOMS_PER_IP_PER_HOUR`` from one address is 429."""
    for _ in range(app.state.settings.rooms_per_ip_per_hour):
        create(client)
    response = client.post("/api/rooms", json={"returning": False, "display_name": "Zezima"})
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"


def test_create_stores_settings_with_resolved_max_players(client: TestClient, db) -> None:
    code, _ = create(client, modes=[{"mode": "more_less"}], pace="walk")
    (row,) = db("select settings from rooms where code = $1", code)
    assert row["settings"] == {
        # ``questions`` was left out, so the mode's own default filled it in.
        "modes": [{"mode": "more_less", "questions": 5}],
        "mode_order": "random",
        "random_event_frequency": "default",
        "pace": "walk",
        "difficulty": "mixed",
        "standings_seconds": 10,
        "close_when_all_answered": True,
        "name_wrong_answers": True,
        "max_players": 50,
        "teams": [],
    }


def test_create_defaults_the_pace_to_run(client: TestClient, db) -> None:
    code, _ = create(client)
    (row,) = db("select settings from rooms where code = $1", code)
    assert row["settings"]["pace"] == "run"


def test_create_rejects_bad_settings(client: TestClient) -> None:
    bad = [
        {"modes": []},
        {"modes": [{"mode": "closest_number"}]},  # not a type this build plays
        {"modes": [{"mode": "more_less"}, {"mode": "more_less"}]},  # a mode is one round
        {"modes": [{"mode": "more_less", "questions": 0}]},  # under the type's minimum
        {"modes": [{"mode": "more_less", "questions": 31}]},  # over it
        {"modes": [{"mode": "more_less", "seconds": 10}]},  # gone: a question's type times it
        {"modes": [{"mode": "more_less", "rounds": 2}]},  # not a field
        {"modes": ["more_less"]},  # the old shape: a name, not a round
        {"mode_order": "listed_or_not"},
        {"order": "shuffle"},  # gone: the host's questions are random events
        {"modes": [{"mode": "custom"}]},  # never a round
        {"random_events": "sometimes"},
        {"random_events": False},  # The old "host's questions only": a stored room's, never new
        {"random_event_frequency": "never"},  # there is no off switch; "less" is the fewest
        {"random_event_seconds": 2},  # gone: the NPC's hold is the server's, not the room's
        {"reveal_seconds": 6},  # gone: a reveal's type times it
        {"pace": "sprint"},
        {"difficulty": "medium"},  # a question's tier, not a room's
        {"splash_seconds": 0},  # gone: every round is introduced
        {"standings_seconds": -1},
        {"standings_seconds": 31},
        {"max_players": 0},
        {"bogus": 1},
    ]
    for settings in bad:
        response = client.post(
            "/api/rooms", json={"returning": False, "display_name": "Zezima", "settings": settings}
        )
        assert response.status_code == 422, settings
    response = client.post(
        "/api/rooms",
        json={"returning": False, "display_name": "Zezima", "settings": {"max_players": 51}},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "bad_settings"
    response = client.post(
        "/api/rooms",
        json={
            "returning": False,
            "display_name": "Zezima",
            "custom_questions": [{"type": "more_less"}],
        },
    )
    assert response.status_code == 422


# --- the host's own questions ---------------------------------------------------------

THREE_MODES = [{"mode": "more_less"}, {"mode": "price_is_right"}, {"mode": "guess_examine"}]


def own_question(prompt: str = "Which boss drops the Tanzanite fang?", **changes: Any) -> dict:
    """A multiple-choice question the way a host writes one: a type and a payload."""
    question: dict[str, Any] = {
        "type": "multiple_choice",
        "payload": {"prompt": prompt, "options": ["Zulrah", "Vorkath", "Jad"], "answer_index": 0},
    }
    question.update(changes)
    return question


def post(
    client: TestClient, custom: list[Any], modes: list[dict[str, Any]] = THREE_MODES, **settings
) -> httpx.Response:
    return client.post(
        "/api/rooms",
        json={
            "display_name": "Zezima",
            "returning": False,
            "settings": {"modes": modes, **settings},
            "custom_questions": custom,
        },
    )


def assert_no_room(db) -> None:
    for table in ("rooms", "questions", "players"):
        assert db(f"select count(*) as n from {table}")[0]["n"] == 0, table


@pytest.mark.parametrize("escape", ["\\u0000", "\\ud800"])
def test_a_custom_question_postgres_cannot_store_is_a_422_and_no_room(
    client: TestClient, db, escape: str
) -> None:
    """Both are valid JSON escapes, so the body is sent as written rather than re-encoded."""
    body = json.dumps(
        {
            "returning": False,
            "display_name": "Zezima",
            "settings": {},
            "custom_questions": [own_question("X")],
        }
    ).replace('"X"', f'"X{escape}"')
    response = client.post("/api/rooms", content=body, headers={"content-type": "application/json"})
    assert response.status_code == 422, response.text
    assert "$.payload.prompt" in response.text
    assert_no_room(db)


def test_custom_questions_are_stored_as_the_hosts_own_random_events(client: TestClient, db) -> None:
    """``source: room``, ``mode: custom``, the creator as author, each an event inside a
    round and asked by an NPC. Fifteen questions at ``more`` make three slots, and the one
    the host's two leave goes to an NPC's own question."""
    number = {
        "type": "closest_number",
        "payload": {"prompt": "How many Zulrah kills?", "answer": 1234, "unit": "kills"},
        "host_only": True,
    }
    response = post(client, [own_question(), number], random_event_frequency="more")
    assert response.status_code == 201, response.text
    admin = response.json()["player"]["id"]
    rows = db(
        "select position, question_id, type, mode, source, payload, host_only, round,"
        " random_event, author_player_id from questions order by position"
    )
    assert len(rows) == 18
    own = [row for row in rows if row["source"] == "room"]
    assert [(row["type"], row["mode"]) for row in own] == [
        ("multiple_choice", "custom"),
        ("closest_number", "custom"),
    ]
    assert [str(row["author_player_id"]) for row in own] == [admin, admin]
    assert [row["host_only"] for row in own] == [False, True]
    assert own[0]["question_id"] == schema.content_id(own_question())
    assert own[0]["payload"] == {"payload": own_question()["payload"], "tags": []}
    events = [row for row in rows if row["random_event"] is not None]
    assert len(events) == 3 and all(row in events for row in own)
    for row in events:
        before, after = rows[row["position"] - 1], rows[row["position"] + 1]
        assert before["round"] == row["round"] == after["round"], "an event outside a round"
    faces = [row["random_event"] for row in events]
    assert set(faces) <= set(RANDOM_EVENTS)
    assert all(a != b for a, b in zip(faces, faces[1:], strict=False)), "a face twice running"
    (theirs,) = [row for row in events if row["source"] == "pack"]
    assert (theirs["mode"], theirs["author_player_id"]) == ("random_event", None)
    assert "random_event" not in theirs["payload"]  # a column, not part of the question


def test_a_custom_question_is_asked_by_the_npc_it_names(client: TestClient, db) -> None:
    """The named NPC asks it, and two questions naming one NPC are both
    honoured -- even back to back, which a drawn face never is."""
    named = [own_question("Who?", random_event="death"), own_question("Why?", random_event="death")]
    response = post(client, named, random_event_frequency="more")
    assert response.status_code == 201, response.text
    rows = db("select random_event from questions where source = 'room' order by position")
    assert [row["random_event"] for row in rows] == ["death", "death"]


def test_a_custom_question_naming_nobody_on_the_roster_is_refused(client: TestClient, db) -> None:
    response = post(client, [own_question(random_event="rick_turpentine")])
    assert response.status_code == 422
    assert "custom_questions[0] $.random_event: 'rick_turpentine' is not on the roster" in (
        response.text
    )
    assert_no_room(db)


def test_too_many_custom_questions_are_refused_naming_the_frequency(client: TestClient, db) -> None:
    """Fifteen questions at ``default`` make one slot. Refused, never truncated,
    and the refusal says which frequency would make room."""
    response = post(client, [own_question(f"Question {n}?") for n in range(2)])
    assert response.status_code == 422
    assert "2 custom questions" in response.text
    assert "random_event_frequency 'default' make room for 1 random events" in response.text
    assert "Pick random_event_frequency 'more'" in response.text
    assert_no_room(db)
    busy = post(
        client, [own_question(f"Question {n}?") for n in range(4)], random_event_frequency="more"
    )
    assert busy.status_code == 422
    assert "make room for 3" in busy.text
    assert_no_room(db)


def test_rounds_too_short_for_the_hosts_questions_are_refused_as_the_body_is_read(
    client: TestClient, db, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Five one-question rounds at ``more`` hold no event: a round's last question is never
    followed by one. The body says so, as it does for too few round questions, rather than
    the room finding out once it has drawn them."""
    stubs = [f"stub_{index}" for index in range(4)]
    for name in stubs:
        monkeypatch.setitem(MODES, name, Mode(id=name, types=frozenset({"more_less"})))
    ones = [{"mode": name, "questions": 1} for name in ("more_less", *stubs)]
    response = post(client, [own_question()], ones, random_event_frequency="more")
    assert response.status_code == 422
    assert "detail" in response.json(), response.text  # the body's refusal, not the room's
    assert "5 round questions at random_event_frequency 'more' make room for 0" in response.text
    assert_no_room(db)


@pytest.mark.parametrize(
    ("bad", "field"),
    [
        # Schema: one option is not a choice.
        (
            own_question(payload={"prompt": "Who?", "options": ["A"], "answer_index": 0}),
            "$.payload.options",
        ),
        # Schema: a type the question does not have.
        (own_question(type="trivia"), "$.type"),
        # The type's own ``check``: an answer that is none of the options.
        (
            own_question(payload={"prompt": "Who?", "options": ["A", "B"], "answer_index": 3}),
            "$.payload.answer_index",
        ),
        # The mode rule: a host's question is ``custom`` and nothing else.
        (own_question(mode="more_less"), "$.mode"),
        # Nor anyone else's: a pack's source would have let its author score on it.
        (own_question(source="community"), "$.source"),
        (own_question(mode="random_event", source="community", random_event="bob"), "$.mode"),
        # An exported question whose payload was edited after its id was taken.
        (own_question(id="q_0123456789abcdef"), "$.id"),
    ],
)
def test_a_custom_question_that_fails_the_schema_is_refused_by_field(
    client: TestClient, db, bad: dict[str, Any], field: str
) -> None:
    """The 422 names the question by its place and the field by its path."""
    response = post(client, [own_question(), bad])
    assert response.status_code == 422
    assert f"custom_questions[1] {field}" in response.text, response.text
    assert_no_room(db)


def test_a_seven_option_custom_question_is_a_422_naming_the_field(client: TestClient, db) -> None:
    seven = own_question()
    seven["payload"]["options"] = ["Zulrah", "Vorkath", "Jad", "Kraken", "Hydra", "Kree", "Sire"]
    response = post(client, [seven])
    assert response.status_code == 422
    assert "custom_questions[0] $.payload.options" in response.text, response.text
    assert_no_room(db)


def test_a_bad_custom_question_costs_no_rate_limit_quota(client: TestClient) -> None:
    """Checked while the body is parsed, before the limiter counts anything."""
    for _ in range(11):
        assert post(client, [own_question(type="trivia")]).status_code == 422
    assert post(client, [own_question()]).status_code == 201


def test_an_exported_question_posts_back_as_it_came_out(client: TestClient) -> None:
    """Import is the creation body, and an export carries the whole envelope."""
    exported = {
        **own_question(),
        "id": schema.content_id(own_question()),
        "mode": "custom",
        "source": "room",
        "tags": ["clan"],
        "author": "Zezima",
    }
    assert post(client, [exported]).status_code == 201


def test_the_manager_refuses_what_the_body_would_have(app: FastAPI, client: TestClient, db) -> None:
    """``create`` checks again for callers that did not come through ``POST /api/rooms``."""
    settings = RoomSettings(modes=THREE_MODES)
    with pytest.raises(errors.BadQuestion, match=r"custom_questions\[0\] \$\.type"):
        call(client, app.state.rooms.create, "Zezima", settings, [own_question(type="x")])
    too_many = [own_question(f"Question {n}?") for n in range(3)]
    with pytest.raises(errors.BadSettings, match="3 custom questions"):
        call(client, app.state.rooms.create, "Zezima", settings, too_many)
    borrowed = [own_question(source="pack")]
    with pytest.raises(errors.BadQuestion, match=r"custom_questions\[0\] \$\.source"):
        call(client, app.state.rooms.create, "Zezima", settings, borrowed)
    assert_no_room(db)


def test_the_author_is_whoever_wrote_the_question_not_the_source_it_carries() -> None:
    """The host's own list decides, so the creator cannot score on a question of theirs
    even if its envelope ever came to say it was someone else's."""
    room, author = uuid4(), uuid4()
    written = {**own_question(), "id": "q_written", "mode": "custom", "source": "community"}
    drawn = {**own_question("Who?"), "id": "q_drawn", "mode": "more_less", "source": "pack"}
    rows = queries._question_rows(room, [(0, drawn), (0, written)], author, {"q_written"})
    assert [row[-1] for row in rows] == [None, author]


# --- read back --------------------------------------------------------------------


def test_get_room_says_only_the_status_and_count_and_ignores_case(client: TestClient) -> None:
    """Who is in the room is for the people in it: a lookup says whether you can join."""
    code, admin = create(client, modes=[{"mode": "more_less", "questions": 3}])
    response = client.get(f"/api/rooms/{code}")
    assert response.status_code == 200
    assert response.json() == {"status": "lobby", "players": 1}
    assert admin["player"]["display_name"] not in response.text
    assert admin["session"] not in response.text  # section 7: never rendered back
    assert client.get(f"/api/rooms/{code.lower()}").json() == {"status": "lobby", "players": 1}
    assert client.get("/api/rooms/NOSUCHROOM").status_code == 404


# --- join -------------------------------------------------------------------------


def test_join_a_finished_room_is_409(client: TestClient, db, evict) -> None:
    code, _ = create(client)
    db("update rooms set status = 'finished' where code = $1", code)
    evict(code)
    response = join(client, code, "Zezima")
    assert response.status_code == 409
    assert response.json()["code"] == "not_open"


def test_join_success_returns_session_and_appears_in_get(client: TestClient, db) -> None:
    """Success returns a session; the count in GET /api/rooms/{code} goes up."""
    code, admin = create(client)
    response = join(client, code, "  Zezima ")
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"session", "player"}
    assert len(body["session"]) >= 40
    assert body["player"] == {
        "id": body["player"]["id"],
        "display_name": "Zezima",
        "avatar": body["player"]["avatar"],
        "role": "player",
        "team": None,
        "connected": False,
        "ready": False,
        "editing": False,
    }
    (player,) = db("select session_token_hash from players where display_name = 'Zezima'")
    assert player["session_token_hash"] == sha256(body["session"])
    assert body["session"] != admin["session"]

    assert client.get(f"/api/rooms/{code}").json() == {"status": "lobby", "players": 2}
    assert held(client, code)["players"] == [admin["player"], body["player"]]


def test_duplicate_name_is_409(client: TestClient) -> None:
    """Duplicate name is 409, case-insensitively, after trimming."""
    code, _ = create(client)
    assert join(client, code, "Zezima").status_code == 200
    for name in ("Zezima", "zezima", "ZEZIMA", " Zezima "):
        response = join(client, code, name)
        assert response.status_code == 409, name
        assert response.json()["code"] == "name_taken"
    assert join(client, code, "admin").status_code == 409  # the admin counts too


def test_over_max_players_is_409(client: TestClient) -> None:
    """Over ``max_players`` is 409. The admin is one of the players."""
    code, _ = create(client, max_players=2)
    assert join(client, code, "One").status_code == 200
    response = join(client, code, "Two")
    assert response.status_code == 409
    assert response.json()["code"] == "room_full"
    assert client.get(f"/api/rooms/{code}").json()["players"] == 2


def test_join_name_rules(client: TestClient) -> None:
    code, _ = create(client)
    for name in ("", "x" * 13, "a<script>", "tab\there"):
        response = join(client, code, name)
        assert response.status_code == 422, name
        assert response.json()["code"] == "bad_name"
    assert join(client, code, "x" * 12).status_code == 200
    assert join(client, code, "Tom-and_Jo 2").status_code == 200


def test_two_spellings_of_one_name_are_one_name_in_a_room(client: TestClient) -> None:
    """Names are stored after NFKC and space-collapsing, so the unique index sees one name."""
    code, _ = create(client)
    assert join(client, code, "Dan Smith").json()["player"]["display_name"] == "Dan Smith"
    for twin in ("\uff24\uff41\uff4e Smith", "dan   smith", "Dan\u00a0Smith"):
        response = join(client, code, twin)
        assert response.status_code == 409, twin
        assert response.json()["code"] == "name_taken"


def test_join_unknown_and_expired_rooms(client: TestClient, db, evict) -> None:
    assert join(client, "NOSUCHROOM", "x").status_code == 404
    code, _ = create(client)
    db("update rooms set expires_at = now() where code = $1", code)
    evict(code)
    response = join(client, code, "x")
    assert response.status_code == 410
    assert response.json()["code"] == "expired"


def test_the_room_counts_its_random_events_among_its_questions(client: TestClient, db) -> None:
    code, admin = create(
        client,
        modes=[{"mode": "more_less", "questions": 5}, {"mode": "price_is_right", "questions": 5}],
        random_event_frequency="more",
    )
    with client.websocket_connect(f"/ws/{code}") as ws:
        room = hello(ws, admin["session"])["room"]
    events = db("select count(*) as n from questions where random_event is not null")[0]["n"]
    assert events > 0
    assert (room["total"], room["events"]) == (10 + events, events)
