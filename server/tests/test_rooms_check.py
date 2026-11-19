"""``scripts/rooms.py``: which rooms hold a release back, against the real admin API."""

import sys
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.main import create_app
from app.rooms import codes
from tests.conftest import BASE
from tests.game_api import Game
from tests.packs import PACKS_DIR
from tests.rooms_api import create

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import rooms as check_rooms  # noqa: E402

TOKEN = "0123456789abcdef0123456789abcdef"


@pytest.fixture
def app(test_db_dsn: str, dist: Path) -> FastAPI:
    """The conftest's app, with the admin API turned on."""
    settings = Settings(
        _env_file=None,
        database_url=test_db_dsn,
        packs_dir=PACKS_DIR,
        public_base_url=BASE,
        admin_token=TOKEN,
    )
    return create_app(settings, dist)


def run(client: httpx.Client, token: str = TOKEN, **kwargs) -> tuple[int, list[str]]:
    lines: list[str] = []
    code = check_rooms.check(client, token, out=lines.append, **kwargs)
    return code, lines


def test_with_no_rooms_it_exits_0(client: TestClient) -> None:
    assert run(client) == (0, ["No active rooms."])


def connected(app: FastAPI, game: Game) -> str:
    room = app.state.rooms.rooms[game.code]
    return str(sum(player.connected for player in room.players.values()))


def test_an_active_game_exits_1_and_is_listed(app: FastAPI, client: TestClient, table) -> None:
    game: Game = table("Zezima", "Woox", modes=[{"mode": "more_less", "questions": 1}])
    game.start()
    game.admin.take("question_open")
    code, lines = run(client)
    assert code == 1
    assert lines[0] == "1 active rooms: 1 playing, 0 in the lobby."
    assert lines[1].split() == [
        *(codes.cased(game.code), "playing", "round", "1/1", "more_less"),
        *(connected(app, game), "connected"),
    ]


def test_a_connected_lobby_is_active_and_says_lobby(
    app: FastAPI, client: TestClient, table
) -> None:
    playing: Game = table("Zezima", modes=[{"mode": "more_less", "questions": 1}])
    playing.start()
    playing.admin.take("question_open")
    lobby: Game = table("Lynx")
    code, lines = run(client)
    assert code == 1
    assert lines[0] == "2 active rooms: 1 playing, 1 in the lobby."
    # Playing first, so a glance tells whether only lobbies hold the release back.
    assert lines[1].split()[:2] == [codes.cased(playing.code), "playing"]
    assert lines[2].split() == [
        *(codes.cased(lobby.code), "lobby", "-", connected(app, lobby), "connected")
    ]


def test_a_lobby_nobody_is_in_does_not_count(client: TestClient) -> None:
    create(client, "Durial")
    assert run(client) == (0, ["No active rooms."])


def test_a_finished_room_in_its_grace_does_not_count(client: TestClient, table) -> None:
    game: Game = table("Zezima", modes=[{"mode": "more_less", "questions": 1}])
    game.start()
    game.admin.take("question_open")
    game.admin.send(t="end_game")
    game.admin.take("game_finished")
    assert run(client) == (0, ["No active rooms."])


def test_wait_polls_until_the_rooms_are_quiet(client: TestClient, table) -> None:
    game: Game = table("Zezima", modes=[{"mode": "more_less", "questions": 1}])
    game.start()
    game.admin.take("question_open")
    naps: list[float] = []

    def sleep(seconds: float) -> None:
        naps.append(seconds)
        game.admin.send(t="end_game")
        game.admin.take("game_finished")

    code, lines = run(client, wait=600, every=60, sleep=sleep)
    assert (code, naps) == (0, [60])
    assert lines[-2:] == ["Checking again in 60 s.", "No active rooms."]


def test_wait_gives_up_with_1_when_the_time_runs_out(client: TestClient, table) -> None:
    table("Lynx")
    now = [0.0]

    def sleep(seconds: float) -> None:
        now[0] += seconds

    code, lines = run(client, wait=150, every=60, sleep=sleep, clock=lambda: now[0])
    assert code == 1 and now[0] == 150
    assert [line for line in lines if line.startswith("Checking")] == [
        "Checking again in 60 s.",
        "Checking again in 60 s.",
        "Checking again in 30 s.",
    ]


def test_a_wrong_token_exits_2(client: TestClient, table) -> None:
    table("Lynx")
    assert run(client, token="f" * 32) == (2, ["error: the server refused ADMIN_TOKEN"])


def test_no_token_exits_2_without_asking(client: TestClient) -> None:
    assert run(client, token="") == (2, ["error: ADMIN_TOKEN is not set"])


def test_a_server_without_the_admin_api_exits_2(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings.model_copy(update={"admin_token": ""}), dist)) as client:
        code, lines = run(client)
    assert code == 2 and lines == ["error: the admin API is off: the server has no ADMIN_TOKEN"]


def test_an_unreachable_server_exits_2() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    with httpx.Client(base_url=BASE, transport=httpx.MockTransport(refuse)) as client:
        code, lines = run(client)
    assert code == 2 and lines[0].startswith("error: cannot reach the server")
