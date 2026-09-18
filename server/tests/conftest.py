from pathlib import Path

import pytest

from app.config import Settings


@pytest.fixture
def settings() -> Settings:
    # Unreachable port so tests never touch a real database.
    return Settings(_env_file=None, database_url="postgresql://jbi:jbi@127.0.0.1:1/jbi")


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    d = tmp_path / "dist"
    (d / "assets").mkdir(parents=True)
    (d / "index.html").write_text("<!doctype html><title>Jolly Boar Inn</title>")
    (d / "assets" / "index-abc123.js").write_text("console.log('hi')")
    return d
