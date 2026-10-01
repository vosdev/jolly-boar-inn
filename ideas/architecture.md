# Architecture

How Jolly Boar Inn is built today, and the reason behind each choice that looks odd. The product is
`ideas/plan.md`, the open tasks are `ideas/phase2.md` and `ideas/design.md`. Everything here is
final unless it is under "Needs decision" at the end. The licence is AGPL-3.0.

## 0. Stack

| Concern | Choice | Reason |
|---|---|---|
| Server | Python 3.14, FastAPI, uvicorn, one worker | All room state lives in one process's memory. |
| Database | Postgres 18 through `asyncpg`, hand-written SQL | Four tables; an ORM would add more code than it removes. |
| Migrations | Numbered `.sql` files, applied at startup by `db.py` | Alembic needs SQLAlchemy models we do not want. |
| Validation | Pydantic v2 for HTTP and websocket, `jsonschema` for questions | The question schema is shared with CI and the client. |
| Client | Svelte 5 with runes, Vite SPA, TypeScript | No SSR is needed, so no SvelteKit. |
| Tooling | `uv`, `ruff`, `pytest`; `pnpm`, `svelte-check`, `vitest` in jsdom | Vitest compiles components exactly as the build does. |
| Serving | FastAPI serves `client/dist`, SPA fallback to `index.html` | One container, one origin, no CORS. |
| Time | `datetime.now(UTC)` on the server, `timestamptz`, ISO 8601 on the wire | The client never sends a time. |
| IDs | uuid rows, word room codes, content-hash question ids | Codes are for people; uuids go on the wire. |

## 1. Repo layout

```
Dockerfile, docker-compose.yml     three-stage image; app + postgres:18 (dev: docker-compose.dev.yml)
Makefile, .github/workflows/ci.yml setup, dev, lint, test, gen-*-questions, image; CI adds release
schema/question.schema.json        the question schema (section 4)
data/packs/                        prices, examine, sample (the tests'), random_events/<npc>.json
data/                              examines, popular-items, player-names, room-words (.json), heads/
branding/                          a selfhoster's logo, gitignored
server/app/                        main, config, db, static, accesslog, errors, heads, random_events
server/app/rooms/                  state (RoomManager), settings, selection, segments, scoring,
                                   ready, codes
server/app/modes/, questions/      Mode and MODES; schema, packs, vocab, normalize, custom,
                                   submission, text; types/ one module per type
server/app/ws/, http/              handler, protocol, outbox; one module per route or middleware
server/scripts/                    wiki, gen_price_questions, gen_examine_questions,
                                   validate_packs, check_contrast, smoke_ws, loadtest
client/src/lib/                    api, ws, protocol, stores, session, profile, modes, vocab, …
client/src/routes/, components/    Home, Create, Join, Room; TopBar, Lobby, Splash, stage/, …
client/src/components/questions/   viewFor(type, mode), Question, gem buttons; types/, stems/
```

Routes: `/`, `/create`, `/r/:code` (the room with a session, Join without) and `/r/:code/create`.
The retired `/r/:code/admin` resolves like `/r/:code`, because whoever holds that link knows the code.

## 2. Room state

`rooms/state.py` owns every room. HTTP and websocket handlers call `RoomManager`. Nothing else writes
`rooms`, `players`, `questions` or `answers` after creation.

`RoomManager` methods: `get` (rehydrates, section 9), `create`, `join`, `connect`, `disconnect`,
`set_profile`, `set_ready`, `set_editing`, `start_game`, `submit_answer`, `skip(phase, index)`, `promote`, `kick`,
`end_game`, `delete`, `purge_expired`, `evict`. A `Room` holds `players`, `questions`, `totals`,
`current_index`, `phase`, `next_at` (wall clock) with `next_mono` (monotonic), `sockets` (one
`Outbox` each), `timer`, the `advance` and `rescheduled` events, and `lock`.

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

`Mode(id, types, is_round=True, questions=None, seconds=None)` in `modes/`, registered in `MODES` in
the create form's order.

- `id` is `questions.mode` and the settings key. It is never renamed once shipped.
- A round may mix types. The game loop reads only `question.type`. A round whose types disagree on
  seconds states its own; `modes.problems` checks this at import.
- `is_round` is explicit, so an empty `types` never turns a round into an event pool. Only `custom`
  and `random_event` are not rounds. They state no types and no numbers.
- Copy (label, hint, blurb, host lines) lives on the client in `lib/modes.ts`.

Each module in `questions/types/` exports:

```python
def client_view(payload) -> dict      # what everyone sees while open: never the answer
def reveal(payload) -> dict           # what the close shows
def parse_value(payload, value)       # the canonical answer, or None for bad_value
def grade(payload, submissions) -> dict[player_id, float]   # credit, 0.0 to 1.0
def check(payload) -> list[str]       # the stored answer follows from the stored facts
def steps(payload) -> int | None      # optional: frames it reveals itself in
SCORING: Scoring                      # SPEED by default (section 8)
SECONDS: Bounds                       # optional
```

- The room stores, echoes and grades what `parse_value` returns, never the raw value.
- `grade` takes every submission at once, because `closest_number` ranks them. The close rounds
  credit to 1e-9 and clamps it to 0..1, logging a bad value rather than failing.
- `Bounds(default, minimum, maximum)` is what Create offers and `NewRoomSettings` enforces. It falls
  back from mode to types to registry. Rounds default to 5 questions. Seconds default to 10 for
  `more_less` and `price_is_right`, 15 for `multiple_choice`, 20 for the rest. An event question is
  open for its type's default.

| Mode | Label | Type | Pool | Status |
|---|---|---|---|---|
| `more_less` | More or Less | `more_less` | `/mapping` + `/latest` | done |
| `price_is_right` | The Price is Right | `price_is_right` | `/mapping` + `/latest` | done |
| `guess_examine` | Guess the Examine | `pick_from_list` | `data/examines.json` | done |
| `custom` | Host's Questions | per question | the host | done, as events |
| `random_event` | Random Event | per question | one file per NPC | done, as events |
| `bestiary`, `drop_table` | Bestiary, Drop Table | `multiple_choice` | `facts/npcs.json` | #85 |
| `odd_one_out` | Odd One Out | `multiple_choice` | `facts/items.json` | #86 |
| `release_order` | Release Order | `ordering` | quest and NPC dates | #82 |
| `sort_it_out` | Sort It Out | `ordering` | `facts/sequences.json`, levels | #87 |
| `who_said_that` | Who Said That? | `multiple_choice` | hand-written | #88 |
| `clipped` | Know Your Content Creator | `multiple_choice` | hand-written | #88 |
| `whos_that_npc`, `pixel_hunt` | Who's That NPC?, Pixel Hunt | `pick_from_list` | renders | Phase 3 |
| `minimap_guesser`, `name_that_spell` | Minimap Guesser, Name that spell | undecided | | not scheduled |

Create lists the unbuilt ones from `UPCOMING_MODES` in `lib/modes.ts`.

- Sort It Out and Release Order are two modes over one type: their splash, prompt and pool differ.
- Guess the Examine and Who's That NPC? use a strict list, not four buttons or free text. Four names
  can be played by elimination, and free text needs an alias list and a typo argument per item.
- Examine lines are hand-picked, not taken from `/mapping`. The wiki's were accurate and not funny.
- The Price is Right is its own type: its options are integers, and it stores the price again as
  `value` so `check()` has something to compare against.

## 4. Questions

`schema/question.schema.json` (Draft 2020-12) defines the envelope and one payload per type. The
server's Pydantic models and the client's TS types are derived by hand and tested against it.

- Every payload stores its answer, even a derivable one, so `grade` never recomputes game logic.
- Numeric facts are embedded with `as_of`. Play needs no dataset.
- `id` is `q_` plus 16 hex of `sha256(type + "\n" + canonical_json(payload))`. `mode` and the other
  envelope fields stay out, so a mode rename rewrites no id.
- Length caps live in the schema, not only in forms. Every choice array references
  `$defs/choices`, six at most, one per gem; `ordering.entries` (#82) must too.
- Assets are `item:<id>` or `npc:<id>`, never a URL. `pick_from_list` withholds `image` while open
  ("Needs decision").
- `random_event` on the envelope names the NPC who asks. Only event files and host questions carry it.

| Type | `value` | Credit |
|---|---|---|
| `more_less`, `price_is_right`, `multiple_choice` | option index | 1 or 0 |
| `free_text` | string, at most 80 characters, no NUL or lone surrogate | 1 or 0 |
| `closest_number` | number | by rank (section 8) |
| `pick_from_list` | an entry id of the question's vocabulary | 1 or 0 |
| `ordering` (#82) | every entry key once | fraction in the right place |

- Free text is NFKC-normalised, lowercased, stripped of punctuation and whitespace-collapsed, then
  matched within `max_distance` of an accepted answer. Levenshtein runs only inside that band, so it
  stays linear on the event loop. Answers under four characters need an exact match ("Jad", "Jam").
- `ordering` stores a `rank` per entry, which allows ties, and an `answer` list for display.
  `check()` rejects an `answer` that does not sort by `rank`, and a payload where everything ties.
- `pick_from_list` answers through one strict WAI-ARIA combobox. Typing only searches, by word
  prefix, ignoring case and accents. Only a selected entry can be submitted, with its own button.

## 5. Packs, selection, segments

- A pack file is `{pack, generated_at, questions}`, and may hold several modes. An event file,
  `data/packs/random_events/<npc>.json`, is `{pack, random_event, questions}`; the loader stamps
  the NPC on each question and refuses a file named after nobody on the roster.
- `validate_packs.py` fails CI on a schema error, a duplicate or mismatched id, an unknown mode, a
  type its mode does not allow, a stray `random_event`, or a price type filed as an event.
- Custom questions are rows with `source = 'room'`, `mode = 'custom'` and `author_player_id`.

`select(packs, custom, settings, rng)` fixes a room's questions at creation:

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

| Client `t` | Fields | Who | Effect |
|---|---|---|---|
| `hello` | `session` | all | Must be first. Replies `welcome`. |
| `ping` | | all | Replies `pong`. |
| `answer` | `question_id`, `value` | all | Stored if open, unanswered and allowed. `answer_ack` or `error`. |
| `ready` | `ready: bool` | all | Lobby or splash only. One take-back per splash, one lobby change a second. |
| `set_profile` | `display_name?`, `avatar?` | all | Lobby only. Validated exactly like a join. One change a second. Clears `editing`. |
| `editing` | `on: bool` | all | Name menu open. Lobby only, else ignored. An `on` within 1 s of a change is ignored; 60 s unsent, a disconnect or `start_game` clears it. |
| `start_game` | | admin | `lobby → playing`. |
| `skip` | `phase`, `index` | admin | Ends that phase if the room is still in it, so a double tap ends one. |
| `promote` | `player_id` | admin | Makes them admin. There is no demote. |
| `kick` | `player_id` | admin | Deletes the player and their answers; closes 4003. Not on admins. |
| `end_game` | | admin | Voids an open question, `playing → finished`. |

| Server `t` | Fields | When |
|---|---|---|
| `welcome` | `room`, `you`, `players`, `question`, `your_answer`, `standings`, `server_time`, `server_version` | Reply to `hello`. The full state. |
| `room_updated` | `room`, `players` | Join, leave, promote, kick, rename, status change, a splash or standings starting, a ready change that moves `next_at`. |
| `players_updated` | `players` | A ready, editing, connect or disconnect that changed players only. |
| `question_open` | `question` | A question opens. |
| `answer_ack` | `question_id`, `scoring`, `band`, `answered`, `of` | Answer committed. Never correctness. |
| `answer_count` | `question_id`, `answered`, `of` | Someone else answered. A count only. |
| `question_closed` | `question_id`, `reveal`, `results`, `standings`, `next_at` | Closed. `next_at` ends the reveal; null after the last question. |
| `game_finished` | `standings` | Final. |
| `pong` | `server_time` | Reply to `ping`. |
| `error` | `code`, `message` | `bad_hello`, `bad_message`, `not_admin`, `not_open`, `already_answered`, `excluded`, `bad_value`, `bad_state`, `bad_name`, `name_taken`, `bad_avatar`. |

```
RoomView     { code, status, settings, current_index, total, phase, next_at, segment }
PlayerView   { id, display_name, avatar, role, connected, ready, editing }
Standing     { player_id, display_name, avatar, points, rank }
Segment      { mode, index, total, start, count }
OpenQuestion { question_id, index, total, type, mode, segment, view, random_event,
               opened_at, answerable_at, ends_at, you_can_answer, answered, of }
PlayerResult { value, correct, credit, points }
```

- `total` counts stored questions, not what the settings asked for.
- `OpenQuestion.mode` sits beside `type` because the pair picks the view (`viewFor`), and an event's
  mode differs from its segment's.
- `view` is `client_view(payload)`. `random_event` is the NPC id; an unknown id gets a generic card.
- `answerable_at` is `opened_at` plus a fixed 3.5 s (`RANDOM_EVENT_HOLD`) for an event. Answers
  before it are `not_open`, and `ends_at` and timing count from it, so the NPC's entrance costs
  nobody points.
- `next_at` ends the timed phase. It is null while a question is open or a splash waits for the room.
- `band` is the speed bucket for SPEED, the step for STEP, null for RANK. `of` is every connected
  player who can answer, plus anyone who answered and dropped.
- `credit` lets a reveal say "3 of 5 in place". `correct` is `credit >= 1.0`.

What the server withholds. The admin is a player with a flag; there is no admin channel.

- Open-question frames are identical for every socket, admin included, except `you_can_answer`
  (false for the author and on `host_only`) and the live counts. They never carry the answer.
- `question_id` is the row uuid, never the content id, which hashes the answer and could be
  brute-forced.
- Results and correct answers first appear in `question_closed`, to everyone at once.
- The question list is never sent. `GET /api/rooms/{code}` returns only `{status, players}`, a count.
- An admin can read the room's custom questions before the game. They cannot score on them.

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

`GET /api/vocab/{name}` serves `items` (`popular-items.json`), `examines` (`examines.json`) and
`npcs` (`facts/npcs.json`, 404 until #83) as `{vocab, version, entries: [{id, name}]}`, built at
startup. Two entries with one name refuse to load. The client fetches a list once, when a question
first names it; per question it would resend the list every time. It gives nothing away: it is every
entry, not the question's options.

## 7. Room lifecycle

```
POST /api/rooms ─▶ lobby ─start_game─▶ playing ─last reveal / end_game─▶ finished
any state ─▶ deleted: expires_at passes (cleanup), or an admin sends DELETE /api/rooms/{code}
```

- A room is born with its host; there is no state before `lobby`. Only `lobby` is joinable.
- `start_game` needs an admin, a question and a connected player. It resets `expires_at`.
- A deleted room closes its sockets with 4004, and its code is free again.

One task per room runs `_run_questions(room, index, resume_at)`:

```
(segment start) splash ─ready countdown / skip─▶ open ─timer / all answered / skip─▶ reveal
reveal ─▶ standings (a round's last question, not the game's) ─▶ next question / finished
reveal ─▶ next question / finished (every other question)
open ─end_game / crash─▶ voided
```

- `phase` is `idle` (lobby, finished), `splash`, `open`, `reveal` or `standings`. It is not a
  column, so a restart resumes in the reveal (section 9) and loses a splash or standings screen.
- A splash runs before each segment's first question, never before an event.
- Open stamps `shown_at` and sets `answerable_at` and `ends_at`. Close grades, then writes
  `closed_at`, `correct` and `points` in one transaction.
- `close_when_all_answered` closes once every connected eligible player has answered, also when a
  disconnect or kick makes that true.
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
  "modes": [{"mode": "more_less", "questions": 5, "seconds": 10}],  // one round each
  "mode_order": "random",                // or "listed"
  "random_event_frequency": "default",   // "less" | "default" | "more"
  "reveal_seconds": 8,                   // 2..30
  "splash_seconds": 8,                   // 0..30; 0 turns splashes off
  "standings_seconds": 10,               // 0..30; 0 turns standings off
  "close_when_all_answered": true,
  "name_wrong_answers": false,           // name who got it wrong under the reveal
  "max_players": null                    // null: MAX_PLAYERS_PER_ROOM, stored at create
}
```

- `modes[].mode` keys `MODES`, never `TYPES`, once each. `questions` and `seconds` are optional.
- `NewRoomSettings` checks the ranges at creation. `RoomSettings`, the stored model, clamps old
  values, keeps a round whose mode was removed, and ignores unknown keys, so no downgrade strands a
  room.

## 8. Scoring

`elapsed = received_at - answerable_at`, on the server's monotonic clock, from arrival rather than
from taking the lock. `grade` returns credit; `scoring.py` turns it into points per `SCORING`:

| `SCORING` | Points | Types |
|---|---|---|
| `SPEED` | `round(bucket points × credit)` | `more_less`, `price_is_right`, `multiple_choice`, `free_text`, `ordering` |
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

Steps (Pixel Hunt): `steps` frames over the question's seconds. Points fall from 1000 on step 1 to
400 on the last, `round(400 + 600 × (steps - k) / (steps - 1))`; one step pays 1000. A payload
without `steps` scores on speed.

- There is no `question_update` message. The step schedule is a function of `answerable_at`,
  `ends_at` and `steps`, so clients advance it themselves and a reconnect lands on the right frame.
- `points_for(scoring, credit, band, steps)` is the one entry point. It refuses credit outside 0..1
  rather than paying for a type's bug.
- `correct` is `credit >= 1.0`: three of five in order scores, and is not "correct".
- `host_only` scores nobody. An author scores 0 on their own question and gets `excluded`. A kicked
  player's answers are deleted.

Standings sort by points, then correct answers, then `joined_at`. Rank is dense over points and
correct answers; join time only orders players who share a rank.

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
3. Resume in `reveal` for `reveal_seconds`, then advance. A question that never opened is still
   owed, so that reveal opens it.
4. Any lookup loads the room, but only an authenticated socket resumes it, so a link preview never
   plays a room nobody is in.

## 10. Identity and security

The creator is the first admin. Every identity is one session token. Tokens travel only in bodies
(create and join return one; `DELETE /api/rooms/{code}` sends one) and the first websocket frame.
Admin rights come from `player.role`, checked per message.

`POST /api/rooms {display_name, avatar?, settings, custom_questions}`, in one transaction:

1. Validate the name before the rate limiter, so a typo costs no quota: NFKC, trimmed, single
   spaces, 1–24 Latin letters (accents allowed), digits, spaces, `_` and `-`.
2. Rate limit per IPv4 address or IPv6 /64.
3. Draw a code from `room-words.json` with `secrets.SystemRandom`: five plain tries, 20 with two
   digits, then `CodeSpaceExhausted`. Each try has a savepoint.
4. Insert the admin outside that savepoint, or a session collision would be retried as a code
   collision. Then select and insert the questions.
5. Return `201 {code, session, player, expires_at}`. The plain session is returned once and never
   logged. Any failure rolls everything back.

- Join is `POST /api/rooms/{code}/join {display_name, avatar?}` → `{session, player}`.
- The client keeps sessions and the rooms it created in localStorage, never a cookie, so nothing
  ambient authenticates a request.
- A second admin is a join plus `promote`. A room whose last admin lost their session stays stuck
  until Phase 4.
- Sessions are stored as sha256, so a database dump yields none.

Limits:

- 30 creates an hour (`ROOMS_PER_IP_PER_HOUR`), 100 joins an hour, 30 lookups of missing rooms per
  10 minutes. Past those, every room request is 429 (1008 on a socket), so a refusal never reveals
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
- Display names have no word filter until Phase 4.

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
  `PUBLIC_DEFAULT_THEME` (`client/site-branding.ts`). `PUBLIC_BASE_URL` has no
  consumer yet; the client links from `location.origin`.

## 11. Database

The schema is the sum of `server/app/migrations/`; this file keeps no copy. Add a migration, never
edit one. Four tables: `rooms`, `players`, `questions` (every question the room will play, fixed at
creation) and `answers` (one per player per question). The last three cascade from `rooms`.

- `answers.points` is written once, at close, and standings are its sum. Memory keeps the same sum
  and reloads it on rehydrate. Scores are never tracked separately.
- `questions.payload` holds the envelope extras at the top and the type payload under `payload`, so
  SQL reads `payload->'payload'`. Fields that queries or grading need are columns.
- `questions.round` and `questions.mode` are stored; neither can be derived (section 5).
- `players.avatar` indexes `heads.json`; null is a head derived from the id. The server checks the
  upper bound, because the manifest grows without a migration.
- Cleanup deletes expired rooms 200 at a time, at startup and every `ROOM_CLEANUP_INTERVAL_SECONDS`,
  then drops them from memory. A failed pass is logged and the next runs. There is no external cron.
- `suggestions` (Phase 6) is created only when needed.

## 12. Data pipeline

Packs are generated offline and committed, so a clone plays without a network.

- Every fetch goes through `scripts/wiki.py`: the operator's `WIKI_USER_AGENT` (environment or
  `.env`) or no request, and one request a second per process. Offline flags need neither. A test
  fails any other script importing a network module, bar `smoke_ws` and `loadtest` (the app's).
- `make gen-price-questions` fetches `/mapping` and `/latest` once each. It never runs at startup
  or in CI. Its pairs are 1.25x to 4x apart: closer is a coin flip, and the mode shows no values.
- `make gen-examine-questions` builds `examine.json` from the hand-written `data/examines.json`. A
  test fails when they disagree.
- #83 adds `make fetch-facts` on `wiki.py`: resumable, into `data/facts/`.
- #84 adds `make gen-packs`: facts, the roster and `examines.json` into packs, offline and seeded,
  with `CHECK=1` diffing in CI. It never derives `examines.json`.
- Facts are committed so generators run offline and reproducibly. Images are never committed; a
  selfhoster fetches them under their own User-Agent. `data/facts/README.md` carries the wiki's
  attribution and CC BY-NC-SA notice.

## 13. Versioning

CLAUDE.md has the bump rule.

- Semver: after 0.9.0 comes 0.10.0. 1.0 is the owner's decision, not a count. One minor bump per
  task, even when one session does several.
- `/VERSION` is the source; `pyproject.toml` and `package.json` copy it and `test_version.py` fails
  on drift. The client builds it in as `__APP_VERSION__` and shows `0.6` for `0.6.0`; the server
  sends it in `welcome`.
- CI's `release` job tags `v<VERSION>` with a GitHub Release once the other jobs pass, and fails if
  `VERSION` went backwards. `make image` builds locally; no registry.

## Needs decision

- **Where asset files live.** The container is read-only, and images will be served from it. Either
  bake the importer's output into the image, or mount a read-only volume. Pixel Hunt and Who's That
  NPC? need the answer.
- **How an open question names its image.** `pick_from_list` withholds `image` while open, because
  for that type the asset id is the answer id. Who's That NPC?, Pixel Hunt and Minimap Guesser need
  an opaque per-room reference first, which changes the schema and the protocol. Never solve it by
  adding `image` to `client_view`.
