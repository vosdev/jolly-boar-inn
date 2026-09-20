from pathlib import Path

from app.config import Settings


def test_defaults_match_architecture_table() -> None:
    s = Settings(_env_file=None)
    assert s.database_url == "postgresql://jbi:jbi@localhost:5432/jbi"
    assert s.public_base_url == "http://localhost:5173"
    assert s.room_ttl_days == 30
    assert s.room_cleanup_interval_seconds == 3600
    assert s.rooms_per_ip_per_hour == 5
    assert s.max_players_per_room == 50
    assert s.packs_dir == Path("../data/packs")
    assert s.log_level == "info"


def test_env_overrides(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db:5432/x")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://quiz.example")
    monkeypatch.setenv("ROOM_TTL_DAYS", "7")
    monkeypatch.setenv("ROOM_CLEANUP_INTERVAL_SECONDS", "60")
    monkeypatch.setenv("ROOMS_PER_IP_PER_HOUR", "2")
    monkeypatch.setenv("MAX_PLAYERS_PER_ROOM", "10")
    monkeypatch.setenv("PACKS_DIR", "/data/packs")
    monkeypatch.setenv("LOG_LEVEL", "debug")
    s = Settings(_env_file=None)
    assert s.database_url == "postgresql://u:p@db:5432/x"
    assert s.public_base_url == "https://quiz.example"
    assert s.room_ttl_days == 7
    assert s.room_cleanup_interval_seconds == 60
    assert s.rooms_per_ip_per_hour == 2
    assert s.max_players_per_room == 10
    assert s.packs_dir == Path("/data/packs")
    assert s.log_level == "debug"


def test_every_documented_var_is_in_env_example() -> None:
    example = (Path(__file__).resolve().parents[2] / ".env.example").read_text()
    for field in Settings.model_fields:
        assert f"{field.upper()}=" in example, field
