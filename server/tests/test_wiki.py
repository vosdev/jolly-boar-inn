"""The wiki's rules: the operator's own User-Agent or nothing is sent, one request a second,
and no script reaches the network any other way."""

import ast
import sys
from pathlib import Path
from typing import Any

import pytest

from app.config import REPO_ROOT

SCRIPTS = REPO_ROOT / "server" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import wiki  # noqa: E402

# They talk only to this app's own server, never to the wiki.
LOCAL_ONLY = {"smoke_ws.py": "the running app", "loadtest.py": "the running app"}
NETWORK_MODULES = {"urllib.request", "http.client", "httpx", "requests", "aiohttp", "urllib3"}


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0
        self.slept: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


@pytest.fixture
def no_agent(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """No ``WIKI_USER_AGENT`` in the environment, and a ``.env`` of the test's own."""
    monkeypatch.delenv("WIKI_USER_AGENT", raising=False)
    env_file = tmp_path / ".env"
    monkeypatch.setattr(wiki, "ENV_FILE", env_file)
    return env_file


def test_the_throttle_lets_one_request_a_second_through() -> None:
    fake = FakeClock()
    throttle = wiki.Throttle(clock=fake.clock, sleep=fake.sleep)
    throttle.wait()
    assert fake.slept == []
    fake.now += 0.25
    throttle.wait()
    assert fake.slept == [0.75]
    throttle.wait()
    assert fake.slept == [0.75, 1.0]
    fake.now += 5
    throttle.wait()
    assert fake.slept == [0.75, 1.0]


@pytest.mark.usefixtures("no_agent")
def test_no_user_agent_is_refused_with_what_to_set_and_an_example() -> None:
    with pytest.raises(wiki.MissingUserAgent) as refused:
        wiki.connect()
    message = str(refused.value)
    assert "WIKI_USER_AGENT is not set" in message
    assert f'WIKI_USER_AGENT="{wiki.EXAMPLE}"' in message


def test_the_example_itself_and_a_blank_are_refused(
    no_agent: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("WIKI_USER_AGENT", wiki.EXAMPLE)
    with pytest.raises(wiki.MissingUserAgent, match="still the example"):
        wiki.connect()
    monkeypatch.setenv("WIKI_USER_AGENT", "   ")
    with pytest.raises(wiki.MissingUserAgent, match="not set"):
        wiki.connect()


def test_the_user_agent_comes_from_env_file_and_the_environment_wins(
    no_agent: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    no_agent.write_text("WIKI_USER_AGENT=quiz-importer - Zezima on Discord\n")
    assert wiki.connect().user_agent == "quiz-importer - Zezima on Discord"
    monkeypatch.setenv("WIKI_USER_AGENT", "quiz-importer - Woox on Discord")
    assert wiki.connect().user_agent == "quiz-importer - Woox on Discord"


def test_every_request_waits_for_the_throttle_and_carries_the_user_agent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[tuple[str, str | None, float]] = []
    fake = FakeClock()

    class Response:
        def __enter__(self) -> Response:
            return self

        def __exit__(self, *exc: object) -> None:
            pass

        def read(self) -> bytes:
            return b'{"ok": true}'

    def urlopen(request: Any, timeout: float) -> Response:
        sent.append((request.full_url, request.get_header("User-agent"), fake.now))
        return Response()

    monkeypatch.setattr(wiki.urllib.request, "urlopen", urlopen)
    source = wiki.Wiki("quiz-importer - Zezima", wiki.Throttle(clock=fake.clock, sleep=fake.sleep))
    assert source.get_json("https://example.test/a") == {"ok": True}
    source.get_json("https://example.test/b")
    assert sent == [
        ("https://example.test/a", "quiz-importer - Zezima", 1000.0),
        ("https://example.test/b", "quiz-importer - Zezima", 1001.0),
    ]


def network_imports(path: Path) -> set[str]:
    """The network modules ``path`` imports, however it spells the import."""
    found: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names = {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            names = {node.module} | {f"{node.module}.{alias.name}" for alias in node.names}
        else:
            continue
        found |= {n for n in names if n in NETWORK_MODULES or n.split(".")[0] in NETWORK_MODULES}
    return found


def test_no_script_reaches_the_network_but_through_wiki_py() -> None:
    offenders = {
        path.name: sorted(imported)
        for path in sorted(SCRIPTS.glob("*.py"))
        if path.name not in {"wiki.py", *LOCAL_ONLY} and (imported := network_imports(path))
    }
    assert offenders == {}


def test_the_scan_sees_each_way_of_importing(tmp_path: Path) -> None:
    for source in (
        "import urllib.request\n",
        "from urllib import request\n",
        "from urllib.request import urlopen\n",
        "import httpx\n",
        "from httpx import AsyncClient\n",
    ):
        path = tmp_path / "x.py"
        path.write_text(source)
        assert network_imports(path), source
    assert network_imports(SCRIPTS / "wiki.py") == {"urllib.request"}
