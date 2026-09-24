# Tests review

I read CLAUDE.md, all of ideas/architecture.md, the accept criteria of T16–T22 and D1–D5, D7–D9, all of `test_game.py`, `conftest.py` and `rooms_api.py`, the test names of every other server file, and every client `*.test.ts`. I also read the parts of `state.py` that the uncovered lines point at.
Server: `make db-up`, then `COVERAGE_FILE=<scratchpad>/.coverage DATABASE_URL_TEST=postgresql://jbi:jbi@localhost:5432/jbi uv run --with pytest-cov pytest --cov=app --cov-report=term-missing -q -rs --durations=25`. Result: **1068 passed, 0 failed, 0 skipped, 160.6 s**. Client: `pnpm test` gave **18 files, 179 passed, 0 failed, 4.8 s**.
To check suspicions I ran five probe tests from the scratchpad against the real fixtures (`-p tests.conftest`). Nothing in the repository changed. Three of them failed and are cited below.

## Coverage by module

| Module | Stmts | Cover | Most important uncovered paths |
|---|---|---|---|
| rooms/state.py | 835 | 96% | 1393–1394 the timer task's exception handler (ENG-1); 1432, 1490, 1522, 1563–1565, 1630 "room ended or gone while the timer waited for the lock"; 1372 a restart during the **last** question's reveal; 1376–1386 early `return`s in the loop; 615–621 recovery failing on rehydrate; 1240 the unique-violation fallback; 1092/1135 a kicked player's message still in flight; 1276–1278/1298 promote or kick of an unknown player, promote of an admin |
| ws/handler.py | 136 | 96% | 126–129 connect when the database is down; 176 a failed reply send |
| questions/packs.py | 88 | 86% | 70–111, 140–144 loader error branches |
| rooms/selection.py | 105 | 98% | 178 `TooManyEvents` when the roster has nobody left; 235 |
| rooms/settings.py, modes/, types/bounds.py, types/more_less.py | – | 92–99% | settings 231, modes 77, bounds 28, more_less 78 (duplicate-asset check) |
| main.py, db.py, heads.py | – | 93–96% | startup failure branches |
| every other module (types, scoring, ready, segments, codes, custom, normalize, vocab, http/*, protocol) | – | 100% | – |
| client (by reading, no coverage tool) | – | – | no test at all for `lib/ws.ts`, `lib/session.ts`, `lib/theme.ts`, `lib/names.ts`, `Splash.svelte` (366 lines), `Lobby.svelte`, `Timer.svelte`, `TimerBar.svelte`, `IdentityChip.svelte`, `Join.svelte`, `Home.svelte`, `ThemePicker.svelte`; `stores.ts` only through `Room.test.ts`; `MoreLess.svelte` only through two reveal tests |

Line coverage is high. The gaps are the failure and race paths, and the phase × action combinations below.

**Engine: what is tested in each phase** (test_game.py unless noted)

| Action | splash | open | reveal | standings | event hold |
|---|---|---|---|---|---|
| skip | yes | one skip yes; two skips no (ENG-2) | yes | yes | no |
| end_game | yes | yes (voids) | yes | **no** | **no** |
| kick | **no** (ready recount) | yes; last unanswered player **no** (TST-2) | **no** | **no** | **no** |
| restart | yes | yes | yes, not the last question (1372) | **no** | **no** |
| join / reconnect | yes | reconnect yes; a new player answering **no** | no | yes | reconnect yes |

**Per-type parity** (server test_<type>.py and test_questions.py; client *.test.ts)

| Type | grade | bad values incl. `true` | check | schema | view withholds | reveal | pace | shipped-pack leak | played through the loop | client view |
|---|---|---|---|---|---|---|---|---|---|---|
| more_less | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ many | 2 reveal tests only |
| price_is_right | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **never** | ✓ 6 |
| multiple_choice | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **no** | n/a | as a custom event | ✓ 6 |
| closest_number | ✓ 8 | ✓ (+inf/nan) | ✓ | ✓ | ✓ | ✓ | **no** | n/a | as a custom event | ✓ 8 |
| free_text | ✓ | ASCII length only | ✓ | ✓ | ✓ | ✓ | **no** | n/a | **never graded** | ✓ 6 |
| pick_from_list | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ once | ✓ 17 |

## High

### TST-1. Nothing tests what happens when a timer step fails or races an end
- **Where:** [server/app/rooms/state.py:1393](../../server/app/rooms/state.py#L1393), [state.py:1563](../../server/app/rooms/state.py#L1563), [server/tests/test_scoring.py:354](../../server/tests/test_scoring.py#L354)
- **Problem:** The coverage report never reaches the `except Exception` in `_run_questions` (1393–1394). It also never reaches any of the six "room is no longer ours or no longer playing" guards (1432, 1490, 1522, 1563, 1565, 1630). `test_credit_outside_zero_to_one_is_refused` checks that `points_for` raises. No test checks what the room does after it raises. It stops for good (ENG-1).
- **Why it matters:** This is how every future type's bug would show up. An ordering or pick-all `grade` that returns 1.2 or raises on an unexpected value hangs the room in ordinary play, and the suite stays green. TST-8 makes it worse: such a test would hang, not fail.
- **Fix:** Add game tests that monkeypatch a type's `grade` to raise, and to return 1.5. Assert what the room should do: skip the question as voided and carry on, or finish. Add `end_game` and `evict` tests that land while the timer is waiting on the lock, for example with a `grade` stub that blocks on an `asyncio.Event`.

### TST-2. `test_a_disconnected_player_does_not_hold_the_close_up` passes while the behaviour it names is broken
- **Where:** [server/tests/test_game.py:499](../../server/tests/test_game.py#L499), [state.py:904](../../server/app/rooms/state.py#L904), [state.py:1243](../../server/app/rooms/state.py#L1243)
- **Problem:** The test disconnects the third player *before* the other two answer, so the check inside `submit_answer` sees two of two. The usual order is two answer and then the third phone locks. That order leaves the question open until the timer runs out, because only an arriving answer runs `_everyone_answered`. My probe (two answer, the third closes its socket, wait 1 s) found `phase == "open"`. A kick in the same position gives the same result (ENG-7).
- **Why it matters:** A test named after the behaviour hides the bug. Players wait the full 10–60 s every time a phone locks after the others have answered.
- **Fix:** Add the "answer first, then disconnect" and "answer first, then kick" orders to the test. Both should fail today. That gives the fix its failing test.

### TST-3. No contract test over `TYPES`; each type's tests are copied by hand and have already drifted
- **Where:** [server/tests/test_multiple_choice.py:36](../../server/tests/test_multiple_choice.py#L36), [server/tests/test_free_text.py:105](../../server/tests/test_free_text.py#L105), [server/tests/test_questions.py:429](../../server/tests/test_questions.py#L429)
- **Problem:** Nothing iterates `TYPES`. The only test that does just checks the registry's keys. Each type file restates its own version of the same checks, and the parity table shows the gaps: three types never test their pace, `free_text` never tests an input that grows under NFKC (SEC-6), and two types are never played through the loop. No test states the rules every type must follow: `grade` returns a float in 0..1 for every value `validate_value` accepts, `grade([])` is `{}`, `validate_value` rejects `True`, `None` and a 1 MB value, and `client_view` has none of the keys that `reveal` adds.
- **Why it matters:** Ordering and pick-all are the first types whose credit falls between 0 and 1 and whose values are lists. A contract test is where an out-of-range credit (ENG-1, TM-3) or an unguarded list would be caught before a quiz night.
- **Fix:** Add `tests/test_type_contract.py`, parametrized over `TYPES`, with one example payload and a few valid and invalid values per type. Each new type then adds one fixture entry rather than a copied file.

### TST-4. Many D-task accept criteria are "tested" by regex over Svelte source
- **Where:** [server/tests/test_player_names.py:133](../../server/tests/test_player_names.py#L133), [server/tests/test_player_names.py:8](../../server/tests/test_player_names.py#L8), [server/tests/test_themes.py:183](../../server/tests/test_themes.py#L183), [server/tests/test_app_shell.py:143](../../server/tests/test_app_shell.py#L143)
- **Problem:** `test_join_turns_the_suffix_over_on_name_taken` asserts that `'name_taken'`, `resuffix(` and `const REROLLS = 3` appear in `Join.svelte`. It passes if the handler checks the wrong error, never retries, or retries with the same name. D3's "two browsers forced to the same generated name both join" rests on it. `test_a_browser_that_never_chose_sees_jolly_selected` greps for `checked={theme === current}`. The module docstring says that the focus, returning-browser and `localStorage`-throws criteria "a browser confirmed". That note predates the client having Vitest, jsdom and testing-library, which can test all of them.
- **Why it matters:** The CLAUDE.md rule is that every accept criterion is a test unless it says "manual". These tests pass on a rename or a broken refactor, so they are neither.
- **Fix:** Move the behavioural ones to component tests: Join with a mocked `api.join` that returns `name_taken` twice, ThemePicker with empty storage, and `profile.ts` with a throwing `localStorage`. Keep regex tests only for static rules such as "no inline colour".

## Medium

### TST-5. Kick, end and restart are missing in several phases, and a late joiner answering is untested
- **Where:** [server/tests/test_game.py:815](../../server/tests/test_game.py#L815), [test_game.py:900](../../server/tests/test_game.py#L900), [state.py:1372](../../server/app/rooms/state.py#L1372), [state.py:1285](../../server/app/rooms/state.py#L1285)
- **Problem:** See the engine table. No kick during a splash, even though `kick` calls `_recount_splash`. No kick in the reveal or standings phase. No `end_game` during standings or during an event's hold. No restart during standings, during an event's hold, or during the last question's reveal (1372 is uncovered). No new player joining mid-question and answering: architecture §4 promises it, and my probe shows it works (`of` goes to 4). No test pins that an answer after `ends_at` but before the close is taken and scored in bucket 5. Architecture §6 rejects only after `closed_at`, and bucket edges are tested only as numbers in test_scoring.py.
- **Why it matters:** These are ordinary-play combinations, and recovery is the "a crash costs one question" guarantee. A regression in any of them is silent today.
- **Fix:** Add one test per empty cell. Most take 10 lines with `table`, `evict` and `answer_after`.

### TST-6. Two shipped types are never played through the game loop, and no game mixes two real modes
- **Where:** [server/tests/conftest.py:130](../../server/tests/conftest.py#L130), [server/tests/test_game.py:1725](../../server/tests/test_game.py#L1725)
- **Problem:** `price_is_right` never opens in any game test. `free_text` appears only as the value `any_value` sends to an event that rejects it. Every multi-round test uses `second_mode`, which is a stub of `more_less` under another id. No test plays `more_less` followed by `price_is_right` or `guess_examine`, so the type that changes between rounds is never exercised end to end.
- **Why it matters:** The ~10 planned modes are mostly `multiple_choice` and the new types. A type whose `reveal`, `validate_value` or `question_open` breaks only inside the loop would pass every unit test.
- **Fix:** Add a table-driven game test that opens, answers right and wrong, and closes one question of each round mode in `MODES`, using a per-type "right value / wrong value" helper (see TST-11).

### TST-7. "One-second" test questions are five seconds, and the T9 test runs 18 s against a 20 s limit
- **Where:** [server/tests/rooms_api.py:36](../../server/tests/rooms_api.py#L36), [server/app/rooms/settings.py:214](../../server/app/rooms/settings.py#L214), [server/tests/test_game.py:232](../../server/tests/test_game.py#L232)
- **Problem:** `seconds_for` clamps a stored room into the type's range, and `more_less` is 5..20. The `seconds=1` that `fast_settings` promises becomes 5. `test_a_three_question_game_runs_to_finished_unattended` took 18.1 s, both in the full run and alone, and asserts `elapsed < 20`. That leaves about 10% headroom on a slow CI runner. Other tight timing checks: the skip-within-100 ms check (528), `< 4` after a 3 s countdown (1317, 1332), `9 < seconds_left <= 10` measured after a `take` (1327, 1356), and `sleep(1.2)` expecting band 2 (1485). The five unattended tests spend about 54 of the suite's 160 s waiting.
- **Why it matters:** These are flaky on a loaded runner, and the suite is slower than it needs to be. The architecture sentence "the tests can run a whole game on one-second questions" (§4) is no longer true.
- **Fix:** Give tests a stub mode whose `seconds` bounds allow 1, as `second_mode` already does for rounds. Widen the upper bound to what the settings imply. Use `answer_after`, which moves `answerable_at`, instead of real sleeps for band checks.

### TST-8. A test that waits for a frame that never comes hangs CI for six hours
- **Where:** [server/tests/test_game.py:69](../../server/tests/test_game.py#L69), [.github/workflows/ci.yml:9](../../.github/workflows/ci.yml#L9), [server/pyproject.toml:17](../../server/pyproject.toml#L17)
- **Problem:** `Seat.take` loops over `WebSocketTestSession.receive_json()`, which is `portal.call(receive)` with no timeout. No pytest-timeout is installed, and no job has `timeout-minutes`. A regression like ENG-1 (the timer dies, so no `question_closed` is ever sent) blocks the test forever instead of failing it.
- **Why it matters:** The engine's worst bugs are hangs, and the suite would report them as a CI job cancelled at GitHub's 360-minute default, with no failing test name.
- **Fix:** Add `pytest-timeout` to the dev group with `timeout = 60`, and set `timeout-minutes: 15` on the jobs. Alternatively, give `take` a deadline by receiving through `anyio.fail_after` on the portal.

### TST-9. Nothing fails a run where the database tests skipped
- **Where:** [server/tests/conftest.py:66](../../server/tests/conftest.py#L66), [Makefile:49](../../Makefile#L49), [.github/workflows/ci.yml:30](../../.github/workflows/ci.yml#L30)
- **Problem:** CI does run the database tests today: `DATABASE_URL_TEST` is set at job level, and this run skipped 0. `make test` always passes it, but `make test DATABASE_URL_TEST=` or a CI edit that drops the variable would skip 203 tests and still exit 0 (I checked: `env -u DATABASE_URL_TEST uv run pytest` gives 865 passed, 203 skipped, exit 0). Plain `uv run pytest` in `server/` does the same, since there is no `.env` here. CLAUDE.md says such a run does not count, and nothing enforces that.
- **Fix:** In conftest, if `CI` is set or `--require-db` is passed, turn the skip into a failure. Or add a `pytest_terminal_summary` hook that fails when any test skipped for `DATABASE_URL_TEST`.

### TST-10. Several accept criteria of done tasks are neither tests nor marked manual
- **Where:** [ideas/phase2.md:208](../phase2.md#L208), [ideas/design.md:1131](../design.md#L1131), [ideas/design.md:1154](../design.md#L1154), [ideas/design.md:1181](../design.md#L1181)
- **Problem:**
  - T18: "no component imports another component's internals".
  - T20: "on a 375px phone its list is not hidden behind the keyboard". Also "an examine containing the item name is rejected with the reason": the hand-written `examines.json` replaced the generator, and neither `gen_examine_questions.py` nor `test_examines.py` checks this now. The rejection-rate criteria went with the generator, but the spec was not updated.
  - D1: "first paint is not a flash of the wrong palette".
  - D3: see TST-4.
  - D5: "switching theme mid-question does not disturb the layout or the timer".
  - D7 client: the splash's scene and its fallback, "the lobby list names who is not ready and the splash does not", and "Start asks before starting short of its threshold". No Splash or Lobby test exists.
  - D8: six 56 px gems fit 375 px, the timer bar after a 20 s lock, keyboard reachability with a focus ring.
  - D9: five steps and eight rows at 375 px, "points do not shift horizontally".
- **Why it matters:** CLAUDE.md requires a test or the word "manual". The layout criteria cannot run in jsdom, so today they are unenforced.
- **Fix:** Mark the layout and visual ones "manual" in the spec, or add a Playwright smoke test at 375 px. Write component tests for the D7 Splash and Lobby rules and the D8 keyboard and timer-bar rules. Drop or restore the T20 examine-name rule. That is a spec decision for you.

### TST-11. A test for a new mode costs a copy of test_game.py's private harness, and the harness assumes `more_less`
- **Where:** [server/tests/test_game.py:52](../../server/tests/test_game.py#L52), [test_game.py:110](../../server/tests/test_game.py#L110), [server/tests/rooms_api.py:66](../../server/tests/rooms_api.py#L66), [server/tests/conftest.py:60](../../server/tests/conftest.py#L60)
- **Problem:** `Seat`, `Game`, `table`, `closed_with`, `reseat`, `answer_after` and `updated` live in test_game.py, not in `rooms_api.py`. Another file has to import fixtures from a test module, as my probe did, or copy them. test_ws.py and test_profile.py each already have their own `lobby`, `hello` and `next_of`. `Game.right()` reads `answer_index` and `Game.wrong()` is `1 - right`, which is only true for two options. `fast_settings` defaults to `next(iter(MODES))`, so reordering the Create form's registry changes the type most of test_game.py plays. Every database test creates a database and runs all migrations, which takes 0.2–0.27 s of setup each.
- **Why it matters:** Each of the ~10 planned modes needs a game test (TST-6). Today each one starts by rebuilding this.
- **Fix:** Move the harness into `tests/game_api.py` as fixtures in conftest. Add `right_value(question)` and `wrong_value(question)` per type next to the contract fixtures from TST-3. Pin `fast_settings`' default to `"more_less"` by name. Optionally, migrate one template database per session and `CREATE DATABASE … TEMPLATE` it.

### TST-12. Tests that depend on what the packs happen to contain
- **Where:** [server/tests/test_game.py:1723](../../server/tests/test_game.py#L1723), [test_game.py:467](../../server/tests/test_game.py#L467), [server/tests/test_pick_from_list.py:105](../../server/tests/test_pick_from_list.py#L105)
- **Problem:**
  - `any_value` maps only `multiple_choice`, `closest_number` and `free_text`. Today the NPC files hold only those three (21/13/8 questions). An NPC question of any other type, which architecture §2 allows, raises `KeyError` in `test_an_event_takes_no_answer_before_answerable_at`, but only when the room draws it.
  - The pick_from_list game test takes Woox's "wrong" answer from `room.questions[1:]`. Once an examine entry has two lines (the format supports it and `test_examines.py:119` tests it), the unseeded draw sometimes makes it the right answer.
  - `test_validate_value_refuses_everything_for_a_vocabulary_this_build_lacks` skips itself once T23 writes `npcs.json`.
- **Fix:** Derive the values from the payload through the per-type helper (TST-11). Pick the wrong id as "any vocabulary id that is not `answer_id`". Replace the self-skip with a stubbed vocabulary.

### TST-13. The client's copy of the mode registry is never compared with the server's
- **Where:** [client/src/lib/modes.ts:86](../../client/src/lib/modes.ts#L86), [server/tests/test_random_events.py:60](../../server/tests/test_random_events.py#L60)
- **Problem:** `lib/modes.ts` states `type` for each mode by hand, and `viewFor` quietly draws the fallback for an unknown pair. Random events have a parity test (`test_every_npc_has_copy_on_the_client`). Modes have none.
- **Why it matters:** Each of the ~10 new modes is a place to forget the client entry or give it the wrong type, and the result is a generic card at a quiz night.
- **Fix:** Add a server test that parses `MODES` in modes.ts, or a client test against a JSON dump of `/api/modes`, and asserts the same ids and types.

### TST-14. `MoreLess.svelte` is the only type view without its own tests
- **Where:** [client/src/components/questions/GemChoices.test.ts:174](../../client/src/components/questions/GemChoices.test.ts#L174)
- **Problem:** The mode played most gets two reveal-state tests. Nothing tests that a tap sends the right index, that the buttons hold once answered, or that a player who cannot answer gets no active button. Every other view has these three.
- **Fix:** Add `MoreLess.test.ts` with the same three tests as `PriceIsRight.test.ts`.

## Low
- TST-15 [server/tests/test_game.py:521](../../server/tests/test_game.py#L521) — sleeps 0.2 s and asserts the question is still open, so it cannot fail when an early close is merely slower than that.
- TST-16 [server/tests/test_game.py:562](../../server/tests/test_game.py#L562) — the 12-skip test only passes because skips carry into the next phase. Fixing ENG-2 changes what it proves.
- TST-17 [server/app/rooms/state.py:1276](../../server/app/rooms/state.py#L1276) — promote of an unknown player, promote of an admin, kick of an unknown player, and a kicked player's in-flight `set_profile` or `ready` (1092, 1135) are untested.
- TST-18 [server/app/questions/packs.py:70](../../server/app/questions/packs.py#L70) — the pack loader's error branches (70–111, 140–144) are untested.
- TST-19 [server/tests/test_ws.py:34](../../server/tests/test_ws.py#L34) — `hello` is defined 3 times, `lobby` twice, `closed_with` twice and `read` 4 times across the test files.
- TST-20 [ideas/TODO.md:49](../TODO.md#L49) — T22 is unchecked, but PR #38 merged it. I treated it as done.
- TST-21 [server/.coverage](../../server/.coverage) — an untracked coverage file sits in `server/`, and `.gitignore` does not cover `.coverage`.

## Other reviewers' findings and their tests
- ENG-1 — a test would catch it (monkeypatch `grade` to raise); none exists, and 1393–1394 are uncovered (TST-1).
- ENG-2 — a test would catch it; my probe (two quick skips in `open`) fails today; none exists, and TST-16's test depends on the bug.
- ENG-3 — only with a stubbed slow insert; none exists.
- ENG-4 — a unit test on `custom.envelopes` with `source: "pack"` would catch it; `test_custom.py` checks only defaults and kept fields.
- ENG-5 — a test asserting that `_locks` does not grow on unknown codes would catch it; none exists.
- ENG-6 — a design limit a test cannot catch; `test_modes.py:27` pins the one-type registry.
- TM-1 — same as ENG-6; no test.
- TM-2 — a client test drawing a `price_is_right` question in mode `custom` would catch it; `PriceIsRight.test.ts` uses its own mode only.
- TM-3 — a contract test over `TYPES` would catch the credit half (TST-3); none exists.
- TM-4 — a design limit; not testable until pick-all exists.
- TM-5 — an `ordering` `client_view` test would catch it; the type does not exist yet.
- TM-6 — a shared reveal-card test would catch drift such as the dropped `explanation`; none exists.
- RT-1 — a `ws.ts` test with a fake socket would catch it; none exists (FE-7).
- RT-2 — a test with a socket whose send never returns would catch it; test_ws.py:332 covers a send that raises, not one that stalls.
- RT-3 — a test on the uvicorn command's `--ws-max-size`, or a large first frame, would catch it; none exists.
- RT-4 — a test on the Dockerfile `CMD` or a startup lock would catch it; none exists.
- SEC-1 — same as RT-3; none exists.
- SEC-2 — a test that re-hashes `client_view` with each option as the answer would catch it. test_game.py:267 asserts that the answer is withheld and passes while the id leaks it.
- SEC-3 — a rejoin-after-kick test would catch part of it; none exists.
- SEC-4 — a rate-limit test would catch it; `test_the_lobby_toggle_has_no_limit` asserts the opposite, by design.
- SEC-5 — a test on `vocab.get`'s cache size after unknown names would catch it; none exists.
- SEC-6 — a `free_text` test with an NFKC-expanding answer would catch it; `validate_value` tests are ASCII only.
- SEC-7 — adding bidi and zero-width names to `test_join_name_rules` would catch it; the test has four names, none of them Unicode.
- SEC-8 — a join or websocket rate-limit test would catch it; `test_ratelimit.py` covers the limiter class only.
- DB-1 — adding the index to `INDEXES` in `test_fresh_db_gets_all_tables` would catch it; the list omits it.
- FE-1 — a `normalizeCode` unit test would catch it; `session.ts` has no test.
- FE-2 — a Lobby component test would catch it; none exists.
- FE-3 — layout; needs a browser test at 375 px; none exists (TST-10).
- FE-4 — a component test for a live region or focus move would catch it; none exists.
- FE-5 — maintainability; no test applies.
- FE-6 — an IdentityChip test with no reply would catch it; none exists.
- FE-7 — itself the gap; confirmed, and the D7 splash and lobby criteria fall into it (TST-10).

## Seen outside this area
- engine: when the last unanswered player **disconnects** after the others answered, the question stays open until its timer ends, because `_everyone_answered` runs only on an answer ([state.py:904](../../server/app/rooms/state.py#L904)). My probe shows `phase == "open"` 1 s later. ENG-7 has only the kick case, at low. The disconnect case is the one phones cause, and the test named after it passes (TST-2).
