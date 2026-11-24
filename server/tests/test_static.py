import json
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree

from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.main import create_app
from app.static import BASE_URL_SLOT, FARO_URL_SLOT, SEO_MANIFEST


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


def test_unknown_paths_answer_404_with_noindex_spa_page(settings: Settings, dist: Path) -> None:
    """Unknown paths avoid soft-404s for crawlers while still loading the SPA for browsers."""
    with TestClient(create_app(settings, dist)) as client:
        for path in (
            "/assets",
            "/pictures",
            "/pictures-of-cats",
            "/credits",
            "/how-to-play/no-such-mode",
            "/admin/nope",
        ):
            response = client.get(path)
            assert response.status_code == 404, path
            assert response.headers["content-type"].startswith("text/html"), path
            assert '<meta name="robots" content="noindex">' in response.text, path
            assert response.headers["cache-control"] == "no-cache", path


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


def test_sitemap_lists_public_pages_at_the_base_url(settings: Settings, dist: Path) -> None:
    configured = settings.model_copy(update={"public_base_url": "https://quiz.example/inn&co"})
    with TestClient(create_app(configured, dist)) as client:
        response = client.get("/sitemap.xml")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/xml")
    tree = ElementTree.fromstring(response.content)
    namespace = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    assert [loc.text for loc in tree.iter(f"{namespace}loc")] == [
        "https://quiz.example/inn&co/",
        "https://quiz.example/inn&co/daily",
        "https://quiz.example/inn&co/create",
        "https://quiz.example/inn&co/how-to-play",
        "https://quiz.example/inn&co/how-to-play/random-events",
    ]


def test_seo_manifest_drives_sitemap_per_route_head_and_json_ld(
    settings: Settings, dist: Path
) -> None:
    assert f"SEO_MANIFEST = '{SEO_MANIFEST}'" in (
        REPO_ROOT / "client" / "src" / "lib" / "seo.ts"
    ).read_text(encoding="utf-8")
    (dist / "index.html").write_text(
        "<!doctype html><html><head>"
        "<title>The Jolly Boar Inn — OSRS Party Trivia Game</title>"
        '<meta name="description" content="placeholder">'
        '<meta property="og:title" content="placeholder">'
        '<meta property="og:description" content="placeholder">'
        f'<meta property="og:image" content="{BASE_URL_SLOT}/og-card.png">'
        "</head><body></body></html>",
        encoding="utf-8",
    )
    (dist / SEO_MANIFEST).write_text(
        json.dumps(
            {
                "site_name": "The Jolly Boar Inn",
                "has_card": True,
                "routes": [
                    {
                        "path": "/",
                        "title": "The Jolly Boar Inn — OSRS Party Trivia Game",
                        "description": "Think you know Gielinor? Host multiplayer quizzes.",
                        "sitemap": True,
                    },
                    {
                        "path": "/daily",
                        "title": "Daily OSRS Quiz — The Jolly Boar Inn",
                        "description": "Play today's solo OSRS trivia challenge.",
                        "sitemap": True,
                    },
                    {
                        "path": "/how-to-play/more-or-less",
                        "title": "More or Less — The Jolly Boar Inn",
                        "description": "Two fine wares, one simple question.",
                        "sitemap": True,
                        "breadcrumb": "More or Less",
                    },
                    {
                        "path": "/report",
                        "title": "Report a Question — The Jolly Boar Inn",
                        "description": "Report an issue.",
                        "sitemap": False,
                        "noindex": True,
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    configured = settings.model_copy(update={"public_base_url": "https://jollyboar.com/"})
    with TestClient(create_app(configured, dist)) as client:
        # The internal manifest itself is never served publicly.
        assert client.get(f"/{SEO_MANIFEST}").status_code == 404

        sitemap = client.get("/sitemap.xml")
        tree = ElementTree.fromstring(sitemap.content)
        ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
        assert [loc.text for loc in tree.iter(f"{ns}loc")] == [
            "https://jollyboar.com/",
            "https://jollyboar.com/daily",
            "https://jollyboar.com/how-to-play/more-or-less",
        ]

        home = client.get("/")
        assert home.status_code == 200
        assert "<title>The Jolly Boar Inn — OSRS Party Trivia Game</title>" in home.text
        assert '<link rel="canonical" href="https://jollyboar.com/">' in home.text
        assert '<meta property="og:url" content="https://jollyboar.com/">' in home.text
        assert 'content="noindex"' not in home.text
        ld_match = re.search(r'<script type="application/ld\+json">([^<]+)</script>', home.text)
        assert ld_match is not None
        ld = json.loads(ld_match.group(1))
        assert ld["@type"] == "WebApplication"
        assert ld["name"] == "The Jolly Boar Inn"
        assert ld["alternateName"] == "Jolly Boar Inn"
        assert ld["url"] == "https://jollyboar.com/"
        assert ld["image"] == "https://jollyboar.com/og-card.png"
        assert ld["isAccessibleForFree"] is True

        # Trailing slashes resolve to the route and point canonical to the normalized URL.
        daily = client.get("/daily/")
        assert daily.status_code == 200
        assert "<title>Daily OSRS Quiz — The Jolly Boar Inn</title>" in daily.text
        assert (
            '<meta name="description" content="Play today&#x27;s solo OSRS trivia challenge.">'
            in daily.text
        )
        assert (
            '<meta property="og:title" content="Daily OSRS Quiz — The Jolly Boar Inn">'
            in daily.text
        )
        assert '<link rel="canonical" href="https://jollyboar.com/daily">' in daily.text
        assert "application/ld+json" not in daily.text

        mode = client.get("/how-to-play/more-or-less")
        assert mode.status_code == 200
        assert "<title>More or Less — The Jolly Boar Inn</title>" in mode.text
        assert (
            '<link rel="canonical" href="https://jollyboar.com/how-to-play/more-or-less">'
            in mode.text
        )
        crumb_match = re.search(r'<script type="application/ld\+json">([^<]+)</script>', mode.text)
        assert crumb_match is not None
        crumb = json.loads(crumb_match.group(1))
        assert crumb["@type"] == "BreadcrumbList"
        assert [item["name"] for item in crumb["itemListElement"]] == [
            "The Jolly Boar Inn",
            "How to Play",
            "More or Less",
        ]

        # Private and noindex routes never carry a canonical and always declare noindex.
        for private in (
            "/report",
            "/r/ABYSSAL",
            "/history/ABYSSAL/2610012005",
            "/admin",
            "/admin/questions",
        ):
            resp = client.get(private)
            assert resp.status_code == 200, private
            assert '<meta name="robots" content="noindex">' in resp.text, private
            assert 'rel="canonical"' not in resp.text, private


def test_json_ld_escapes_script_closing_tags(settings: Settings, dist: Path) -> None:
    (dist / "index.html").write_text("<!doctype html><html><head></head></html>", encoding="utf-8")
    configured = settings.model_copy(
        update={"public_base_url": "https://quiz.example/</script><script>alert(1)"}
    )
    with TestClient(create_app(configured, dist)) as client:
        response = client.get("/")
    assert response.status_code == 200
    assert "</script><script>alert(1)" not in response.text
    assert "\\u003c/script>" in response.text


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
