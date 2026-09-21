"""D4 Accept: the manifest, and the client half of heads.

The manifest is a contract (section 5.2): ids are positions, every file exists, and there
are enough heads for a full room. Every head is a square PNG whose side divides both
sizes it is drawn at, which is what "crisp, not blurred, at 32px and 48px" is made of once
``image-rendering: pixelated`` is on.

The rest, like ``test_app_shell.py``, reads the client rather than rendering it: one
``avatar ?? derived`` rule, drawn from one sheet, at the sizes section 5.2 names.

What a browser confirmed, and a test here cannot: two browsers on two origins draw the
same head for the same player in the lobby and on the standings; a re-roll and a rename in
one reach the other at the next ``room_updated``; a name taken in the room is answered in
the popover and the old name stays; join-first lands a browser with no profile in the
lobby with the chip nudging; a room whose host sent no ``avatar`` shows the same derived
head in every browser; at 320px the lobby and the standings do not scroll sideways.
"""

import json
import re
import struct
from pathlib import Path

import pytest

from app.config import REPO_ROOT, Settings
from app.heads import HEADS_DIR, MANIFEST, load_head_count

CLIENT = REPO_ROOT / "client"
CLIENT_SRC = CLIENT / "src"
# Section 5.2: 32px in the top bar and the lobby, 48px on the standings.
SIZES = (32, 48)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{path.name} is not a PNG"
    assert data[12:16] == b"IHDR"
    width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", data[16:29])
    # What ``heads-sprite.ts`` decodes: non-interlaced, 8-bit (or a small palette).
    assert interlace == 0, f"{path.name} is interlaced"
    assert depth == 8 or (colour == 3 and depth in (1, 2, 4)), f"{path.name} is {depth}-bit"
    return width, height


# --- the manifest --------------------------------------------------------------------


def test_there_are_enough_heads_for_a_full_room() -> None:
    assert load_head_count() >= Settings(_env_file=None).max_players_per_room


def test_ids_are_positions_and_files_are_numbered_to_match() -> None:
    heads = json.loads(read(MANIFEST))
    for index, head in enumerate(heads):
        assert head["id"] == index
        assert head["file"].startswith(f"{index:03d}-")
        assert (HEADS_DIR / head["file"]).is_file()


def test_every_file_in_the_directory_is_in_the_manifest() -> None:
    """A head dropped in without an id is a head nobody can wear."""
    listed = {head["file"] for head in json.loads(read(MANIFEST))}
    on_disk = {path.name for path in HEADS_DIR.glob("*.png")}
    assert on_disk == listed


def test_every_head_is_crisp_at_both_sizes() -> None:
    """Square, and a whole number of screen pixels per art pixel at 32 and at 48."""
    for head in json.loads(read(MANIFEST)):
        width, height = png_size(HEADS_DIR / head["file"])
        assert width == height, f"{head['file']} is {width}x{height}"
        for size in SIZES:
            assert size % width == 0, f"{head['file']} is {width}px, which {size}px is not"


@pytest.mark.parametrize(
    ("entry", "problem"),
    [
        ({"id": 1, "file": "000-a.png", "name": "A"}, "ids are positions"),
        ({"id": 0, "file": "001-a.png", "name": "A"}, "000-<slug>.png"),
        ({"id": 0, "file": "000-gone.png", "name": "A"}, "missing file"),
        ({"id": 0, "file": "000-a.png"}, "exactly"),
    ],
)
def test_a_broken_manifest_stops_the_server(tmp_path: Path, entry: dict, problem: str) -> None:
    (tmp_path / "000-a.png").write_bytes(b"")
    (tmp_path / "001-a.png").write_bytes(b"")
    manifest = tmp_path / "heads.json"
    manifest.write_text(json.dumps([entry]))
    with pytest.raises(ValueError, match=re.escape(problem)):
        load_head_count(manifest)


# --- the client ----------------------------------------------------------------------


def test_one_rule_decides_every_head() -> None:
    """``avatar ?? derived(id)``, in one place, and every screen goes through it."""
    heads = read(CLIENT_SRC / "lib" / "heads.ts")
    assert "export function headOf(" in heads
    assert "derivedHead(player.id)" in heads
    for screen in ("Lobby.svelte", "Scoreboard.svelte", "IdentityChip.svelte"):
        source = read(CLIENT_SRC / "components" / screen)
        assert "<Head " in source, screen
        assert "headOf(" in source, screen


def test_heads_are_drawn_at_the_sizes_section_5_2_names() -> None:
    components = CLIENT_SRC / "components"
    assert "size={32}" in read(components / "Lobby.svelte")
    assert "size={48}" in read(components / "Scoreboard.svelte")
    assert "size={32}" in read(components / "IdentityChip.svelte")


def test_heads_are_pixelated_and_come_from_one_sheet() -> None:
    head = read(CLIENT_SRC / "components" / "Head.svelte")
    assert "image-rendering: pixelated" in head
    assert "from 'virtual:heads'" in head
    # The fifty files never reach the page one by one.
    imports_a_head = re.compile(r"""(from|import\()\s*['"][^'"]*data/heads""")
    for path in CLIENT_SRC.rglob("*"):
        if path.is_file() and path.suffix in {".svelte", ".ts"}:
            assert imports_a_head.search(read(path)) is None, path
    assert "headsSprite()" in read(CLIENT / "vite.config.ts")


def test_join_is_join_first_and_create_still_asks() -> None:
    """Section 5.1.1: option B on Join now that ``set_profile`` exists; Create keeps A."""
    join = read(CLIENT_SRC / "routes" / "Join.svelte")
    assert "NamePrompt" not in join
    assert "nudge.set(code)" in join
    assert "<NamePrompt" in read(CLIENT_SRC / "routes" / "Create.svelte")


def test_the_protocol_mirror_has_set_profile() -> None:
    protocol = read(CLIENT_SRC / "lib" / "protocol.ts")
    assert "t: 'set_profile'" in protocol
    assert "avatar?: number | null" in protocol
    for code in ("bad_name", "name_taken", "bad_avatar"):
        assert f"'{code}'" in protocol
