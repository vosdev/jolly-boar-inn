# Phase 2

The open Phase 2 tasks: what to build, in what order, and what "done" means. The design they build
on is `ideas/architecture.md` and `ideas/design.md`; the mode sketches are `ideas/games.md`. The
prompts that hand each task to a session are `ideas/phase2-prompts.md`, and `ideas/TODO.md` says
which tasks have landed. T16–T22 are done, and T42 went to design D13; the numbers keep their gaps.

What is left: six modes and the data they need (T23–T29), the host's question editor (T30), and
fifteen tasks that are not modes (T31–T46). Each task is one session and leaves the app playable.
Each accept criterion is a test unless it says "manual".

- **Every mode from T25 on brings its host**: its art as in design D14 (an entry in T46's
  `data/assets.json`) and the host's lines in `lib/modes.ts`, the way it already brings its blurb.
- **Pack sizes are roster-bound, not targets.** `data/popular-items.json` holds 176 items, and every
  item-derived mode scales off it. So a generator reports what it used and what it rejected rather
  than chasing a number. Growing the roster improves six modes at once and needs no code.
- **T34 lands before T23 sends its first request to the wiki.**
- **Images of items stay in Phase 3.** Every mode here plays on text alone; T46 only fetches the
  hosts' art and the trophies.

## Dependencies

```
T34 wiki rules ─▶ T23 importer ─▶ T24 gen-packs ─┬─▶ T25 bestiary + drop_table
                                                 ├─▶ T26 odd_one_out
                                                 └─▶ T27 ordering + release_order ─▶ T28 sort_it_out
T29 quotes packs               (none; hand-written)
T30 custom editor              (none; blocks nothing, so it can be cut)
T31 loose ends, T32 six options, T33 client limits + IPv6   (none; T27 must respect T32)
T35 invite key ─▶ T36 public lobbies
T37 picking a name…, T38 hidden rounds, T39 finished rooms go home   (none)
T40 one top-bar menu ─▶ T41 TzHaar theme      (T40 builds on design D6 if it has landed)
T44 metrics ─▶ T45 admin view
T34 wiki rules ─▶ T46 fetch-assets   (blocks nothing; D15's art waits on its manifest)
T43 README                     (last of T33, T34, T44, T45, T46: it documents their env vars and commands)
```

T23 is the long pole: the one task with a network dependency and an unknown.

## The modes

### T23. The facts importer

`scripts/fetch_facts.py`, `make fetch-facts`: the first task that touches the network. `ideas/plan.md`
has the sources and the etiquette; architecture §12 has the shape.

Writes `data/facts/items.json`, `npcs.json`, `quests.json` and `manifest.json`. One request per
second and the operator's User-Agent, both through T34's `scripts/wiki.py`. `If-Modified-Since`,
resumable across runs, and a `--from-dir` that replays saved responses so tests and later generators
never need the network. Bucket API for infobox and drop data; `/mapping` for high alch; MediaWiki
generators for the rest, 50 titles a request. Guess the Examine reads no facts, so no examine field
is needed. It never runs at app startup, in CI, or during a quiz.

**Accept:** a full run against recorded fixtures produces all four files offline; manifest checksums
match the files; an interrupted run resumes without refetching what it already has; a second run
against unchanged upstream rewrites nothing; the rate limiter is asserted, not just written; no test
hits the network.

### T24. `make gen-packs`, and the reproducibility gate

`scripts/gen_packs.py` and `scripts/generators/`, the umbrella every generator plugs into.
`gen_price_questions.py` becomes `generators/prices.py` and keeps its offline file flags.
`gen_examine_questions.py` moves under it too, still reading the hand-written `data/examines.json`;
no generator may derive that file from facts. If `make gen-examine-questions` goes, CLAUDE.md's
command for it changes in the same PR.

`make gen-packs CHECK=1` regenerates every pack into a temporary directory and diffs, and CI runs it.
A generator edited without its pack regenerated is the failure every committed generated file
invites, and this is the cheap way to catch it.

**Accept:** `make gen-packs` reproduces every committed pack byte for byte from committed facts, the
roster and `data/examines.json`; `CHECK=1` exits non-zero after a one-line generator change and
names the pack; CI runs it; no generator opens a socket.

### T25. Bestiary and Drop Table

Two `multiple_choice` modes from `facts/npcs.json`, the first two off the importer. Bestiary asks
combat level, release year, quest, location or weakness. Drop Table asks which of four bosses drops
an item. For `AssetStem` to show that item, `multiple_choice` needs an optional `subject`, a schema
change: today its payload has none and allows no extra keys.

Distractors are the whole task. Three random bosses may include one that also drops the item, so
the generator checks every distractor against every NPC's drop list. On a collision it rejects the
question, not the distractor: an item that needs three tries to find a safe fourth option is one
nobody associates with a boss. Bestiary distractors come from the answer's band (a combat level
within a factor, a release year within a few), so the answer is not the odd one out.

**Accept:** no Drop Table question has a distractor that also drops the item, asserted over the
whole pack; no Bestiary distractor equals the answer; combat-level distractors are inside the
declared band; `check()` re-derives every answer from `facts/npcs.json`; both modes playable end to
end.

### T26. Odd One Out

Mode `odd_one_out` on `multiple_choice`, from `facts/items.json` properties. Four subjects, three
sharing a property, one not. The shared property is stored and shown in the reveal, because "why?"
is the whole payoff.

The odd one must be odd *once*. If three items are members-only and the fourth is not, but the
fourth is also the only one that stacks, there are two right answers. The generator checks every
property it knows before emitting. Which properties are in scope decides what players are asked, so
the list is the owner's to approve.

**Accept:** every generated question has exactly one item differing on exactly one known property,
asserted over the whole pack; `check()` re-derives the odd one; the reveal names the shared
property; the generator reports how many candidate quartets it considered and how many survived.

### T27. Ordering, and Release Order

The last new type; architecture §4 has the payload and why it stores both `rank` and `answer`.

`ordering`: credit is the fraction of entries in the right place, ties on `rank` accepted in either
order, and `check()` refuses an `answer` that disagrees with `rank` or a payload that is all ties.
`client_view` drops `rank` and `detail` and orders `entries` by a shuffle seeded from the content
hash, so every socket and reconnect sees one order. A hand-written payload lists entries in answer
order, so a shuffle that lands on full credit is rotated by one. `Ordering.svelte` is a list you
reorder with a mouse or a thumb, with a non-drag path, and the `ends` labels at either end so the
direction is never in doubt. Its gems follow design §3. Mode `release_order` is generated from quest
and NPC release dates.

**Accept:** three of five in the right place scores credit 0.6, and with bucket 2 that is 540
points; two entries sharing a rank score full credit in either order; `check()` rejects an `answer`
that does not sort by `rank`; a payload written in answer order is not shown in answer order, and
`client_view` gives the same order every call; the component is usable one-thumbed on a 375px
viewport; partial credit shows in the reveal as "3 of 5".

### T28. Sort It Out

Mode `sort_it_out` on `ordering`: every order that is not a date. `data/facts/sequences.json` is
hand-curated and the one facts file the importer does not write: gem tiers, metal tiers, and other
orders the wiki states nowhere worth parsing. Combat-level and quest-length orders are generated from
fetched facts. Each sequence carries its own prompt ("weakest to strongest", "cheapest to most
valuable"), because one sentence that fits both fits neither.

**Accept:** sequences validate against a schema of their own and `check()` rejects one with a gap or
a duplicate rank; generated combat-level questions never put two monsters of equal level in a forced
order; at least six curated sequences and ~60 generated questions; a round of Sort It Out and a
round of Release Order in one game show different prompts and different splashes.

### T29. Who Said That? and Clipped

Two hand-authored `multiple_choice` modes: quest and NPC dialogue, and streamer quotes. Clipped ships
as **Know Your Content Creator**, presented by the Gnome Child; the id stays `clipped`, so no stored
room or pack changes. `ideas/games.md` has seed quotes for both.

`data/packs/quotes.json` plus `data/packs/AUTHORING.md`: how to write a pack entry by hand, what
makes a good and a bad distractor, and how to run `make validate-packs` before a PR. It is the file a
contributor reads first when Phase 6 opens submissions. Ship what can be sourced honestly; a thin
pool gives a short round, which selection handles. `stems/QuoteStem.svelte` makes dialogue look like
dialogue.

**Accept:** no quote attributable to two of its own options; every entry has a source (quest name,
or the clip); ≥20 `who_said_that` and ≥15 `clipped`; `make validate-packs` green; `AUTHORING.md`
walks someone from a blank file to a passing validation.

### T30. The custom-question editor

Client only. `/r/:code/create` gets a form per custom type, a list of what has been added, edit,
remove, reorder, and JSON export and import of the room's own questions in the envelope the create
body takes. Limits are read from `schema/question.schema.json`, not retyped.

Each question gets an NPC picker: **Random** first, then the roster from `lib/randomEvents.ts` with
names and themes, and a preview drawn by `RandomEvent.svelte` (design D16's stage once it lands).
Picking sets `random_event`; Random leaves it out. Two questions may pick the same NPC.

It enforces the event cap, the slot count at the chosen frequency (40 questions at `default` take
four), and says `more` would allow more. A 422 after writing a fifth question is the wrong place to
learn the rule.

This task blocks nothing. If Phase 2 is cut short, cut it here: a host can already post custom
questions with `curl`.

**Accept:** add, edit, remove and reorder for all three custom types; export then import round-trips
to a byte-identical file, the chosen NPCs included; import rejects a bad file with a readable message
and changes nothing, and an unknown NPC id in it is one of those messages; the NPC picker defaults to
Random and a question left on it carries no `random_event`; the preview shows the chosen NPC's card;
the editor refuses to submit what the server would 422, the event cap included, and says which of
the two limits it hit; `pnpm check` clean.

## Everything else

### T31. Loose ends

**`HEAD` on the API.** `HEAD /api/modes` is a 404 while `GET` is a 200: FastAPI registers `GET`
alone, so `HEAD` falls through to the static catch-all, which knows `/api/*` is not a file. Uptime
checkers and `curl -I` send `HEAD`. Every `GET` under `/api` answers `HEAD`, done once, not per
route.

**Create stops asking for a name.** The name lives in the top bar, and Create still carries its own
name field and blocks an empty profile. Both go: the host creates under the profile name, and a
browser with no profile is handled the way Join handles it, with a generated name that becomes the
profile and one nudge. The task updates design.md §6 in the same PR.

**Accept:** a test walks every `GET` route under `/api` and asserts `HEAD` gives the same status and
headers with an empty body; `HEAD` on an unknown `/api` path is 404 and on a `POST`-only one is 405;
Create has no name field and the created host carries the profile name; a browser with no profile
creates a room in one tap and is nudged once.

### T32. Six options, at most

There are six gems (design §3), and every answer button is one. So no question offers more than six
choices, of any type, from any source. The cap is one shared definition in the schema that every
array of choices references: `multiple_choice.options` stays at 6, `price_is_right` at 4, and T27's
`ordering.entries` inherits it. `pick_from_list` has no array of choices, so it is exempt. The T30
editor reads the cap like any other limit.

**Accept:** a test walks `schema/question.schema.json` and fails any choice array whose `maxItems`
exceeds 6 or is missing; a seven-option custom question is a 422 naming the field; `validate-packs`
rejects a seven-option pack entry; a six-option `multiple_choice` question plays and every button
draws a different gem.

### T33. Limits that mean one client, and IPv6

The server half has landed: the untrusted `X-Forwarded-For` warning, 30 creates an hour as a
backstop, and IPv6 keyed by /64 with `::ffff:a.b.c.d` folded into IPv4. What is left:

1. **The everyday limit moves to the client.** A host keeps at most five rooms at once
   (`ideas/plan.md`). Create refuses a sixth and points at Home's list, where each room has Remove.
   It is bypassable: the client limit is the polite one, the server's catches the rude one.
2. **IPv6 deployments.** `APP_BIND` accepts an IPv6 address, `FORWARDED_ALLOW_IPS` is documented
   with a v6 range, and the container listens dual-stack. The healthcheck keeps working on
   `127.0.0.1`.

**Accept:** Create with five live rooms in `jbi:created` refuses and links Home, and removing one
lets the sixth through; a room that 410s is dropped from `jbi:created` rather than counted; manual:
`curl -6` reaches a compose deployment with `APP_BIND=::1`, and say what you ran.

### T34. The wiki's rules, enforced

The OSRS Wiki allows automated access with a descriptive User-Agent and at most one request a
second. `gen_price_questions.py` hard-codes a User-Agent naming this repo, so every selfhoster
reports as the upstream project. Design §14 says fetch scripts must refuse to run without one.

`scripts/wiki.py` is the one module every network-touching script imports. It reads
`WIKI_USER_AGENT` from the environment and `.env`, refuses to send without it, and throttles to one
request a second per process. `gen_price_questions.py` moves onto it now; T23 and Phase 3's
`fetch-assets` are written against it. Offline flags (`--mapping-file`, `--from-dir`) send nothing
and need no User-Agent.

**Accept:** a network run with `WIKI_USER_AGENT` unset exits non-zero before its first request, and
the message says what to set and gives an example; offline runs are unaffected; the throttle is
asserted with a fake clock, not a real sleep; a grep test fails any script under `server/scripts/`
that calls `urllib.request.urlopen` or `httpx` without going through `wiki.py`; `.env.example`
documents the variable with the wiki's own wording for what a good one looks like.

### T35. Invite links

Room codes are words, and words can be guessed. A host who ticks **Invite link only** on Create gets
a room with a key, and only a link carrying it joins.

- The key is `secrets.token_urlsafe(9)`, stored on the room and sent to admins only, in `welcome`
  and `room_updated`. It is a door code, not a credential, so it may sit in a link: in the fragment,
  `/r/DRAGON#k=…`, which never reaches the server, the access log or a `Referer`.
- Join reads the fragment and puts the key in the join body. A missing or wrong key lands on a
  prompt asking for it, not an error.
- An admin can **rotate** the key from the lobby. The old link dies and everyone inside keeps their
  session. Rotating a key nobody else has is the room lock, so there is no separate lock toggle.

**Accept:** a keyed room refuses a join without the key or with a wrong one (403 `key_required` /
`bad_key`), and the Join page asks rather than erroring; the correct key joins; a session reconnect
never needs the key; rotating it refuses the old link and disconnects nobody; a non-admin's
`welcome` and `room_updated` never carry the key; the copied share link puts the key after `#`, and
the access-log test proves it never shows up server-side; a room without the tick behaves exactly as
today; a room created before the migration has no key.

### T36. Public lobbies

A host can tick **List publicly** on Create, and Home lists those rooms for anyone to join. It is
worth most to selfhosters: a clan instance whose Home shows tonight's room is one link fewer to paste.

- Listed while `lobby` or `playing` and not full; it drops off when the game finishes. Each entry
  shows the code, the host's name and head, the player count and the round count, with round names
  only if the room does not hide them (T38).
- `GET /api/rooms/public`: at most 50, newest first, cached a few seconds. It is the one endpoint
  that shows a stranger rooms they were not given, so it gives nothing a join would not.
- A public room cannot have an invite key: the form makes them exclusive and the server refuses both.
- A room with custom questions defaults to unlisted (`ideas/plan.md`). The host may still tick it.
- `PUBLIC_ROOMS=false` turns the feature off: no tick, and an empty list. It defaults on; the public
  instance sets it off until Phase 4's abuse measures exist.

**Accept:** a public lobby appears on another browser's Home within the cache window and disappears
when the game finishes; an unlisted room never appears; public + key is a 422; `PUBLIC_ROOMS=false`
hides the tick and serves `[]`; a hidden-rounds public room lists no mode names; the list never
carries a session, a key or a question.

### T37. "Someone is picking a name…"

A player joins first and names themselves after, so the lobby can show `Cow31337Killer42` while Dave
is still typing, and the host presses Start a second too early. `PlayerView` gains `editing: bool`,
in memory like `ready` and never stored. The client sends `editing {on}` when the profile popover
opens on a joined player, and `{on: false}` when it closes. A `set_profile`, a disconnect or 60
seconds of silence clears it. The lobby dims the player with "picking a name…" under the head; the
splash's heads row shows a pencil instead of the tick. It is information, not a gate: an editing
player still counts toward the ready threshold, and Start does not wait.

**Accept:** opening the popover shows "picking a name…" to every other browser within a frame of
`room_updated`, and saving or closing it clears the label; a disconnect clears it; a flag left on
for 60 seconds clears itself; a rename while editing lands with the flag already off; nobody else's
ready count or Start button changes; spamming open/close is limited the way `ready` is, so it
cannot flood the room with `room_updated`.

### T38. Hidden rounds

A host can tick **Surprise rounds** on Create. Players see how many rounds there are and nothing
else, and each round's name arrives with its splash. Withholding is the server's job, because a
client merely asked to hide something is one DevTools tab from not hiding it. For a non-admin,
`welcome`, `room_updated` and `GET /api/rooms/{code}` carry only the segments that have started, and
architecture §6's "What the server withholds" gains a line. Admins see everything. The lobby says
"5 rounds: a surprise", and the splash is unchanged: it was always the reveal.

**Accept:** a non-admin's every payload before round 3 contains no mode id or name for rounds 3
onward (asserted by grepping the serialised frames, not by inspecting one field); an admin's
payloads are unchanged; "Round 2 of 5" still counts correctly; a reconnect mid-game reveals exactly
the rounds already played plus the current one; a random event inside a hidden round reveals nothing
about the round's mode; a room without the tick is byte-identical on the wire to today.

### T39. Finished rooms go home with the players

When a game ends, every browser in it saves the result in `jbi:history`: code, date, final
standings, and which one was you. Newest first, at most 20. Home gets **Past games** under "Rooms you
created here", and each entry opens the final screen from storage with the standings' podium
component, no server involved.

So the server stops keeping finished rooms for days. A migration adds `rooms.finished_at`, and
cleanup deletes a finished room after `FINISHED_ROOM_GRACE_MINUTES` (default 60). The grace is for
the phone that locked on the last question. The answers and the host's custom questions go with the
row, which `ideas/plan.md` wants anyway, and the code is free again. A session whose room is gone
and which has a history entry opens that entry, not the 410.

**Accept:** every browser in a finished room has the same standings in `jbi:history`; the 21st game
drops the oldest; a finished room is deleted within one cleanup interval after its grace, and its
code can be allocated again; a room still in `lobby` or `playing` is untouched by the new rule;
opening `/r/{code}` for a deleted room with a history entry shows the stored result and without one
shows today's 410 screen; localStorage throwing loses the history and nothing else; a room finished
before the migration gets `finished_at` from its last question's `closed_at`.

### T40. One menu in the top bar

The bar's right side is identity, sound and theme: three controls, three popovers (design §5). One
control gives a phone back two thumb targets, and gives the themes a real place. It shows the head,
the name and the current theme's **emblem**, and opens one panel with **You** (today's profile
popover), **Sound** (D6's switches and slider, or an empty section D6 builds into) and **Theme**, a
row of emblems. An emblem is a small picture of the theme's place; each ships as a flat mark in its
accent colour, and a real one drops in with no code change (design §14). The emblem also replaces
the bar's theme icon. This reverses design §5's "nothing folds into a menu", so the task updates §5
and its ASCII bar in the same PR.

**Accept:** the bar's right side is GitHub plus one control at every width, and at 320px the name is
still visible and ellipsised; the panel reaches every setting the three popovers did, with nothing
lost; the panel is keyboard-operable, closes on Escape and outside click, and returns focus to the
control; the emblem in the bar changes with the theme, before the panel closes; a placeholder emblem
reads as deliberate; dropping a file into the emblem slot changes the picture with no code change;
the contrast script still passes.

### T41. The TzHaar theme

Black and red: obsidian, lava, the glow of a fight cave. Built like design D12, against the contract,
and cut if it cannot pass. `wilderness` is already near-black and ember red, and two dark-red themes
side by side are one theme twice. So TzHaar is *warm* where Wilderness is cold: brown-black obsidian,
not blue-grey slate; lava orange-to-red, not ember; an accent that reads as heat, not danger. If the
two cannot be told apart in a screenshot, one of them changes. Its emblem slot (T40) wants a fire
cape or a TokKul.

**Accept:** passes the contrast script unmodified, `--gem-ink` against every gem and the clue
scroll's layer 8 included, and its scroll still reads as parchment; it is one contiguous
`[data-theme='tzhaar']` block that touches no layer-3 or layer-4 token outside itself; `--bad` and
the lava accent are distinguishable with colour blindness simulated, because "red means wrong" is
the contract this theme most wants to blur; its base and accent differ from `wilderness` by a stated
ΔE; the picker offers it with a placeholder emblem.

### T43. README

`README.md` is two lines, and it is the first file a selfhoster reads. It gets:

- What this is, in one paragraph, and a screenshot slot.
- Running it: `cp .env.example .env`, `docker compose up`, open the port. Nothing else.
- The env vars that matter, grouped (required / proxy / limits / branding / wiki / admin), linking
  into `.env.example` rather than repeating it.
- Two ingress recipes: Cloudflare Tunnel and a plain Caddyfile, each with the `FORWARDED_ALLOW_IPS`
  line.
- Development: `make dev`, `make lint test`, where the packs come from, `make gen-packs`.
- Contributing a question: a link to `data/packs/AUTHORING.md` (T29).
- Licence (AGPL-3.0), the Jagex trademark line, and OSRS Wiki attribution for the derived data.

**Accept:** a person who has never seen the repo gets from a fresh clone to a playable room with
nothing but the README, and the task says who tried it and what tripped them up; every `make` target
it names exists; every env var it names is in `.env.example`; the Caddyfile and tunnel config are
complete enough to paste.

### T44. Metrics

How many games are created, started and finished, which modes get played, how many players come
back. Counters in Postgres, and nothing that identifies anyone.

A migration adds `daily_stats (day date, metric text, key text default '', count int, primary key
(day, metric, key))`, incremented by upsert in the same transaction as the event it counts. It is
independent of `rooms`, so cleanup never deletes history. The metrics are `rooms_created`,
`games_started`, `games_finished`, `players_joined`, `players_returning`, and `rounds_played` keyed
by mode. **Returning** needs no accounts: a `jbi:profile` that existed before this call is a
returning player, so create and join carry `returning: bool`, counted and never stored on the player.
No IP, name, room code or player id goes in the table.

**Accept:** each metric is incremented exactly once per event, asserted in a game played end to end;
a rolled-back room creation increments nothing; deleting a room leaves its counts; two creations on
the same day make one row with count 2; `returning` is counted and appears in no other table; a test
asserts the table's columns, so a later "just add the IP" fails review with a reason attached.

### T45. The admin view

For whoever runs the instance: which rooms are live, how many people are connected, and T44's
numbers. `ADMIN_TOKEN` in the environment. Unset, the feature does not exist and every
`/api/admin/*` route is a 404. Set but shorter than 64 characters, the app refuses to start and says
why. The operator opens `/admin#token=…` once; the page moves the token into
`localStorage["jbi:admin"]`, `replaceState`s it out of the address bar, and sends it as
`Authorization: Bearer`. It is a fragment, not a query string, because a query string reaches the
access log and the `Referer`. The server compares with `hmac.compare_digest`.

The page is read-only: live rooms (code, status, round, players connected / total, created,
expires), totals of rooms in memory and open sockets, and T44's counters for the last 30 days with
modes ranked. It never shows room contents — no names, answers or custom questions. The operator
needs to see the box is healthy, not read a clan's inside jokes.

**Accept:** unset token → 404 on every admin route and no `/admin` link anywhere; a short token fails
startup with the reason; a wrong or missing bearer is 401 with a constant-time compare; the token
never appears in the access log, in a `Referer`, or in the address bar after the first load; the room
list matches the room manager's in-memory state; no admin payload contains a display name, an answer
or a question payload, asserted.

### T46. `make fetch-assets`

The art the client wants and the repo does not carry: the hosts' and event NPCs' chatheads and
renders, and the five podium trophies. `scripts/fetch_assets.py` reads `data/assets.json`, a
committed, sorted map of target path to wiki file title, and writes each file where the client
already looks for it: `client/src/assets/npcs/<id>_chathead.png`, `npcs/<id>.png`,
`trophies/<tier>.png`. Titles are explicit and never derived from an id, because the wiki has
several chatheads for some NPCs and the owner picks which.

- **Through `wiki.py`**, which gains `get_bytes`. One MediaWiki `imageinfo` query resolves up to 50
  titles to upload URLs (`redirects=1`); each file is then one throttled request, so N files cost
  N + ⌈N/50⌉ seconds at least, and it says so before it starts.
- **Resumable, never destructive.** A target that exists is skipped, so a file the owner picked by
  hand survives; `--force` refetches. A file is written to a temp name and renamed, so an
  interrupted run leaves no truncated image.
- **It trusts nothing it downloaded.** A body that is not an image (an HTML error page under a
  `.png` name) is refused and not written. A title the wiki does not have is named in the report
  and the rest still fetch; the run then exits non-zero.
- **Flags:** `--only npcs|trophies`, `--dry-run` (lists what is missing, sends nothing) and
  `--from-dir` (replays saved responses, as T23's does). Neither needs a User-Agent.
- **Never committed.** Every target must be git-ignored; the script refuses one that is not, and
  `.gitignore` covers `npcs/` and `trophies/` for every extension the globs accept, `placeholder/`
  and the innkeeper excepted.
- **The manifest is held to the code.** Every host in `MODES` bar the innkeeper, every id in
  `RANDOM_EVENTS`, the Mysterious Old Man and the five tiers has an entry. So a mode's T task adds
  its host's entry with its host, and D15's "every roster id has art" means "has an entry", since a
  fresh checkout has no files.

Docs move with it: design §14 stops calling `make fetch-assets` the owner's and "Phase 3's
importer", architecture §12 gains a line, the two asset READMEs and `trophies.ts` say to run it,
and `make image` builds what is on disk, so T43's README says to run it first.

**Accept:** a run with `WIKI_USER_AGENT` unset exits non-zero before its first request, while
`--dry-run` and `--from-dir` run without one; a full run against recorded fixtures writes every
manifest entry, and a second run writes and sends nothing; the throttle is asserted with a fake
clock across the query and every download; a non-image body and a missing title are handled as
above; an interrupted write leaves no file; an existing file survives without `--force`; every
target is git-ignored (`git check-ignore`) and under `client/src/assets/`; the manifest covers the
hosts, the roster and the tiers, in a server test for the roster and a client test for `MODES`; no
test hits the network; manual: a real run on the owner's machine fetches every entry, and the task
says what you ran and which titles you had to correct.

## Not in Phase 2

- **Images, and the modes that need them.** Who's That NPC? and Pixel Hunt are Phase 3, behind the
  asset pipeline and architecture's two open decisions. `pick_from_list`, its combobox and the vocab
  endpoint already exist, so Phase 3 is a pipeline and two components.
- **Events that need a picture.** A Certer asking what an item's outline is waits for images; in
  Phase 2 a Certer asks in words.
- **A separate room lock.** Rotating T35's invite key does the same job with no second control.
- **Pet icons as heads.** Swapping the art behind the fifty head ids, and a licensing call on game
  assets. The owner's, and it needs no task.
- **The display font and the logo.** The owner's (design §4 and §14). The slots and fallbacks exist.
