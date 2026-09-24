# Plan drift review

Compared `ideas/architecture.md` section by section, plus the specs of the finished tasks in `phase2.md` (T16–T22) and `design.md` (D1–D5, D7–D9), with the code on `main` at c753934.
T1–T22 and D1–D5, D7–D9 count as done. I went by the git log (a merged PR per task, and VERSION reaching 0.6.3), not by `TODO.md`, which still lists T22 as open (see Contradictions).
Plan history comes from `git log -p` on the three plan docs. Where a commit shows the owner chose the code's behaviour on purpose, the verdict is "keep, update the plan".

## High

### DRIFT-1. Guess the Examine now plays from hand-written `data/examines.json`, but every plan doc still describes the `/mapping` generator and the `items` vocabulary
- **Where:** plan [architecture.md:308](../architecture.md#L308) §2 catalogue, [:563](../architecture.md#L563) schema `vocab` enum, [:595](../architecture.md#L595), [:737](../architecture.md#L737) §3 vocabularies, [:38](../architecture.md#L38) and [:103](../architecture.md#L103) layout, [:1269](../architecture.md#L1269) §9 pipeline; [phase2.md:189](../phase2.md#L189) T20, [:360](../phase2.md#L360) T23, [:375](../phase2.md#L375) T24; [phase2-prompts.md:203](../phase2-prompts.md#L203). Code: [vocab.py:38](../../server/app/questions/vocab.py#L38), [question.schema.json:140](../../schema/question.schema.json#L140), [gen_examine_questions.py](../../server/scripts/gen_examine_questions.py), [Makefile:84](../../Makefile#L84)
- **Problem:** The plan says the pool is the `/mapping` examine text, filtered by a generator that rejects lines containing the item's name, and answered from the `items` vocabulary. It also says `/api/vocab/{name}` serves only `items` and `npcs`. Commit 7f24685 (T20) replaced all of that:
  - The pack now comes from `data/examines.json`: hand-picked lines for items, NPCs and scenery, each with a stable id.
  - There is a third vocabulary, `examines`, and the schema enum has it.
  - `make gen-examine-questions` builds the pack. It uses no facts and no rejection step.

  No plan doc was updated. The commit message says why: the `/mapping` lines "were accurate and not funny".
- **Why it matters:** T23 and T24 come next. As written:
  - T23 fetches examines into `facts/items.json` for a mode that no longer uses them.
  - §9 says `gen-packs` reads "only `data/facts/` and the roster", and T24 moves "T20's generators" under it. A `generators/examine.py` built to the layout would regenerate `examine.json` from facts and overwrite the hand-written pack. The `CHECK=1` gate would then lock that in.
- **Fix:** **Keep, update the plan.** Guess the Examine and its data source are the owner's deliberate choice.
  - In architecture.md: change the catalogue's pool to `data/examines.json`, add `examines` to the schema copy and to §3, and list `data/examines.json` and `gen_examine_questions.py` in the layout.
  - In §9, make `data/examines.json` an input of `gen-packs`.
  - Rewrite T20 as built, and drop "examine" from T23's `/mapping` line.

### DRIFT-2. `pick_from_list` never sends its `image` while a question is open, but the plan's image modes depend on it
- **Where:** plan [architecture.md:384](../architecture.md#L384) §2 asset refs, [:565](../architecture.md#L565) schema, [:1077](../architecture.md#L1077) §6 "frames … preloaded when the question opens", [:318](../architecture.md#L318) catalogue; code [pick_from_list.py:25](../../server/app/questions/types/pick_from_list.py#L25), [:46](../../server/app/questions/types/pick_from_list.py#L46)
- **Problem:** The plan says an asset is `item:<id>` / `npc:<id>`, that `pick_from_list` payloads carry an `image`, and that Pixel Hunt's frames are preloaded when a question opens. The code deliberately leaves `image` out of `client_view` (`_OPEN_KEYS = ("prompt", "vocab", "steps")`). Its docstring says why: for this type the asset id *is* the answer id. Architecture does not mention this.
- **Why it matters:** Who's That NPC? and Pixel Hunt (catalogue, Phase 3), and the Minimap Guesser that `games.md` added (4deab42), all need a picture on screen while the question is open. Built to the plan, either:
  - they show nothing, or
  - someone "fixes" `client_view` to include `image`, and the answer id goes out in every `question_open`. That reintroduces the leak this code prevents.
- **Fix:** **Keep, update the plan**, and add a Needs-decision entry:
  - Document the withholding in §2.
  - Specify an opaque, per-room asset reference for open questions. This changes the schema, so it is the owner's call.
  - Settle it before any Phase 3 mode starts.

## Medium

### DRIFT-3. D9's `standings` phase, `standings_seconds` and the new loop are missing from architecture.md
- **Where:** plan [architecture.md:181](../architecture.md#L181) §1 `Room.phase`, [:682](../architecture.md#L682) and [:686](../architecture.md#L686) §3 `room_updated` / `question_closed`, [:758](../architecture.md#L758) `next_at`, [:826–851](../architecture.md#L826) §4 sub-machine, [:853](../architecture.md#L853) settings; code [protocol.py:24](../../server/app/ws/protocol.py#L24), [state.py:1474](../../server/app/rooms/state.py#L1474), [settings.py:134](../../server/app/rooms/settings.py#L134), [:224](../../server/app/rooms/settings.py#L224)
- **Problem:** eb55f10 (D9) added:
  - a fifth phase, `standings`, entered after each round's last reveal except the game's last, skippable, and never written to the database;
  - the setting `standings_seconds` (default 10, 0–30 at creation, 0 turns it off);
  - a `room_updated` sent when the standings start.

  So `question_closed.next_at` is now when the reveal ends, not "when the next opens". `design.md` §7.3 and `protocol.py` / `protocol.ts` agree with the code; architecture.md was never touched. RT-11 notes the missing phase as low.
- **Why it matters:** architecture.md is meant to win over older notes. A timer or protocol rewrite from it, or D13, D14 and D16, which all rework the stage between rounds, would drop or misplace this phase.
- **Fix:** **Keep, update the plan.** Changes:
  - Add `standings` to `Room.phase`, the §4 diagram and the transitions table (`closed → standings → next pending`).
  - Add `standings_seconds` to the settings block.
  - Fix the §3 `next_at` wording and the `room_updated` triggers.
  - Record that a restart during the standings resumes in the reveal.

### DRIFT-4. §1's broadcasting rule describes sending under the lock, which the code has never done
- **Where:** plan [architecture.md:190–192](../architecture.md#L190); code [state.py:5–9](../../server/app/rooms/state.py#L5), [:486](../../server/app/rooms/state.py#L486), [:822](../../server/app/rooms/state.py#L822)
- **Problem:** The plan's rule is "every public method acquires the lock … broadcasting is `for ws in room.sockets.values(): await ws.send_json(msg)`".
  - Since T8 (70946b9), a mutation instead snapshots its frames and targets into a `Broadcast` under the lock, releases the lock, and then sends to all targets concurrently with a 10 s `SEND_TIMEOUT` each.
  - A failed send closes that socket with 1011 and runs `disconnect`.
  - `welcome` is sent before the replaced socket is closed.

  RT-11 notes this as low; RT-2 covers the stall it still allows.
- **Why it matters:** This is the concurrency contract every new manager method copies. Written as the plan says, a new method would hold the room lock across socket I/O, which the code was built to avoid.
- **Fix:** **Keep, update the plan.** Restate the rule as: mutate and write under the lock, snapshot a `Broadcast`, send after releasing it. Add `SEND_TIMEOUT` and the 1011 close.

### DRIFT-5. T22's "every NPC has at least two questions" became an owed list: 10 of the 16 NPCs have none
- **Where:** plan [phase2.md:342](../phase2.md#L342) T22 accept; code [random_events.py:27](../../server/app/random_events.py#L27), [test_random_events.py:23](../../server/tests/test_random_events.py#L23), [:45](../../server/tests/test_random_events.py#L45)
- **Problem:** T22's accept criterion is "Every roster id has an event file with at least two questions". The test that shipped checks something weaker: every NPC not in `AWAITING_QUESTIONS` has two questions, and the awaiting list is accurate. The commit message (c7887c7) says so, but neither phase2.md nor architecture.md records the exception. `data/packs/random_events/` has files for 6 NPCs (bob, death, dr_jekyll, jane, krystilia, lumbridge_cook).
  - The other 10, `sandwich_lady` among them, can only ever ask a host's question.
  - architecture.md §1 ([:44](../architecture.md#L44), [:269](../architecture.md#L269)) uses Sandwich Lady and cooking as its example, and phase2.md T22 ([:265](../phase2.md#L265)) uses Rick Turpentine, who is not on the roster at all.
- **Why it matters:** CLAUDE.md makes each accept criterion a test. This one was quietly relaxed, and anyone reading the plan will assume that every face in a room brings a themed question.
- **Fix:** **Keep, update the plan.** State in T22, and in `random-events.md`, that the roster may run ahead of the content, with the owed list as the tracker. Pick the example NPCs from those that have files. If the owner wants the original criterion instead, the fix is writing the content, not changing code.

### DRIFT-6. The "coming soon" modes on Create use ids and names the catalogue does not have
- **Where:** plan [architecture.md:304–319](../architecture.md#L304) §2 catalogue ("Names are final"); code [modes.ts:156–167](../../client/src/lib/modes.ts#L156), [Create.svelte:76](../../client/src/routes/Create.svelte#L76)
- **Problem:** a5b0b73 added `UPCOMING_MODES`. Against the catalogue:
  - It uses `who_is_that_npc`, where the catalogue has `whos_that_npc`.
  - It adds `Name that spell` and `Minimap Guesser`, with ids that contain spaces and capitals. The schema's `mode` pattern is `^[a-z0-9_]{1,32}$`.
  - It labels `clipped` "Know Your Content Creator". That rename is in phase2.md T29 and design.md, but not in the catalogue.

  Create hides an upcoming entry only when `/api/modes` returns the same id (TM-13 has the double-listing).
- **Why it matters:** When Who's That NPC? ships under its planned id, Create shows it twice. Two of the planned new modes exist only in client copy and `games.md`, so whoever writes their T-task has no id or type to start from.
- **Fix:** **Fix the code** for the ids: `whos_that_npc`, and snake_case ids for the two new entries. **Update the plan** for the rest: rename Clipped's label, and add Minimap Guesser (a `pick_from_list` candidate, according to games.md) and Name that spell to the catalogue as not yet scheduled. The ids are the owner's to confirm.

### DRIFT-7. The room settings and pacing numbers in §1 and §4 are out of date
- **Where:** plan [architecture.md:253](../architecture.md#L253), [:858](../architecture.md#L858), [:853–868](../architecture.md#L853); code [more_less.py:28](../../server/app/questions/types/more_less.py#L28), [settings.py:141](../../server/app/rooms/settings.py#L141)
- **Problem:**
  - c1d676e ("Update defaults for game modes") lowered `more_less`'s default round from 10 questions to 5. Every type now defaults to 5 questions. §1 still says `more_less` is "ten of them at ten seconds", and the settings example still shows `"questions": 10`. The type's own comment is stale too (TM-9).
  - D8 added the room setting `name_wrong_answers` (bool, default false), and design.md §2 documents it. §4 does not.
  - `max_players` is shown as `50`. The code stores `null` on the way in, `create` resolves that to `MAX_PLAYERS_PER_ROOM`, and a larger value is refused.
- **Why it matters:** CLAUDE.md says room settings are the owner's to decide and architecture.md is the reference. A settings rewrite taken from §4 would drop two settings (this one and DRIFT-3's) and bring back the old default.
- **Fix:** **Keep, update the plan.** Replace the §4 JSON with the current `RoomSettings` fields and ranges, and update the §1 pacing sentence.

## Low
- DRIFT-8 plan [architecture.md:26–157](../architecture.md#L26) vs repo — the layout omits files that exist:
  - server: `accesslog.py`, `errors.py`, `heads.py`, `http/headers.py`, `rooms/ready.py`, `rooms/settings.py`, `questions/custom.py`, `questions/submission.py`;
  - scripts: `gen_price_questions.py`, `gen_examine_questions.py`, `smoke_ws.py`, `check_contrast.py`;
  - data: `data/heads/`, `examines.json`, `player-names.json`, `packs/sample.json`, and `docker-compose.dev.yml`;
  - client lib: `dates`, `heads`, `names`, `podium`, `profile`, `ready`, `theme`, `timerbar`, `trophies`;
  - client components: `CopyLink`, `Die`, `Head`, `IdentityChip`, `NameField`, `NamePrompt`, `PointsSlot`, `RevealTally`, `ThemePicker`, `TimerBar`, `GemButton`, `GemChoices`.

  It lists `random_events/sandwich_lady.json`, which does not exist. Entries for work not yet done (facts, generators, `Ordering.svelte`, the Quote/Subjects/Zoom stems) are fine. **Keep, update the plan.**
- DRIFT-9 plan [architecture.md:164–185](../architecture.md#L164) vs [state.py:360](../../server/app/rooms/state.py#L360):
  - The `RoomManager` sketch lacks `set_profile`, `set_ready`, `delete`, `purge_expired`, `evict`, and the `avatar` and `ws` parameters. `join` returns `(Player, session)`.
  - `Room` has `next_at`, `advance`, `rescheduled` and `totals`, and no `open_since`.

  **Keep, update the plan.**
- DRIFT-10 plan [architecture.md:255](../architecture.md#L255) vs [selection.py:65](../../server/app/rooms/selection.py#L65) — `select` takes `custom` as well: `select(packs, custom, settings, rng)`. **Keep, update the plan.**
- DRIFT-11 plan [architecture.md:227](../architecture.md#L227) vs [mode.py:34](../../server/app/modes/mode.py#L34) — `Mode.questions`/`seconds` = `None` means "inherit from the type" for any mode, not "None for custom/random_event". Also `is_round` is not in the plan (see TM-1). **Keep, update the plan.**
- DRIFT-12 plan [architecture.md:844](../architecture.md#L844) vs [settings.py:203](../../server/app/rooms/settings.py#L203) — `seconds` is clamped to the mode → type → registry bounds, not "the type's `SECONDS`". An event plays at its own mode's default of 20 s. **Keep, update the plan.**
- DRIFT-13 plan [architecture.md:851](../architecture.md#L851) vs [state.py:1353](../../server/app/rooms/state.py#L1353) — the loop is `_run_questions(room, index, resume_at)`, which runs splash → open → close → standings → advance. **Keep, update the plan.**
- DRIFT-14 plan [architecture.md:658](../architecture.md#L658) vs [handler.py:44](../../server/app/ws/handler.py#L44), [state.py:91](../../server/app/rooms/state.py#L91):
  - 1011 (send failed, or database unavailable on connect) and 1012 (room evicted) are undocumented.
  - 4004 closes without an `error` frame.

  **Keep, update the plan.**
- DRIFT-15 plan [architecture.md:766](../architecture.md#L766) vs [state.py:1543](../../server/app/rooms/state.py#L1543) — `question_open` is not byte-identical per socket: `you_can_answer` differs for authors and `host_only` questions, and `answered`/`of` differ between `welcome` and `question_open`. **Keep, update the plan** (say "identical except `you_can_answer`").
- DRIFT-16 plan [architecture.md:792](../architecture.md#L792) vs [state.py:626](../../server/app/rooms/state.py#L626) — rehydrate reads the standings sum, not the answer rows (DB-7). **Keep, update the plan.**
- DRIFT-17 plan [architecture.md:897–980](../architecture.md#L897) §5 — the schema is labelled `0001_init.sql`, `0003_suggestions.sql` is promised, and the TTL is called "30-day" (DB-7). The `payload` column holds a nested envelope (DB-6). `last_seen_at` is never written (DB-5). **Keep, update the plan.**
- DRIFT-18 plan [architecture.md:654](../architecture.md#L654) vs [packs.py:36](../../server/app/questions/packs.py#L36) — event files are `{pack, random_event, questions}` with no `generated_at`. **Keep, update the plan.**
- DRIFT-19 plan [architecture.md:652](../architecture.md#L652) — export of custom questions is described as existing, but there is no endpoint (T30). **Keep, update the plan** (mark it as T30's).
- DRIFT-20 plan [architecture.md:1094](../architecture.md#L1094) vs [state.py:447](../../server/app/rooms/state.py#L447) — the dense rank is over (points, correct). Join time only orders the list. **Keep, update the plan.**
- DRIFT-21 plan [architecture.md:1141](../architecture.md#L1141) vs [headers.py:32](../../server/app/http/headers.py#L32) — the headers come from `http/headers.py`, not from `main.py` middleware. The CSP also sets `base-uri`, `form-action` and `frame-ancestors`. **Keep, update the plan.**
- DRIFT-22 plan [architecture.md:1120](../architecture.md#L1120) vs [rooms.py:86](../../server/app/http/rooms.py#L86) — the session also travels in the `DELETE /api/rooms/{code}` body, not only in "a POST response body". **Keep, update the plan.**
- DRIFT-23 plan [architecture.md:1126](../architecture.md#L1126) vs [codes.py:18](../../server/app/rooms/codes.py#L18) — after the 5 plain tries there are up to 20 tries with digits, then `CodeSpaceExhausted`. **Keep, update the plan.**
- DRIFT-24 plan [architecture.md:114](../architecture.md#L114) and [:131](../architecture.md#L131) vs [App.svelte:6](../../client/src/App.svelte#L6) — the router also has `/r/:code/create` and a legacy `/r/:code/admin`. The TopBar has no room code since D2. **Keep, update the plan.**
- DRIFT-25 plan [architecture.md:30–32](../architecture.md#L30) vs [Makefile](../../Makefile) and [ci.yml](../../.github/workflows/ci.yml) — there is no `migrate` target (migrations run at startup). CI also runs `check_contrast`, a websocket smoke test and the release job. **Keep, update the plan.**
- DRIFT-26 plan [architecture.md:1201–1205](../architecture.md#L1201) — T14 and T15 are not marked DONE, although TODO.md and the code say they are. T6's accept "sixth create is 429" no longer holds at the limit of 10 per hour (4ceb240 changed the test). **Keep, update the plan.**
- DRIFT-27 plan [architecture.md:1251](../architecture.md#L1251) — "at most two components" per mode leaves out the host every mode brings since D14 ([phase2.md:42](../phase2.md#L42)). **Keep, update the plan.**
- DRIFT-28 plan [architecture.md:1287](../architecture.md#L1287) — 0.1.0 did not include D8. D8 landed as 0.5.0 (1ee8764). **Keep, update the plan.**
- DRIFT-29 plan [architecture.md:1344](../architecture.md#L1344) — typo `[x]]`. The comment in [pick_from_list.py:5](../../server/app/questions/types/pick_from_list.py#L5) still says `"items" | "npcs"`. **Fix the code** (the comment) and update the plan.

## Contradictions between plan documents
- [TODO.md:3](../TODO.md#L3) and [:49](../TODO.md#L49) (version 0.5.0, T22 open) vs git (0.6.3, T22 merged in c7887c7). Git and the code are right.
- [games.md](../games.md) "New game type" (one mode, several types: `multiple_choice` plus pick-all) vs [architecture.md:248](../architecture.md#L248) ("Every other mode has a type"). The code matches architecture; see TM-1 / ENG-6, to be decided before T25.
- [phase2.md:457](../phase2.md#L457) and [design.md:1322](../design.md#L1322) (Clipped ships as Know Your Content Creator) vs [architecture.md:317](../architecture.md#L317) ("Clipped"). The client matches phase2 (DRIFT-6).
- [games.md](../games.md) moves Minimap Guesser out of "Expensive", and Name that spell stays there. Neither is in the architecture catalogue, yet both appear on Create (DRIFT-6).
- [phase2.md:230](../phase2.md#L230) T21 ("no pack mode uses [free_text], it is for the host's own") vs [architecture.md:337](../architecture.md#L337) (the NPCs write it too). The code matches architecture: 8 `free_text` questions in `data/packs/random_events/`.
- [phase2.md:265](../phase2.md#L265) T22 (Rick Turpentine asks about money) vs [random_events.py:27](../../server/app/random_events.py#L27) and random-events.md, which have no such NPC. The code matches random-events.md.
- [design.md:712](../design.md#L712) ("The splash only runs when a round introduces a new mode") vs [architecture.md:838](../architecture.md#L838) (a splash introduces a segment). The code matches architecture ([state.py:1434](../../server/app/rooms/state.py#L1434)).
- [phase2.md:27](../phase2.md#L27), [:189](../phase2.md#L189), [:375](../phase2.md#L375) and [phase2-prompts.md:203](../phase2-prompts.md#L203) vs the examine code. Architecture is also wrong here; neither doc matches the code (DRIFT-1).
- [phase2.md:375](../phase2.md#L375) (T24 moves "T20's generators" under gen-packs) vs [architecture.md:1269](../architecture.md#L1269) (gen-packs reads only facts and the roster). They cannot both hold for examines (DRIFT-1).
- [architecture.md:1155–1205](../architecture.md#L1155) (T14, T15 not DONE; T6 called "room creation") vs [TODO.md:21–30](../TODO.md#L21) (all done, "room creation and admin claim"). The code matches TODO on status, and architecture on naming.

## Seen outside this area
- Nothing new at critical or high. The one-type-per-mode limit is TM-1 / ENG-6, and the answer leak through `question_id` is SEC-2. The plan describes both as designed, so neither is drift.
