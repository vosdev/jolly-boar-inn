"""The world map's tiles: how they are built, and that a run is whole or leaves nothing.

The download and the Java renderer are stubbed: CI has no Java, and the pipeline around them
is what can go wrong quietly. ``make gen-map`` itself is checked by hand.
"""

import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from app.config import REPO_ROOT
from app.map import PIN, has_tiles

sys.path.insert(0, str(REPO_ROOT / "server" / "scripts"))

import fetch_assets  # noqa: E402
import gen_map  # noqa: E402

RED, GREEN, BLUE, WHITE = (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)
SIZE = gen_map.TILE_SIZE


def disk_zip() -> bytes:
    """A ``disk.zip`` with the files a cache has, and one it should never unpack."""
    body = io.BytesIO()
    with zipfile.ZipFile(body, "w") as archive:
        archive.writestr("cache/main_file_cache.dat2", b"data")
        archive.writestr("cache/main_file_cache.idx255", b"index")
        archive.writestr("cache/../../outside", b"no")
    return body.getvalue()


def pin_of(body: bytes, cache_id: int = 2752) -> gen_map.Pin:
    return gen_map.Pin(cache_id, hashlib.sha256(body).hexdigest())


def square(path: Path, colour: tuple[int, int, int]) -> None:
    Image.new("RGB", (SIZE, SIZE), colour).save(path)


def fetch_zip(pin: gen_map.Pin, path: Path) -> None:
    path.write_bytes(disk_zip())


def draw_falador(cache: Path, squares: Path) -> None:
    """Four squares that make up one zoom 1 tile, and a black one in the corner of the map."""
    assert (cache / "main_file_cache.dat2").read_bytes() == b"data"
    square(squares / "46_52.png", RED)
    square(squares / "47_52.png", GREEN)
    square(squares / "46_53.png", BLUE)
    square(squares / "47_53.png", WHITE)
    square(squares / "12_28.png", (0, 0, 0))


@pytest.fixture(autouse=True)
def ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    """These paths are in a temporary folder, where git has no opinion."""
    monkeypatch.setattr(gen_map, "git_ignored", lambda paths: set(paths))


@pytest.fixture
def client(tmp_path: Path) -> Path:
    return tmp_path / "client" / "map"


@pytest.fixture
def stage(tmp_path: Path) -> Path:
    return tmp_path / "stage"


def generate(pin: gen_map.Pin, client: Path, stage: Path, **kwargs: Any) -> bool:
    return gen_map.generate(
        pin,
        client=client,
        stage=stage,
        fetch=kwargs.get("fetch", fetch_zip),
        draw=kwargs.get("draw", draw_falador),
    )


def test_a_run_writes_every_zoom_in_the_wikis_layout(client: Path, stage: Path) -> None:
    assert generate(pin_of(disk_zip()), client, stage)
    root = client / "2752" / "clean"
    for zoom, x, y in ((2, 46, 52), (1, 23, 26), (0, 11, 13), (-1, 5, 6), (-2, 2, 3), (-3, 1, 1)):
        assert (root / str(zoom) / f"0_{x}_{y}.png").is_file(), zoom
    assert not (root / "3").exists()
    assert not (root / "-4").exists()


def test_a_tile_is_its_four_children_halved_with_north_up(client: Path, stage: Path) -> None:
    generate(pin_of(disk_zip()), client, stage)
    with Image.open(client / "2752" / "clean" / "1" / "0_23_26.png") as tile:
        assert tile.size == (SIZE, SIZE)
        rgb = tile.convert("RGB")
        assert rgb.getpixel((8, 8)) == BLUE
        assert rgb.getpixel((SIZE - 8, 8)) == WHITE
        assert rgb.getpixel((8, SIZE - 8)) == RED
        assert rgb.getpixel((SIZE - 8, SIZE - 8)) == GREEN


def test_a_tile_with_a_missing_child_leaves_it_black(tmp_path: Path) -> None:
    squares = tmp_path / "squares"
    squares.mkdir()
    square(squares / "46_52.png", RED)
    gen_map.build_tiles(squares, tmp_path / "out")
    with Image.open(tmp_path / "out" / "1" / "0_23_26.png") as tile:
        assert tile.convert("RGB").getpixel((8, 8)) == (0, 0, 0)
        assert tile.convert("RGB").getpixel((8, SIZE - 8)) == RED


def test_an_all_black_tile_is_not_written(client: Path, stage: Path) -> None:
    generate(pin_of(disk_zip()), client, stage)
    root = client / "2752" / "clean"
    assert not (root / "2" / "0_12_28.png").exists()
    assert not (root / "1" / "0_6_14.png").exists()


def test_the_manifest_counts_the_tiles_written(client: Path, stage: Path) -> None:
    generate(pin_of(disk_zip()), client, stage)
    root = client / "2752" / "clean"
    manifest = json.loads((root / "manifest.json").read_text())
    assert manifest == {"cache_id": 2752, "tiles": len(list(root.glob("*/*.png")))}


def test_a_finished_run_leaves_no_stage(client: Path, stage: Path) -> None:
    generate(pin_of(disk_zip()), client, stage)
    assert not stage.exists()


def test_a_download_with_the_wrong_hash_stops_the_run_and_writes_nothing(
    client: Path, stage: Path
) -> None:
    def never(cache: Path, squares: Path) -> None:
        raise AssertionError("a bad cache reached the renderer")

    with pytest.raises(gen_map.BadDownload):
        generate(gen_map.Pin(2752, "0" * 64), client, stage, draw=never)
    assert not client.exists()
    assert list(stage.iterdir()) == []


def test_a_stopped_run_serves_nothing_and_keeps_the_download(client: Path, stage: Path) -> None:
    def fails(cache: Path, squares: Path) -> None:
        square(squares / "46_52.png", RED)
        raise OSError("out of memory")

    pin = pin_of(disk_zip())
    with pytest.raises(OSError, match="out of memory"):
        generate(pin, client, stage, draw=fails)
    assert not client.exists()
    assert not has_tiles(PIN, client)

    def never(pin: gen_map.Pin, path: Path) -> None:
        raise AssertionError("the zip from the stopped run was fetched again")

    assert generate(pin, client, stage, fetch=never)


def test_a_complete_tileset_sends_no_request(client: Path, stage: Path) -> None:
    def never(pin: gen_map.Pin, path: Path) -> None:
        raise AssertionError("a complete tileset was fetched again")

    pin = pin_of(disk_zip())
    generate(pin, client, stage)
    assert not generate(pin, client, stage, fetch=never)


def test_a_new_pin_replaces_the_old_tileset(client: Path, stage: Path) -> None:
    generate(pin_of(disk_zip(), 2746), client, stage)
    generate(pin_of(disk_zip(), 2752), client, stage)
    assert [path.name for path in client.iterdir()] == ["2752"]


def test_only_the_caches_files_are_unpacked(tmp_path: Path) -> None:
    archive = tmp_path / "disk.zip"
    archive.write_bytes(disk_zip())
    gen_map.unpack(archive, tmp_path / "cache")
    assert sorted(path.name for path in (tmp_path / "cache").iterdir()) == [
        "main_file_cache.dat2",
        "main_file_cache.idx255",
    ]
    assert not (tmp_path / "outside").exists()


def test_a_path_git_would_commit_stops_the_run(
    client: Path, stage: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(gen_map, "git_ignored", lambda paths: set())
    with pytest.raises(fetch_assets.NotIgnored):
        generate(pin_of(disk_zip()), client, stage)
    assert not stage.exists()


def test_what_it_writes_is_git_ignored() -> None:
    written = [gen_map.STAGE / "x", gen_map.CLIENT_MAP / "2752" / "clean" / "0" / "0_0_0.png"]
    assert fetch_assets.git_ignored(written) == set(written)


def test_the_pin_is_a_cache_and_a_hash() -> None:
    pin = gen_map.read_pin()
    assert pin.cache_id > 0
    assert len(pin.sha256) == 64
    assert int(pin.sha256, 16) >= 0


def test_has_tiles_wants_the_pinned_tilesets_manifest(tmp_path: Path) -> None:
    pin = tmp_path / "map.json"
    pin.write_text(json.dumps({"cache_id": 2752, "sha256": "0" * 64}))
    client = tmp_path / "map"
    root = client / "2752" / "clean"
    assert not has_tiles(pin, client)
    root.mkdir(parents=True)
    (root / "0").mkdir()
    assert not has_tiles(pin, client)
    (root / "manifest.json").write_text("{}")
    assert has_tiles(pin, client)


def test_has_tiles_ignores_another_caches_tileset(tmp_path: Path) -> None:
    pin = tmp_path / "map.json"
    pin.write_text(json.dumps({"cache_id": 2752, "sha256": "0" * 64}))
    client = tmp_path / "map"
    (client / "2746" / "clean").mkdir(parents=True)
    (client / "2746" / "clean" / "manifest.json").write_text("{}")
    assert not has_tiles(pin, client)
