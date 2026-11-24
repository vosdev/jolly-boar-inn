"""Serve the built client (client/dist) with per-route metadata and SPA fallback."""

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from html import escape
from pathlib import Path
from xml.sax.saxutils import escape as escape_xml

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from starlette.convertors import PathConvertor, register_url_convertor

CLIENT_DIST = Path(__file__).resolve().parents[2] / "client" / "dist"

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"
# Never a client route, so a missing file here is a 404 rather than the page.
MEDIA_PATHS = ("assets/", "pictures/", "map/")
# Emitted by `client/site-branding.ts` for this module alone, never served publicly.
SEO_MANIFEST = ".seo.json"

# Where the build leaves ``index.html`` the address it is served at (``client/site-branding.ts``):
# a shared link's card has to be absolute, and the address is the server's setting, not the
# build's, so a change of domain needs a restart rather than a rebuild.
BASE_URL_SLOT = "__PUBLIC_BASE_URL__"
# Where the client sends its errors and Web Vitals, empty when off: a server setting for the
# same reason, and the CSP that has to allow it is the server's too.
FARO_URL_SLOT = "__FARO_URL__"

DEFAULT_SITE_NAME = "The Jolly Boar Inn"
HOME_DESCRIPTION = (
    "Think you know Gielinor? Host multiplayer quizzes for your clan or friends across"
    " 20+ game modes, or try the daily OSRS quiz."
)

# Rooms and finished games belong to their players, and a room's page is Join for anyone else.
PRIVATE_PATHS = ("/api/", "/ws/", "/metrics", "/r/", "/history/", "/admin")
# Every instance runs this code, so its flaws are reported upstream, wherever it is hosted.
SECURITY_CONTACT = "https://github.com/vosdev/jolly-boar-inn/security/advisories/new"
SECURITY_POLICY = "https://github.com/vosdev/jolly-boar-inn/blob/main/SECURITY.md"
# RFC 9116 wants an expiry under a year; one counted from each request never goes stale.
SECURITY_TXT_LIFETIME = timedelta(days=180)

_ROOM_PATH = re.compile(r"^/r/([A-Za-z0-9]{1,32})(?:/(admin|create))?$")
_HISTORY_PATH = re.compile(r"^/history/([A-Za-z0-9]{1,32})/(\d{10})$")
_ADMIN_TABS = frozenset(("suggestions", "reports", "questions", "roster"))

_TITLE_TAG = re.compile(r"<title>[^<]*</title>")
_DESCRIPTION_TAG = re.compile(r'<meta\s+name="description"\s+content="[^"]*"\s*/?>')
_OG_TITLE_TAG = re.compile(r'<meta\s+property="og:title"\s+content="[^"]*"\s*/?>')
_OG_DESCRIPTION_TAG = re.compile(r'<meta\s+property="og:description"\s+content="[^"]*"\s*/?>')


@dataclass(frozen=True)
class PageMeta:
    path: str
    title: str
    description: str
    sitemap: bool = False
    noindex: bool = False
    breadcrumb: str | None = None


@dataclass(frozen=True)
class SeoConfig:
    site_name: str
    has_card: bool
    routes: dict[str, PageMeta]
    sitemap_paths: tuple[str, ...]


def _default_routes(site_name: str) -> list[PageMeta]:
    return [
        PageMeta(
            path="/",
            title=f"{site_name} — OSRS Party Trivia Game",
            description=HOME_DESCRIPTION,
            sitemap=True,
        ),
        PageMeta(
            path="/daily",
            title=f"Daily OSRS Quiz — {site_name}",
            description=(
                f"Play today's solo Old School RuneScape trivia challenge at {site_name}."
                " A fresh set of OSRS questions every day."
            ),
            sitemap=True,
        ),
        PageMeta(
            path="/create",
            title=f"Create a Room — {site_name}",
            description=(
                f"Set up a custom OSRS multiplayer trivia lobby at {site_name}."
                " Pick game modes, configure teams or free-for-all,"
                " and invite your friends or clan."
            ),
            sitemap=True,
        ),
        PageMeta(
            path="/how-to-play",
            title=f"How to Play — {site_name}",
            description=(
                f"Learn how to host and play OSRS trivia at {site_name}: 20+ game modes,"
                " eight question types, teams, TV sofa mode, Mystery Boxes, and random events."
            ),
            sitemap=True,
        ),
        PageMeta(
            path="/how-to-play/random-events",
            title=f"Random Events — {site_name}",
            description=(
                "Every now and then, an OSRS NPC drops in mid-round with a surprise question."
                f" Learn how random events work at {site_name}."
            ),
            sitemap=True,
            breadcrumb="Random Events",
        ),
        PageMeta(
            path="/suggest",
            title=f"Suggest a Question — {site_name}",
            description=(
                f"Submit your own Old School RuneScape trivia question to be added to {site_name}."
            ),
            sitemap=False,
        ),
        PageMeta(
            path="/report",
            title=f"Report a Question — {site_name}",
            description=(
                f"Report an issue or correction for an OSRS trivia question at {site_name}."
            ),
            sitemap=False,
            noindex=True,
        ),
    ]


def _load_seo(dist: Path) -> SeoConfig:
    manifest = dist / SEO_MANIFEST
    if manifest.is_file():
        raw = json.loads(manifest.read_text(encoding="utf-8"))
        site_name = str(raw.get("site_name") or DEFAULT_SITE_NAME)
        has_card = bool(raw.get("has_card", False))
        entries = [
            PageMeta(
                path=str(item["path"]),
                title=str(item["title"]),
                description=str(item["description"]),
                sitemap=bool(item.get("sitemap", False)),
                noindex=bool(item.get("noindex", False)),
                breadcrumb=str(item["breadcrumb"]) if item.get("breadcrumb") else None,
            )
            for item in raw.get("routes", [])
        ]
    else:
        site_name = DEFAULT_SITE_NAME
        has_card = (dist / "og-card.png").is_file()
        entries = _default_routes(site_name)
    return SeoConfig(
        site_name=site_name,
        has_card=has_card,
        routes={entry.path: entry for entry in entries},
        sitemap_paths=tuple(entry.path for entry in entries if entry.sitemap),
    )


def _resolve_page(normalized: str, seo: SeoConfig) -> tuple[PageMeta, int]:
    if normalized in seo.routes:
        return seo.routes[normalized], 200
    room_match = _ROOM_PATH.match(normalized)
    if room_match is not None:
        if room_match.group(2) == "create":
            create = seo.routes.get("/create")
            description = create.description if create else HOME_DESCRIPTION
            return (
                PageMeta(
                    path=normalized,
                    title=f"Create a Room — {seo.site_name}",
                    description=description,
                    noindex=True,
                ),
                200,
            )
        return (
            PageMeta(
                path=normalized,
                title=f"Join Room — {seo.site_name}",
                description=(
                    f"Join an OSRS multiplayer trivia game at {seo.site_name}."
                    " Pick your display name and pet to enter the lobby."
                ),
                noindex=True,
            ),
            200,
        )
    if _HISTORY_PATH.match(normalized) is not None:
        return (
            PageMeta(
                path=normalized,
                title=f"Past Game — {seo.site_name}",
                description=f"Finished OSRS trivia game standings at {seo.site_name}.",
                noindex=True,
            ),
            200,
        )
    if normalized == "/admin" or (
        normalized.startswith("/admin/") and normalized.removeprefix("/admin/") in _ADMIN_TABS
    ):
        return (
            PageMeta(
                path=normalized,
                title=f"Admin — {seo.site_name}",
                description=f"Operator tools for {seo.site_name}.",
                noindex=True,
            ),
            200,
        )
    return (
        PageMeta(
            path=normalized,
            title=f"Page Not Found — {seo.site_name}",
            description=HOME_DESCRIPTION,
            noindex=True,
        ),
        404,
    )


def _json_ld(page: PageMeta, seo: SeoConfig, root: str) -> str | None:
    if page.path == "/":
        payload: dict[str, object] = {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": seo.site_name,
            "description": page.description,
            "applicationCategory": "GameApplication",
            "genre": ["Trivia", "Quiz", "Party Game"],
            "operatingSystem": "Any",
            "browserRequirements": "Requires JavaScript",
            "isAccessibleForFree": True,
            "inLanguage": "en",
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        }
        if seo.site_name.startswith("The "):
            payload["alternateName"] = seo.site_name.removeprefix("The ")
        if root:
            payload["url"] = f"{root}/"
            if seo.has_card:
                payload["image"] = f"{root}/og-card.png"
        return json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")
    if page.breadcrumb and root:
        payload = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": seo.site_name, "item": f"{root}/"},
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": "How to Play",
                    "item": f"{root}/how-to-play",
                },
                {
                    "@type": "ListItem",
                    "position": 3,
                    "name": page.breadcrumb,
                    "item": f"{root}{page.path}",
                },
            ],
        }
        return json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")
    return None


def _render_page(
    template: str, page: PageMeta, seo: SeoConfig, root: str, address: str, collector: str
) -> str:
    html = template.replace(BASE_URL_SLOT, address).replace(FARO_URL_SLOT, collector)
    title = escape(page.title)
    description = escape(page.description)
    html = _TITLE_TAG.sub(lambda _: f"<title>{title}</title>", html, count=1)
    html = _DESCRIPTION_TAG.sub(
        lambda _: f'<meta name="description" content="{description}">', html, count=1
    )
    html = _OG_TITLE_TAG.sub(
        lambda _: f'<meta property="og:title" content="{title}">', html, count=1
    )
    html = _OG_DESCRIPTION_TAG.sub(
        lambda _: f'<meta property="og:description" content="{description}">', html, count=1
    )
    extra: list[str] = []
    if page.noindex:
        extra.append('<meta name="robots" content="noindex">')
    elif root:
        canonical = escape(f"{root}{page.path}")
        extra.append(f'<link rel="canonical" href="{canonical}">')
        extra.append(f'<meta property="og:url" content="{canonical}">')
    if structured := _json_ld(page, seo, root):
        extra.append(f'<script type="application/ld+json">{structured}</script>')
    if not extra:
        return html
    snippet = "\n    ".join(extra)
    if "</head>" in html:
        return html.replace("</head>", f"    {snippet}\n  </head>", 1)
    return html + snippet


class ClientPath(PathConvertor):
    """Any path outside ``/api``, ``/ws`` and ``/metrics``.

    Those belong to the router. Were this route to match them, it would outrank a route
    that has the path but not the method, and a ``GET`` on a ``POST``-only route would be a
    404 instead of the router's 405.
    """

    regex = r"(?!(?:api|ws|metrics)(?:/|$)).*"


register_url_convertor("client", ClientPath())


def mount_client(
    app: FastAPI, dist: Path = CLIENT_DIST, base_url: str = "", faro_url: str = ""
) -> None:
    """Register a catch-all GET route. Must be called after every API route."""

    index = dist / "index.html"
    seo = _load_seo(dist)
    root = base_url.rstrip("/")
    address = escape(root)
    collector = escape(faro_url)

    # Registered before the catch-all, which would otherwise answer them with ``index.html``.
    @app.api_route("/robots.txt", methods=["GET", "HEAD"], include_in_schema=False)
    async def robots() -> Response:
        lines = ["User-agent: *", *(f"Disallow: {path}" for path in PRIVATE_PATHS)]
        lines.append(f"Sitemap: {root}/sitemap.xml")
        return PlainTextResponse("\n".join(lines) + "\n", headers={"Cache-Control": NO_CACHE})

    @app.api_route("/sitemap.xml", methods=["GET", "HEAD"], include_in_schema=False)
    async def sitemap() -> Response:
        urls = "".join(
            f"<url><loc>{escape_xml(root + path)}</loc></url>" for path in seo.sitemap_paths
        )
        body = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n'
        )
        return Response(body, media_type="application/xml", headers={"Cache-Control": NO_CACHE})

    @app.api_route("/.well-known/security.txt", methods=["GET", "HEAD"], include_in_schema=False)
    async def security_txt() -> Response:
        expires = (datetime.now(UTC) + SECURITY_TXT_LIFETIME).strftime("%Y-%m-%dT%H:%M:%SZ")
        lines = [
            f"Contact: {SECURITY_CONTACT}",
            f"Expires: {expires}",
            f"Policy: {SECURITY_POLICY}",
            "Preferred-Languages: en",
            f"Canonical: {root}/.well-known/security.txt",
        ]
        return PlainTextResponse("\n".join(lines) + "\n", headers={"Cache-Control": NO_CACHE})

    @app.api_route("/{path:client}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(path: str) -> Response:
        if not index.is_file():
            raise HTTPException(status_code=404, detail="client not built")

        # No real file or client route has one, and it makes ``resolve`` raise.
        if "\0" in path:
            raise HTTPException(status_code=404)
        candidate = (dist / path).resolve()
        media = path.startswith(MEDIA_PATHS)
        if path and path != SEO_MANIFEST and candidate.is_relative_to(dist) and candidate.is_file():
            # A picture's random name changes with its file (``scripts/build_pictures.py``), and a
            # tile's folder with the game cache it came from (``scripts/gen_map.py``).
            cache = IMMUTABLE if media else NO_CACHE
            return FileResponse(candidate, headers={"Cache-Control": cache})
        # The page in an ``<img>`` or ``<script>`` would be a broken file the server called a
        # success. No-cache keeps a cache in front from holding the 404 once the file is deployed.
        if media:
            raise HTTPException(status_code=404, headers={"Cache-Control": NO_CACHE})
        normalized = "/" + path.rstrip("/") if path else "/"
        page, status = _resolve_page(normalized, seo)
        rendered = _render_page(
            index.read_text(encoding="utf-8"), page, seo, root, address, collector
        )
        return HTMLResponse(rendered, status_code=status, headers={"Cache-Control": NO_CACHE})
