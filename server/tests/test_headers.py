"""Section 7, last paragraph: headers on every response, no query strings in the access
log."""

import logging
from pathlib import Path

from fastapi.testclient import TestClient

from app.accesslog import StripQueryString
from app.config import Settings
from app.main import create_app


def test_headers_on_every_response(settings: Settings, dist: Path) -> None:
    with TestClient(create_app(settings, dist)) as client:
        api = client.get("/api/health")
        missing = client.get("/api/nope")
        page = client.get("/")
        asset = client.get("/assets/index-abc123.js")
    for response in (api, missing, page, asset):
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.headers["x-content-type-options"] == "nosniff"
    assert api.headers["cache-control"] == "no-store"
    assert missing.headers["cache-control"] == "no-store"
    assert page.headers["cache-control"] == "no-cache"  # static keeps its own policy
    assert asset.headers["cache-control"].startswith("public, max-age=31536000")


def test_access_log_filter_strips_query_string() -> None:
    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:1234", "GET", "/r/CABBAGE/admin?t=secret", "1.1", 200),
        None,
    )
    assert StripQueryString().filter(record)
    assert record.getMessage() == '127.0.0.1:1234 - "GET /r/CABBAGE/admin HTTP/1.1" 200'


def test_access_log_filter_leaves_other_records_alone() -> None:
    record = logging.LogRecord("uvicorn.error", logging.INFO, __file__, 1, "hi %s", ("x?y",), None)
    assert StripQueryString().filter(record)
    assert record.getMessage() == "hi x?y"
