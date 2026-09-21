# Phase 2

The task list. Design decisions live in `ideas/architecture.md` (sections 2, 3, 6 and 9);
mode sketches live in `ideas/games.md`. This file does not repeat either — it says what to
build, in what order, and what "done" means. The prompt to hand each task to is
`ideas/phase2-prompts.md`, one per task, in the same numbering.

Phase 2 ships **ten new game modes, the framework that makes an eleventh cheap, and the
random events that carry the host's own questions.** It assumes T1–T15 are done and does
not depend on anything they left open.

Each task is one working session, ends with `make lint test` green, and leaves the app
playable. Nothing here is a refactor you cannot stop after.

## What Phase 2 is actually about

Four things, and the first three are in an order that is not negotiable:

1. **T16–T18, the framework.** A mode stops being a question type. Scoring stops being
   "right or wrong, times how fast". The client stops having one component per type. No new
   mode ships in these three tasks and the game plays identically before and after, which is
   how you know they landed.
2. **T19–T22, the modes that need no new data.** The Price is Right and Guess the Examine
   come out of the two API endpoints T5 already calls. Custom questions need no data at all.
   Four modes, zero crawling.
3. **T23–T29, data, then the modes that need it.** The importer, then six modes generated
   from what it fetches.
4. **T30, random events.** The presentation the host's questions have been waiting for
   since T21, and the reason a pack question may interrupt a round it does not belong
   to. It only needs T21, and it is written last because an event drawing from one
   unpicked mode is a thinner thing to test and a duller thing to play than one drawing
   from ten.

Images stay in Phase 3. Every mode below is playable on text alone; Who's That NPC? and
Pixel Hunt are the two that are not, and they wait.

**Pack sizes are roster-bound, not targets.** `data/popular-items.json` is 176 items today
and `ideas/games.md` wants 300 before Pixel Hunt is worth playing. Every item-derived mode
scales off that one file, so the accept criteria below ask a generator to report what it
used and what it rejected rather than to hit a number it cannot reach. Growing the roster
is a separate, parallel job that makes six modes better at once, and it is the single
highest-leverage thing anyone can do to this repo without writing code.

## Dependencies

```
T16 mode/type split
 ├─▶ T17 scoring ──┐
 └─▶ T18 client    │
          │        │
          ├────────┴─▶ T19 price_is_right ─┐
          │            T20 free_text ──────┤
          │            T21 mc + number ────┼─▶ T22 custom editor
          │                                └─▶ T30 random events
          │
          └──────────────────────▶ T23 importer
                                      │
                                      ├─▶ T24 gen-packs umbrella
                                      │     ├─▶ T25 bestiary + drop_table   (needs T21)
                                      │     ├─▶ T26 odd_one_out             (needs T21)
                                      │     ├─▶ T27 ordering + release_order
                                      │     └─▶ T28 sort_it_out             (needs T27)
                                      └─▶ T29 quotes packs                  (needs T21)
```

T16 is the only task everything waits on. T23 can start any time after T16 and is the long
pole, because it is the one task with a network dependency and an unknown — run it early if
two people are working. T30 is last in the file but free after T21; it is the other one to
pull forward if there is a second pair of hands, because it is the only task in Phase 2 that
changes how the game feels rather than what it knows.

## The tasks

### T16. The mode/type split

The framework. `ideas/architecture.md` section 2 has the design and the mode catalogue.

Server: new `app/modes/` with the `Mode` dataclass and the `MODES` registry; `mode` becomes
a required field on the question envelope in `schema/question.schema.json`;
`0006_question_mode.sql` adds `questions.mode` backfilled from `type`; `selection.py` pools
by mode instead of by type; `segments.py` groups on `mode`; `settings.py` validates
`modes[].mode` against `MODES` instead of `TYPES`; `GET /api/modes` serves mode ids with
their type and bounds; `Segment.mode` and the new `OpenQuestion.mode` carry mode ids.
`validate_packs.py` rejects an unknown mode or a type that disagrees with its mode's.

Client: `lib/modes.ts` grows `type` per mode; `protocol.ts` follows the wire.

`more_less` stays the only mode, and its mode id and type id are the same string, so
`data/packs/prices.json` needs one added field per entry and no regeneration.

**Accept:** every existing test passes after mechanical updates, with no test deleted;
a room created before the migration rehydrates and plays (migration test asserts
`mode = type` on its rows); `validate_packs.py` fails a question with `mode: "drop_table",
type: "more_less"`; `GET /api/modes` returns `[{"id": "more_less", "type": "more_less",
"questions": {...}, "seconds": {...}}]`; a full game still runs end to end.

### T17. Credit, and the three ways to score it

`ideas/architecture.md` section 6.

`grade()` returns `dict[UUID, float]` credit for every type. `Scoring` (`SPEED`, `RANK`,
`STEP`) moves into `questions/types/scoring.py`; `rooms/scoring.py` gains `step()`,
`step_points()` and the single `points_for(scoring, credit, band, steps)`. `answer_ack`
replaces `bucket` with `scoring` and `band`. `PlayerResult` gains `credit`. `answers.correct`
becomes `credit >= 1.0`.

No new type and no new mode. `more_less` scores exactly what it scored yesterday.

**Accept:** table-driven tests for all three strategies including every bucket edge that
T10 already covers, unchanged; `credit = 0.6` in bucket 2 scores 540; `step_points` over
8 steps gives 1000 down to 400 and a 1-step question gives 1000; `RANK` ignores elapsed
time entirely; a game of `more_less` produces byte-identical standings to before.

### T18. The client presentation layer

The half of the split that decides what a screen looks like.

`components/questions/` splits into `types/` (the answer affordance — buttons, a text box, a
draggable list) and `stems/` (what sits above it — a prompt, an item render, a chatbox
quote). `Question.svelte` composes one of each. `index.ts` exports `viewFor(type, mode)`:
the mode picks the stem, the type picks the affordance, and either falling through leaves
the honest "this build cannot draw that" that `Room.svelte` already handles.
`MoreLess.svelte` moves to `types/` and keeps drawing its own whole question — it is the
one mode where the stem and the affordance are the same two buttons.

**Accept:** `more_less` renders and plays identically, verified by playing a round; a mode
whose stem is missing renders the type view alone rather than erroring; a type with no view
renders the fallback; `pnpm check` clean; no component imports another component's internals.

### T19. The Price is Right

Mode `price_is_right` on type `price_is_right`. Four prices, one right.

Type module with `check()` asserting `options[answer_index]` equals the subject's stored
price. `lib/gp.ts` formats coins the way the game writes them (`999`, `12,500`, `100k`,
`1.6M`) with tests. `PriceIsRight.svelte` and an `AssetStem`. Distractors are generated
around the real price per `ideas/games.md`: rounded, and one of the five shapes (3 higher,
2 higher + 1 lower, and so on) so the answer is not always in the same position.

Generated into `data/packs/prices.json` alongside the `more_less` questions, from the same
`/mapping` + `/latest` fetch.

**Accept:** gp formatting table tests including the boundaries (99,999 / 100,000 /
9,999,999 / 10,000,000); `check()` rejects a payload whose answer is not the stored price;
no generated question has two options within 5% of each other; answer position is roughly
uniform across the pack; ~100 valid questions.

### T20. Guess the Examine

Mode `guess_examine` on type `free_text`. The examine text is already in `/mapping`.

`questions/normalize.py` (lowercase, NFKC, trim, collapse whitespace, strip punctuation,
Levenshtein, the under-4-characters rule). `free_text` type module reading the optional
`subject` for the reveal. `ExamineStem` and `FreeText.svelte`. Generator emitting
`data/packs/examine.json`.

The generator's real work is rejection, not selection: an examine that contains the item's
own name, or any word of it longer than three characters, is not a question. "A sharp
sword." is fine; "An abyssal whip." is the answer written on the card.

**Accept:** normalisation tests including "Jad" not accepting "Jam"; an examine containing
the item name is rejected with the reason; `accepted` carries the obvious aliases; a
full-name typo one character out is accepted and a different item's name is not; the
generator prints how many roster items it used, how many it rejected and why, and the
rejection rate is under a third.

### T21. Multiple choice, closest number, and where the host's questions land

The two remaining simple types, plus everything random events need on the server. The
*presentation* is T30. Until that lands an event plays as an ordinary question that happens
to interrupt a round, which is odd to look at and not broken — the same deal T16–T18 made.

`multiple_choice` and `closest_number` type modules. Mode `custom` with `type = None`,
and it is never a round. `POST /api/rooms` accepts `custom_questions`, validates each
against the schema, stores them with `source = 'room'`, `mode = 'custom'` and
`author_player_id`. `0007_random_events.sql` adds `questions.random_event` and swaps
`settings.order` for `random_events` and `random_event_seconds`. `selection.py` gains
`place_random_events()`: never the first round, never a round's first question, one per
round, a distinct NPC each time — four rules that between them cap the host at one fewer
question than they picked modes, which `NewRoomSettings` enforces rather than
truncating. `segments.py` groups an event into the round it interrupts instead of
splitting that round in three. `app/random_events.py` holds the NPC ids; their names and
lines are client copy, as mode copy already is. Author exclusion, which T10 built and
nothing has called yet, gets its first caller.

**Accept:** three custom questions in a four-mode room land in three different rounds,
none of them the first round and none at a round's first position, seeded and asserted;
five custom questions in a three-mode room give 422 naming the limit and the count, and
create no room; `random_events: true` with no custom questions still draws pack events,
never from the mode of the round they interrupt; `segments_of` reports four rounds and
not seven for a four-mode room holding three events; the author gets `excluded` on their
own question and scores 0 while everyone else scores normally; `host_only` scores nobody
and still shows; a payload that fails the schema gives 422 naming the field and creates
no room; a room created before `0007` rehydrates and plays its custom round unchanged;
`closest_number` ranks correctly with ties.

### T22. The custom-question editor

Client only. `/r/:code/create` gets a form per custom type, a list of what has been added,
edit and remove, and JSON export/import of the room's own questions.

It also enforces the room's event cap — a host with four modes may write three questions —
because a 422 after filling in a fifth question is the wrong place to learn the rule, and the
form knows how many modes are selected.

This is the one task in Phase 2 that blocks nothing. If Phase 2 has to be cut short, cut it
here: T21 means a host can already post custom questions with `curl`, and every later task
ignores this one.

**Accept:** add, edit, remove and reorder for all three custom types; export then import
round-trips to a byte-identical file; import rejects a bad file with a readable message and
changes nothing; the editor refuses to submit what the server would 422, the event cap
included, and says which of the two limits it hit; `pnpm check` clean.

### T23. The facts importer

`scripts/fetch_facts.py`, `make fetch-facts`. The first task that touches the network.
`ideas/plan.md` has the source list and the etiquette; architecture section 9 has the shape.

Writes `data/facts/items.json`, `npcs.json`, `quests.json` and `manifest.json`. One request
per second, descriptive User-Agent with contact details, `If-Modified-Since`, resumable
across runs, and a `--from-dir` that replays saved responses so tests and later generators
never need the network. Bucket API for infobox and drop data; `/mapping` for examine and
high alch; MediaWiki generators for the rest, 50 titles a request.

Never called at app startup, in CI, or during a quiz — the rule `gen_price_questions.py`
has had since T5.

**Accept:** a full run against recorded fixtures produces all four files offline; manifest
checksums match the files; an interrupted run resumes without refetching what it already
has; a second run against unchanged upstream rewrites nothing; the rate limiter is
asserted, not just written; no test hits the network.

### T24. `make gen-packs`, and the reproducibility gate

The umbrella the mode generators plug into. `scripts/gen_packs.py` + `scripts/generators/`.
`gen_price_questions.py` becomes `generators/prices.py` and keeps its offline file flags.
T19's and T20's generators move under it too.

`make gen-packs CHECK=1` regenerates every pack into a temporary directory and diffs against
the committed files, and CI runs it. A generator edited without its pack regenerated is the
failure mode a committed generated file always has, and this is the one cheap way to catch
it.

**Accept:** `make gen-packs` reproduces every committed pack byte for byte from committed
facts; `CHECK=1` exits non-zero after a one-line generator change and names the pack; CI
runs it; no generator opens a socket.

### T25. Bestiary and Drop Table

Two `multiple_choice` modes from `facts/npcs.json`. First two modes off the importer.

Bestiary asks combat level, release year, quest, location or weakness. Drop Table asks which
of four bosses drops an item.

Distractors are the whole task. `ideas/games.md` names the trap: pick three random bosses
for a Drop Table question and one of them may also drop the item. The generator checks every
distractor against every NPC's drop list and rejects the question rather than the distractor,
because a question that needed three tries to find a safe fourth option is a question about
an item nobody associates with a boss. Bestiary distractors come from the same band as the
answer — a combat level within a factor, a release year within a few — so the answer is not
the one that looks different.

**Accept:** no Drop Table question has a distractor that also drops the item, asserted over
the whole pack; no Bestiary distractor equals the answer; combat-level distractors are inside
the declared band; `check()` re-derives every answer from `facts/npcs.json`; both modes
playable end to end.

### T26. Odd One Out

Mode `odd_one_out` on `multiple_choice`, from `facts/items.json` properties.

Four subjects, three sharing a property, one not. The shared property is stored and shown in
the reveal, because "why?" is the whole payoff and a reveal that only highlights a button
does not answer it.

The generator's obligation is that the odd one is odd *once*: if three items are members-only
and the fourth is not, but that fourth is also the only one that stacks, there are two right
answers and neither is wrong. It checks every property it knows about before emitting.

**Accept:** every generated question has exactly one item differing on exactly one known
property, asserted over the whole pack; `check()` re-derives the odd one; the reveal names
the shared property; the generator reports how many candidate quartets it considered and
how many survived.

### T27. Ordering, and Release Order

The last new type. `ideas/architecture.md` section 2 has the payload and why it stores both
`rank` and `answer`.

`ordering` type module: credit is the fraction of entries in the right place, ties on `rank`
accepted in either order, `check()` refusing a payload whose `answer` disagrees with `rank`
or whose entries all tie. `Ordering.svelte` — a list you reorder, working with a mouse and
with a thumb, with the `ends` labels at either end so the direction is never in doubt. Mode
`release_order` generated from quest and NPC release dates.

**Accept:** three of five in the right place scores credit 0.6, and with bucket 2 that is
540 points; two entries sharing a rank score full credit in either order; `check()` rejects
an `answer` that does not sort by `rank`; the component is usable one-thumbed on a 375px
viewport; partial credit shows in the reveal as "3 of 5".

### T28. Sort It Out

Mode `sort_it_out`, same `ordering` type, everything that is an order but not a date.

`data/facts/sequences.json` is hand-curated and the only facts file the importer does not
write: gem tiers, metal tiers, and the other orderings the wiki states nowhere in a form
worth parsing. Combat-level and quest-length orderings are generated from the fetched facts.
Each sequence carries the prompt that suits it, so a round asks "weakest to strongest" for
monsters and "cheapest to most valuable" for gems rather than one sentence that fits neither.

**Accept:** sequences validate against a schema of their own and `check()` rejects one with a
gap or a duplicate rank; generated combat-level questions never put two monsters of equal
level in a forced order; at least six curated sequences and ~60 generated questions; a round
of Sort It Out and a round of Release Order in one game show different prompts and different
splashes.

### T29. Who Said That? and Clipped

Two `multiple_choice` modes, hand-authored, and the first content this project cannot
generate.

`data/packs/quotes.json` plus `data/packs/AUTHORING.md`: how to write a pack entry by hand,
what makes a good distractor, and how to run `make validate-packs` before opening a PR. This
is the file a contributor reads first when Phase 6 opens submissions, so it is worth the
hour.

`ideas/games.md` asks for at least 20 Clipped entries and says community help will be
needed. Ship what can be written honestly and let the pack grow; a mode with 8 questions
gives a short round, which `selection.py` already handles.

**Accept:** no quote attributable to two of its own options; every entry has a source
(quest name, or the clip); ≥20 `who_said_that` and ≥15 `clipped`; `make validate-packs`
green; `AUTHORING.md` walks someone from a blank file to a passing validation.

### T30. Random events

The task that makes T21's storage look like something. `ideas/TODO.md` has the
idea; architecture sections 3 and 4 have the mechanism.

Server: `OpenQuestion` gains `random_event` — the NPC id, null for a question nobody is
interrupting — and `answerable_at`, when the buttons appear. `ends_at` becomes
`answerable_at + seconds`, `elapsed` is measured from `answerable_at`, and an answer
arriving before it is `not_open`. The splash rule moves from "a new mode" to "a new
segment", so an event gets no splash and the question after it gets no second one.

Client: `lib/random_events.ts` carries the roster's copy — the NPC, the line they open
with, the asset — and `RandomEvent.svelte` draws the NPC and the question stem, holding
the answer affordance back until `answerable_at` and counting to it off `server_time`
rather than the local clock.

Write a dozen events. They are the cheapest content in this project and the one place it gets
to be funny: a Sandwich Lady who wants to know the high alch of a dragon scimitar is the whole
joke, and it costs three lines of TypeScript. The roster is also the thing a selfhoster will
want to add to first, so keep it one flat array with no cleverness in it.

**Accept:** an event is not answerable before `answerable_at` and the server says
`not_open`; a player who answers the instant the buttons appear gets bucket 1, so the
wait costs nobody a point; `ends_at - answerable_at` equals the round's own `seconds`;
no splash runs for an event and none runs for the question after it; a reconnect inside
the held-back window lands on the NPC card with the right remaining delay;
`random_event_seconds: 0` plays an event as a plain question, which is what most tests
run; an unknown random_event id renders the generic card instead of erroring. Manual:
play a four-mode room with two custom questions and watch where they turn up.

## Deliberately not in Phase 2

- **Images, and the two modes that need them.** Who's That NPC? and Pixel Hunt are Phase 3,
  behind the asset pipeline and the open decision at the end of `architecture.md` about
  where asset files live given a read-only container. The `pick_from_list` type, the vocab
  endpoint and `steps` are all specced in architecture sections 2, 3 and 6 so that Phase 3
  is a pipeline and two components, not another framework change.
- **Design.** The OSRS theme, the ready-check replacing the splash countdown, and the
  round-only leaderboard are all in `ideas/TODO.md`. The last two are state-machine changes
  rather than styling, and want their own tasks. Random events were the fourth item on that
  list and turned out to be cheap enough to pull in as T30, because the custom questions it
  carries had to land somewhere in T21 either way.
- **The `more_less` reveal bug** in `ideas/TODO.md`, where a player who did not answer sees
  a green-outlined button. It is a Phase 1 bug in T13's work; fix it there, not here.
