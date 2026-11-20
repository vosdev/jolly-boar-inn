"""``GET /api/config``: the settings the client's copy quotes."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_gives_the_room_lifetime_in_hours(settings: Settings, dist: Path) -> None:
    app = create_app(settings.model_copy(update={"room_ttl_days": 2}), dist)
    response = TestClient(app).get("/api/config")
    assert response.status_code == 200
    assert response.json() == {"room_ttl_hours": 48}
