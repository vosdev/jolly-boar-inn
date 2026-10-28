"""``GET /metrics``: OpenMetrics exposition, bearer auth, gauges, counters and fixed labels."""

import asyncio
import hmac
import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from prometheus_client.openmetrics.parser import text_string_to_metric_families
from pydantic import ValidationError

from app import metrics
from app.config import APP_VERSION, Settings
from app.http import metrics as http_metrics
from app.http.ratelimit import RateLimiter
from app.main import create_app
from tests.conftest import BASE
from tests.game_api import Game
from tests.packs import PACKS_DIR

TOKEN = "fedcba9876543210fedcba9876543210"
ADMIN_TOKEN = "0123456789abcdef0123456789abcdef"
BEARER = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def app(test_db_dsn: str, dist: Path) -> FastAPI:
    """The conftest's app, with ``/metrics`` turned on."""
    settings = Settings(
        _env_file=None,
        database_url=test_db_dsn,
        packs_dir=PACKS_DIR,
        public_base_url=BASE,
        metrics_token=TOKEN,
        admin_token=ADMIN_TOKEN,
    )
    return create_app(settings, dist)


def offline(settings: Settings, dist: Path, token: str = TOKEN) -> TestClient:
    return TestClient(create_app(settings.model_copy(update={"metrics_token": token}), dist))


def scrape(client: TestClient) -> dict[str, list[tuple[dict[str, str], float]]]:
    """Fetch ``/metrics``, parse as OpenMetrics, and index samples by sample name."""
    response = client.get("/metrics", headers=BEARER)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == metrics.CONTENT_TYPE_LATEST
    assert response.headers["cache-control"] == "no-store"
    assert response.text.endswith("# EOF\n")
    samples: dict[str, list[tuple[dict[str, str], float]]] = {}
    for family in text_string_to_metric_families(response.text):
        for sample in family.samples:
            samples.setdefault(sample.name, []).append((dict(sample.labels), float(sample.value)))
    return samples


def sample_value(
    scraped: dict[str, list[tuple[dict[str, str], float]]],
    name: str,
    **labels: str,
) -> float:
    for sample_labels, value in scraped.get(name, ()):
        if sample_labels == labels:
            return value
    raise AssertionError(f"no sample {name}{labels} in {scraped.get(name)}")


# --- Auth and mounting ----------------------------------------------------------------


@pytest.mark.parametrize("token", [None, ""])
def test_without_metrics_token_metrics_is_404_not_spa(
    settings: Settings, dist: Path, monkeypatch: pytest.MonkeyPatch, token: str | None
) -> None:
    if token is not None:
        monkeypatch.setenv("METRICS_TOKEN", token)
    configured = Settings(
        _env_file=None, database_url=settings.database_url, admin_token=ADMIN_TOKEN
    )
    assert configured.metrics_token == ""
    with TestClient(create_app(configured, dist)) as client:
        for method in ("GET", "HEAD", "POST"):
            body = None if method in ("GET", "HEAD") else {}
            response = client.request(method, "/metrics", headers=BEARER, json=body)
            assert response.status_code == 404, method


def test_short_or_unsafe_metrics_token_refuses_to_start(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("METRICS_TOKEN", "x" * 31)
    with pytest.raises(
        ValidationError, match="METRICS_TOKEN is 31 characters; it needs at least 32"
    ):
        Settings(_env_file=None)
    monkeypatch.setenv("METRICS_TOKEN", "a" * 31 + "&")
    with pytest.raises(ValidationError, match="letters, digits and - . _ ~"):
        Settings(_env_file=None)


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": f"Bearer {TOKEN}x"},
        {"Authorization": f"Bearer {TOKEN[:-1]}"},
        {"Authorization": f"Bearer {ADMIN_TOKEN}"},
        {"Authorization": f"Basic {TOKEN}"},
        {"Authorization": TOKEN},
        {"Authorization": "Bearer é".encode("latin-1")},
    ],
)
def test_missing_wrong_or_admin_token_is_401(
    settings: Settings, dist: Path, headers: dict[str, str]
) -> None:
    configured = settings.model_copy(update={"metrics_token": TOKEN, "admin_token": ADMIN_TOKEN})
    with TestClient(create_app(configured, dist)) as client:
        response = client.get("/metrics", headers=headers)
        assert response.status_code == 401
        assert response.json()["code"] == "unauthorized"
        assert response.headers["www-authenticate"] == "Bearer"
        # And the metrics token never unlocks /api/admin/*.
        admin_resp = client.get("/api/admin/rooms", headers=BEARER)
        assert admin_resp.status_code == 401


def test_metrics_token_is_compared_in_constant_time(
    settings: Settings, dist: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    compared: list[tuple[bytes, bytes]] = []
    real = hmac.compare_digest

    def spy(a: bytes, b: bytes) -> bool:
        compared.append((a, b))
        return real(a, b)

    monkeypatch.setattr(http_metrics.hmac, "compare_digest", spy)
    with offline(settings, dist) as client:
        assert client.get("/metrics", headers={"Authorization": "Bearer nope"}).status_code == 401
        assert client.get("/metrics", headers=BEARER).status_code == 200
    assert compared == [(b"nope", TOKEN.encode()), (TOKEN.encode(), TOKEN.encode())]


# --- Gauges, counters and histograms --------------------------------------------------


def test_openmetrics_format_and_build_and_process_collectors(client: TestClient) -> None:
    assert client.get("/api/health").status_code == 200
    scraped = scrape(client)
    assert sample_value(scraped, "jbi_build_info", version=APP_VERSION) == 1.0
    assert sample_value(scraped, "jbi_process_start_time_seconds") > 1_700_000_000.0
    assert "python_info" in scraped
    assert "python_gc_collections_total" in scraped
    assert sample_value(scraped, "jbi_db_pool_size") >= 1.0
    assert sample_value(scraped, "jbi_db_pool_idle") >= 1.0


def test_rooms_and_websocket_connections_follow_room_created_joined_and_deleted(
    client: TestClient, evict
) -> None:
    before = scrape(client)
    assert sample_value(before, "jbi_rooms", status="lobby") == 0.0
    assert sample_value(before, "jbi_rooms", status="playing") == 0.0
    assert sample_value(before, "jbi_rooms", status="finished") == 0.0
    assert sample_value(before, "jbi_websocket_connections") == 0.0
    assert sample_value(before, "jbi_players_connected") == 0.0
    assert sample_value(before, "jbi_room_players_max") == 0.0

    created = client.post(
        "/api/rooms",
        json={
            "display_name": "Zezima",
            "returning": False,
            "settings": {"modes": [{"mode": "more_less", "questions": 1}]},
        },
    ).json()
    code, host_session = created["code"], created["session"]

    after_create = scrape(client)
    assert sample_value(after_create, "jbi_rooms", status="lobby") == 1.0
    assert sample_value(after_create, "jbi_websocket_connections") == 0.0
    assert sample_value(after_create, "jbi_room_players_max") == 1.0

    joined = client.post(
        f"/api/rooms/{code}/join",
        json={"display_name": "Woox", "returning": False},
    ).json()

    with (
        client.websocket_connect(f"/ws/{code}") as host_ws,
        client.websocket_connect(f"/ws/{code}") as player_ws,
    ):
        host_ws.send_json({"t": "hello", "session": host_session})
        assert host_ws.receive_json()["t"] == "welcome"
        player_ws.send_json({"t": "hello", "session": joined["session"]})
        assert player_ws.receive_json()["t"] == "welcome"

        connected = scrape(client)
        assert sample_value(connected, "jbi_rooms", status="lobby") == 1.0
        assert sample_value(connected, "jbi_websocket_connections") == 2.0
        assert sample_value(connected, "jbi_players_connected") == 2.0
        assert sample_value(connected, "jbi_room_players_max") == 2.0

        deleted = client.request("DELETE", f"/api/rooms/{code}", json={"session": host_session})
        assert deleted.status_code == 204

        after_delete = scrape(client)
        assert sample_value(after_delete, "jbi_rooms", status="lobby") == 0.0
        assert sample_value(after_delete, "jbi_websocket_connections") == 0.0
        assert sample_value(after_delete, "jbi_players_connected") == 0.0
        assert sample_value(after_delete, "jbi_room_players_max") == 0.0


def test_rehydrated_playing_room_is_counted_as_waiting_until_a_player_returns(
    client: TestClient, table, evict
) -> None:
    game: Game = table("Zezima", modes=[{"mode": "more_less", "questions": 1}])
    game.start()
    game.admin.take("question_open")
    assert evict(game.code)

    # A GET rehydrates the playing room into memory without a connected player.
    assert client.get(f"/api/rooms/{game.code}").status_code == 200
    waiting = scrape(client)
    assert sample_value(waiting, "jbi_rooms", status="playing") == 1.0
    assert sample_value(waiting, "jbi_rooms_waiting") == 1.0


def test_rate_limited_request_and_finished_game_and_join_failure_move_counters(
    app: FastAPI, client: TestClient, table
) -> None:
    before = scrape(client)
    limited_before = sample_value(before, "jbi_rate_limited_total", limiter="rooms")
    finished_before = sample_value(before, "jbi_games_total", outcome="finished")
    early_before = sample_value(before, "jbi_games_total", outcome="ended_early")
    join_fail_before = sample_value(before, "jbi_join_failures_total", reason="room_full")
    cleanup_before = sample_value(before, "jbi_cleanup_runs_total", result="ok")

    game: Game = table("Zezima", modes=[{"mode": "more_less", "questions": 1}])
    game.start()
    game.admin.take("question_open")
    game.answer(game.admin, 0, game.right(0))
    game.admin.take("question_closed")
    game.admin.take("game_finished")

    early: Game = table("Woox", modes=[{"mode": "more_less", "questions": 1}])
    early.start()
    early.admin.take("question_open")
    early.admin.send(t="end_game")
    early.admin.take("game_finished")

    assert client.post("/api/stats/join-failure", json={"reason": "room_full"}).status_code == 204

    app.state.ratelimiter = RateLimiter(limit=0, name="rooms")
    refused = client.post(
        "/api/rooms",
        json={"display_name": "Lynx", "returning": False},
    )
    assert refused.status_code == 429

    after = scrape(client)
    assert sample_value(after, "jbi_rate_limited_total", limiter="rooms") == limited_before + 1.0
    assert sample_value(after, "jbi_games_total", outcome="finished") == finished_before + 1.0
    assert sample_value(after, "jbi_games_total", outcome="ended_early") == early_before + 1.0
    assert (
        sample_value(after, "jbi_join_failures_total", reason="room_full") == join_fail_before + 1.0
    )
    # Lifespan runs one cleanup pass at startup.
    assert sample_value(after, "jbi_cleanup_runs_total", result="ok") >= max(1.0, cleanup_before)
    assert sample_value(after, "jbi_cleanup_last_success_timestamp_seconds") > 1_700_000_000.0


def test_http_duration_and_requests_use_route_template_not_raw_room_code(
    client: TestClient, table
) -> None:
    first: Game = table("Zezima")
    second: Game = table("Woox")
    assert first.code != second.code

    before = scrape(client)
    count_before = next(
        (
            val
            for labels, val in before.get("jbi_http_request_duration_seconds_count", ())
            if labels == {"route": "/api/rooms/{code}"}
        ),
        0.0,
    )
    req_before = next(
        (
            val
            for labels, val in before.get("jbi_http_requests_total", ())
            if labels == {"route": "/api/rooms/{code}", "status": "200"}
        ),
        0.0,
    )

    assert client.get(f"/api/rooms/{first.code}").status_code == 200
    assert client.get(f"/api/rooms/{second.code}").status_code == 200
    assert client.get("/api/no-such-endpoint-12345").status_code == 404

    after = scrape(client)
    assert (
        sample_value(after, "jbi_http_request_duration_seconds_count", route="/api/rooms/{code}")
        == count_before + 2.0
    )
    assert (
        sample_value(after, "jbi_http_requests_total", route="/api/rooms/{code}", status="200")
        == req_before + 2.0
    )
    assert sample_value(after, "jbi_http_requests_total", route="unmatched", status="404") >= 1.0

    duration_routes = {
        labels["route"] for labels, _ in after.get("jbi_http_request_duration_seconds_count", ())
    }
    assert first.code not in " ".join(duration_routes)
    assert second.code not in " ".join(duration_routes)


def _allowed_routes(app: FastAPI) -> set[str]:
    routes = {"unmatched"}
    for route in app.router.routes:
        if hasattr(route, "path"):
            routes.add(route.path)
        elif hasattr(route, "effective_route_contexts"):
            for ctx in route.effective_route_contexts():
                routes.add(ctx.original_route.path)
    return routes


def test_every_label_comes_from_a_fixed_set_and_no_secret_reaches_the_output(
    app: FastAPI, client: TestClient, table
) -> None:
    custom = {
        "type": "multiple_choice",
        "payload": {
            "prompt": "Which clanmate fell asleep at Vorkath?",
            "options": ["Snoozebert", "Nodwell", "Yawnsley"],
            "answer_index": 0,
        },
    }
    created = client.post(
        "/api/rooms",
        json={
            "display_name": "Lynx Titan",
            "returning": False,
            "settings": {"modes": [{"mode": "more_less"}], "random_event_frequency": "more"},
            "custom_questions": [custom],
        },
    )
    assert created.status_code == 201, created.text
    game: Game = table("Zezima", "Woox", modes=[{"mode": "more_less", "questions": 1}])
    game.start()
    game.admin.take("question_open")
    game.answer(game.players[0], 0, game.right(0))
    game.players[0].take("answer_ack")

    response = client.get("/metrics", headers=BEARER)
    assert response.status_code == 200
    body = response.text

    # 1. No room code, player name, session, question id, prompt or answer appears anywhere.
    forbidden = {
        "Lynx Titan",
        "Zezima",
        "Woox",
        "Snoozebert",
        "Nodwell",
        "Yawnsley",
        "Which clanmate fell asleep at Vorkath?",
        created.json()["code"],
        created.json()["session"],
        game.code,
    }
    for room in app.state.rooms.rooms.values():
        forbidden.add(room.code)
        for player in room.players.values():
            forbidden |= {player.display_name, str(player.id), player.session_hash}
        for question in room.questions:
            forbidden |= {str(question.id), question.content_id}
    assert not [secret for secret in forbidden if secret in body]

    # 2. Every label on every jbi_* metric belongs to its fixed whitelist.
    allowed_routes = _allowed_routes(app)
    allowed_statuses = {str(code) for code in range(100, 600)}
    fixed_labels: dict[str, dict[str, set[str]]] = {
        "jbi_rooms": {"status": set(metrics.ROOM_STATUSES)},
        "jbi_rooms_waiting": {},
        "jbi_websocket_connections": {},
        "jbi_players_connected": {},
        "jbi_room_players_max": {},
        "jbi_max_players_per_room": {},
        "jbi_db_pool_size": {},
        "jbi_db_pool_idle": {},
        "jbi_http_requests": {"route": allowed_routes, "status": allowed_statuses},
        "jbi_http_request_duration_seconds": {"route": allowed_routes},
        "jbi_ws_messages": {"type": set(metrics.WS_MESSAGE_TYPES)},
        "jbi_ws_disconnects": {"reason": set(metrics.WS_DISCONNECT_REASONS)},
        "jbi_rate_limited": {"limiter": set(metrics.LIMITERS)},
        "jbi_games": {"outcome": set(metrics.GAME_OUTCOMES)},
        "jbi_join_failures": {"reason": set(metrics.JOIN_FAILURE_REASONS)},
        "jbi_cleanup_runs": {"result": set(metrics.CLEANUP_RESULTS)},
        "jbi_cleanup_last_success_timestamp_seconds": {},
        "jbi_cleanup_interval_seconds": {},
        "jbi_event_loop_lag_seconds": {},
        "jbi_build_info": {"version": {APP_VERSION}},
        "jbi_process_start_time_seconds": {},
    }
    for family in text_string_to_metric_families(body):
        if not family.name.startswith("jbi_"):
            continue
        assert family.name in fixed_labels, f"unexpected metric family {family.name}"
        expected_keys = fixed_labels[family.name]
        for sample in family.samples:
            labels = {k: v for k, v in sample.labels.items() if k != "le"}
            assert set(labels) == set(expected_keys), (sample.name, labels)
            for key, value in labels.items():
                assert value in expected_keys[key], f"{sample.name}[{key}] = {value!r}"


def test_event_loop_lag_is_exposed(app: FastAPI) -> None:
    with TestClient(app) as client:
        scraped = scrape(client)
    assert "jbi_event_loop_lag_seconds_bucket" in scraped
    edges = {labels["le"] for labels, _ in scraped["jbi_event_loop_lag_seconds_bucket"]}
    assert {"0.001", "0.1", "5.0", "+Inf"} <= edges


async def test_lag_probe_sees_a_blocked_loop() -> None:
    def bucket(edge: str) -> float:
        value = metrics.REGISTRY.get_sample_value("jbi_event_loop_lag_seconds_bucket", {"le": edge})
        assert value is not None
        return value

    slow_before = bucket("+Inf") - bucket("0.025")
    probe = asyncio.create_task(metrics.monitor_event_loop_lag(0.01))
    await asyncio.sleep(0.03)
    time.sleep(0.1)  # noqa: ASYNC251 -- blocks the loop on purpose, like a CPU-heavy step
    await asyncio.sleep(0.03)
    probe.cancel()
    assert bucket("+Inf") - bucket("0.025") > slow_before


def test_lag_probe_stops_with_the_app(app: FastAPI) -> None:
    with TestClient(app):
        probe = app.state.lag_probe
        assert not probe.done()
    assert probe.cancelled()
