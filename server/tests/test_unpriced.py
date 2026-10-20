"""A fresh clone before ``make gen-price-questions``: no price pack, so no Price is Right.

The price pack is generated on each instance and never committed, so until it exists a
round it alone feeds is left out everywhere a host or a player could pick it. More/Less
keeps the five questions of ``sample.json``.
"""

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.packs import PACKS_DIR
from tests.rooms_api import create

MODE = "price_is_right"


@pytest.fixture
def unpriced(test_db_dsn: str, dist: Path, tmp_path: Path) -> Iterator[TestClient]:
    packs = tmp_path / "packs"
    shutil.copytree(PACKS_DIR, packs, ignore=shutil.ignore_patterns("prices.json"))
    settings = Settings(_env_file=None, database_url=test_db_dsn, packs_dir=packs)
    with TestClient(create_app(settings, dist)) as client:
        yield client


def test_the_create_form_leaves_the_round_out(unpriced: TestClient) -> None:
    ids = {mode["id"] for mode in unpriced.get("/api/modes").json()}
    assert MODE not in ids
    assert "more_less" in ids


def test_a_room_with_the_round_is_refused(unpriced: TestClient) -> None:
    response = unpriced.post(
        "/api/rooms",
        json={
            "returning": False,
            "display_name": "Admin",
            "settings": {"modes": [{"mode": MODE, "questions": 3}]},
        },
    )
    assert response.status_code == 403
    assert response.json()["code"] == "mode_not_offered"


def test_a_surprise_room_never_draws_the_round(unpriced: TestClient) -> None:
    for _ in range(5):
        code, _ = create(unpriced, surprise_modes=3)
        assert MODE not in unpriced.app.state.rooms.rooms[code].settings.mode_ids


def test_players_cannot_report_from_the_round(unpriced: TestClient) -> None:
    assert MODE not in unpriced.get("/api/questions/modes").json()
