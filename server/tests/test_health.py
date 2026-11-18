from pathlib import Path

from fastapi.testclient import TestClient

from app.config import APP_VERSION, Settings
from app.main import create_app


class FakeLock:
    def is_closed(self) -> bool:
        return False

    async def close(self) -> None:
        pass


class FakePool:
    async def fetchval(self, query: str) -> int:
        assert query == "SELECT 1"
        return 1

    async def close(self) -> None:
        pass


def test_health_reports_db_down(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"ok": False, "db": False, "version": APP_VERSION}


def test_health_ok_with_db(settings: Settings, dist: Path) -> None:
    app = create_app(settings, dist)
    with TestClient(app) as client:
        app.state.pool = FakePool()
        app.state.instance_lock = FakeLock()
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "db": True, "version": APP_VERSION}
