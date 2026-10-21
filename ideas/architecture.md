# Architecture

How Jolly Boar Inn is built today, and the reason behind each choice that looks odd. The product is
`ideas/plan.md`, the open tasks are `ideas/phase2.md` and `ideas/design.md`. Everything here is
final. The licence is AGPL-3.0.

## 0. Stack

| Concern | Choice | Reason |
|---|---|---|
| Server | Python 3.14, FastAPI, uvicorn, one worker | All room state lives in one process's memory. |
| Database | Postgres 18 through `asyncpg`, hand-written SQL | Four tables; an ORM would add more code than it removes. |
| Migrations | Numbered `.sql` files, applied at startup by `db.py` | Alembic needs SQLAlchemy models we do not want. |
| Validation | Pydantic v2 for HTTP and websocket, `jsonschema` for questions | The question schema is shared with CI and the client. |
| Client | Svelte 5 with runes, Vite SPA, TypeScript | No SSR is needed, so no SvelteKit. |
| Tooling | `uv`, `ruff`, `pytest` with `pytest-xdist`; `pnpm`, ESLint, Prettier, `svelte-check`, `vitest` in jsdom | Vitest compiles components exactly as the build does. |
| Serving | FastAPI serves `client/dist`, SPA fallback to `index.html` | One container, one origin, no CORS. |
| Time | `datetime.now(UTC)` on the server, `timestamptz`, ISO 8601 on the wire | The client never sends a time. |
| IDs | uuid rows, word room codes, content-hash question ids | Codes are for people; uuids go on the wire. |

## 1. Repo layout

```
Dockerfile, docker-compose.yml     three-stage image + data; app + postgres:18 (+ .dev.yml, .data.yml)
Makefile, .github/workflows/ci.yml all, setup, dev, lint, test, gen-*, import-suggestions, edit-packs,
                                   edit-roster, rehash-questions, fetch-assets, logo, image; CI: audit, release
schema/                            question.schema.json (section 4), protocol.schema.json (section 6)
data/packs/                        prices (generated, ignored), examine, sample, random_events/
data/                              assets, pets, popular-items/-npcs, player-names, room-words
branding/                          a selfhoster's logo, gitignored
server/app/                        main, config, db, static, accesslog, errors, pets, random_events,
                                   suggestions, reports, question_edits, roster_edits
server/app/rooms/                  state (RoomManager), joins, lobby, loop (its parts), models,
                                   errors, queries, settings, selection, segments, scoring, ready, codes
server/app/modes/, questions/      Mode and MODES; schema, packs, vocab, normalize, custom,
                                   submission, text; types/ one module per type
server/app/ws/, http/              handler, protocol, schema, outbox; one module per route or middleware
server/scripts/                    wiki, gen_price_questions, import_suggestions, edit_packs,
                                   edit_roster, rehash_questions, fetch_assets, build_pictures,
                                   build_logo,
                                   validate_packs, check_contrast, smoke_ws, loadtest
client/src/lib/                    api, ws, protocol, stores, session, history, profile, modes, …
client/src/routes/, components/    Home, Create, Join, Room, History, Admin, Suggest, Report; TopBar, stage/, …
client/src/components/questions/   viewFor(type, mode), Question, gem buttons; types/, stems/
```

Routes: `/`, `/create`, `/r/:code` (the room with a session, Join without), `/r/:code/create` and
`/history/:code/:stamp` (a finished game from this browser, `stamp` its `finished_at` as UTC
`YYMMDDHHMM`), `/admin` and its tabs `/admin/suggestions`, `/reports`, `/questions` and `/roster` (the
operator's view, section 10), linked from Home's Suggest panel once this
browser holds the admin token, and `/suggest` and `/report` (section 11), linked once it has finished a game. The credits are a sheet from Home's footer.
The retired `/r/:code/admin` resolves like `/r/:code`, because whoever holds that link knows the code.

## 2. Room state

`RoomManager` (`rooms/state.py`, with `joins`, `lobby` and `loop`) owns every room. Handlers call it.
Nothing else writes `rooms`, `players`, `questions` or `answers` after creation.

`RoomManager` methods: `get` (rehydrates, section 9), `create`, `join`, `connect`, `disconnect`,
`set_profile`, `set_ready`, `set_editing`, `start_game`, `submit_answer`, `skip(phase, index)`,
`rotate_key`, `request_join`, `poll_request`, `cancel_request`, `decide_request`, `promote`, `kick`,
`end_game`, `delete`, `purge_expired`, `evict`. A `Room` holds `players`, `requests`,
`questions`, `totals`, `current_index`, `phase`, `next_at` (wall clock) with `next_mono`
(monotonic), `sockets` (one `Outbox` each), `timer`, the `advance` and `rescheduled` events, and
`lock`.

- One `asyncio.Lock` per room. Every public method takes it. Nothing locks across rooms.
- A method writes to Postgres before it changes memory, so a failed write leaves memory as it was.
  An answer is committed before its `answer_ack`.
- A method builds its frames under the lock, then queues them on each socket's `Outbox`: 256 frames
  and one writer task, which also carries replies and closes so frames keep their order. An
  overflow, or a send slower than 10 s, closes that socket with 1011. No socket I/O under the lock.
- `RoomManager` is the only part that would change for several replicas. Do not build for that now.

## 3. Modes and types

A **type** is an answer shape: what a player sends, how it is checked, how it earns points. A
**mode** is a round: what the host picks, what a splash introduces, what a pack pools by. Five
planned modes share `multiple_choice`; as five types they would be five copies of `grade`.

`Mode(id, types, is_round=True, questions=None, pool=None, setting=None, options=None)` in
`modes/`, registered in `MODES` in the create form's order.

- `id` is `questions.mode` and the settings key. It is never renamed once shipped.
- A round may mix types. The game loop reads only `question.type`, which also times the question. A
  round whose types disagree on `questions` states its own; `modes.problems` checks this at import.
- `is_round` is explicit, so an empty `types` never turns a round into an event pool. Only `custom`
  and `random_event` are not rounds. They state no types and no numbers.
- Copy (label, hint, blurb, host lines) lives on the client in `lib/modes.ts`.
- `pool` names the mode whose pack questions a round draws, restamped with its own id. `setting` names
  the `Settings` flag that offers the mode; off, or with an empty pool, `/api/modes` omits it and
  `POST /api/rooms` is a 403 `mode_not_offered`. A stored room keeps playing it. `options` holds a
  round's `multiple_choice` questions to fewer options than the schema's two to six; `mode_errors`
  refuses the rest.

Each module in `questions/types/` exports:

```python
def client_view(payload) -> dict      # what everyone sees while open: never the answer
def reveal(payload) -> dict           # what the close shows
def parse_value(payload, value)       # the canonical answer, or None for bad_value
def grade(payload, submissions) -> dict[player_id, float]   # credit, 0.0 to 1.0
def check(payload) -> list[str]       # the stored answer follows from the stored facts
def steps(payload) -> int | None      # optional: frames it reveals itself in
def pictured(view, payload, pictures) # optional: a pack question's pictures inside its view
SCORING: Scoring                      # SPEED by default (section 8)
ANSWER, REVEAL: Timing                # base + per_item seconds, at run pace
def items(payload) -> int             # optional: options or entries; 0 without it
```

- The room stores, echoes and grades what `parse_value` returns, never the raw value.
- `grade` takes every submission at once, because `closest_number` ranks them. The close rounds
  credit to 1e-9 and clamps it to 0..1, logging a bad value rather than failing.
- `Bounds(default, minimum, maximum)` is the question count Create offers and `NewRoomSettings`
  enforces. It falls back from mode to types to registry. Rounds default to 5 questions.
- A question's time to answer and its reveal are its type's alone, at the room's `pace`: ×1.25
  `walk`, ×1 `run`, ×0.75 `teleport`, a half rounded up, at least 5 s to answer and 4 s to reveal.
  At `run`: `multiple_choice` 10 + 2/option and 4 + 0.5/option, `pick_all_that_apply` 10 + 3 and
  4 + 1, `ordering` and `matching` 10 + 5 and 4 + 2 per entry or field, `price_is_right` 15 and 6,
  `more_less` 10 and 5, `pick_from_list` 20 and 6, `free_text` 20 and 7, `closest_number` 20 and 8,
  `number_slider` 15 and 8.
  `name_wrong_answers` adds 1 s to every reveal after the pace, for the names.
- A game's minutes (`rooms/duration.py`) are a ceiling: every question's full answer and reveal,
  15 s per splash, standings between rounds. Create multiplies each round by its mode's `seconds`
  from `/api/modes`, its pool's mean per pace; a surprise counts the offered modes' average.

| Mode | Label | Type | Pool | Status |
|---|---|---|---|---|
| `more_less` | More or Less | `more_less` | `/mapping` + `/latest` | done |
| `price_is_right` | The Price is Right | `price_is_right` | `/mapping` + `/latest` | done |
| `guess_examine` | Guess the Examine | `multiple_choice`, four to six names | `examine.json` | done |
| `custom` | Host's Questions | per question | the host | done, as events |
| `random_event` | Random Event | per question | one file per NPC | done, as events |
| `random_events_only` | Random Events Only | `multiple_choice`, `free_text`, `closest_number`, `number_slider`, `pick_all_that_apply`, `ordering`, `matching` | the `random_event` pool | done, 20 at most, `RANDOM_EVENT_GAME_MODE` |
| `bestiary` | Bestiary | `multiple_choice`, `closest_number`, `number_slider`, `free_text`, `ordering`, `pick_all_that_apply`, `matching` | hand-written | done |
| `drop_table` | Drop Table | `multiple_choice`, `free_text`, `pick_all_that_apply`, `closest_number`, `number_slider`, `matching`; `image` is its picture | hand-written | done |
| `odd_one_out` | Odd One Out | `multiple_choice`, four to six names | hand-written | done |
| `release_order` | Release Order | `ordering` | hand-written | on hold: too few questions, waiting for player suggestions |
| `sort_it_out` | Sort It Out | `ordering` | hand-written | done, the first on `ordering` |
| `who_said_that` | Who Said That? | `multiple_choice` | hand-written | done |
| `know_your_content_creator` | Know Your Content Creator | `multiple_choice`, `closest_number`, `number_slider`, `pick_all_that_apply` | hand-written | done |
| `whos_that_npc` | Who's That NPC? | `pick_from_list` over `popular-npcs.json`, a shadow | hand-written | done |
| `pixel_hunt` | Pixel Hunt | `pick_from_list` | renders | Images |
| `minimap_guesser`, `name_that_spell` | Minimap Guesser, Name that spell | undecided | | Images (minimap), Sound (spell) |

Create lists the unbuilt ones from `UPCOMING_MODES` in `lib/modes.ts`.

- Sort It Out and Release Order are two modes over one type: their splash, prompt and pool differ.
- Who's That NPC? uses a strict list, not buttons or free text: free text needs an alias list and a
  typo argument per item. Mostly monsters: people look alike in shadow. Guess the Examine dropped its list for buttons: players found it too hard.
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
- Assets are `item:<id>` or `npc:<id>`, never a URL. No `client_view` or `reveal` carries `image`:
  for some modes that id is the answer. A pack question's picture goes out as `picture` (section 6),
  a `matching` field's `icon` as the field's `picture`, added by the type's `pictured`.
- `random_event` on the envelope names the NPC who asks. Only event files and host questions carry it.
- `wiki` on the envelope is the page an author checked; `source_url` is any https link, for what
  the wiki cannot prove. Players never get either.
- An optional `multiple_choice.quote` is shown as a quotation under `prompt`.
- `credit` names the player who suggested a pack question; with `credit_shown` the reveal says it,
  and `GET /api/credits` counts it: `{authors: [{name, questions}]}`, most first, for the credits.

| Type | `value` | Credit |
|---|---|---|
| `more_less` | option index | 1 or 0 |
| `price_is_right` | gp on the slider's grid, in `[min, max]` | by distance (section 8) |
| `multiple_choice` | shown position | 1 or 0 |
| `free_text` | string, at most 80 characters, no NUL or lone surrogate | 1 or 0 |
| `closest_number` | number | by rank (section 8) |
| `number_slider` | an integer on the slider's track, in `[min, max]` | by distance (section 8) |
| `pick_from_list` | an entry id of the question's vocabulary | 1 or 0 |
| `pick_all_that_apply` | distinct shown positions, sorted, at least one; exactly `picks` if set | right picks ÷ options right or picked |
| `ordering` | shown positions, first end first: all, or `picks` of them | per place: 1 for its rank; with `picks`, ½ for another picked one |
| `matching` | a distinct shown option position per field, in field order | right fields ÷ fields |

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
  field's option would sit at its own position.
- `multiple_choice`, `pick_all_that_apply`, `ordering` and `matching` show options or entries in a shuffle
  seeded by the payload (`types/shuffle.py`): one order for every socket and restart, and the
  authored order (often answer first) never leaks. Values and the reveal name shown positions.
- `number_slider` stores integers. `check()` rejects `min` ≥ `max`, a log `min` below 1, a log
  `min`, `max` or `answer` off the three-figure grid, and an `answer` on an end or on the middle
  where the slider starts (half rounded up).
- `pick_all_that_apply` stores sorted `answer_indices` and an optional `picks`, shown open. `check()`
  rejects none or every option right, and a `picks` that is not their count.
- `pick_from_list` answers through one strict WAI-ARIA combobox. Typing only searches, by word
  prefix, ignoring case and accents. Only a selected entry can be submitted, with its own button.

## 5. Packs, selection, segments

- A pack file is `{pack, generated_at?, questions}`, the stamp only if generated, and may hold several modes. An event file,
  `data/packs/random_events/<npc>.json`, is `{pack, random_event, questions}`; the loader stamps
  the NPC on each question and refuses a file named after nobody on the roster.
- `validate_packs.py` fails CI on a schema error, a duplicate or mismatched id, an unknown mode, a
  type its mode does not allow, a stray `random_event`, a price type filed as an event, or one
  `pick_from_list` prompt under two answers, unless each has a picture.
- Custom questions are rows with `source = 'room'`, `mode = 'custom'` and `author_player_id`.
- Create's editor writes `multiple_choice`, `free_text`, `closest_number`, `number_slider` and
  `pick_all_that_apply` (`picks` only as a "tell players how many" box), and `MatchingForm` a
  text-only `matching` with limits read from the schema, refuses what the server would 422, the slot cap included, and exports
  `[{type, payload, random_event?}]`, which Import reads back byte for byte.
- `/suggest` adds an `ordering` form for the rounds that sort, Bestiary's and random events'
  (NPC and intro) beside their other types: entries first to last and a "tied with the one
  above" box, so ranks follow, `picks` optional. Release Order's entries carry their date as `detail`.
  `MatchingForm` writes field and answer pairs side by side, then decoys, for Bestiary, Drop Table,
  the NPCs and a question with no round; a suggestion's fields are names only, and `/admin` adds icons.
- Every round on Create takes suggestions, the price rounds as items and Random Events Only as the
  NPCs' questions; a test fails on a new round that does neither. Not-yet-built image modes are not on Create.

`select(packs, custom, settings, rng)` fixes a room's questions at creation:

- `surprise_modes: N` draws N distinct offered round modes in `create`, each at its default
  `questions`, and forces `hide_rounds`. A request with both it and `modes` is a 422.
- One round per mode picked, of that mode's `questions`. Pools are keyed by mode, never by type, or
  modes sharing a type would draw each other's questions.
- `mode_order: random` shuffles the rounds once, here. The stored order is the running order.
- Questions are drawn without replacement. A dry pool gives a short round; an empty one is dropped.
- It ends with `place_random_events`, which adds events on top of the rounds.

Random events:

- `random_event_frequency` is one event per 20, 10 or 5 round questions (`less`, `default`,
  `more`). There is no off switch; `less` is the quiet end.
- Round questions are cut into windows of that size, one slot per whole window. A slot follows a
  question that is not its round's last, so an event never opens the game or a round.
- The host's questions take slots in order. More than the slot count is a 422 naming the count, the
  limit and the frequency, because a silent drop would surface mid-game.
- Other slots take an NPC's own question, drawn with its face, preferring a type the interrupted
  round does not play. A slot stays empty only when nothing qualifies.
- Faces: a named NPC asks its question. Others come from the unseen NPCs, then the least seen, never
  next to the same face. An NPC with no file yet only asks host questions.
- `MAX_QUESTIONS_PER_ROOM` (100) counts events.

`segments_of` groups rows into rounds by the stored `questions.round`, and an event carries the round
it interrupts. Deriving rounds fails silently: settings break on a short round, runs of `mode` on an
event.

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
| `ready` | `ready: bool` | all | Lobby or splash only. One take-back per splash, one lobby change a second. |
| `set_profile` | `display_name?`, `avatar?` | all | Lobby only. Validated exactly like a join. One change a second. Clears `editing`. |
| `editing` | `on: bool` | all | Name field focused. Lobby only, else ignored. An `on` within 1 s of a change is ignored; 60 s unsent, a disconnect or `start_game` clears it. |
| `start_game` | | admin | `lobby → playing`. |
| `skip` | `phase`, `index` | admin | Ends that phase if the room is still in it, so a double tap ends one. |
| `promote` | `player_id` | admin | Makes them admin. There is no demote. |
| `kick` | `player_id` | admin | Deletes the player and their answers; closes 4003. Not on admins. |
| `end_round` | `index` | admin | Splash, open or reveal of `index`: voids an open question, standings, next round. Last round: `end_game`. |
| `end_game` | | admin | Voids an open question, `playing → finished`. |
| `rotate_key` | | admin | Lobby, invite-only room. New key; the old link stops joining, nobody leaves. |
| `decide_request` | `request_id`, `accept` | admin | Lets a waiting join request in or turns it away, once (section 10). |

| Server `t` | Fields | When |
|---|---|---|
| `welcome` | `room`, `you`, `players`, `question`, `your_answer`, `standings`, `server_time`, `server_version` | Reply to `hello`. The full state. |
| `room_updated` | `room`, `players`, `standings`? | Join, leave, promote, kick, rename, status change, a splash or standings starting (with `standings`), a ready change that moves `next_at`. |
| `players_updated` | `players` | A ready, editing, connect or disconnect that changed players only. |
| `question_open` | `question` | A question opens. |
| `answer_ack` | `question_id`, `scoring`, `band`, `answered`, `of` | Answer committed. Never correctness. |
| `answer_count` | `question_id`, `answered`, `of` | Someone else answered. A count only. |
| `question_closed` | `question_id`, `reveal`, `picture`, `results`, `unanswered`, `standings`, `next_at`, `reveal_seconds`, `suggested_by`? | Closed. `unanswered`: connected players who could answer and did not. `next_at` ends the reveal, the last one's too. `reveal_seconds` is its length. `suggested_by` is a shown `credit`. |
| `game_finished` | `standings` | Final. |
| `pong` | `server_time` | Reply to `ping`. |
| `error` | `code`, `message` | `bad_hello`, `bad_message`, `not_admin`, `not_open`, `already_answered`, `excluded`, `bad_value`, `bad_state`, `bad_name`, `name_taken`, `bad_avatar`. |

```
RoomView     { code, status, settings, current_index, total, events, phase, next_at,
               reveal_seconds, estimated_seconds, segment, finished_at, rounds?, key?, requests? }
JoinRequest  { id, display_name, avatar }
PlayerView   { id, display_name, avatar, role, connected, ready, editing }
Standing     { player_id, display_name, avatar, points, rank, points_gained, previous_rank }
Segment      { mode, index, total, start, count }
OpenQuestion { question_id, index, total, type, mode, segment, view, picture, random_event,
               opened_at, answerable_at, ends_at, you_can_answer, answered, of }
PlayerResult { value, correct, credit, points }
```

- `total` counts stored questions, not what the settings asked for; `events` the random events among them.
- `OpenQuestion.mode` sits beside `type` because the pair picks the view (`viewFor`), and an event's
  mode differs from its segment's.
- `view` is `client_view(payload)`. `random_event` is the NPC id; an unknown id gets a generic card.
- `picture` is a pack question's file in `/pictures/` under a random name, from `data/pictures.json`
  (section 12), or null: no image, a host's question, or a file the client lacks: `client/dist`,
  or `client/public` under `make dev`. Served immutable, and drawn under the stem in every mode,
  open and revealed. Devtools still show the whole picture before it zooms out or loses its shadow.
- `answerable_at` is `opened_at` plus the hold the scroll types the question in (`rooms/hold.py`):
  0.4 s (0.9 s for an event), each line at 50 letters a second with a 0.5–1 s pause after it, then
  0.2 s. Answers before it are `not_open`, and `ends_at` and timing count from it, so the typing
  costs nobody points.
- `next_at` ends the timed phase. It is null while a question is open or a splash waits for the room.
  `reveal_seconds` is the reveal's whole length, for the countdown bar; null outside a reveal.
- `estimated_seconds` is the lobby's minutes for the stored questions (section 3).
- `finished_at` is the server's end of the game, so every browser files it under the same link.
- `rounds` counts the stored rounds, sent only with `hide_rounds`; `hide_rounds` and
  `surprise_modes` themselves only when set.
- `key` and `requests` (waiting join requests, oldest first) are an invite-only room's, sent only
  to its admins (section 10).
- `band` is the speed bucket for SPEED, the step for STEP, null for RANK. `of` is every connected
  player who can answer, plus anyone who answered and dropped.
- `credit` lets a reveal say "3 of 5 in place". `correct` is `credit >= 1.0`.

What the server withholds. The admin is a player with a flag; there is no admin channel.

- Open-question frames are identical for every socket, admin included, except the live counts.
  `you_can_answer` is false only on `host_only`. They never carry the answer.
- `question_id` is the row uuid, never the content id, which hashes the answer and could be
  brute-forced.
- Results and correct answers first appear in `question_closed`, to everyone at once.
- The question list is never sent. `GET /api/rooms/{code}` returns only `{status, players}`, a count;
  `GET /api/rooms/public` is in section 10.
- With `hide_rounds`, a non-admin's `welcome` and `room_updated` list in `settings.modes` only the
  rounds `current_index` has reached. The lobby names none, admins' included: screens get shared.
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
| 1008 | no `hello` in 10 s, over 10 messages a second after a burst of 20, or rate limited | reconnects |
| 1009 | a frame over 64 KiB | reconnects |
| 1011 | a send failed or timed out, or the database was down on connect | reconnects |
| 1012 | the room left memory; the reconnect rehydrates it | reconnects |

`GET /api/vocab/{name}` serves `items` (`popular-items.json`) and `npcs` (`popular-npcs.json`,
each the infobox's first NPC id) as `{vocab, version, entries: [{id, name}]}`, built at startup. One name under two ids, or one id under two names, refuses to load. The client fetches a list once, when a question
first names it; per question it would resend the list every time. It gives nothing away: it is every
entry, not the question's options.

## 7. Room lifecycle

```
POST /api/rooms ─▶ lobby ─start_game─▶ playing ─last reveal / end_game─▶ finished
any state ─▶ deleted: expires_at passes (cleanup), or an admin sends DELETE /api/rooms/{code}
finished ─▶ deleted: FINISHED_ROOM_GRACE_MINUTES (60) after finished_at (cleanup)
```

- Each browser saves the final standings in `jbi:history` (newest 20) on `game_finished`, or on a
  `welcome` into a finished room: the grace is for the phone that slept through the end. Home
  lists them under Past games, five to a page, where each can be removed. `/r/:code` for a gone room (4004, 404, 410) opens the newest entry
  for that code, if any.

- A room is born with its host; there is no state before `lobby`. Only `lobby` is joinable.
- `start_game` needs an admin, a question and a connected player. It resets `expires_at`.
- A deleted room closes its sockets with 4004, and its code is free again.

One task per room runs `_run_questions(room, index, resume_at)`:

```
(segment start) splash ─ready countdown / skip─▶ open ─timer / all answered / skip─▶ reveal
reveal ─▶ standings (a round's last question, not the game's) ─▶ next question / finished
reveal ─▶ next question / finished (every other question)
open ─end_game / end_round / crash─▶ voided
splash / open / reveal ─end_round─▶ standings ─▶ next round's splash (the rest unshown)
```

- `phase` is `idle` (lobby, finished), `splash`, `open`, `reveal` or `standings`. It is not a
  column, so a restart resumes in the reveal (section 9) and loses a splash or standings screen.
- A splash runs before each segment's first question, never before an event.
- Open stamps `shown_at` and sets `answerable_at` and `ends_at`. Close grades, then writes
  `closed_at`, `correct` and `points` in one transaction.
- `close_when_all_answered` closes 1 s after every connected eligible player has answered (never
  past the question's end), also when a disconnect or kick makes that true. A skip doesn't wait.
- `skip` and all-answered set `Room.advance`; they never cancel the task.
- Deadlines live on the monotonic clock, so a late wakeup closes at once and a clock jump moves
  nothing.
- A step that raises drops the room from memory with 1012; reconnects rehydrate it.

The ready check (`rooms/ready.py`):

- `ready` is an in-memory flag, never stored; a restart costs one tap.
- In the lobby it is advice. Start below the threshold asks first, and the server allows it.
- On a splash, eligible players are the connected ones who can answer. The threshold is
  `min(ceil(0.8 × eligible), eligible - 1)`, and 1 for a room of one.
- The splash has no clock until the threshold. Then it counts 10 s, or 3 s once everyone is ready.
- A countdown is never pushed back. An un-ready below the threshold stops it, once per player per
  splash. A disconnect lowers the threshold instead of stalling the round.

Settings (`rooms.settings`, fixed at creation):

```jsonc
{
  "modes": [{"mode": "more_less", "questions": 5}],  // one round each
  "mode_order": "random",                // or "listed"
  "random_event_frequency": "default",   // "less" | "default" | "more"
  "pace": "run",                         // "walk" | "run" | "teleport", section 3
  "standings_seconds": 10,               // 0..30; 0 turns standings off
  "close_when_all_answered": true,
  "name_wrong_answers": true,            // name who got it wrong under the reveal
  "hide_rounds": false,                  // surprise rounds, section 6
  "surprise_modes": 0,                   // > 0: the server draws that many rounds, section 5
  "max_players": null                    // null: MAX_PLAYERS_PER_ROOM, stored at create
}
```

- `modes[].mode` keys `MODES`, never `TYPES`, once each. `questions` is optional.
- `NewRoomSettings` checks the ranges at creation. `RoomSettings`, the stored model, keeps a round
  whose mode was removed and ignores unknown keys (an old room's `seconds` and `reveal_seconds`
  too, playing at `run`), so no downgrade strands a room.

## 8. Scoring

`elapsed = received_at - answerable_at`, on the server's monotonic clock, from arrival rather than
from taking the lock. `grade` returns credit; `scoring.py` turns it into points per `SCORING`:

| `SCORING` | Points | Types |
|---|---|---|
| `SPEED` | `round(bucket points × credit)` | `more_less`, `price_is_right`, `number_slider`, `multiple_choice`, `free_text`, `pick_all_that_apply`, `ordering`, `matching` |
| `RANK` | the rank's share of 1000 | `closest_number` |
| `STEP` | `round(step points × credit)` | `pick_from_list` with `steps` |

| Speed bucket | Fraction of the question's seconds | Points |
|---|---|---|
| 1 | ≤ 0.10 | 1000 |
| 2 | ≤ 0.25 | 900 |
| 3 | ≤ 0.50 | 800 |
| 4 | ≤ 0.75 | 700 |
| 5 | ≤ 1.00 | 600 |

- Fractions, not seconds, so quick and slow rounds score alike. Five coarse buckets make a 50–150 ms
  network difference irrelevant, so there is no RTT compensation.
- An answer from `ends_at` on is `not_open`, even if the close runs late.
- Partial credit rides the bucket: 0.6 in bucket 2 is 540.

Rank: answers rank by distance, ties share the better rank, and speed does not count. Exact is 1.0
credit and 1000 points. The closest three otherwise get 0.9, 0.8 and 0.7, paid 750, 500 and 250.

Slider (`price_is_right`): 1.0 for a guess that rounds to the price at two figures, then falling
linearly from that band's edge to 0 at a quarter of the log width; the reveal ticks every guess.
`number_slider` has no band: 1.0 on the answer, 0 a quarter of the track's width away.

Steps (Pixel Hunt): `steps` frames over the question's seconds. Points fall from 1000 on step 1 to
400 on the last, `round(400 + 600 × (steps - k) / (steps - 1))`; one step pays 1000. A payload
without `steps` scores on speed.

- There is no `question_update` message. The step schedule is a function of `answerable_at`,
  `ends_at` and `steps`, so clients advance it themselves and a reconnect lands on the right frame.
- `points_for(scoring, credit, band, steps)` is the one entry point. It refuses credit outside 0..1
  rather than paying for a type's bug.
- `correct` is `credit >= 1.0`: three of five in order scores, and is not "correct".
- `host_only` scores nobody and gets `excluded`. Authors score on their own questions. A kicked
  player's answers are deleted.

Standings sort by points, then correct answers, then `joined_at`. Rank is dense over points and
correct answers; join time only orders players who share a rank. `points_gained` is what the round
of the latest close added and `previous_rank` the rank before that round by the same rule, null
in the first; the totals query splits its sum at that round's first position.

## 9. Reconnect and restart

Client (`lib/ws.ts`):

1. On close, retry after `min(8000, 500 × 2^attempt)` ms plus up to 250 ms. `welcome` resets it.
2. `welcome` replaces all local state. Timers count against `server_time`, not the local clock.
3. On `visibilitychange` or `online`, reconnect a closed socket at once, and ping one that claims to
   be open, reconnecting if nothing arrives in 4 s. Phones lie after sleep.
4. Ping every 30 s. No frame in 10 s closes the socket. So does an `answer` unanswered in 5 s.
5. A `welcome` with a different `server_version` reloads the page, once per version.

Server `connect`: find `sha256(session)` in the room or close 4001. The last device wins: an older
socket closes with 4000. A disconnect keeps the player and their answers.

Rehydrate (`get` on a room not in memory):

1. Load the room, players, questions and each player's summed points and correct count. Answer rows
   are not read back; step 2 voids the only ones that could matter.
2. A question shown and not closed was open at the crash. Void it and score nobody. A crash costs at
   most that question.
3. Resume in `reveal` for that question's reveal, then advance. A question that never opened is still
   owed, so that reveal opens it.
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
log or `Referer` sees it; the page moves it to `localStorage["jbi:admin"]` and `replaceState`s it
away. Both return chosen fields only, never a name, an answer or a question. Only the
suggestion and report queues, `/api/admin/questions` and its pending changes (section 11) return
questions, answers included: players' suggestions and the packs, never a room's.

`POST /api/rooms {display_name, avatar?, returning, theme?, device?, invite_only?, public?, code?, settings, custom_questions}`, in one transaction:

1. Validate the name before the rate limiter, so a typo costs no quota: NFKC, trimmed, single
   spaces, 1–24 Latin letters (accents allowed), digits, spaces, `_` and `-`.
2. Rate limit per IPv4 address or IPv6 /64.
3. Take `code` if sent: one a draw could give (422 `bad_code`, checked before the limiter), else 409
   `code_taken`. Without it, draw from `room-words.json` with `secrets.SystemRandom`: five plain
   tries, 20 with two digits, then `CodeSpaceExhausted`. Each try has a savepoint. Codes are
   stored and looked up uppercase, and sent spelled as their word (`AbyssalWhip07`). The create
   page shows `GET /api/rooms/free-code` → `{code}`, a draw no room holds yet, reserved for nobody.
4. Insert the admin outside that savepoint, or a session collision would be retried as a code
   collision. Then select and insert the questions.
5. Return `201 {code, session, player, expires_at}`. The plain session is returned once and never
   logged. Any failure rolls everything back.

- Join is `POST /api/rooms/{code}/join {display_name, avatar?, returning, key?, theme?, device?, via?}` → `{session, player}`.
- Create's `invite_only` gives the room a key, `secrets.token_urlsafe(9)` in `rooms.invite_key`.
  A join then needs it before anything else is checked: 403 `key_required` or `bad_key`, compared
  with `hmac.compare_digest`. It is a door code, not a credential, so it travels in the link's
  fragment, `/r/CODE#k=…`; Join moves it to the body and `replaceState`s it away. Sessions never
  need it. Rotating it is the room lock; there is no other.
- Without the key, `POST /api/rooms/{code}/requests {display_name, avatar?, returning, theme?, device?, via?}` asks the
  admins instead → `201 {ticket}`, charged as a join and refused for what would refuse one. A
  request is memory only, at most 5 a room (409 `requests_full`), and its name is taken like a
  player's. The ticket travels like a session: `.../requests/poll {ticket}` answers `waiting`, or
  `accepted` with a join's `{session, player}`, created only then; 403 `request_denied`; 410
  `request_gone` once withdrawn (`.../requests/cancel`), unpolled for 10 s, or 5 minutes old.
  `start_game` drops every request.
- `public` lists the room on Home (`rooms.public`); with `invite_only` too it is a 422.
  `GET /api/rooms/public` is the one route that shows a stranger rooms they were not given, so it
  carries only what a join would: the 50 newest public lobbies in memory with a connected player
  and a free seat, as `{code, host: {id, display_name, avatar}, players, max_players, rounds,
  modes?}`, `modes` left out with `hide_rounds`. Every caller shares one copy for 5 s.
  `PUBLIC_ROOMS=false` makes it `[]`.
- `returning` says the browser had a `jbi:profile` when the page loaded. It, `theme` (a picked one
  only), `device` (`mobile` for a coarse pointer, else `desktop`) and `via` (`public`, `invite`,
  `code` typed on Home, or a plain `link`) are counted, never stored; a request's only once let in.
  The browser sends `theme` and `device` only when they differ from what it last had counted
  (`client/src/lib/stats.ts`), so each counts once per browser.
- The client keeps sessions and the rooms it created in localStorage, never a cookie, so nothing
  ambient authenticates a request.
- A second admin is a join plus `promote`. A room whose last admin lost their session runs on
  without one until it expires; remaking it is the fix.
- Sessions are stored as sha256, so a database dump yields none.

Limits:

- 30 creates an hour (`ROOMS_PER_IP_PER_HOUR`), 100 joins an hour, 30 lookups of missing rooms per
  10 minutes, 5 free codes per 10 seconds. Past those, every room request is 429 (1008 on a socket), so a refusal never reveals
  which codes are live.
- Create refuses a sixth room while `jbi:created` holds five the server still has; one that
  answers 404 or 410 drops off the list. Clearing storage bypasses it; the create limit is the
  backstop.
- Trusted proxies come only from `FORWARDED_ALLOW_IPS`. The first ignored `X-Forwarded-For` logs one
  warning.
- `/api/*` bodies over 256 KiB get 413. Writes not declared `application/json` get 415, because a
  cross-site `no-cors` fetch sends an untyped body without a preflight.
- uvicorn runs `--host "" --ws-max-size 65536 --limit-concurrency 1000 --workers 1`. The empty
  host listens on `0.0.0.0` and, where there is IPv6, `::` too.
- `/ws` checks no `Origin`, because nothing ambient logs a socket in. Add an allow-list with any
  cookie.
- Display names have no word filter: rooms are closed lobbies. Revisit if public rooms see abuse.

`http/headers.py` sets `Referrer-Policy: no-referrer`, `nosniff`, `X-Frame-Options: DENY`,
`Cache-Control: no-store` on `/api/*`, and a CSP of `default-src 'none'` widened to `'self'` per
directive plus `img-src data:`, with `base-uri`, `form-action` and `frame-ancestors` at `'none'`.
The build has no inline script or style. The access log drops query strings. There is no HSTS: TLS
ends at the proxy, and HSTS would lock out a LAN selfhoster on plain HTTP.

- The container runs read-only, `cap_drop: ALL`, `no-new-privileges`, as uid 10001 over root-owned
  code.
- One process per database: the app holds `pg_try_advisory_lock` on its own connection. A second
  process fails to start or answers `503 db_unavailable`, so stop the old container first.
- The app's env vars and defaults are in `config.py`. `.env.example` documents them, the
  scripts' `WIKI_USER_AGENT`, and the client's build-time `PUBLIC_SITE_*` and
  `PUBLIC_DEFAULT_THEME` (`client/site-branding.ts`). `PUBLIC_BASE_URL` only makes a shared
  link's `og:image` absolute, written into `index.html` as it is served; the client links from
  `location.origin`.

## 11. Database

The schema is the sum of `server/app/migrations/`; this file keeps no copy. Add a migration, never
edit one. `rooms`, `players`, `questions` (every question the room will play, fixed at creation) and
`answers` (one per player per question); the last three cascade from `rooms`. `daily_stats` has no
key into them, so cleanup leaves it.

- `daily_stats (day, metric, key, count)` counts per UTC day, in the transaction of the event
  counted (`app/stats.py` names the metrics). Games and rounds (keyed by mode) are started, then
  ended early or finished, or abandoned when their room is deleted or expires under them. A game
  start also counts its event frequency and the host's questions by type; a finished game its
  length bucket, from its first question opening; a close, by the question's mode, whether
  everyone answered, time ran out or it was skipped. No IP, name, room code or player id ever
  goes in it, and every key comes from a fixed set.
- Only the browser knows which join failures its player saw (it retries a taken name, and a
  missing room may be a Past games link), so it reports each to `POST /api/stats/join-failure
  {reason}`, 30 an hour per address, and the server counts no failure itself.

- `answers.points` is written once, at close, and standings are its sum. Memory keeps the same sum
  and reloads it on rehydrate. Scores are never tracked separately.
- `questions.payload` holds the envelope extras at the top and the type payload under `payload`, so
  SQL reads `payload->'payload'`. Fields that queries or grading need are columns.
- `questions.round` and `questions.mode` are stored; neither can be derived (section 5).
- `players.avatar` is a pet's id in `pets.json`. A join or room with none sent gets a random pet
  nobody in the room wears, and startup gives one to any row still null. The server checks it against
  the pets with both pictures in `assets.json`, because that list grows without a migration.
- Cleanup deletes expired rooms, and finished ones past their grace, 200 at a time, at startup
  and every `ROOM_CLEANUP_INTERVAL_SECONDS`, then drops them from memory. A failed pass is logged
  and the next runs. There is no external cron.
- `suggestions` holds what players send to `POST /api/suggestions` (`app/suggestions.py`): a
  `question` in Create's shape plus a `wiki` or `source_url`, or both, and a `mode` (a `quote` only
  for the two quote rounds, an `intro` only for an NPC's, a `picture_item` name only for Drop
  Table's; Guess the Examine's and Who's That NPC?'s need a `wiki`) or none, held to its type alone
  (`UNPLACED_TYPES`) until the operator picks its round; or an `item` (a name not on the roster).
  Who's That NPC?'s payload is its fixed prompt and `subject.name`, an NPC not on its list
  (`NAMED_MODES`). Each has a `credit` held to the name rules and `credit_shown`, never
  true for an item. Pending, approved, rejected or imported. A round not built yet takes
  questions; they wait in approved. The client offers the form after a finished game; 10 an hour
  per address (`SUGGESTIONS_PER_HOUR`) is the backstop.
- `app/similar.py` scores a question against another, 0–100: 0.7 × the trigram Dice of the
  normalised prompts (with quote) + 0.3 × the answers' (1 when equal; any accepted free-text
  spelling); prompts alone across types; Odd One Out by option-set overlap; Who's That NPC? 100
  for the same NPC, else 0. `POST /api/suggestions/similar` takes a question as `POST
  /api/suggestions` does, minus the link, and returns up to 3 pack questions (every pack mode but
  the price ones) at 60 or more as `{mode, label, score}`, never a suggestion; 120 an hour per
  address (`SIMILAR_PER_HOUR`). `/suggest` asks 800 ms after the prompt or answer changes.
- `/api/admin/suggestions` lists, edits and moves them, each question with its top 3 matches at 60
  or more among the packs and the other pending and approved suggestions, whole; a question with no
  round can't be approved (422). Export downloads the playable approved ones and stamps
  `exported_at`; "mark as imported" moves exactly those. An edit clears the stamp.
- `reports` holds what players send to `POST /api/reports` (`app/reports.py`): a mode, a question
  id or null, a snapshot (the question whole, a price mode's roster item, or null for "something
  else"), up to 500 characters of text, open or closed. Closed ones are kept. It and `/suggest`
  list `GET /api/questions?mode=…`, `{id, label}` (`reports.label`: no answer but Who's That NPC?'s,
  plus `npc` or `random_event`); 3 an hour per address. `/api/admin/reports` lists and
  closes them; `/api/admin/questions?mode=…` returns a mode's pack questions whole.
- `question_edits` holds the operator's pending edits and deletes of hand-written pack questions
  (`app/question_edits.py`), one per question, keyed by its id in the packs as they are; a second
  replaces the first. `PUT` and `DELETE /api/admin/questions/{id}` queue one, checked as the
  question it will be (422); only the payload, `wiki`, `source_url` and the credit change. The
  price modes are left out: `gen-price-questions` would overwrite an edit. Nothing plays from it:
  `/api/admin/question-changes` lists, discards, exports (stamping `exported_at`) and, once
  applied, deletes the exported rows. An edit clears the stamp.
- `roster_edits` is the same for the price rounds' roster (`app/roster_edits.py`): a rename or a removal
  per item id, `PUT` and `DELETE /api/admin/roster/{id}`, a name that another item or pending rename
  has is a 422, and `/api/admin/roster-changes` lists, discards, exports and marks applied.

## 12. Data pipeline

Packs are committed, bar `prices.json`: each instance generates its own, and offers no Price is
Right until it does (More/Less keeps `sample.json`'s five). The tests generate one offline (`tests/packs.py`).

- The `make` targets for scripts that write into the checkout (`gen-*`, `fetch-assets`, `logo`) run
  them in `docker-compose.data.yml`, so a host needs only git, docker and make. Its `data` stage is
  the builder's venv plus git; `logo`, on top, adds the `logo` group for `make logo` alone. The
  runtime copies neither. The repo is mounted, run as the host user.
- Every fetch goes through `scripts/wiki.py`: the operator's `WIKI_USER_AGENT` (environment or
  `.env`) or no request, and one request a second per process. Offline flags need neither. A test
  fails any other script importing a network module, bar `smoke_ws` and `loadtest` (the app's).
- `make gen-price-questions` (also in `make all`) fetches `/mapping` and `/latest` once each. It
  never runs at startup or in CI. Its pairs are 1.25x to 4x apart: closer is a coin flip, and the mode shows no values.
  A price's range spans three 1.15x–1.5x steps, its answer 10–45% or 55–90% along the log width.
- A pack's prices share one `as_of`. `/api/modes` gives a mode its pool's newest, shown by the
  footer and a price round's splash instead of on every question.
- `make import-suggestions FILE=…` appends an export to the packs and the roster, skipping what
  they hold, keeping `credit`. A question's options are stored in their seeded order (the form
  puts the right one first), but an examine's right name goes first and its line is asked once; an item's id
  comes from the wiki's `infobox_item` bucket, untradeables included, as does a `picture_item`'s,
  which becomes `image`. A named NPC takes the first infobox row's id on its page (one
  `infobox_monster` query for the file, one `infobox_npc` for the rest), joins `popular-npcs.json`
  and gets its question filled in. Missing `assets.json` entries are added: the NPC's picture, the
  item's detail image and icon. One refused entry, or packs that would not load, writes nothing.
- `make edit-packs FILE=…` applies an export of question changes: an edit replaces its question
  in place, keeping the file's key order, and recomputes its id; a delete removes it. A change to
  an id the packs no longer hold or in a generated pack, or packs that would not load, writes nothing.
- `make rehash-questions` rewrites each pack id that no longer matches its content, nothing else.
  Packs that would still not load write nothing.
- `make edit-roster FILE=…` applies an export of roster changes: a rename keeps the item's place, a
  removal drops it. A change to an id the roster lacks, or packs that would not load, writes nothing.
  The price pack keeps the old names until the next `gen-price-questions`.
- Examine, Bestiary, Drop Table, Odd One Out, Release Order and Sort It Out are hand-written packs,
  like the random events. No importer fetches wiki facts, so the owner picks every monster and
  question.
- `make fetch-assets` fetches `data/assets.json` (target under `client/src/assets/` to wiki title)
  into place, skipping files that exist. Images are never committed: every target must be
  git-ignored. A question's picture, `pictures/<item|npc>/<id>.<ext>`, is staged in `.pictures/`;
  `build_pictures.py` then copies each one a pack uses to `client/public/pictures/<random>.<ext>`,
  out of the bundle, which would merge it with an identical item icon. `data/pictures.json` maps
  asset to file; a file keeps its name until its bytes change, and an unused one is removed.
  Every item the roster or a pack question names has an `items/<id>.png`, its inventory icon:
  never a picture's file, whose bytes would match the icon bundled under the item's id.
  Questions from the wiki keep its CC BY-NC-SA notice, which the README (#98) carries.
- `make logo` is the owner's tool: it traces the fetched `logo/` sources into a boar per theme in
  `branding/boar/`, git-ignored like them. A selfhoster brings their own logo instead.

## 13. Versioning

CLAUDE.md has the bump rule.

- Semver: after 0.9.0 comes 0.10.0. 1.0 is the owner's decision, not a count. One minor bump per
  task, even when one session does several.
- `/VERSION` is the source; `pyproject.toml` and `package.json` copy it and `test_version.py` fails
  on drift. The client builds it in as `__APP_VERSION__` and shows `0.6` for `0.6.0`; the server
  sends it in `welcome`. The footer's version opens What's new from `lib/changelog.ts`, which
  needs an entry for every version, a stacked PR's and the Dependabot bump's too.
- CI's `release` job tags `v<VERSION>` with a GitHub Release once the other jobs pass, and fails if
  `VERSION` went backwards. `make image` builds locally; no registry.
- Dependabot gathers every ecosystem's minor and patch updates into one weekly PR, which gets one
  patch bump before merge. CI fails on a high or critical known vulnerability in a lockfile or the image.
