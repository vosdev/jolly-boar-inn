"""HTTP helpers shared by the room and websocket tests."""

from typing import Any
from urllib.parse import urlsplit

import httpx
from fastapi.testclient import TestClient


def create(client: TestClient, **settings: Any) -> tuple[str, str]:
    """Create a room, return ``(code, token)``."""
    response = client.post("/api/rooms", json={"settings": settings})
    assert response.status_code == 201, response.text
    body = response.json()
    fragment = urlsplit(body["admin_url"]).fragment
    assert fragment.startswith("t=")
    return body["code"], fragment[2:]


def claim(client: TestClient, code: str, token: str, name: str = "Admin") -> httpx.Response:
    return client.post(f"/api/rooms/{code}/claim", json={"token": token, "display_name": name})


def join(client: TestClient, code: str, name: str) -> httpx.Response:
    return client.post(f"/api/rooms/{code}/join", json={"display_name": name})
