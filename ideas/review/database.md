# Database review

I read CLAUDE.md, all of ideas/architecture.md, the seven migrations and their git history, `db.py`, `main.py`, every SQL call in `server/app` (they are all in `state.py`, `db.py` and `main.py`), `settings.py`, the ws handler, and `conftest.py`, `test_migrations.py` and `test_cleanup.py`. I did not run Postgres, so I have no EXPLAIN output. The purge timings in DB-1 are estimates from row sizes (mean stored envelope: 373 bytes over the 315 shipped questions). I checked asyncpg's timeout and idle-connection behaviour in its installed source (0.31).

These are fine and need no change:
- Each migration was added in one commit and never edited (`git log --name-status`).
- The database already enforces unique names per room (`players_room_name_idx`) and one answer per player per question (`answers` unique). No code path can remove the last admin: there is no demote, and admins cannot be kicked.
- Every lookup the code makes is indexed: by code, by `room_id` (as the leading column of existing indexes), by `(question_id, player_id)`, and by `expires_at`. Session lookups happen in memory.
- Multi-statement writes (create, close, end_game) run in transactions. Cancellation only happens at shutdown, where the rolled-back close is exactly the case restart recovery voids.
- The schema is ready for ordering and pick all that apply. `answers.value` is jsonb and holds arrays. `correct` = full credit, and `points` is an int. Partial credit goes out once with the reveal, and nothing reads it back (a deliberate choice, in the `Submitted` docstring). `questions.type` is stored per row, so several types per mode (ENG-6 / TM-1) needs no migration either.

## Medium

### DB-1. A missing foreign-key index makes the expiry purge slow down with scale, and a purge that times out never succeeds again
- **Where:** [0001_init.sql:45](../../server/app/migrations/0001_init.sql#L45), [state.py:755](../../server/app/rooms/state.py#L755), [db.py:35](../../server/app/db.py#L35), [main.py:77](../../server/app/main.py#L77), [state.py:1302](../../server/app/rooms/state.py#L1302)
- **Problem:**
  - `questions.author_player_id` references `players (id) on delete set null` and has no index (the `INDEXES` set in `test_migrations.py:66` confirms the full list). Postgres runs that FK action once per deleted `players` row, as `UPDATE questions ... WHERE author_player_id = $1`, so each deleted player costs a sequential scan of the whole `questions` table, every room included.
  - `purge_expired` deletes every expired room in a single statement. Its cost is therefore (players in expired rooms) × (all stored questions), which grows quadratically.
  - The statement runs under the pool's `command_timeout=30`: asyncpg's `execute` falls back to it when no timeout is passed.
  - A pass that exceeds 30 s is cancelled and rolls back. `cleanup_expired_rooms` logs it and tries again an hour later, with a larger backlog, so it fails again every hour.
- **Why it matters:**
  - Rough estimate: 1,000 rooms a day with 20 players and 30 questions each keeps about 90k question rows live (about 5–6k pages). A normal hourly pass takes seconds. After one day of backlog (an outage, or a cleanup that failed for a while), a pass needs about 20k full scans and cannot finish in 30 s. From then on the tables grow without limit, each hourly attempt burns 30 s of database CPU, and `_evict_expired` never runs, so the expired rooms also stay in memory.
  - Clan-night rooms of 30–50 players reach this sooner.
  - `kick` does one full scan under the room lock (cheap today, but grows the same way).
  - T39 (delete finished rooms after an hour) shrinks the table but does not remove the per-player scan.
- **Fix:**
  - `0008`: `create index questions_author_idx on questions (author_player_id) where author_player_id is not null`. It is partial, because only a host's own questions have an author, so it stays tiny.
  - Purge in batches (`delete from rooms where id in (select id from rooms where expires_at < now() order by expires_at limit 200)`, looped until it deletes fewer than the limit), so a backlog cannot reach the timeout.
  - Test: add the index to `INDEXES`. Seed a few hundred expired rooms, run `purge_expired` on a pool with a small `command_timeout`, and assert that it completes.

## Low
- DB-2 [main.py:50](../../server/app/main.py#L50) — `ensure_pool` has no lock. If the database was down at startup (possible after a Docker host reboot, where restart policies bring both containers up without compose's `depends_on` wait; not tested here), the burst of reconnecting sockets calls `connect()` concurrently. That creates several pools; only the last is kept, and the others are never closed. On a fresh database it also runs `run_migrations` concurrently, and every loser fails with `MigrationError` (a 500). Guard it with an `asyncio.Lock`. RT-4 covers the cross-process case (advisory lock).
- DB-3 [state.py:1651](../../server/app/rooms/state.py#L1651) — Extends ENG-1 to `end_game`. `_finish` sets `status = "finished"` in memory before its UPDATE, inside `end_game`'s transaction ([state.py:1328](../../server/app/rooms/state.py#L1328)). If the commit fails, memory says finished, the database still says `playing`, the void is rolled back and the timer is already stopped. After a restart, `_recover` resumes a game the host ended. Write first and then mutate, as ENG-1 proposes for the other steps.
- DB-4 [db.py:64](../../server/app/db.py#L64) — The runner records only version numbers, so an edit to an applied migration goes unnoticed on existing databases. CLAUDE.md forbids such edits, but nothing checks for them. A test that pins the sha256 of 0001–0007 would catch one in CI with no schema change.
- DB-5 [state.py:980](../../server/app/rooms/state.py#L980) — `rooms.creator_ip` is written for every room and never read: the rate limiter is in memory. It keeps an IP address for the room's lifetime with no use, and T44 is careful to keep IPs out of its own table. `players.last_seen_at` ([0001_init.sql:31](../../server/app/migrations/0001_init.sql#L31)) is never updated after the insert. Drop both, or give each a consumer.
- DB-6 [state.py:549](../../server/app/rooms/state.py#L549) — The `questions.payload` column holds the envelope minus its columns, with the type payload nested inside as `payload` ([state.py:1787](../../server/app/rooms/state.py#L1787) reads `row["payload"]["payload"]`). So any hand-written SQL, such as T30's export or T45's admin view, has to write `payload->'payload'`. Architecture §5 says "stores the type-specific payload and the envelope extras", which does not show the nesting. Say it in §5, or rename the column in a migration.
- DB-7 [architecture.md:897](../architecture.md#L897) — §5 drift:
  - It labels the post-0007 schema as `0001_init.sql`, whose real content still has the admin-token columns and the `created` status.
  - It promises `0003_suggestions.sql` ([979](../architecture.md#L979)), but 0003 is taken.
  - It calls the TTL "30-day" ([980](../architecture.md#L980), and again in [config.py:27](../../server/app/config.py#L27)), but the default is 3.
  - §3's rehydrate step 1 ([792](../architecture.md#L792)) loads `answers`, which `_load` deliberately does not ([state.py:629](../../server/app/rooms/state.py#L629)).
- DB-8 [settings.py:109](../../server/app/rooms/settings.py#L109) — `RoomSettings` is `extra="forbid"` and is re-validated on every rehydrate. ENG-10 covers a removed mode. The other half: after a downgrade, every room created by the newer release fails to load if that release added a settings key (T36 "list publicly" and T38 hidden rounds both sound like one). Either ignore unknown keys on read, or document that a downgrade needs a jsonb rewrite.
- DB-9 [state.py:963](../../server/app/rooms/state.py#L963) — See RT-9 (a game that crosses `expires_at` keeps running with every answer refused until the purge). For the database side: `expires_at` is written once, at creation, and nothing ever updates it. I would rate RT-9 medium: "create Friday, play Monday" lands on the 3-day TTL exactly. Extending `expires_at` in `start_game`'s UPDATE, and T39's `finished_at`, are the natural places to fix it. This changes the room lifecycle, so it needs the owner's OK.
- DB-10 [state.py:1233](../../server/app/rooms/state.py#L1233) — See ENG-13 (NUL in a free_text answer, and a kicked player's in-flight answer as an FK error). One more input fails the same way: a lone surrogate (`"\ud800"`, valid JSON that `json.loads` accepts). jsonb rejects it too. Reject NUL and surrogates in `free_text.validate_value`, and apply the same check to string fields in custom questions, where it currently surfaces as a 500 from create.

## Seen outside this area
- Nothing new at critical or high. The locks map that never shrinks is ENG-5 / SEC-5; purge and delete also leave their entry behind (about 180 bytes per room ever created, measured).
