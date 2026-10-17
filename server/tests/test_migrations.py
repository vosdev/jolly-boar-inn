"""Fresh DB gets all tables; second start is a no-op; migrations are applied
against a throwaway database (the ``test_db_dsn`` fixture, driven by ``DATABASE_URL_TEST``).
"""

import asyncio
import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.db import MIGRATIONS_DIR, MigrationError, create_pool, migration_files, run_migrations
from app.main import create_app
from app.rooms.models import hash_token
from app.rooms.settings import NewRoomSettings, RoomSettings
from tests.rooms_api import fast_settings, next_of

# These apply the migrations themselves, so each starts from a database with none.
pytestmark = pytest.mark.empty_database

# Section 5 of ideas/architecture.md.
TABLES = {
    "schema_migrations": {"version", "applied_at"},
    "rooms": {
        "id",
        "code",
        "status",
        "settings",
        "current_index",
        "created_at",
        "expires_at",
        "finished_at",
        "invite_key",
        "public",
    },
    "players": {
        "id",
        "room_id",
        "display_name",
        "avatar",
        "session_token_hash",
        "role",
        "joined_at",
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
    "daily_stats": {"day", "metric", "key", "count"},
    "suggestions": {
        "id",
        "kind",
        "content",
        "credit",
        "credit_shown",
        "status",
        "created_at",
        "exported_at",
    },
    "reports": {"id", "mode", "question_id", "snapshot", "text", "status", "created_at"},
    "question_edits": {
        "question_id",
        "mode",
        "action",
        "question",
        "before",
        "updated_at",
        "exported_at",
    },
    "roster_edits": {"item_id", "action", "name", "before", "updated_at", "exported_at"},
}
ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
INDEXES = {
    "rooms_code_idx",
    "rooms_expires_at_idx",
    "rooms_finished_at_idx",
    "players_session_idx",
    "players_room_name_idx",
    "answers_player_idx",
    "questions_author_idx",
}
# An applied migration never runs again, so an edit to one reaches a fresh database and no
# existing one. These pin what every deployment has already run.
SHA256 = {
    1: "7688e364db78aef458d8e55084b2087d8b8dbc097268863e48e67929b8d79a44",
    2: "ad5c919f962fc09fee3653437444c5ef3977c5602d8e5f190e244e0dc863133a",
    3: "d0733d31a40a29722161eaf6f5366e37528237266b3daaf81faf78c8f7a9e1ba",
    4: "cf97795fdd41e6b828f055f4be180d925e2029b33064c9606e25c837cb0532cb",
    5: "af8dd452c53482eded317da83c0206727393d26f352509ddf4397f0d342b3a9c",
    6: "bbec7d48543d0b1f22a9802f64e741f10b4a11307b8dfeeb549f30971633fd74",
    7: "60f12c5f4c085d303b469ca979dd0943258568dc02ea2f58d3ea0c8c69595c3f",
    8: "a6ec4722f4118bc7181679896f2715abca78b753ce6920e635846e05432c9ec2",
    9: "43d5a0abf02e2771222f4a21b536341e7d8e672475a67e9aad3597809668f0bb",
    10: "5c9e9836ba4f035d12c2fe365e513e67ba1d57f0a227c6ccf3f11884b7a065dd",
    11: "d8241c7d75ef13fd4b43cdf868980ec80dbf2e011d0ec47250bf3d969e60e835",
    12: "638b6d6735b9f54ea81a8bfa3f6e3caed87a67573efee809d9527665b0bfb7eb",
    13: "f6766fba757244517fa333915db96b8289571df7380e13d97ac88311d0d18cda",
    14: "1f61a4ee46712d37ef745d23b6a3e718ad519f66ac8128f271eedccdfafd60b0",
    15: "8ca843d86d7c0880fc7841a230277c546304faac0391c5bf54076cb653ea0135",
    16: "33f875986bb385d5383631d2396bf5ec5e26e6edc880384f5ad35661e80b2d9d",
    17: "ba2f52276eb9eaeeab21d8e212a2ae68f240f302d7692923621034183fd7378e",
    18: "536c677461ce01f7047f0c71336cf23685775bd71086aedd68e2c536e658f919",
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
    assert [version for version, _ in files] == ALL
    assert [path.name for _, path in files] == [
        "0001_init.sql",
        "0002_drop_admin_tokens.sql",
        "0003_question_rounds.sql",
        "0004_per_mode_rounds.sql",
        "0005_player_avatar.sql",
        "0006_question_mode.sql",
        "0007_random_events.sql",
        "0008_purge_index_drop_unused.sql",
        "0009_room_finished_at.sql",
        "0010_daily_stats.sql",
        "0011_invite_key.sql",
        "0012_public_rooms.sql",
        "0013_suggestions.sql",
        "0014_avatar_pet.sql",
        "0015_reports.sql",
        "0016_question_edits.sql",
        "0017_roster_edits.sql",
        "0018_examine_suggestions.sql",
    ]


def test_applied_migrations_are_unchanged() -> None:
    """Every shipped migration still has the bytes it shipped with."""
    for version, path in migration_files(MIGRATIONS_DIR):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert version in SHA256, f"pin the new {path.name} in SHA256: {digest}"
        assert digest == SHA256[version], (
            f"{path.name} changed after it shipped, and a database that already ran it will"
            " never see the change. Put it back and add a new migration instead."
        )


async def test_fresh_db_gets_all_tables(pool: asyncpg.Pool) -> None:
    """Fresh DB gets all tables (and indexes) from section 5."""
    assert await run_migrations(pool) == ALL
    assert await _columns(pool) == TABLES
    rows = await pool.fetch("select indexname from pg_indexes where schemaname = 'public'")
    assert INDEXES <= {row["indexname"] for row in rows}
    assert await _versions(pool) == ALL


async def test_section_5_constraints_hold(pool: asyncpg.Pool) -> None:
    """The schema is section 5, not just tables with those names."""
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
    """Second start is a no-op."""
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
    with pytest.raises(
        MigrationError, match=r"\[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18\]"
    ):
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
    """Run at startup in lifespan."""
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
        # The old globals, now carried by the one mode that was playing.
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
    assert await run_migrations(pool) == [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    loaded = RoomSettings.model_validate(
        without_the_hold(await pool.fetchval("select settings from rooms where code = 'ABYSSAL'"))
    )
    assert loaded.mode_ids == ["more_less"]
    assert loaded.question_count == 5
    assert loaded.pace == "run"


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
    """0005: players who predate heads come through with ``avatar`` null.

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

    assert await run_migrations(pool) == [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    rows = await pool.fetch("select display_name, avatar from players order by display_name")
    assert [(r["display_name"], r["avatar"]) for r in rows] == [("Woox", None), ("Zezima", None)]


async def test_0014_clears_the_head_a_player_chose_before_pets(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """0014: a head index names a face that is gone, so it becomes "never chosen"."""
    for _, path in migration_files(MIGRATIONS_DIR)[:13]:
        (tmp_path / path.name).write_text(path.read_text())
    assert await run_migrations(pool, tmp_path) == ALL[:13]
    room_id = await pool.fetchval(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('ABYSSAL', 'lobby', $1, now() + interval '1 day') returning id",
        NewRoomSettings().model_dump(),
    )
    await pool.execute(
        "insert into players (room_id, display_name, session_token_hash, role, avatar)"
        " values ($1, 'Zezima', 'h1', 'admin', 7)",
        room_id,
    )

    assert await run_migrations(pool) == [14, 15, 16, 17, 18]
    assert await pool.fetchval("select avatar from players") is None
    await pool.execute("update players set avatar = 'aggy'")
    assert await pool.fetchval("select avatar from players") == "aggy"


async def test_0018_turns_an_examine_suggestion_into_its_question(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """0018: an examine is a Guess the Examine question, the right name first."""
    for _, path in migration_files(MIGRATIONS_DIR)[:17]:
        (tmp_path / path.name).write_text(path.read_text())
    assert await run_migrations(pool, tmp_path) == ALL[:17]
    wiki = "https://oldschool.runescape.wiki/w/Cabbage"
    examines = [
        {"name": "Cabbage", "decoys": ["Onion", "Potato", "Leek"], "prompt": "Yuck.", "wiki": wiki},
        {"name": "Cabbage", "prompt": "Mmm.", "wiki": wiki},
    ]
    await pool.execute(
        "insert into suggestions (kind, content, credit, credit_shown)"
        " values ('item', $1, 'Z', false)",
        {"name": "Cabbage"},
    )
    await pool.executemany(
        "insert into suggestions (kind, content, credit, credit_shown, created_at)"
        " values ('examine', $1, 'Zezima', false, now() + make_interval(secs => $2 + 1))",
        [(content, index) for index, content in enumerate(examines)],
    )

    assert await run_migrations(pool) == [18]
    rows = await pool.fetch("select kind, content from suggestions order by created_at")
    assert [(row["kind"], row["content"]) for row in rows] == [
        ("item", {"name": "Cabbage"}),
        *(
            (
                "question",
                {
                    "type": "multiple_choice",
                    "mode": "guess_examine",
                    "wiki": wiki,
                    "payload": {"prompt": prompt, "options": options, "answer_index": 0},
                },
            )
            for prompt, options in (
                ("Yuck.", ["Cabbage", "Onion", "Potato", "Leek"]),
                ("Mmm.", ["Cabbage"]),
            )
        ),
    ]
    with pytest.raises(asyncpg.CheckViolationError):
        await pool.execute(
            "insert into suggestions (kind, content, credit, credit_shown)"
            " values ('examine', '{}', 'Z', false)"
        )


def test_0006_a_room_from_before_modes_rehydrates_and_plays_to_finished(
    test_db_dsn: str, dist: Path, tmp_path: Path, db
) -> None:
    """0006: a room the previous release was mid-game in when the upgrade restarted it.

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
                fast_settings(max_players=50).model_dump(),
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
            welcome = next_of(ws, "welcome", limit=30)
            assert welcome["room"]["phase"] == "reveal"
            assert welcome["room"]["segment"]["mode"] == "more_less"
            assert welcome["question"] is None
            for index in (1, 2):
                opened = next_of(ws, "question_open", limit=30)["question"]
                assert opened["index"] == index
                assert (opened["type"], opened["mode"]) == ("more_less", "more_less")
                answer = questions[index]["payload"]["answer_index"]
                ws.send_json({"t": "answer", "question_id": opened["question_id"], "value": answer})
                next_of(ws, "answer_ack", limit=30)
                closed = next_of(ws, "question_closed", limit=30)
                assert closed["results"][welcome["you"]["id"]]["correct"]
            finished = next_of(ws, "game_finished", limit=30)

    assert finished["standings"][0]["points"] > 0
    assert db("select status from rooms")[0]["status"] == "finished"
    assert [row["voided"] for row in db("select voided from questions order by position")] == [
        True,
        False,
        False,
    ]


def without_the_hold(settings: dict[str, Any]) -> dict[str, Any]:
    """A stored room's settings less ``random_event_seconds``, which 0007 wrote into every
    room and which stopped being a setting when the hold became the server's, and
    ``splash_seconds``, which stopped when every round became introduced, and the reveal's
    and each round's ``seconds``, which stopped when a question's type began timing it. The
    app's ``RoomSettings.stored`` drops them; these tests read strictly, so a key a
    migration should have removed still fails them."""
    gone = {"random_event_seconds", "splash_seconds", "reveal_seconds"}
    kept = {k: v for k, v in settings.items() if k not in gone}
    kept["modes"] = [{k: v for k, v in m.items() if k != "seconds"} for m in kept["modes"]]
    return kept


async def test_0007_swaps_order_for_the_event_settings_once(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """0007: ``order`` goes, ``random_events`` and ``random_event_seconds`` arrive.

    A room from before it had no pack question placed as an event and never will, so it
    says ``random_events: false``. A room created after it already has both fields, and
    running the rewrite again leaves it alone.
    """
    for _, path in migration_files(MIGRATIONS_DIR)[:6]:
        (tmp_path / path.name).write_text(path.read_text())
    assert await run_migrations(pool, tmp_path) == [1, 2, 3, 4, 5, 6]
    before = {**fast_settings().model_dump(), "order": "custom_last"}
    del before["random_event_frequency"]
    await pool.execute(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('ABYSSAL', 'lobby', $1, now() + interval '1 day')",
        before,
    )

    assert await run_migrations(pool) == [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    after = await pool.fetchval("select settings from rooms where code = 'ABYSSAL'")
    expected = {k: v for k, v in before.items() if k != "order"}
    assert after == {**expected, "random_events": False, "random_event_seconds": 2}
    # Now that reads as "the host's questions only", which is what it always meant.
    assert RoomSettings.model_validate(without_the_hold(after)).random_event_frequency is None

    # As 0007 wrote it; the flag has since become a frequency, which 0007 never looks at.
    created_after = {
        **{
            k: v for k, v in NewRoomSettings().model_dump().items() if k != "random_event_frequency"
        },
        "random_events": True,
    }
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
    """0007: a room made while the host's questions were still a round of their own.

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
        # The migration is the subject, not the splashes.
        client.app.state.rooms.splashes = False
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
            host_id = next_of(host, "welcome", limit=30)["you"]["id"]
            player.send_json({"t": "hello", "session": player_session})
            player_id = next_of(player, "welcome", limit=30)["you"]["id"]
            host.send_json({"t": "start_game"})
            for index, question in enumerate(questions):
                seen = {
                    name: next_of(ws, "question_open", limit=30)["question"]
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
                    assert next_of(host, "error", limit=30)["code"] == "excluded"
                else:
                    next_of(host, "answer_ack", limit=30)
                next_of(player, "answer_ack", limit=30)
                results = next_of(host, "question_closed", limit=30)["results"]
                next_of(player, "question_closed", limit=30)
                assert set(results) == ({player_id} if own else {host_id, player_id})
                if index == 1:
                    # Stored before ``standings_seconds`` existed, it reads as the
                    # default, and the first round ends in standings the host can skip.
                    update = next_of(host, "room_updated", limit=30)
                    while update["room"]["phase"] != "standings":
                        update = next_of(host, "room_updated", limit=30)
                    assert update["room"]["settings"]["standings_seconds"] == 10
                    index = update["room"]["current_index"]
                    host.send_json({"t": "skip", "phase": "standings", "index": index})
            finished = next_of(host, "game_finished", limit=30)

    points = {s["display_name"]: s["points"] for s in finished["standings"]}
    assert points["Woox"] > points["Zezima"] > 0
    rows = db(
        "select q.position, a.player_id from answers a join questions q on q.id = a.question_id"
    )
    assert sorted((row["position"], str(row["player_id"])) for row in rows) == sorted(
        [(0, host_id), (0, player_id), (1, host_id), (1, player_id), (2, player_id), (3, player_id)]
    )


async def test_0009_dates_a_room_finished_before_it_from_its_last_close(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """0009: a finished room ended when its last question closed; others stay unfinished.

    Without a closed question it falls back to the last ``shown_at``, then to creation.
    """
    for _, path in migration_files(MIGRATIONS_DIR)[:8]:
        (tmp_path / path.name).write_text(path.read_text())
    assert await run_migrations(pool, tmp_path) == [1, 2, 3, 4, 5, 6, 7, 8]
    settings = NewRoomSettings().model_dump()
    last_close = datetime(2026, 9, 1, 20, 15, tzinfo=UTC)
    shown = datetime(2026, 9, 2, 20, 0, tzinfo=UTC)
    created = datetime(2026, 9, 3, 19, 0, tzinfo=UTC)
    ids = {}
    for code, status in [
        ("CLOSED", "finished"),
        ("SHOWN", "finished"),
        ("BARE", "finished"),
        ("PLAYING", "playing"),
    ]:
        ids[code] = await pool.fetchval(
            "insert into rooms (code, status, settings, created_at, expires_at)"
            " values ($1, $2, $3, $4, now() + interval '1 day') returning id",
            code,
            status,
            settings,
            created,
        )
    questions = [
        ("CLOSED", 0, last_close - timedelta(minutes=1), last_close - timedelta(seconds=30)),
        ("CLOSED", 1, last_close - timedelta(seconds=20), last_close),
        ("SHOWN", 0, shown, None),
        ("PLAYING", 0, shown, shown),
    ]
    for code, position, shown_at, closed_at in questions:
        await pool.execute(
            "insert into questions (room_id, position, question_id, type, mode, source,"
            " payload, round, shown_at, closed_at)"
            " values ($1, $2, 'q', 'more_less', 'more_less', 'pack', '{}', 0, $3, $4)",
            ids[code],
            position,
            shown_at,
            closed_at,
        )

    assert await run_migrations(pool) == [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    rows = await pool.fetch("select code, finished_at from rooms")
    assert {row["code"]: row["finished_at"] for row in rows} == {
        "CLOSED": last_close,
        "SHOWN": shown,
        "BARE": created,
        "PLAYING": None,
    }


async def test_0011_leaves_a_room_from_before_it_without_a_key(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """A room created before invite links takes anyone with its code, as it did."""
    for _, path in migration_files(MIGRATIONS_DIR)[:10]:
        (tmp_path / path.name).write_text(path.read_text())
    assert await run_migrations(pool, tmp_path) == ALL[:10]
    await pool.execute(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('ABYSSAL', 'lobby', $1, now() + interval '1 day')",
        NewRoomSettings().model_dump(),
    )
    assert await run_migrations(pool) == [11, 12, 13, 14, 15, 16, 17, 18]
    assert await pool.fetchval("select invite_key from rooms where code = 'ABYSSAL'") is None


async def test_0012_leaves_a_room_from_before_it_unlisted(
    pool: asyncpg.Pool, tmp_path: Path
) -> None:
    """A room created before public lobbies stays off Home's list."""
    for _, path in migration_files(MIGRATIONS_DIR)[:11]:
        (tmp_path / path.name).write_text(path.read_text())
    assert await run_migrations(pool, tmp_path) == ALL[:11]
    await pool.execute(
        "insert into rooms (code, status, settings, expires_at)"
        " values ('ABYSSAL', 'lobby', $1, now() + interval '1 day')",
        NewRoomSettings().model_dump(),
    )
    assert await run_migrations(pool) == [12, 13, 14, 15, 16, 17, 18]
    assert await pool.fetchval("select public from rooms where code = 'ABYSSAL'") is False


async def test_0013_holds_a_suggestion_to_its_kinds_and_statuses(pool: asyncpg.Pool) -> None:
    await run_migrations(pool)
    insert = (
        "insert into suggestions (kind, content, credit, credit_shown, status)"
        " values ($1, '{}'::jsonb, 'Woox', false, $2)"
    )
    await pool.execute(insert, "item", "pending")
    for kind, status in (("riddle", "pending"), ("item", "exported")):
        with pytest.raises(asyncpg.CheckViolationError):
            await pool.execute(insert, kind, status)
    row = await pool.fetchrow("select status, exported_at, created_at from suggestions")
    assert (row["status"], row["exported_at"]) == ("pending", None)
    assert row["created_at"] is not None
