# Progress

Current version: `0.3.1` (see [VERSION](../VERSION)). Task descriptions and accept criteria
live in [phase2.md](phase2.md) (T-tasks) and [design.md](design.md) (D-tasks); prompts are in
[phase2-prompts.md](phase2-prompts.md). Loose ideas that haven't become a task yet live in
[IDEAS.md](IDEAS.md).

## Phase 0 — Decisions

Done. Svelte client, FastAPI server, Postgres, containers throughout.

## Phase 1 — Core plus one mode

Done, T1–T15.

- [x] T1 repo scaffold
- [x] T2 containers
- [x] T3 migrations
- [x] T4 question schema and packs
- [x] T5 Price question generator
- [x] T6 room creation and admin claim
- [x] T7 join
- [x] T8 RoomManager core and websocket handshake
- [x] T9 game loop
- [x] T10 scoring and standings
- [x] T11 restart recovery
- [x] T12 client create, claim, join, lobby
- [x] T13 client done alongside T12
- [x] T14 container websocket and deep-link checks in CI
- [x] T15 load test, 30 bots through one room over websockets

## Phase 2 — Custom questions, new modes, the framework

### The framework (T16–T18)

- [x] T16. The mode/type split
- [x] T17. Credit, and the three ways to score it
- [x] T18. The client presentation layer

### Modes that need no new data (T19–T21)

- [x] T19. The Price is Right
- [x] T20. Guess the Examine
- [x] T21. Multiple choice, closest number, free text, and where the host's questions land


### Data, then the modes that need it (T22–T29)

- [ ] T22. Random events
- [ ] T23. The facts importer
- [ ] T24. `make gen-packs`, and the reproducibility gate
- [ ] T25. Bestiary and Drop Table
- [ ] T26. Odd One Out
- [ ] T27. Ordering, and Release Order
- [ ] T28. Sort It Out
- [ ] T29. Who Said That? and Clipped

### The custom-question editor

- [ ] T30. The custom-question editor (includes the NPC picker)

### Everything that is not a mode (T31–T45)

Loose ends:

- [ ] T31. Loose ends
- [ ] T32. Seven options, at most
- [ ] T33. Limits that mean one client, and IPv6
- [ ] T34. The wiki's rules, enforced *(must land before T23 makes its first request)*

Who gets into a room, what they keep when it ends:

- [ ] T35. Invite links
- [ ] T36. Public lobbies
- [ ] T37. "Someone is picking a name…"
- [ ] T38. Hidden rounds
- [ ] T39. Finished rooms go home with the players

The chrome:

- [ ] T40. One menu in the top bar
- [ ] T41. The TzHaar theme
- [ ] T42. The splash as a clue scroll

Running an instance:

- [ ] T43. README
- [ ] T44. Metrics
- [ ] T45. The admin view

### Design track (interleaves with T16–T30, [design.md](design.md))

- [x] D1. Tokens and the theme engine
- [x] D2. The app shell
- [x] D3. Names and the profile popover
- [x] D4. Heads, and changing your mind
- [x] D5. The three themes and the picker
- [ ] D6. Sound
- [x] D7. Splash and the ready check
- [] D8. Question screens
- [x] D9. Standings: the podium and the `standings` phase
- [ ] D10. Selfhoster branding
- [ ] D11. Motion and the reduced-motion pass
- [ ] D12. The Party Room theme

## Phase 3 — Importer, image-based modes

Not started. MOID and Bucket importer, then Zoom Quiz and Name This NPC. Who's That NPC? and
Pixel Hunt wait here too.

## Phase 4 — Go public for our own clan

Not started. Abuse measures, monitoring, docs, clean-machine docker-compose test.

## Phase 5 — Go public for other clans

Not started.

## Phase 6 — Suggestion page and review flow

Not started.

## Phase 7 — Maybe

Not started. Minimap geoguessr, screenshot geoguessr, music.
