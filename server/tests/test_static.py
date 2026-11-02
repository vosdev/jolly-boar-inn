from datetime import UTC, datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree

from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.main import create_app
from app.static import BASE_URL_SLOT, FARO_URL_SLOT


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


def test_map_tiles_are_immutable(settings: Settings, dist: Path) -> None:
    """A tile's folder names the game cache it came from, so a new map is a new URL."""
    (dist / "map" / "2752" / "clean" / "2").mkdir(parents=True)
    (dist / "map" / "2752" / "clean" / "2" / "0_46_52.png").write_bytes(b"\x89PNG")
    with TestClient(create_app(settings, dist)) as client:
        response = client.get("/map/2752/clean/2/0_46_52.png")
    assert response.status_code == 200
    assert response.headers["cache-control"].startswith("public, max-age=31536000")


def test_a_missing_map_tile_is_404_not_index(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        response = client.get("/map/2752/clean/2/0_0_0.png")
    assert response.status_code == 404
    assert "text/html" not in response.headers["content-type"]


def test_missing_media_is_404_not_index(settings: Settings, dist: Path) -> None:
    """A broken image should fail as one, not succeed as the SPA page."""
    (dist / "pictures").mkdir()
    with TestClient(create_app(settings, dist)) as client:
        for path in (
            "/pictures/0123456789abcdef.png",
            "/assets/index-gone.js",
            "/assets/",
        ):
            for method in ("GET", "HEAD"):
                response = client.request(method, path)
                assert response.status_code == 404, (method, path)
                assert "text/html" not in response.headers.get("content-type", ""), path
                assert response.headers["cache-control"] == "no-cache", path


def test_media_prefix_alone_is_still_a_client_route(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        for path in ("/assets", "/pictures", "/pictures-of-cats"):
            assert client.get(path).status_code == 200, path


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


def test_index_gets_the_faro_receiver_or_nothing(settings: Settings, dist: Path) -> None:
    """Empty, the client never loads the SDK; the slot must not survive either way."""
    assert f"FARO_URL_SLOT = '{FARO_URL_SLOT}'" in (
        REPO_ROOT / "client" / "site-branding.ts"
    ).read_text(encoding="utf-8")
    (dist / "index.html").write_text(
        f'<!doctype html><meta name="faro-url" content="{FARO_URL_SLOT}">'
    )
    for faro_url, written in (
        ("", ""),
        ("/faro/collect", "/faro/collect"),
        ('https://faro.example/"><script>', "https://faro.example/&quot;&gt;&lt;script&gt;"),
    ):
        configured = settings.model_copy(update={"faro_url": faro_url})
        with TestClient(create_app(configured, dist)) as client:
            for path in ("/", "/r/ABYSSAL"):
                response = client.get(path)
                assert f'<meta name="faro-url" content="{written}">' in response.text, faro_url
                assert FARO_URL_SLOT not in response.text


def test_robots_hides_private_pages_and_names_the_sitemap(settings: Settings, dist: Path) -> None:
    configured = settings.model_copy(update={"public_base_url": "https://quiz.example/"})
    with TestClient(create_app(configured, dist)) as client:
        response = client.get("/robots.txt")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    lines = response.text.splitlines()
    assert lines[0] == "User-agent: *"
    for path in ("/api/", "/ws/", "/r/", "/history/", "/admin"):
        assert f"Disallow: {path}" in lines
    assert "Disallow: /" not in lines
    assert "Sitemap: https://quiz.example/sitemap.xml" in lines


def test_sitemap_lists_home_and_create_at_the_base_url(settings: Settings, dist: Path) -> None:
    configured = settings.model_copy(update={"public_base_url": "https://quiz.example/inn&co"})
    with TestClient(create_app(configured, dist)) as client:
        response = client.get("/sitemap.xml")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/xml")
    tree = ElementTree.fromstring(response.content)
    namespace = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    assert [loc.text for loc in tree.iter(f"{namespace}loc")] == [
        "https://quiz.example/inn&co/",
        "https://quiz.example/inn&co/create",
    ]


def test_security_txt_follows_rfc_9116(settings: Settings, dist: Path) -> None:
    configured = settings.model_copy(update={"public_base_url": "https://quiz.example"})
    with TestClient(create_app(configured, dist)) as client:
        response = client.get("/.well-known/security.txt")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    fields = dict(line.split(": ", 1) for line in response.text.splitlines())
    assert fields["Contact"].startswith("https://github.com/vosdev/jolly-boar-inn/security/")
    assert fields["Policy"].endswith("/SECURITY.md")
    assert fields["Canonical"] == "https://quiz.example/.well-known/security.txt"
    expires = datetime.strptime(fields["Expires"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    assert datetime.now(UTC) < expires < datetime.now(UTC) + timedelta(days=365)


def test_seo_files_answer_head(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        for path in ("/robots.txt", "/sitemap.xml", "/.well-known/security.txt"):
            assert client.head(path).status_code == 200, path
