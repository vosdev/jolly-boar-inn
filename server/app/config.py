"""Settings from environment variables, with development defaults.

Every variable is documented in `.env.example` at the repo root.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql://jbi:jbi@localhost:5432/jbi"
    public_base_url: str = "http://localhost:5173"
    room_ttl_days: int = 30
    # How often the cleanup task deletes rooms past their ``expires_at`` (section 4's
    # ``any -> deleted``). Hourly is far finer than a 30-day TTL needs; it is the
    # interval a self-hoster can lower when they want the rows gone sooner.
    room_cleanup_interval_seconds: int = 3600
    rooms_per_ip_per_hour: int = 5
    max_players_per_room: int = 50
    packs_dir: Path = Path("../data/packs")
    log_level: Literal["debug", "info", "warning", "error"] = "info"


@lru_cache
def get_settings() -> Settings:
    return Settings()
