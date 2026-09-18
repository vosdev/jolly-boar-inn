from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_index_and_spa_fallback(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        for path in ("/", "/r/ABYSSAL", "/r/ABYSSAL/admin"):
            response = client.get(path)
            assert response.status_code == 200, path
            assert "Jolly Boar Inn" in response.text
            assert response.headers["cache-control"] == "no-cache"


def test_hashed_assets_are_immutable(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        response = client.get("/assets/index-abc123.js")
    assert response.status_code == 200
    assert response.headers["cache-control"].startswith("public, max-age=31536000")


def test_unknown_api_path_is_404_not_index(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        assert client.get("/api/nope").status_code == 404
        assert client.get("/ws/ABYSSAL").status_code == 404


def test_no_path_traversal(settings: Settings, dist: Path) -> None:
    (dist.parent / "secret.txt").write_text("nope")
    with TestClient(create_app(settings, dist)) as client:
        response = client.get("/../secret.txt")
    assert "nope" not in response.text


def test_missing_dist_is_404(settings: Settings, tmp_path: Path) -> None:
    with TestClient(create_app(settings, tmp_path / "missing")) as client:
        response = client.get("/")
    assert response.status_code == 404


def test_head_is_allowed(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        assert client.head("/").status_code == 200
        assert client.head("/assets/index-abc123.js").status_code == 200
