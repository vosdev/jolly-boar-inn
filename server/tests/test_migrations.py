"""T3 Accept: fresh DB gets all tables; second start is a no-op; migrations are applied
against a throwaway database (the ``test_db_dsn`` fixture, driven by ``DATABASE_URL_TEST``).
"""

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import asyncpg
import pytest
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession

from app.config import REPO_ROOT, Settings
from app.db import MIGRATIONS_DIR, MigrationError, create_pool, migration_files, run_migrations
from app.main import create_app
from app.rooms.settings import NewRoomSettings, RoomSettings
from app.rooms.state import hash_token
from tests.rooms_api import fast_settings

# Section 5 of ideas/architecture.md.
TABLES = {
    "schema_migrations": {"version", "applied_at"},
    "rooms": {
        "id",
        "code",
        "status",
        "settings",
        "current_index",
        "creator_ip",
        "created_at",
        "expires_at",
    },
    "players": {
        "id",
        "room_id",
        "display_name",
        "avatar",
        "session_token_hash",
        "role",
        "joined_at",
        "last_seen_at",
    },
    "questions": {
        "id",
        "room_id",
        "position",
        "question_id",
        "type",
        "mode",
        "source",
        "payload",
        "host_only",
        "round",
        "random_event",
        "author_player_id",
        "shown_at",
        "closed_at",
        "voided",
    },
    "answers": {"id", "question_id", "player_id", "value", "received_at", "correct", "points"},
}
ALL = [1, 2, 3, 4, 5, 6, 7]
INDEXES = {
    "rooms_code_idx",
    "rooms_expires_at_idx",
    "players_session_idx",
    "players_room_name_idx",
    "answers_player_idx",
}


async def _columns(pool: asyncpg.Pool) -> dict[str, set[str]]:
    rows = await pool.fetch(
        "select table_name, column_name from information_schema.columns"
        " where table_schema = 'public'"
    )
    out: dict[str, set[str]] = {}
    for row in rows:
        out.setdefault(row["table_name"], set()).add(row["column_name"])
    return out


async def _versions(pool: asyncpg.Pool) -> list[int]:
    rows = await pool.fetch("select version from schema_migrations order by version")
    return [row["version"] for row in rows]


@pytest.fixture
async def pool(test_db_dsn: str):
    pool = await create_pool(test_db_dsn)
    try:
        yield pool
    finally:
        await pool.close()


def test_migration_files_are_numbered_and_ordered() -> None:
    files = migration_files(MIGRATIONS_DIR)
    assert [version for version, _ in files] == [1, 2, 3, 4, 5, 6, 7]
    assert [path.name for _, path in files] == [
        "0001_init.sql",
        "0002_drop_admin_tokens.sql",
        "0003_question_rounds.sql",
        "0004_per_mode_rounds.sql",
        "0005_player_avatar.sql",
        "0006_question_mode.sql",
        "0007_random_events.sql",
    ]


async def test_fresh_db_gets_all_tables(pool: asyncpg.Pool) -> None:
    """T3: fresh DB gets all tables (and indexes) from section 5."""
    assert await run_migrations(pool) == ALL
    assert await _columns(pool) == TABLES
    rows = await pool.fetch("select indexname from pg_indexes where schemaname = 'public'")
    assert INDEXES <= {row["indexname"] for row in rows}
    assert await _versions(pool) == ALL


async def test_section_5_constraints_hold(pool: asyncpg.Pool) -> None:
    """T3: the schema is section 5, not just tables with those names."""
    await run_migrations(pool)
    with pytest.raises(asyncpg.CheckViolationError):
        await pool.execute(
            "insert into rooms (code, status, settings, expires_at)"
            " values ('ABYSSAL', 'bogus', '{}', now())"
        )
    with pytest.raises(asyncpg.CheckViolationError):  # 0002: no unclaimed rooms any more
        await pool.execute(
            "insert into rooms (code, status, settings, expires_at)"
            " values ('ABYSSAL', 'created', '{}', now())"
        )
    # And exactly one check on the table, so 0002 replaced the old constraint rather
    # than adding a second one beside it under a name that did not match.
    checks = await pool.fetchval(
        "select count(*) from pg_constraint where conrelid = 'rooms'::regclass and contype = 'c'"
    )
    assert checks == 1
    await pool.execute(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('ABYSSAL', 'lobby', '{}', now())"
    )
    with pytest.raises(asyncpg.UniqueViolationError):
        await pool.execute(
            "insert into rooms (code, status, settings, expires_at)"
            " values ('ABYSSAL', 'lobby', '{}', now())"
        )
    room_id = await pool.fetchval("select id from rooms")
    await pool.execute(
        "insert into players (room_id, display_name, session_token_hash)"
        " values ($1, 'Zezima', 'h1')",
        room_id,
    )
    with pytest.raises(asyncpg.UniqueViolationError):  # case-insensitive unique name per room
        await pool.execute(
            "insert into players (room_id, display_name, session_token_hash)"
            " values ($1, 'zezima', 'h2')",
            room_id,
        )
    await pool.execute("delete from rooms")
    assert await pool.fetchval("select count(*) from players") == 0  # cascade


async def test_second_start_is_noop(pool: asyncpg.Pool) -> None:
    """T3: second start is a no-op."""
    assert await run_migrations(pool) == ALL
    before = await pool.fetch("select version, applied_at from schema_migrations")
    assert await run_migrations(pool) == []
    after = await pool.fetch("select version, applied_at from schema_migrations")
    assert [tuple(r) for r in after] == [tuple(r) for r in before]
    assert await _columns(pool) == TABLES


async def test_recorded_migration_missing_from_disk_refuses(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """db.py contract: refuse to start if a recorded migration file is missing."""
    await run_migrations(pool)
    with pytest.raises(MigrationError, match=r"\[1, 2, 3, 4, 5, 6, 7\]"):
        await run_migrations(pool, tmp_path)


async def test_lexical_order_and_one_transaction_per_file(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """db.py contract: lexical order, each file in one transaction, failures stop the run."""
    (tmp_path / "0002_b.sql").write_text("create table b (a_id int references a (id));")
    (tmp_path / "0001_a.sql").write_text("create table a (id int primary key);")
    (tmp_path / "0003_bad.sql").write_text("create table c (id int); insert into c values ('x');")
    with pytest.raises(MigrationError, match="0003_bad.sql"):
        await run_migrations(pool, tmp_path)
    assert set(await _columns(pool)) == {"schema_migrations", "a", "b"}
    assert await _versions(pool) == [1, 2]


def test_lifespan_runs_migrations(test_db_dsn: str, dist: Path) -> None:
    """T3: run at startup in lifespan."""
    settings = Settings(_env_file=None, database_url=test_db_dsn)
    with TestClient(create_app(settings, dist)) as client:
        assert client.get("/api/health").json() == {"ok": True, "db": True}

    async def columns() -> dict[str, set[str]]:
        pool = await create_pool(test_db_dsn)
        try:
            return await _columns(pool)
        finally:
            await pool.close()

    assert asyncio.run(columns()) == TABLES


async def test_0004_rewrites_a_room_created_before_per_mode_rounds(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """0004: an existing room's global settings become per-mode ones, and it still loads.

    The room is inserted with only 0001..0003 applied, which is what a room created by
    the previous release looks like, and then 0004 runs on top of it.
    """
    for _, path in migration_files(MIGRATIONS_DIR)[:3]:
        (tmp_path / path.name).write_text(path.read_text())
    assert await run_migrations(pool, tmp_path) == [1, 2, 3]
    old = {
        "question_seconds": 45,
        "question_count": 20,
        "questions_per_round": 5,
        "modes": ["more_less"],
        "order": "shuffle",
        "reveal_seconds": 8,
        "splash_seconds": 8,
        "close_when_all_answered": True,
        "max_players": 50,
    }
    await pool.execute(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('ABYSSAL', 'playing', $1, now() + interval '1 day')",
        old,
    )

    fourth = migration_files(MIGRATIONS_DIR)[3][1]
    (tmp_path / fourth.name).write_text(fourth.read_text())
    assert await run_migrations(pool, tmp_path) == [4]

    settings = await pool.fetchval("select settings from rooms where code = 'ABYSSAL'")
    assert settings == {
        # The old globals, now carried by the one mode that was playing. 45 seconds is
        # more than ``more_less`` allows today, which is what ``seconds_for`` clamps.
        "modes": [{"mode": "more_less", "questions": 5, "seconds": 45}],
        "mode_order": "listed",
        "order": "shuffle",
        "reveal_seconds": 8,
        "splash_seconds": 8,
        "close_when_all_answered": True,
        "max_players": 50,
    }
    # Loaded by today's model once the migrations after it have run too, which is what
    # the room meets on its way back into a release: 0007 is where ``order`` went.
    assert await run_migrations(pool) == [5, 6, 7]
    loaded = RoomSettings.model_validate(
        await pool.fetchval("select settings from rooms where code = 'ABYSSAL'")
    )
    assert loaded.mode_ids == ["more_less"]
    assert loaded.question_count == 5
    assert loaded.seconds_for("more_less") == 20  # the type's maximum, not the stored 45


async def test_0004_leaves_a_room_created_after_it_alone(pool: asyncpg.Pool) -> None:
    """The rewrite is keyed on the old fields, so running it twice changes nothing."""
    await run_migrations(pool)
    settings = NewRoomSettings().model_dump()
    await pool.execute(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('ABYSSAL', 'lobby', $1, now() + interval '1 day')",
        settings,
    )
    await pool.execute("delete from schema_migrations where version = 4")
    assert await run_migrations(pool) == [4]
    stored = await pool.fetchval("select settings from rooms where code = 'ABYSSAL'")
    assert stored == settings


async def test_0005_gives_a_room_from_before_heads_players_with_no_avatar(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """0005 (D4): players who predate heads come through with ``avatar`` null.

    Null is "never chosen", which the client draws as the head derived from the player's
    id -- so a room from before the migration still shows a head for everyone, and a
    spread of them rather than fifty copies of head 0.
    """
    for _, path in migration_files(MIGRATIONS_DIR)[:4]:
        (tmp_path / path.name).write_text(path.read_text())
    assert await run_migrations(pool, tmp_path) == [1, 2, 3, 4]
    room_id = await pool.fetchval(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('ABYSSAL', 'playing', $1, now() + interval '1 day') returning id",
        NewRoomSettings().model_dump(),
    )
    await pool.execute(
        "insert into players (room_id, display_name, session_token_hash, role)"
        " values ($1, 'Zezima', 'h1', 'admin'), ($1, 'Woox', 'h2', 'player')",
        room_id,
    )

    assert await run_migrations(pool) == [5, 6, 7]
    rows = await pool.fetch("select display_name, avatar from players order by display_name")
    assert [(r["display_name"], r["avatar"]) for r in rows] == [("Woox", None), ("Zezima", None)]
    with pytest.raises(asyncpg.CheckViolationError):
        await pool.execute("update players set avatar = -1 where display_name = 'Woox'")
    await pool.execute("update players set avatar = 49 where display_name = 'Woox'")


def _take(ws: WebSocketTestSession, kind: str) -> dict[str, Any]:
    """The next message of type ``kind``, skipping whatever comes first."""
    for _ in range(30):
        message = ws.receive_json()
        if message["t"] == kind:
            return message
    raise AssertionError(f"never got {kind}")


def test_0006_a_room_from_before_modes_rehydrates_and_plays_to_finished(
    test_db_dsn: str, dist: Path, tmp_path: Path, db
) -> None:
    """0006 (T16): a room the previous release was mid-game in when the upgrade restarted it.

    Its rows are written on 0001..0005 the way that release wrote them -- no ``mode``
    anywhere, question 0 open when the process went down -- and then an app starts on the
    database, which applies 0006 in its lifespan. Every row comes out ``mode = type``, the
    rehydrate reads the new column, recovery voids the question that was open, and the
    room plays the two it still owes through to ``finished``, grading both answers.
    """
    session = "a-session-from-the-previous-release"
    pack = json.loads((REPO_ROOT / "data" / "packs" / "prices.json").read_text())
    questions = pack["questions"][:3]
    for _, path in migration_files(MIGRATIONS_DIR)[:5]:
        (tmp_path / path.name).write_text(path.read_text())

    async def previous_release() -> None:
        pool = await create_pool(test_db_dsn)
        try:
            assert await run_migrations(pool, tmp_path) == [1, 2, 3, 4, 5]
            room_id = await pool.fetchval(
                "insert into rooms (code, status, settings, current_index, expires_at)"
                " values ('ABYSSAL', 'playing', $1, 0, now() + interval '1 day') returning id",
                fast_settings(seconds=10, max_players=50).model_dump(),
            )
            await pool.execute(
                "insert into players (room_id, display_name, session_token_hash, role)"
                " values ($1, 'Zezima', $2, 'admin')",
                room_id,
                hash_token(session),
            )
            await pool.executemany(
                "insert into questions"
                " (room_id, position, question_id, type, source, payload, round, shown_at)"
                " values ($1, $2, $3, $4, 'pack', $5, 0, $6)",
                [
                    (
                        room_id,
                        position,
                        q["id"],
                        q["type"],
                        {"payload": q["payload"], "tags": q["tags"]},
                        datetime.now(UTC) if position == 0 else None,
                    )
                    for position, q in enumerate(questions)
                ],
            )
        finally:
            await pool.close()

    asyncio.run(previous_release())
    settings = Settings(
        _env_file=None, database_url=test_db_dsn, packs_dir=REPO_ROOT / "data" / "packs"
    )
    with TestClient(create_app(settings, dist)) as client:
        versions = db("select version from schema_migrations order by version")
        assert [row["version"] for row in versions] == ALL
        rows = db("select type, mode from questions order by position")
        assert [(row["type"], row["mode"]) for row in rows] == [("more_less", "more_less")] * 3

        with client.websocket_connect("/ws/ABYSSAL") as ws:
            ws.send_json({"t": "hello", "session": session})
            welcome = _take(ws, "welcome")
            assert welcome["room"]["phase"] == "reveal"
            assert welcome["room"]["segment"]["mode"] == "more_less"
            assert welcome["question"] is None
            for index in (1, 2):
                opened = _take(ws, "question_open")["question"]
                assert opened["index"] == index
                assert (opened["type"], opened["mode"]) == ("more_less", "more_less")
                answer = questions[index]["payload"]["answer_index"]
                ws.send_json({"t": "answer", "question_id": opened["question_id"], "value": answer})
                _take(ws, "answer_ack")
                assert _take(ws, "question_closed")["results"][welcome["you"]["id"]]["correct"]
            finished = _take(ws, "game_finished")

    assert finished["standings"][0]["points"] > 0
    assert db("select status from rooms")[0]["status"] == "finished"
    assert [row["voided"] for row in db("select voided from questions order by position")] == [
        True,
        False,
        False,
    ]


async def test_0007_swaps_order_for_the_event_settings_once(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """0007 (T21): ``order`` goes, ``random_events`` and ``random_event_seconds`` arrive.

    A room from before it had no pack question placed as an event and never will, so it
    says ``random_events: false``. A room created after it already has both fields, and
    running the rewrite again leaves it alone.
    """
    for _, path in migration_files(MIGRATIONS_DIR)[:6]:
        (tmp_path / path.name).write_text(path.read_text())
    assert await run_migrations(pool, tmp_path) == [1, 2, 3, 4, 5, 6]
    before = {**fast_settings().model_dump(), "order": "custom_last"}
    del before["random_events"], before["random_event_seconds"]
    await pool.execute(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('ABYSSAL', 'lobby', $1, now() + interval '1 day')",
        before,
    )

    assert await run_migrations(pool) == [7]
    after = await pool.fetchval("select settings from rooms where code = 'ABYSSAL'")
    expected = {k: v for k, v in before.items() if k != "order"}
    assert after == {**expected, "random_events": False, "random_event_seconds": 2}
    assert RoomSettings.model_validate(after).random_events is False

    created_after = NewRoomSettings().model_dump()
    await pool.execute(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('BARROWS', 'lobby', $1, now() + interval '1 day')",
        created_after,
    )
    await pool.execute("delete from schema_migrations where version = 7")
    await pool.execute("alter table questions drop column random_event")
    assert await run_migrations(pool) == [7]
    stored = await pool.fetchval("select settings from rooms where code = 'BARROWS'")
    assert stored == created_after
    assert stored["random_events"] is True


def test_0007_a_room_from_before_events_plays_its_custom_round_unchanged(
    test_db_dsn: str, dist: Path, tmp_path: Path, db
) -> None:
    """0007 (T21): a room made while the host's questions were still a round of their own.

    Its rows are written on 0001..0006 the way the previous release wrote them: a round of
    pack questions, then a trailing round of the host's own (``order: custom_last``), and
    settings that still say so. An app then starts on the database and applies 0007. The
    settings lose ``order``; the rows are not touched, so the custom round is still a round
    -- its own segment, after the pack one, events nowhere -- and it plays that way, with
    its author kept out of it as before.
    """
    host_session, player_session = "host-from-before-events", "player-from-before-events"
    pack = json.loads((REPO_ROOT / "data" / "packs" / "prices.json").read_text())
    questions = [q for q in pack["questions"] if q["mode"] == "more_less"][:4]
    for _, path in migration_files(MIGRATIONS_DIR)[:6]:
        (tmp_path / path.name).write_text(path.read_text())
    old_settings = {
        "modes": [{"mode": "more_less", "questions": 2, "seconds": 10}],
        "mode_order": "listed",
        "order": "custom_last",
        "reveal_seconds": 1,
        "splash_seconds": 0,
        "close_when_all_answered": True,
        "max_players": 50,
    }

    async def previous_release() -> None:
        pool = await create_pool(test_db_dsn)
        try:
            assert await run_migrations(pool, tmp_path) == [1, 2, 3, 4, 5, 6]
            room_id = await pool.fetchval(
                "insert into rooms (code, status, settings, expires_at)"
                " values ('ABYSSAL', 'lobby', $1, now() + interval '1 day') returning id",
                old_settings,
            )
            host = await pool.fetchval(
                "insert into players (room_id, display_name, session_token_hash, role)"
                " values ($1, 'Zezima', $2, 'admin') returning id",
                room_id,
                hash_token(host_session),
            )
            await pool.execute(
                "insert into players (room_id, display_name, session_token_hash)"
                " values ($1, 'Woox', $2)",
                room_id,
                hash_token(player_session),
            )
            await pool.executemany(
                "insert into questions (room_id, position, question_id, type, mode, source,"
                " payload, round, author_player_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                [
                    (
                        room_id,
                        position,
                        q["id"],
                        q["type"],
                        "more_less" if position < 2 else "custom",
                        "pack" if position < 2 else "room",
                        {"payload": q["payload"], "tags": q["tags"]},
                        0 if position < 2 else 1,
                        None if position < 2 else host,
                    )
                    for position, q in enumerate(questions)
                ],
            )
        finally:
            await pool.close()

    asyncio.run(previous_release())
    settings = Settings(
        _env_file=None, database_url=test_db_dsn, packs_dir=REPO_ROOT / "data" / "packs"
    )
    with TestClient(create_app(settings, dist)) as client:
        assert [row["version"] for row in db("select version from schema_migrations")] == ALL
        (row,) = db("select settings from rooms")
        assert "order" not in row["settings"]
        assert row["settings"]["random_events"] is False
        rows = db("select random_event from questions order by position")
        assert [row["random_event"] for row in rows] == [None] * 4

        with (
            client.websocket_connect("/ws/ABYSSAL") as host,
            client.websocket_connect("/ws/ABYSSAL") as player,
        ):
            host.send_json({"t": "hello", "session": host_session})
            host_id = _take(host, "welcome")["you"]["id"]
            player.send_json({"t": "hello", "session": player_session})
            player_id = _take(player, "welcome")["you"]["id"]
            host.send_json({"t": "start_game"})
            for index, question in enumerate(questions):
                seen = {
                    name: _take(ws, "question_open")["question"]
                    for name, ws in (("host", host), ("player", player))
                }
                opened = seen["player"]
                segment = opened["segment"]
                own = index >= 2
                assert opened["index"] == index
                assert opened["mode"] == ("custom" if own else "more_less")
                assert (segment["mode"], segment["index"], segment["total"]) == (
                    ("custom", 1, 2) if own else ("more_less", 0, 2)
                )
                assert (segment["start"], segment["count"]) == ((2, 2) if own else (0, 2))
                assert seen["host"]["you_can_answer"] is not own
                answer = question["payload"]["answer_index"]
                for ws in (host, player):
                    ws.send_json(
                        {"t": "answer", "question_id": opened["question_id"], "value": answer}
                    )
                if own:
                    assert _take(host, "error")["code"] == "excluded"
                else:
                    _take(host, "answer_ack")
                _take(player, "answer_ack")
                results = _take(host, "question_closed")["results"]
                _take(player, "question_closed")
                assert set(results) == ({player_id} if own else {host_id, player_id})
            finished = _take(host, "game_finished")

    points = {s["display_name"]: s["points"] for s in finished["standings"]}
    assert points["Woox"] > points["Zezima"] > 0
    rows = db(
        "select q.position, a.player_id from answers a join questions q on q.id = a.question_id"
    )
    assert sorted((row["position"], str(row["player_id"])) for row in rows) == sorted(
        [(0, host_id), (0, player_id), (1, host_id), (1, player_id), (2, player_id), (3, player_id)]
    )
