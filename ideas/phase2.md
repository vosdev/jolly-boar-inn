# Phase 2

The task list. Design decisions live in `ideas/architecture.md` (sections 2, 3, 6 and 9);
mode sketches live in `ideas/games.md`. This file does not repeat either — it says what to
build, in what order, and what "done" means. The prompts to hand the tasks to are in
`ideas/phase2-prompts.md`, one per session. Most sessions are one task. The small ones are
grouped: T31 + T32 + T34, T35 + T37, T36 + T38, T41 + T42 and T44 + T45.

Phase 2 ships **ten new game modes, the framework that makes an eleventh cheap, and the
random events that carry the host's own questions.** It assumes T1–T15 are done and does
not depend on anything they left open. Behind the modes, T31–T45 are what the first
playtests and `ideas/TODO.md` asked for: loose ends, who gets into a room, a tidier top bar,
and the tools for running an instance. None of them touch a mode.

Each task is one working session, ends with `make lint test` green, and leaves the app
playable. Nothing here is a refactor you cannot stop after.

## What Phase 2 is actually about

Five things, and the first three are in an order that is not negotiable:

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
5. **T31–T45, everything that is not a mode.** Four groups: loose ends (T31–T34), who gets
   into a room and what they keep when it ends (T35–T39), the chrome (T40–T42), and running
   an instance (T43–T45). They interleave freely with T16–T30 and with the D-tasks in
   `ideas/design.md`. T34 is the one with a deadline: it has to land before T23 sends its
   first request to the wiki.

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

T31–T45 hang off almost nothing in the list above:

```
T31 loose ends                 (none; its reveal fix is void if D8 lands first)
T32 seven options, at most     (none; T27 must respect it)
T33 per-client limits + IPv6   (none)
T34 wiki User-Agent ──────────▶ T23 importer
T35 invite key ───────────────▶ T36 public lobbies
T37 picking a name…            (D4)
T38 hidden rounds              (T21, for events inside a hidden round)
T39 finished rooms go home     (D9, for the component it reuses)
T40 one top-bar menu ─────────▶ T41 TzHaar theme       (T40 needs D5 and D6)
T42 clue-scroll splash         (D7)
T43 README                     (last of T33/T34/T44/T45, since it documents their env)
T44 metrics ──────────────────▶ T45 admin view
```

Three of them revise something `ideas/design.md` marks as decided: T31 removes the name
field from Create (§5.1.1), T40 folds the top bar's controls into one menu (§4), and T41
adds a theme that has to stand apart from `wilderness` (§1). Each of those tasks updates
the design document in the same change, so the two files never disagree for longer than a
PR.

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
around the real price per `ideas/games.md`: rounded, and one of the four shapes (3 higher,
2 higher + 1 lower, and so on — three wrong prices split above and below admit no fifth)
so the answer is not always in the same position.

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
per second and the operator's User-Agent, both through T34's `scripts/wiki.py`, `If-Modified-Since`, resumable
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

---

The tasks below are not modes. Each is still one session, still ends with `make lint test`
green, and still leaves the app playable.

### T31. Loose ends

Three small things from `ideas/TODO.md` that each fit in an afternoon.

**`HEAD` on the API.** `HEAD /api/modes` is a 404 while `GET` is a 200: FastAPI's
`@router.get` registers `GET` alone, so a `HEAD` falls through to the static catch-all in
`static.py`, which knows `/api/*` is not a file. Uptime checkers and `curl -I` send `HEAD`.
Every `GET` route under `/api` answers `HEAD` with the same status and headers and no body.
Do it once, in one place, not per route.

**Create stops asking for a name.** The name moved to the top bar in D3, and Create still
carries its own `NameField`. It comes out: the host goes in under their profile name, and a
browser with no profile is handled the way Join handles it since D4 — a generated name
becomes the profile, and the chip nudges once. That reverses design.md §5.1.1's "an empty
profile blocks Create", so the task updates that line and its entry under "Decided".

**The unanswered `more_less` reveal.** A player who did not answer sees one button outlined
in green, as if they had picked it, over "No answer from you this round, so no points".
D8 owns this and lists it in its accept criteria. If D8 has landed, drop this item; if not,
fix it here, so a known bug does not wait on a redesign.

**Accept:** a test walks every `GET` route under `/api` and asserts `HEAD` gives the same
status and headers with an empty body; `HEAD` on an unknown `/api` path is 404 and on a
`POST`-only one is 405; Create has no name field and the created host carries the profile
name; a browser with no profile creates a room in one tap and is nudged once; an
unanswered `more_less` question shows no button as pressed, and the verdict text still says
nobody answered.

### T32. Seven options, at most

There are seven gems, sapphire to zenyte (design.md §2), and every answer button is one of
them. So no question may offer more than seven choices, of any type, from any source.

The cap lives in the schema as one shared definition and every array of choices references
it: `multiple_choice.options` goes from 6 to 7, `price_is_right` stays at 4, and T27's
`ordering.entries` and Phase 3's `pick_from_list` inherit it when they land. A custom
question with eight options is a 422 at room creation. The T22 editor reads the cap from the
schema like every other limit.

**Accept:** a test walks `schema/question.schema.json` and fails any choice array whose
`maxItems` exceeds 7 or is missing; an eight-option custom question is a 422 naming the
field; `validate-packs` rejects an eight-option pack entry; a seven-option
`multiple_choice` question plays and every button draws a different gem.

### T33. Limits that mean one client, and IPv6

`ROOMS_PER_IP_PER_HOUR` keys on the client address, and behind a proxy that address is the
proxy's until `FORWARDED_ALLOW_IPS` names it. `.env.example` and the Dockerfile say so, and
nobody reads either before the first "too many rooms" on a quiz night. Documenting it
harder will not help. Three changes will:

1. **Say so at runtime.** The first time a request arrives carrying `X-Forwarded-For` from
   an address uvicorn does not trust, log one warning naming the address and the variable
   to set. It fires once per process, because the fix is one line in `.env`.
2. **The server limit is a backstop.** Raise the default to 30 an hour. The everyday limit
   moves to the client: `plan.md` wants a host to have at most five rooms at once, and the
   Home page already lists the rooms this browser created. Create refuses a sixth and
   points at the list, where each room already has a Remove button. It is bypassable. The
   client-side limit is the polite one, and the server's catches the rude one.
3. **IPv6.** A household gets a /64, so an IPv6 address alone limits nobody. The limiter
   keys IPv6 on its /64 and IPv4 on the address, and folds `::ffff:a.b.c.d` into the IPv4
   it is. `APP_BIND` accepts an IPv6 address, `FORWARDED_ALLOW_IPS` is documented with a
   v6 range, and the container listens dual-stack. The healthcheck keeps working on
   `127.0.0.1`.

**Accept:** the warning fires once for an untrusted `X-Forwarded-For` and never when the
header is absent or trusted; two addresses in one /64 share a bucket and two in different
/64s do not; `::ffff:192.0.2.1` and `192.0.2.1` share one; Create with five live rooms in
`jbi:created` refuses and links Home, and removing one lets the sixth through; a room that
410s is dropped from `jbi:created` rather than counted; manual: `curl -6` reaches a
compose deployment with `APP_BIND=::1`, and say what you ran.

### T34. The wiki's rules, enforced

The OSRS Wiki allows automated access with a descriptive User-Agent and at most one request
a second. `gen_price_questions.py` hard-codes a User-Agent that names this repo, so every
selfhoster who runs it reports as the upstream project. That is the wrong way round.
design.md §9.1 already says the download scripts must refuse to run without one.

`scripts/wiki.py` is the one module every network-touching script imports: it reads
`WIKI_USER_AGENT` from the environment (and `.env`), refuses to send a request without it,
and throttles to one request a second per process. `gen_price_questions.py` moves onto it
now. T23's importer and Phase 3's `fetch-assets` are written against it from the start.
Offline flags (`--mapping-file`, `--from-dir`) need no User-Agent, because they send
nothing.

**Accept:** a network run with `WIKI_USER_AGENT` unset exits non-zero before its first
request, and the message says what to set and gives an example; offline runs are
unaffected; the throttle is asserted with a fake clock, not a real sleep; a grep test fails
any script under `server/scripts/` that calls `urllib.request.urlopen` or `httpx` without
going through `wiki.py`; `.env.example` documents the variable with the wiki's own wording
for what a good one looks like.

### T35. Invite links

Room codes are words, and words can be guessed. A host who does not want strangers
wandering into the middle of their clan night ticks **Invite link only** on Create. Such a
room has a key, and only a link carrying that key joins it.

The key is `secrets.token_urlsafe(9)`, stored on the room and sent to admins only, in
`welcome` and in `room_updated`. It is not a secret the way a session is: it is a door
code. So it may sit in a link. It sits in the fragment, though, not the query string:
`/r/DRAGON#k=…`. The fragment never reaches the server, the access log or a `Referer`,
which is architecture §7's rule in the one form a shareable link can keep. The Join page
reads the fragment and puts the key in the join body. A link with no key, or the wrong
one, lands on a prompt asking for it, not on an error.

An admin can **rotate** the key from the lobby. The old link stops working, and everyone
already in the room keeps their session. That is also the answer to `ideas/TODO.md`'s
"lock the room": rotating a key nobody else has is a lock, so there is no separate lock
toggle.

**Accept:** a keyed room refuses a join without the key or with a wrong one (403
`key_required` / `bad_key`), and the Join page asks rather than erroring; the correct key
joins; a session reconnect never needs the key; rotating it refuses the old link and
disconnects nobody; a non-admin's `welcome` and `room_updated` never carry the key; the
copied share link puts the key after `#`, and the access-log test proves it never shows up
server-side; a room without the tick behaves exactly as today; a room created before the
migration has no key.

### T36. Public lobbies

A host can tick **List publicly** on Create, and the Home page lists those rooms for anyone
to join. The idea comes from selfhosters, and it is worth the most to them: a clan instance
where the Home page shows tonight's room is one link fewer to paste into Discord.

- Listed while `lobby` or `playing`, and not full. It drops off when the game finishes.
  Each entry shows the code, the host's name and head, the player count, and the round
  count. Round names are shown only if the room does not hide them (T38).
- `GET /api/rooms/public`, capped at 50 rooms, newest first, cached for a few seconds. It
  is the one endpoint in the app that shows a stranger rooms they were not given, so it
  gives nothing a join would not.
- A public room cannot have an invite key (T35). The form makes them mutually exclusive
  and the server refuses both.
- A room with custom questions defaults to unlisted, as `plan.md` asks. The host can still
  tick the box. The tick is theirs to make.
- `PUBLIC_ROOMS=false` in the environment turns the feature off for an instance: the tick
  disappears and the endpoint returns an empty list. It defaults on; the public instance sets it
  off until Phase 4's abuse measures exist.

**Accept:** a public lobby appears on another browser's Home within the cache window and
disappears when the game finishes; an unlisted room never appears; public + key is a 422;
`PUBLIC_ROOMS=false` hides the tick and serves `[]`; a hidden-rounds public room lists no
mode names; the list never carries a session, a key or a question.

### T37. "Someone is picking a name…"

Since D4 a player joins first and names themselves after, which is right for the player
and briefly confusing for the room: the lobby shows `Cow31337Killer42`, the host presses
Start, and a second later the room learns that was Dave, who was still typing. The host
should be able to see someone is mid-rename and wait.

`PlayerView` gains `editing: bool`, held in memory like `ready` and never persisted. The
client sends `editing {on}` when the profile popover opens on a joined player and
`editing {on: false}` when it closes. A `set_profile`, a disconnect, or 60 seconds of
silence clears it. The lobby shows the player dimmed with "picking a name…" under their
head, and the splash's heads row gives them a pencil in place of the tick.

It is information, not a gate. An editing player still counts toward the ready threshold,
and Start does not wait for them.

**Accept:** opening the popover shows "picking a name…" to every other browser within a
frame of `room_updated`, and saving or closing it clears the label; a disconnect clears it;
a flag left on for 60 seconds clears itself; a rename while editing lands with the flag
already off; nobody else's ready count or Start button changes; spamming open/close is
limited the way `ready` is, so it cannot flood the room with `room_updated`.

### T38. Hidden rounds

A host can tick **Surprise rounds** on Create. Players then see how many rounds there are
and nothing else, and each round's name arrives with its splash.

This is withholding, and withholding is the server's job. A client that is merely asked to
hide something is one DevTools tab from not hiding it. So for a non-admin, `welcome`,
`room_updated` and `GET /api/rooms/{code}` carry only the segments that have started.
Architecture §3's "What the server withholds" gets a row for it. Admins see everything, as
they already see the settings. The lobby shows "5 rounds: a surprise", and the splash is
exactly as it is today, because the splash was always the reveal.

**Accept:** a non-admin's every payload before round 3 contains no mode id or name for
rounds 3 onward (asserted by grepping the serialised frames, not by inspecting one field);
an admin's payloads are unchanged; "Round 2 of 5" still counts correctly; a reconnect
mid-game reveals exactly the rounds already played plus the current one; a random event
inside a hidden round reveals nothing about the round's mode; a room without the tick is
byte-identical on the wire to today.

### T39. Finished rooms go home with the players

When a game ends, every browser in it saves the result: code, date, the final standings,
which of them was you. `jbi:history` in localStorage, newest first, capped at 20 games.
Home gets a **Past games** list under "Rooms you created here", and each entry opens the
final screen drawn from storage, using the same podium component as D9, with no server
involved.

The server no longer has to keep a finished room around for a week so people can look at
it. A migration adds `rooms.finished_at`; the cleanup job deletes a finished room
once `FINISHED_ROOM_GRACE_MINUTES` (default 60) have passed. The grace period is for the
player whose phone locked on the last question and reconnects to see how it ended. Then the
row goes, and so do its answers and the host's custom questions, which `plan.md` wanted gone
anyway. The code is free again the moment the row goes.

A session whose room has gone, and which has a history entry, opens that entry, not the
410.

**Accept:** every browser in a finished room has the same standings in `jbi:history`; the
21st game drops the oldest; a finished room is deleted within one cleanup interval after its
grace, and its code can be allocated again; a room still in `lobby` or `playing` is
untouched by the new rule; opening `/r/{code}` for a deleted room with a history entry shows
the stored result and without one shows today's 410 screen; localStorage throwing loses the
history and nothing else; a room finished before the migration gets `finished_at` from its
last question's `closed_at`.

### T40. One menu in the top bar

The top bar's right side is identity, sound and theme: three controls, three popovers
(design.md §4). Folding them into one does two things. It gives a phone back two thumb
targets, and it gives the themes a real place in the menu instead of an icon nobody taps.

One control: the player's head and name, and beside them the current theme's **emblem**.
It opens one panel with three sections: **You** (name, head, re-roll: today's profile
popover), **Sound** (D6's two switches and the slider), and **Theme**. Theme is a row of
emblems, not colour swatches. An emblem is a small picture of the place the theme is named
for. Emblems are art, and art in this project ships as a placeholder slot with the file
dropped in later (design.md §9.1). So each theme gets a flat mark in its own accent colour
now, and a real emblem needs no code change later.

The emblem also replaces the bar's light/dark icon, so the bar shows where you are drinking,
not a colour setting. This reverses design.md §4's "nothing folds into a popover". The task
updates §4, the ASCII bar and the "Decided" line in the same change.

If D6 has not landed, the Sound section ships empty and D6 builds into it rather than into a
control of its own.

**Accept:** the bar's right side is GitHub plus one control at every width, and at 320px the
name is still visible and ellipsised; the panel reaches every setting the three popovers
did, with nothing lost; the panel is keyboard-operable, closes on Escape and outside click,
and returns focus to the control; the emblem in the bar changes with the theme, before the
panel closes; a placeholder emblem reads as deliberate; dropping a file into the emblem slot
changes the picture with no code change; the D1 contrast script still passes.

### T41. The TzHaar theme

Black and red: obsidian, lava, the glow of a fight cave. It is built like D12, against the
contract, and cut if it cannot pass.

The trap is that `wilderness` is already "near-black slate, ember red, bone white". Two
dark-and-red themes side by side in the picker is one theme twice. TzHaar has to be
*warm* where Wilderness is cold: a brown-black obsidian base instead of blue-grey slate,
lava orange-to-red instead of ember, and a molten accent that reads as heat, not as danger.
If the two cannot be told apart in a screenshot, one of them changes, and the palettes go in
the PR description side by side so a reviewer can judge.

Its emblem slot (T40) wants a fire cape or a TokKul.

**Accept:** passes the D1 contrast script unmodified, `--ok` against every `--gem-*`
included; it is one contiguous `[data-theme='tzhaar']` block that touches no layer-3 or
layer-4 token outside itself; `--bad` and the lava accent are distinguishable with colour
blindness simulated, because "red means wrong" is the contract this theme most wants to
blur; its base and accent differ from `wilderness` by a stated ΔE; the picker offers it
with a placeholder emblem.

### T42. The splash as a clue scroll

D7's splash is a scene and a card. The card becomes a clue scroll: parchment, a wax seal,
the round's name in the display face, and "Round 2 of 5" where a clue's tier would sit.
Nothing about the ready check changes. The heads row sits at the scroll's foot, and the
scene above it stays the per-mode art from §7.1.

Motion budget, as §7.1 has it, is one transition: the scroll unrolls in 200ms, and with
reduced motion it simply appears. The parchment is a texture under `client/src/assets/`,
tinted per theme through tokens, never an inline style (design.md §8). It must read as a
scroll in every theme, `wilderness` and T41's `tzhaar` included. A parchment that only works
on cream is a light-theme feature.

**Accept:** the scroll renders in every theme with body text at 4.5:1 against the parchment;
unrolling is 200ms or less and absent with `prefers-reduced-motion`; the ready widget, the
countdown and the host's skip behave exactly as before (D7's tests untouched and green); a
375px screen fits the scroll and the heads row without scrolling; the parchment is a file,
and swapping it needs no code change.

### T43. README

`README.md` is two lines. It is the first file a selfhoster reads and the only one GitHub
shows them. It gets:

- What this is, in one paragraph, and a screenshot slot.
- Running it: `cp .env.example .env`, `docker compose up`, open the port. Nothing else.
- The environment variables that matter, grouped (required / proxy / limits / branding /
  wiki), linking into `.env.example` rather than repeating it.
- Two ingress recipes, as `plan.md` promised: Cloudflare Tunnel and a plain Caddyfile, each
  including the `FORWARDED_ALLOW_IPS` line that T33 warns about.
- Development: `make dev`, `make lint test`, where the packs come from, `make gen-packs`.
- Contributing a question: a link to `data/packs/AUTHORING.md` (T29).
- Licence (AGPL-3.0), the Jagex trademark line, and OSRS Wiki attribution for the derived
  data.

**Accept:** a person who has never seen the repo gets from a fresh clone to a playable room
with nothing but the README, and the task says who tried it and what tripped them up; every
`make` target it names exists; every env var it names is in `.env.example`; the Caddyfile and
tunnel config are complete enough to paste.

### T44. Metrics

How many games are created, started and finished, which modes get played, how many players
come back. Counters, kept in Postgres, and nothing that identifies anyone.

A migration adds `daily_stats (day date, metric text, key text default '', count int,
primary key (day, metric, key))`, incremented by upsert in the same transaction as the
event it counts. It is independent of `rooms`, so the cleanup job deleting a room does not
delete its history. The metrics are `rooms_created`, `games_started`, `games_finished`,
`players_joined`, `players_returning`, and `rounds_played` keyed by mode.

**Returning** has to work with no accounts. The browser already knows: a `jbi:profile` that
existed before this join is a returning player. So create and join carry `returning: bool`,
and the server counts it without storing it on the player. No IP, no name, no room code,
no player id goes in the table.

**Accept:** each metric is incremented exactly once per event, asserted in a game played end
to end; a rolled-back room creation increments nothing; deleting a room leaves its counts;
two creations on the same day make one row with count 2; `returning` is counted and
appears in no other table; a test asserts the table's columns, so a later "just add the IP"
fails review with a reason attached.

### T45. The admin view

For whoever runs the instance: which rooms are live, how many people are connected, and the
T44 numbers.

`ADMIN_TOKEN` in the environment. If it is unset, the feature does not exist and every
`/api/admin/*` route is a 404. If it is set and shorter than 64 characters, the app refuses
to start and says why. The operator opens `/admin#token=…` once; the page moves the token
into `localStorage["jbi:admin"]`, `replaceState`s it out of the address bar, and sends it as
`Authorization: Bearer` from then on. `ideas/TODO.md` wrote this as `?Token=`. It is the
fragment instead for T35's reason: a query string reaches the access log and the `Referer`,
and architecture §7 exists to keep tokens out of both. The server compares with
`hmac.compare_digest`.

The page is read-only for now. It shows:

- Live rooms: code, status, round, players connected / total, created, expires.
- Totals: rooms in memory, open sockets.
- T44's counters: last 30 days, per metric, with modes ranked.

It does not show room contents: no names, no answers, no custom questions. The operator
running the box does not need to read a clan's inside jokes to see that the box is healthy.

**Accept:** unset token → 404 on every admin route and no `/admin` link anywhere; a short
token fails startup with the reason; a wrong or missing bearer is 401 with a constant-time
compare; the token never appears in the access log, in a `Referer`, or in the address bar
after the first load; the room list matches the room manager's in-memory state; no admin
payload contains a display name, an answer or a question payload, asserted.

## Deliberately not in Phase 2

- **Images, and the two modes that need them.** Who's That NPC? and Pixel Hunt are Phase 3,
  behind the asset pipeline and the open decision at the end of `architecture.md` about
  where asset files live given a read-only container. The `pick_from_list` type, the vocab
  endpoint and `steps` are all specced in architecture sections 2, 3 and 6 so that Phase 3
  is a pipeline and two components, not another framework change.
- **Design** is `ideas/design.md`'s D1–D12, not T-tasks. The ready check that replaced the
  splash countdown shipped as D7. `ideas/TODO.md`'s version was "everyone taps ready, then 3
  seconds", and it survives as D7's everyone-ready branch, with an 80% threshold added so
  one phone in a pocket cannot stall a round. The round-only standings are D9. T40–T42 are
  the design ideas that arrived after that document was settled, and each updates it.
- **A separate room lock.** Rotating T35's invite key does the same job with no second
  control: the room keeps everyone in it and nobody new has the key.
- **Pet inventory icons as avatars.** D4 settled on fifty chat heads, committed and
  hand-picked, with `heads.json` ids as a contract. Pets would be a swap of the art behind
  those ids, not a feature. There are more than seventy pets, so it would also be a choice
  of fifty. It is also a licensing call: design.md §9.1 commits original art and fetches
  game assets, and pet icons are game assets. It is the owner's call, and it needs no task
  to act on it.
- **The display font and the logo.** Both are the owner's (design.md §3 and §9.1). The slots
  exist, the fallbacks are in place, and dropping the files in needs no task.
- **Custom questions as random events.** They were a TODO idea and are now T21 and T30.
