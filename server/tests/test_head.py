"""``HEAD`` on the API answers as ``GET`` does, minus the body: uptime checkers and
``curl -I`` send it."""

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient


def api_get_paths(app: FastAPI) -> list[str]:
    """Every ``GET`` path under ``/api``, from the schema FastAPI builds of its own routes."""
    return [
        path
        for path, methods in app.openapi()["paths"].items()
        if "get" in methods and (path == "/api" or path.startswith("/api/"))
    ]


def test_every_api_get_answers_head(
    app: FastAPI, client: TestClient, lobby: dict[str, Any]
) -> None:
    # One word, so ``free-code`` draws the same code for the GET and the HEAD.
    app.state.rooms.words = ("Cabbage",)
    paths = api_get_paths(app)
    assert len(paths) >= 4, paths  # health, modes, a room, a vocabulary
    for template in paths:
        # Values that name something real, so each route answers as it would for a caller
        # who got it right rather than all of them 404ing alike.
        path = template.format(code=lobby["code"], name="items")
        if path == "/api/questions":
            path += "?mode=guess_examine"
        got = client.get(path)
        head = client.head(path)
        assert head.status_code == got.status_code == 200, path
        assert dict(head.headers) == dict(got.headers), path
        assert head.content == b"", path


def test_head_on_an_unknown_api_path_is_404(client: TestClient) -> None:
    assert client.get("/api/nope").status_code == 404
    head = client.head("/api/nope")
    assert head.status_code == 404
    assert head.content == b""


def test_head_on_a_post_only_route_is_405(client: TestClient) -> None:
    head = client.head("/api/rooms")
    assert head.status_code == 405
    assert head.content == b""
