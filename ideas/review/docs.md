# Comments and docs review

I read CLAUDE.md, all of architecture.md, plan-drift.md, and every file in ideas/ except review-prompt.md. I skimmed design.md, phase2.md and phase2-prompts.md by heading and read the sections cited below. Code on `main` at c753934, plus the uncommitted CLAUDE.md.
Counting covered the 165 tracked .py/.ts/.svelte/.css files under server/app, server/scripts, server/tests and client/src: grep for task IDs (`\b[TD][0-9]{1,2}\b`), section references and commented-out code; an `ast` script for Python docstrings and a regex script for TS/Svelte JSDoc. For "restating the code", I read every comment in the largest file of each area and extrapolated from that sample.

## High

### DOC-1. The House rules tell every session to make the call and not ask, which CLAUDE.md now forbids
- **Where:** [phase2-prompts.md:39](../phase2-prompts.md#L39), [:10](../phase2-prompts.md#L10) (paste the House rules first in every session). Task prompts that hand decisions over: T23 at [:457](../phase2-prompts.md#L457), T24 at [:486](../phase2-prompts.md#L486), T26 at [:551](../phase2-prompts.md#L551).
- **Problem:** The House rule says "make the call, state it in one line at the end, and keep going. Do not stop to ask". CLAUDE.md, since 539b0c9 on 23 Sept, says the opposite:
  - "Tell me where they look wrong or underspecified … and wait for my answers before coding".
  - "Ask before deciding anything a player can see, or anything in the websocket protocol, the database schema, scoring or room settings".

  The T26 prompt then asks the session to "Decide which properties are in scope". That decides which questions players see.
- **Why it matters:** T23–T45 are still to run. Each one starts with this block pasted on top of CLAUDE.md, so every session gets two opposite instructions. Whichever wins, the owner loses the checkpoint that 539b0c9 added.
- **Fix:** Delete the House rules block and its paste instruction, and replace them with "CLAUDE.md applies". In T26, turn "Decide which properties" into "propose the properties and wait". The T23 field set and the T24 alias are internal details, so they can stay.

### DOC-2. The House rules call architecture.md "authoritative and current" and forbid touching ideas/*.md
- **Where:** [phase2-prompts.md:25–26](../phase2-prompts.md#L25), [:38](../phase2-prompts.md#L38)
- **Problem:** The House rules say "Read ideas/architecture.md. It is authoritative and current", and "Do not touch ideas/*.md unless the task says to". CLAUDE.md says:
  - "Read the section you need, not the whole file" (CLAUDE.md:18);
  - "Departing from architecture.md needs my OK. Then update architecture.md in the same PR" (CLAUDE.md:25).

  architecture.md is not current: plan-drift.md lists 29 drift items. Two of them, DRIFT-1 (examines) and DRIFT-3 (standings), cover the next tasks.
- **Why it matters:** A session told the doc is current builds T24's `gen-packs` to the letter, and the result overwrites the hand-written examine pack (DRIFT-1). The same session is told not to fix the doc, so the drift outlives the PR. Reading the whole 1,344-line file also costs the plan usage that CLAUDE.md:18 is there to save.
- **Fix:** This goes with DOC-1's deletion. If any House rule survives, it should quote CLAUDE.md:18 and :25 word for word.

## Medium

### DOC-3. The house comment style produces long function docstrings that copy architecture.md
- **Where:**
  - [selection.py:113](../../server/app/rooms/selection.py#L113) (a 32-line docstring) and [:65](../../server/app/rooms/selection.py#L65) (20 lines);
  - [state.py:659](../../server/app/rooms/state.py#L659) (21 lines) and [:1183](../../server/app/rooms/state.py#L1183) (17 lines);
  - the House rule at [phase2-prompts.md:28–31](../phase2-prompts.md#L28).
- **Problem:** CLAUDE.md:33 says "Docstrings on public functions, one line where possible". Across the Python files:
  - 180 function docstrings run to more than one line, and 24 run to 8 lines or more;
  - `state.py` alone has 15 of 8 lines or more.

  The `place_random_events` docstring is close to a paragraph-by-paragraph copy of [architecture.md:259–270](../architecture.md#L259) (Where / What / Who). The House rule tells sessions to "match that register" of "long explanatory module docstrings".
- **Why it matters:** The same design is kept in two places. When the code or the doc moves, one copy goes stale, as `state.py`'s broadcast docstring did against architecture §1 (DRIFT-4). About ten new modes will copy whichever register they find.
- **Fix:** Cut function docstrings to one line that says what the function promises, and link the design section for the reasoning. Module docstrings can stay long where they explain why. Drop "match that register" (DOC-1).

### DOC-4. Task IDs in 341 lines across 100 files
- **Where:** for example [state.py:19](../../server/app/rooms/state.py#L19), [selection.py:149](../../server/app/rooms/selection.py#L149), [protocol.ts:158](../../client/src/lib/protocol.ts#L158), [test_game.py:612](../../server/tests/test_game.py#L612)
- **Problem:** CLAUDE.md:32 says "no task IDs (T22, D9)". IDs turn up in three ways:
  - in comments and docstrings ("since T16", "before D8", "(D7)");
  - in test section banners ("# --- T10: grading and standings");
  - in test docstrings ("T21 Accept: …").

  The rule arrived in a913a16, and all of these came earlier.
- **Why it matters:** An ID means nothing without phase2.md or design.md open next to it. Phrases like "since T16" and "before D8" record history rather than a reason. A session told to "match surrounding code" copies them.
- **Fix:** One PR per area, following the tables in Part A:
  - Replace each ID with the fact it stands for ("the ready check", "the standings phase").
  - Rewrite "T21 Accept:" as the behaviour it checks.
  - Delete "since Tn" history outright.

### DOC-5. 133 section references don't name a document, and two documents share the same numbers
- **Where:** [main.py:62](../../server/app/main.py#L62) ("Section 4's `any → deleted`" means architecture §4) and [test_app_shell.py:144](../../server/tests/test_app_shell.py#L144) ("Section 4: under 26rem the wordmark hides" means design.md §4). Also [App.svelte:38](../../client/src/App.svelte#L38).
- **Problem:** 165 source lines cite "section N" or "§N", and only 32 say which document. architecture.md and design.md are both numbered 1–10, and the topics collide: §4 is the room lifecycle in one and the top bar in the other, §7 is identity in one and screens in the other. App.svelte:38 says "Section 1 lists `/r/:code/create`", but no section lists it: D2 (27ebbfa) removed that route from architecture §1.
- **Why it matters:** The references break silently whenever either document is renumbered or cut. CLAUDE.md:20 asks for exactly that kind of cut ("same length or shorter"). A bare number is not a "why".
- **Fix:** Where the reference carries the reason, write `architecture.md §4` or `design.md §4`. Otherwise state the rule in the comment and drop the pointer. This goes in the same PR per area as DOC-4.

### DOC-6. The six type modules have no docstrings on `grade` and `validate_value`
- **Where:** [pick_from_list.py:63](../../server/app/questions/types/pick_from_list.py#L63), [more_less.py:56](../../server/app/questions/types/more_less.py#L56), and the same two functions in `price_is_right`, `multiple_choice`, `closest_number` and `free_text`
- **Problem:** Every type module documents `client_view`, `reveal` and `check`, and leaves out the two contract functions a new type has to get right. That is 12 public functions against CLAUDE.md:33.
- **Why it matters:** `ordering`, pick-all-that-apply and about ten modes will be copied from these modules, so the gap gets copied too. This is the contract where credit ranges from 0.0 to 1.0 and where `True == 1` is a trap.
- **Fix:** Give each function a one-line docstring, for example "Credit per player, 0.0..1.0." and "Shape check before storing; bool is not an int."

### DOC-7. random-events.md, the guide for writing the 10 NPCs' owed questions, contradicts the schema and the code
- **Where:** [random-events.md:40](../random-events.md#L40), [:3–6](../random-events.md#L3), [:12–17](../random-events.md#L12), [:134](../random-events.md#L134), [:140–179](../random-events.md#L140)
- **Problem:**
  - It allows `multiple_choice` options "(2–7)". The schema's cap has always been 6 ([question.schema.json:101](../../schema/question.schema.json#L101)).
  - "How many" gives the pre-T22 rule: one slot per round after the first, no repeated faces, and a test that "enforces" roster ≥ slots. Now the frequency sets the windows, the least-used face repeats, and the test only checks that the roster has at least 12 NPCs ([test_random_events.py:36](../../server/tests/test_random_events.py#L36)).
  - It says there are twelve NPCs. The roster has 16.
  - It names Rick Turpentine, who is not on the roster.
  - It ends with a chat prompt pasted in.
- **Why it matters:** DRIFT-5 makes this file the tracker for the 10 NPCs still owed questions. Someone writing to it produces 7-option questions that `validate-packs` then fails.
- **Fix:** Reduce the file to the per-NPC field table, the type table (2–6 options) and the owed list. Point to architecture §1 for placement, and delete lines 3–21 and 140–179.

### DOC-8. plan.md, which architecture.md names as product context, still describes an admin token in the URL
- **Where:** [plan.md:16](../plan.md#L16), [:139–143](../plan.md#L139), [:81](../plan.md#L81), [:22](../plan.md#L22), [:214](../plan.md#L214). It is cited as product context at [architecture.md:3](../architecture.md#L3) and in the T23 prompt at [phase2-prompts.md:438](../phase2-prompts.md#L438).
- **Problem:** plan.md presents these as "Must work" and decisions:
  - "The admin gets admin rights through a link", with a single-use token in the URL. `0002_drop_admin_tokens.sql` removed this, and CLAUDE.md:15 forbids tokens in URLs.
  - Events "at most one per round and never in the first round (T21)". T22 replaced that rule.
  - Rooms live "at least a week". `ROOM_TTL_DAYS` is 3.
  - "5 rooms per hour, stored in cookies". The limit is 10 per hour, and rooms are kept in localStorage.
- **Why it matters:** CLAUDE.md:18 lets architecture win, but architecture.md:3 sends readers to plan.md for product context and does not mark it as history. A session working on T35 (invite links) or T45 (admin view) could take the URL-token design from it.
- **Fix:** Put a two-line banner at the top of plan.md: "History. Superseded by architecture.md; §'Wiki data' still applies." Alternatively, cut plan.md down to Goal and Wiki data.

## Low
- DOC-9 [App.svelte:38](../../client/src/App.svelte#L38): the comment cites "Section 1" for a route that 27ebbfa removed from the doc.
- DOC-10 [architecture.md:389–573](../architecture.md#L389): a 185-line copy of `schema/question.schema.json`, which has already drifted (DRIFT-1). §5's SQL copy has too (DRIFT-17). Link the files instead.
- DOC-11 The versioning rule appears five times: [CLAUDE.md:37](../../CLAUDE.md#L37), [architecture.md:1285](../architecture.md#L1285), [phase2.md:15](../phase2.md#L15), [design.md:1005](../design.md#L1005) and [phase2-prompts.md:33](../phase2-prompts.md#L33). Only CLAUDE.md mentions `uv lock`.
- DOC-12 [games.md:15](../games.md#L15): Guess the Examine is still "from `/mapping`, items only", although the code uses `data/examines.json` (DRIFT-1 lists the other docs). The Price is Right and Guess the Examine are not marked done, although More or Less is.
- DOC-13 [IDEAS.md:18–20](../IDEAS.md#L18) gives the pre-T22 event rules, and [:98](../IDEAS.md#L98) has `/admin?Token=` in a URL. [phase2.md:833](../phase2.md#L833) already corrects the second.
- DOC-14 [new-design.md](../new-design.md): design.md §7.1, §7.4 and D13–D16 absorbed all of it ([design.md:998](../design.md#L998) says so). Mark it as history or delete it.
- DOC-15 [Room.svelte:308](../../client/src/routes/Room.svelte#L308) `<!-- playing -->` and [app.css:129](../../client/src/app.css#L129) `/* The timber. */`: label comments, the only restating comments found in the sample.
- DOC-16 server/tests: 295 of 571 `test_*` functions have no docstring. The names are descriptive, so this is a violation only if the owner means the rule to cover tests.
- DOC-17 [session.ts:41–49](../../client/src/lib/session.ts#L41), [http/rooms.py:57–66](../../server/app/http/rooms.py#L57), [state.py:177](../../server/app/rooms/state.py#L177): exported or public helpers with no docstring.
- DOC-18 [TODO.md](../TODO.md) repeats the task lists from phase2.md and design.md, and is already stale (plan-drift "Contradictions").

## Comments against CLAUDE.md

Columns:
- **IDs:** lines with a T/D task ID.
- **§:** section references; "u" is how many don't name the document (DOC-5 explains why I count these as violations).
- **Long ds:** function docstrings longer than one line; "≥8" is how many run to 8 lines or more.
- **No ds:** public functions without a docstring.
- **Restate:** found in the sample only.

I found no commented-out code: the greps for commented `def`, `import`, `return`, assignments and calls returned nothing but prose.

### Engine (server/app core, questions/ shared modules, types/scoring+bounds)
| File | IDs | § (u) | Long ds (≥8) | No ds | Restate |
|---|---|---|---|---|---|
| rooms/state.py | 16 | 17 (14) | 42 (15) | 11 | 0 of ~60 comments read |
| rooms/settings.py | 9 | 3 (2) | 5 | 1 | |
| ws/protocol.py | 10 | 3 (2) | 0 | 0 | |
| rooms/selection.py | 5 | 0 | 4 (2) | 0 | |
| questions/vocab.py | 2 | 2 (1) | 3 | 1 | |
| http/rooms.py | 1 | 1 (1) | 1 | 4 | |
| main.py | 0 | 1 (1) | 2 (1) | 2 | |
| rooms/scoring.py | 0 | 1 | 5 | 0 | |
| ws/handler.py | 0 | 2 (2) | 2 | 1 | |
| questions/schema.py | 0 | 0 | 3 (1) | 1 | |
| rooms/ready.py | 1 | 1 | 2 (2) | 0 | |
| 14 others (accesslog, config, db, heads, custom, packs, bounds, types/scoring, types/\_\_init\_\_, http/vocab, headers, players, codes, segments) | 2 | 8 (4) | 4 | 9 | |
| **Total (25 files)** | **46** | **40 (27)** | **73 (24)** | **29** | **~0** |

### more_less
| File | IDs | § (u) | Long ds | No ds |
|---|---|---|---|---|
| types/more_less.py | 0 | 0 | 0 | 2 (`grade`, `validate_value`) |
| MoreLess.svelte | 1 | 0 | 0 | 0 |
| **Total** | **1** | **0** | **0** | **2** |

### price_is_right
| File | IDs | § (u) | Long ds | No ds |
|---|---|---|---|---|
| types/price_is_right.py | 0 | 0 | 0 | 2 |
| PriceIsRight.svelte | 1 | 1 (0) | 0 | 0 |
| test_price_is_right.py | 5 | 0 | 0 | 14 |
| **Total** | **6** | **1 (0)** | **0** | **16** |

### pick_from_list
| File | IDs | § (u) | Long ds | No ds |
|---|---|---|---|---|
| types/pick_from_list.py | 0 | 1 (1) | 0 | 2 |
| PickFromList.svelte | 0 | 2 (1) | 0 | 0 |
| PickFromList.test.ts | 1 | 0 | 0 | 0 |
| test_pick_from_list.py | 2 | 1 (1) | 2 | 15 |
| **Total** | **3** | **4 (3)** | **2** | **17** |

### multiple_choice
| File | IDs | § (u) | Long ds | No ds |
|---|---|---|---|---|
| types/multiple_choice.py | 0 | 0 | 0 | 2 |
| MultipleChoice.svelte, MultipleChoice.test.ts | 2 | 0 | 0 | 0 |
| test_multiple_choice.py | 0 | 0 | 0 | 10 |
| **Total** | **2** | **0** | **0** | **12** |

### closest_number
| File | IDs | § (u) | Long ds | No ds |
|---|---|---|---|---|
| types/closest_number.py | 0 | 2 (2) | 1 | 2 |
| ClosestNumber.svelte, ClosestNumber.test.ts | 3 | 0 | 0 | 0 |
| test_closest_number.py | 1 | 0 | 1 | 9 |
| **Total** | **4** | **2 (2)** | **2** | **11** |

### free_text
| File | IDs | § (u) | Long ds | No ds |
|---|---|---|---|---|
| types/free_text.py | 1 | 1 (1) | 0 | 2 |
| FreeText.svelte, FreeText.test.ts | 2 | 0 | 0 | 0 |
| test_free_text.py | 1 | 0 | 1 | 9 |
| **Total** | **4** | **1 (1)** | **1** | **11** |

### Modes and random events
| File | IDs | § (u) | Long ds | No ds |
|---|---|---|---|---|
| client lib/modes.ts | 2 | 2 (1) | 2 | 0 |
| client lib/randomEvents.ts | 4 | 1 (0) | 0 | 0 |
| RandomEvent.svelte, RandomEvent.test.ts | 3 | 0 | 0 | 0 |
| stems/ExamineStem.svelte, AssetStem.svelte | 0 | 2 (1) | 0 | 0 |
| test_modes.py | 4 | 0 | 2 | 3 |
| test_random_events.py | 2 | 0 | 1 | 1 |
| **Total (8 files)** | **15** | **5 (2)** | **5** | **4** |

`server/app/modes/` and `random_events.py` are clean.

### Frontend (the rest of client/src)
| File | IDs | § (u) | Long ds | No ds | Restate |
|---|---|---|---|---|---|
| lib/protocol.ts | 18 | 0 | 0 | 0 | |
| components/TopBar.svelte | 10 | 9 (8) | 0 | 0 | |
| routes/Room.svelte | 8 | 2 (2) | 0 | 0 | 1 (L308) of ~25 read |
| questions/GemButton.svelte | 1 | 5 (5) | 0 | 1 | |
| lib/stores.ts | 3 | 3 (3) | 2 | 1 | |
| components/IdentityChip.svelte | 2 | 4 (4) | 0 | 0 | |
| routes/Join.svelte, routes/Create.svelte | 8 | 3 (3) | 1 | 0 | |
| app.css | 5 | 2 (1) | 0 | 0 | ~4 theme labels |
| lib/ws.ts, lib/session.ts, lib/api.ts, lib/gp.ts | 1 | 5 (4) | 3 | 7 | |
| 38 others, 1–3 each (Scoreboard, names, podium, profile, heads, Lobby, Splash, ThemePicker, TimerBar, App, Head, NamePrompt, PointsSlot, Timer, GemChoices, timerbar, vocab, ready, theme, RevealTally, Question, index, dates, trophies, Home, and 13 test files) | 41 | 25 (19) | 12 | 1 | |
| **Total (48 files)** | **97** | **58 (49)** | **18** | **10** | **~5** |

### Tests (server/tests, except the per-type and mode tests above)
| File | IDs | § (u) | Long ds (≥8) | No ds (helpers / `test_*`) |
|---|---|---|---|---|
| test_game.py | 54 | 10 (10) | 33 | 45 |
| test_rooms.py | 20 | 2 (2) | 5 | 10 |
| test_questions.py | 12 | 1 (1) | 4 | 26 |
| test_migrations.py | 12 | 3 (2) | 5 (1) | 2 |
| test_gen_price_questions.py | 7 | 0 | 0 | 22 |
| test_scoring.py | 4 | 7 (6) | 2 | 28 |
| test_ws.py | 6 | 4 (4) | 1 | 13 |
| test_settings.py | 6 | 1 (1) | 6 | 9 |
| test_app_shell.py | 3 | 5 (5) | 1 | 2 |
| 22 others (selection, player_names, heads, profile, cleanup, themes, vocab, check_contrast, ready, examines, codes, normalize, segments, conftest, rooms_api, static, custom, headers, config, health, ratelimit, version) | 28 | 13 (12) | 28 (2) | 135 |
| **Total (31 files)** | **152** | **46 (43)** | **85 (3)** | **292** (about 73 helpers, the rest `test_*`) |

Restating: 1 in ~40 comments sampled from test_game.py ([:803](../../server/tests/test_game.py#L803), "And a new admin can do admin things").

### Scripts
| File | IDs | § (u) | Long ds | No ds |
|---|---|---|---|---|
| check_contrast.py | 8 | 2 (1) | 1 | 2 |
| loadtest.py | 2 | 5 (5) | 5 | 8 |
| gen_price_questions.py | 0 | 0 | 7 | 7 |
| gen_examine_questions.py | 0 | 1 | 1 | 3 |
| smoke_ws.py, validate_packs.py | 1 | 0 | 0 | 3 |
| **Total (6 files)** | **11** | **8 (6)** | **14** | **23** |

Restating: none among the 41 comments in loadtest.py. Its numbered report steps ("# 1. No error frames.") are labels, and harmless.

**Representative examples.** Task IDs: [state.py:385](../../server/app/rooms/state.py#L385) "the ready check (D7)"; [protocol.ts:291](../../client/src/lib/protocol.ts#L291) "a server from before D8"; [test_rooms.py:177](../../server/tests/test_rooms.py#L177) "T6: sixth create…" (that test was also changed from what T6 says, DRIFT-26). Long docstrings: DOC-3, plus [ready.py:27](../../server/app/rooms/ready.py#L27) (9 lines) and [main.py:61](../../server/app/main.py#L61) (13 lines). Section references: DOC-5. Missing docstrings: DOC-6, DOC-17. Restating: DOC-15.

Overall the comments meet the "why, never what" rule. The violations are almost all task IDs, bare section numbers and docstring length.

## The ideas/ folder

### Status
| File | Status | Reason (checked against code and git) |
|---|---|---|
| architecture.md | Partly outdated | DRIFT-1 to DRIFT-29. §8 (the Phase 1 task list) is history only. |
| design.md | Partly outdated | Current for D6 and D10–D16. The line at :712 contradicts the splash rule (plan-drift "Contradictions"). |
| phase2.md | Partly outdated | Current for T23–T45. T16–T22 are history, and T20/T22 differ from what was built (DRIFT-1, DRIFT-5). |
| phase2-prompts.md | Partly outdated | The House rules contradict CLAUDE.md (DOC-1, DOC-2). The T16–T22 prompts are spent. The T23/T24 prompts still say `/mapping` examine (DRIFT-1). |
| TODO.md | Partly outdated | Says version 0.5.0 (actual 0.6.3) and leaves T22 open (merged in c7887c7). |
| IDEAS.md | History only | Nearly every entry became T31–T45 or a D task, or is done (random events, the ready check, heads, examines). Still unscheduled: font, logo, room lock, teams. |
| games.md | Partly outdated | The source sketches. Guess the Examine's data source is stale (DOC-12). "New game type" is an open decision (TM-1). |
| new-design.md | History only | Absorbed into design.md §7.1, §7.4 and D13–D16. The frequency request shipped in T22 (c7887c7). Committed after it had been absorbed (4deab42). |
| plan.md | History only | Product pitch. Several superseded decisions are still presented as current (DOC-8). |
| random-events.md | Partly outdated | Still needed for the owed NPCs, but its rules are stale (DOC-7). |
| random-events/*.md (6) | History only | Drafts transcribed into `data/packs/random_events/<id>.json` at T22 (c7887c7). No later edits. |
| examine-options.md | History only | The source list for `data/examines.json` (T20, 7f24685 and 966d82c). The same entries are now in the JSON. |
| room-names.md | History only | 191 of its 199 words are in `data/room-words.json`. |

### Sections that duplicate another file
- architecture.md §2 "The schema" (JSON) duplicates `schema/question.schema.json`, and §5 duplicates `migrations/*.sql`. Both copies have drifted (DOC-10).
- architecture.md §1 "Random events" duplicates the `place_random_events` docstring in selection.py (DOC-3), and phase2.md T21/T22.
- architecture.md §8 duplicates TODO.md "Phase 1". Both are history.
- architecture.md §9 intro duplicates phase2.md "What Phase 2 is actually about". Both list what Phase 2 changes.
- architecture.md §10 duplicates CLAUDE.md "Git and PRs", phase2.md intro, design.md §10 and the House rules (DOC-11).
- phase2.md T16–T45 duplicate the phase2-prompts.md task prompts. Each prompt restates its spec's "Do" list, despite the claim at [phase2-prompts.md:14](../phase2-prompts.md#L14).
- IDEAS.md duplicates phase2.md T31–T45 almost item for item (HEAD bug → T31, 6 answers → T32, IPv6 → T33, user agent → T34, password → T35, public lobby → T36, joining → T37, hide rounds → T38, rooms in localStorage → T39, top bar → T40, TzHaar → T41, clue scroll → D13, README → T43, metrics → T44, admin view → T45).
- new-design.md duplicates design.md §7.1 (the stage), §7.4 (the interlude) and D13–D16, and architecture.md §1's `random_event_frequency`.
- games.md's mode sketches duplicate architecture.md §2 "The catalogue". The catalogue wins, but the two disagree on names (DRIFT-6).
- plan.md "Custom room questions" duplicates architecture.md §1 random events and §6 exclusions. plan.md "Wiki data" duplicates architecture.md §9 "Data pipeline" and phase2.md T34.
- random-events.md "One question" duplicates architecture.md §2 schema per type. random-events/*.md duplicates `data/packs/random_events/*.json`.
- examine-options.md duplicates `data/examines.json`, and room-names.md duplicates `data/room-words.json`.
- TODO.md duplicates the task headings in phase2.md and design.md.

### Sections that describe code that no longer exists
Beyond DRIFT-n, which covers architecture.md, phase2.md and design.md:
- **plan.md "Admin and tokens"** and :16: a single-use admin token in the URL. `0002_drop_admin_tokens.sql` removed it; the creator is now admin (architecture §7).
- **plan.md "Data model"** (`rooms.admin_id`, `questions.order`, a 30-day cron): gone. See migrations 0001–0007 and the cleanup task in `main.py`.
- **plan.md:81 and IDEAS.md:18–20**: events "at most one per round, never in the first round" (the T21 rule). T22 replaced it with frequency windows (`selection.place_random_events`).
- **random-events.md "How many"** (one slot per round, roster ≥ slots enforced by a test): replaced by `EVENT_EVERY` windows and least-seen face reuse. The test now asserts only `len >= 12`.
- **games.md:15 and phase2-prompts.md T23 ("/mapping for examine")**: the `/mapping` examine source became `data/examines.json` plus `gen_examine_questions.py` (DRIFT-1).
- **TODO.md:21 and :27** ("admin claim", "claim"): the claim screen is gone. `/r/:code/admin` now only redirects ([App.svelte:10](../../client/src/App.svelte#L10)).
- **IDEAS.md:101–103** (Create still asks for a name): still true in the code. It is T31's job, so not stale.

## House rules vs CLAUDE.md

| # | House rule ([phase2-prompts.md:20–43](../phase2-prompts.md#L20)) | Verdict |
|---|---|---|
| 1 | Read ideas/architecture.md; it is authoritative and current; if the task contradicts it, stop and tell me. | **Contradicts** on how much to read: CLAUDE.md:18 says "Read the section you need, not the whole file." **Covered** on stopping: "Departing from architecture.md needs my OK." "Current" is false (plan-drift). |
| 2 | Read ideas/phase2.md for where the task sits. | **Covered:** "Before starting a T or D task, read its spec and the architecture.md sections it touches." The House rule has no equivalent for D tasks (design.md). |
| 3 | Match the surrounding code: long explanatory module docstrings that say WHY; comments only where a reader would ask; no restating comments. | **Partly covered:** "Comments explain why, never what. No comments restating the code". **Contradicts** on length: "Docstrings on public functions, one line where possible." It also says nothing about the "no task IDs" rule, and "match surrounding code" spreads them (DOC-3, DOC-4). |
| 4 | Tests are not optional; every accept criterion is a test unless "manual". | **Covered:** "Each accept criterion in a task spec is a test unless it says 'manual'." CLAUDE.md adds test-first for bugs and never weakening a test. |
| 5 | Bump VERSION and its two copies: minor per T/D task, patch per fix (§10). | **Covered:** "Every PR bumps the version: minor for a T or D task, patch for anything else … then run `cd server && uv lock`." The House rule leaves out `uv lock`. Its "per task" also clashes with CLAUDE.md's one branch per task (`phase2-t<N>`) for the grouped T31+T32+T34 sessions. |
| 6 | Finish with `make lint test` green. | **Covered:** "`make lint test` must pass before you commit or say you're done." The House rule lacks "A run where database tests skipped doesn't count." |
| 7 | Do not commit unless I ask. | **Missing from CLAUDE.md.** CLAUDE.md:36–38 ("Always branch", PR rules) assumes Claude commits and opens PRs, so the two are in tension. |
| 8 | Do not touch ideas/*.md unless the task says to. | **Contradicts:** "Departing from architecture.md needs my OK. Then update architecture.md in the same PR." phase2.md T31/T40/T41 also tell the task to edit design.md. |
| 9 | If a decision is underdetermined, make the call, state it in one line, keep going; do not stop to ask. | **Contradicts:** "Tell me where they look wrong or underspecified … and wait for my answers before coding" and "Ask before deciding anything a player can see…". It agrees only for internal details ("Decide internal details yourself and list them in your reply"). |

## Seen outside this area
- Nothing new at critical or high beyond what ideas/review/ already lists.
