# Engine core review

What I read: CLAUDE.md, all of ideas/architecture.md, all of `rooms/state.py`, plus `rooms/{scoring,segments,selection,settings,ready}.py`, `random_events.py` and `modes/`. From `questions/` I read `types/{__init__,scoring,bounds,more_less,closest_number,free_text}.py`, `grade`/`validate_value` in the other three types, `submission.py`, `custom.py`, `packs.py` and the mode and event checks in `schema.py`. I also read `ws/handler.py`, `ws/protocol.py` and the test names in `test_game.py`.
I did not run the tests or start a server. ENG-1's behaviour when the database fails comes from reading the code, not from reproducing it. I confirmed ENG-4 by calling `custom.envelopes` through `uv run`.

## High

### ENG-1. When a timer step fails, the timer stops and the room hangs
- **Where:** [server/app/rooms/state.py:1393](../../server/app/rooms/state.py#L1393), [state.py:1566](../../server/app/rooms/state.py#L1566), [state.py:1526](../../server/app/rooms/state.py#L1526), [state.py:1169](../../server/app/rooms/state.py#L1169)
- **Problem:** `_run_questions` catches `Exception`, logs it and clears `room.timer`. Nothing starts the timer again. Every step also changes memory before it writes to the database:
  - `_close_question` sets `closed_at`, `phase = "reveal"` and `next_at` (1567–1570). Only after that does it call `grade` (1574) and `points_for` (1584), and only then does it open the transaction (1585). If `grade` or `points_for` raises, memory says reveal, the database still has `closed_at` null, and no `question_closed` was sent. `points_for` raises on purpose when credit is outside 0..1 ([scoring.py:105](../../server/app/rooms/scoring.py#L105)).
  - `reveal()` (1602) and the `QuestionClosed` validation run after the commit. If they fail, the question is graded in the database, but nobody is told.
  - `_open_question` sets `phase = "open"` before its UPDATE. If that write fails, the question is open in memory and never closes. A reconnecting player is shown it in `welcome` and can answer it.
  - `start_game` sets `status = "playing"` before its UPDATE. If that write fails, no timer ever starts.

  This confirms the types-modes reviewer's note, with one correction: a failure in `reveal` comes after the database write, not before it.
- **Why it matters:** The room is left in memory, so `_recover` never runs for it. `skip` is still accepted, because the phase is in `SKIPPABLE`, but it wakes nothing. `start_game` is refused. Only `end_game` or a process restart gets the room moving again. Recovery after a restart would work, because the database rows are consistent enough.

  Two things can trigger this in real use:
  - A Postgres restart or an outage of a few seconds. Every room that touches the database during it freezes, and stays frozen after Postgres comes back.
  - Any bug in a new type's `grade`. The partial credit coming with T27 (ordering) and pick-all-that-apply is exactly where a credit outside 0..1 would first show up.
- **Fix:**
  - In the `except` branch, take the room lock. If the room is still the live one, call `_forget(room)` and close its sockets with 1012. The next `get` rehydrates the room, and `_recover` voids the open question and resumes in reveal, which reuses T11.
  - Make each step write to the database before it changes memory.
  - Have `skip` answer `bad_state`, or restart the timer, when `room.timer is None` during play.
  - Test: monkeypatch a type's `grade` to raise once, then assert the question is voided and the game still finishes.

### ENG-2. A skip applies to whatever phase is current when it arrives, so a double-click skips two phases
- **Where:** [server/app/rooms/state.py:1251](../../server/app/rooms/state.py#L1251), [client/src/routes/Room.svelte:426](../../client/src/routes/Room.svelte#L426), [client/src/components/Splash.svelte:151](../../client/src/components/Splash.svelte#L151)
- **Problem:** `skip` does not say which phase or question it is meant for. Every phase clears `advance` when it starts (1440, 1503, 1535, 1570), so any skip that arrives after a phase has started ends that phase. After a skip ends a reveal, the next question opens within two database round trips, a few milliseconds.
  - A second click 100–300 ms later lands on the new question and closes it before anyone can answer.
  - The splash's "Start the round now" works the same way: a double tap closes the round's first question.
  - A double-clicked "Close this question now" also skips the reveal.
  - Two admins pressing at once do the same. The host's second device is a promoted player, per §7.
  - The client buttons have no debounce.
- **Why it matters:** The question is lost: nobody could answer it and everyone gets 0 for it. The existing test, "One skip is one phase", only spaces its skips with its own waits, so it never covers this.
- **Fix:**
  - Preferred: `skip` names the phase and index the admin was looking at (`{"t":"skip","phase":"reveal","index":n}`), and the server ignores a skip that does not match. This changes the websocket protocol, so it needs your OK.
  - Server-only stopgap: ignore a skip that arrives in the first ~0.5 s of a phase.
  - Client stopgap: disable the button until the next `room_updated`, `question_open` or `question_closed` arrives.

## Medium

### ENG-3. An answer's time is taken after the room lock, so it includes the wait behind other answers' commits
- **Where:** [server/app/rooms/state.py:1206](../../server/app/rooms/state.py#L1206)
- **Problem:** `now` is read after the room lock is acquired. Every `submit_answer` also holds that lock across an autocommit INSERT, which includes a WAL flush. When answers arrive together, each one's timestamp is one commit later than the previous one's. The last of N simultaneous answers is stamped about N × commit latency late.
- **Why it matters:** The pile-up happens exactly when speed counts. `more_less` allows 5 s questions, which makes bucket 1 only 0.5 s wide. With 30 players at 2–10 ms per commit, the last answers are stamped 60–300 ms late, and more on a small VPS or a Raspberry Pi with an SD card. That is enough to move an answer down a bucket, which costs 100 points. §6 accepts network jitter, but this delay is on the server and grows with the room's size.
- **Fix:** Read `now` before `async with self._lock(code)`, or in the handler when the frame arrives, and pass it in. The phase and `closed_at` checks under the lock still decide whether the answer counts. Test: two answers submitted at once, with a slowed INSERT, get timestamps a few ms apart.

### ENG-4. A host's question can claim another source and dodge the rule that authors cannot score on their own questions
- **Where:** [server/app/questions/custom.py:43](../../server/app/questions/custom.py#L43), [server/app/rooms/state.py:553](../../server/app/rooms/state.py#L553), [state.py:320](../../server/app/rooms/state.py#L320)
- **Problem:** `envelopes` fills in `mode` and `source` as defaults, and whatever the host sent overrides them. `mode_errors` only checks that `source: room` and `mode: custom` go together. So both of these pass validation (I checked the first):
  - `{"mode": "random_event", "source": "community", "random_event": "bob", ...}`
  - `{"mode": "more_less", "source": "pack", ...}`

  `_question_rows` only records an author when `source == "room"`. With no author, `can_answer` lets the creator answer and score on a question they wrote.
- **Why it matters:** §3 promises that authors are excluded on the server "so seeing them buys nothing". `create`'s docstring also says these questions are stored as `source: room` and `mode: custom`. Exploiting this needs a hand-crafted POST, and it only affects that one room.
- **Fix:** In `custom.envelopes`, refuse any `mode` other than `custom` and any `source` other than `room`, or overwrite them. In `create`, record the author on every question that came from `own`. Test: a custom question sent with `source: community` is refused.

### ENG-5. The map of per-room locks grows with every code anyone asks for
- **Where:** [server/app/rooms/state.py:589](../../server/app/rooms/state.py#L589), [state.py:596](../../server/app/rooms/state.py#L596)
- **Problem:** `_lock(code)` runs `setdefault` for any string. `get`, `join`, `connect` and `delete` all call it before checking that the room exists. Nothing ever removes an entry: not after `RoomNotFound`, not after `purge_expired`, not after `delete`. `GET /api/rooms/{code}` needs no login, has no rate limit, and accepts a code as long as the header size limit allows.
- **Why it matters:** Anyone can make server memory grow without limit. Each request adds one `Lock` plus its key, and the key can be kilobytes long. The security reviewer may rate this higher.
- **Fix:** Only keep a lock once a room is found or loaded: drop the entry on `RoomNotFound` when nothing is waiting on it, and after `delete` and purge. Also check the code's shape (word plus digits) in the route.

### ENG-6. The mode registry allows one type per mode, and treats "has a type" as "is a round"
- **Where:** [server/app/modes/mode.py:37](../../server/app/modes/mode.py#L37), [server/app/modes/__init__.py:66](../../server/app/modes/__init__.py#L66), [server/app/questions/schema.py:110](../../server/app/questions/schema.py#L110), [server/app/rooms/selection.py:181](../../server/app/rooms/selection.py#L181), [server/app/http/modes.py:32](../../server/app/http/modes.py#L32)
- **Problem:** `Mode.type` is `str | None`, and `is_round` is defined as `type is not None`. The latest commit adds a plan to `ideas/games.md` for one mode that plays both `multiple_choice` and a pick-all-that-apply type. The game loop already handles types per question, since `state.py` always uses `question.type`. The one-type assumption lives elsewhere:
  - A mode with two types has no single value for `type`. Setting it to `None` silently turns the mode into an event mode, which `RoomSettings` then refuses as a round.
  - A mode's pace is read from its one type.
  - `schema.py` rejects a question whose type is not the mode's type.
  - Event placement's "prefer a different type" compares against the round's one type.
  - `GET /api/modes` and `lib/modes.ts` choose presentation by `type`.

  One type per mode is a documented decision (§1, "Every other mode has a type"). The new plan conflicts with it.
- **Why it matters:** The first multi-type mode will touch five server files and the client. The `is_round` trap fails silently.
- **Fix:**
  - Give `Mode` an explicit `is_round` (or a `kind`) and `types: frozenset[str]`.
  - When a mode has several types, it must state its own pace.
  - `schema.py` checks that the question's type is in the set.
  - Selection prefers event types outside the set.

  Settle this, and update architecture.md, before the pick-all-that-apply type is built.

## Low
- ENG-7 [state.py:1285](../../server/app/rooms/state.py#L1285) — Kicking the last player who hadn't answered does not close the question early; only an arriving answer triggers the check (`_everyone_answered`), so the host has to skip.
- ENG-8 [state.py:1209](../../server/app/rooms/state.py#L1209) — No `ends_at` check: answers are accepted until the close takes the lock, so a late close adds extra bucket-5 time for everyone.
- ENG-9 [state.py:1406](../../server/app/rooms/state.py#L1406) — Sleeps and `elapsed` are measured with the wall clock (`datetime.now(UTC)`), so a clock jump shifts timers and buckets. Use `time.monotonic()` for durations and keep the wall clock for the wire.
- ENG-10 [settings.py:165](../../server/app/rooms/settings.py#L165) — A stored room whose mode has left `MODES` fails `RoomSettings` validation and can no longer load, despite the comment at [modes/__init__.py:70](../../server/app/modes/__init__.py#L70) saying such rooms are handled.
- ENG-11 [selection.py:207](../../server/app/rooms/selection.py#L207) — The T21 branch of `_slots` (frequency `None`) is dead outside tests, because `NewRoomSettings` never allows `None`. It can also place an event after a round's last question, which the rest of the engine assumes never happens.
- ENG-12 [selection.py:222](../../server/app/rooms/selection.py#L222) — `random_event_slots` (question count // N) can promise more slots than `_slots` actually finds, for example when rounds are one question long. A create that passed `check_custom_questions` then fails as `bad_settings`.
- ENG-13 [state.py:1230](../../server/app/rooms/state.py#L1230) — A free_text answer containing U+0000 passes `validate_value` but is rejected by jsonb. So is a kicked player's in-flight answer, as a foreign-key error. Neither error is an `ApiError`, so it ends that player's socket.
- ENG-14 [state.py:1211](../../server/app/rooms/state.py#L1211) — Answers are matched by content id, and `custom.envelopes` does not refuse duplicate content ids. Two identical host questions share an id, so a late answer to one is accepted by the other.
- ENG-15 [scoring.py:89](../../server/app/rooms/scoring.py#L89) — The `match` statements in `band` and `points_for` have no default. A new `Scoring` member would make them return None or raise `UnboundLocalError` at the close, which ENG-1 turns into a hung room. Add `case _: assert_never(...)`.
- ENG-16 [state.py:1413](../../server/app/rooms/state.py#L1413) — Adding the ~10 modes and two types needs no change to `state.py`: types go through `TYPES`, modes through `MODES` and selection. Its 1,800 lines are mostly lobby, sockets and SQL. The five timer steps each repeat "lock, check the room is live, mutate, write, snapshot, broadcast". That repetition is where ENG-1's inconsistent write order came from; one shared helper would leave one place to fix.

## Seen outside this area
- Nothing at critical or high.
