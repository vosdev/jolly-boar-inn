# Phase 2 prompts

One prompt per session, pasted into a fresh session at the repo root. CLAUDE.md applies to
every session and is the only standing instruction. Each prompt names the task in `ideas/phase2.md` and adds only what the spec does not
say. Run the sessions in the order they appear; each assumes the ones before it landed. T43
sits last because it documents what the others add.

The small tasks are grouped so a session is never spent on an afternoon's fix: T31 + T32 +
T34, T35 + T37, T36 + T38 and T44 + T45. A grouped session does its tasks in the order
given, one at a time, each on its own branch and PR with its own version bump, and stops
after a whole task rather than leaving one half done.

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
- Sources: Bucket API (meta.weirdgloop.org) for infobox and drop data, /mapping for high
  alch, MediaWiki generators for the rest at 50 titles per request.
- Every request through scripts/wiki.py (T34): it owns the one-per-second throttle and the
  operator's WIKI_USER_AGENT, so this script sets neither. If-Modified-Since. Resumable
  across runs — an interrupted run must not start over.
- --from-dir replays saved responses so tests and every later generator work offline.
- make fetch-facts.
- data/facts/README.md: OSRS Wiki attribution and the CC BY-NC-SA notice. Committing
  derived wiki content requires it.

Decide the exact field set per file and state it in the module docstring — later tasks
(T25, T26, T27, T28) read these files, so name the fields for what they are rather than
for the endpoint they came from. Guess the Examine does not read facts, so no field is
needed for it.

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
  generators/prices.py and gen_examine_questions.py alongside it, keeping their offline
  file flags working. The examine generator keeps reading the hand-written
  data/examines.json; nothing may regenerate that file from facts.
- make gen-packs runs them all. make gen-packs CHECK=1 regenerates into a temp directory,
  diffs against the committed packs, and exits non-zero on any difference, naming the pack.
- CI runs CHECK=1.
- Update the Makefile and .github/workflows/ci.yml. Drop the gen-*-questions targets or
  keep them as aliases — your call, say which. If gen-examine-questions goes, update
  CLAUDE.md's command for it in the same PR.

A generator changed without its pack regenerated is the failure mode every committed
generated file has, and this gate is the cheap way to catch it. That is the point of the
task; the refactor is incidental.

Accept:
- make gen-packs reproduces every committed pack byte for byte from committed facts.
- CHECK=1 is green on a clean tree, and exits non-zero naming the pack after a one-line
  change to any generator.
- CI runs it and fails on the same condition.
- No generator opens a socket: every one of them reads only data/facts/, the roster and
  data/examines.json.
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
copy, and a stem that shows four subjects. Which properties are in scope decides what
players are asked, so propose the list and wait for my answer before generating; then say
so in the module docstring. A property nobody can name is not a question.

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
server side landed in T21 and T22 and does not change.

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

One task at a time, each on its own branch and PR. If the session runs long, stop after a
whole task and say which are left. Report per task at the end.

=== T31. Loose ends ===

Task T31 in ideas/phase2.md: two small fixes from ideas/IDEAS.md. Keep them as two
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

Accept:
- A test walks every GET route under /api and asserts HEAD gives the same status and
  headers with an empty body. HEAD on an unknown /api path is 404; on a POST-only route 405.
- Create has no name field; the created host carries the profile name; a browser with no
  profile creates a room in one tap and is nudged once, exactly as a joiner is.
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
- A six-option multiple_choice question plays, and every button draws a different gem.

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
Task T33 in ideas/phase2.md. The server half (the X-Forwarded-For warning, 30 an hour, IPv6
by /64) has landed; read server/app/http/ratelimit.py and forwarded.py to see it. What is
left is the client-side limit and IPv6 deployments.

Do:
- Create refuses a sixth live room in jbi:created (ideas/plan.md wants five) and points at
  Home, where each room already has Remove. A room the server answers 410 for is dropped
  from jbi:created, not counted.
- The container listens dual-stack; APP_BIND and FORWARDED_ALLOW_IPS are documented with
  IPv6 examples in .env.example; the healthcheck still works.

Accept:
- Create with five live rooms refuses and links Home; removing one lets the sixth through.
- A room that 410s leaves jbi:created.
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

One task at a time, each on its own branch and PR. If the session runs long, stop after a
whole task and say which are left. Report per task at the end.

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

One task at a time, each on its own branch and PR. If the session runs long, stop after a
whole task and say which are left. Report per task at the end.

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
  drawn from storage, using the standings' podium component (Scoreboard.svelte).
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

One task at a time, each on its own branch and PR. If the session runs long, stop after a
whole task and say which are left. Report per task at the end.

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

Read ideas/architecture.md section 7. The entry URL is /admin#token=..., a fragment and
never a query string, because a query string reaches the access log and the Referer, and
section 7 exists to keep tokens out of both.

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
- Contributing questions: link data/packs/AUTHORING.md.
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
