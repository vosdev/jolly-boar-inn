"""A suggester's own screenshot: sent with a picture pin, re-encoded, reviewed and imported."""

import asyncio
import base64
import io
import json
import sys
import threading
import time
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image, PngImagePlugin

from app import suggestion_pictures
from app.config import REPO_ROOT
from app.modes import MODES, Mode, drawable
from tests import test_import_suggestions, test_suggestions
from tests.test_import_suggestions import loads
from tests.test_suggestions import BEARER, approve, export, queue, suggest

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import import_suggestions  # noqa: E402

# The fixtures of the suite each half extends.
app, client = test_suggestions.app, test_suggestions.client
repo = test_import_suggestions.repo


def picture(size: tuple[int, int] = (800, 450), kind: str = "PNG", **save: Any) -> str:
    image = Image.new("RGB", size, (40, 90, 160))
    out = io.BytesIO()
    image.save(out, kind, **save)
    return base64.b64encode(out.getvalue()).decode("ascii")


PROP = {
    "kind": "question",
    "content": {
        "type": "picture_pin",
        "mode": "prop_hunt",
        "difficulty": "medium",
        "payload": {
            "prompt": "Which of these is a player in disguise?",
            # What the form sends before the server names the picture it stores.
            "screenshot": "screenshot:upload",
            "width": 800,
            "height": 450,
            "target": {"min_x": 0.4, "max_x": 0.5, "min_y": 0.4, "max_y": 0.6},
            "reach": 0.1,
        },
    },
    "credit": "AFKFisher",
    "credit_shown": True,
}


def with_picture(encoded: str | None = None, **payload: Any) -> dict[str, Any]:
    body = deepcopy(PROP)
    body["content"]["payload"] |= payload
    return body | {"picture": picture() if encoded is None else encoded}


def stored(client: TestClient, suggestion: str) -> bytes:
    response = client.get(f"/api/admin/suggestions/{suggestion}/picture", headers=BEARER)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/webp"
    return response.content


def refused(client: TestClient, body: dict[str, Any], status: int = 422) -> dict[str, Any]:
    response = client.post("/api/suggestions", json=body)
    assert response.status_code == status, response.text
    assert queue(client)["counts"]["pending"] == 0
    return response.json()


def test_a_picture_pin_is_stored_with_its_picture_under_a_fresh_name(client: TestClient) -> None:
    suggestion = suggest(client, with_picture())
    (row,) = queue(client)["suggestions"]
    payload = row["content"]["payload"]
    assert payload["screenshot"].startswith("screenshot:suggested-")
    assert (payload["width"], payload["height"]) == (800, 450)
    with Image.open(io.BytesIO(stored(client, suggestion))) as opened:
        assert (opened.format, opened.size) == ("WEBP", (800, 450))


def test_the_picture_is_the_operators_alone(client: TestClient) -> None:
    suggestion = suggest(client, with_picture())
    response = client.get(f"/api/admin/suggestions/{suggestion}/picture")
    assert response.status_code == 401


@pytest.mark.parametrize("kind", ["PNG", "JPEG", "WEBP"])
def test_each_format_a_screenshot_tool_writes_is_taken(client: TestClient, kind: str) -> None:
    suggest(client, with_picture(picture(kind=kind)))


def test_a_stored_picture_carries_no_metadata(client: TestClient) -> None:
    exif = Image.Exif()
    exif[0x010F] = "Camera maker"
    exif[0x8825] = {2: (52.0, 22.0, 0.0)}  # GPS latitude
    jpeg = picture(kind="JPEG", exif=exif.tobytes(), comment=b"from my house")
    text = PngImagePlugin.PngInfo()
    text.add_text("Author", "Someone real")
    png = picture(kind="PNG", pnginfo=text, icc_profile=b"profile bytes")
    for encoded in (jpeg, png):
        body = stored(client, suggest(client, with_picture(encoded)))
        with Image.open(io.BytesIO(body)) as opened:
            assert not opened.getexif()
            assert not {"exif", "icc_profile", "xmp", "comment"} & opened.info.keys()
        for marker in (b"EXIF", b"XMP ", b"ICCP", b"Camera maker", b"Someone real"):
            assert marker not in body


def test_a_picture_turned_by_its_exif_is_stored_upright(client: TestClient) -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees to view
    suggestion = suggest(client, with_picture(picture((800, 450), "JPEG", exif=exif.tobytes())))
    with Image.open(io.BytesIO(stored(client, suggestion))) as opened:
        assert opened.size == (450, 800)
    payload = queue(client)["suggestions"][0]["content"]["payload"]
    assert (payload["width"], payload["height"]) == (450, 800)


def test_a_large_picture_is_shrunk_to_its_longest_side(client: TestClient) -> None:
    suggestion = suggest(client, with_picture(picture((3840, 2160))))
    with Image.open(io.BytesIO(stored(client, suggestion))) as opened:
        assert opened.size == (suggestion_pictures.MAX_SIDE, 1080)


def _gif() -> str:
    out = io.BytesIO()
    Image.new("P", (800, 450)).save(out, "GIF")
    return base64.b64encode(out.getvalue()).decode("ascii")


@pytest.mark.parametrize(
    "encoded",
    [
        pytest.param(base64.b64encode(b"not a picture at all").decode(), id="not-a-picture"),
        pytest.param("@@not base64@@", id="not-base64"),
        pytest.param(_gif(), id="gif"),
        pytest.param(picture((300, 150)), id="too-small"),
    ],
)
def test_a_picture_outside_the_limits_is_refused(client: TestClient, encoded: str) -> None:
    assert refused(client, with_picture(encoded))["code"] == "bad_picture"


def test_a_picture_claiming_too_many_pixels_is_refused_before_it_is_decoded(
    client: TestClient,
) -> None:
    # A PNG compresses a blank picture to almost nothing, whatever size it claims.
    huge = picture((9000, 8200), "PNG", optimize=True)
    assert len(huge) < suggestion_pictures.MAX_ENCODED
    assert refused(client, with_picture(huge))["code"] == "bad_picture"


def test_a_4k_or_5k_screenshot_fits_the_pixel_cap_and_one_past_it_does_not(
    client: TestClient,
) -> None:
    suggestion = suggest(client, with_picture(picture((4096, 4096), "PNG", optimize=True)))
    with Image.open(io.BytesIO(stored(client, suggestion))) as opened:
        assert opened.size == (suggestion_pictures.MAX_SIDE, suggestion_pictures.MAX_SIDE)
    over = picture((4097, 4096), "PNG", optimize=True)
    response = client.post("/api/suggestions", json=with_picture(over))
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "bad_picture"


@pytest.mark.parametrize("error", [ValueError, SyntaxError])
def test_a_picture_pillow_fails_on_is_a_bad_picture(
    monkeypatch: pytest.MonkeyPatch, error: type[Exception]
) -> None:
    def fails(*args: Any, **kwargs: Any) -> None:
        raise error("broken chunk")

    monkeypatch.setattr(suggestion_pictures.ImageOps, "exif_transpose", fails)
    with pytest.raises(suggestion_pictures.BadPicture):
        suggestion_pictures.reencode(base64.b64decode(picture()))


@pytest.mark.parametrize(
    ("size", "mode", "kind"),
    [
        ((3000, 2000), "RGBA", "PNG"),
        ((2400, 2400), "P", "PNG"),
        ((2400, 1200), "LA", "PNG"),
        ((2400, 1200), "L", "JPEG"),
        ((2400, 1200), "CMYK", "JPEG"),
        ((4096, 2160), "RGB", "JPEG"),
    ],
)
def test_every_mode_is_shrunk_to_rgb_or_rgba(size: tuple[int, int], mode: str, kind: str) -> None:
    out = io.BytesIO()
    Image.new(mode, size).save(out, kind)
    data, width, height = suggestion_pictures.reencode(out.getvalue())
    with Image.open(io.BytesIO(data)) as opened:
        assert opened.mode == ("RGBA" if mode in ("RGBA", "LA") else "RGB")
        assert opened.size == (width, height)
    assert max(width, height) == suggestion_pictures.MAX_SIDE
    assert width / height == pytest.approx(size[0] / size[1], abs=0.01)


def test_a_large_picture_turned_by_its_exif_is_shrunk_and_upright() -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees to view
    body = base64.b64decode(picture((3840, 2160), "JPEG", exif=exif.tobytes()))
    assert suggestion_pictures.reencode(body)[1:] == (1080, 1920)


async def test_pictures_are_decoded_one_at_a_time(monkeypatch: pytest.MonkeyPatch) -> None:
    running, most = 0, 0
    lock = threading.Lock()

    def reencode(body: bytes) -> tuple[bytes, int, int]:
        nonlocal running, most
        with lock:
            running += 1
            most = max(most, running)
        time.sleep(0.05)
        with lock:
            running -= 1
        return body, 1, 1

    monkeypatch.setattr(suggestion_pictures, "reencode", reencode)
    monkeypatch.setattr(suggestion_pictures, "DECODES", asyncio.Semaphore(1))
    await asyncio.gather(*(suggestion_pictures.prepare(picture()) for _ in range(3)))
    assert most == 1


def test_a_picture_over_five_megabytes_is_refused(client: TestClient) -> None:
    body = with_picture("A" * (suggestion_pictures.MAX_ENCODED + 4))
    refused(client, body)


def test_only_the_suggestion_route_takes_a_body_that_large(client: TestClient) -> None:
    large = {"content": {"type": "x", "payload": {"prompt": "A" * 300_000}}}
    response = client.post("/api/suggestions/similar", json=large)
    assert response.status_code == 413
    over = with_picture("A" * (suggestion_pictures.MAX_ENCODED + 300_000))
    assert refused(client, over, 413)["code"] == "too_large"


def test_a_picture_pin_needs_its_picture_and_nothing_else_takes_one(client: TestClient) -> None:
    without = deepcopy(PROP)
    assert "$.picture" in refused(client, without)["message"]
    event = {
        "kind": "question",
        "content": {
            "type": "multiple_choice",
            "mode": "random_event",
            "random_event": "bob",
            "wiki": "https://oldschool.runescape.wiki/w/Bob",
            "payload": {"prompt": "Who is Bob?", "options": ["A cat", "A dog"], "answer_index": 0},
        },
        "credit": "AFKFisher",
        "credit_shown": False,
    }
    assert "$.picture" in refused(client, event | {"picture": picture()})["message"]


def test_the_operator_moves_the_target_and_the_picture_stays(client: TestClient) -> None:
    suggestion = suggest(client, with_picture())
    (row,) = queue(client)["suggestions"]
    name = row["content"]["payload"]["screenshot"]
    content = deepcopy(row["content"])
    content["payload"] |= {
        "target": {"min_x": 0.1, "max_x": 0.2, "min_y": 0.1, "max_y": 0.2},
        "screenshot": "screenshot:someone-elses",
        "width": 10,
    }
    response = client.put(
        f"/api/admin/suggestions/{suggestion}",
        json={"content": content, "credit": "AFKFisher", "credit_shown": True},
        headers=BEARER,
    )
    assert response.status_code == 200, response.text
    payload = response.json()["content"]["payload"]
    assert payload["target"]["min_x"] == 0.1
    assert (payload["screenshot"], payload["width"], payload["height"]) == (name, 800, 450)


def test_a_grid_picture_pin_is_taken_too(client: TestClient) -> None:
    body = with_picture()
    payload = body["content"]["payload"]
    del payload["target"], payload["reach"]
    payload |= {"grid": {"cols": 4, "rows": 7}, "cells": [{"col": 2, "row": 3}]}
    suggest(client, body)


@pytest.fixture
def prop_hunt_built(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(MODES, "prop_hunt", Mode("prop_hunt", frozenset({"picture_pin"})))


@pytest.mark.usefixtures("prop_hunt_built")
def test_an_approved_picture_pin_is_exported_imported_and_plays_with_its_picture(
    client: TestClient,
    repo: dict[str, Path],
) -> None:
    suggestion = suggest(client, with_picture())
    approve(client, suggestion)
    (entry,) = export(client)["questions"]
    name = entry["payload"]["screenshot"]
    assert base64.b64decode(entry["picture"]) == stored(client, suggestion)

    pictures = repo["dir"] / ".pictures"
    assert _run(repo, {"questions": [entry]}, pictures) == 0
    staged = pictures / "screenshot" / f"{name.removeprefix('screenshot:')}.webp"
    assert staged.read_bytes() == stored(client, suggestion)
    assert loads(repo)
    (question,) = json.loads((repo["packs"] / "prop_hunt.json").read_text())["questions"]
    assert "picture" not in question
    assert drawable(question, {name})
    assert not drawable(question, set())


@pytest.mark.usefixtures("prop_hunt_built")
def test_an_import_refuses_a_picture_that_is_not_the_one_its_question_says(
    repo: dict[str, Path],
) -> None:
    entry = {
        **{k: v for k, v in PROP["content"].items()},
        "payload": {**PROP["content"]["payload"], "screenshot": "screenshot:suggested-ab"},
        "credit": "AFKFisher",
        "credit_shown": True,
    }
    pictures = repo["dir"] / ".pictures"
    out = io.BytesIO()
    Image.new("RGB", (640, 480)).save(out, "WEBP")
    wrong = base64.b64encode(out.getvalue()).decode()
    for bad in ({**entry, "picture": wrong}, entry):
        assert _run(repo, {"questions": [bad]}, pictures) == 1
    assert not pictures.exists()


def _run(repo: dict[str, Path], export: dict[str, Any], pictures: Path) -> int:
    file = repo["dir"] / "export.json"
    file.write_text(json.dumps(export))
    args = [str(file), "--packs-dir", str(repo["packs"]), "--roster", str(repo["roster"])]
    args += ["--npcs", str(repo["npcs"]), "--assets", str(repo["assets"])]
    args += ["--items-file", str(repo["items"]), "--npcs-file", str(repo["npc_rows"])]
    args += ["--detail-file", str(repo["details"]), "--pictures-dir", str(pictures)]
    return import_suggestions.main(args)
