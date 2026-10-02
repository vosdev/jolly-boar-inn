from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_defaults_match_architecture_table() -> None:
    s = Settings(_env_file=None)
    assert s.database_url == "postgresql://jbi:jbi@localhost:5432/jbi"
    assert s.public_base_url == "http://localhost:5173"
    assert s.room_ttl_days == 3
    assert s.room_cleanup_interval_seconds == 3600
    assert s.rooms_per_ip_per_hour == 30
    assert s.max_players_per_room == 50
    assert s.public_rooms is True
    assert s.packs_dir == Path("../data/packs")
    assert s.log_level == "info"


def test_env_overrides(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db:5432/x")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://quiz.example")
    monkeypatch.setenv("ROOM_TTL_DAYS", "7")
    monkeypatch.setenv("ROOM_CLEANUP_INTERVAL_SECONDS", "60")
    monkeypatch.setenv("ROOMS_PER_IP_PER_HOUR", "2")
    monkeypatch.setenv("MAX_PLAYERS_PER_ROOM", "10")
    monkeypatch.setenv("PUBLIC_ROOMS", "false")
    monkeypatch.setenv("PACKS_DIR", "/data/packs")
    monkeypatch.setenv("LOG_LEVEL", "debug")
    s = Settings(_env_file=None)
    assert s.database_url == "postgresql://u:p@db:5432/x"
    assert s.public_base_url == "https://quiz.example"
    assert s.room_ttl_days == 7
    assert s.room_cleanup_interval_seconds == 60
    assert s.rooms_per_ip_per_hour == 2
    assert s.max_players_per_room == 10
    assert s.public_rooms is False
    assert s.packs_dir == Path("/data/packs")
    assert s.log_level == "debug"


@pytest.mark.parametrize("bad", ["0", "-1"])
def test_a_non_positive_cleanup_interval_is_refused(monkeypatch, bad: str) -> None:
    """The task sleeps on this between passes, so ``0`` would spin it.

    Refusing at startup is the point: a deployment with a typo here stops with a
    readable error instead of running a delete as fast as the pool can serve one.
    """
    monkeypatch.setenv("ROOM_CLEANUP_INTERVAL_SECONDS", bad)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_every_documented_var_is_in_env_example() -> None:
    """``.env.example`` says every value in it is the default; hold it to that.

    Both halves matter. A variable missing from the file is undocumented, and one
    carrying a value the code does not default to is worse than undocumented: it is a
    file that says it is the defaults while handing a self-hoster something else.
    """
    example = (Path(__file__).resolve().parents[2] / ".env.example").read_text()
    documented = dict(
        line.split("=", 1)
        for line in example.splitlines()
        if "=" in line and not line.lstrip().startswith("#")
    )
    defaults = Settings(_env_file=None)
    for field in Settings.model_fields:
        name = field.upper()
        assert name in documented, field
        assert documented[name] == str(getattr(defaults, field)), field
