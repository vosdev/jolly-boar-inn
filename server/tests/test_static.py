from pathlib import Path

from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.main import create_app
from app.static import BASE_URL_SLOT


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


def test_question_pictures_are_immutable(settings: Settings, dist: Path) -> None:
    """A picture's random name changes whenever its file does, so it can be cached for good."""
    (dist / "pictures").mkdir()
    (dist / "pictures" / "0123456789abcdef.png").write_bytes(b"\x89PNG")
    with TestClient(create_app(settings, dist)) as client:
        response = client.get("/pictures/0123456789abcdef.png")
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


def test_a_nul_in_the_path_is_404(settings: Settings, dist: Path) -> None:
    """A NUL makes ``Path.resolve`` raise, which must not turn into a 500."""
    with TestClient(create_app(settings, dist), raise_server_exceptions=False) as client:
        for path in ("/%00", "/assets/index-abc123.js%00", "/r/%00ABYSSAL"):
            assert client.get(path).status_code == 404, path


def test_missing_dist_is_404(settings: Settings, tmp_path: Path) -> None:
    with TestClient(create_app(settings, tmp_path / "missing")) as client:
        response = client.get("/")
    assert response.status_code == 404


def test_head_is_allowed(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        assert client.head("/").status_code == 200
        assert client.head("/assets/index-abc123.js").status_code == 200


def test_index_gets_the_base_url_the_share_card_needs(settings: Settings, dist: Path) -> None:
    """A shared link's image must be absolute, and only the running server knows its address."""
    assert f"BASE_URL_SLOT = '{BASE_URL_SLOT}'" in (
        REPO_ROOT / "client" / "site-branding.ts"
    ).read_text(encoding="utf-8")
    (dist / "index.html").write_text(
        f'<!doctype html><meta property="og:image" content="{BASE_URL_SLOT}/og-card.png">'
    )
    for base, written in (
        ("https://quiz.example", "https://quiz.example/og-card.png"),
        ("https://quiz.example/", "https://quiz.example/og-card.png"),
        (
            'https://quiz.example/"><script>',
            "https://quiz.example/&quot;&gt;&lt;script&gt;/og-card.png",
        ),
    ):
        configured = settings.model_copy(update={"public_base_url": base})
        with TestClient(create_app(configured, dist)) as client:
            for path in ("/", "/r/ABYSSAL"):
                response = client.get(path)
                assert f'content="{written}"' in response.text, (base, path)
                assert BASE_URL_SLOT not in response.text
                assert response.headers["cache-control"] == "no-cache"
                assert response.headers["content-type"].startswith("text/html")
