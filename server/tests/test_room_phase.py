"""A room's phase and its end on both clocks change together, through ``Room`` only. Pure."""

import ast
import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest

from app.rooms.models import Player, Room
from app.rooms.settings import RoomSettings

ROOMS = Path(__file__).resolve().parents[1] / "app" / "rooms"
PHASE_FIELDS = {"phase", "next_at", "next_mono", "reveal_seconds"}
WALL = datetime(2026, 11, 12, 20, 0, tzinfo=UTC)


def _room() -> Room:
    return Room(
        id=uuid4(),
        code="CABBAGE",
        status="playing",
        settings=RoomSettings(),
        current_index=0,
        total=3,
        created_at=WALL,
        expires_at=WALL + timedelta(days=30),
        lock=asyncio.Lock(),
    )


def _player() -> Player:
    return Player(
        id=uuid4(),
        display_name="Zezima",
        role="player",
        joined_at=WALL,
        session_hash="0" * 64,
    )


def _phase_writes(path: Path) -> list[str]:
    """Each assignment in ``path`` to a phase field of anything but ``self``."""
    found = []
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, (ast.AugAssign, ast.AnnAssign)):
            targets = [node.target]
        else:
            continue
        for target in targets:
            for part in ast.walk(target):
                if (
                    isinstance(part, ast.Attribute)
                    and part.attr in PHASE_FIELDS
                    and not (isinstance(part.value, ast.Name) and part.value.id == "self")
                ):
                    found.append(f"{path.name}:{node.lineno} {ast.unparse(part)}")
    return found


@pytest.mark.parametrize("name", ["state.py", "loop.py"])
def test_the_phase_fields_are_written_by_the_room_alone(name) -> None:
    assert _phase_writes(ROOMS / name) == []


def test_the_check_finds_a_loose_write(tmp_path) -> None:
    source = tmp_path / "loose.py"
    source.write_text("room.phase = 'open'\nhold, room.reveal_seconds = 1, 2\n")
    assert _phase_writes(source) == ["loose.py:1 room.phase", "loose.py:2 room.reveal_seconds"]


def _fields(room: Room) -> tuple:
    return (room.phase, room.next_at, room.next_mono, room.reveal_seconds, room.advance.is_set())


def test_enter_walks_a_round_setting_all_five_fields_each_step() -> None:
    room = _room()
    room.advance.set()
    room.enter("idle", now=100.0, wall=WALL)
    assert _fields(room) == ("idle", None, None, None, False)

    room.advance.set()
    room.enter("splash", now=110.0, wall=WALL + timedelta(seconds=10))
    assert _fields(room) == ("splash", None, None, None, False)

    room.advance.set()
    room.enter("open", now=120.0, wall=WALL + timedelta(seconds=20))
    assert _fields(room) == ("open", None, None, None, False)

    room.advance.set()
    room.enter("reveal", seconds=7.5, reveal_seconds=7, now=150.0, wall=WALL)
    assert _fields(room) == ("reveal", WALL + timedelta(seconds=7.5), 157.5, 7, False)

    room.advance.set()
    room.enter("standings", seconds=12, reveal_seconds=9, now=160.0, wall=WALL)
    assert _fields(room) == ("standings", WALL + timedelta(seconds=12), 172.0, None, False)
    assert room.view().reveal_seconds is None


def test_a_reveal_shows_its_countdown_and_the_next_phase_drops_it() -> None:
    room = _room()
    room.enter("reveal", seconds=5, reveal_seconds=5, now=0.0, wall=WALL)
    assert room.view().reveal_seconds == 5
    room.enter("open", now=5.0, wall=WALL)
    assert room.reveal_seconds is None


def test_reschedule_moves_the_end_on_both_clocks_and_clears_both() -> None:
    room = _room()
    room.enter("splash", now=50.0, wall=WALL)
    room.reschedule(60.0, now=50.0, wall=WALL)
    assert (room.next_mono, room.next_at) == (60.0, WALL + timedelta(seconds=10))
    room.reschedule(None, now=55.0, wall=WALL)
    assert (room.next_mono, room.next_at) == (None, None)


def test_clear_deadline_keeps_the_phase() -> None:
    room = _room()
    room.enter("reveal", seconds=5, reveal_seconds=5, now=0.0, wall=WALL)
    room.clear_deadline()
    assert _fields(room) == ("reveal", None, None, 5, False)


def test_reset_ready_clears_every_player_s_ready_check() -> None:
    room = _room()
    for _ in range(2):
        player = _player()
        player.ready = player.unreadied = player.editing = True
        room.players[player.id] = player
    room.reset_ready()
    assert [(p.ready, p.unreadied, p.editing) for p in room.players.values()] == [
        (False, False, False)
    ] * 2
