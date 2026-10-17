"""Settings from environment variables, with development defaults.

Every variable is documented in `.env.example` at the repo root.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ``uuidgen`` prints 36 characters, so its output is long enough.
ADMIN_TOKEN_MIN = 32
# The characters a URL fragment carries without escaping, so ``/admin#token=...`` arrives as typed.
_TOKEN_CHARS = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

REPO_ROOT = Path(__file__).resolve().parents[2]
# The app's one version (ideas/architecture.md, Versioning), sent in every ``welcome``.
APP_VERSION = (REPO_ROOT / "VERSION").read_text(encoding="utf-8").strip()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql://jbi:jbi@localhost:5432/jbi"
    public_base_url: str = "http://localhost:5173"
    room_ttl_days: int = 3
    # How often the cleanup task deletes rooms past their ``expires_at`` (section 4's
    # ``any -> deleted``). Hourly is far finer than a 3-day TTL needs; it is the
    # interval a self-hoster can lower when they want the rows gone sooner. It has to
    # stay positive: the task sleeps on it between passes, and ``0`` would turn that
    # loop into a spin issuing a delete as fast as the pool can serve one, so a typo
    # here refuses to start the app rather than hammering Postgres for its lifetime.
    room_cleanup_interval_seconds: int = Field(default=3600, gt=0)
    # How long a finished room outlives its game before cleanup deletes it. Players keep
    # the result in their own browser, saved when the final standings arrive; the grace
    # is for the phone that locked on the last question and reconnects later to receive
    # them. Zero is not free: such a player finds the room gone and no result kept.
    finished_room_grace_minutes: int = Field(default=60, ge=0)
    rooms_per_ip_per_hour: int = 30
    max_players_per_room: int = 50
    # Whether hosts can list a room on Home. Off, the list is always empty.
    public_rooms: bool = True
    # Whether hosts can pick Random Events Only, a round of nothing but the NPCs' questions.
    random_event_game_mode: bool = False
    packs_dir: Path = Path("../data/packs")
    # Set by ``make dev-server``: Vite serves ``client/public``, so a missing or stale build
    # must not decide which question pictures exist.
    client_pictures: str = ""
    log_level: Literal["debug", "info", "warning", "error"] = "info"
    # The operator's key to ``/admin``. Empty, the admin routes do not exist.
    admin_token: str = ""

    @field_validator("admin_token")
    @classmethod
    def _admin_token_strong_enough(cls, token: str) -> str:
        if not token:
            return token
        if len(token) < ADMIN_TOKEN_MIN:
            raise ValueError(
                f"ADMIN_TOKEN is {len(token)} characters; it needs at least {ADMIN_TOKEN_MIN}."
                " Make one with `openssl rand -hex 32`, or unset it to turn /admin off"
            )
        if not set(token) <= _TOKEN_CHARS:
            raise ValueError(
                "ADMIN_TOKEN may only hold letters, digits and - . _ ~,"
                " so it survives a URL fragment as typed"
            )
        return token


@lru_cache
def get_settings() -> Settings:
    return Settings()
