# Progress

Which tasks have landed. This file is the only status list: the specs and accept criteria
live in [phase2.md](phase2.md) (T-tasks) and [design.md](design.md) (D-tasks), the prompts in
[phase2-prompts.md](phase2-prompts.md), the version in [VERSION](../VERSION), and loose
ideas in [IDEAS.md](IDEAS.md).

## Phase 0 and Phase 1

Done, T1–T15: rooms, joins, the websocket, scoring, restart recovery, the client, the
containers and a 30-bot load test, with More or Less.

## Phase 2 — Custom questions, new modes, the framework

### The framework (T16–T18)

- [x] T16. The mode/type split
- [x] T17. Credit, and the three ways to score it
- [x] T18. The client presentation layer

### Modes that need no new data (T19–T22)

- [x] T19. The Price is Right
- [x] T20. Guess the Examine
- [x] T21. Multiple choice, closest number, free text, and where the host's questions land
- [x] T22. Random events

### Data, then the modes that need it (T23–T29)

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

- [x] T31. Loose ends
- [x] T32. Six options, at most
- [ ] T33. Limits that mean one client, and IPv6 *(server half landed)*
- [x] T34. The wiki's rules, enforced *(must land before T23 makes its first request)*

Who gets into a room, what they keep when it ends:

- [ ] T35. Invite links
- [ ] T36. Public lobbies
- [ ] T37. "Someone is picking a name…"
- [ ] T38. Hidden rounds
- [ ] T39. Finished rooms go home with the players

The chrome:

- [ ] T40. One menu in the top bar
- [ ] T41. The TzHaar theme
- [x] ~~T42. The splash as a clue scroll~~ (superseded by D13)

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
- [x] D8. Question screens
- [x] D9. Standings: the podium and the `standings` phase
- [x] D10. Selfhoster branding
- [ ] D11. Motion and the reduced-motion pass
- [ ] D12. The Party Room theme
- [x] D13. The stage: the host slot and the clue scroll
- [ ] D14. Hosts, and the voice they speak in
- [ ] D15. The random-event NPCs
- [ ] D16. The interlude

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
