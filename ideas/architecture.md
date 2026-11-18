# Architecture

How Jolly Boar Inn is built today, and the reason behind each choice that looks odd. The product is
in the README, the open tasks are GitHub issues and `ideas/design.md`. Everything here is
final. The licence is AGPL-3.0.

## 0. Stack

| Concern | Choice | Reason |
|---|---|---|
| Server | Python 3.14, FastAPI, uvicorn, one worker | All room state lives in one process's memory. |
| Database | Postgres 18 through `asyncpg`, hand-written SQL | An ORM would add more code than it removes. |
| Migrations | Numbered `.sql` files, applied at startup by `db.py` | Alembic needs SQLAlchemy models we do not want. |
| Validation | Pydantic v2 for HTTP and websocket, `jsonschema` for questions | The question schema is shared with CI and the client. |
| Client | Svelte 5 with runes, Vite SPA, TypeScript; Leaflet for the map, Admin, Suggest, Report, History and the changelog each load on first use | No SSR is needed, so no SvelteKit. |
| Tooling | `uv`, `ruff`, `mypy`, `pytest` with `pytest-xdist`; `pnpm`, ESLint, Prettier, `svelte-check`, `vitest` in jsdom | Vitest compiles components exactly as the build does. |
| Serving | FastAPI serves `client/dist`, SPA fallback to `index.html` (404 for a missing file under `/assets/`, `/pictures/` or `/map/`); `robots.txt`, `sitemap.xml` and `/.well-known/security.txt` built from `PUBLIC_BASE_URL` | One container, one origin, no CORS. |
| Time | `datetime.now(UTC)` on the server, `timestamptz`, ISO 8601 on the wire | The client never sends a time. |
| IDs | uuid rows, word room codes, content-hash question ids | Codes are for people; uuids go on the wire. |

## 1. Repo layout

```
Dockerfile, docker-compose.yml     three-stage image + data, logo, map; app + postgres:18 (+ .dev.yml, .data.yml)
Makefile, .github/workflows/ci.yml all, setup, dev, lint, test, gen-*, import-suggestions, edit-packs,
                                   edit-roster, rehash-questions, fetch-assets, logo, image, loadtest(-smoke); CI: audit, loadtest, release; map.yml renders the map when its inputs change
schema/                            question.schema.json (4), protocol.schema.json (6), modes.json (3)
data/packs/                        prices (generated, ignored), examine, sample (stale), random_events/
data/                              assets, pets, popular-items/-npcs, player-names, room-words
branding/                          a selfhoster's logo, gitignored
monitoring/                        Prometheus scrape config and alert rules, starter Grafana dashboard
server/app/                        main, config, db, static, accesslog, errors, metrics, pets, daily, similar,
                                   random_events, suggestions, reports, question_edits, roster_edits, stats,
                                   question_stats, pictures, map, profiling
server/app/rooms/                  state, host, joins, lobby, loop, daily_room, models, errors, queries,
                                   settings, selection, segments, scoring, ready, codes, plan, duration, hold, teams, items
server/app/modes/, questions/      Mode and MODES; schema, packs, vocab, normalize, custom,
                                   submission, text; types/ one module per type
server/app/ws/, http/              handler, protocol, schema, outbox; one module per route or middleware
server/scripts/                    wiki, gen_price_questions, import_suggestions, edit_packs,
                                   edit_roster, rehash_questions, fetch_assets, build_pictures,
                                   build_logo, gen_map, map_render/ (Java), gen_locations,
                                   validate_packs, check_contrast, smoke_ws, loadtest
client/src/lib/                    api, ws, protocol, stores, session, history, profile, modes, …
client/src/routes/, components/    Home, Create, Join, Room, Daily, History, Admin, Suggest, Report; TopBar, …
client/src/components/questions/   viewFor(type, mode), Question, gem buttons; types/, stems/
```

Routes: `/`, `/create`, `/r/:code` (the room with a session, Join without), `/r/:code/create` and
`/history/:code/:stamp` (a finished game from this browser, `stamp` its `finished_at` as UTC
`YYMMDDHHMM`), `/admin` and its tabs `/admin/suggestions`, `/reports`, `/questions` and `/roster` (the
operator's view, section 10), linked from Reldo's box on Home once this
browser holds the admin token, `/suggest` and `/report` (section 11), linked once it has finished a game, and `/daily` (section 7). `/dev/map` plays `map_pin` on made-up players under `pnpm dev` only. The credits are a sheet from the footer.
`/how-to-play` and `/how-to-play/:view` (a mode's name as a slug, or `random-events`) are drawn by Home.
The retired `/r/:code/admin` resolves like `/r/:code`, because whoever holds that link knows the code.

## 2. Room state

`RoomManager` (`rooms/state.py`, with `joins`, `lobby`, `loop` and `daily_room`) owns every room. Handlers call it.
The four mixins use only what `RoomHost` (`rooms/host.py`) declares of `self`, which mypy checks.
Nothing else writes `rooms`, `players`, `questions` or `answers` after creation.

`RoomManager` methods: `get`, `get_listed`, `create`, `start_daily`, `daily_result`, `join`, `check_code`,
`free_code`, `connect`, `disconnect`, `set_profile`, `check_avatar`, `set_ready`, `set_editing`, `set_team`,
`move_team`, `set_teams`, `set_settings`, `set_questions`, `set_tv`, `start_game`, `submit_answer`, `skip`,
`end_round`, `rotate_key`, `request_join`, `poll_request`, `cancel_request`, `decide_request`, `promote`, `kick`,
`end_game`, `rematch`, `delete`, `purge_expired`, `evict`, `shutdown`. A `Room` holds `players`, `requests`, `plan`,
`custom_questions`, `custom_author`, `played_ids`, `questions`, `totals`, `totals_round`, `current_index`, `phase`,
`next_at`, `next_mono`, `sockets`, `timer`, `awaiting_player`, `daily`, `advance`, `rescheduled`, `players_stale`,
`players_flush` and `lock`.

- One `asyncio.Lock` per room. Every public method takes it. Nothing locks across rooms.
- A method writes to Postgres before it changes memory, so a failed write leaves memory as it was.
  An answer is committed before its `answer_ack`.
- A method builds its frames under the lock, then queues them on each socket's `Outbox`: 256 frames
  and one writer task, which also carries replies and closes so frames keep their order. Sockets
  sent the same frame share one `Frame`, serialised once. An overflow, or a send slower than 10 s,
  closes that socket with 1011. No socket I/O under the lock.
- `RoomManager` is the only part that would change for several replicas. Do not build for that now.

## 3. Modes and types

A **type** is an answer shape: what a player sends, how it is checked, how it earns points. A
**mode** is a round: what the host picks, what a splash introduces, what a pack pools by. Five
planned modes share `multiple_choice`; as five types they would be five copies of `grade`.

`Mode(id, types, is_round=True, questions=None, pool=None, setting=None, options=None,
steps=None, pictured=False, picture_at_reveal=False, extra_answer=0, stem="text",
hold_counts_prompt=False, suggest=None, report="question", compare="question")` in `modes/`,
registered in `MODES` in the create form's order. A mode's rules are its entry's alone: no other
module lists mode ids, which a test greps for.

- `id` is `questions.mode` and the settings key. It is never renamed once shipped.
- A round may mix types. The game loop reads only `question.type`, which also times the question. A
  round whose types disagree on `questions` states its own; `modes.problems` checks this at import.
- `is_round` is explicit, so an empty `types` never turns a round into an event pool. Only `custom`
  and `random_event` are not rounds. They state no types and no numbers.
- Copy (label, hint, blurb, host lines, suggestion card) lives on the client in `lib/modes/`. `make
  gen-modes` writes every entry, `UPCOMING`, `PLANNED`, each type's `ANSWER`, `SCORING` and `GRACE`
  and the speed buckets to `schema/modes.json`, committed; the client reads its per-mode rules
  (`lib/modeRules.ts`), its mode order and How to play's timings and points from it, and keeps no
  list of mode ids. A server test fails while the file is stale, a client test while a mode file is
  not in it. `stem` is also typed in each mode file, for `rooms/hold.py`, and a server test holds
  the two equal; `hold_counts_prompt` keeps Pixel Hunt's prompt in the hold.
- `suggest` is a frozen `Suggest` record of what `/suggest` takes (section 11), its `types` the
  mode's own unless stated; `TRIVIA_TYPES` names the seven most rounds take. `UPCOMING` maps a
  round not built yet to its `Suggest`; `PLANNED` lists those that take no suggestions yet. `report` is `item`, `options` or `npc` where the report form
  offers or labels a mode's questions so; `compare` is `item`, `options` or `npc` where `similar.py`
  scores them so. `modes.problems` refuses a contradictory entry at import.
- `pool` names the mode whose pack questions a round draws, restamped with its own id. `setting` names
  the `Settings` flag that offers the mode; off, or with an empty pool, `/api/modes` omits it and
  `POST /api/rooms` is a 403 `mode_not_offered`. A stored room keeps playing it. `options` holds a
  round's `multiple_choice` questions to fewer options than the schema's two to six; `mode_errors`
  refuses the rest. `steps` is Pixel Hunt's and `pictured` Pixel Hunt's and Who's That NPC?'s (sections 8 and 12); `BUILT_UP` in `random_events.py` gives Certer both. `picture_at_reveal` keeps a question's `picture` off the open view. `extra_answer` adds seconds to a question's answer time, before the pace, for a round that takes longer to read.

Each module in `questions/types/` exports:

```python
def client_view(payload) -> dict      # what everyone sees while open: never the answer
def reveal(payload) -> dict           # what the close shows
def parse_value(payload, value)       # the canonical answer, or None for bad_value
def grade(payload, submissions) -> dict[player_id, float]   # credit, 0.0 to 1.0
def check(payload) -> list[str]       # the stored answer follows from the stored facts
def pictured(view, payload, pictures) # optional: a pack question's pictures inside its view
SCORING: Scoring                      # SPEED by default (section 8)
GRACE: float                          # 0 up to 1: the share of ANSWER the speed buckets skip
ANSWER, REVEAL: Timing                # base + per_item seconds, at run pace
def items(payload) -> int             # optional: options or entries; 0 without it
```

- The room stores, echoes and grades what `parse_value` returns, never the raw value.
- `grade` takes every submission at once, so a type could weigh one against another. The close rounds
  credit to 1e-9 and clamps it to 0..1, logging a bad value rather than failing.
- `Bounds(default, minimum, maximum)` is the question count Create offers and `NewRoomSettings`
  enforces. It falls back from mode to types to registry. Rounds default to 5 questions.
- A question's time to answer, with its mode's `extra_answer`, and its reveal are its type's, at the room's `pace`: ×1.25
  `walk`, ×1 `run`, ×0.75 `teleport`, a half rounded up, at least 5 s to answer and 4 s to reveal.
  At `run`: `multiple_choice` 10 + 2/option and 4 + 0.5/option, `pick_all_that_apply` 10 + 3 and
  4 + 1, `ordering` and `matching` 10 + 5 and 4 + 2 per entry or field, `price_is_right` 15 and 6,
  `more_less` 10 and 5, `pick_from_list` 25 and 6, `free_text` 20 and 7, `closest_number` 20 and 8,
  `number_slider` 15 and 8, `map_pin` 20 + 10 and 8 + 2 per pin, `picture_pin` 20 and 10.
  `name_wrong_answers` adds 1 s to every reveal after the pace, for the names.
- A game's minutes (`rooms/duration.py`) are a ceiling: every question's hold, answer and reveal,
  15 s per splash, standings between rounds. Create multiplies each round by its mode's `seconds`
  (`/api/modes`), its pool's mean per pace; a surprise counts the offered modes' average.

| Mode | Label | Type | Pool | Status |
|---|---|---|---|---|
| `more_less` | More or Less | `more_less` | `/mapping` + `/latest` | done |
| `price_is_right` | The Price is Right | `price_is_right` | `/mapping` + `/latest` | done |
| `guess_examine` | Guess the Examine | `multiple_choice`, four to six names | `examine.json` | done |
| `custom` | Host's Questions | per question | the host | done, as events |
| `random_event` | Random Event | per question | one file per NPC; Certer's from the Pixel Hunt roster, always sketched | done, as events |
| `random_events_only` | Random Events Only | `multiple_choice`, `free_text`, `closest_number`, `number_slider`, `pick_all_that_apply`, `ordering`, `matching`, `pick_from_list` | the `random_event` pool, an NPC first, then one of theirs | done, 20 at most, `RANDOM_EVENT_GAME_MODE` |
| `bestiary` | Bestiary | `multiple_choice`, `closest_number`, `number_slider`, `free_text`, `ordering`, `pick_all_that_apply`, `matching` | hand-written | done |
| `drop_table` | Drop Table | `multiple_choice`, `free_text`, `pick_all_that_apply`, `closest_number`, `number_slider`, `matching`; `image` is its picture | hand-written | done |
| `odd_one_out` | Odd One Out | `multiple_choice`, four to six names | hand-written | done |
| `minigame_madness` | Minigame Madness | Bestiary's seven types; `image` is its picture | hand-written | done |
| `release_order` | Release Order | `ordering` | hand-written | on hold: too few questions, waiting for player suggestions |
| `sort_it_out` | Sort It Out | `ordering` | hand-written | done, the first on `ordering` |
| `who_said_that` | Who Said That? | `multiple_choice` | hand-written | done |
| `know_your_content_creator` | Know Your Content Creator | `multiple_choice`, `closest_number`, `number_slider`, `pick_all_that_apply` | hand-written | done |
| `whos_that_npc` | Who's That NPC? | `pick_from_list` over `popular-npcs.json`, a shadow; `multiple_choice`, a render | hand-written | done |
| `pixel_hunt` | Pixel Hunt | `pick_from_list` over `popular-items.json`, a detail picture built up | generated from the roster | done: Zoom out, Pixelate, Tiles, Slide puzzle, Lantern, Sketch |
| `forgetful_bard` | The Forgetful Bard | `pick_from_list` over `popular-items.json`, a verse; its picture at the reveal | hand-written | done: one item may have several verses |
| `scaperune` | ScapeRune | `multiple_choice`, four options, `extra_answer` 12 | hand-written | done: `prompt` is the answer, a line per entry if ordered, and `options` are questions, at most 120 characters; `/suggest` relabels its form to say so |
| `tales_of_gielinor` | Tales of Gielinor | Bestiary's seven types | hand-written | done, hosted by the Wise Old Man, who is therefore off the roster |
| `uris_unravelling` | Uri's Unravelling | Bestiary's seven types, `extra_answer` 5 | hand-written | done: a clue is `multiple_choice`, its text the `quote`, never `free_text`; no map or coordinate clues |
| `slayer_master` | Slayer Master | Bestiary's seven types | hand-written | done: how to fight a monster; what it is stays in Bestiary |
| `mark_the_map` | Mark the Map | `map_pin`, one pin on the whole surface | hand-written, drafted once by `gen_locations.py` | done, hosted by Bill Teach; a place inside a town opens on both (`view`) with `reach` 50 |
| `minimap_guesser`, `name_that_spell` | Minimap Guesser, Name that spell | undecided | | Images (minimap), Sound (spell) |

Create lists the unbuilt ones from their files in `lib/modes/`, in `UPCOMING` then `PLANNED` order.

- Sort It Out and Release Order are two modes over one type: their splash, prompt and pool differ.
  So is a sort into bins: `matching` with `bins` (section 4), which every round with `matching`
  takes, timed and scored alike; players read "Sort" where a plain one says "Match".
- Who's That NPC?'s shadows use a strict list, not free text: free text needs an alias list and a
  typo argument per item. Mostly monsters: people look alike in shadow. A render, for lesser-known
  NPCs, is the whole picture over look-alikes on buttons, its NPC off the list. Guess the Examine dropped its list for buttons: players found it too hard.
- Examine lines are hand-picked, not taken from `/mapping`. The wiki's were accurate and not funny.
- The Price is Right is its own type: a log slider from `min` to `max` (`types/slider.py`,
  `lib/slider.ts`) on a three-figure grid; `value`, the price at two figures, lies strictly inside.
- `number_slider` shares that slider, `linear` (steps of 1) or `log` by its `scale`. Every round
  with `closest_number` offers it too: typed where the exact number matters, a slider where close
  counts. Editors default to log once `max` ≥ 20 × `min`.

## 4. Questions

`schema/question.schema.json` (Draft 2020-12) defines the envelope and one payload per type. The
server's Pydantic models and the client's TS types are derived by hand and tested against it.

- Every payload stores its answer, even a derivable one, so `grade` never recomputes game logic.
- Numeric facts are embedded with `as_of`. Play needs no dataset.
- `id` is `q_` plus 16 hex of `sha256(type + "\n" + canonical_json(payload))`. `mode` and the other
  envelope fields stay out, so a mode rename rewrites no id.
- Length caps live in the schema, not only in forms. Every choice array references
  `$defs/choices`, six at most, one per gem; `ordering.entries` and `matching.options` do too.
- Assets are `item:<id>` or `npc:<id>`, or `screenshot:<name>`, an own screenshot, never a URL. No
  `client_view` or `reveal` carries one: for some modes that id is the answer. A pack question's
  picture goes out as `picture` (section 6), a `matching` field's `icon` as the field's `picture`
  and a `picture_pin`'s `screenshot` as the view's, added by the type's `pictured`.
- `difficulty` on the envelope is `easy`, `medium` or `hard`. Every round-pack question has one; an
  event or host question without one counts as medium.
- `random_event` on the envelope names the NPC who asks. Only event files and host questions carry it.
- `wiki` on the envelope is the page an author checked; `source_url` is any https link, for what
  the wiki cannot prove. Players never get either.
- An optional `multiple_choice.quote` is shown as a quotation under `prompt`.
- `credit` names the player who suggested a pack question; with `credit_shown` the reveal says it,
  and `GET /api/credits` counts it: `{authors: [{name, questions}]}`, most first, for the credits.
- `GET /api/question-counts` is `{modes, random_events}`, drawable questions by round and by NPC, the daily set's pool, for the footer.

| Type | `value` | Credit |
|---|---|---|
| `more_less` | option index | 1 or 0 |
| `price_is_right` | gp on the slider's grid, in `[min, max]` | by distance (section 8) |
| `multiple_choice` | shown position | 1 or 0 |
| `free_text` | string, at most 80 characters, no NUL or lone surrogate | 1 or 0 |
| `closest_number` | number | by distance within `within` (section 8) |
| `number_slider` | an integer on the slider's track, in `[min, max]` | by distance (section 8) |
| `pick_from_list` | an entry id of the question's vocabulary | 1 or 0 |
| `pick_all_that_apply` | distinct shown positions, sorted, at least one; exactly `picks` if set | right share − wrong share, at least 0; with `picks`, right picks ÷ options right or picked |
| `ordering` | shown positions, first end first: all, or `picks` of them | per place: 1 for its rank; with `picks`, ½ for another picked one |
| `matching` | a shown option position per field, in field order, distinct unless `bins` | right fields ÷ fields |
| `map_pin` | a list of `{x, y}` in game tiles, one per target, inside `bounds` or the surface | mean of each pin's credit, at the pairing that scores best (section 8) |
| `picture_pin` | one `{x, y}`, fractions 0..1 of the picture's width and height; on a grid its cell's middle | by distance from the box (section 8), or 1 or 0 on a grid |

- Free text is NFKC-normalised, lowercased, stripped of punctuation and whitespace-collapsed, then
  matched within `max_distance` of an accepted answer. Levenshtein runs only inside that band, so it
  stays linear on the event loop. Answers under four characters need an exact match ("Jad", "Jam").
- `ordering` is `ends` (two labels), three to six `entries` of `text`, `rank` and an optional
  reveal-only `detail`, `answer`, entry indices sorted by `rank`, and an optional `picks`: order only
  the top that many, shown open. Equal ranks tie and score in either order; `answer` only orders
  them for the reveal. `check()` rejects an `answer` that does not sort by `rank`, a skipped rank
  (1, 1, 2, never 1, 1, 3), and a payload whose first `picks + 1` (or all) ranks tie.
  `client_view` shows the entries without rank in a shuffle, rotated by one if its played places
  land in order. The half credit needs `picks`: without it every entry belongs somewhere, so the
  half would pay for any answer.
- `matching` is three to six `fields` (a `text`, an `icon` asset or both), `options` of `text` and a
  reveal-only `detail`, at least one per field, the rest decoys, and `answer`, an option index per
  field. `check()` rejects a repeated field or option, an option used twice and too few options.
  `client_view` shows the fields in order and the options shuffled, rotated by one if every
  field's option would sit at its own position. With `bins: true` (never `false`, one question
  one id) the options are two to four bins and the fields four to six entries; `answer` and a
  value may repeat a bin, a bin may stay empty, an entry has one bin, and there is no rotation.
  The open view and the reveal carry `bins`; the client groups the reveal's entries by bin.
- `multiple_choice`, `pick_all_that_apply`, `ordering` and `matching` show options or entries in a shuffle
  seeded by the payload (`types/shuffle.py`): one order for every socket and restart, and the
  authored order (often answer first) never leaks. Values and the reveal name shown positions.
- `number_slider` stores integers. `check()` rejects `min` ≥ `max`, a log `min` below 1, a log
  `min`, `max` or `answer` off the three-figure grid, and an `answer` on an end or on the middle
  where the slider starts (half rounded up).
- `map_pin` is `targets` (a `name` and a box of tiles, at least 10 across; six at most, one pin
  each), optional `bounds`, a rectangle the map stops at, optional `view`, where it opens with the rest a pan away, and optional `reach`. The open view has `pins`, the count, and never a
  target. It plays in rounds only: `drawable` needs the tiles (`TILES` among `pictures`, from
  `CLIENT_MAP` or the client), so a pool with no tiles is empty, and an event has no pool to empty.
  Above five pinned players a several-pin map shows only your own, and the TV only the targets.
- `picture_pin` is a `screenshot`, its `width` and `height` in pixels for its shape, and either a
  `target` box in fractions with `reach`, or a `grid` of 1 to 16 `cols` and `rows` with target
  `cells` (`{col, row}` from 0 at the top left, not every one). `check()` rejects a box under 0.02
  of the longer side across. The open view has `picture`, the shape and any `grid`, never a target;
  `drawable` needs the screenshot among `pictures`. Rounds only: a host's question names no picture.
- `pick_all_that_apply` stores sorted `answer_indices` and an optional `picks`, shown open. `check()`
  rejects no option right, a `picks` that is not their count, and, without `picks`, fewer than two
  wrong options. Every option right is allowed (owner's call).
- `pick_from_list` answers through one strict WAI-ARIA combobox. Typing only searches, by word
  prefix, ignoring case and accents. Only a selected entry can be submitted, with its own button;
  the mode, not the payload, sets its `steps` (section 8).

## 5. Packs, selection, segments

- A pack file is `{pack, generated_at?, questions}`, the stamp only if generated, and may hold several modes. An event file,
  `data/packs/random_events/<npc>.json`, is `{pack, random_event, questions}`; the loader stamps
  the NPC on each question and refuses a file named after nobody on the roster.
- `validate_packs.py` fails CI on a schema error, a duplicate or mismatched id, an unknown mode, a
  type its mode does not allow, a stray `random_event`, a price type filed as an event, one
  `pick_from_list` prompt under two answers unless each has a picture, or a Pixel Hunt question
  without its own item's detail picture.
- Custom questions are rows with `source = 'room'`, `mode = 'custom'` and `author_player_id`.
- Create's editor writes `multiple_choice`, `free_text`, `closest_number`, `number_slider` and
  `pick_all_that_apply` (`picks` only as a "tell players how many" box), and `MatchingForm` a
  text-only `matching` with limits read from the schema, refuses what the server would 422, the slot cap included, and exports
  `[{type, payload, random_event?}]`, which Import reads back byte for byte. The host's questions are a bank of up
  to 100 in localStorage, one `jbi:own-question:<n>` `{question, used}` each; the room sends the ticked ones in bank
  order. Import adds unticked and skips duplicates; Export writes the bank; one the checks refuse is dropped on load.
- `/suggest` adds an `ordering` form for the rounds that sort, Bestiary's and random events'
  (NPC and intro) beside their other types: entries first to last and a "tied with the one
  above" box, so ranks follow, `picks` optional. Release Order's entries carry their date as `detail`.
  `MatchingForm` writes field and answer pairs side by side, then decoys, for Bestiary, Drop Table,
  the NPCs and a question with no round; a suggestion's fields are names only, and `/admin` adds icons.
- Every round on Create takes suggestions, the price rounds and Pixel Hunt as items and Random Events Only as the
  NPCs' questions; a test fails on a new round that does neither. Not-yet-built image modes are not on Create.
- `/suggest` offers `map_pin` for Mark the Map only, with its card shown once a tile loads: a place's name, one box and a `reach` of 50 to 200 on `MapView`, whose `grips` keep their markers through a drag. The prompt is `Where is <name>?`; the queue may reword it.

`select(packs, custom, settings, rng, pictures, played)` fixes a room's questions at `start_game`.
Until then a lobby's `total`, `events`, `rounds` and `estimated_seconds` come from a dry `select`
thrown away (`rooms/plan.py`), redone on every settings change:

- `surprise_modes: N` draws N distinct offered round modes at the start, each at its default
  `questions`, and needs `hide_rounds`. The plan counts the N shortest. A request with both it and
  `modes` is a 422.
- `difficulty` draws `easy` and `medium` (`easy`), every tier (`mixed`) or `medium` and `hard`
  (`hard`) first, and tops a round up from the other tier before cutting it short. Events and
  the host's questions ignore it.
- One round per mode picked, of that mode's `questions`. Pools are keyed by mode, never by type, or
  modes sharing a type would draw each other's questions.
- `mode_order: random` shuffles the rounds once, here. The stored order is the running order.
- Questions are drawn without replacement. A dry pool gives a short round; an empty one is dropped.
  Pack questions a room's earlier games showed (`rooms.played_question_ids`) are drawn last, before any tier.
- It ends with `place_random_events`, which adds events on top of the rounds.

Random events:

- `random_event_frequency` is one event per 20, 10 or 5 round questions (`less`, `default`,
  `more`). There is no off switch; `less` is the quiet end.
- Round questions are cut into windows of that size, one slot per whole window. A slot follows a
  question that is not its round's last, so an event never opens the game or a round.
- The host's questions take slots in order. More than the slot count refuses the start, naming the
  count, the limit and the frequency, because a silent drop would surface mid-game.
- Other slots take an NPC's own question, drawn with its face, preferring a type the interrupted
  round does not play. A slot stays empty only when nothing qualifies.
- Faces: a named NPC asks its question. Others come from the unseen NPCs, then the least seen, never
  next to the same face. An NPC with no file yet only asks host questions; Certer never does.
- `MAX_QUESTIONS_PER_ROOM` (100) counts events.

Writing an NPC's questions:

- The roster is the ids in `server/app/random_events.py` (`a-z0-9_`, at most 32 characters, stored in
  `questions.random_event`, never renamed). The copy (name, `theme`, `right`/`wrong` reveal lines of at
  most 60 characters, `asset` as `npc:<id>`) is in `client/src/lib/randomEvents.ts`. The questions are
  `data/packs/random_events/<id>.json`, one file per NPC, which names the NPC once as `random_event`.
  Every NPC needs at least two questions (`test_random_events.py`); around five is the target.
- `intro` is the NPC talking, at most 150 characters, typed in while the question waits. `prompt` is
  the plain question and must make sense without it. An `explanation` is welcome: a random event is
  the place for the one fact nobody knew.
- Every type but `more_less` and `price_is_right` is allowed (only their own round shows the item they
  ask about; "which heals more?" is `multiple_choice`). Payload fields follow
  `schema/question.schema.json`.
- Stay on the NPC's theme: the joke is that they only care about their own subject. Check every fact on
  the wiki; `make validate-packs` checks the shape, not the truth.

`segments_of` groups rows into rounds by the stored `questions.round`, and an event carries the round
it interrupts. Deriving rounds fails silently: settings break on a short round, runs of `mode` on an
event.

The daily set (`app/daily.py`) is ten questions for everyone. A day runs from 08:00 UTC to the next
08:00 UTC and carries the date it opens on; `DAILY_FIRST_DAY` is #1, and before it `/api/daily` is 404 `daily_not_open`. The day's first request draws
and stores it (section 11), with no cron, never seeded from the date, since the packs are public.

- The pool is the offered rounds' own pools and the NPCs': never a mode with a `pool`, so never
  `random_events_only`, a host's question, an undrawable one, or `sample.json`'s stale prices.
- Each place draws a random mode, then a question in it (the NPCs' pool an NPC first): by question,
  the largest pools would take their places every day.
- At most 2 per `mode`, so the NPCs' pool counts as one. At most 3 `multiple_choice` and 2 of any
  other type, which makes at least 5 types.
- A question rests 60 days, tracked by id, but `price_is_right` by item and `more_less` by metric and
  pair, whose ids change with the prices. A short pool brings back the oldest-used; a pool the
  caps cannot fill raises and stores nothing. The play order is a shuffle. Section 7 plays it.

## 6. Websocket protocol

`GET /ws/{code}`, JSON text frames, `{"t": "<type>", ...}`. The session goes in the first frame,
never the URL. The client keeps it in `localStorage["jbi:session:" + code]`.

`ws/protocol.py`'s models are the one definition. `make gen-protocol` writes
`schema/protocol.schema.json` from them and `client/src/lib/protocol.gen.ts` from that; both are
committed, and a server and a client test fail while either is stale. `protocol.ts` only names
what the schema inlines (`Phase`, `ErrorCode`) and renames `Error` to `ProtocolError`.

| Client `t` | Fields | Who | Effect |
|---|---|---|---|
| `hello` | `session` | all | Must be first. Replies `welcome`. |
| `ping` | | all | Replies `pong`. |
| `answer` | `question_id`, `value` | all | Stored if open, unanswered and allowed. `answer_ack` or `error`. |
| `ready` | `ready: bool` | all | Lobby or splash only. One take-back per splash, one lobby change a second. Teamless in a team game, or the TV: `bad_state`. |
| `set_profile` | `display_name?`, `avatar?` | all | Lobby only. Validated exactly like a join. One change a second. Clears `editing`. |
| `set_team` | `team` | all | Lobby of a team game, not while ready or the TV; a god not in the room is `bad_value`. One change a second. |
| `move_team` | `player_id`, `team` | admin | Lobby of a team game: anyone but the TV, ready or not, connected or not. Their ready stays. |
| `set_teams` | `teams` | admin | Lobby: the whole list, 2 to 6 gods in order, or `[]` for free for all, else `bad_value`. A dropped team's players go teamless; in a team game they, and everyone if teams just began, go un-ready. |
| `set_settings` | `settings` | admin | Lobby: the whole game, checked like `POST /api/rooms`, as the host edits it. `teams` and `max_players` stay the room's, and a changed `hide_rounds` is `bad_value`. A plain object on the wire, so a bad one costs no socket. |
| `editing` | `on: bool` | all | Name field focused. Lobby only, else ignored. An `on` within 1 s of a change is ignored; 60 s unsent, a disconnect or `start_game` clears it. |
| `start_game` | | admin | `lobby → playing`. |
| `skip` | `phase`, `index` | admin | Ends that phase if the room is still in it, so a double tap ends one. In a daily room its player skips the reveal (Next). |
| `promote` | `player_id` | admin | Makes them admin; the TV is `bad_state`. There is no demote. |
| `set_tv` | `player_id`, `on: bool` | admin | Lobby only. `on` makes them the room's one TV, un-ready and teamless, and the old TV a `player`; the last admin is `bad_state`. `off` makes the TV a `player`. |
| `kick` | `player_id` | admin | Deletes the player and their answers; closes 4003. Not on admins. |
| `end_round` | `index` | admin | Splash, open or reveal of `index`: voids an open question, standings, next round. Last round: `end_game`. |
| `end_game` | | admin | Voids an open question, `playing → finished`. |
| `rematch` | | admin | `finished → lobby` for another game (section 7). A daily room or any other status: `bad_state`. |
| `rotate_key` | | admin | Lobby, invite-only room. New key; the old link stops joining, nobody leaves. |
| `decide_request` | `request_id`, `accept` | admin | Lets a waiting join request in or turns it away, once (section 10). |

| Server `t` | Fields | When |
|---|---|---|
| `welcome` | `room`, `you`, `players`, `question`, `your_answer`, `standings`, `team_standings`, `server_time`, `server_version` | Reply to `hello`. The full state. |
| `room_updated` | `room`, `players`, `standings`?, `team_standings`? | Join, leave, promote, `set_tv`, kick, rename, `set_teams`, `set_settings`, status change, a splash or standings starting (with the drop) or a rematch (with both standings), a ready change that moves `next_at`. |
| `players_updated` | `players` | A ready, team, editing, connect or disconnect that changed players only. One frame, queued behind the room lock's waiters, covers every change before it; a `room_updated` or `welcome` already did. |
| `question_open` | `question` | A question opens. |
| `answer_ack` | `question_id`, `scoring`, `band`, `answered`, `of` | Answer committed. Never correctness. |
| `answer_count` | `question_id`, `answered`, `of`, `waiting` | Another player's answer, connect, disconnect or kick moved the count. Who is still to, never what. |
| `question_closed` | `question_id`, `reveal`, `picture`, `results`, `unanswered`, `standings`, `team_standings`, `next_at`, `reveal_seconds`, `suggested_by`? | Closed. `unanswered`: connected players who could answer and did not. `next_at` ends the reveal, the last one's too. `reveal_seconds` is its length, null in a daily room. `suggested_by` is a shown `credit`. |
| `game_finished` | `standings`, `team_standings` | Final. `team_standings` is null outside a team game. |
| `pong` | `server_time` | Reply to `ping`. |
| `error` | `code`, `message` | `bad_hello`, `bad_message`, `not_admin`, `not_open`, `already_answered`, `excluded`, `bad_value`, `bad_state`, `bad_name`, `name_taken`, `bad_avatar`. |

```
RoomView     { code, status, settings, current_index, total, events, phase, next_at,
               reveal_seconds, estimated_seconds, segment, next_segment?, played, finished_at,
               rounds?, key?, requests?, daily?, drops? }
Daily        { day, number }
JoinRequest  { id, display_name, avatar }
PlayerView   { id, display_name, avatar, role, team, connected, ready, editing, item }   role: player, admin, tv
HeldItem     { id, charges }                 Drop { player_id, item }
Standing     { player_id, display_name, avatar, points, rank, points_gained, previous_rank }
TeamStanding { team, points, rank, points_gained, previous_rank }
Segment      { mode, index, total, start, count }
OpenQuestion { question_id, index, total, type, mode, segment, view, picture, random_event,
               opened_at, answerable_at, ends_at, you_can_answer, answered, of, waiting }
PlayerResult { value, correct, credit, points, item_points, item }
```

- `total` counts stored questions, not what the settings asked for; `events` the random events among them.
- `OpenQuestion.mode` sits beside `type` because the pair picks the view (`viewFor`), and an event's
  mode differs from its segment's.
- `view` is `client_view(payload)`. `random_event` is the NPC id; an unknown id gets a generic card.
- `picture` is a pack question's file in `/pictures/` under a random name, from `data/pictures.json`
  (section 12), or null: no image, a host's question, or a file the client lacks: `client/dist`,
  or `client/public` under `make dev`. Served immutable, and drawn under the stem, open and revealed,
  but for a `picture_at_reveal` round's, which only `question_closed` names. Devtools still show the
  whole picture before it builds up or loses its shadow. A `picture_pin`'s screenshot is
  `view.picture` instead, open and revealed, and its target only the reveal's.
- `answerable_at` is `opened_at` plus the hold the question types in (`rooms/hold.py`): 0.4 s (0.9 s
  for an event), each line, a round's host's ask line counted as 50 letters, at 50 letters a second
  with a 0.5–1 s pause after it, then 0.2 s. Answers before it are `not_open`, and `ends_at` and timing count from it, so the typing
  costs nobody points.
- `next_at` ends the timed phase. It is null while a question is open or a splash waits for the room.
  `reveal_seconds` is the reveal's whole length, for the countdown bar; null outside a reveal.
- `estimated_seconds` is the lobby's minutes for the stored questions (section 3).
- `finished_at` is the server's end of the game, so every browser files it under the same link.
- `next_segment` is the round the standings hand over to, sent only in the standings phase.
  `played` is the modes of the rounds before `segment`, in play order, for the splash's hosts.
- `rounds` counts the stored rounds, sent only with `hide_rounds`; `hide_rounds` and
  `surprise_modes` themselves only when set.
- `key` and `requests` (waiting join requests, oldest first) are an invite-only room's, sent only
  to its admins (section 10). `daily` marks a daily room (section 7).
- `band` is the speed bucket for SPEED, the step for STEP, null for ACCURACY. `of` is every connected
  player who can answer, plus anyone who answered and dropped. `waiting` is the ids of the connected
  ones who can and have not, for the TV's panel (design §16).
- `credit` lets a reveal say "3 of 5 in place". `correct` is `credit >= 1.0`.
- `drops` is what the standings dealt (section 8), in standings order, sent only in that phase.
  `item` is a player's worn `HeldItem`, for everyone to see, null outside its round; `charges` is
  null for an item without. `points` is the answer's own, `item_points` the item's line on the
  reveal and `item` the item behind it; `Standing.points` and `points_gained` hold both.

What the server withholds. The admin is a player with a flag; there is no admin channel.

- Open-question frames differ by socket only in live counts and `you_can_answer` (false on
  `host_only` and for the TV), and never carry the answer.
- `question_id` is the row uuid, never the content id, which hashes the answer and could be
  brute-forced.
- Results and correct answers first appear in `question_closed`, to everyone at once.
- The question list is never sent. `GET /api/rooms/{code}` returns only `{status, players}`, a count;
  `GET /api/rooms/public` is in section 10.
- With `hide_rounds`, a non-admin's `welcome` and `room_updated` list in `settings.modes` only the
  rounds `current_index` has reached, and the standings `next_segment`. An admin's lobby lists them on the panel that edits them.
  With `surprise_modes`, admins get the same withheld list: the host did not pick them either.
- An admin can read the room's custom questions before the game. They cannot score on them.
- An invite-only room's key and join requests reach admins only. The key is a column, not a setting.

| Close | Meaning | Client |
|---|---|---|
| 4000 | a newer socket for the same player took over | stops |
| 4001 | bad `hello`, after an `error` frame | stops |
| 4003 | kicked | stops |
| 4004 | unknown, expired or deleted room; no `error` frame | stops |
| 4008 | protocol error, after an `error` frame | stops |
| 1008 | no `hello` in 10 s, over 10 messages a second after a burst of 20, over 10 connects a minute per session or 30 per address, the oldest of over 10 sockets per address awaiting `hello`, an `Origin` of another site, or rate limited | reconnects |
| 1009 | a frame over 64 KiB | reconnects |
| 1011 | a send failed or timed out, or the server failed a connect or command | reconnects |
| 1012 | the room left memory; the reconnect rehydrates it | reconnects |
| 1013 | the server holds `MAX_SOCKETS` sockets already | reconnects |

`GET /api/vocab/{name}` serves `items` (`popular-items.json`) and `npcs` (`popular-npcs.json`,
each the infobox's first NPC id) as `{vocab, version, entries: [{id, name}]}`, built at startup. One name under two ids, or one id under two names, refuses to load. The client fetches a list once, when a question
first names it; per question it would resend the list every time. It gives nothing away: it is every
entry, not the question's options.

## 7. Room lifecycle

```
POST /api/rooms ─▶ lobby ─start_game─▶ playing ─last reveal / end_game─▶ finished
any state ─▶ deleted: expires_at passes (cleanup), or an admin sends DELETE /api/rooms/{code}
finished ─▶ deleted: FINISHED_ROOM_GRACE_MINUTES (60) after finished_at (cleanup)
finished ─rematch─▶ lobby
```

- Each browser saves the final standings in `jbi:history` (newest 20) on `game_finished`, or on a
  `welcome` into a finished room: the grace is for the phone that slept through the end. The TV's
  browser saves one too, though standings never list the TV. Home
  lists them under Past party games, five to a page, where each can be removed. `/r/:code` for a gone room (4004, 404, 410) opens the newest entry
  for that code, if any.

- A room is born with its host; there is no state before `lobby`. Only `lobby` is joinable. `/create`
  is a lobby with its doors shut, held in the host's browser (`jbi:draft`) because a room's code is
  its address: Open the doors is the POST, so an unopened room costs the server nothing.
  The mode picker's order is a seed in `jbi:mode-seed`, redrawn with each new draft, so the lobby matches.
- `start_game` needs an admin, a round and a connected player who is not the TV. It selects the
  questions, and a selection that fails leaves the room in the lobby. It resets `expires_at`. A team
  game also needs every player, connected or not, in a team and players in two teams or more.
  Teams are fixed from then on; `players.team` and `settings.teams` are written before memory.
- `rematch` keeps the code, players, teams, TV, key, host's questions and settings, but for a surprise
  room's drawn rounds. It deletes the game's questions and answers, adds its shown pack questions'
  ids to `played_question_ids`, clears ready, item slots and `finished_at`, resets `expires_at`,
  raises `rooms.rematches` (the item draw's seed) and counts in the `rematches` metric. Everyone lands in the lobby at once; each browser filed the game under its own `finished_at`.
- A deleted room closes its sockets with 4004, and its code is free again.

A daily attempt (`rooms/daily_room.py`, `/daily`) is a room born `playing` from the day's stored set,
one question a round, with one `player` and settings `run`, early close, no names, no standings.

- `POST /api/daily {token, display_name, avatar?}` → `{code, session}`. The token is the browser's
  (`jbi:daily:token`), stored as sha256 in `daily_attempts` under the attempt's day, once per day.
  An unfinished attempt resumes, whatever its day, with a new session; a finished one today is
  409 `daily_played` with its `result` `{day, number, points, correct, results}`. A gone room ends
  its attempt there, as does asking for its result. `GET /api/daily` → `{day, number, next_at}`, `next_at` when the next day opens. `POST /api/daily/result {token, day}`
  returns a finished attempt's `result`, or 404, and starts nothing; `/daily` asks it first for an
  attempt left unfinished, which may have run out.
- Home's Daily challenge panel offers the day's daily, or its score and `next_at`, and lists earlier
  days from `jbi:daily:scores`: every result `/daily` showed, in this browser only, never trimmed.
- The end screen, and `/daily` after playing, shows the result and copies a share text without
  answers: `I scored 7,420 on daily challenge #12 at <site>. Think you can do better?`, a row of 🟩 full,
  🟨 partial, 🟥 none, and `location.origin/daily`.
- Join, requests and `GET /api/rooms/{code}` answer 404 for it, and Home never lists it. The first
  question opens on the player's first `hello`; no splash, no standings, no Past party games entry.
- The reveal has no countdown: Next, in the answer panel, is the player's `skip`, and the server moves on after 300 s. No table column or timer `n/m` tab; the bar counts questions.

One task per room runs `_run_questions(room, index, resume_at, standings_after)`, the last an
`end_round`'s standings:

```
(segment start) splash ─ready countdown / skip─▶ open ─timer / all answered / skip─▶ reveal
reveal ─▶ standings (a round's last question, not the game's) ─▶ next question / finished
reveal ─▶ next question / finished (every other question)
open ─end_game / end_round / crash─▶ voided
splash / open / reveal ─end_round─▶ standings ─▶ next round's splash (the rest unshown)
```

- `phase` is `idle` (lobby, finished), `splash`, `open`, `reveal` or `standings`. It is not a
  column, so a restart resumes in the reveal (section 9) and loses a splash or standings screen.
- Each change of round breaks the ended round's items and deals the next round's (section 8),
  written before the standings frame: also with `standings_seconds` 0, after `end_round`, and on a
  restart that skipped the standings. A drop with receivers holds the standings 4 s longer; the
  lobby's estimate leaves that out. The game's end empties every slot.
- A splash runs before each segment's first question, never before an event.
- Open stamps `shown_at` and sets `answerable_at` and `ends_at`. Close grades, then writes
  `closed_at`, `correct`, `points` and `item_points` in one transaction.
- The TV only watches: `Room.can_answer` is false for it, so it is never in `of`, `waiting`, `unanswered`,
  all-answered or a splash's count, and standings, `game_finished` and question stats leave it out.
- `close_when_all_answered` closes 1 s after every connected eligible player has answered (never
  past the question's end), also when a disconnect or kick makes that true. A skip doesn't wait.
- `skip` and all-answered set `Room.advance`; they never cancel the task.
- Deadlines live on the monotonic clock, so a late wakeup closes at once and a clock jump moves
  nothing.
- A step that raises drops the room from memory with 1012; reconnects rehydrate it.

The ready check (`rooms/ready.py`):

- `ready` is an in-memory flag, never stored; a restart costs one tap.
- In the lobby it is advice. Start below the threshold asks first, and the server allows it. In a
  team game only a player with a team can ready up, and must un-ready to change team.
- On a splash, eligible players are the connected ones who can answer. The threshold is
  `min(ceil(0.8 × eligible), eligible - 1)`, and 1 for a room of one.
- The splash has no clock until the threshold. Then it counts 10 s, or 3 s once everyone is ready.
- A countdown is never pushed back. An un-ready below the threshold stops it, once per player per
  splash. A disconnect lowers the threshold instead of stalling the round.

Settings (`rooms.settings`, changed in the lobby by `set_settings` and `set_teams`, but for
`hide_rounds`, since rounds already shown cannot be hidden again):

```jsonc
{
  "modes": [{"mode": "more_less", "questions": 5}],  // one round each; [] until picked
  "mode_order": "random",                // or "listed"
  "random_event_frequency": "default",   // "less" | "default" | "more"
  "pace": "run",                         // "walk" | "run" | "teleport", section 3
  "difficulty": "mixed",                 // "easy" | "mixed" | "hard", section 5
  "standings_seconds": 10,               // 0..30; 0 turns standings off
  "close_when_all_answered": true,
  "name_wrong_answers": true,            // name who got it wrong under the reveal
  "items": true,                         // items between rounds, section 8
  "hide_rounds": false,                  // surprise rounds, section 6
  "surprise_modes": 0,                   // > 0: the server draws that many rounds, section 5
  "max_players": null,                   // null: MAX_PLAYERS_PER_ROOM, stored at create
  "teams": []                            // 2..6 gods, or [] for no teams
}
```

- `modes[].mode` keys `MODES`, never `TYPES`, once each. `questions` is optional.
- `teams` are distinct gods in `rooms/teams.py`'s order (`GODS`), the one list of them, checked by
  `check_teams` at creation and on `set_teams`.
- `NewRoomSettings` checks the ranges at creation and on `set_settings`. `RoomSettings`, the stored model, keeps a round
  whose mode was removed and ignores unknown keys (an old room's `seconds` and `reveal_seconds`
  too, playing at `run`), so no downgrade strands a room.

## 8. Scoring

`elapsed = received_at - answerable_at`, on the server's monotonic clock, from arrival rather than
from taking the lock. `grade` returns credit; `scoring.py` turns it into points per `SCORING`:

| `SCORING` | Points | Types |
|---|---|---|
| `SPEED` | `round(bucket points × credit)` | `more_less`, `multiple_choice`, `free_text`, `pick_all_that_apply`, `ordering`, `matching` |
| `ACCURACY` | `round(1000 × credit)` | `closest_number`, `price_is_right`, `number_slider`, `map_pin`, `picture_pin` |
| `STEP` | `round(step points × credit)` | `pick_from_list` in a mode with `steps`, or Certer's |

| Speed bucket | Fraction of the question's seconds | Points |
|---|---|---|
| 1 | ≤ 0.10 | 1000 |
| 2 | ≤ 0.25 | 900 |
| 3 | ≤ 0.50 | 800 |
| 4 | ≤ 0.75 | 700 |
| 5 | ≤ 1.00 | 600 |

- A type's `GRACE`, for an answer that takes building, moves each edge to `grace + edge × (1 −
  grace)`: 0.2 ends bucket 1 at 0.28 and bucket 5 at 1.0. Every type states 0 for now; `STEP`,
  `ACCURACY` and team games ignore it. `lib/samples.ts` repeats the edges, held by
  `speedEdges.fixture.json`.
- Fractions, not seconds, so quick and slow rounds score alike. Five coarse buckets make a 50–150 ms
  network difference irrelevant, so there is no RTT compensation.
- An answer from `ends_at` on is `not_open`, even if the close runs late.
- Partial credit rides the bucket: 0.6 in bucket 2 is 540.
- `pick_all_that_apply` without `picks` pays `max(0, right ticked ÷ right − wrong ticked ÷ wrong)`
  (no wrong option: wrong share 0), so ticking everything pays 0.
- `ordering` without `picks` pays `max(0, 1 − 2 × swaps ÷ pairs)` over pairs of different ranks,
  `swaps` the pairs put the wrong way round, so a random order of five averages 0.16. With `picks`,
  1 per exact place and half for a picked entry elsewhere. The reveal counts places from the value.
- `matching` with `bins` grades as without, entries in their bin over the entries, with no floor
  for chance: a blind guess over two bins averages half, so `check` wants three or four.
- A team game (`settings.teams` non-empty) drops speed: `SPEED` pays `round(1000 × credit)` and
  `answer_ack.band` is null. `ACCURACY` and `STEP` score as ever.

Closest number: each guess against the answer alone, speed not counting. Exact is 1.0; within
`within` (the answer's unit, shown while open) 0.75 falling linearly to 0.25; else 0. No `within`
is exact only. Editors offer 0/5/10/25% of the answer, whole and at least 1 for a whole answer.

Map pin: 1.0 inside the target's box, then a straight line from its edge to 0 at `reach` tiles: the
question's own, else 100, or with `bounds` a fifth of their longer side up to 100. The client repeats
the pairing (`lib/pins.ts`) to draw each pin's line: the server cannot send it in `value`, which is
echoed while the question is open. `mapPins.fixture.json` holds both to the same answers.

Picture pin: `map_pin`'s sum on the picture as drawn, distance and `reach` in fractions of its
longer side, so a 16:9 screenshot grades evenly; `reach` 0 is all or nothing. On a grid, 1 on a
target cell, else 0. `lib/picturePins.ts` repeats it, held by `picturePins.fixture.json`.

Slider (`price_is_right`): 1.0 for a guess that rounds to the price at two figures, then falling
linearly from that band's edge to 0 at a quarter of the log width; the reveal ticks every guess.
`number_slider` has no band: 1.0 on the answer, 0 a quarter of the track's width away.

Steps (Pixel Hunt, and Certer anywhere): `Steps(build=17, of=25)`, 17 steps of a 25th of the question's seconds while
the picture builds up, then the whole picture as step 18. Points fall from 1000 to 435 on step
17 and 400 on 18, `round(400 + 600 × (18 - k) / 17)`. A mode without `steps` scores on speed.

- There is no `question_update` message. Clients work the schedule out from `answerable_at` and
  `ends_at`, and the reveal (`lib/pixelHunt.ts`, one `<canvas>`, a function of the picture, the
  build-up's progress and a seed, empty before `answerable_at`). Reveals are dealt by `index`,
  all six per six questions in an order shuffled by the room code; the seed hashes `question_id`.
  A daily room deals from the day and `index` instead, so every attempt builds a question up alike.
- `points_for(scoring, credit, band, steps, team=)` is the one entry point. It refuses credit outside 0..1
  rather than paying for a type's bug.
- `correct` is `credit >= 1.0`: three of five in order scores, and is not "correct".
- `host_only` and the TV score nobody and get `excluded`. Authors score on their own questions. A kicked
  player's answers are deleted.

Bucket edges and points are tuned on `answer_timings` (section 11), queried by hand.

Items (`rooms/items.py`). Each change of round deals the lowest `floor(n / 2)` standings rows an
item for the next round, `n` the rows (TV out, connected or not), at least four; never in a daily
room, a team game or with `settings.items` off. The lowest `ceil` half of those positions draw
strong or mild, the rest mild. Everyone level (points and correct) with an edge position falls on
its lower side. The draw is uniform over the tier's items that fit the next round (any of its
questions, events included), seeded by sha256 of room code, round, player uuid and
`rooms.rematches`; nothing fits, no item. One slot (`players.item`, `item_round`,
`item_charges`), broken at the end of its round. An item's `on_answer` runs after `points_for`
and its `settle` at the close of its round's last question or `end_round`; what they give is
`answers.item_points` (and `answers.item`), never credit, so `question_stats` and
`answer_timings` keep base credit. A question only the host answers fits no item.

| Item | Tier | Fits a round with | Effect |
|---|---|---|---|
| `super_restore` (4 charges) | mild | a `SPEED` question (effective scoring) | Credit > 0 on `SPEED` is paid two buckets quicker, bucket 1 at best; a charge only where that pays more; breaks on the last. `answer_ack.band` stays the real bucket. |
| `ring_of_life` | strong | anything | The first answer under 500 gets `500 − points`, then breaks. |
| `phoenix_necklace` | strong | three questions or more | `settle`: the worst answered question (the earlier of a tie) rises to the others' average base points, rounded half up, if higher. |

Standings sort by points (item points included), then correct answers, then `joined_at`. Rank is dense over points and
correct answers; join time only orders players who share a rank. `points_gained` is what the round
of the latest close added and `previous_rank` the rank before that round by the same rule, null
in the first; the totals query splits its sum at that round's first position.

Team standings average the same totals: a team's members' points summed over its member count,
rounded half up, so a silent member pulls it down. Rank is dense over points, ties in
`settings.teams` order; gains and previous ranks are the rounded averages before the round. A team
without members is left out.

## 9. Reconnect and restart

Client (`lib/ws.ts`):

1. On close, or no `welcome` 10 s after `hello`, retry after `min(8000, 500 × 2^attempt)` ms plus up
   to 250 ms. A welcomed socket that stays up 10 s resets it.
2. `welcome` replaces all local state. Timers count against `server_time`, not the local clock.
3. On `visibilitychange` or `online`, reconnect a closed socket at once, and ping one that claims to
   be open, reconnecting if nothing arrives in 4 s. Phones lie after sleep.
4. Ping every 30 s. No frame in 10 s closes the socket. So does an `answer` unanswered in 5 s.
5. A `welcome` with a different `server_version` reloads the page at once; an API response's
   different `X-App-Version` (`lib/version.ts`) at the next navigation or tab return. Once per
   version. A lost lazy chunk (`vite:preloadError`) reloads once per build, then offers Try again.

Server `connect`: find `sha256(session)` in the room or close 4001. The last device wins: an older
socket closes with 4000. A disconnect keeps the player, their answers and their item.

Rehydrate (`get` on a room not in memory):

1. Load the room, players with their item slots, questions and each player's summed points (item
   points included) and correct count. Answer rows are not read back; step 2 voids the only ones
   that could matter.
2. A question shown and not closed was open at the crash. Void it and score nobody. A crash costs at
   most that question.
3. Resume in `reveal` for that question's reveal, then advance. A question that never opened is still
   owed, so that reveal opens it. A round's last question breaks and deals its items there, unseen;
   a drop already written deals the same again.
4. Any lookup loads the room, but only an authenticated socket resumes it, so a link preview never
   plays a room nobody is in.

## 10. Identity and security

The creator is the first admin. Every identity is one session token. Session tokens travel only in
bodies (create and join return one; `DELETE /api/rooms/{code}` sends one) and the first websocket
frame. Admin rights come from `player.role`, checked per message.

The operator's `ADMIN_TOKEN` is separate from all that. Unset, `/api/admin/*` is not mounted and
answers 404; shorter than 32 URL-safe characters, the app refuses to start. `GET /api/admin/rooms`
(rooms in memory) and `/stats` (every `daily_stats` row) want it as `Authorization: Bearer`,
compared with `hmac.compare_digest`. It arrives once as `/admin#token=…`, a fragment so no access
log or `Referer` sees it; the page `replaceState`s it away and keeps it in `localStorage["jbi:admin"]`
once accepted, else falls back to the stored one. Both return chosen fields only, never a name, an answer or a question. Only the
suggestion and report queues, `/api/admin/questions` and its pending changes (section 11) return
questions, answers included: players' suggestions and the packs, never a room's. `METRICS_TOKEN`
gates `GET /metrics` (OpenMetrics text, fixed-set labels only) by the same rules.

`POST /api/rooms {display_name, avatar?, returning, theme?, device?, invite_only?, public?, code?, settings, custom_questions}`, in one transaction:

1. Validate the name before the rate limiter, so a typo costs no quota: NFKC, trimmed, single
   spaces, 1–12 Latin letters (accents allowed), digits, spaces, `_` and `-`.
2. Rate limit per IPv4 address or IPv6 /64.
3. Take `code` if sent: one a draw could give (422 `bad_code`, checked before the limiter), else 409
   `code_taken`. Without it, draw from `room-words.json` with `secrets.SystemRandom`: five plain
   tries, 20 with two digits, then `CodeSpaceExhausted`. Each try has a savepoint. Codes are
   stored and looked up uppercase, and sent spelled as their word (`AbyssalWhip07`). The create
   page shows `GET /api/rooms/free-code` → `{code}`, a draw no room holds yet, reserved for nobody.
4. Insert the admin outside that savepoint, or a session collision would be retried as a code
   collision. `custom_questions` wait in `rooms.custom_questions` for the start, with their
   `custom_author`.
5. Return `201 {code, session, player, expires_at}`. The plain session is returned once and never
   logged. Any failure rolls everything back.

- `POST /api/rooms/{code}/questions {session, custom_questions}` replaces them in a lobby, for an
  admin. A POST, since a bank of 100 outgrows a websocket frame. Only the browser that made the
  room offers it: the bank is that browser's.
- Join is `POST /api/rooms/{code}/join {display_name, avatar?, returning, key?, theme?, device?, via?}` → `{session, player}`.
- Create's `invite_only` gives the room a key, `secrets.token_urlsafe(9)` in `rooms.invite_key`.
  A join then needs it before anything else is checked: 403 `key_required` or `bad_key`, compared
  with `hmac.compare_digest`. It is a door code, not a credential, so it travels in the link's
  fragment, `/r/CODE#k=…`; Join moves it to the body and `replaceState`s it away. Sessions never
  need it. Rotating it is the room lock; there is no other.
- Without the key, `POST /api/rooms/{code}/requests {display_name, avatar?, returning, theme?, device?, via?}` asks the
  admins instead → `201 {ticket}`, charged as a join and refused for what would refuse one. A
  request is memory only, at most 5 a room and 2 an address (409 `requests_full`), and its name is taken like a
  player's. The ticket travels like a session: `.../requests/poll {ticket}` answers `waiting`, or
  `accepted` with a join's `{session, player}`, created only then; 403 `request_denied`; 410
  `request_gone` once withdrawn (`.../requests/cancel`), unpolled for 10 s, or 5 minutes old.
  `start_game` drops every request.
- `public` lists the room on Home (`rooms.public`); with `invite_only` too it is a 422.
  `GET /api/rooms/public` is the one route that shows a stranger rooms they were not given, so it
  carries only what a join would: the 50 newest public lobbies in memory with a connected player
  and a free seat, at most 2 per creating address (kept in memory; rooms with a second player
  win), as `{code, host: {id, display_name, avatar}, players, max_players, rounds,
  modes?}`, `modes` left out with `hide_rounds`. Every caller shares one copy for 5 s.
  `PUBLIC_ROOMS=false` makes it `[]`.
- `returning` says the browser had a `jbi:profile` when the page loaded. It, `theme` (a picked one
  only), `device` (`mobile` for a coarse pointer, else `desktop`) and `via` (`public`, `invite`,
  `code` typed on Home, or a plain `link`) are counted, never stored; a request's only once let in.
  The browser sends `theme` and `device` only when they differ from what it last had counted
  (`client/src/lib/stats.ts`), so each counts once per browser.
- The client keeps sessions, the rooms it created and the host's own questions in localStorage,
  never a cookie, so nothing ambient authenticates a request.
- A second admin is a join plus `promote`. A room whose last admin lost their session runs on
  without one until it expires; remaking it is the fix.
- The TV (`set_tv`) is a player's role, not an admin's: its admin messages are `not_admin`.
- Sessions are stored as sha256, so a database dump yields none.

Limits:

- 30 creates an hour (`ROOMS_PER_IP_PER_HOUR`), 100 joins an hour, 10 daily starts an hour (a resume is
  free), 30 lookups of missing rooms per 10 minutes, 5 free codes per 10 seconds. Past those, every room request is 429 with a `Retry-After` (1008 on a socket), so a refusal never reveals
  which codes are live. A `hello` whose session a room in memory holds skips the miss and address
  connect budgets, so one device cannot lock a shared address out; nor can its silent sockets,
  since past 10 awaiting `hello` the oldest closes. A room `GET` with
  `Sec-Fetch-Site: cross-site` is 403 and charges nothing, and so is a `/ws` (1008) whose `Origin`
  host is neither `Host` nor `PUBLIC_BASE_URL`'s, since browsers open cross-site sockets.
- Create refuses a sixth room while `jbi:created` holds five the server still has; one that
  answers 404 or 410 drops off the list. Clearing storage bypasses it; the create limit is the
  backstop.
- Limits key on uvicorn's `--proxy-headers` address: from a peer in `FORWARDED_ALLOW_IPS`, the
  rightmost `X-Forwarded-For` entry not in it; else the peer. The first ignored one logs a warning.
- `/api/*` bodies over 256 KiB get 413, nested over 64 levels 422 `too_deep`. Writes not declared `application/json` get 415, because a
  cross-site `no-cors` fetch sends an untyped body without a preflight.
- uvicorn runs `--host "" --ws-max-size 65536 --limit-concurrency 2500 --ws-per-message-deflate
  false --workers 1`. The empty host listens on `0.0.0.0` and, where there is IPv6, `::` too. The
  limit counts every connection, websockets included, and answers 503 past it, so the app holds at
  most `MAX_SOCKETS` (2250) sockets and closes the next with 1013: the gap keeps `/api/health`
  and joins answering. At about 60 KB a socket that is some 220 MB of the 512 MB container.
  Compression is off because a zlib context per socket doubled that and took a quarter of the
  CPU per broadcast; frames are serialised once per room, and a reverse proxy may compress.
  uvicorn counts every open TCP connection toward `--limit-concurrency` before any HTTP and never
  times one out that sends nothing, so idle-connection floods are the reverse proxy's job.
- Display names have no word filter: rooms are closed lobbies. Revisit if public rooms see abuse.

`http/headers.py` sets `Referrer-Policy: no-referrer`, `nosniff`, `X-Frame-Options: DENY`,
`Cache-Control: no-store` and `X-App-Version` on `/api/*`, and a CSP of `default-src 'none'` widened to `'self'` per
directive plus `img-src data:`, with `base-uri`, `form-action` and `frame-ancestors` at `'none'`.
The build has no inline script or style. The access log drops query strings. There is no HSTS: TLS
ends at the proxy, and HSTS would lock out a LAN selfhoster on plain HTTP.

- The container runs read-only, `cap_drop: ALL`, `no-new-privileges`, as uid 10001 over root-owned
  code.
- `profiling.py` starts `pyroscope-io` CPU profiling only when `PYROSCOPE_SERVER_ADDRESS` is set,
  tagged `service_name` and the app version, never a room, name or address. It adds no
  capability to the container above, and a failed start is logged, not fatal.
- With `FARO_URL` set, the client lazily loads the Faro web SDK for uncaught errors, unhandled
  rejections, Web Vitals and a tab-long session, nothing else. `lib/faro.ts` strips queries,
  fragments, room paths, stored codes and tokens from every report. A path goes through the proxy;
  an absolute URL's origin joins `connect-src`.
- One process per database: the app holds `pg_try_advisory_lock` on its own connection. A second
  process fails to start or answers `503 db_unavailable`, so stop the old container first.
- The app's env vars and defaults are in `config.py`. `.env.example` documents them, the
  scripts' `WIKI_USER_AGENT`, and the client's build-time `PUBLIC_SITE_*`, `PUBLIC_HERO_NAME` and
  `PUBLIC_DEFAULT_THEME` (`client/site-branding.ts`). `PUBLIC_BASE_URL` only makes a shared
  link's `og:image` absolute, written into `index.html` as it is served like `FARO_URL`; the client links from
  `location.origin`.

## 11. Database

The schema is the sum of `server/app/migrations/`; this file keeps no copy. Add a migration, never
edit one. `rooms`, `players`, `questions` (every question the game will play, fixed at start) and
`answers` (one per player per question); the last three cascade from `rooms`. `daily_stats` has no
key into them, so cleanup leaves it.

- `daily_stats (day, metric, key, count)` counts per UTC day, in the transaction of the event
  counted (`app/stats.py` names the metrics). Games and rounds (keyed by mode) are started, then
  ended early or finished, or abandoned when their room is deleted or expires under them. A game
  start also counts its players (bucketed), event frequency and the host's questions by type;
  a finished game its length bucket, from its first question opening; a finished round its
  length, keyed `mode/bucket`; a game ended early or abandoned the round it was in; a close, by
  the question's mode, whether everyone answered, time ran out or it was skipped. Two peaks keep
  the day's highest instead of a sum, written on a socket's connect: connected players (TVs
  aside) and unfinished rooms with any. A daily room counts in none of these, only `daily`:
  `started`, `finished`, `ran_out` (nobody connected at its end), and the finished ones' `points` and `correct` sums. No IP, name, room
  code or player id ever goes in it, and every key comes from a fixed set.
- `question_stats` (`app/question_stats.py`), also outside the cascade, sums per content id how
  players do on hand-written pack questions, the NPCs' included (not host, price modes or
  voided), in the close's transaction: `answers`, `credit_sum` (credit, not points), `correct`,
  `unanswered` and `games`. Admins' answers are left out; a close with fewer than two other
  players adds nothing, but a daily room's one player counts while connected. A payload edit changes the id, so its numbers restart.
  `/api/admin/questions/stats?mode=…` (every editable mode without one) returns each pack
  question whole with its totals, zeros if never counted; a row for an id the packs lost is
  left out. Bands and suggestions are the client's (`lib/questionStats.ts`), advice only.
- `answer_timings` (`app/answer_timings.py`), also outside the cascade, adds a row per answer
  `question_stats` counts (`question_stats.players`; a miss adds none) in the same transaction:
  `type`, `mode`, `scoring`, `pace`, `items`, `seconds`, `elapsed_ms`, `credit`, `team` and
  `played_on`, no player, room or question id. It is read with SQL; no page shows it.
- Only the browser knows which join failures its player saw (it retries a taken name, and a
  missing room may be a Past party games link), so it reports each to `POST /api/stats/join-failure
  {reason}`, 30 an hour per address, and the server counts no failure itself.

- `daily_sets (day, questions, created_at)` holds each day's set whole, in play order, under the
  date its window opens (section 5), so a restart or a pack edit leaves it. It has no key into
  `rooms` and is never cleaned up: the draw reads it for when a question was last used.
  `daily_attempts (day, token_hash, room_id, …, points, results)` outlives its room (`rooms.daily`
  marks one): each close appends `right`, `partial` or `missed` in its transaction.
- `answers.points` (the answer's own) and `item_points` are written at close, the latter also by a
  `settle`, and standings are the sum of both. Memory keeps the same sum and reloads it on
  rehydrate. Scores are never tracked separately.
- `questions.payload` holds the envelope extras at the top and the type payload under `payload`, so
  SQL reads `payload->'payload'`. Fields that queries or grading need are columns.
- `questions.round` and `questions.mode` are stored; neither can be derived (section 5).
- `players.avatar` is a pet's id in `pets.json`. A join or room with none sent gets a random pet
  nobody in the room wears, and startup gives one to any row still null. The server checks it against
  the pets with both pictures in `assets.json`, because that list grows without a migration.
- `players.team` is a god in `GODS`, checked by the server, or null; everyone joins teamless.
- `players.role` is `player`, `admin` or `tv`; a partial unique index keeps one TV a room.
- `players.item`, `item_round` and `item_charges` are the one item slot (section 8), written before
  memory; `rooms.rematches` counts the games before this one.
- Cleanup deletes expired rooms, and finished ones past their grace, 200 at a time, at startup
  and every `ROOM_CLEANUP_INTERVAL_SECONDS`, then drops them from memory. A failed pass is logged
  and the next runs. There is no external cron.
- `suggestions` holds what players send to `POST /api/suggestions` (`app/suggestions.py`): a
  `question` in Create's shape plus a `wiki` or `source_url`, or both, and a `mode`, held to its
  `Suggest` (`quote`, `intro`, `picture_item`, `explanation`, `wiki_only`, `fixed_prompt`), or
  none, held to its type alone (`TRIVIA_TYPES`) until the operator picks its round;
  or an `item` (a name not on the roster).
  A Who's That NPC? shadow's payload is its fixed prompt and `subject.name`, an NPC not on its
  list (`named`); a render's right option names its NPC, and it has no `image` (`render`).
  A Forgetful Bard payload is a verse and `subject.name`, a plain item on the list or not, which the verse may not name (`verse`). A place for Mark the Map is `prompt`, one target and a `reach`, nothing else (`_place_errors`), with a `wiki`. A question but an NPC's (`difficulty`) may carry a `difficulty`;
  `/suggest` requires picking one, loading with the toggle unselected. Each has a `credit`
  held to the name rules and `credit_shown`, never true for an item. Pending, approved,
  rejected or imported. A round not built yet takes questions; they wait in approved. The client offers the form after a finished game; 10 an hour
  per address (`SUGGESTIONS_PER_HOUR`) is the backstop. The operator's bearer, sent when the browser holds one, skips this limit, `SIMILAR_PER_HOUR` and `TRIES_PER_HOUR`.
- `app/similar.py` scores a question against another, 0–100: 0.7 × the trigram Dice of the
  normalised prompts (with quote) + 0.3 × the answers' (1 when equal; any accepted free-text
  spelling); prompts alone across types; Odd One Out by option-set overlap; Who's That NPC? 100
  for the same NPC, shadow or render, else 0; The Forgetful Bard 100 for the same item, else as usual; a `map_pin` in the same round 100 for the same name or an overlapping box, else as usual. `POST /api/suggestions/similar` takes a question as `POST
  /api/suggestions` does, minus the link, and returns up to 3 pack questions (every pack mode but
  the price ones) at 60 or more as `{mode, label, score}`, never a suggestion; 120 an hour per
  address (`SIMILAR_PER_HOUR`). `/suggest` asks 800 ms after the prompt or answer changes.
- `POST /api/suggestions/try {content, value?}` takes the same question and returns `{view,
  reveal, result}`: the open view in the room's shuffle, the reveal, and with `value` its
  `PlayerResult`, speed not counting (`round(1000 × credit)`); stores nothing; 600 an hour per
  address (`TRIES_PER_HOUR`). A shadow, or a verse whose item is not on the list, reveals the name and takes no value; a trial gives no picture, whose file name would tie it to the item. The previews
  on `/suggest` and in the queue toggle Question/Reveal and answer through it.
- `/api/admin/suggestions` lists, edits and moves them, each question with its top 3 matches at 60
  or more among the packs and the other pending and approved suggestions, whole; a question with no
  round can't be approved (422). Export downloads the playable approved ones and stamps
  `exported_at`; "mark as imported" moves exactly those. An edit clears the stamp.
- `reports` holds what players send to `POST /api/reports` (`app/reports.py`): a mode, a question
  id or null, a snapshot (the question whole, a price mode's roster item, or null for "something
  else"), up to 500 characters of text, open or closed. Closed ones are kept. It and `/suggest`
  list `GET /api/questions?mode=…`, `{id, label}` (`reports.label`: no answer but Who's That NPC?'s,
  plus a shadow's `npc` or `random_event`); 3 an hour per address. `/api/admin/reports` lists and
  closes them; `/api/admin/questions?mode=…` returns a mode's pack questions whole.
- `question_edits` holds the operator's pending edits and deletes of hand-written pack questions
  (`app/question_edits.py`), one per question, keyed by its id in the packs as they are; a second
  replaces the first. `PUT` and `DELETE /api/admin/questions/{id}` queue one, checked as the
  question it will be (422); only the payload, `difficulty` (required but on an NPC's, refused
  there; outside the id), `wiki`, `source_url` and the credit change. The price modes are left out: `gen-price-questions` would overwrite an edit. Nothing plays from it:
  `/api/admin/question-changes` lists, discards, exports (stamping `exported_at`) and, once
  applied, deletes the exported rows. An edit clears the stamp.
- `roster_edits` is the same for the price rounds' roster (`app/roster_edits.py`): a rename or a removal
  per item id, `PUT` and `DELETE /api/admin/roster/{id}`, a name that another item or pending rename
  has is a 422, and `/api/admin/roster-changes` lists, discards, exports and marks applied.

## 12. Data pipeline

Packs are committed, bar `prices.json`: each instance generates its own, and offers no Price is
Right until it does (More/Less keeps `sample.json`'s five, which `live_packs` drops once `prices.json` exists). The tests generate one offline (`tests/packs.py`).

- The `make` targets for scripts that write into the checkout (`gen-*`, `fetch-assets`, `logo`) run
  them in `docker-compose.data.yml`, so a host needs only git, docker and make. Its `data` stage is
  the builder's venv (no groups) plus git and the `data` group (Pillow); on top, `logo` adds the
  `logo` group for `make logo` and `map` a JRE for `make gen-map`. The runtime copies none. The repo is mounted, run as the host user.
- Every wiki fetch goes through `scripts/wiki.py`: the operator's `WIKI_USER_AGENT` (environment or
  `.env`) or no request, and one request a second per process. Offline flags need neither. A test
  fails any other script importing a network module, bar `smoke_ws` and `loadtest` (the app's) and
  `gen_map` (OpenRS2).
- `make gen-price-questions` (also in `make all`) fetches `/mapping` and `/latest` once each. It
  never runs at startup or in CI. Its pairs are 1.25x to 4x apart: closer is a coin flip, and the mode shows no values.
  A price's range spans three 1.15x–1.5x steps, its answer 10–45% or 55–90% along the log width.
- A pack's prices share one `as_of`. `/api/modes` gives a mode its pool's newest, shown by the
  footer and a price round's splash instead of on every question.
- `make import-suggestions FILE=…` appends an export to the packs and the roster, skipping what
  they hold, keeping `credit` and `difficulty` (a round's question without one gets `medium`).
  A question's options are stored in their seeded order (the form puts the right one first), but an examine's right name goes first and its line is asked once; an item's id
  comes from the wiki's `infobox_item` bucket, untradeables included, as does a `picture_item`'s,
  which becomes `image`. A named NPC takes the first infobox row's id on its page (one
  `infobox_monster` query for the file, one `infobox_npc` for the rest), joins `popular-npcs.json`
  and gets its question filled in; a render's becomes its `image` and joins no list. A verse's item takes its roster id, or joins the roster as a suggested item does, and becomes `image`. Missing `assets.json` entries are added: the NPC's picture, the
  item's detail image and icon. A generated pack never takes a suggestion: its mode's go in `<mode>_suggested.json`. One refused entry, or packs that would not load, writes nothing.
- `make edit-packs FILE=…` applies an export of question changes: an edit replaces its question
  in place, keeping the file's key order, and recomputes its id; a delete removes it. A change to
  an id the packs no longer hold or in a generated pack, or packs that would not load, writes nothing.
- `make rehash-questions` rewrites each pack id that no longer matches its content, nothing else.
  Packs that would still not load write nothing.
- `make edit-roster FILE=…` applies an export of roster changes: a rename keeps the item's place, a
  removal drops it. A change to an id the roster lacks, or packs that would not load, writes nothing.
  It rewrites the Pixel Hunt pack too; the price pack keeps the old names until `gen-price-questions`.
- `make gen-pixel-hunt` writes `pixel_hunt.json` offline: a question per roster item with a detail
  picture in `assets.json` and off the script's blocklist, keeping its difficulty (else `medium`).
  A `pictured` round draws a question only when `data/pictures.json` has its picture.
- Examine, Bestiary, Drop Table, Odd One Out, Release Order and Sort It Out are hand-written packs,
  like the random events. No importer fetches wiki facts, so the owner picks every monster and
  question.
- `make fetch-assets` fetches `data/assets.json` (target under `client/src/assets/` to wiki title)
  into place, skipping files that exist. Images are never committed: every target must be
  git-ignored. A question's picture, `pictures/<item|npc>/<id>.<ext>`, is staged in `.pictures/`,
  a screenshot by hand as `screenshot/<name>.<ext>`, kept as it is and refused off its questions' size;
  `build_pictures.py` then copies each one a pack uses to `client/public/pictures/<random>.<ext>`,
  out of the bundle, which would merge it with an identical item icon; an item's is cropped to its
  opaque box, padded square and shrunk to at most 512 px, as a deterministic PNG. `data/pictures.json`
  maps asset to file; a file keeps its name until its written bytes change, and an unused one is removed.
  An item's picture is its wiki detail image: `add_detail_pictures.py` adds one for each roster
  item that has one, in one batched `imageinfo` lookup, and lists the rest.
  How to play's samples bundle theirs (`npcs/817.png`, `items/detail_4151.png`): no server names one.
  Every item the roster or a pack question names has an `items/<id>.png`, its inventory icon:
  never a picture's file, whose bytes would match the icon bundled under the item's id.
  Questions from the wiki keep its CC BY-NC-SA notice, which the README (#98) carries.
- `make gen-map` renders the surface into `client/public/map/<cache_id>/clean/{z}/0_{x}_{y}.png`,
  git-ignored, the wiki's grid with rows counting north. `data/map.json` pins an OpenRS2 cache and
  its `disk.zip`'s hash: OpenRS2 keeps every cache, while the wiki retires a tileset weeks after the
  next. To update the map, take the newest `oldschool` cache from its `caches.json` and hash its zip.
  RuneLite's `MapImageDumper` (`scripts/map_render/`) draws each map square at 4 px per game tile,
  zoom 2, without icons or labels; Pillow halves them down to zoom −3 and drops all-black tiles.
  It is built in `.map/` and moved in whole with its `manifest.json`, whose presence is
  `app.map.has_tiles()`, so a stopped run serves nothing and a complete tileset sends no request.
  `/map/` is immutable because a new cache is a new URL. The client enlarges zoom 2 up to zoom 5.
- `scripts/gen_locations.py` drafted Mark the Map's pack once from the infobox maps of the pages in
  `Category:Locations`, and refuses to overwrite it: the owner edits it by hand since.
- `make logo` is the owner's tool: it traces the fetched `logo/` sources into a boar per theme in
  `branding/boar/`, git-ignored like them. A selfhoster brings their own logo instead.

## 13. Versioning

CLAUDE.md has the bump rule.

- Semver: after 0.9.0 comes 0.10.0. 1.0 is the owner's decision, not a count. One minor bump per
  task, even when one session does several.
- `/VERSION` is the source; `pyproject.toml` and `package.json` copy it and `test_version.py` fails
  on drift. The client builds it in as `__APP_VERSION__` and shows `0.6` for `0.6.0`; the server
  sends it in `welcome`. The footer's version opens What's new from `lib/changelog.ts`, which
  needs an entry for every version, a stacked PR's too.
- CI's `release` job tags `v<VERSION>` with a GitHub Release once the other jobs but `audit` pass,
  and fails if `VERSION` went backwards. `/api/health` returns the version for the README badge. `make image` builds locally; no registry.
- Dependabot gathers every ecosystem's minor and patch updates into one PR, Mondays and Thursdays, which keeps
  the version: no bump, no changelog entry. CI fails on a high or critical known vulnerability in a lockfile or the image, or a secret in the image. Trivy's and gitleaks' versions are pinned in `ci.yml`; `trivy-bump.yml` opens the PR for a release three days old.
- CI's `secrets` job runs gitleaks with `.gitleaks.toml`, the defaults plus the test fixtures by path and value: a PR over its own commits, from its base, main and the weekly run over the whole history. A leak in history is fixed by rotating it, never by rewriting main.
