"""The daily counters: each event counted once, in its own transaction, and nobody named."""

from datetime import UTC, datetime, timedelta
from typing import Any, get_args

import asyncpg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.http.ratelimit import JOIN_FAILURES_PER_HOUR
from app.modes import MODES
from app.questions.types import TYPES
from app.rooms import joins
from app.rooms.settings import Frequency, RoomSettings
from app.stats import (
    DURATION_BUCKETS,
    Device,
    JoinFailure,
    Metric,
    Route,
    Theme,
    duration_bucket,
)
from tests.game_api import Game, reseat
from tests.rooms_api import call, create, hello, join, next_of
from tests.test_game import TANZANITE, event_rooms
from tests.test_invite_links import create_keyed
from tests.test_join_requests import decide, poll
from tests.test_themes import listed_themes

MORE_LESS = "more_less"


def counts(db) -> dict[tuple[Metric, str], int]:
    """Today's counters by ``(metric, key)``; every row is today's, in UTC."""
    rows = db("select day, metric, key, count from daily_stats")
    assert {row["day"] for row in rows} <= {datetime.now(UTC).date()}
    return {(Metric(row["metric"]), row["key"]): row["count"] for row in rows}


def play_through(game: Game, questions: int) -> None:
    """Skip every open and reveal until the game finishes."""
    for _ in range(questions):
        game.admin.take("question_open")
        game.skip()
        game.admin.take("question_closed")
        game.skip()
    game.admin.take("game_finished")


def test_a_game_counts_each_event_once(table, client: TestClient, db, second_mode: str) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        seconds=30,
        modes=[
            {"mode": MORE_LESS, "questions": 2},
            {"mode": second_mode, "questions": 1},
        ],
        mode_order="listed",
    )
    assert join(client, game.code, "Woox", returning=True).status_code == 200
    game.start()
    play_through(game, 3)
    assert counts(db) == {
        (Metric.ROOMS_CREATED, ""): 1,
        (Metric.PLAYERS_JOINED, ""): 3,
        (Metric.PLAYERS_RETURNING, ""): 1,
        (Metric.GAMES_STARTED, ""): 1,
        (Metric.EVENT_FREQUENCY, "less"): 1,
        (Metric.ROUNDS_STARTED, MORE_LESS): 1,
        (Metric.QUESTIONS_SKIPPED, MORE_LESS): 2,
        (Metric.ROUNDS_FINISHED, MORE_LESS): 1,
        (Metric.ROUNDS_STARTED, second_mode): 1,
        (Metric.QUESTIONS_SKIPPED, second_mode): 1,
        (Metric.ROUNDS_FINISHED, second_mode): 1,
        (Metric.GAMES_FINISHED, ""): 1,
        (Metric.GAME_DURATIONS, "0-10"): 1,
    }


def test_ending_mid_round_ends_the_game_and_that_round_early(table, db, second_mode) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        seconds=30,
        modes=[
            {"mode": MORE_LESS, "questions": 2},
            {"mode": second_mode, "questions": 1},
        ],
        mode_order="listed",
    )
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    stats = counts(db)
    assert stats[(Metric.ROUNDS_STARTED, MORE_LESS)] == 1
    assert stats[(Metric.ROUNDS_ENDED_EARLY, MORE_LESS)] == 1
    assert stats[(Metric.GAMES_ENDED_EARLY, "")] == 1
    assert not {Metric.ROUNDS_FINISHED, Metric.GAMES_FINISHED} & {m for m, _ in stats}
    assert not {key for _, key in stats} & {second_mode}


def test_ending_in_the_standings_cuts_no_round_short(table, db, second_mode) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        standings_seconds=30,
        seconds=30,
        modes=[
            {"mode": MORE_LESS, "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
        mode_order="listed",
    )
    game.start()
    game.opened(0)
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    game.admin.settle()
    assert game.room.phase == "standings"
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    stats = counts(db)
    assert stats[(Metric.ROUNDS_FINISHED, MORE_LESS)] == 1
    assert stats[(Metric.GAMES_ENDED_EARLY, "")] == 1
    assert Metric.ROUNDS_ENDED_EARLY not in {m for m, _ in stats}
    assert (Metric.ROUNDS_STARTED, second_mode) not in stats


def test_a_restart_that_voids_a_rounds_last_question_finishes_it_once(
    table, client: TestClient, db, evict, second_mode
) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        seconds=30,
        modes=[
            {"mode": MORE_LESS, "questions": 1},
            {"mode": second_mode, "questions": 1},
        ],
        mode_order="listed",
    )
    game.start()
    game.opened(0)
    assert evict(game.code) is True
    with client.websocket_connect(f"/ws/{game.code}") as ws:
        reseat(game.admin, ws).take("welcome")
        assert game.room.questions[0].voided is True
    stats = counts(db)
    assert stats[(Metric.ROUNDS_STARTED, MORE_LESS)] == 1
    assert stats[(Metric.ROUNDS_FINISHED, MORE_LESS)] == 1
    assert Metric.ROUNDS_ENDED_EARLY not in {m for m, _ in stats}


def mid_round(table, name: str = "Zezima", **settings) -> Game:
    """A game on the first of a round's two questions."""
    game = table(name, seconds=30, questions=2, **settings)
    game.start()
    game.opened(0)
    return game


def in_splash(table, name: str = "Zezima") -> Game:
    """A game waiting in the splash before its first round."""
    game = table(name, seconds=30, splash=True)
    game.start()
    game.splash()
    return game


def ended_mid_round(table, name: str = "Zezima") -> Game:
    """A game the host ended on the first of a round's two questions."""
    game = mid_round(table, name)
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    return game


def abandoned(db) -> dict[tuple[Metric, str], int]:
    return {k: n for k, n in counts(db).items() if k[0] in ABANDONED}


ABANDONED = {Metric.GAMES_ABANDONED, Metric.ROUNDS_ABANDONED}


@pytest.mark.parametrize(
    ("setup", "expected"),
    [
        (
            mid_round,
            {(Metric.GAMES_ABANDONED, ""): 1, (Metric.ROUNDS_ABANDONED, MORE_LESS): 1},
        ),
        (in_splash, {(Metric.GAMES_ABANDONED, ""): 1}),
        (ended_mid_round, {}),
    ],
)
def test_deleting_a_room_abandons_what_was_under_way(
    table, client: TestClient, db, setup, expected
) -> None:
    game = setup(table)
    session = game.admin.session
    deleted = client.request("DELETE", f"/api/rooms/{game.code}", json={"session": session})
    assert deleted.status_code == 204
    assert abandoned(db) == expected


def test_cleanup_abandons_only_what_was_under_way(
    app: FastAPI, table, client: TestClient, db, second_mode: str
) -> None:
    """Four rooms past their time: mid-round, in a splash, in the lobby, ended mid-round."""
    mid_round(table, "Zezima", modes=[second_mode])
    in_splash(table, "Woox")
    create(client)
    ended_mid_round(table, "Lynx")
    db("update rooms set expires_at = now() - interval '1 minute'")
    assert call(client, app.state.rooms.purge_expired) == 4
    assert abandoned(db) == {
        (Metric.GAMES_ABANDONED, ""): 2,
        (Metric.ROUNDS_ABANDONED, second_mode): 1,
    }


def test_a_rolled_back_creation_counts_nothing(
    app: FastAPI, client: TestClient, db, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A duplicated session token fails the host's insert, after the room row went in."""
    _, admin = create(client)
    before = counts(db)
    monkeypatch.setattr(joins, "new_token", lambda: admin["session"])
    with pytest.raises(asyncpg.UniqueViolationError):
        call(client, app.state.rooms.create, "Other", RoomSettings(), [], None, True)
    assert counts(db) == before


def test_a_refused_join_counts_nothing(client: TestClient, db) -> None:
    code, _ = create(client)
    before = counts(db)
    assert join(client, code, "Admin", returning=True).status_code == 409
    assert counts(db) == before


def test_deleting_a_room_leaves_its_counts(client: TestClient, db) -> None:
    code, admin = create(client)
    join(client, code, "Zezima")
    before = counts(db)
    deleted = client.request("DELETE", f"/api/rooms/{code}", json={"session": admin["session"]})
    assert deleted.status_code == 204
    assert db("select count(*) as n from rooms")[0]["n"] == 0
    assert counts(db) == before


def test_two_creations_on_one_day_make_one_row(client: TestClient, db) -> None:
    create(client)
    create(client)
    rows = db("select count from daily_stats where metric = $1", Metric.ROOMS_CREATED.value)
    assert [row["count"] for row in rows] == [2]


def test_returning_is_counted_and_stored_nowhere_else(client: TestClient, db) -> None:
    code, _ = create(client, returning=True)
    join(client, code, "Zezima", returning=True)
    join(client, code, "Woox", returning=False)
    stats = counts(db)
    assert (stats[(Metric.PLAYERS_JOINED, "")], stats[(Metric.PLAYERS_RETURNING, "")]) == (3, 2)
    columns = db(
        "select table_name, column_name from information_schema.columns"
        " where table_schema = 'public' and column_name like '%return%'"
    )
    assert columns == []


@pytest.mark.parametrize("path", ["/api/rooms", "/api/rooms/{code}/join"])
def test_returning_is_required(client: TestClient, path: str) -> None:
    code, _ = create(client)
    response = client.post(path.format(code=code), json={"display_name": "Zezima"})
    assert response.status_code == 422


def test_the_table_names_nobody(db) -> None:
    """``daily_stats`` holds exactly these columns, and must never gain an IP, a name, a room
    code or a player id: the counters exist to say how much the instance is played, and any
    of those would turn them into a record of who played, when, and with whom. Count
    something new as a new metric or key, never as a column that identifies anyone.
    """
    rows = db(
        "select column_name from information_schema.columns"
        " where table_schema = 'public' and table_name = 'daily_stats'"
    )
    assert {row["column_name"] for row in rows} == {"day", "metric", "key", "count"}


def test_each_way_a_question_closes_is_counted_under_its_mode(table, db, second_mode: str) -> None:
    game = table(
        "Zezima",
        reveal_seconds=30,
        seconds=30,
        modes=[{"mode": MORE_LESS, "questions": 2}, {"mode": second_mode, "questions": 1}],
        mode_order="listed",
    )
    admin, zezima = game.seats
    game.start()
    game.opened(0)
    for seat in (admin, zezima):
        game.answer(seat, 0, game.right(0))
    admin.take("question_closed")
    game.skip()
    game.opened(1)
    game.skip()
    admin.take("question_closed")
    game.app.state.rooms.answer_seconds = 1  # the last question times out
    game.skip()
    game.opened(2)
    admin.take("question_closed")
    closes = {Metric.QUESTIONS_ALL_ANSWERED, Metric.QUESTIONS_SKIPPED, Metric.QUESTIONS_TIMED_OUT}
    assert {k: n for k, n in counts(db).items() if k[0] in closes} == {
        (Metric.QUESTIONS_ALL_ANSWERED, MORE_LESS): 1,
        (Metric.QUESTIONS_SKIPPED, MORE_LESS): 1,
        (Metric.QUESTIONS_TIMED_OUT, second_mode): 1,
    }


def test_a_game_start_counts_its_event_frequency_and_the_hosts_own_questions(
    table, db, second_mode: str
) -> None:
    game = table("Zezima", custom=[TANZANITE, TANZANITE], **event_rooms(second_mode, 5))
    game.start()
    game.opened(0)
    stats = counts(db)
    assert stats[(Metric.EVENT_FREQUENCY, "more")] == 1
    assert stats[(Metric.CUSTOM_QUESTIONS, "multiple_choice")] == 2
    assert stats[(Metric.GAMES_WITH_CUSTOM, "")] == 1


def test_a_room_that_never_starts_counts_no_game(client: TestClient, db) -> None:
    create(client)
    assert set(counts(db)) == {(Metric.ROOMS_CREATED, ""), (Metric.PLAYERS_JOINED, "")}


def test_a_finished_game_lasts_from_its_first_question_to_its_end(table, db) -> None:
    game = table("Zezima", reveal_seconds=30, questions=1, seconds=30)
    game.start()
    game.opened(0)
    question = game.question(0)
    assert question.shown_at is not None
    question.shown_at -= timedelta(minutes=25)
    game.skip()
    game.admin.take("question_closed")
    game.skip()
    game.admin.take("game_finished")
    assert counts(db)[(Metric.GAME_DURATIONS, "20-30")] == 1


def test_a_game_ended_early_has_no_duration(table, db) -> None:
    ended_mid_round(table)
    assert Metric.GAME_DURATIONS not in {m for m, _ in counts(db)}


@pytest.mark.parametrize(
    ("minutes", "bucket"),
    [(0, "0-10"), (9.9, "0-10"), (10, "10-20"), (44, "30-45"), (59.9, "45-60"), (60, "60+")],
)
def test_duration_buckets(minutes: float, bucket: str) -> None:
    assert duration_bucket(timedelta(minutes=minutes)) == bucket


def test_the_server_takes_exactly_the_themes_the_client_paints() -> None:
    assert list(get_args(Theme)) == listed_themes()


def arrived(**fields: Any) -> dict[str, Any]:
    return {"returning": False, **fields}


def test_what_a_browser_reports_on_the_way_in_is_counted(client: TestClient, db) -> None:
    created = client.post(
        "/api/rooms",
        json=arrived(display_name="Admin", theme="tzhaar", device="desktop"),
    )
    assert created.status_code == 201, created.text
    code = created.json()["code"]
    body = arrived(display_name="Zezima", theme="tzhaar", device="mobile", via="public")
    assert client.post(f"/api/rooms/{code}/join", json=body).status_code == 200
    assert join(client, code, "Woox").status_code == 200
    stats = counts(db)
    assert {k: n for k, n in stats.items() if k[0] != Metric.PLAYERS_JOINED} == {
        (Metric.ROOMS_CREATED, ""): 1,
        (Metric.THEMES, "tzhaar"): 2,
        (Metric.DEVICES, "desktop"): 1,
        (Metric.DEVICES, "mobile"): 1,
        (Metric.JOIN_ROUTES, "public"): 1,
    }


@pytest.mark.parametrize(
    "field", [{"theme": "zezima"}, {"device": "fridge"}, {"via": "carrier_pigeon"}]
)
def test_only_known_values_are_taken(client: TestClient, db, field: dict[str, str]) -> None:
    code, _ = create(client)
    before = counts(db)
    response = client.post(f"/api/rooms/{code}/join", json=arrived(display_name="Zezima", **field))
    assert response.status_code == 422
    assert counts(db) == before


def test_the_host_cannot_say_how_they_got_to_a_room_they_made(client: TestClient) -> None:
    response = client.post("/api/rooms", json=arrived(display_name="Admin", via="code"))
    assert response.status_code == 422


@pytest.mark.parametrize("accept", [True, False])
def test_a_join_request_counts_its_arrival_only_once_let_in(
    client: TestClient, db, accept: bool
) -> None:
    code, admin = create_keyed(client)
    before = counts(db)
    body = arrived(display_name="Zezima", theme="wilderness", device="mobile", via="link")
    asked = client.post(f"/api/rooms/{code}/requests", json=body)
    assert asked.status_code == 201
    ticket = asked.json()["ticket"]
    with client.websocket_connect(f"/ws/{code}") as host:
        welcome = hello(host, admin["session"])
        assert counts(db) == before
        decide(host, welcome["room"]["requests"][0], accept=accept)
        next_of(host, "room_updated")
        poll(client, code, ticket)
    added = {k: n - before.get(k, 0) for k, n in counts(db).items() if n != before.get(k, 0)}
    assert added == (
        {
            (Metric.PLAYERS_JOINED, ""): 1,
            (Metric.THEMES, "wilderness"): 1,
            (Metric.DEVICES, "mobile"): 1,
            (Metric.JOIN_ROUTES, "link"): 1,
        }
        if accept
        else {}
    )


def report_failure(client: TestClient, reason: str) -> int:
    return client.post("/api/stats/join-failure", json={"reason": reason}).status_code


def test_a_join_failure_the_browser_reports_is_counted(client: TestClient, db) -> None:
    for reason in ("not_found", "name_taken", "name_taken", "request_denied"):
        assert report_failure(client, reason) == 204
    assert counts(db) == {
        (Metric.JOIN_FAILURES, "not_found"): 1,
        (Metric.JOIN_FAILURES, "name_taken"): 2,
        (Metric.JOIN_FAILURES, "request_denied"): 1,
    }


def test_an_unknown_join_failure_is_refused(client: TestClient, db) -> None:
    assert report_failure(client, "Zezima") == 422
    assert counts(db) == {}


def test_join_failure_reports_are_rate_limited(client: TestClient, db) -> None:
    for _ in range(JOIN_FAILURES_PER_HOUR):
        assert report_failure(client, "room_full") == 204
    assert report_failure(client, "room_full") == 429
    assert counts(db) == {(Metric.JOIN_FAILURES, "room_full"): JOIN_FAILURES_PER_HOUR}


def keys_allowed() -> dict[Metric, set[str]]:
    """Every value each metric's key may take. A metric missing here fails the test below."""
    modes, types = set(MODES), set(TYPES)
    lengths = {duration_bucket(timedelta(minutes=m)) for m in (0, *DURATION_BUCKETS)}
    unkeyed = {
        Metric.ROOMS_CREATED,
        Metric.GAMES_STARTED,
        Metric.GAMES_ENDED_EARLY,
        Metric.GAMES_FINISHED,
        Metric.GAMES_ABANDONED,
        Metric.PLAYERS_JOINED,
        Metric.PLAYERS_RETURNING,
        Metric.GAMES_WITH_CUSTOM,
    }
    by_mode = {
        Metric.ROUNDS_STARTED,
        Metric.ROUNDS_ENDED_EARLY,
        Metric.ROUNDS_FINISHED,
        Metric.ROUNDS_ABANDONED,
        Metric.QUESTIONS_ALL_ANSWERED,
        Metric.QUESTIONS_TIMED_OUT,
        Metric.QUESTIONS_SKIPPED,
    }
    return {
        **dict.fromkeys(unkeyed, {""}),
        **dict.fromkeys(by_mode, modes),
        Metric.EVENT_FREQUENCY: set(get_args(Frequency)),
        Metric.CUSTOM_QUESTIONS: types,
        Metric.GAME_DURATIONS: lengths,
        Metric.THEMES: set(get_args(Theme)),
        Metric.DEVICES: set(get_args(Device)),
        Metric.JOIN_ROUTES: set(get_args(Route)),
        Metric.JOIN_FAILURES: set(get_args(JoinFailure)),
    }


def test_every_metric_says_which_keys_it_takes() -> None:
    assert set(keys_allowed()) == set(Metric)


def test_every_key_comes_from_a_fixed_set(table, client: TestClient, db, second_mode: str) -> None:
    """Nothing typed, and nothing that names anyone, can become a key: the admin view's
    privacy test leaves keys to this one."""
    game = table("Zezima", custom=[TANZANITE], reveal_seconds=30, **event_rooms(second_mode))
    body = arrived(display_name="Woox", theme="tzhaar", device="mobile", via="code")
    assert client.post(f"/api/rooms/{game.code}/join", json=body).status_code == 200
    assert report_failure(client, "bad_key") == 204
    game.start()
    play_through(game, len(game.room.questions))
    stats = counts(db)
    keyed = {metric for metric, key in stats if key}
    assert keyed >= {Metric.EVENT_FREQUENCY, Metric.CUSTOM_QUESTIONS, Metric.GAME_DURATIONS}
    allowed = keys_allowed()
    assert [(m, k) for m, k in stats if k not in allowed[m]] == []
