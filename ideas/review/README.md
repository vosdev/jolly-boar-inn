# Code review, 24 September 2026

Nine areas, one file each. **Critical:** a player can break security or another player's game, lose data, or hang a room in ordinary play. **High:** a bug players will hit, or a design flaw that blocks ordering, pick all that apply or the ~10 new modes.
At review time: 1,068 server and 179 client tests passed, none skipped, 97% server line coverage.

| Area | File | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Engine core | [engine.md](engine.md) | 0 | 2 | 4 | 10 |
| Types and modes | [types-modes.md](types-modes.md) | 0 | 1 | 5 | 14 |
| Realtime and rooms | [realtime.md](realtime.md) | 0 | 0 | 4 | 7 |
| Security | [security.md](security.md) | 1 | 5 | 2 | 7 |
| Database | [database.md](database.md) | 0 | 0 | 1 | 9 |
| Frontend | [frontend.md](frontend.md) | 0 | 1 | 6 | 13 |
| Tests | [tests.md](tests.md) | 0 | 4 | 10 | 7 |
| Plan drift | [plan-drift.md](plan-drift.md) | 0 | 2 | 5 | 22 |
| Comments and docs | [docs.md](docs.md) | 0 | 2 | 6 | 10 |

## Critical and high

Where a finding spans areas, the other IDs follow it and the owner of the fix is in bold.

- **Critical** [SEC-1](security.md): two 16 MiB websocket frames sent before login run the 512 MB container out of memory. There is no first-frame timeout, socket cap or body cap. Also RT-3. **Security.**
- [ENG-1](engine.md): any exception in a timer step (`grade`, `points_for`, a database blip) stops the timer for good. The room hangs until an admin ends it or the server restarts. Also TST-1, DB-3, types-modes. **Engine.**
- [ENG-2](engine.md): `skip` does not name its phase, so a double-click or two admins skip two phases and everyone scores 0 on the next question. The tests reviewer confirmed it, and TST-16 depends on the bug. **Engine.**
- [TST-2](tests.md): when the last unanswered player disconnects or is kicked, the question stays open until its timer runs out, yet the test named after this case passes. Also ENG-7. **Engine**, with the test in the same PR.
- [TM-1](types-modes.md): a mode has exactly one type, and "no type" also means "not a round". Mixed-type modes and several planned modes cannot be built. Also ENG-6. **Types-modes.**
- [SEC-2](security.md): `question_id` hashes the whole payload, answer included. The reviewer recovered 139 of 139 pack answers while the questions were open. The plan presents the hash as designed. **Security.**
- [SEC-3](security.md): distinct 200/404/410 answers let a script list every live room, fill it, and rejoin after a kick. **Security.**
- [SEC-4](security.md): there is no per-socket message limit, so spammed ready taps and renames load the single worker. Also SEC-8, T33. **Security.**
- [SEC-5](security.md): the `vocab.get` cache and the per-room lock map never shrink, so unauthenticated GETs exhaust memory. Also ENG-5 and database. **Security.**
- [SEC-6](security.md): free-text grading runs NFKC, which can grow the text 18×, then a quadratic Levenshtein on the event loop. One answer took 1.35 s and stalled every room. **Security.**
- [FE-1](frontend.md): a room code typed with a space or hyphen does nothing on Join, and no error appears.
- [TST-1](tests.md): no test covers a failing timer step or the six "room ended while waiting" guards. Part of ENG-1.
- [TST-3](tests.md): nothing tests the rules every type must follow. Per-type tests have drifted: three types never test their pace.
- [TST-4](tests.md): many D-task accept criteria are "tested" by regex over Svelte source, so they pass when the behaviour breaks.
- [DRIFT-1](plan-drift.md): every plan doc still has Guess the Examine generated from `/mapping`. T24, built as written, would overwrite `data/examines.json`. Keep the code; update the plan.
- [DRIFT-2](plan-drift.md): `pick_from_list` never sends `image` while a question is open, because the image id is the answer id. Three planned image modes need it. Keep the code; update the plan and add a "Needs decision" entry.
- [DOC-1](docs.md): the House rule "make the call, do not stop to ask" contradicts CLAUDE.md's Decisions section, and it is still pasted into every session.
- [DOC-2](docs.md): the House rules call architecture.md "authoritative and current", say to read all of it, and forbid editing ideas/*.md.

## Medium and low findings in more than one area

- A socket that died silently still reads as open, so a woken phone freezes and loses answers: RT-1, FE-6. **Realtime.**
- A late `answer_ack` lands on the next question: RT-7, RT-2, frontend. **Realtime.**
- A game that runs past `expires_at` keeps going and refuses every answer: RT-9, DB-9. **Realtime.**
- A NUL or lone surrogate in a free-text answer fails in jsonb, and so does a kicked player's in-flight answer, as a foreign-key error: ENG-13, DB-10. **Engine.**
- A mode removed from `MODES`, or a downgrade, makes stored rooms unloadable: ENG-10, DB-8. **Engine.**
- Event questions: a `price_is_right` event shows no item, and every event lasts 20 s whatever its type: TM-2, TM-7, frontend, DRIFT-12. **Types-modes.**
- The six type views copy the same scaffolding and have drifted: the `explanation` and `subject` are dropped. TM-6, TM-20, frontend. **Types-modes.**
- The client's mode list drifts from the server's: TM-11, TM-12, TM-13, TST-13, DRIFT-6. **Types-modes.**
- Promotion is permanent, and Promote is a one-tap button next to Kick: SEC-11, FE-2. **Frontend** adds a confirm step. "No demote" stays your call.
- architecture.md §1 (broadcasting) and §5 (schema) are stale: RT-11, DB-7, DRIFT-4, DRIFT-16, DRIFT-17, DOC-10. **Plan drift**, which the architecture.md rewrite covers.
- Guess the Examine's source is stale in games.md and the other plan docs: DOC-12, DRIFT-1. **Plan drift.**
- A plain `pytest` run skips 203 database tests and still exits 0: TST-9, the CLAUDE.md "doesn't count" rule. **Tests.**
- Unverified. The security reviewer flagged this and the engine reviewer did not check it: after a restart, any `GET /api/rooms/{code}` (a scanner or link preview) rehydrates a playing room and starts its timer, and with nobody connected the game plays itself to `finished`. **Engine.**

## Suggested PRs

"OK" marks a PR that touches the protocol, schema, scoring, room settings or what players see. CLAUDE.md says to ask before those.

Stability and security first:
1. `ws-limits`: SEC-1/RT-3 frame, body and socket caps and a first-frame timeout; SEC-4; SEC-8. **OK.**
2. `bounded-memory`: SEC-5, ENG-5, and dropping a room's lock on purge and delete.
3. `input-validation`: SEC-6, a length cap before NFKC and a bounded Levenshtein; ENG-13; DB-10; SEC-7, with the name rule in ../review-responses.md. **OK.**
4. `timer-robustness`: ENG-1 with TST-1 first; DB-3; ENG-8; ENG-9, a monotonic clock.
5. `close-and-skip`: TST-2/ENG-7; ENG-2, where a skip names its phase; TST-16; FE-18. **OK** (protocol).
6. `answer-id`: SEC-2, opaque question ids, with the plan updated in the same PR. **OK** (protocol).
7. `room-access`: SEC-3, SEC-14, and checking the unverified rehydrate-on-GET note. **OK.**
8. `deploy-hardening`: RT-4, SEC-9, SEC-10, SEC-12, SEC-13, SEC-15.

Before ordering and pick all that apply:
9. `mode-registry`: TM-1/ENG-6, TM-7, TM-9, TM-10, TM-17, ENG-10/DB-8. **OK** (room settings).
10. `type-contract`: TM-3, TM-8, TM-14, TM-16, ENG-15, and a contract test over `TYPES` (TST-3).
11. `event-questions`: TM-2, TM-15, TM-19, TM-20, FE-11, TST-14. **OK.**
12. `type-views`: TM-4, TM-5, TM-6, TM-18, FE-20.
13. `client-modes`: TM-11, TM-12, TM-13, TST-13, DRIFT-6.
14. `engine-edges`: ENG-3, ENG-4, ENG-11, ENG-12, ENG-14. **OK** (scoring).

Realtime, database, frontend and tests:
15. `reconnect`: RT-1/FE-6, RT-2, RT-5, RT-6, RT-7, RT-8, RT-10. **OK** (the RT-8 version handshake).
16. `db-expiry`: DB-1, an index in a new migration; RT-9/DB-9; DB-2; DB-4; DB-5; DB-6. **OK** (schema).
17. `frontend-fixes`: FE-1, FE-2/SEC-11, FE-3, FE-8, FE-13, FE-14, FE-17, FE-19. **OK.**
18. `frontend-structure`: FE-4, FE-5, FE-7, FE-9, FE-10, FE-15, FE-16.
19. `test-infra`: TST-7, TST-8, TST-9, TST-11, TST-15, TST-19, TST-21 (`.coverage` is left over from this review).
20. `test-gaps`: TST-5, TST-6, TST-10, TST-12, TST-17, TST-18.
21. `svelte-tests`: TST-4, replacing the source regexes with Vitest component tests.

Docs and comments:
22. Plan docs: your rewrites of architecture.md, design.md, phase2.md and phase2-prompts.md cover DRIFT-1 to DRIFT-29 and DOC-1, 2, 7, 8, 10–14 and 18, plus TST-20. Your answers in [../review-responses.md](../review-responses.md) apply.
23. Comment cleanup, one PR per area, for DOC-3 to DOC-6, DOC-9, DOC-15 to DOC-17 and FE-12. Violation counts cover task IDs, section references, and long or missing docstrings; restating comments are rare. The areas are engine (188), more_less (3), price_is_right (23), pick_from_list (26), multiple_choice (14), closest_number (19), free_text (17), modes and random events (29), frontend (183), tests (575, of which 292 are test functions without a docstring, per DOC-16) and scripts (56). Each type's PR adds DOC-6's docstrings on `grade` and `validate_value`.
