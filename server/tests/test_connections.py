"""How many sockets the app holds, and what the container's uvicorn makes of them.

uvicorn's ``--limit-concurrency`` answers 503 to every request past it, websockets
included, so the app turns sockets away with 1013 at ``MAX_SOCKETS``, under it, and HTTP
keeps the rest. The tests that need uvicorn's own behaviour run the Dockerfile's command.
"""

import json
import os
import socket
import subprocess
import sys
import time
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from websockets.exceptions import ConnectionClosed, InvalidStatus
from websockets.sync.client import ClientConnection, connect
from websockets.typing import Origin

from app.config import REPO_ROOT
from app.main import create_app
from tests.rooms_api import create, hello, join

SERVER_DIR = REPO_ROOT / "server"


def dockerfile_command() -> list[str]:
    """The container's uvicorn command, as the Dockerfile's ``CMD`` spells it."""
    dockerfile = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8")
    return json.loads(dockerfile.split("\nCMD ")[-1].replace("\\\n", " "))


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _with_flag(command: list[str], flag: str, value: str) -> list[str]:
    at = command.index(flag)
    return [*command[: at + 1], value, *command[at + 2 :]]


@contextmanager
def container_server(
    dsn: str, tmp_path: Path, env: dict[str, str] | None = None, **flags: str
) -> Iterator[str]:
    """The Dockerfile's uvicorn on a free local port, with ``flags`` overridden; its base URL."""
    port = _free_port()
    command = dockerfile_command()
    assert command[0] == "uvicorn", command
    command = _with_flag(_with_flag(command, "--host", "127.0.0.1"), "--port", str(port))
    for flag, value in flags.items():
        command = _with_flag(command, f"--{flag.replace('_', '-')}", value)
    log = (tmp_path / "uvicorn.log").open("w")
    process = subprocess.Popen(
        [sys.executable, "-m", *command],
        cwd=SERVER_DIR,
        env={**os.environ, "DATABASE_URL": dsn, **(env or {})},
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        deadline = time.monotonic() + 60
        while True:
            assert process.poll() is None, (tmp_path / "uvicorn.log").read_text()
            assert time.monotonic() < deadline, (tmp_path / "uvicorn.log").read_text()
            try:
                if httpx.get(f"{base}/api/health").status_code == 200:
                    break
            except httpx.TransportError:
                pass
            time.sleep(0.1)
        yield base
    finally:
        process.terminate()
        try:
            process.wait(10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        log.close()


def _attach(held: ExitStack, base: str, code: str, session: str) -> ClientConnection:
    ws = held.enter_context(connect(f"ws{base.removeprefix('http')}/ws/{code}", open_timeout=5))
    ws.send(json.dumps({"t": "hello", "session": session}))
    assert json.loads(ws.recv(timeout=5))["t"] == "welcome"
    return ws


def test_past_the_socket_cap_a_socket_is_closed_1013_and_http_still_answers(
    test_db_dsn: str, tmp_path: Path
) -> None:
    with (
        container_server(
            test_db_dsn, tmp_path, env={"MAX_SOCKETS": "10"}, limit_concurrency="20"
        ) as base,
        httpx.Client(base_url=base) as http,
        ExitStack() as held,
    ):
        code, admin = create(http)  # type: ignore[arg-type]
        sessions = [admin["session"]]
        for n in range(9):
            response = join(http, code, f"Player{n}")  # type: ignore[arg-type]
            assert response.status_code == 200, response.text
            sessions.append(response.json()["session"])
        for session in sessions:
            _attach(held, base, code, session)
        with connect(f"ws{base.removeprefix('http')}/ws/{code}", open_timeout=5) as refused:
            with pytest.raises(ConnectionClosed) as closed:
                refused.recv(timeout=5)
        assert closed.value.rcvd is not None
        assert closed.value.rcvd.code == 1013
        assert http.get("/api/health").status_code == 200


def test_the_container_does_not_compress_websocket_frames(test_db_dsn: str, tmp_path: Path) -> None:
    """A browser always offers permessage-deflate; the handshake must turn it down."""
    with (
        container_server(test_db_dsn, tmp_path) as base,
        connect(f"ws{base.removeprefix('http')}/ws/ANYTHING", compression="deflate") as ws,
    ):
        assert ws.request is not None and ws.response is not None
        assert "permessage-deflate" in ws.request.headers["Sec-WebSocket-Extensions"]
        assert "Sec-WebSocket-Extensions" not in ws.response.headers


def test_the_container_answers_a_cross_site_socket_403_at_the_handshake(
    test_db_dsn: str, tmp_path: Path
) -> None:
    """Never upgraded, it is gone before it can hold a ``--limit-concurrency`` slot closing."""
    with container_server(test_db_dsn, tmp_path) as base:
        with pytest.raises(InvalidStatus) as refused:
            connect(
                f"ws{base.removeprefix('http')}/ws/ANYTHING",
                origin=Origin("https://evil.example"),
                open_timeout=5,
            )
        assert refused.value.response.status_code == 403


# --- the cap in the app ---------------------------------------------------------------


@pytest.fixture
def capped(app: FastAPI, dist: Path) -> Iterator[TestClient]:
    settings = app.state.settings.model_copy(update={"max_sockets": 2})
    with TestClient(create_app(settings, dist)) as client:
        yield client


def test_a_socket_past_the_cap_is_closed_1013_before_its_hello(capped: TestClient) -> None:
    code, admin = create(capped)
    with capped.websocket_connect(f"/ws/{code}") as first:
        hello(first, admin["session"])
        with capped.websocket_connect(f"/ws/{code}"):
            with capped.websocket_connect(f"/ws/{code}") as refused:
                with pytest.raises(WebSocketDisconnect) as info:
                    refused.receive_json()
                assert info.value.code == 1013


def test_a_socket_that_leaves_frees_its_place(capped: TestClient) -> None:
    code, admin = create(capped)
    for _ in range(3):
        with (
            capped.websocket_connect(f"/ws/{code}") as ws,
            capped.websocket_connect(f"/ws/{code}"),
        ):
            hello(ws, admin["session"])
