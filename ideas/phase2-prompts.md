# Phase 2 prompts

One ready-to-paste prompt per task in `ideas/phase2.md`, for Opus 5 on High or Extra in a
fresh session at the repo root. Run them in order; each assumes the ones before it landed.

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
- components/questions/types/ : the answer affordance, one per question type. MoreLess.svelte
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
  and follow one of the five shapes from games.md (3 higher, 2 high 1 low, ...) picked per
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
Task T20 in ideas/phase2.md: the guess_examine mode on the free_text type.

The examine text is already in the /mapping response the price generator fetches and
throws away. Read ideas/architecture.md section 2 for the free_text payload (note the
optional subject, used for the reveal — the old guess_examine type was folded into this one).

Do:
- questions/normalize.py : lowercase, NFKC, trim, collapse whitespace, strip punctuation,
  Levenshtein distance. Accepted answers under 4 characters require distance 0, so "Jad"
  does not accept "Jam".
- questions/types/free_text.py, all six exports, using normalize.
- types/FreeText.svelte and stems/ExamineStem.svelte.
- scripts generator -> data/packs/examine.json.
- lib/modes.ts entry: "Guess the Examine".

The generator's real work is rejection. An examine that contains the item's own name, or
any word of the name longer than three characters, is not a question — "A sharp sword." is
fine, "An abyssal whip." is the answer written on the card. Reject and report, do not try
to mask the word.

Accept:
- Normalisation tests: case, accents, punctuation, whitespace, the under-4 rule.
- A one-character typo on the full name is accepted; a different item's name is not.
- An examine containing the item name is rejected by the generator with a reason in its
  output summary; assert it on a fixture.
- accepted carries the obvious aliases (e.g. "whip" for "Abyssal whip") — decide the rule,
  state it, and test it.
- The generator prints how many roster items it used and how many it rejected, with the
  reason, and the rejection rate is under a third. The roster is 176 items today, so do not
  chase a fixed question count — report the number you got.
- make validate-packs green.
```

---

## T21. Multiple choice, closest number, and where the host's questions land

```text
Task T21 in ideas/phase2.md: the last two simple types, and random events server-side.

Read ideas/architecture.md section 1 (selection.py's "Random events", and segments.py),
section 2 ("A random event is not a mode", and the payloads), section 4 (the settings
block and the custom paragraph under it), and section 6 (exclusions).

Do:
- questions/types/multiple_choice.py and closest_number.py. closest_number is SCORING =
  RANK and returns the credit ladder from section 6 (1.0/0.8/0.6/0.4/0.2), ties sharing the
  better rank.
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
  in T30, the way mode copy already lives in lib/modes.ts.
- Author exclusion gets its first real caller (T10 built and tested it).
- types/MultipleChoice.svelte and ClosestNumber.svelte.

Do not: build the editor UI (T22), and do not build the event presentation — the NPC card
and the held-back buttons are T30. Until then an event plays as an ordinary question in the
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
```

---

## T22. The custom-question editor

```text
Task T22 in ideas/phase2.md: the client editor for custom questions. Client only — the
server side landed in T21 and does not change.

Do:
- The /r/:code/create route: a form per custom type (multiple_choice, free_text,
  closest_number), a list of what has been added, edit, remove, reorder.
- Export the room's custom questions to a JSON file, and import one back. Same envelope as
  the schema, so an exported file is a valid POST body.
- Client-side validation mirroring the schema's limits, so the form never submits something
  the server will 422. The schema is the source of truth for the caps — read them from
  schema/question.schema.json rather than retyping the numbers.
- The room's event cap: a host may write one question fewer than the number of modes they
  picked, because each one interrupts a round and never the first (architecture section 1).
  The form knows the selected modes, so it can say "four modes, three questions" before the
  server has to.

Accept:
- Add, edit, remove, reorder for all three types.
- Export then import round-trips to a byte-identical file.
- Import of a malformed file shows a readable message and changes nothing already entered.
- Every schema limit (option counts, string lengths, accepted-answer counts) is enforced in
  the form, with the message next to the field.
- The event cap is enforced and explained: adding a fourth question to a four-mode room says
  why it cannot, and deselecting a mode that drops the cap below what is already written says
  so rather than waiting for submit.
- pnpm check clean. Manual: create a room with two custom questions and play it.
```

---

## T23. The facts importer

```text
Task T23 in ideas/phase2.md: scripts/fetch_facts.py, the first thing in this project that
talks to the wiki.

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
- One request per second. Descriptive User-Agent with contact details. If-Modified-Since.
  Resumable across runs — an interrupted run must not start over.
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

## T30. Random events

```text
Task T30 in ideas/phase2.md: make the host's questions, and some of ours, arrive as random
events.

Read ideas/TODO.md "Custom Questions" for the idea in the words it was written in, then
ideas/architecture.md section 3 (OpenQuestion.random_event and answerable_at, and the
paragraphs under the shapes) and section 4 (the splash rule, and the pending → open
row). T21 already placed the events and stored questions.random_event; this task is the
two seconds and the NPC.

Do:
- OpenQuestion gains random_event (the NPC id, null for an ordinary question) and
  answerable_at. answerable_at is shown_at for an ordinary question and shown_at +
  random_event_seconds for an event; ends_at becomes answerable_at + the round's
  seconds; elapsed is measured from answerable_at; an answer received before it is
  rejected with not_open. Nothing new is stored — answerable_at is derived, so rehydrate
  does not change.
- The splash rule moves from "a new mode" to "a new segment" (segments.py already groups an
  event into the round it interrupts). An event gets no splash, and neither does the question
  after it.
- lib/random_events.ts: the roster's copy — id, NPC name, the line they open with, the
  asset ref. A dozen of them. This is the one place in the project that gets to be
  funny, so write them like the game writes them; the ids must match
  app/random_events.py.
- components/RandomEvent.svelte: the NPC and the question stem, with the answer
  affordance held back until answerable_at, counted off server_time and not the local
  clock. An unknown random_event id draws a generic card, the way viewFor already falls
  back for a mode it cannot draw.

Do not: add a phase to the room state machine, add a column, or send a second message when
the buttons appear. All three are avoidable and section 4 says how.

Accept:
- An answer before answerable_at is rejected with not_open, asserted on the server.
- A player answering the instant the buttons appear lands in bucket 1: the wait costs nobody
  a point.
- ends_at - answerable_at equals the round's own seconds.
- No splash runs for an event, and none runs for the question following one.
- A reconnect inside the held-back window lands on the NPC card with the right remaining
  delay, computed from the welcome snapshot.
- random_event_seconds: 0 plays an event as a plain question — that is what the rest of
  the tests run on.
- An unknown random_event id renders the generic card and logs nothing alarming.
- pnpm check clean. Manual: play a four-mode room with two custom questions, and say where
  the events turned up.
```

---

## After T30

Phase 2 is eleven playable modes and a game that interrupts itself. What is left, in
`ideas/plan.md`'s order:

- **Phase 3** is the asset pipeline (MOID renders, webp, zoom frames), then Who's That NPC?
  and Pixel Hunt — which are two components and a generator each, because the
  `pick_from_list` type, `GET /api/vocab` and `steps` are all specced in
  `ideas/architecture.md` already. Settle the open decision at the end of that file first:
  where asset files live given a read-only container. The random-event NPCs want renders
  too, and they are the same pipeline.
- **Design**, from `ideas/TODO.md`: the OSRS theme, the ready-check instead of the splash
  countdown, and the round-only leaderboard. Independent of all of the above, and the thing
  that makes a playtest feel like a real game rather than a form.
