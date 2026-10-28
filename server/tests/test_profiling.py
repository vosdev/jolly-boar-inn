import sys
from typing import Any

import pytest

from app import profiling
from app.config import APP_VERSION, Settings


class _FakePyroscope:
    def __init__(self, fail: bool = False) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail = fail

    def configure(self, **kwargs: Any) -> None:
        if self.fail:
            raise RuntimeError("no profiler here")
        self.calls.append(kwargs)


def test_unset_address_never_loads_the_sdk(monkeypatch: pytest.MonkeyPatch) -> None:
    # A None entry makes ``import pyroscope`` raise, so any import attempt fails the test.
    monkeypatch.setitem(sys.modules, "pyroscope", None)
    assert profiling.start(Settings(_env_file=None, pyroscope_server_address="")) is False


def test_address_starts_with_version_tag_only(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakePyroscope()
    monkeypatch.setitem(sys.modules, "pyroscope", fake)
    settings = Settings(_env_file=None, pyroscope_server_address="http://pyroscope:4040")
    assert profiling.start(settings) is True
    (call,) = fake.calls
    assert call["server_address"] == "http://pyroscope:4040"
    assert call["tags"] == {"service_name": "jolly-boar-inn", "version": APP_VERSION}
    assert call["basic_auth_username"] == ""
    assert call["basic_auth_password"] == ""
    assert call["tenant_id"] == ""


def test_auth_and_tenant_pass_through(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakePyroscope()
    monkeypatch.setitem(sys.modules, "pyroscope", fake)
    settings = Settings(
        _env_file=None,
        pyroscope_server_address="https://profiles.example",
        pyroscope_basic_auth_user="123",
        pyroscope_basic_auth_password="secret",
        pyroscope_tenant_id="jbi",
    )
    assert profiling.start(settings) is True
    (call,) = fake.calls
    assert call["basic_auth_username"] == "123"
    assert call["basic_auth_password"] == "secret"
    assert call["tenant_id"] == "jbi"


def test_start_failure_does_not_raise(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "pyroscope", _FakePyroscope(fail=True))
    settings = Settings(_env_file=None, pyroscope_server_address="http://pyroscope:4040")
    assert profiling.start(settings) is False
