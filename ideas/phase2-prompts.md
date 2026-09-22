# Phase 2 prompts

One ready-to-paste prompt per session, for Opus 5 on High or Extra in a fresh session at
the repo root. Most sessions are one task from `ideas/phase2.md`. The small ones are
grouped, so a session is never spent on an afternoon's fix: T31 + T32 + T34, T35 + T37, T36 + T38,
and T44 + T45 each run as one prompt. It says the order to work in, and asks for
each task to be finished, green and separable before the next starts. Run the sessions in
the order they appear; each assumes the ones before it landed. T43 sits last because it
documents what the others add.

Paste **House rules** first in each new session, then the task prompt. House rules are the
same every time — keep them in your clipboard manager.

Prompts name accept criteria rather than implementation. That is deliberate: the design is
already written down in `architecture.md`, and a prompt that restates it in worse words is a
second copy to keep in sync.

---

## House rules

```text
This is jolly-boar-inn, a self-hosted multiplayer OSRS quiz. Before writing any code:

- Read ideas/architecture.md. It is authoritative and current. If your task contradicts
  it, the architecture wins — stop and tell me rather than diverging.
- Read ideas/phase2.md for where this task sits and what it must not break.
- Match the surrounding code. This codebase writes long explanatory module docstrings that
  say WHY, not what, and comments only where a reader would otherwise ask a question.
  Read two or three neighbouring modules before writing yours and match that register. Do
  not add comments that restate the line below them.
- Tests are not optional and not an afterthought. Every accept criterion below is a test
  unless it says "manual".
- Bump VERSION, and its copies in server/pyproject.toml and client/package.json: the
  minor number once for each T or D task you finish, the patch number for a fix. See
  ideas/architecture.md section 10, Versioning.
- Finish with `make lint test` green. Do not report done before it is.
- Do not commit unless I ask. Do not touch ideas/*.md unless the task says to.
- If a design decision is genuinely underdetermined, make the call, state it in one line at
  the end, and keep going. Do not stop to ask about a detail I can read in the diff.
```

---

## T16. The mode/type split

```text
Task T16 in ideas/phase2.md: split "mode" from "question type".

Today a mode IS a question type — settings.modes[].mode holds "more_less", which is also
the type. Phase 2 adds modes that share a type (five modes will be multiple_choice), so the
two have to come apart. ideas/architecture.md section 2 has the design, the Mode dataclass
and the mode catalogue; section 1 "Module contracts" has the registry contract; section 5
has the migration.

Do:
- app/modes/ : the Mode dataclass (id, type, questions: Bounds, seconds: Bounds) and
  MODES, registering more_less only. questions_bounds(mode) / seconds_bounds(mode) move
  here from questions/types/__init__.py and fall back mode -> type -> registry default.
- schema/question.schema.json : "mode" required, pattern ^[a-z0-9_]{1,32}$. It is NOT part
  of the content id hash — architecture section 2 says why, keep that true.
- 0006_question_mode.sql : questions.mode text not null, backfilled from type.
- selection.py pools by mode, not by type. segments.py groups on mode. settings.py
  validates modes[].mode against MODES. GET /api/modes serves id + type + bounds.
- Segment.mode is a mode id; OpenQuestion gains mode alongside type.
- validate_packs.py rejects an unknown mode, or a type that disagrees with its mode's.
- data/packs/*.json get "mode": "more_less" added per entry. Do NOT regenerate the pack —
  the content ids must not change, and if they do you have hashed the wrong thing.
- client: lib/modes.ts gains type per mode; protocol.ts follows the wire.

Do not: add a new mode, a new type, or change how anything is scored or rendered. The game
must play identically before and after. This task is the axis change and nothing else.

Accept:
- Every existing test passes. Update them mechanically where the shape moved; delete none.
  If a test cannot be made to pass mechanically, stop and tell me which and why.
- A migration test asserts a pre-0006 room rehydrates with mode = type on its rows and
  plays to finished.
- validate_packs.py fails {"mode": "drop_table", "type": "more_less"} and says so clearly.
- GET /api/modes returns [{"id","type","questions","seconds"}].
- The existing end-to-end game test is green untouched.
```

---

## T17. Credit, and the three ways to score it

```text
Task T17 in ideas/phase2.md: generalise scoring. Read ideas/architecture.md section 6 first
— it is the whole spec, including the tables.

Today grade() returns bool and points_for(correct, bucket) pays out. Phase 2 needs partial
credit (ordering) and two more ways to turn an answer into points.

Do:
- grade() returns dict[UUID, float] — credit, 0.0..1.0 — for every type.
- questions/types/scoring.py : class Scoring (SPEED, RANK, STEP). A type module declares
  SCORING; the default is SPEED.
- rooms/scoring.py : add step(elapsed_s, question_s, steps) and step_points(step, steps),
  and collapse the payout into points_for(scoring, credit, band, steps). Keep bucket()
  exactly as it is — T10's edge tests must not need touching.
- answer_ack: replace bucket with scoring ("speed"|"rank"|"step") and band (int | null).
- PlayerResult gains credit: float. answers.correct becomes credit >= 1.0.
- Client: protocol.ts, and whatever reads answer_ack.bucket today.

Do not: add a type, a mode, or a payload field. No type actually returns a fractional
credit yet — ordering lands in T27. This task makes the road, not the traffic.

Accept:
- Table-driven tests per strategy. T10's bucket edge cases (exactly 0.10, 0.1001, >1.0
  clamps) still pass with no change to their expectations.
- credit 0.6 in bucket 2 scores 540.
- step_points over 8 steps is 1000/914/829/743/657/571/486/400; steps=1 gives 1000; a step
  past the last clamps.
- RANK ignores elapsed entirely: the same answers scored at 1s and at 29s give the same
  points.
- A full more_less game produces the same standings as before this task. Assert it against
  fixed values, not against a reimplementation of the formula.
```

---

## T18. The client presentation layer

```text
Task T18 in ideas/phase2.md: split the question components into "type view" and "mode stem".

Read ideas/architecture.md section 1 (the client tree) and section 3 (OpenQuestion carries
both type and mode). Phase 2 puts five modes on the multiple_choice type, and they must not
all look like each other: Drop Table shows an item, Who Said That? shows a quote in a
chatbox, Bestiary shows a sentence. Same buttons, different thing above them.

Do:
- components/questions/types/ : the answer affordance, one per question type.
MoreLess.svelte
  moves here unchanged in behaviour.
- components/questions/stems/ : what sits above it, one per mode that needs one. Ship
  TextStem for now; the rest arrive with their modes.
- Question.svelte composes a stem and a type view from one OpenQuestion.
- index.ts exports viewFor(type, mode) -> { stem, view }. Mode picks the stem, type picks
  the view. Either missing is not an error: a missing stem renders the view alone, a
  missing view renders the fallback Room.svelte already has for an unknown type.
- lib/modes.ts gains the stem per mode.
- props.ts: one props shape for a type view, one for a stem. A stem never sees onAnswer.

Do not: restyle anything, add a mode, or change the protocol. more_less must look the same
pixel for pixel — it is the one mode whose stem and affordance are the same two buttons, so
it has no stem and draws itself.

Accept:
- Play a round of more_less and confirm it is unchanged (manual, say what you saw).
- Component tests: missing stem renders the view; missing view renders the fallback; both
  present compose in the right order.
- pnpm check clean. No component imports another component's internals.
```

---

## T19. The Price is Right

```text
Task T19 in ideas/phase2.md: the price_is_right mode and type. Four prices, one right.

Read ideas/architecture.md section 2 for the payload and for why this is its own type
rather than multiple_choice with formatted strings, and ideas/games.md for the distractor
shapes the mode was sketched with.

Do:
- questions/types/price_is_right.py, all six exports. check() asserts
  options[answer_index] equals the subject's stored price — that consistency guarantee is
  the entire reason this is not multiple_choice, so do not skip it.
- client/src/lib/gp.ts : format a coin amount the way the game writes it. 999 -> "999",
  12500 -> "12,500", 100000 -> "100k", 1650000 -> "1.6M". Pure, tested.
- types/PriceIsRight.svelte and stems/AssetStem.svelte (name + asset ref; renders the name
  alone until Phase 3 brings images, per architecture section 2's asset rule).
- Generator: extend the existing price generator to emit price_is_right questions into
  data/packs/prices.json from the same /mapping + /latest fetch. Distractors are rounded
  and follow one of the four shapes from games.md (3 higher, 2 high 1 low, ...) picked per
  question, so the answer is not always in the same slot.
- lib/modes.ts entry: "The Price is Right".

Do not: change the more_less questions already in prices.json.

Accept:
- gp.ts table tests including 99999/100000/9999999/10000000 and zero.
- check() rejects a payload whose answer_index does not point at the stored price.
- No generated question has two options within 5% of each other (they would read as the
  same answer).
- Answer position is roughly uniform over the pack — assert each slot is within 40-60% of
  expected, not exact.
- ~100 valid price_is_right questions; make validate-packs green; the generator is still
  idempotent and still offline-capable via its file flags.
```

---

## T20. Guess the Examine

```text
Task T20 in ideas/phase2.md: the guess_examine mode on the pick_from_list type. This is
where pick_from_list lands; Phase 3's two image modes reuse everything built here.

The examine text is already in the /mapping response the price generator fetches and
throws away. Read ideas/architecture.md section 2 for the pick_from_list payload, why
Guess the Examine moved off free_text, and the combobox's behaviour; section 3
("Autocomplete vocabularies") for GET /api/vocab; section 6 for why a payload with no
steps scores on speed.

Do:
- questions/vocab.py : the items vocabulary from data/popular-items.json, a version hash,
  and a refusal to load two entries of the same name.
- http/vocab.py : GET /api/vocab/{name}. npcs is a 404 until T23 writes npcs.json.
- questions/types/pick_from_list.py, all six exports. validate_value accepts only an id in
  the question's vocabulary; check() asserts answer_id is in it and subject.name is its
  name, so validate-packs catches a roster edit that drops an answer.
- lib/vocab.ts : fetch once per session (during the splash of a pick_from_list round, or
  at the first such question), cache in memory, and the search: case- and
  accent-insensitive, matching the start of any word, names starting with the query first.
- types/PickFromList.svelte : the strict combobox from architecture section 2. Selection
  only — typed text is a search, never an answer. WAI-ARIA combobox pattern, a Submit button
  disabled until an entry is selected. Every pick_from_list mode uses this component, so
  nothing in it may know about examines.
- stems/ExamineStem.svelte : the prompt is the examine text; render it as one.
- scripts generator -> data/packs/examine.json, vocab "items".
- lib/modes.ts entry: "Guess the Examine".

Do not: build free_text or normalize.py (T21 owns them now), or add aliases — the search
matching any word's start is what makes "whip" find "Abyssal whip".

The generator's real work is rejection. An examine that contains the item's own name, or
any word of the name longer than three characters, is not a question — "A sharp sword." is
fine, "An abyssal whip." is the answer written on the card. Reject and report, do not try
to mask the word. An examine shared by another roster item with a different name is
rejected too: the list would hold two right answers.

Accept:
- An answer that is not an id in the vocabulary is bad_value; a string is bad_value.
- validate-packs fails a question whose answer_id is not in its vocabulary.
- A roster with two entries of the same name refuses to load.
- Component tests: typed text with no selection leaves Submit disabled; selecting enables
  it; editing the text after selecting clears the selection; no match selects nothing and
  says so; the value sent is the entry's id.
- Search tests: case, accents, word-prefix ("whip" finds "Abyssal whip"), ordering.
- The combobox is operable by keyboard alone (arrows, Enter, Escape), and on a 375px phone
  with the keyboard open its list is not hidden behind the keyboard (manual, say what you
  saw).
- An examine containing the item name is rejected by the generator with a reason in its
  output summary; assert it on a fixture.
- The generator prints how many roster items it used and how many it rejected, with the
  reason, and the rejection rate is under a third. The roster is 176 items today, so do not
  chase a fixed question count — report the number you got.
- make validate-packs green.
```

---

## T21. Multiple choice, closest number, free text, and where the host's questions land

```text
Task T21 in ideas/phase2.md: the last three simple types, and random events server-side.

Read ideas/architecture.md section 1 (selection.py's "Random events", and segments.py),
section 2 ("A random event is a placement, not a round", and the payloads), section 4 (the settings
block and the custom paragraph under it), and section 6 (exclusions).

Do:
- questions/types/multiple_choice.py and closest_number.py. closest_number is SCORING =
  RANK and returns the credit ladder from section 6 (1.0/0.8/0.6/0.4/0.2), ties sharing the
  better rank.
- questions/normalize.py : lowercase, NFKC, trim, collapse whitespace, strip punctuation,
  Levenshtein distance. Accepted answers under 4 characters require distance 0, so "Jad"
  does not accept "Jam".
- questions/types/free_text.py, all six exports, using normalize. No pack mode uses it; it
  is for the host's own questions, whose answers (a clan member, a boss kill count) no
  vocabulary could hold.
- MODES gains "custom" with type = None — the one mode whose questions carry their own
  types, because a host may write a multiple-choice question and a number one. It is also
  the one mode that is never a round, so it declares seconds and no questions bounds.
- POST /api/rooms accepts custom_questions: validate each against the schema, store with
  source='room', mode='custom', author_player_id set. All of it in the existing creation
  transaction — a bad custom question must leave no room behind.
- 0007_random_events.sql: questions.random_event text, and rewrite rooms.settings — drop
  order, add random_events and random_event_seconds.
- selection.py: place_random_events(). The host's questions are not a round any more;
  each one interrupts a round it does not belong to. Never the first round, never a
  round's first question, one per round, a distinct NPC each time. Delete settings.order
  and the custom round with it; architecture section 1 says why both went.
- Pack events: with random_events true, a slot no custom question took gets a pack question
  with probability PACK_EVENT_CHANCE, drawn from a mode the host did not pick and never from
  the mode of the round it interrupts.
- NewRoomSettings: more custom questions than len(modes) - 1 is a 422 naming the limit and
  the count. Do not truncate.
- segments.py: an event is grouped into the round it interrupts, not a segment of its own.
- app/random_events.py: the NPC ids, and nothing else. Names and lines are client copy
  in T22, the way mode copy already lives in lib/modes.ts.
- Author exclusion gets its first real caller (T10 built and tested it).
- types/MultipleChoice.svelte, ClosestNumber.svelte and FreeText.svelte.

Do not: build the editor UI (T30), and do not build the event presentation — the NPC card
and the held-back buttons are T22. Until then an event plays as an ordinary question in the
middle of a round. That is deliberate; do not paper over it with a half client change.

Accept:
- Three custom questions in a four-mode room land in three different rounds, none of them
  the first round and none at a round's first position. Seeded, asserted.
- Five custom questions in a three-mode room give 422 naming the limit and the count, and
  create no room row.
- random_events true with no custom questions still produces pack events, and no pack event
  shares the mode of the round it interrupts.
- segments_of reports four rounds, not seven, for a four-mode room holding three events.
- The author gets `excluded` on their own question and scores 0; everyone else scores
  normally on it.
- host_only scores nobody and still shows and closes.
- A custom question failing the schema gives 422 naming the field, and creates no room row.
- A room created before 0007 rehydrates and plays its custom round unchanged.
- closest_number ties: two players equidistant share the better rank; exact match beats a
  1-off; an unanswered player scores 0, not 200.
- Normalisation tests: case, accents, punctuation, whitespace, the under-4 rule. A
  one-character typo on a full accepted answer is accepted; a different answer is not.
```

---

## T22. Random events

```text
Task T22 in ideas/phase2.md: random events get a face, a theme and questions of their own,
and the host's questions arrive through them.

Read ideas/random-events.md first. It is the owner's roster: the NPC ids, their names,
opening lines and themes, and the first questions for each one. If it does not exist or
has fewer than twelve NPCs, stop and say so. Then read ideas/IDEAS.md "Custom Questions"
for the idea in the words it was written in, and ideas/architecture.md section 1
(selection.py's "Random events"), section 2 ("A random event is a placement, not a round", and the
envelope's random_event), section 3 (OpenQuestion.random_event and answerable_at) and
section 4 (the splash rule, and the pending → open row). T21 already placed events and
stored questions.random_event. This task changes who asks and what they ask, how often
events happen, and adds the two seconds and the card. ideas/phase2.md T22 "How often"
replaces T21's placement rules; where architecture section 1 still says "one per round,
never the first round", phase2.md wins, and this task rewrites that paragraph to match.

Do, server and data:
- app/random_events.py: the ids from ideas/random-events.md. tests/test_random_events.py
  holds the roster to at least twelve; the len(round_modes()) - 1 bound goes, because a room
  at "more" can hold more events than there are faces.
- MODES gains "random_event" with type = None: never a round, only seconds, like "custom".
- data/packs/random_events/<npc_id>.json, one hand-written file per NPC, carrying the
  questions from ideas/random-events.md. The file declares "random_event" once and its
  questions do not repeat it. load_packs and validate_packs.py read this folder as well as
  data/packs/*.json. validate-packs fails a file not named after a roster id, a question
  in it that sets its own random_event, and a question outside the folder that has one.
  Each question still gets its id from the content hash.
- schema/question.schema.json: an optional envelope field random_event, pattern
  ^[a-z0-9_]{1,32}$. It is outside the hash like every envelope field. A custom question
  may carry it, and POST /api/rooms 422s an id that is not in the roster.
- RoomSettings: random_event_frequency ("less" | "default" | "more": one event per 20, 10
  or 5 round questions) replaces random_events. Slots are floor(round questions / N), added
  on top of the round questions and counted by MAX_QUESTIONS_PER_ROOM. A stored room reads
  random_events true as "default", and false as "only its own questions, placed by T21's
  rules", so every stored room rehydrates and plays as it was created. No migration.
- The custom cap is the slot count at the chosen frequency; more is a 422 naming the count,
  the limit and the frequency.
- selection.place_random_events: cut the round questions into consecutive windows of N and
  put each slot at a position drawn inside its window, never the game's first question and
  never a round's first question. The first round is no longer exempt. A custom question
  that names an NPC gets that NPC, repeats included. Every other face is drawn from those
  not yet used in the room, then from the least used, never the same face twice running.
  Every slot the host's questions leave takes an event-pack question, preferring a type
  other than the interrupted round's type, and stays empty only if nothing qualifies.
  PACK_RANDOM_EVENT_CHANCE goes. Delete the borrowing from unpicked modes, and update the
  docstrings (selection.py, settings.py) that describe the old rules.
- Create: a Less often / Default / More often choice where the random_events checkbox is,
  and the total question count including events ("11 questions").

Do, the two seconds:
- OpenQuestion gains random_event (the NPC id, null for an ordinary question) and
  answerable_at. answerable_at is shown_at for an ordinary question and shown_at +
  random_event_seconds for an event; ends_at becomes answerable_at + the round's
  seconds; elapsed is measured from answerable_at; an answer received before it is
  rejected with not_open. Nothing new is stored: answerable_at is derived, so rehydrate
  does not change.
- The splash rule moves from "a new mode" to "a new segment" (segments.py already groups an
  event into the round it interrupts). An event gets no splash, and neither does the
  question after it.

Do, client:
- lib/randomEvents.ts: the roster's copy, as one flat array: id, name, theme, the line
  they open with, and the asset ref. The ids must match app/random_events.py, and a test
  says so. Write the lines the way the game writes them.
- components/RandomEvent.svelte: the NPC's name, its line and the question stem, with the
  answer affordance held back until answerable_at, counted off server_time and not the
  local clock. Keep it plain: the NPC taking the stage (picture on the right, the scroll
  moving, the typed prompt) is design D16, and the pictures are D15. Until then the card
  reads well as text alone, with the picture as an empty slot. An unknown random_event id draws a generic card, the way viewFor already falls
  back for a mode it cannot draw.

Do not: add a phase to the room state machine, add a column, or send a second message when
the buttons appear. All three are avoidable and section 4 says how. Do not write event
questions that need an image (a Certer's silhouette waits for Phase 3), and do not use
ge_price in a hand-written more_less or price_is_right question, because it goes stale.

Accept:
- An answer before answerable_at is rejected with not_open, asserted on the server.
- A player answering the instant the buttons appear lands in bucket 1: the wait costs nobody
  a point.
- ends_at - answerable_at equals the round's own seconds.
- No splash runs for an event, and none runs for the question following one.
- A reconnect inside the held-back window lands on the NPC card with the right remaining
  delay, computed from the welcome snapshot.
- random_event_seconds: 0 plays an event as a plain question. That is what the rest of
  the tests run on.
- An unknown random_event id renders the generic card and logs nothing alarming.
- validate-packs fails each of the three misplaced-random_event cases above, on fixtures.
- A custom question's named NPC is the one that asks it, and two custom questions naming
  one NPC are both honoured. Seeded over many rooms, no drawn face repeats while an unused
  one is left, and none appears twice running.
- At "default" one mode of 10 questions plays 11, and Create says 11 before the room
  exists; "less" and "more" give the counts in phase2.md's table. Seeded, no two events
  share a window and none is a round's or the game's first question. A one-mode room gets
  events. Too many custom questions is a 422 that names the frequency. A room stored with
  random_events false rehydrates and places only its own questions.
- Every roster id has an event file with at least two questions and a randomEvents.ts
  entry.
- pnpm check clean. Manual: play a four-mode room with two custom questions, one naming its
  NPC, and say who turned up where.
```

---

## T23. The facts importer

```text
Task T23 in ideas/phase2.md: scripts/fetch_facts.py, the first thing in this project that
talks to the wiki.

T34 must have landed first; if scripts/wiki.py does not exist, stop and say so.

Read ideas/plan.md "Wiki data" for the sources and the etiquette, and
ideas/architecture.md section 9 for the two-stage pipeline and the output shape. Read
scripts/gen_price_questions.py first: it already establishes the conventions for a script
like this (descriptive User-Agent, file flags for offline runs, deterministic output,
never runs at startup or in CI) and this one should feel like its sibling.

Do:
- data/facts/items.json, npcs.json, quests.json and manifest.json (source, fetched_at,
  sha256 per file).
- Sources: Bucket API (meta.weirdgloop.org) for infobox and drop data, /mapping for
  examine and high alch, MediaWiki generators for the rest at 50 titles per request.
- Every request through scripts/wiki.py (T34): it owns the one-per-second throttle and the
  operator's WIKI_USER_AGENT, so this script sets neither. If-Modified-Since. Resumable
  across runs — an interrupted run must not start over.
- --from-dir replays saved responses so tests and every later generator work offline.
- make fetch-facts.
- data/facts/README.md: OSRS Wiki attribution and the CC BY-NC-SA notice. Committing
  derived wiki content requires it.

Decide the exact field set per file and state it in the module docstring — later tasks
(T25, T26, T27, T28) read these files, so name the fields for what they are rather than
for the endpoint they came from.

Accept:
- A full run against recorded fixtures produces all four files with no network.
- Manifest checksums match the files on disk.
- An interrupted run resumes and does not refetch what it has.
- A second run against unchanged upstream rewrites nothing (byte-identical, like the price
  generator).
- The rate limit is asserted by a test, not just implemented.
- No test in the suite opens a socket. Nothing imports this script from app/.
```

---

## T24. `make gen-packs`, and the reproducibility gate

```text
Task T24 in ideas/phase2.md: the umbrella every pack generator plugs into.

Do:
- scripts/gen_packs.py and scripts/generators/. Move gen_price_questions.py to
  generators/prices.py and T19's and T20's generators alongside it, keeping their offline
  file flags working.
- make gen-packs runs them all. make gen-packs CHECK=1 regenerates into a temp directory,
  diffs against the committed packs, and exits non-zero on any difference, naming the pack.
- CI runs CHECK=1.
- Update the Makefile and .github/workflows/ci.yml. Drop make gen-price-questions or keep
  it as an alias — your call, say which.

A generator changed without its pack regenerated is the failure mode every committed
generated file has, and this gate is the cheap way to catch it. That is the point of the
task; the refactor is incidental.

Accept:
- make gen-packs reproduces every committed pack byte for byte from committed facts.
- CHECK=1 is green on a clean tree, and exits non-zero naming the pack after a one-line
  change to any generator.
- CI runs it and fails on the same condition.
- No generator opens a socket: every one of them reads data/facts/ and the roster only.
```

---

## T25. Bestiary and Drop Table

```text
Task T25 in ideas/phase2.md: two multiple_choice modes from data/facts/npcs.json. The first
two modes built on the importer.

Bestiary asks a fact about an NPC — combat level, release year, quest, location, weakness.
Drop Table asks which of four bosses drops a given item.

Read ideas/games.md on "Which boss drops this". It names the trap and it is the whole task:
pick three random bosses as distractors and one of them may also drop the item, which makes
two options right. Check every distractor against every NPC's drop list, and when one
collides reject the QUESTION, not just that distractor. An item that needs three tries to
find a safe fourth option is an item nobody associates with one boss, and it makes a bad
question even when the generator eventually finds four names that technically work.

Bestiary distractors come from the same band as the answer — a combat level within a
factor, a release year within a few — so the answer is not simply the one that looks
different from the other three.

Do: generators/bestiary.py emitting data/facts-derived questions for both modes into
data/packs/bestiary.json, MODES entries, lib/modes.ts copy, and the stems each needs.

Accept:
- Asserted over the whole generated pack: no Drop Table distractor also drops the item.
- No distractor equals the answer, in either mode.
- Combat-level distractors are inside the declared band; assert the band, do not eyeball it.
- check() re-derives every answer from data/facts/npcs.json.
- Both modes play end to end in a real room.
```

---

## T26. Odd One Out

```text
Task T26 in ideas/phase2.md: the odd_one_out mode on multiple_choice, from
data/facts/items.json.

Four subjects, three sharing a property, one not. Store the shared property and show it in
the reveal: "why?" is the whole payoff, and a reveal that only highlights the right button
does not answer it.

The generator's obligation is that the odd one is odd exactly ONCE. If three items are
members-only and the fourth is not, but that fourth item is also the only one that stacks,
there are two defensible answers and neither player is wrong. Check every property in the
facts file before emitting, not only the property the question is about.

Do: generators/odd_one_out.py -> data/packs/odd-one-out.json, the MODES entry, lib/modes.ts
copy, and a stem that shows four subjects. Decide which properties are in scope and say so
in the module docstring — a property nobody can name is not a question.

Accept:
- Asserted over the whole pack: exactly one item differs, on exactly one known property.
- check() re-derives the odd one from the stored facts.
- The reveal names the shared property in words a player would use.
- The generator reports how many candidate quartets it considered and how many survived.
  Do not chase a fixed count; the roster caps it.
- make validate-packs and make gen-packs CHECK=1 green.
```

---

## T27. Ordering, and Release Order

```text
Task T27 in ideas/phase2.md: the ordering type and the release_order mode. This is the last
new type in Phase 2 and the only one with partial credit.

Read ideas/architecture.md section 2 for the payload, and read the paragraph after it on
why it stores both `rank` per entry and an `answer` list — that is the answer to the "two
quests that could both be third" problem in ideas/games.md, and getting it wrong makes the
mode unfair rather than merely wrong.

Do:
- questions/types/ordering.py. Credit is the fraction of entries in the correct place.
  Entries sharing a rank are accepted in either order. check() rejects a payload whose
  `answer` does not sort by `rank`, and one where every entry ties (a question with no
  wrong answer).
- types/Ordering.svelte: a list you reorder. It must work with a mouse and with a thumb —
  drag is fine, but there must be a non-drag path (up/down controls or tap-to-swap),
  because half the players are on a phone. The `ends` labels sit at either end so which
  direction the list wants is never in doubt.
- generators/ordering.py -> release_order questions from quest and NPC release dates in
  data/facts/.
- MODES entry, lib/modes.ts copy, and the reveal showing what the right order was and how
  much of it you had.

Accept:
- Three of five in the right place gives credit 0.6, and in bucket 2 that is 540 points.
- Two entries sharing a rank score full credit in either order.
- check() rejects an answer that does not sort by rank, and an all-ties payload.
- Usable one-thumbed at 375px wide — say how you verified it.
- The reveal shows "3 of 5 in the right place", from PlayerResult.credit.
```

---

## T28. Sort It Out

```text
Task T28 in ideas/phase2.md: the sort_it_out mode — the same ordering type as T27, for
every order that is not a date.

Combat level, gem tier, metal tier, quest length. Read ideas/games.md "Knowledge sort" for
where the mode came from; the name is now Sort It Out.

Do:
- data/facts/sequences.json: hand-curated, and the ONLY facts file fetch_facts.py does not
  write — gem tiers and metal tiers are not stated anywhere on the wiki in a form worth
  parsing. Give it a small schema of its own and validate it in CI. At least six sequences.
- Each sequence carries the prompt that suits it, so monsters ask "weakest to strongest"
  and gems ask "cheapest to most valuable". One sentence that fits both fits neither.
- generators/ordering.py also emits combat-level and quest-length questions from the
  fetched facts.
- MODES entry and lib/modes.ts copy.

Accept:
- The sequences schema rejects a gap in the ranks and a duplicate rank.
- Generated combat-level questions never force an order between two monsters of equal
  level — they share a rank, per T27's rule.
- Six or more curated sequences, ~60 generated questions.
- A game with a Release Order round and a Sort It Out round shows different prompts and
  different splashes for the two. Verify it by playing, and say what each said.
```

---

## T29. Who Said That? and Clipped

```text
Clipped ships as "Know Your Content Creator" (label and copy only; the mode id stays
clipped), presented by the Gnome Child. From design D14 on, both modes also bring their host:
a drawing on the rig and the host's lines in lib/modes.ts (ideas/design.md §7.1, D14).

Task T29 in ideas/phase2.md: two hand-authored multiple_choice modes, and the authoring
guide this project needs before Phase 6 opens submissions.

Who Said That? is iconic quest and NPC dialogue. Clipped is famous streamer quotes.
ideas/games.md has the seed quotes for both.

Do:
- data/packs/quotes.json, hand-written. Both modes live in it.
- data/packs/AUTHORING.md: how to write a pack entry by hand, what makes a good distractor,
  what makes a bad one, and how to run make validate-packs before opening a PR. Write it
  for someone who has never seen the schema. This is the file a contributor reads first
  when Phase 6 opens the suggestion flow, so it is worth the hour.
- MODES entries, lib/modes.ts copy, stems/QuoteStem.svelte — dialogue wants to look like
  dialogue, not like a prompt.

ideas/games.md asks for at least 20 Clipped entries and says community help will be needed.
Write what can be sourced honestly and let the pack grow: selection.py already gives a
short round for a thin pool, so an 8-question mode is not a broken one.

Accept:
- No quote is attributable to two of its own options — check every entry by hand and say
  you did.
- Every entry carries a source: the quest name, or the clip.
- 20 or more who_said_that, 15 or more clipped.
- make validate-packs green; gen-packs CHECK=1 unaffected (this pack is not generated).
- AUTHORING.md walks someone from a blank file to a passing validation. Follow your own
  instructions once and fix what was unclear.
```

---

## T30. The custom-question editor

```text
Task T30 in ideas/phase2.md: the client editor for custom questions. Client only. The
server side landed in T21 and T22 and does not change. This needs T22: check git log for it
first, and stop if it has not landed.

Do:
- The /r/:code/create route: a form per custom type (multiple_choice, free_text,
  closest_number), a list of what has been added, edit, remove, reorder.
- Export the room's custom questions to a JSON file, and import one back. Same envelope as
  the schema, so an exported file is a valid POST body.
- Client-side validation mirroring the schema's limits, so the form never submits something
  the server will 422. The schema is the source of truth for the caps — read them from
  schema/question.schema.json rather than retyping the numbers.
- The room's event cap: the number of event slots at the chosen frequency, floor(round
  questions / N) (phase2.md T22, "How often"). The form knows the questions and the
  frequency, so it can say "40 questions at Default, four of your own" before the server
  has to, and that More often would allow more.
- An NPC picker per question: Random (the default) and then the roster from
  lib/randomEvents.ts, each entry with its name and theme, and a preview drawn by T22's
  RandomEvent.svelte (taking the stage as design D16 has it, if D16 has landed). Picking one sets the question's random_event, and Random leaves it
  out. Two questions may pick the same NPC; the server honours that.

Accept:
- Add, edit, remove, reorder for all three types.
- Export then import round-trips to a byte-identical file, chosen NPCs included.
- Import of a malformed file shows a readable message and changes nothing already entered.
  An unknown random_event id is one of those messages.
- The picker defaults to Random, and a question left on Random carries no random_event.
- Every schema limit (option counts, string lengths, accepted-answer counts) is enforced in
  the form, with the message next to the field.
- The event cap is enforced and explained: adding a fifth question to a 40-question room at
  Default says why it cannot, and lowering the questions or the frequency below what is
  already written says so rather than waiting for submit.
- pnpm check clean. Manual: create a room with two custom questions and play it.
```

---

## T31 + T32 + T34. Loose ends, six options, and the wiki's rules

Three small tasks with no files worth fighting over. T34 is the one with a deadline (before
T23), which is the reason to run this session early.

```text
Three tasks from ideas/phase2.md in one session: T31, T32 and T34. They share no files that
matter, so do them in the order given.

Work through them one at a time: meet one task's accept criteria and get `make lint test`
green before starting the next, and keep each task's changes separate enough to commit
on its own. If the session runs long, stop after a whole task and say which are left.
Never leave one half done. Report per task at the end.

=== T31. Loose ends ===

Task T31 in ideas/phase2.md: three small fixes from ideas/IDEAS.md. Keep them as three
separate commits so each can be reverted alone.

1. HEAD on the API. HEAD /api/modes is a 404 while GET is a 200: FastAPI registers GET
   alone, so HEAD falls through to the static catch-all in server/app/static.py, which
   404s anything under /api. Make every GET route under /api answer HEAD, in ONE place
   (the router setup or a small middleware), not by editing each decorator.

2. Create stops asking for a name. Read ideas/design.md §5.1 and §5.1.1, then
   client/src/routes/Join.svelte's docstring: Join already goes in under the profile name,
   or a generated one that becomes the profile, and nudges once. Create does the same and
   loses its NameField and its NamePrompt gate. §5.1.1 and the "Decided" list say an empty
   profile blocks Create; update both lines, since this task reverses them.

3. The unanswered more_less reveal: a player who did not answer sees a green-outlined
   button over "No answer from you this round, so no points". Check git log for D8 first:
   if D8 has landed, skip this item and say so. If not, fix it without redesigning
   anything. D8 owns the reveal's look.

Accept:
- A test walks every GET route under /api and asserts HEAD gives the same status and
  headers with an empty body. HEAD on an unknown /api path is 404; on a POST-only route 405.
- Create has no name field; the created host carries the profile name; a browser with no
  profile creates a room in one tap and is nudged once, exactly as a joiner is.
- An unanswered more_less question shows no button as pressed, and still says nobody
  answered.
- ideas/design.md updated for item 2 in the same change.

=== T32. Six options, at most ===

Task T32 in ideas/phase2.md: no question may offer more than six choices, because there
are six gem buttons (ideas/design.md §2: sapphire, emerald, ruby, red topaz, dragonstone,
zenyte) and each choice is one of them.

Do:
- schema/question.schema.json: one shared $def for the cap, referenced by every array of
  choices. multiple_choice.options stays at 6. price_is_right stays at exactly 4.
- If T27's ordering already exists, it references it too. If not, add a line to
  ideas/architecture.md section 2 saying it must. pick_from_list (T20) is exempt: it has no
  array of choices, and its combobox draws no gems.
- The client editor (T30), if landed, already reads caps from the schema. Check that it
  picks up 6 with no change of its own.

Accept:
- A test walks the schema and fails any choice array whose maxItems exceeds 6 or is unset.
  Name how it recognises "an array of choices", so a future type cannot slip past by
  naming its field differently.
- A seven-option custom question is a 422 naming the field, and creates no room.
- make validate-packs rejects a seven-option pack entry.
- A six-option multiple_choice question plays, and every button draws a different gem
  (manual if D8 has not landed, and say which).

=== T34. The wiki's rules, enforced ===

Task T34 in ideas/phase2.md: every script that talks to the OSRS Wiki sends the operator's
User-Agent and at most one request a second. It must land before T23.

Today server/scripts/gen_price_questions.py hard-codes a User-Agent naming this repo, so
every selfhoster who runs it reports as the upstream project. ideas/design.md §9.1 says the
download scripts must refuse to run without a User-Agent of their own.

Do:
- server/scripts/wiki.py: the one module a script imports to fetch from the wiki. It reads
  WIKI_USER_AGENT from the environment (and .env the way the app does), refuses to send a
  request without it, and throttles to one request a second per process. Injectable clock
  so the throttle can be tested without sleeping.
- gen_price_questions.py moves onto it. Its offline file flags need no User-Agent and must
  keep working without one.
- .env.example documents WIKI_USER_AGENT with an example in the shape the wiki asks for
  (project name plus contact, e.g. "jolly-boar-quiz-importer - yourname on Discord").
- Makefile targets that fetch pass the environment through.

Accept:
- A network run with WIKI_USER_AGENT unset exits non-zero before its first request, and
  the message says what to set, with an example.
- Offline runs are unaffected and green in CI with the variable unset.
- The throttle is asserted with a fake clock: N requests take at least N-1 seconds.
- A grep test fails any file under server/scripts/ that opens a URL without going
  through wiki.py.
```
---

## T33. Limits that mean one client, and IPv6

```text
Task T33 in ideas/phase2.md. Read server/app/http/ratelimit.py, client_host() in
server/app/http/rooms.py, the FORWARDED_ALLOW_IPS block in .env.example, the Dockerfile's
CMD, and ideas/architecture.md section 7.

The problem: ROOMS_PER_IP_PER_HOUR keys on request.client.host, and behind an untrusted
proxy that is the proxy, so a whole deployment shares one bucket. It is documented, and
nobody reads the documentation before the first 429 on a quiz night.

Do:
- A one-time warning: the first request that carries X-Forwarded-For from an address
  uvicorn did not trust logs one line naming that address and FORWARDED_ALLOW_IPS. Once
  per process. Do NOT start trusting the header yourself; that is a bypass, not a fix.
- Default ROOMS_PER_IP_PER_HOUR to 30. It is the abuse backstop now, not the everyday limit.
- The everyday limit goes client-side: Create refuses a sixth live room in jbi:created
  (ideas/plan.md "Misc decisions" wants five) and points at Home, where each room already
  has Remove. A room the server answers 410 for is dropped from jbi:created, not counted.
- IPv6: the limiter keys an IPv6 client on its /64 and IPv4 on the address, and folds
  ::ffff:a.b.c.d into the IPv4 address. Put the normalisation in one function with its own
  tests. The container listens dual-stack; APP_BIND and FORWARDED_ALLOW_IPS are
  documented with IPv6 examples; the healthcheck still works.

Accept:
- The warning fires once for an untrusted X-Forwarded-For, never when absent or trusted.
- Two addresses in one /64 share a bucket; two /64s do not; ::ffff:192.0.2.1 and
  192.0.2.1 share one.
- Create with five live rooms refuses and links Home; removing one lets the sixth through.
- Manual: curl -6 reaches a compose deployment bound to ::1. Say exactly what you ran.
```

---

## T35 + T37. Invite links, and "someone is picking a name…"

Both are about getting into a room: the key gets you through the door, and the name is
chosen once you are inside. They touch the same Join and Lobby components and the same
`room_updated` shape, so one session reads that code once.

```text
Two tasks from ideas/phase2.md in one session: T35 and T37. Do T35 first: it changes the
join path and T37 builds on the lobby as T35 leaves it.

Work through them one at a time: meet one task's accept criteria and get `make lint test`
green before starting the next, and keep each task's changes separate enough to commit
on its own. If the session runs long, stop after a whole task and say which are left.
Never leave one half done. Report per task at the end.

=== T35. Invite links ===

Task T35 in ideas/phase2.md: a room that only a link with its key can join.

Read ideas/architecture.md section 7 first. Tokens do not go in URLs, and this task is the
narrow exception: a door code, not a credential, carried in the fragment so it never
reaches the server's access log or a Referer.

Do:
- Create gains "Invite link only". Such a room gets join_key = secrets.token_urlsafe(9),
  in a migration (a column, not settings: settings reach every player).
- The key reaches admins only: in welcome and room_updated for an admin, never for a
  player. Add the row to architecture section 3's "What the server withholds".
- Share link becomes /r/CODE#k=KEY for a keyed room. Join reads the fragment, sends the key
  in the join body, and replaceStates the fragment away once joined.
- POST /api/rooms/{code}/join on a keyed room: missing key 403 key_required, wrong key 403
  bad_key, compared in constant time. A session reconnect never needs the key.
- A missing or wrong key lands on a small "ask the host for the link, or paste the key"
  prompt, not an error screen.
- An admin can rotate the key from the lobby: new key, old link dead, nobody disconnected.

There is no separate "lock room" toggle. Rotating a key is the lock. Say so in the Lobby
component's docstring, so nobody adds one later.

Accept:
- Join without, and with a wrong, key is refused with the right code; the right key joins.
- Reconnect by session in a keyed room works with no key.
- Rotating refuses the old link and disconnects nobody.
- A test serialises every frame a non-admin receives in a keyed room and asserts the key
  appears in none of them.
- The access-log test proves a join via the share link never logs the key.
- An unkeyed room is unchanged on the wire; a room from before the migration has no key.

=== T37. "Someone is picking a name…" ===

Task T37 in ideas/phase2.md. Since D4 a player joins first and renames after, so the lobby
can show "Cow31337Killer42" while Dave is still typing his real name. Let the room see that
someone is mid-rename.

Read how `ready` works first (server/app/rooms/ready.py, PlayerView, the ready message), and
copy its shape: in-memory, never persisted, broadcast as room_updated.

Do:
- PlayerView.editing: bool. A websocket message editing {on: bool}, sent by the client
  when the profile popover opens and closes on a joined player.
- Cleared by set_profile, by disconnect, and by 60 seconds without a refresh. A popover
  held open for longer re-sends on a timer.
- Rate-limit it like ready, so toggling cannot flood the room with room_updated.
- Lobby: the player dimmed, "picking a name…" under the head. Splash heads row: a pencil
  instead of the tick.
- It is information, not a gate. The ready threshold and Start ignore it entirely.

Accept:
- Opening the popover shows the label to another browser within a frame of room_updated;
  saving or closing clears it.
- Disconnect clears it; a flag left on for 60 s clears itself (fake clock).
- The rename lands with the flag already off.
- The ready count and Start are unchanged by any of it.
- Toggling fast is refused past the limit, like ready.
```
---

## T36 + T38. Hidden rounds, then public lobbies

Both are about what someone who is not the host gets to see. Doing T38 first means T36's
listing hides round names from its first commit, instead of taking a follow-up. Needs T35.

```text
Two tasks from ideas/phase2.md in one session: T38 and T36. Do T38 first, then T36, so the
public listing honours hide_rounds from the start rather than through its "if landed"
branch.

Work through them one at a time: meet one task's accept criteria and get `make lint test`
green before starting the next, and keep each task's changes separate enough to commit
on its own. If the session runs long, stop after a whole task and say which are left.
Never leave one half done. Report per task at the end.

=== T38. Hidden rounds ===

Task T38 in ideas/phase2.md: "Surprise rounds". Players see how many rounds there are, and
each round's name arrives with its splash.

This is the server withholding, not the client hiding. Read ideas/architecture.md section
3, "What the server withholds from the admin", which is the same idea pointed the other way,
and add a row for this.

Do:
- settings.hide_rounds, default false, read with a default so stored rooms still load.
  A tick on Create.
- For a non-admin, while hide_rounds: welcome, room_updated and GET /api/rooms/{code} carry
  only the segments that have started, plus the total count. Admins get everything.
- Lobby: "5 rounds: a surprise". The splash is unchanged; it was always the reveal.
- A random event inside a hidden round must not leak the round's mode through the event.
  Check what OpenQuestion carries.

Accept:
- Before round 3, no frame a non-admin receives contains any identifier or name for
  rounds 3+. Assert by serialising every frame and searching the text, not by checking
  one field.
- Admin frames unchanged. "Round 2 of 5" still counts right.
- A reconnect mid-game reveals exactly the played rounds plus the current one.
- hide_rounds false is byte-identical on the wire to before this task.

=== T36. Public lobbies ===

Task T36 in ideas/phase2.md: a host can list their room on the Home page. T35 must have
landed: a public room cannot have an invite key.

Do:
- Create gains "List publicly", stored with the room. Mutually exclusive with "Invite link
  only" in the form, and a 422 on the server if both arrive.
- A room with custom questions defaults the tick OFF (ideas/plan.md: custom questions are
  about real people). The host may still tick it.
- GET /api/rooms/public: rooms in lobby or playing, not full, newest first, at most 50,
  cached a few seconds in memory. Each entry: code, host name and head, player count,
  round count, and round names unless the room hides them (T38, if landed).
- Home shows the list with a Join button per room; an empty list shows nothing, not an
  empty box.
- PUBLIC_ROOMS env, default true. false hides the tick and makes the endpoint return [].
  Document it in .env.example: a public instance keeps it off until Phase 4's abuse
  measures exist.

Accept:
- A public lobby shows on another browser's Home within the cache window, and leaves it
  when the game finishes or the room fills.
- An unlisted room never appears.
- Public + key is a 422.
- PUBLIC_ROOMS=false hides the tick and serves [].
- The listing carries no session, no key, no question and no player other than the host,
  asserted on the serialised response.
```
---

## T39. Finished rooms go home with the players

```text
Task T39 in ideas/phase2.md: every browser keeps the result of a game it played, and the
server stops keeping finished rooms for a week.

Do:
- Client: on game_finished (and on a welcome for a finished room), write {code,
  finished_at, standings, you} to localStorage "jbi:history", newest first, capped at 20.
  Every accessor tolerates localStorage throwing, like lib/session.ts.
- Home: "Past games" under "Rooms you created here". Each entry opens the final screen
  drawn from storage, using D9's podium component if it has landed and Scoreboard if not.
  No request to the server.
- /r/{code} for a room that 410s: if history has it, show the stored result; if not,
  today's 410 screen.
- Server: a migration adds rooms.finished_at, set on the transition to finished, and
  backfilled for already-finished rooms from their last question's closed_at. The cleanup
  job also deletes finished rooms older than FINISHED_ROOM_GRACE_MINUTES (default 60, in
  config.py and .env.example). The cascade takes answers and custom questions with it.

The grace period is for the phone that locked on the last question. Say that in the config
docstring, so nobody sets it to zero thinking it is free.

Accept:
- Every browser in a finished game holds identical standings in jbi:history.
- The 21st game drops the oldest.
- A finished room is deleted within one cleanup interval after its grace; its code can be
  allocated again. Lobby and playing rooms are untouched by the new rule.
- A deleted room with a history entry shows the stored result; without one, the 410 screen.
- localStorage throwing loses history and nothing else.
```

---

## T40. One menu in the top bar

```text
Task T40 in ideas/phase2.md: fold the top bar's identity, sound and theme controls into
one. This reverses a decision. Read ideas/design.md §4 (the bar), §5 (identity) and §6
(sound) first, and update §4, its ASCII bar and the "Decided" entry in the same change.

Do:
- One control on the right: head, name, and the current theme's emblem. GitHub stays where
  it is, muted, hidden under 26rem.
- One panel with three sections: You (today's profile popover, both save paths from §4:
  local profile outside a room, set_profile inside), Sound (D6's switches and slider; if D6
  has not landed, an empty section D6 builds into), Theme (a row of emblems).
- Emblems: one slot per theme under client/src/assets/, shipping a placeholder, a flat mark
  in the theme's accent, and replaced by dropping in a file. No code change to swap art,
  the same rule design.md §9.1 sets for trophies and NPCs.
- The bar shows the current emblem instead of the light/dark icon.
- No inline styles and no style: directive (design.md §8, the CSP).

Accept:
- At 320px: sign, one control, the name visible and ellipsised, no horizontal scroll.
- Every setting the three popovers reached is reachable from the panel; name what you
  checked.
- Keyboard: opens with Enter/Space, Escape and outside click close it, focus returns to
  the control.
- Changing theme updates the bar's emblem before the panel closes.
- Swapping a placeholder emblem for a file needs no code change; prove it with one.
- The D1 contrast script and existing TopBar tests pass (update the tests mechanically).
```

---

## T41. The TzHaar theme

Paint, judged by the contrast script. Needs T40. T42, which used to share this session, was
superseded by design D13 (`ideas/design.md` §7.1) and has no prompt of its own.

```text
Task T41 in ideas/phase2.md: a black-and-red theme, "tzhaar". Built like D12: against the
contract, and deleted rather than exempted if it cannot pass. Read ideas/design.md §1 and
§2 first.

The trap: wilderness is already near-black and ember red. TzHaar must be WARM where
Wilderness is cold: brown-black obsidian, not blue-grey slate; lava orange-to-red, not
ember; an accent that reads as heat, not danger. If a screenshot of each cannot be told
apart, this task has failed even if every check is green.

Do:
- One contiguous [data-theme='tzhaar'] block in app.css: layers 1-2 and 5-7, plus layer
  8's scroll tokens if D13 has landed.
- Picker entry with a placeholder emblem in T40's slot (a fire cape or TokKul is the
  eventual art).
- Update design.md §1's theme table.

Accept:
- The D1 contrast script passes unmodified, --gem-ink against every gem and layer 8's
  scroll tokens included (if D13 has landed), and its scroll still reads as parchment.
- No layer-3 or layer-4 token is touched outside the block.
- --bad and the lava accent stay distinguishable under a colour-blindness simulation.
  "Red means wrong" is the contract this theme most wants to blur. Say which simulation
  you used.
- State the ΔE between tzhaar's and wilderness's base and accent, and put screenshots of
  both, side by side, in your summary.
```
---

## T44 + T45. Metrics, and the admin view

The admin view is mostly a window onto the metrics, and T45's own prompt already plans for
T44 being missing. Together, that fallback never runs.

```text
Two tasks from ideas/phase2.md in one session: T44 and T45. Do T44 first; T45's "if T44 has
not landed" branch then does not apply.

Work through them one at a time: meet one task's accept criteria and get `make lint test`
green before starting the next, and keep each task's changes separate enough to commit
on its own. If the session runs long, stop after a whole task and say which are left.
Never leave one half done. Report per task at the end.

=== T44. Metrics ===

Task T44 in ideas/phase2.md: counters for how the instance is used. Nothing that
identifies anyone.

Do:
- A migration: daily_stats (day date, metric text, key text not null default '', count
  int not null, primary key (day, metric, key)). Independent of rooms, so cleanup never
  touches it.
- Increment by upsert in the SAME transaction as the event: rooms_created,
  games_started, games_finished, players_joined, players_returning, rounds_played keyed
  by mode id.
- "Returning" with no accounts: create and join accept returning: bool, true when the
  browser had a jbi:profile before this call. Counted, never stored on the player.
- A small module (app/stats.py) owns the metric names as constants. No string literals at
  the call sites.

Accept:
- One game played end to end increments each metric exactly once per event.
- A rolled-back room creation increments nothing.
- Deleting a room leaves its counts.
- Two events on one day give one row with count 2.
- A test asserts daily_stats' exact column set, with a docstring saying why no IP, name,
  code or player id may be added.

=== T45. The admin view ===

Task T45 in ideas/phase2.md: a read-only page for whoever runs the instance. T44 should
have landed; if not, build everything but the metrics section and say so.

Read ideas/architecture.md section 7. The TODO wrote the entry URL as /admin?Token=...,
and this task uses the fragment instead (/admin#token=...), because a query string reaches
the access log and the Referer, and section 7 exists to keep tokens out of both.

Do:
- ADMIN_TOKEN env. Unset: the feature does not exist, and every /api/admin/* route is a
  404. Set but shorter than 64 characters: the app refuses to start and says why.
- /admin reads the fragment once, stores it in localStorage "jbi:admin", replaceStates the
  URL clean, and sends Authorization: Bearer from then on. hmac.compare_digest on the
  server.
- GET /api/admin/rooms: live rooms from the room manager (code, status, current round,
  players connected/total, created_at, expires_at), plus totals of rooms in memory and open
  sockets.
- GET /api/admin/stats: T44's counters for the last 30 days, modes ranked.
- A plain page for both. Nothing links to /admin.
- It never shows room contents: no display names, answers, question payloads or custom
  questions. The operator needs to see the box is healthy, not read a clan's inside jokes.

Accept:
- Unset token: every admin route is 404.
- A short token fails startup with a clear message.
- Missing or wrong bearer: 401.
- The token appears in no access log line, no Referer, and not in the address bar after
  the first load.
- The room list matches the room manager's state in a test with rooms in each status.
- A test serialises every admin response and asserts no display name, answer or question
  payload appears in it.
```
---

## T43. README

```text
Task T43 in ideas/phase2.md: README.md is two lines, and it is the first thing a
selfhoster reads. Write it last among T33/T34/T44/T45, or update those sections as they
land.

Contents:
- One paragraph on what this is, and a screenshot slot (an image path that exists).
- Running it: cp .env.example .env, docker compose up, open the port. Nothing else.
- The env vars that matter, grouped (required / proxy / limits / branding / wiki / admin),
  each pointing into .env.example rather than duplicating its comments.
- Ingress: a complete Cloudflare Tunnel config and a complete Caddyfile (ideas/plan.md
  promised both), each with the FORWARDED_ALLOW_IPS line.
- Development: make dev, make lint test, where packs come from, make gen-packs.
- Contributing questions: link data/packs/AUTHORING.md if it exists.
- Licence (AGPL-3.0), the Jagex trademark line from the footer, OSRS Wiki attribution for
  derived data.

Match this repo's prose: plain, specific, and explaining why where a reader would ask.

Accept:
- Every make target and env var named exists (write a test that checks both).
- Follow it from a fresh clone in a scratch directory to a playable room, and list what
  tripped you up and how you fixed the README for it.
- The Caddyfile and tunnel config are complete enough to paste.
```

---

## After T45

Phase 2 is eleven playable modes, a game that interrupts itself, and an instance someone
other than its author can run. What is left, in `ideas/plan.md`'s order:

- **Phase 3** is the asset pipeline (MOID renders, webp, zoom frames), then Who's That NPC?
  and Pixel Hunt — which are two stems and a generator each, because the
  `pick_from_list` type, its combobox and `GET /api/vocab` landed with Guess the Examine in
  T20, and `steps` is specced in `ideas/architecture.md` already. Settle the open decision at the end of that file first:
  where asset files live given a read-only container. The random-event NPCs want renders
  too, and they are the same pipeline.
- **Design**: whatever of D1–D16 in `ideas/design.md` has not landed (the ready check
  has, as D7). Independent of all of the above, and the thing that makes a playtest feel
  like a real game rather than a form.
- **Phase 4** inherits T33's limits, T36's `PUBLIC_ROOMS` switch and T45's admin view as
  its starting point for abuse measures and monitoring, rather than building them from
  nothing.
