"""A daily attempt: the day's set, played alone, once, in a room nobody else can find."""

import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession

from app.daily import day_of, next_opens
from app.question_stats import counts
from app.questions.submission import Submission
from app.questions.types import TYPES, pictured
from app.rooms.daily_room import DAILY_REVEAL_SECONDS
from app.rooms.errors import BadState
from app.rooms.models import Room
from app.stats import Metric
from app.ws import handler as ws_handler
from tests.answers import right_value, wrong_value
from tests.rooms_api import call, closed_with, hello, next_of

TOKEN = "a" * 32
OTHER = "b" * 32


@pytest.fixture
def quick(app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    """Questions open a second, no pause after the last answer, and no socket rate limit."""
    monkeypatch.setattr(ws_handler, "RATE_BURST", 10_000)
    app.state.rooms.answer_seconds = 1
    app.state.rooms.all_answered_pause = 0
    return app


def start(client: TestClient, token: str = TOKEN, name: str = "Zezima") -> Any:
    return client.post("/api/daily", json={"token": token, "display_name": name})


def started(client: TestClient, token: str = TOKEN) -> tuple[str, str]:
    response = start(client, token)
    assert response.status_code == 200, response.json()
    body = response.json()
    return body["code"], body["session"]


def room_of(client: TestClient, code: str) -> Room:
    return call(client, client.app.state.rooms.get, code)  # type: ignore[attr-defined]


@contextmanager
def seat(client: TestClient, code: str, session: str) -> Iterator[WebSocketTestSession]:
    with client.websocket_connect(f"/ws/{code}") as ws:
        hello(ws, session)
        yield ws


def answer_for(room: Room, index: int, how: str) -> Any:
    question = room.questions[index]
    pick = right_value if how == "right" else wrong_value
    return pick(question.type, question.payload)


def play(
    client: TestClient,
    code: str,
    ws: WebSocketTestSession,
    how: Callable[[int], str | None] = lambda index: "right",
    start_at: int = 0,
) -> dict[str, Any]:
    """Play from question ``start_at`` to the end, pressing Next on every reveal."""
    room = room_of(client, code)
    for index in range(start_at, len(room.questions)):
        opened = next_of(ws, "question_open", 30)
        assert opened["question"]["index"] == index
        choice = how(index)
        if choice is not None:
            ws.send_json(
                {
                    "t": "answer",
                    "question_id": opened["question"]["question_id"],
                    "value": answer_for(room, index, choice),
                }
            )
        next_of(ws, "question_closed", 30)
        ws.send_json({"t": "skip", "phase": "reveal", "index": index})
    return next_of(ws, "game_finished", 30)


def played(client: TestClient, token: str = TOKEN, **kwargs: Any) -> str:
    code, session = started(client, token)
    with seat(client, code, session) as ws:
        play(client, code, ws, **kwargs)
    return code


def content_ids(db, code: str) -> list[str]:
    rows = db(
        "select q.question_id from questions q join rooms r on r.id = q.room_id"
        " where r.code = $1 order by q.position",
        code.upper(),
    )
    return [row["question_id"] for row in rows]


def test_two_players_on_one_day_get_the_same_questions_in_the_same_order(
    quick: FastAPI, client: TestClient, db
) -> None:
    first, _ = started(client, TOKEN)
    second, _ = started(client, OTHER)
    assert first != second
    stored = db("select questions from daily_sets")
    assert len(stored) == 1
    expected = [question["id"] for question in stored[0]["questions"]]
    assert content_ids(db, first) == content_ids(db, second) == expected


def test_a_second_attempt_on_the_same_day_is_refused(quick: FastAPI, client: TestClient) -> None:
    played(client, how=lambda index: "right" if index < 7 else None)
    again = start(client, name="Woox")
    assert again.status_code == 409
    body = again.json()
    assert body["code"] == "daily_played"
    result = body["result"]
    assert result["correct"] == 7
    assert result["results"] == ["right"] * 7 + ["missed"] * 3
    assert result["points"] > 0


def test_a_partial_answer_is_partial(quick: FastAPI, client: TestClient, db) -> None:
    code, session = started(client)
    room = room_of(client, code)
    with seat(client, code, session) as ws:
        play(client, code, ws, how=lambda index: "wrong")
    rows = db("select results from daily_attempts")
    for question, result in zip(room.questions, rows[0]["results"], strict=True):
        value = wrong_value(question.type, question.payload)
        got = TYPES[question.type].grade(question.payload, [Submission("me", value)]).get("me", 0)
        assert result == ("partial" if 0 < got < 1 else "missed"), question.type


def test_starting_again_mid_attempt_resumes_it_with_a_fresh_session(
    quick: FastAPI, client: TestClient
) -> None:
    code, session = started(client)
    room = room_of(client, code)
    with seat(client, code, session) as ws:
        opened = next_of(ws, "question_open", 30)
        ws.send_json(
            {
                "t": "answer",
                "question_id": opened["question"]["question_id"],
                "value": answer_for(room, 0, "right"),
            }
        )
        next_of(ws, "question_closed", 30)
    again, fresh = started(client)
    assert again == code
    assert fresh != session
    with client.websocket_connect(f"/ws/{code}") as ws:
        ws.send_json({"t": "hello", "session": session})
        assert next_of(ws, "error")["code"] == "bad_hello"
        assert closed_with(ws) == 4001
    with client.websocket_connect(f"/ws/{code}") as ws:
        welcome = hello(ws, fresh)
        assert welcome["room"]["daily"]["day"] == day_of(datetime.now(UTC)).isoformat()
        assert welcome["room"]["phase"] == "reveal"
        assert welcome["room"]["current_index"] == 0
        ws.send_json({"t": "skip", "phase": "reveal", "index": 0})
        play(client, code, ws, start_at=1)
    assert start(client).status_code == 409


def test_a_resume_after_a_restart_picks_up_the_owed_question(
    quick: FastAPI, client: TestClient, evict: Callable[[str], bool]
) -> None:
    code, session = started(client)
    with seat(client, code, session) as ws:
        next_of(ws, "question_open", 30)
        next_of(ws, "question_closed", 30)
        ws.send_json({"t": "skip", "phase": "reveal", "index": 0})
        next_of(ws, "question_open", 30)
    assert evict(code)
    again, fresh = started(client)
    assert again == code
    with seat(client, code, fresh) as ws:
        ws.send_json({"t": "skip", "phase": "reveal", "index": 1})
        finished = play(client, code, ws, how=lambda index: None, start_at=2)
    assert finished["standings"][0]["points"] == 0
    assert start(client).json()["result"]["results"] == ["missed"] * 10


def test_no_answer_reaches_the_client_before_its_question_closes(
    quick: FastAPI, client: TestClient
) -> None:
    code, session = started(client)
    room = room_of(client, code)
    manager = client.app.state.rooms  # type: ignore[attr-defined]
    with seat(client, code, session) as ws:
        for index, question in enumerate(room.questions):
            opened = next_of(ws, "question_open", 30)
            view = TYPES[question.type].client_view(question.payload)
            shown = pictured(question.type, view, question.payload, manager._pictures(question))
            assert opened["question"]["view"] == shown
            assert "reveal" not in opened and "results" not in opened
            closed = next_of(ws, "question_closed", 30)
            assert closed["reveal"] == pictured(
                question.type,
                TYPES[question.type].reveal(question.payload),
                question.payload,
                manager._pictures(question),
            )
            ws.send_json({"t": "skip", "phase": "reveal", "index": index})


def test_next_moves_on_from_a_reveal_that_otherwise_waits_five_minutes(
    quick: FastAPI, client: TestClient
) -> None:
    code, session = started(client)
    with seat(client, code, session) as ws:
        opened = next_of(ws, "question_open", 30)
        closed = next_of(ws, "question_closed", 30)
        assert closed["reveal_seconds"] is None
        opened_at = datetime.fromisoformat(opened["question"]["ends_at"])
        waits = datetime.fromisoformat(closed["next_at"]) - opened_at
        assert DAILY_REVEAL_SECONDS - 5 < waits.total_seconds() <= DAILY_REVEAL_SECONDS + 5
        assert DAILY_REVEAL_SECONDS == 300
        ws.send_json({"t": "skip", "phase": "reveal", "index": 0})
        assert next_of(ws, "question_open", 30)["question"]["index"] == 1


def test_a_reveal_left_alone_moves_on_by_itself(quick: FastAPI, client: TestClient) -> None:
    quick.state.rooms.daily_reveal_seconds = 0.2
    code, session = started(client)
    with seat(client, code, session) as ws:
        next_of(ws, "question_closed", 30)
        assert next_of(ws, "question_open", 30)["question"]["index"] == 1


def test_the_player_skips_only_the_reveal(quick: FastAPI, client: TestClient) -> None:
    quick.state.rooms.answer_seconds = 30
    code, session = started(client)
    with seat(client, code, session) as ws:
        next_of(ws, "question_open", 30)
        ws.send_json({"t": "skip", "phase": "open", "index": 0})
        assert next_of(ws, "error")["code"] == "not_admin"
        ws.send_json({"t": "end_game"})
        assert next_of(ws, "error")["code"] == "not_admin"


def test_an_attempt_started_before_the_rollover_finishes_on_its_own_day(
    quick: FastAPI, client: TestClient, db
) -> None:
    manager = client.app.state.rooms  # type: ignore[attr-defined]
    before = datetime(2026, 11, 2, 7, 59, tzinfo=UTC)
    after = datetime(2026, 11, 2, 8, 1, tzinfo=UTC)
    code, session = call(client, manager.start_daily, TOKEN, "Zezima", None, before, lambda: None)
    yesterday = db("select questions from daily_sets where day = $1", day_of(before))
    again, fresh = call(client, manager.start_daily, TOKEN, "Zezima", None, after, lambda: None)
    assert again == code
    assert content_ids(db, code) == [q["id"] for q in yesterday[0]["questions"]]
    with seat(client, code, fresh) as ws:
        play(client, code, ws)
    attempts = db("select day, finished_at from daily_attempts")
    assert [row["day"] for row in attempts] == [day_of(before)]
    assert attempts[0]["finished_at"] is not None
    today, _ = call(client, manager.start_daily, TOKEN, "Zezima", None, after, lambda: None)
    assert today != code
    assert db("select daily from rooms where code = $1", today.upper())[0]["daily"] == day_of(after)


def test_a_daily_answer_counts_in_question_stats(quick: FastAPI, client: TestClient, db) -> None:
    code, session = started(client)
    room = room_of(client, code)
    with seat(client, code, session) as ws:
        play(client, code, ws)
    counted = [q.content_id for q in room.questions if counts(q)]
    assert counted, "a set with no hand-written question tells nothing"
    rows = db("select question_id, answers, correct, games from question_stats")
    assert {row["question_id"]: (row["answers"], row["correct"], row["games"]) for row in rows} == {
        question_id: (1, 1, 1) for question_id in counted
    }


def left_after_one_answer(quick: FastAPI, client: TestClient, db) -> Room:
    """Answer the first question, walk off and wait for the room to run itself out."""
    quick.state.rooms.daily_reveal_seconds = 0.2
    code, session = started(client)
    room = room_of(client, code)
    with seat(client, code, session) as ws:
        opened = next_of(ws, "question_open", 30)
        ws.send_json(
            {
                "t": "answer",
                "question_id": opened["question"]["question_id"],
                "value": answer_for(room, 0, "right"),
            }
        )
        next_of(ws, "question_closed", 30)
    deadline = time.monotonic() + 30
    while not db("select 1 from daily_attempts where finished_at is not null"):
        assert time.monotonic() < deadline, "the room never ran out"
        time.sleep(0.05)
    return room


def test_a_question_that_closes_on_nobody_counts_in_no_question_stats(
    quick: FastAPI, client: TestClient, db
) -> None:
    room = left_after_one_answer(quick, client, db)
    seen = {row["question_id"] for row in db("select question_id from question_stats")}
    assert seen == {q.content_id for q in room.questions[:1] if counts(q)}


def test_an_attempt_that_ran_out_is_not_counted_as_finished(
    quick: FastAPI, client: TestClient, db
) -> None:
    left_after_one_answer(quick, client, db)
    stats = {(row["metric"], row["key"]): row["count"] for row in db("select * from daily_stats")}
    assert stats == {(Metric.DAILY, "started"): 1, (Metric.DAILY, "ran_out"): 1}


def test_a_daily_counts_in_the_daily_metrics_and_in_no_game_metric(
    quick: FastAPI, client: TestClient, db
) -> None:
    code = played(client, how=lambda index: "right" if index < 4 else None)
    started(client, OTHER)
    stats = {(row["metric"], row["key"]): row["count"] for row in db("select * from daily_stats")}
    points = db(
        "select coalesce(sum(a.points), 0) as points from answers a"
        " join players p on p.id = a.player_id join rooms r on r.id = p.room_id"
        " where r.code = $1",
        code.upper(),
    )[0]["points"]
    assert stats == {
        (Metric.DAILY, "started"): 2,
        (Metric.DAILY, "finished"): 1,
        (Metric.DAILY, "points"): points,
        (Metric.DAILY, "correct"): 4,
    }


def test_the_result_remains_after_the_room_is_cleaned_up(
    quick: FastAPI, client: TestClient, db
) -> None:
    code = played(client)
    db("delete from rooms where code = $1", code.upper())
    refused = start(client)
    assert refused.status_code == 409
    assert refused.json()["result"]["results"] == ["right"] * 10


def test_an_attempt_whose_room_went_ends_with_what_it_played(
    quick: FastAPI, client: TestClient, db, evict: Callable[[str], bool]
) -> None:
    code, session = started(client)
    with seat(client, code, session) as ws:
        next_of(ws, "question_closed", 30)
    assert evict(code)
    db("delete from rooms where code = $1", code.upper())
    refused = start(client)
    assert refused.status_code == 409
    assert refused.json()["result"]["results"] == ["missed"] * 10


def test_nobody_else_can_find_a_daily_room(quick: FastAPI, client: TestClient) -> None:
    code, _ = started(client)
    assert client.get(f"/api/rooms/{code}").status_code == 404
    joined = client.post(
        f"/api/rooms/{code}/join", json={"display_name": "Woox", "returning": False}
    )
    assert joined.status_code == 404
    assert client.get("/api/rooms/public").json() == []


def test_a_resume_costs_no_start(quick: FastAPI, client: TestClient) -> None:
    quick.state.dailies.limit = 1
    started(client)
    for _ in range(3):
        started(client)
    assert start(client, OTHER).status_code == 429


def test_the_day_and_its_number(quick: FastAPI, client: TestClient) -> None:
    body = client.get("/api/daily").json()
    day = day_of(datetime.now(UTC))
    first = client.app.state.settings.daily_first_day  # type: ignore[attr-defined]
    assert body == {
        "day": day.isoformat(),
        "number": (day - first).days + 1,
        "next_at": next_opens(day).isoformat(),
    }


def test_no_daily_before_the_first_day(
    quick: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    tomorrow = day_of(datetime.now(UTC)) + timedelta(days=1)
    monkeypatch.setattr(client.app.state.settings, "daily_first_day", tomorrow)  # type: ignore[attr-defined]
    for response in (client.get("/api/daily"), start(client)):
        assert response.status_code == 404
        assert response.json()["code"] == "daily_not_open"


def test_the_first_day_is_daily_one(
    quick: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    today = day_of(datetime.now(UTC))
    monkeypatch.setattr(client.app.state.settings, "daily_first_day", today)  # type: ignore[attr-defined]
    assert client.get("/api/daily").json()["number"] == 1
    started(client)


def test_the_next_daily_opens_at_the_rollover(quick: FastAPI, client: TestClient) -> None:
    next_at = datetime.fromisoformat(client.get("/api/daily").json()["next_at"])
    assert timedelta(0) < next_at - datetime.now(UTC) <= timedelta(days=1)
    assert day_of(next_at) == day_of(datetime.now(UTC)) + timedelta(days=1)


def test_the_name_must_be_a_name(quick: FastAPI, client: TestClient) -> None:
    assert start(client, name="!!").status_code == 422


def test_asking_for_the_result_of_an_attempt_whose_room_went_ends_it(
    quick: FastAPI, client: TestClient, db, evict: Callable[[str], bool]
) -> None:
    code, session = started(client)
    with seat(client, code, session) as ws:
        next_of(ws, "question_closed", 30)
    assert evict(code)
    db("delete from rooms where code = $1", code.upper())
    day = day_of(datetime.now(UTC)).isoformat()
    body = client.post("/api/daily/result", json={"token": TOKEN, "day": day}).json()
    assert body["results"] == ["missed"] * 10
    assert db("select finished_at from daily_attempts")[0]["finished_at"] is not None


def test_the_result_of_a_finished_attempt_starts_nothing(
    quick: FastAPI, client: TestClient, db
) -> None:
    day = day_of(datetime.now(UTC)).isoformat()
    asked = {"token": TOKEN, "day": day}
    assert client.post("/api/daily/result", json=asked).status_code == 404
    code, session = started(client)
    assert client.post("/api/daily/result", json=asked).status_code == 404
    with seat(client, code, session) as ws:
        play(client, code, ws, how=lambda index: "right" if index != 3 else None)
    body = client.post("/api/daily/result", json=asked).json()
    assert body["day"] == day
    assert body["correct"] == 9
    assert body["results"][3] == "missed"
    assert body == start(client).json()["result"]
    other = client.post("/api/daily/result", json={"token": OTHER, "day": day})
    assert other.status_code == 404
    assert len(db("select 1 from daily_attempts")) == 1


def test_a_finished_daily_room_cannot_rematch(quick: FastAPI, client: TestClient) -> None:
    code = played(client)
    room = room_of(client, code)
    (player,) = room.players.values()
    as_admin = replace(player, role="admin")
    with pytest.raises(BadState):
        call(client, client.app.state.rooms.rematch, code, as_admin)  # type: ignore[attr-defined]
    assert room_of(client, code).status == "finished"
