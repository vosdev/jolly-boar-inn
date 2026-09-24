# Architecture

Technical design for Phase 0, Phase 1 and Phase 2 of Jolly Boar Inn Quiz Night, with Phase 3 sketched where it affects the question schema and the asset pipeline. Product context lives in `ideas/plan.md` and `ideas/games.md`; the Phase 2 task list lives in `ideas/phase2.md`. This file does not repeat either.

Every choice below is final unless it appears in "Needs decision" at the end.

## 0. Stack

| Concern | Choice | Reason |
|---|---|---|
| Server | Python 3.14, FastAPI, uvicorn (single worker) | Decided in plan.md; one worker keeps room state in one process. |
| DB access | `asyncpg` directly, hand-written SQL | Five tables; an ORM adds more code than it removes. |
| Migrations | Numbered `.sql` files applied by a 40-line runner at startup | Alembic needs SQLAlchemy models we otherwise do not want. |
| Validation | Pydantic v2 for WS/HTTP messages, `jsonschema` for questions | Questions need a language-neutral schema shared with CI and the client editor. |
| Python tooling | `uv`, `ruff`, `pytest`, `pytest-asyncio` | Fast, single lockfile, no extra config. |
| Client | Svelte 5 + Vite SPA, TypeScript, `pnpm` | Decided in plan.md; no SSR needed, so no SvelteKit. |
| Client tooling | `svelte-check`, `vitest` + `@testing-library/svelte` in jsdom | Vitest reuses the Vite config, so a component test compiles exactly what the build does. |
| Serving | FastAPI serves `client/dist` as static files, SPA fallback to `index.html` | One container, one origin, no CORS. |
| Containers | One three-stage `Dockerfile` (client build, uv venv build, slim runtime), `docker-compose.yml` with `app` + `postgres:18` | Works out of the box for selfhosters. Build tooling never reaches the runtime image. |
| Postgres | 18, `pgcrypto` not needed (`gen_random_uuid()` is built in) | Current stable. |
| Time | Server-side `datetime.now(UTC)` everywhere, `timestamptz` columns, ISO 8601 strings on the wire | The client never sends a timestamp. |
| IDs | `uuid` for rows, short text `code` for rooms, content hash for questions | Room codes are for humans, uuids for joins. |

## 1. Repo layout and main modules

```
jolly-boar-inn/
├── Dockerfile                 # stage 1: pnpm build client; stage 2: uv sync server, copy client/dist
├── docker-compose.yml         # app + postgres, .env driven
├── Makefile                   # dev, test, lint, migrate, fetch-facts, gen-packs, validate-packs
├── .env.example
├── .github/workflows/ci.yml   # ruff, pytest, validate-packs, svelte-check, vitest, docker build
├── schema/
│   └── question.schema.json   # canonical question schema (section 2)
├── data/
│   ├── packs/                 # shipped question packs, validated in CI
│   │   ├── prices.json        # generated: more_less + price_is_right
│   │   ├── examine.json       # generated: guess_examine
│   │   ├── bestiary.json      # generated: bestiary + drop_table
│   │   ├── odd-one-out.json   # generated: odd_one_out
│   │   ├── ordering.json      # generated: release_order + sort_it_out
│   │   ├── quotes.json        # hand-authored: who_said_that + clipped
│   │   └── random_events/     # hand-authored: mode random_event, one file per NPC, named by its id
│   │       └── sandwich_lady.json
│   ├── facts/                 # importer output: the dataset packs are generated from
│   │   ├── items.json         # id, name, examine, high alch, release date, properties
│   │   ├── npcs.json          # id, name, examine, combat level, quest, drops, weakness
│   │   ├── quests.json        # name, release date, difficulty, length, quest points
│   │   ├── sequences.json     # hand-curated orderings (gems, metals) for sort_it_out
│   │   ├── manifest.json      # per file: source, fetched_at, sha256
│   │   └── README.md          # OSRS Wiki attribution, CC BY-NC-SA
│   ├── popular-items.json     # curated item roster (id + name), the importer's input
│   └── room-words.json        # word list for room codes
├── server/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py            # app factory, lifespan (pool, migrations, packs), static mount
│   │   ├── config.py          # Settings from env vars (pydantic-settings)
│   │   ├── db.py              # asyncpg pool + migration runner
│   │   ├── migrations/
│   │   │   └── 0001_init.sql
│   │   ├── rooms/
│   │   │   ├── state.py       # THE room-state module (see below)
│   │   │   ├── scoring.py     # pure functions: bucket(), step(), band(), points_for()
│   │   │   ├── selection.py   # pure function: pick a room's rounds from packs + custom
│   │   │   ├── segments.py    # pure function: group questions back into rounds
│   │   │   └── codes.py       # room code generation
│   │   ├── modes/             # what a round is: see section 2
│   │   │   ├── __init__.py    # registry: MODES = {"more_less": Mode(...), ...}
│   │   │   └── mode.py        # the Mode dataclass
│   │   ├── random_events.py   # the random-event roster: NPC ids (ideas/random-events.md); copy is client-side
│   │   ├── questions/
│   │   │   ├── schema.py      # load schema, validate(question), content_id(question)
│   │   │   ├── packs.py       # load data/packs/*.json and random_events/*.json at startup
│   │   │   ├── normalize.py   # free-text normalisation + Levenshtein
│   │   │   ├── vocab.py       # closed answer lists for pick_from_list: the roster, data/facts
│   │   │   └── types/         # one module per question type: the answer shape
│   │   │       ├── __init__.py    # registry: TYPES = {"more_less": more_less, ...}
│   │   │       ├── bounds.py      # Bounds: a per-mode number, its default and its range
│   │   │       ├── scoring.py     # Scoring: how a type turns credit into points
│   │   │       ├── more_less.py
│   │   │       ├── multiple_choice.py    # T21
│   │   │       ├── price_is_right.py     # T19
│   │   │       ├── free_text.py          # T21
│   │   │       ├── closest_number.py     # T21
│   │   │       ├── ordering.py           # T27
│   │   │       └── pick_from_list.py     # T20
│   │   ├── ws/
│   │   │   ├── protocol.py    # pydantic models for every message, both directions
│   │   │   └── handler.py     # /ws/{code} endpoint; parses, authenticates, dispatches to RoomManager
│   │   ├── http/
│   │   │   ├── rooms.py       # POST /api/rooms, GET+DELETE /api/rooms/{code}
│   │   │   ├── players.py     # POST /api/rooms/{code}/join
│   │   │   ├── modes.py       # GET /api/modes: the modes, their type, and their pacing
│   │   │   ├── vocab.py       # GET /api/vocab/{name}: the autocomplete lists
│   │   │   ├── bodylimit.py   # 256 KiB cap on /api/* request bodies, 413 over it
│   │   │   ├── forwarded.py   # warns once about an ignored X-Forwarded-For
│   │   │   └── ratelimit.py   # in-memory per-IP limiter
│   │   └── static.py          # mount client/dist with SPA fallback
│   ├── scripts/
│   │   ├── fetch_facts.py           # the importer: wiki APIs → data/facts/*.json (network)
│   │   ├── gen_packs.py             # data/facts + roster → data/packs/*.json (offline)
│   │   ├── generators/              # one module per generated pack, called by gen_packs
│   │   │   ├── prices.py            # more_less + price_is_right
│   │   │   ├── examine.py           # guess_examine
│   │   │   ├── bestiary.py          # bestiary + drop_table
│   │   │   ├── odd_one_out.py
│   │   │   └── ordering.py          # release_order + sort_it_out
│   │   ├── validate_packs.py        # CI: every pack entry against the schema, ids match content
│   │   └── loadtest.py              # 30 bot players over websockets
│   └── tests/
├── client/
│   ├── package.json
│   ├── vite.config.ts         # dev proxy /api and /ws to :8000
│   └── src/
│       ├── App.svelte         # the shell: TopBar over a hash-free router: /, /create, /r/:code
│       ├── lib/
│       │   ├── api.ts          # fetch wrappers for /api
│       │   ├── ws.ts           # RoomSocket: connect, hello, backoff reconnect, ping, typed events
│       │   ├── modes.ts        # per-mode copy and presentation: label, hint, blurb, stem
│       │   ├── randomEvents.ts # per-random-event copy: the NPC, its theme, the line, the asset
│       │   ├── gp.ts           # format a coin amount the way the game writes it
│       │   ├── vocab.ts        # fetch and cache /api/vocab/{name}, word-prefix search
│       │   ├── session.ts      # localStorage: session per room, list of created rooms
│       │   ├── protocol.ts     # TS types mirroring server/app/ws/protocol.py
│       │   └── stores.ts       # room, players, question, standings (Svelte runes/stores)
│       ├── routes/
│       │   ├── Home.svelte          # create or join
│       │   ├── Create.svelte        # name + settings; creates and lands in the lobby as host
│       │   ├── Join.svelte
│       │   └── Room.svelte          # lobby / question / reveal / final, driven by stores
│       └── components/
│           ├── TopBar.svelte           # sign, wordmark + room code, and three control slots
│           ├── Lobby.svelte
│           ├── Scoreboard.svelte
│           ├── Splash.svelte            # introduces a round's mode, on a timer
│           ├── RandomEvent.svelte       # the NPC who interrupts a round with one question
│           ├── Timer.svelte
│           └── questions/
│               ├── index.ts             # viewFor(type, mode): which pair draws a question
│               ├── props.ts             # the props a type view and a stem take
│               ├── Question.svelte      # composes the mode's stem with the type's view
│               ├── types/               # the answer affordance, one per question type
│               │   ├── MoreLess.svelte
│               │   ├── MultipleChoice.svelte
│               │   ├── PriceIsRight.svelte
│               │   ├── FreeText.svelte
│               │   ├── ClosestNumber.svelte
│               │   ├── Ordering.svelte
│               │   └── PickFromList.svelte   # strict combobox: search, select, submit an id
│               └── stems/               # what sits above it, one per mode that needs one
│                   ├── TextStem.svelte
│                   ├── AssetStem.svelte
│                   ├── ExamineStem.svelte
│                   ├── QuoteStem.svelte
│                   ├── SubjectsStem.svelte
│                   └── ZoomStem.svelte
└── ideas/
```

### Module contracts

**`rooms/state.py` (the single room-state module).** Everything that mutates a room goes through `RoomManager`. HTTP handlers and the WS handler call it; nothing else touches `rooms`, `questions`, `answers` rows after room creation.

```python
class RoomManager:
    rooms: dict[str, Room]                      # code -> Room, loaded lazily
    async def get(code) -> Room                 # load from Postgres if not in memory (rehydrate)
    async def create(display_name, settings, custom_questions, creator_ip) -> tuple[Room, Player, session_token]
    async def join(code, display_name) -> Player
    async def connect(code, session_token, ws) -> Player     # attaches socket, sends welcome
    async def disconnect(code, player_id)
    async def start_game(code, by: Player)
    async def submit_answer(code, player: Player, question_id, value)
    async def skip(code, by: Player)            # close open question now, or cut the reveal short
    async def promote(code, by: Player, player_id)
    async def kick(code, by: Player, player_id)
    async def end_game(code, by: Player)

class Room:
    code, status, settings, players: dict[uuid, Player], questions: list[RoomQuestion]
    current: int | None                         # index into questions
    phase: "idle" | "splash" | "open" | "reveal"
    open_since: datetime | None, ends_at: datetime | None
    sockets: dict[uuid, WebSocket]              # connected players
    timer: asyncio.Task | None                  # the one task driving open→closed→reveal→next
    lock: asyncio.Lock                          # every mutation holds it
```

Rules:

- One `asyncio.Lock` per room; every public `RoomManager` method acquires it. No cross-room locking.
- Every DB write happens inside the method that mutates memory, before memory changes and before broadcasting, so a failed write leaves memory as it was. Answers are committed before `answer_ack` is sent.
- Broadcasting is `for ws in room.sockets.values(): await ws.send_json(msg)` with per-socket try/except; a failed send removes the socket.
- Replaceability: `RoomManager` is the only thing that would change for multi-replica. Do not build for it now.

**`questions/types/<type>.py`.** A type is an *answer shape*: what a player sends, how it is
checked, and how it earns points. It says nothing about what the question is about. Each
module exports:

```python
def client_view(payload: dict) -> dict     # what players and admin see while open; no answer, no reveal
def reveal(payload: dict) -> dict          # shown after close: answer, reveal block, asset refs
def grade(payload: dict, submissions: list[Submission]) -> dict[player_id, float]
                                           # credit per player, 0.0..1.0 (section 6)
def validate_value(payload: dict, value) -> bool   # shape check of a submitted answer before storing
def check(payload: dict) -> list[str]      # consistency: the stored answer follows from the stored facts

SCORING: Scoring = Scoring.SPEED           # optional: how credit becomes points (section 6)
QUESTIONS: Bounds                          # optional: fallback round length for a mode of this type
SECONDS: Bounds                            # optional: fallback question length for a mode of this type
```

`grade` returns **credit**, a float from 0.0 to 1.0, for every type. One is fully right,
zero is wrong, and the values between are `ordering`'s partial credit. It takes all
submissions at once because `closest_number` ranks them against each other. `scoring.py`
turns credit plus timing into points, and `SCORING` picks which of the three ways it does
that — which is the whole reason a type is a separate thing from a mode.

**`modes/__init__.py`.** A mode is a *round*: the thing a host picks on the create form, the
thing a splash introduces, and the thing `questions.mode` records. It is what a question is
about; the type is only how you answer it.

```python
@dataclass(frozen=True, slots=True)
class Mode:
    id: str                       # "drop_table"; the questions.mode column and the settings key
    type: str | None              # the question type it plays as; None for "custom", "random_event"
    questions: Bounds | None      # how many questions its round holds; None for the same two
    seconds: Bounds               # how long one of them stays open
```

`MODES: dict[str, Mode]` is the registry, in the order the create form lists them.
`questions_bounds(mode)` and `seconds_bounds(mode)` read a mode's own numbers, falling back
to its type's and then to the registry's, so a mode only states the numbers it disagrees
with. Copy — label, hint, splash blurb — stays on the client, as it already does.

The split exists because six of the modes in `ideas/games.md` are the same answer shape.
Drop Table, Bestiary, Odd One Out, Who Said That? and Clipped are all four buttons and one
index; keeping them as five types would be five copies of one `grade`, and would leave
`selection.py` unable to tell two rounds of "pick one of four" apart. Keeping them as five
*modes* over one type gives each its own pool, its own pacing, its own splash and its own
presentation, and costs one dataclass entry each.

`Mode.type` is `None` for two modes, `custom` and `random_event`: a host may write a
multiple-choice question and a closest-number one, and so may whoever writes for an NPC, and
each question carries its own type. They are also the two modes that are never a round —
their questions arrive one at a time as random events (`selection.py` below) — so each
declares only `seconds`, the length of one such question, and has no `questions` bounds
because it has no round to size. Every other mode has a type, and `validate_packs.py`
rejects a pack question whose `type` disagrees with its `mode`'s.

`grade` takes all submissions at once because `closest_number` ranks them. `scoring.py` turns grade results plus timing into points.

`QUESTIONS` and `SECONDS` exist because modes differ in pace, and a room has no question length of its own to fall back on any more. Each is a `Bounds(default, minimum, maximum)`: the default the create form offers, and the range `NewRoomSettings` holds a host to. `more_less` is two names and one word, so it is a long round of short questions — ten of them at ten seconds, stretchable to twenty, because a minute of it would be forty-five seconds of waiting. They are the default for every mode of the type: a `Mode` states its own `questions` or `seconds` only where it disagrees, and a module that declares neither leaves it to the fallbacks in `modes/__init__.py`. `questions_bounds(mode)` and `seconds_bounds(mode)` read that chain — mode, then type, then registry — `GET /api/modes` serves the result to the create form, and `RoomSettings.seconds_for` clamps a stored room into it, so a room created before a mode or its type changed its mind still plays. The speed bucket is a fraction of that same number, so a ten-second round scores on ten seconds in a game whose other rounds run to a minute.

**`rooms/selection.py`.** `select(packs, settings, rng) -> list[Round]`: a mode is a round. A room plays one round per mode picked, as long as that mode's own `questions` setting asks for — six modes are six rounds, one mode is one round. A mode's pool is every pack question carrying that `mode`, which is why the envelope stores it: pools are looked up by mode, never by type, or the five modes that share `multiple_choice` would draw from each other. `settings.mode_order` decides the running order: `"listed"` plays them in the order the host arranged them in, `"random"` shuffles them once, here, at creation, because the stored questions *are* the running order. Questions are drawn without replacement per mode; a mode whose pool runs dry gives a short round, or none at all — an empty round is dropped rather than played.

`flatten(rounds)` gives `(round number, question)` in play order, which is what `create` stores. Pure, seeded, tested.

**Random events.** A room's own questions are not a round, and neither are the NPCs'. They arrive the way a random event arrives in the game this one is about: someone interrupts what you were doing, asks you one thing, and leaves. `place_random_events(rounds, custom, events, settings, rng) -> list[Round]` is the second half of selection. `settings.random_event_frequency` says how many: one event per 20, 10 or 5 round questions (`less`, `default`, `more`), **added on top of the rounds**, so one mode of ten questions at `default` plays eleven, and `MAX_QUESTIONS_PER_ROOM` counts the events. There is no off switch; `less` is the quiet end.

Where they go:

- **Spacing, not rounds.** The round questions, in play order, are cut into consecutive windows of N, and each whole window is one slot, at a position drawn inside it. The events are spread through the game rather than bunched, and a one-mode room gets them too.
- **Always inside a round.** A slot sits straight after a question that is not its round's last, so there is a question of the same round on either side of every event: never the game's first question, never a round's first (that one is the splash's), and never followed by a round's first either, so a splash never comes straight after an interruption. A window whose questions are all their round's last — rounds of one question — has no slot.

Who asks, and what:

- **The host's questions take random slots**, in the order the host wrote them. The cap is the slot count at the chosen frequency, and `NewRoomSettings` rejects more custom questions than that, naming the count, the limit and the frequency and pointing at `more`, rather than silently dropping the overflow. A host who wants five questions of their own writes a game long enough to hold five events, which also keeps them from turning the room into their own trivia night with one round of ours.
- **Every other slot takes an NPC's own question**, from the event pack, `data/packs/random_events/`, and nowhere else. Every question there is mode `random_event` and was written for one NPC, about that NPC's subject: the Sandwich Lady asks about cooking and Dr Jekyll about potions. So for these slots the face and the question are drawn together, without replacement, preferring a question whose type differs from the round it interrupts — another four-button question in the middle of a four-button round reads as a long round, not an interruption. The slot is left empty only when no question qualifies.
- **Faces.** A custom question whose envelope names an NPC (`random_event`) is asked by that NPC, even if another custom question already named it. Every other face is drawn from `app/random_events.py`: first from the NPCs the room has not seen yet, then from the least seen, and never the face of the event just before or after it. A face the host named counts as seen from the start, so the draw does not spend it early. A host's unnamed question may be asked by anyone on the roster, which is also the only way an NPC with no questions written yet turns up. The roster no longer has to outnumber the slots: a room at `more` can hold more events than there are faces, and the least used face repeats.

A room stored before T22 said `random_events` instead, a boolean for "may the packs interrupt too". It reads back as `default` for true, and for false as a frequency of none: the host's own questions, placed by T21's rules — one per round after the first — and nothing else. `NewRoomSettings` never takes it, so no new room is made that way. Selection never runs twice, so this matters only for the settings a stored room loads with; its questions are already in their rows.

Until T22 a pack event borrowed a question from a mode the host did not pick and put a random face on it. That made for a Sandwich Lady asking a Drop Table question: the joke works once, and the NPC is only a sticker on it. A themed pack costs hand-written content, and it is the one kind of content in this project that is allowed to be silly. The roster and the themes live in `ideas/random-events.md`.

`order` is gone. It first meant "mix each custom question into the pack round of its own type", the mode/type split turned it into "where the custom round goes", and random events leave it nothing to decide. Both earlier meanings were answers to "where do the host's questions belong", and the honest answer turned out to be "nowhere in particular, which is the point".

**`rooms/segments.py`.** `segments_of(questions) -> list[Segment]`: the rounds a room is playing, grouped back out of the `questions.round` column. The round number is stored rather than derived because neither cheap derivation holds — counting questions off `settings.modes` breaks on a short round, and reading runs of equal `mode` breaks on a random event, which is a question of one mode sitting inside a round of another — and both failures are silent.

A random event carries the `round` of the round it interrupts and is grouped into it, so a `custom` question at position 5 of a `more_less` round does not split that round into three. The segment's `mode` comes from the rows that are not events, and a segment made only of events cannot happen, because an event is never a round's first question. This is the one place where grouping on `mode` is not the whole rule, and it is why the rule lives in a module instead of in a `GROUP BY`.

**`db.py`.** `create_pool()`, `run_migrations(pool)`: creates `schema_migrations` if missing, applies every `NNNN_*.sql` not yet recorded, each file in one transaction, in lexical order. Refuses to start if a file recorded as applied is missing.

**`config.py`.** All env vars, with defaults for development:

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://jbi:jbi@localhost:5432/jbi` | |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | Absolute base for this deployment. No consumer in Phase 1: the client builds every link from `location.origin`. |
| `ROOM_TTL_DAYS` | `3` | Sets `expires_at`. |
| `ROOM_CLEANUP_INTERVAL_SECONDS` | `3600` | How often the cleanup task deletes rooms past `expires_at`. Must be positive; the app refuses to start otherwise. |
| `ROOMS_PER_IP_PER_HOUR` | `30` | IPv6 counts by its /64. |
| `MAX_PLAYERS_PER_ROOM` | `50` | |
| `PACKS_DIR` | `../data/packs` | |
| `LOG_LEVEL` | `info` | Query strings are never logged. |

## 2. Modes, types, and the question schema

### The catalogue

Seven types, and the modes built on them. The type is the answer shape; the mode is the
round. Names are final — `ideas/games.md` holds the sketches they came from.

| Mode | Label | Type | Pool comes from | Lands in |
|---|---|---|---|---|
| `more_less` | More or Less | `more_less` | `/mapping` + `/latest` | done (T5) |
| `price_is_right` | The Price is Right | `price_is_right` | `/mapping` + `/latest` | T19 |
| `guess_examine` | Guess the Examine | `pick_from_list` | `/mapping` examine | T20 |
| `custom` | Host's Questions | *per question* | the host | T21 (as a random event) |
| `random_event` | Random Event | *per question* | hand-authored, one file per NPC | T22 (as a random event) |
| `bestiary` | Bestiary | `multiple_choice` | `facts/npcs.json` | T25 |
| `drop_table` | Drop Table | `multiple_choice` | `facts/npcs.json` drops | T25 |
| `odd_one_out` | Odd One Out | `multiple_choice` | `facts/items.json` properties | T26 |
| `release_order` | Release Order | `ordering` | `facts/quests.json`, `facts/npcs.json` | T27 |
| `sort_it_out` | Sort It Out | `ordering` | `facts/sequences.json`, combat levels | T28 |
| `who_said_that` | Who Said That? | `multiple_choice` | hand-authored | T29 |
| `clipped` | Clipped | `multiple_choice` | hand-authored | T29 |
| `whos_that_npc` | Who's That NPC? | `pick_from_list` | MOID renders | Phase 3 |
| `pixel_hunt` | Pixel Hunt | `pick_from_list` | MOID zoom frames | Phase 3 |

Three of these are worth the sentence that explains them:

**Sort It Out** is "put these five in the right order" for any order that is not a date:
combat level, gem tier, metal tier, quest length. **Release Order** is the same type with
dates. They stayed two modes rather than one because the splash, the prompt and the pool
differ, and one mode that sometimes asks about dates and sometimes about combat level is a
mode with nothing to say on its own splash screen.

**Who's That NPC?** is `pick_from_list`, not `multiple_choice`. Four names is a mode you can
play by elimination; a text box that only accepts a real NPC name is a mode you can only
play by knowing. That is worth the autocomplete, and it is the same affordance Pixel Hunt
needs anyway, so the modes share one type and one component. **Guess the Examine** is the
third, and the first to land (T20). It was `free_text` until the free-text version met the
roster: every item needed an alias list ("whip", "d scim", "dds"), and Levenshtein had to
settle whether a typo was a typo or a different item. A list the player picks from makes the
answer an item id, so there is nothing to spell and nothing to argue about. `free_text`
stays for the host's own questions (T21), where the answer is a clan member's name and no
list could hold it, and for the NPCs' hand-written ones (T22), whose writer lists the
spellings once. No round plays it.

**The Price is Right** keeps its own type rather than becoming `multiple_choice` with
pre-formatted strings. Its options are integers and the payload stores the subject's price
once more on its own, as `value`, so `check()` can assert that `options[answer_index]` is
the price actually stored for the subject — the consistency guarantee in the design rules
below. Without `value` the only stored price would be the answer itself, and there would
be nothing to check it against. The generator rounds `value` to two significant figures
before building the options around it, so the answer *is* the stored price rather than
something near it. Formatting them the way the game writes coins is the client's job
(`lib/gp.ts`), not something baked into the pack.

**A random event is a placement, not a round.** `custom` and `random_event` are modes
because their questions need a `mode` value and a pool of their own, and neither is ever a
round. The `random_event` mode is only where the NPCs' own questions come from. A random
event is a *placement*: a question asked outside the round it interrupts, by an NPC who
appears for it and then leaves, and a host's `custom` question is placed the same way. The
room-question row carries `random_event`, the id of that NPC. The mode and the field share
a name on purpose. A `random_event` question always carries one, and the field is what
makes any question an event.

The envelope carries an optional `random_event` too, because some questions are written
for their NPC. Every question in `data/packs/random_events/<npc>.json` belongs to the NPC
the file is named after. The file declares it once, and the loader stamps it onto each
question. A host's question may name one or leave it to the draw. Any other pack question
must not carry it, and `validate_packs.py` says so. Like every envelope field it stays out
of the content hash: the same payload asked by two NPCs is the same question. Section 1
(`selection.py`) has where events land and who asks them, section 4 has how the splash rule
changed to accommodate them, and section 3 has what the client is told.

Any type can be an event question, but three need care. `more_less` and `price_is_right`
compare prices only (`metric`), and a hand-written `ge_price` goes stale, so events use
`high_alch` or `shop_price`. `ordering` waits for T27. `pick_from_list` works, because
its list is the shared vocabulary and not the question's, but the answer must be on the
item roster, and the version worth playing (a Certer's shadowy outline) needs Phase 3's
images.

### The schema

File: `schema/question.schema.json`. Draft 2020-12. This is the canonical definition; the Pydantic models in the server and the TS types in the client are derived by hand and tested against it.

Design rules:

- Every payload carries an explicit `answer` (or `answer_index`). Derivable answers are still stored, and `validate_packs.py` checks consistency, so `grade()` never recomputes game logic.
- Numeric facts (GE price, high alch) are embedded at generation time, together with `as_of`. The pack is self-contained and play needs no dataset. Reason: Phase 1 has no dataset.
- Asset references are strings `item:<id>` or `npc:<id>`, optional everywhere. The client renders an image only if the asset exists locally (Phase 3), otherwise the name. Never a URL.
- `id` is `q_` plus the first 16 hex chars of `sha256(type + "\n" + canonical_json(payload))` where canonical JSON is sorted keys, no whitespace, UTF-8. Room questions get ids the same way at save time. `mode` is deliberately **not** in the hash: the same payload asked under two modes is the same question, and a mode rename would otherwise rewrite every id in the pack.
- Length caps live in the schema, not only in forms.
- `host_only: true` means the question is shown but nobody scores on it. Independently, the author of a `source: room` question never scores on it.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jollyboarinn.example/schema/question.schema.json",
  "title": "Question",
  "type": "object",
  "required": ["id", "type", "mode", "payload", "source", "tags"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^q_[0-9a-f]{16}$" },
    "type": {
      "enum": ["more_less", "price_is_right", "multiple_choice", "free_text",
               "closest_number", "ordering", "pick_from_list"]
    },
    "mode": { "type": "string", "pattern": "^[a-z0-9_]{1,32}$" },
    "payload": { "type": "object" },
    "difficulty": { "enum": ["easy", "medium", "hard"] },
    "source": { "enum": ["pack", "community", "room"] },
    "tags": {
      "type": "array", "maxItems": 10, "uniqueItems": true,
      "items": { "type": "string", "pattern": "^[a-z0-9-]{1,32}$" }
    },
    "author": { "type": "string", "maxLength": 64 },
    "added_at": { "type": "string", "format": "date" },
    "host_only": { "type": "boolean", "default": false },
    "random_event": { "type": "string", "pattern": "^[a-z0-9_]{1,32}$" }
  },
  "allOf": [
    { "if": { "properties": { "type": { "const": "more_less" } } },
      "then": { "properties": { "payload": { "$ref": "#/$defs/more_less" } } } },
    { "if": { "properties": { "type": { "const": "price_is_right" } } },
      "then": { "properties": { "payload": { "$ref": "#/$defs/price_is_right" } } } },
    { "if": { "properties": { "type": { "const": "multiple_choice" } } },
      "then": { "properties": { "payload": { "$ref": "#/$defs/multiple_choice" } } } },
    { "if": { "properties": { "type": { "const": "free_text" } } },
      "then": { "properties": { "payload": { "$ref": "#/$defs/free_text" } } } },
    { "if": { "properties": { "type": { "const": "closest_number" } } },
      "then": { "properties": { "payload": { "$ref": "#/$defs/closest_number" } } } },
    { "if": { "properties": { "type": { "const": "ordering" } } },
      "then": { "properties": { "payload": { "$ref": "#/$defs/ordering" } } } },
    { "if": { "properties": { "type": { "const": "pick_from_list" } } },
      "then": { "properties": { "payload": { "$ref": "#/$defs/pick_from_list" } } } }
  ],
  "$defs": {
    "asset": { "type": "string", "pattern": "^(item|npc):[0-9]{1,7}$" },
    "short_text": { "type": "string", "minLength": 1, "maxLength": 120 },
    "prompt": { "type": "string", "minLength": 1, "maxLength": 300 },
    "date": { "type": "string", "format": "date" },
    "subject": {
      "type": "object",
      "required": ["name"],
      "additionalProperties": false,
      "properties": {
        "name": { "$ref": "#/$defs/short_text" },
        "asset": { "$ref": "#/$defs/asset" }
      }
    },
    "accepted": {
      "type": "array", "minItems": 1, "maxItems": 20,
      "items": { "type": "string", "minLength": 1, "maxLength": 80 }
    },

    "metric": { "enum": ["ge_price", "high_alch", "shop_price"] },
    "priced": {
      "type": "object", "required": ["subject", "value"], "additionalProperties": false,
      "properties": { "subject": { "$ref": "#/$defs/subject" }, "value": { "type": "integer", "minimum": 0 } }
    },

    "more_less": {
      "type": "object",
      "required": ["metric", "direction", "options", "answer_index", "as_of"],
      "additionalProperties": false,
      "properties": {
        "metric": { "$ref": "#/$defs/metric" },
        "direction": { "enum": ["more", "less"] },
        "options": {
          "type": "array", "minItems": 2, "maxItems": 2, "items": { "$ref": "#/$defs/priced" }
        },
        "answer_index": { "type": "integer", "minimum": 0, "maximum": 1 },
        "as_of": { "$ref": "#/$defs/date" }
      }
    },

    "price_is_right": {
      "type": "object",
      "required": ["subject", "value", "options", "answer_index", "as_of"],
      "additionalProperties": false,
      "properties": {
        "subject": { "$ref": "#/$defs/subject" },
        "value": { "type": "integer", "minimum": 0 },
        "options": { "type": "array", "minItems": 4, "maxItems": 4, "items": { "type": "integer", "minimum": 0 } },
        "answer_index": { "type": "integer", "minimum": 0, "maximum": 3 },
        "as_of": { "$ref": "#/$defs/date" }
      }
    },

    "multiple_choice": {
      "type": "object",
      "required": ["prompt", "options", "answer_index"],
      "additionalProperties": false,
      "properties": {
        "prompt": { "$ref": "#/$defs/prompt" },
        "image": { "$ref": "#/$defs/asset" },
        "options": { "type": "array", "minItems": 2, "maxItems": 6, "items": { "$ref": "#/$defs/short_text" } },
        "answer_index": { "type": "integer", "minimum": 0, "maximum": 5 },
        "explanation": { "type": "string", "maxLength": 300 }
      }
    },

    "free_text": {
      "type": "object",
      "required": ["prompt", "accepted"],
      "additionalProperties": false,
      "properties": {
        "prompt": { "$ref": "#/$defs/prompt" },
        "image": { "$ref": "#/$defs/asset" },
        "accepted": { "$ref": "#/$defs/accepted" },
        "max_distance": { "type": "integer", "minimum": 0, "maximum": 2, "default": 1 },
        "subject": { "$ref": "#/$defs/subject" },
        "explanation": { "type": "string", "maxLength": 300 }
      }
    },

    "closest_number": {
      "type": "object",
      "required": ["prompt", "answer"],
      "additionalProperties": false,
      "properties": {
        "prompt": { "$ref": "#/$defs/prompt" },
        "image": { "$ref": "#/$defs/asset" },
        "answer": { "type": "number" },
        "unit": { "type": "string", "maxLength": 16 },
        "explanation": { "type": "string", "maxLength": 300 }
      }
    },

    "ordering": {
      "type": "object",
      "required": ["prompt", "entries", "answer"],
      "additionalProperties": false,
      "properties": {
        "prompt": { "$ref": "#/$defs/prompt" },
        "entries": {
          "type": "array", "minItems": 3, "maxItems": 6,
          "items": {
            "type": "object",
            "required": ["key", "subject", "rank"],
            "additionalProperties": false,
            "properties": {
              "key": { "type": "string", "pattern": "^[a-z0-9_-]{1,32}$" },
              "subject": { "$ref": "#/$defs/subject" },
              "rank": { "type": "integer", "minimum": 0 },
              "detail": { "$ref": "#/$defs/short_text" }
            }
          }
        },
        "answer": {
          "type": "array", "minItems": 3, "maxItems": 6, "uniqueItems": true,
          "items": { "type": "string", "pattern": "^[a-z0-9_-]{1,32}$" }
        },
        "ends": {
          "type": "array", "minItems": 2, "maxItems": 2,
          "items": { "$ref": "#/$defs/short_text" }
        },
        "explanation": { "type": "string", "maxLength": 300 }
      }
    },

    "pick_from_list": {
      "type": "object",
      "required": ["prompt", "vocab", "answer_id"],
      "additionalProperties": false,
      "properties": {
        "prompt": { "$ref": "#/$defs/prompt" },
        "vocab": { "enum": ["items", "npcs"] },
        "answer_id": { "type": "integer", "minimum": 0 },
        "image": { "$ref": "#/$defs/asset" },
        "steps": { "type": "integer", "minimum": 1, "maximum": 12 },
        "subject": { "$ref": "#/$defs/subject" },
        "explanation": { "type": "string", "maxLength": 300 }
      }
    }
  }
}
```

`ordering` stores both a `rank` per entry and an `answer` list of keys, which looks like
one fact twice and is not. `rank` is the sortable truth — quests with the same release
date share a rank, gems never do — and `answer` is the canonical display order that the
reveal shows. `grade` compares against `rank`, so two entries that tie are accepted in
either order; `check()` fails a payload whose `answer` does not sort by `rank`, and fails
one where every entry ties, because that is a question with no wrong answer. This is the
"two quests that could both be third" problem from `ideas/games.md`, and storing the tie
is the whole answer to it.

`ends` is the two labels the client writes at either end of the list, e.g.
`["Released first", "Released last"]`. Without them a drag-to-order screen does not say
which way round it wants the answer.

`pick_from_list` answers are the id of an entry in the named vocabulary, never free text:
the client only lets a selected entry be submitted, so grading is an integer comparison and
there is no normalisation to argue about. `validate_value` rejects an integer that is not
an id in the question's vocabulary with `bad_value`. `check()` fails a payload whose
`answer_id` is not in its vocabulary, or whose `subject.name` is not that entry's name, and
`validate_packs.py` runs it, so a roster edit that drops an answer fails CI rather than a
quiz night. `steps` is what makes Pixel Hunt progressive — the number of zoom frames — and
is absent for the modes that show one image. For Guess the Examine, `prompt` is the examine
text itself and `vocab` is `items`.

**Every `pick_from_list` mode answers through the same control: a strict combobox**
(`PickFromList.svelte`, a searchable dropdown). Strict means selection only — what the
player types is a search, never an answer:

- It is the WAI-ARIA combobox pattern: an input with `role="combobox"`, a `listbox` popup,
  and `aria-activedescendant` on the highlighted option.
- Focus opens the list with the whole vocabulary, alphabetical, so a player who cannot spell
  it can still scroll to it. Knowing the vocabulary gives nothing away (section 3).
- Typing filters it (`lib/vocab.ts`): case- and accent-insensitive, matching the start of
  any word in the name, so "whip" finds "Abyssal whip" and "d sc" finds "Dragon scimitar".
  Names that start with the query sort first, then alphabetical. The first match is
  highlighted.
- Arrow keys move the highlight, Enter or a tap selects it, Escape closes the list. The
  field then shows the selected name. Editing the text afterwards clears the selection.
- No match shows one line in the list saying so, and selects nothing.
- A Submit button sends the selected entry's id, and it is disabled until there is one.
  Selecting is not submitting: a mis-tap on a phone costs a second tap, not the question.
  Nothing else the control does can put free text on the wire.

Example Phase 1 pack entry:

```json
{
  "id": "q_60ccaf19df3daa78",
  "type": "more_less",
  "mode": "more_less",
  "source": "pack",
  "tags": ["prices"],
  "payload": {
    "metric": "ge_price",
    "direction": "more",
    "options": [
      { "subject": { "name": "Abyssal whip", "asset": "item:4151" }, "value": 1650000 },
      { "subject": { "name": "Dragon scimitar", "asset": "item:4587" }, "value": 60000 }
    ],
    "answer_index": 0,
    "as_of": "2026-09-01"
  }
}
```

Submitted answer values on the wire, per type (validated by `validate_value`):

| Type | `value` | Credit |
|---|---|---|
| `more_less` | integer option index | 1.0 or 0.0 |
| `price_is_right`, `multiple_choice` | integer option index | 1.0 or 0.0 |
| `free_text` | string, max 80 chars before and after normalising, no NUL or lone surrogate | 1.0 or 0.0 |
| `closest_number` | number | by rank (section 6) |
| `ordering` | array of entry keys, one per entry, no repeats | fraction in the right place |
| `pick_from_list` | integer vocabulary entry id | 1.0 or 0.0 |

Free-text grading (`questions/normalize.py`): NFKC, lowercase, strip punctuation, trim and collapse whitespace, then accept if Levenshtein distance to any accepted answer is ≤ `max_distance`, computed only within that band so grading stays linear on the event loop. Distance is capped at 0 for accepted answers shorter than 4 characters so "Jad" does not accept "Jam".

Custom questions are ordinary rows in `questions` with `source = 'room'`, `mode = 'custom'`, `author_player_id` set, and `payload` validated against this schema at room creation. Export is `SELECT` of those rows serialised back into the envelope; import is the same POST body as creation.

Pack files are `{"pack": "prices", "generated_at": "...", "questions": [ ... ]}`. One pack may hold more than one mode — `prices.json` carries both `more_less` and `price_is_right` questions, because they are generated from one fetch of the same two endpoints. `validate_packs.py` fails CI on schema errors, duplicate ids, `id` not matching content, an unknown `mode`, or a `type` that disagrees with its mode's.

## 3. Websocket protocol

Endpoint: `GET /ws/{code}`. Plain JSON text frames. Every message is `{"t": "<type>", ...fields}`. The server closes with code `4001` on a bad `hello`, `4004` unknown room -- which a room that has just been expired or deleted underneath its sockets becomes -- `4008` on any protocol error after a single `error` message. It closes with `1009` on a frame over 64 KiB, and with `1008` when no `hello` arrives within 10 s or a socket sends more than 10 messages a second after a burst of 20; the client reconnects after both.

Authentication happens in the first frame, never in the URL. The session token is the one returned by create or join, kept in `localStorage["jbi:session:" + code]`.

### Client → server

| `t` | Fields | Who | Effect |
|---|---|---|---|
| `hello` | `session: string` | all | Must be first. Attaches socket, replies `welcome`. |
| `ping` | | all | Replies `pong`. Client sends every 30 s. |
| `answer` | `question_id: string`, `value` | all | Stored if the question is open, sender has not answered, sender is allowed to score. Replies `answer_ack` or `error`. |
| `start_game` | | admin | `lobby → playing`, opens question 0. |
| `skip` | `phase`, `index: int` | admin | Ends `phase` now if the room is in it with `current_index = index`. Otherwise it was pressed on a phase that is over, and gets no reply, so a double tap ends one phase. |
| `promote` | `player_id` | admin | Sets target role to `admin`. |
| `kick` | `player_id` | admin | Deletes player row and their answers, closes their socket with `4003`. Not allowed on admins. |
| `end_game` | | admin | Closes any open question (voided), `playing → finished`. |
| `ready` | `ready: bool` | all | D7. Tap ready or take it back, in the lobby or during a splash; anywhere else is `bad_state`, and so is a second take-back on the same splash or a lobby change within a second of the last. On a splash it may bring `next_at` forward (section 4). Broadcasts `room_updated`; a change that changes nothing broadcasts nothing. |
| `set_profile` | `display_name?: string`, `avatar?: int` | all | D4. Renames the sender, re-rolls their head, or both; an omitted field is left alone. Validated exactly like a join (name rules, case-insensitive uniqueness in the room, a head id from `data/heads/heads.json`), so a rejection leaves the row as it was. Any status. A change within a second of the last is `bad_state`. Broadcasts `room_updated`; a change that changes nothing broadcasts nothing. |

### Server → client

| `t` | Fields | When |
|---|---|---|
| `welcome` | `room: RoomView`, `you: PlayerView`, `players: PlayerView[]`, `question: OpenQuestion \| null`, `your_answer: value \| null`, `standings: Standing[]`, `server_time: iso` | Reply to `hello`. Full snapshot; the client rebuilds all state from this. |
| `room_updated` | `room: RoomView`, `players: PlayerView[]` | Join, leave, connect, disconnect, promote, kick, `set_profile`, `ready`, status change, and the start of a splash. A splash the ready check hurries carries its new `next_at` here. |
| `question_open` | `question: OpenQuestion` | A question opens. |
| `answer_ack` | `question_id`, `scoring: "speed" \| "rank" \| "step"`, `band: int \| null`, `answered: int`, `of: int` | Answer committed. Never correctness. `band` is the speed bucket (1..5) for `speed`, the step it landed on for `step`, and null for `rank`, where nothing is known until everyone has answered. `answered` of `of` is the room's count with this answer in it (D8). |
| `answer_count` | `question_id`, `answered: int`, `of: int` | Somebody else answered: to every socket but the answerer's, who hears it on their ack. A count only, never who or what. `of` is every connected player who can answer plus anyone who answered and dropped. A disconnect sends no fresh count; the next answer does. |
| `question_closed` | `question_id`, `reveal: object`, `results: {player_id: PlayerResult}`, `standings: Standing[]`, `next_at: iso \| null` | Question closed. `next_at` is when the next opens; null on the last. |
| `game_finished` | `standings: Standing[]` | Final. |
| `pong` | `server_time: iso` | Reply to `ping`. |
| `error` | `code: string`, `message: string` | Any rejected message. Codes: `bad_hello`, `bad_message`, `not_admin`, `not_open`, `already_answered`, `excluded`, `bad_value`, `bad_state`, and for `set_profile` the join's own `bad_name`, `name_taken`, `bad_avatar`. |

Shared shapes:

```
RoomView      { code, status, settings, current_index: int|null, total: int, phase,
                next_at: iso|null, segment: Segment|null }
PlayerView    { id, display_name, avatar: int|null, role, connected: bool, ready: bool }
Standing      { player_id, display_name, avatar: int|null, points: int, rank: int }
Segment       { mode, index: int, total: int, start: int, count: int }
OpenQuestion  { question_id, index, total, type, mode, segment: Segment, view: object,
                random_event: string|null, opened_at: iso, answerable_at: iso,
                ends_at: iso, you_can_answer: bool, answered: int, of: int }
PlayerResult  { value, correct: bool, credit: float, points: int }
```

`Segment` is the round in progress: which mode it plays, which round of how many it is, and the positions it spans. It is grouped from the `questions.round` column, never sent from a second store of it. It rides on `OpenQuestion` as well as `RoomView` because clients patch their room from `question_open` rather than replacing it, and a round can change with no splash to announce it.

`Segment.mode` is a **mode** id, not a type id. Until Phase 2 the two were the same string; they are not any more, and the client's registry is keyed on the mode. `OpenQuestion` carries `mode` next to `type` rather than making the client reach into `segment`, because both are what picks the pair of components that draw it (`viewFor(type, mode)`), and because a round no longer carries one mode only: a random event is a question of one mode asked inside a round of another, and `OpenQuestion.mode` against `segment.mode` is the only place that difference is stated.

`PlayerResult.credit` is what `grade` returned, 0.0 to 1.0. It is on the wire for one reason: `ordering` needs to say "three of five in the right place", and the reveal is the only place that can be said. `correct` stays the boolean the scoreboard tie-break counts, and is `credit >= 1.0`.

`random_event` is the id of the NPC interrupting the round, and null for every question
nobody is interrupting. The client looks it up in `lib/randomEvents.ts` for the name,
the opening line and the asset, and draws a generic event card for an id it does not
know — the same honest fallback `viewFor` already makes for a mode this build cannot
draw. The id is on the wire rather than the copy because copy is a client concern here,
exactly as it is for modes.

`answerable_at` is when the answer affordance appears and the clock starts. It equals
`opened_at` for an ordinary question, and `opened_at + random_event_seconds` for an
event, where the NPC holds the floor with the question but without the buttons. Three
consequences, all of them the point of having the field rather than a client-side
animation:

- `ends_at` is `answerable_at` plus the question's own seconds, so an event is not two
  seconds shorter than the round it interrupts.
- `elapsed` is measured from `answerable_at` (section 6), so the theatre costs nobody a
  speed bucket.
- An answer received before `answerable_at` is rejected with `not_open`. A client that
  draws its buttons early gets nothing for it.

A reconnect during the held-back window needs no extra message: `answerable_at` is in the
`welcome` snapshot like `ends_at`, and the client counts down to it against `server_time` the
way `Timer.svelte` already counts down to the close.

### Autocomplete vocabularies

`GET /api/vocab/{name}` where `name` is `items` or `npcs`, returning
`{"vocab": "items", "version": "<16 hex>", "entries": [{"id": 4151, "name": "Abyssal whip"}]}`.
The list is built at startup and never changes while the process runs; `version` is a hash
of it so a client can tell two builds apart. `items` is `data/popular-items.json`, the
curated roster, which exists before any importer does, so Guess the Examine does not wait
for T23. `npcs` is `data/facts/npcs.json`, and is a 404 until T23 has written it. A
vocabulary with two entries of the same name refuses to load, because a player could not
tell them apart in the list.

It is a separate HTTP fetch rather than a field on `OpenQuestion` because it is the same
few hundred entries for every question of a `pick_from_list` round, and sending it per
question would put the answer list on the wire eleven times in a ten-question round. The
client fetches it once — during the splash of a round whose mode is `pick_from_list`, or at
the latest when it first meets such a question — and keeps it in memory for the session. `Cache-Control: no-store` applies as it does to all of `/api/*`;
the list is small enough that one fetch per page load is not worth an exception.

Knowing the vocabulary gives nothing away: it is every item in the roster, not the
question's options.

`total` is how many questions the room holds, counted from the rows `create` stored rather than added up off `settings.modes`. The two disagree whenever the plan and the stored set do: a mode whose pack pool ran short gives a round briefer than it asked for, and a room created before per-mode rounds carries settings that cannot describe the questions it already has. The lobby reads `total` for its summary for the same reason the progress counter does — the questions a room has are the ones it will play, and the settings are only what was asked for.

`next_at` is when the current timed phase ends — a splash gives way to its first question, a reveal to the next question — and is null while a question is open.

`view` is exactly `types.<type>.client_view(payload)`. `you_can_answer` is false for the author of a room question and for `host_only` questions.

### What the server withholds from the admin

The admin is a player with a flag. There is no admin channel.

- `question_open` and `welcome.question` are byte-identical for every socket in the room, admin included. They contain `client_view`, which never includes `answer`, `answer_index`, `accepted`, `reveal`, or raw `payload`.
- `answer_ack` carries how the question is scored and the answer's band (its speed bucket or its step) only, never correctness, for everyone.
- `answer_count` and the count on `answer_ack` and `OpenQuestion` say how many have answered, never who or what.
- Correct answers and per-player results appear only in `question_closed`, sent to everyone at the same moment.
- The list of questions selected for a room is never sent over the websocket. The admin sees `total` and `index`, nothing else.
- Custom-question exception, stated up front: any admin can see the room's own questions in the editor before the game starts, because they wrote them. Authors are excluded from scoring on those questions server-side, so seeing them buys nothing.
- HTTP `GET /api/rooms/{code}` returns `RoomView` plus players, never questions.

### Reconnect flow

Client (`lib/ws.ts`):

1. On `close` or `error`, wait `min(8000, 500 * 2^attempt)` ms plus 0–250 ms jitter, reconnect, send `hello`. Attempt resets to 0 after a `welcome`.
2. On `welcome`, replace all local state with the snapshot. If `question` is non-null, render it with the timer computed from `ends_at - server_time` (not from the local clock). If `your_answer` is non-null, show the answered state.
3. On `visibilitychange` to visible, if the socket is not open, reconnect immediately (phones lock between questions).
4. Send `ping` every 30 s; if no `pong` within 10 s, close the socket to trigger step 1.

Server (`RoomManager.connect`):

1. Look up the player by `sha256(session)` in the room; unknown → close `4001`.
2. If the player already has a socket, close the old one with `4000` and replace it (last device wins).
3. Set `connected = true`, broadcast `room_updated`, send `welcome`.
4. On socket close, set `connected = false`, broadcast `room_updated`. Player row and answers stay.

Process restart (`RoomManager.get` rehydrate):

1. Room not in memory → load `rooms` row, `players`, `questions` ordered by position, and `answers` for those questions.
2. If status is `playing` and a question has `shown_at` set and `closed_at` null, it was open at crash time: set `closed_at = now`, `voided = true`, no points. That is the "a crash costs the open question at most" guarantee.
3. Phase becomes `reveal` for the voided question with `next_at = now + reveal_seconds`, then the timer task advances normally. If no question was open, the phase is `reveal` for `current_index` with the same delay, so nobody gets a question opened on them without warning. The one question that is not behind us is one that never opened — the process died in the gap between persisting `current_index` and stamping `shown_at` — and the room is still owed it, so that reveal ends by opening it rather than advancing past it.
4. Players reconnect on their own through the client flow above.

## 4. Room lifecycle

### Room states

```
POST /api/rooms ──▶ lobby ──start_game──▶ playing ──last question closed / end_game──▶ finished
                      │                       │                                            │
                      ├───── expires_at passes: cleanup job deletes the row ───────────────┤
                      └───── the host removes it: DELETE /api/rooms/{code} ────────────────┘
```

A room is never without a host: there is no state between "does not exist" and `lobby`.

| State | Joinable | Notes |
|---|---|---|
| `lobby` | yes | Created with the room; its creator is the first admin. Players join, admins promote/kick. |
| `playing` | yes | Late joiners get `welcome` with the current question and can answer it. |
| `finished` | no | Final standings served via `welcome` for the room's lifetime. |

Transitions:

| From | Trigger | Guard | Side effects |
|---|---|---|---|
| — → `lobby` | `POST /api/rooms` | valid display name and settings, under the per-IP rate limit | allocate a code, insert the room, its questions and the admin player in one transaction |
| `lobby` → `playing` | `start_game` | sender is admin, ≥ 1 question, ≥ 1 connected player | `current_index = 0`, introduce round 0, open question 0, persist status |
| `playing` → `finished` | last question's reveal ends, or `end_game` | admin for `end_game` | void open question if any, persist status, broadcast `game_finished` |
| any → deleted | cleanup job | `expires_at < now` | `DELETE FROM rooms` cascades |
| any → deleted | `DELETE /api/rooms/{code}` | the session in the body belongs to an admin of the room | the same delete, now: sockets close with 4004 and the code is free again |

### Question sub-machine (inside `playing`)

```
(a new segment) ──▶ splash ──ready check countdown / skip──┐
                                                          ▼
pending ──open──▶ open ──timer / all answered / skip──▶ closed ──reveal_seconds / skip──▶ (next pending)
                    │  └── an event opens muted: no answer taken before answerable_at
                    └── crash recovered / end_game ──▶ voided
```

Room `phase` mirrors this: `idle` (lobby/finished), `splash`, `open`, `reveal`.

The splash introduces a *segment*: it runs before a segment's first question and before no other question. It used to be phrased as "before a question whose mode differs from the one before it", which was the same rule until random events existed and is now wrong twice over — an event would get a splash it must not have, and the question after the event would get a second splash for a mode already introduced. Segments come from `segments.py`, which groups an event into the round it interrupts, so "the first question of a segment" is the phrasing that survives contact with them. An event gets no introduction at all: that is what makes it an interruption, and the NPC card is its own announcement. It writes nothing — `current_index` was persisted before it ran and `phase` has never been a column — which is why a crash during one is a crash before a question that never opened, the case recovery already handles.

| Transition | Trigger | Side effects |
|---|---|---|
| `(new segment) → splash` | timer task, before a segment's first question, unless `splash_seconds` is 0 | `next_at = null` (it waits for the room), every player's `ready` cleared, broadcast `room_updated`; no write |
| `splash → splash` (recounted) | a `ready`, connect, disconnect or kick during a splash | `rooms/ready.py`: the threshold reached with nothing running → `next_at = now + 10s`; everyone eligible ready → `min(next_at, now + 3s)`; an un-ready below the threshold → `next_at = null`; broadcast `room_updated`; no write |
| `pending → open` | timer task, or `start_game` for index 0 | `UPDATE questions SET shown_at = now`, `answerable_at` = `shown_at` plus `random_event_seconds` for an event and `shown_at` otherwise, `ends_at` = `answerable_at` plus the round's own `seconds` (clamped to the type's `SECONDS`), broadcast `question_open`, schedule close |
| `open → closed` | `ends_at` reached; or, with `close_when_all_answered`, an answer, disconnect or kick leaves every connected player who can answer answered; or admin `skip` | grade all answers, then `UPDATE questions SET closed_at = now` and `UPDATE answers SET correct, points` in one transaction, compute standings, broadcast `question_closed` with `next_at = now + reveal_seconds`, schedule advance |
| `closed → next pending` | `next_at` reached or admin `skip` | `current_index += 1`, persist; if past the end → `finished` |
| `open → voided` | restart recovery, `end_game` | `closed_at = now, voided = true`, no grading |

**The ready check (D7).** Each player carries an in-memory `ready` flag, on `PlayerView`. In the lobby it is what the host's Start waits on — the client offers "Start anyway" short of the threshold, and the server does not refuse it, because that is the host's override. `start_game` clears it. On a splash it is the ready check from section 7.1 of `ideas/design.md`: *eligible* is every connected player who can answer the round's first question, the threshold is `min(ceil(0.8 × eligible), eligible - 1)` with a room of one at 1, and the splash has no clock until it is reached — then a countdown runs as in the table above. A running countdown is never pushed back; only an un-ready can stop it, and each player gets one un-ready per splash (a second is `bad_state`, so the button cannot be spammed), never a connect or a disconnect, and a disconnect lowers the threshold instead of stalling the round. The host's `skip` ends a splash whether it is waiting or counting. The timer task sleeps through a splash to whatever `next_at` currently says, or indefinitely while it is null: changing it sets `Room.rescheduled`, which wakes the task to sleep again to the new time. The flag is never persisted, so a restart costs one tap — the same as the splash it replays.

Single timer task per room: `Room.timer` is one `asyncio.Task` running `_run_questions` which does open → sleep-until-close → close → sleep-until-advance → next. `skip` cancels the sleep via an `asyncio.Event`, not by cancelling the task, and each phase clears the event as it starts. Early close on all-answered sets the same event. Each deadline also lives on the manager's monotonic clock, and the task sleeps `max(0, deadline - now)` on that clock, so a late wakeup closes immediately instead of drifting and a wall-clock jump moves nothing; `ends_at` and `next_at` are for the wire. A step that raises drops the room from memory and closes its sockets with 1012; the reconnects rehydrate it as after a restart (section 3), which voids a question the failure left open.

### Room settings (`rooms.settings` jsonb)

```json
{
  "modes": [                       // a mode is a round: this list is the rounds, one each
    {"mode": "more_less", "questions": 10, "seconds": 10}
  ],
  "mode_order": "listed",          // "listed": the order above; "random": shuffled at creation
  "random_event_frequency": "default", // one event per 20 / 10 / 5 round questions: "less" / "default" / "more"
  "reveal_seconds": 8,             // 2..30
  "splash_seconds": 8,             // 0..30: 0 turns the round intro off, anything else on (D7: not a length)
  "random_event_seconds": 2,       // 0..10, the NPC holds the floor this long before the buttons
  "close_when_all_answered": true,
  "max_players": 50
}
```

`modes[].mode` is a key into `MODES`, not into `TYPES`. A host picking Drop Table and
Bestiary is picking two rounds that happen to share the `multiple_choice` type, and the
settings never mention that type: the create form lists modes, the splash introduces
modes, and the only place the type shows up is inside the question.

`custom` and `random_event` never appear in `modes`, and neither is a round. Their
questions are random events: `selection.py` drops each of them inside a round it does not
belong to, one per window of `EVENT_EVERY[random_event_frequency]` round questions (section
1). The host's own take slots rather than adding to them, so the slot count at the chosen
frequency is their cap, and a room asking for more is refused at creation —
`NewRoomSettings` names the count, the limit and the frequency, because a host who loses
two of their five questions to a silent truncation finds out during the game. Both modes
keep only `seconds`, the length of one such question. A stored room from before T22 may
say `random_events` instead; `RoomSettings` reads it as the frequency it meant.

There is no room-wide round count and no room-wide question length. The number of rounds is the number of modes picked — one mode is one round, six modes are six rounds — and each round's `questions` and `seconds` are its own, because those two numbers are the ones modes differ most in: `more_less` is a long round of short questions, where a release-date round will be a short one of long questions. Both default to what the mode's type module says (`QUESTIONS` / `SECONDS`, section 1) and are held to its range; `GET /api/modes` serves that to the create form, which offers each mode's default and gates its own submit button on the same bounds — `min` and `max` on a number input are a nudge a host can type past, so the form checks every round's two numbers itself and marks the one out of range under the field where its range is already written. A mode may appear only once, and a room may not ask for more than 100 questions over all of its rounds — random events included, since they are questions the room will play.

Settings are fixed at creation. Editing settings in the lobby is not in Phase 1.

The ranges above are what a host may ask for, and they are checked where the request
arrives (`NewRoomSettings` in `rooms/settings.py`). The stored model keeps only what the
game loop cannot work without, so a room created under one set of bounds still loads
after the bounds change — `seconds_for` clamps it into today's range rather than refusing
it — and the tests can run a whole game on one-second questions.

## 5. SQL schema

`server/app/migrations/0001_init.sql`:

```sql
create table schema_migrations (
    version    integer primary key,
    applied_at timestamptz not null default now()
);

create table rooms (
    id                     uuid primary key default gen_random_uuid(),
    code                   text not null,
    status                 text not null check (status in ('lobby', 'playing', 'finished')),
    settings               jsonb not null,
    current_index          integer,                    -- index into questions.position, null before start
    creator_ip             inet,
    created_at             timestamptz not null default now(),
    expires_at             timestamptz not null
);
create unique index rooms_code_idx on rooms (code);
create index rooms_expires_at_idx on rooms (expires_at);

create table players (
    id                 uuid primary key default gen_random_uuid(),
    room_id            uuid not null references rooms (id) on delete cascade,
    display_name       text not null check (char_length(display_name) between 1 and 24),
    avatar             smallint check (avatar >= 0),     -- 0005: a head id; null = derived
    session_token_hash text not null,
    role               text not null default 'player' check (role in ('player', 'admin')),
    joined_at          timestamptz not null default now(),
    last_seen_at       timestamptz not null default now()
);
create unique index players_session_idx on players (session_token_hash);
create unique index players_room_name_idx on players (room_id, lower(display_name));

create table questions (
    id               uuid primary key default gen_random_uuid(),
    room_id          uuid not null references rooms (id) on delete cascade,
    position         integer not null,
    question_id      text not null,                    -- content id from the schema, q_...
    type             text not null,                    -- how it is answered
    mode             text not null,                    -- 0006: which round it belongs to
    source           text not null check (source in ('pack', 'community', 'room')),
    payload          jsonb not null,                   -- full envelope minus id/type/source
    host_only        boolean not null default false,
    round            integer not null default 0,       -- 0003: which round this belongs to
    random_event     text,                             -- 0007: the NPC asking it; null if not one
    author_player_id uuid references players (id) on delete set null,
    shown_at         timestamptz,
    closed_at        timestamptz,
    voided           boolean not null default false,
    unique (room_id, position)
);

create table answers (
    id          bigserial primary key,
    question_id uuid not null references questions (id) on delete cascade,
    player_id   uuid not null references players (id) on delete cascade,
    value       jsonb not null,
    received_at timestamptz not null default now(),
    correct     boolean,                               -- null until the question closes
    points      integer,                               -- null until the question closes
    unique (question_id, player_id)
);
create index answers_player_idx on answers (player_id);
```

Notes:

- Session tokens are stored hashed. A DB dump never yields a usable session.
- `points` is written once at close and is the only thing standings read: `SELECT player_id, coalesce(sum(points), 0) FROM answers ... GROUP BY player_id`. In memory the same sum is kept per room and rebuilt from this query on rehydrate, so the table stays the source of truth.
- `questions.payload` stores the type-specific payload and the envelope extras (`tags`, `difficulty`, `author`, `added_at`); `type`, `mode`, `source`, `host_only`, `question_id` are columns because queries, grading and round grouping need them.
- `0002_drop_admin_tokens.sql` removes `admin_token_hash`, `admin_token_consumed_at` and the `created` status: the creator is the admin, so there is nothing to claim.
- `0003_question_rounds.sql` adds `questions.round`. A room's rounds are grouped back out of it by `rooms/segments.py`; the default of 0 makes every room that predates it a single round, which is what it was.
- `0004_per_mode_rounds.sql` rewrites `rooms.settings` in place: out go `question_seconds`, `question_count` and `questions_per_round`, and `modes` stops being a list of names and becomes a list of `{mode, questions, seconds}` carrying the old globals. A room created by the previous release keeps playing — its rounds are already in `questions.round` — and `mode_order` is `listed` for it, because there is nothing left to shuffle.
- `0005_player_avatar.sql` (D4) adds `players.avatar smallint`, a head id from `data/heads/heads.json`, whose index is the contract. Nullable on purpose: null is a player who never chose, drawn with the head their id hashes to, so every player from before it still has a face and a spread of them. The upper bound is the manifest's length, which grows without a migration, so the server checks it before writing rather than the column.
- `0006_question_mode.sql` adds `questions.mode text not null`, backfilled from `type`. That backfill is exact rather than a best guess: every room that predates it plays `more_less` only, where the mode id and the type id are the same string. After it, `type` answers "how is this answered" and `mode` answers "what is this round", and `segments.py` groups on `mode` — it cannot derive one from the other any more, which is the point.
- `0007_random_events.sql` adds `questions.random_event text` and rewrites
  `rooms.settings` once more: out goes `order`, in go `random_events` and
  `random_event_seconds`. A room created by the previous release keeps its custom round
  exactly as it is — those rows carry their positions and their `round` already, and
  selection never runs twice — so the migration can drop `order` without caring what it
  said.
- `suggestions` (Phase 6) is not created now. It will be `0003_suggestions.sql` when needed.
- Cleanup: `DELETE FROM rooms WHERE expires_at < now()`, run by an `asyncio` task in the app every `ROOM_CLEANUP_INTERVAL_SECONDS` (default hourly, which is fine grain against a 30-day TTL), starting with one pass at startup so a deployment that restarts often still cleans up. No external cron. The task never dies: a failed pass is logged and the next one runs on schedule. `RoomManager.purge_expired` runs it and then drops the same rooms from memory, so the process does not hold rooms the database no longer has.
- A host does not have to wait for that. `DELETE /api/rooms/{code}` with `{session}` in the body -- never in the URL, section 7 -- deletes the room on the spot when that session belongs to an admin of it: the front page lists the rooms this browser created and each one has a Remove button. Anybody still connected is closed with 4004, and the code is back in circulation.

## 6. Scoring

All timing is server-side, on the monotonic clock, from when the answer arrives rather than
when it gets the room lock: `elapsed = received_at - answerable_at`, which is `shown_at`
for every question but a random event, where the NPC holds the floor for
`random_event_seconds` first (section 3). The client never sends a time.

### Credit, then points

Grading happens in two halves, and the split is what lets seven types share one scoreboard.

`grade()` returns **credit**: a float from 0.0 to 1.0 per player, and nothing else. Right is
1.0, wrong is 0.0, and `ordering` is the only type that returns anything between — the
fraction of entries a player put in the right place. A type knows whether an answer was
good. It does not know what that is worth.

`scoring.py` turns credit into points, and which of three ways it does that is the type's
`SCORING`:

| `SCORING` | Points | Types |
|---|---|---|
| `SPEED` | `round(bucket_points × credit)` | `more_less`, `multiple_choice`, `price_is_right`, `free_text`, `ordering` |
| `RANK` | `round(1000 × credit)` | `closest_number` |
| `STEP` | `round(step_points × credit)` | `pick_from_list` |

One multiplication, three tables. A type that wants a fourth way to be scored adds a
`Scoring` member and a table, and touches nothing else.

`STEP` falls back to `SPEED` when the payload has no `steps`, which is why `points_for`
takes both the band and the steps. `pick_from_list` serves modes that want different
things: Pixel Hunt zooms out over eight frames and should pay for answering on frame two,
Who's That NPC? and Guess the Examine show one thing and should pay for answering quickly.
One type, one `SCORING`, and the payload decides — rather than two near-identical types, or
a Guess the Examine where everyone who knows the answer scores the same 1000 whether they
took two seconds or twenty. `answer_ack` says `speed` for such a question too, with the bucket as its band,
so a client is never told a step number for a question that has no steps.

`correct` — the boolean stored on the answer row and counted in the standings tie-break —
is `credit >= 1.0`. A player who put three of five quests in the right order scores for it
and does not get a "correct" out of it, which is the honest reading of both.

### Speed buckets (`SCORING = SPEED`)

`fraction = elapsed / the question's own seconds`, computed once at receive time and stored in memory with the answer; the bucket is sent back in `answer_ack` as its `band`.

| Bucket | Fraction of question time | Points if correct |
|---|---|---|
| 1 | ≤ 0.10 | 1000 |
| 2 | ≤ 0.25 | 900 |
| 3 | ≤ 0.50 | 800 |
| 4 | ≤ 0.75 | 700 |
| 5 | ≤ 1.00 | 600 |

For a 30-second question: 0–3 s, 3–7.5 s, 7.5–15 s, 15–22.5 s, 22.5–30 s. Wrong answer or no answer: 0. An answer arriving from `ends_at` on is rejected with `not_open` and never scored, even if the close runs late.

The bucket boundaries are fractions, so a quick round and a slow one in the same game are each scored on how fast you were for that round. No RTT compensation; the coarse first bucket makes 50–150 ms irrelevant.

Partial credit rides on the same buckets: a player who got three of five orderings right in
bucket 2 scores `900 × 0.6 = 540`. Being fast is still worth more than being slow, and being
right is still worth more than being fast.

### Rank (`SCORING = RANK`)

`closest_number` ranks answers by `abs(value - answer)`; ties share the better rank. There is
no speed component, because the closest guess should win whether it arrived first or last.
The type's `grade` returns the credit below and `scoring.py` multiplies by 1000.

| Rank | Credit | Points |
|---|---|---|
| Exact match | 1.0 | 1000 |
| 1st closest (not exact) | 0.8 | 800 |
| 2nd | 0.6 | 600 |
| 3rd | 0.4 | 400 |
| Everyone else who answered | 0.2 | 200 |
| No answer | — | 0 |

### Steps (`SCORING = STEP`)

For a question that shows more of itself as time runs out — Pixel Hunt zooming out frame by
frame. The question is open for its round's `seconds` and its payload says how many `steps`
that time is divided into, so step `k` is on screen from `(k-1) × seconds/steps` to
`k × seconds/steps`. The server computes which step an answer landed on from `received_at`;
points fall linearly from 1000 on the first step to 400 on the last:

```
step_points(k, steps) = round(400 + 600 * (steps - k) / (steps - 1))
```

Eight steps gives 1000, 914, 829, 743, 657, 571, 486, 400. `steps = 1` returns 1000 rather
than dividing by zero, and a payload with no `steps` at all is scored on speed instead (see
above) — a question that never changes has nothing to be early about.

**There is no `question_update` message, and there does not need to be one.** The step
schedule is a pure function of `opened_at`, `ends_at` and `steps`, all three of which the
client already has, so every client advances the image on its own clock against a server
timestamp — exactly as `Timer.svelte` already counts down. The frames for all steps are
preloaded when the question opens. Keeping the schedule derived rather than pushed means a
client that reconnects mid-question lands on the right step from the `welcome` snapshot
with no extra message, and a dropped frame cannot desynchronise anyone from the scoring,
because the scoring never looked at what the client was showing.

### Exclusions

- `host_only` question: nobody scores; the question still shows and closes normally.
- `source: room` question: `author_player_id` cannot answer (`excluded` error) and scores 0.
- Kicked players: rows deleted, so they vanish from standings.
- A random event is graded like anything else: the author of a custom one still cannot answer
  it, a pack-drawn one scores for everybody, and the two seconds before the buttons appear
  are outside `elapsed` for all of them.

### Standings

Sorted by total points desc, then by number of correct answers desc, then by `joined_at` asc (stable, explained on the final screen as "earliest to join wins ties"). `rank` is dense.

`scoring.py`:

```python
BUCKETS = [(0.10, 1000), (0.25, 900), (0.50, 800), (0.75, 700), (1.00, 600)]
RANK_TOP = 1000
STEP_TOP, STEP_BOTTOM = 1000, 400

def bucket(elapsed_s: float, question_s: int) -> int          # 1..5, clamps to 5
def step(elapsed_s: float, question_s: int, steps: int) -> int  # 1..steps, clamps
def step_points(step: int, steps: int) -> int                   # clamps step into 1..steps
def effective(scoring: Scoring, steps: int | None) -> Scoring   # STEP without steps is SPEED
def band(scoring: Scoring, elapsed_s: float, question_s: int, steps: int | None) -> int | None
def points_for(scoring: Scoring, credit: float, band: int | None, steps: int | None) -> int
```

`points_for` is the one entry point the close calls, and it is where the table above
lives. `band` is its counterpart at receive time: `submit_answer` needs the bucket or the
step for `answer_ack` before anything has been graded, and `band` picks which of `bucket`
and `step` to ask, or answers `None` for `RANK`. `effective` is what `answer_ack.scoring`
carries, so the fallback above is stated once. `points_for` refuses credit outside 0..1
rather than paying 1200 for a type's bug.

## 7. Identity: who you are, and what never goes in a URL

Goal: the creator of a room is its first admin; every identity is a session token that only travels in a POST response body and the first websocket frame; and there is no second kind of token to lose.

1. **Create.** Client `POST /api/rooms` with `{display_name, settings, custom_questions: []}`.
2. **Server** (`RoomManager.create`), one transaction:
   - Normalise the display name first — NFKC, trimmed, runs of spaces made one, then 1–24 Latin letters (accents included), digits, spaces, `_` and `-` → `422 bad_name` before a single row exists, and before the rate limiter is consulted. The limiter records a hit on every call it allows, so validating afterwards would let a handful of typos cost a host their hourly quota.
   - Rate limit: `ratelimit.py` keeps `{key: deque[timestamps]}` in memory, keyed on the IPv4 address or the IPv6 /64; more than `ROOMS_PER_IP_PER_HOUR` → `429`.
   - Generate `code`: random entry from `data/room-words.json`, uppercase, retry on unique violation up to 5 times (a savepoint per attempt), then append two random digits.
   - Insert the room with `status = 'lobby'` and `expires_at = now + ROOM_TTL_DAYS`. There is no `created` state: a room and its host are born together.
   - Insert the creator as a player with `role = 'admin'` and `session_token = secrets.token_urlsafe(32)`, storing only its sha256. This insert sits outside the code-allocation savepoint on purpose — that savepoint reads a unique violation as "code taken, try another", and `players_session_idx` is unique across every room, so a collision there would otherwise be retried as a code collision until the allocator gave up.
   - Select questions (`selection.py`) and insert `questions` rows now, so the set is fixed at creation.
   - Respond `201 {code, session, player}`. The plaintext session is returned exactly once and never logged. Anything that fails rolls all of it back: no room without a host, and no half-built room to garbage-collect.
3. **Client** stores `localStorage["jbi:session:" + code] = session`, appends `code` to `localStorage["jbi:created"]` (list, for the "your rooms" view), and navigates to `/r/{code}`.
4. **Room page** opens the websocket and sends `hello {session}`. Admin capabilities are decided per message from `player.role`, never from the URL and never from anything the client asserts about itself.

Both take an optional `avatar` beside the name (D4); left out, the player's head is derived from their id. Join is the same shape with a narrower result: `POST /api/rooms/{code}/join {display_name, avatar?}` → `200 {session, player}` with `role = 'player'`, stored and used identically.

Follow-ups covered by the same mechanism:

- A further admin: an existing admin sends `promote`. A second device for the host is an ordinary `join` from that device followed by a `promote` from the first. There is no admin link, and no way to become an admin except creating the room or being promoted.
- Lost admin session (cleared storage): any remaining admin promotes them again. If the only admin is gone, the room is stuck; Phase 4 adds a recovery path, Phase 1 accepts this. It is a narrower window than it was, since the host's session is written the moment the room exists rather than one navigation later.

Headers on every response (`main.py` middleware): `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a `Content-Security-Policy` of `default-src 'none'` widened only to `'self'` per directive (plus `img-src data:`), and `Cache-Control: no-store` on `/api/*`. The built client has no inline script or style, so the policy needs no `unsafe-inline`; `connect-src 'self'` covers the same-origin websocket. Uvicorn access log format is overridden to log path without query string.

No HSTS from the app: TLS terminates at the reverse proxy, and a self-hoster serving plain HTTP on a LAN would lock themselves out. It belongs in the proxy config.

The container runs read-only with `cap_drop: ALL` and `no-new-privileges`, as uid 10001 against root-owned application files -- nothing under `server/app/` writes to disk, and the process cannot rewrite the code it runs. Trusted reverse proxies come from `FORWARDED_ALLOW_IPS`, which uvicorn reads directly; it defaults to loopback, so `X-Forwarded-For` is believed only from an address the operator names. `ROOMS_PER_IP_PER_HOUR` keys on the resulting client address, and the first ignored `X-Forwarded-For` logs one warning naming the sender.

Resource caps: uvicorn runs with `--ws-max-size 65536` and `--limit-concurrency 1000`, and `/api/*` bodies over 256 KiB get `413 too_large` before FastAPI parses them.

Deviation from plan.md: created rooms are tracked in localStorage instead of a cookie. Reason: the server needs no cookie, and one storage mechanism on the client is enough.

**Why the admin link is gone.** It existed to defer "what is your name?" until after the room was made, and it cost a `created` state, two token columns, a single-use secret in a URL fragment, a claim endpoint, a screen, and a `PUBLIC_BASE_URL` that had to be reachable from the host's own browser. Asking for the name on the create form removes all of that for one extra field. Nothing that was secret before is less secret now: a session token has always travelled in a POST response body and a websocket frame, never in a URL.

## 8. Phase 1 task list

Each task fits one working session and ends with a green CI run. Phase 0 is tasks 1–2.

DONE: **T1. Repo scaffold.** `server/` with `uv`, FastAPI hello endpoint, `ruff`, `pytest`; `client/` with Vite + Svelte + TS, `svelte-check`; `Makefile` targets `dev`, `test`, `lint`; `.env.example`; CI workflow running lint and tests for both.
Accept: `make lint test` passes locally and in CI; `make dev` runs server on :8000 and client on :5173 with proxy.

DONE: **T2. Containers.** Multi-stage `Dockerfile`, `docker-compose.yml` with `app` and `postgres:18` and a named volume, healthcheck on Postgres, `config.py` reading all env vars from section 1.
Accept: `docker compose up` on a clean checkout serves the client at `http://localhost:8000` and `/api/health` returns `{"ok": true, "db": true}`.

DONE: **T3. Migrations.** `db.py` pool + runner, `0001_init.sql` from section 5, run at startup in `lifespan`.
Accept: fresh DB gets all tables; second start is a no-op; a test applies migrations against a throwaway database (`pytest` fixture using `DATABASE_URL_TEST`).

DONE: **T4. Question schema and packs.** `schema/question.schema.json` from section 2; `questions/schema.py` with `validate()` and `content_id()`; `packs.py` loader; `scripts/validate_packs.py` wired into CI; `questions/types/more_less.py` with all four functions.
Accept: a hand-written `data/packs/sample.json` with 5 more/less questions validates; a mutated `answer_index` fails the consistency check; `content_id` is stable across key order; unit tests for `client_view` (no `answer` key) and `grade`.

DONE: **T5. Price question generator.** `scripts/gen_price_questions.py` → `data/packs/prices.json`. `make gen-price-questions`.

The pair window is 1.25x..4x: `more_less` shows no values at all, so a wide gap is still a real question about what things cost, while a pair inside 1.25x is a coin flip however well you know the game.

`data/popular-items.json` is the pool, and it is not only T5's. It is the project's curated roster of items a player recognises by name, and later modes in `games.md` draw on the same file: guess-the-examine wants the examine text, zoom quiz wants the render, the answer autocomplete is built from it. T5 is just the first consumer.

Endpoints `/mapping` and `/latest`, one request each, descriptive User-Agent. `/latest` is an object keyed by item id — no ordering and no volume field, so there is nothing to sort on there.

Accept: produces +- 100 valid questions; `validate_packs.py` passes on the output; the script is idempotent and never runs at app startup or ci.

DONE: **T6. Room creation.** `rooms/codes.py`, `data/room-words.json` (see Needs decision), `http/rooms.py` with `POST /api/rooms`, `GET /api/rooms/{code}`; `ratelimit.py`; `rooms/selection.py`; the `create` method of `RoomManager`, inserting the room, its questions and its admin player at creation.
Accept: integration tests cover: create returns `{code, session, player}` and the creator is the room's admin; a bad display name creates no room row and costs no rate-limit quota; a failed admin insert leaves no room; sixth create from one IP in an hour is `429`; `questions` rows equal what the picked modes asked for; code collision retry is unit-tested with a stubbed word list.

DONE: **T7. Join.** `POST /api/rooms/{code}/join {display_name}` → `RoomManager.join`; name rules as in section 7, unique per room case-insensitively on the normalised name.
Accept: join a `finished` room → `409 not_open`; duplicate name → `409`; over `max_players` → `409`; success returns a session; player appears in `GET /api/rooms/{code}`.

DONE: **T8. RoomManager core and websocket handshake.** `rooms/state.py` with `Room`, lock, `get` with rehydrate, `connect`/`disconnect`; `ws/protocol.py` models; `ws/handler.py` with `hello`/`welcome`/`ping`/`pong`/`room_updated`/`error`.
Accept: test client connects, sends `hello`, gets `welcome` with `players` and `you`; second socket for the same player closes the first with `4000`; bad session → `4001`; disconnect flips `connected` in a broadcast to the remaining socket; a room evicted from memory (test hook) rehydrates identically.

DONE: **T9. Game loop.** `start_game`, the timer task, `question_open`, `submit_answer` with DB write before `answer_ack`, `question_closed`, auto-advance, `game_finished`, `skip`, `end_game`, `promote`, `kick`.
Accept: with one-second questions and `reveal_seconds = 1`, a 3-question room runs to `finished` unattended in a test; answer after close → `not_open`; second answer → `already_answered`; all-answered closes early; non-admin `start_game` → `not_admin`; `skip` during open closes within 100 ms.

DONE: **T10. Scoring and standings.** `rooms/scoring.py` from section 6; grading at close writes `correct` and `points`; standings computed from the answers sum; `results` in `question_closed`; `host_only` and author exclusion enforced (author exclusion has no callers until Phase 2 but is tested now).
Accept: table-driven tests for every bucket edge (exactly 0.10, 0.1001, > 1.0 clamps to bucket 5); standings tie-break order tested; sum in memory equals `SUM(points)` from the DB after each close.

DONE: **T11. Restart recovery.** Rehydrate path for `playing` rooms: void the open question, resume in `reveal`, timer task restarts.
Accept: test starts a game, kills the manager mid-question (drop the in-memory room, cancel its task), calls `get`, and asserts the question is `voided`, players reconnecting receive `welcome` with `question = null` and `phase = reveal`, and the next question opens after `reveal_seconds`.

DONE: **T12. Client: create, join, lobby.** `api.ts`, `session.ts`, `ws.ts` with reconnect and ping per section 3, `Home`, `Create` (name field, settings form, modes checkboxes, no custom editor), `Join`, `Lobby` with the player list, the copyable link for players and admin controls (start, promote, kick).
Accept: manual run-through in two browsers: create → the creator lands in the lobby as host → join from the second → both see each other → refresh either → still in lobby with the same identity; DevTools shows no token in any request URL or the address bar.

DONE: **T13. Client: play screen.** `Room.svelte` state machine on `phase`, `Timer` driven by `ends_at` and `server_time`, `Splash.svelte` and one component per question type behind `questions/index.ts`, answered state with buttons disabled, reveal with the correct answer highlighted and per-player result, `Scoreboard` between questions, final standings screen.
Accept: a full 10-question game with 3 browsers finishes and shows identical standings on all three; locking a phone for 20 s and unlocking mid-question shows the running question with the right remaining time; wrong answers show 0, correct show the bucketed points.

**T14. End-to-end in containers.** Run T12/T13's manual flow against `docker compose up` from a clean clone; fix anything environment-specific (base URL, proxy headers, websocket upgrade through uvicorn); write `README.md` quick start.
Accept: a clean machine following only the README reaches a finished game; `docker compose down && up` mid-game recovers per T11.

**T15. Load test.** `scripts/loadtest.py`: 30 bot players join one room, answer every question at random times, one bot reconnects every question.
Accept: 30 questions at ten seconds each complete with zero `error` messages, p99 `answer` → `answer_ack` under 200 ms on localhost, no lock contention warnings, and the answers table has exactly the expected row count.

After T15, Phase 1 is a playable night.

## 9. Phase 2

The task list is `ideas/phase2.md` (T16–T29), and the prompt to hand each task to lives in
`ideas/phase2-prompts.md`. This section says only what Phase 2 changes about the design
above, because the version of this sentence that stood here before was wrong and worth
saying so:

> Phase 2 starts with the custom-question editor and the remaining Phase 2 types, which
> only add `types/*.py` modules, Svelte components, and the editor UI; no protocol or
> schema changes.

That held for the five types it had left to build. It does not hold for
the modes in `ideas/games.md` as they stand now, and three of them are why:

- **Sort It Out** and **Release Order** answer with an *ordering* and score on partial
  credit, which the old `grade() -> bool` could not express and the old `points_for(correct,
  bucket)` could not pay out.
- **Pixel Hunt** changes what it shows while it is open and scores on how early you
  answered, not how fast — a second scoring model, and nearly a second protocol (section 6
  explains why it turned out not to need one).
- **Guess the Examine**, Who's That NPC? and Pixel Hunt answer from a closed vocabulary of
  a few hundred entries, which is not something to put on the wire per question, through a
  combobox that only submits an entry of it.
- **Random events** (`ideas/IDEAS.md`, and T22) put a question of one mode inside a round of
  another, which "a round is a mode" could not express, and hold the answer affordance back
  behind the NPC asking it, which nothing on the wire could say. They also retired
  `settings.order` and the custom round it placed. From T22 the NPCs bring questions of
  their own (the `random_event` mode, one file per NPC), and a host may name who asks theirs.

So Phase 2 changes: the schema (`mode`, the optional envelope `random_event`, `ordering`, `pick_from_list`, which
`guess_examine` is the first mode on), the protocol (`answer_ack`, `OpenQuestion.mode`,
`PlayerResult.credit`, `OpenQuestion.random_event`, `answerable_at`, `GET /api/vocab`),
the SQL (`0006_question_mode.sql`, `0007_random_events.sql`), and the scoring model
(credit, then points). All of it is in the sections above. T16–T18 land exactly that
much and add no modes, which is what makes T19 onwards a mode each.

**What Phase 2 does not touch**, and should not: the room state machine (section 4's
first half), identity and sessions (section 7), the reconnect and rehydrate flows
(section 3), and the one-lock-per-room rule. Random events reach into the question
sub-machine for two things — which question gets a splash, and when the buttons appear —
and nothing else: no new phase, no new column beyond `questions.random_event`, and
`answerable_at` derived from `shown_at` rather than stored, so rehydrate is exactly what
it was. Every new mode is still a pack, a generator, a registry entry and at most two
components.

### Data pipeline

Two stages, because fetching is slow, polite and online, and generating is fast,
deterministic and offline.

```
wiki APIs ──make fetch-facts──▶ data/facts/*.json ──make gen-packs──▶ data/packs/*.json
  (network, monthly, manual)      (committed)        (offline, pure)     (committed)
```

- **`make fetch-facts`** (`scripts/fetch_facts.py`) is the only thing that talks to the
  wiki. One request per second, a descriptive User-Agent with contact details,
  `If-Modified-Since`, resumable. It writes `data/facts/*.json` and a `manifest.json` of
  source, `fetched_at` and sha256 per file. Never runs at app startup, in CI, or during a
  quiz — the same rule `gen_price_questions.py` has had since T5.
- **`make gen-packs`** (`scripts/gen_packs.py`) reads only `data/facts/` and the roster and
  writes `data/packs/`. No network, seeded RNG, output a pure function of its input.
  `make gen-packs CHECK=1` regenerates into a temporary directory and diffs, and CI runs
  that: a generator changed without its pack regenerated fails the build, which is the
  failure mode a committed generated file always has.
- Both facts and packs are **committed**. Images are not, and stay Phase 3 — a selfhoster
  runs the importer under their own User-Agent, as `ideas/plan.md` requires.
- `data/facts/README.md` carries the OSRS Wiki attribution and the CC BY-NC-SA notice that
  committing derived wiki content requires.

Why a facts layer at all, when section 2 says a pack must be self-contained: the two rules
are about different files. A *pack* embeds its facts so that play needs no dataset, and that
does not change. `data/facts/` is what the *generators* read, so that adding a mode is an
offline afternoon rather than another crawl of the wiki, and so that a generator's output can
be reproduced — and diffed in CI — without a network call.

## 10. Versioning

The version counts the work. **0.1.0** is the first playable build: T1–T19 and D1–D5, D7 and
D8.

| Change | Bump | Example |
|---|---|---|
| A T task (`ideas/phase2.md`) or a D task (`ideas/design.md`) | minor | 0.1.0 → 0.2.0 |
| Anything else: a fix, an item off `ideas/IDEAS.md`, docs, CI | patch | 0.2.0 → 0.2.1 |

- **Semver, not decimals.** After 0.9.0 comes 0.10.0. About 35 tasks remain, and decimal
  arithmetic would reach 1.0 partway through Phase 2 without anyone deciding it. **1.0 is a
  decision the owner makes**, never the result of counting tasks.
- **One bump per task, even when a session does several.** T31 + T32 + T34 is three minor
  bumps, so the version keeps counting tasks. A patch bump resets to `.0` on the next
  minor.
- **Bump in the branch that does the work**, as part of the task, not afterwards. Two
  branches that both bump will conflict on `VERSION`. That is on purpose: whichever merges
  second rebases and takes the next number, so versions follow merge order.

**Where it lives.** `/VERSION` at the repo root is the single source: one line, `X.Y.Z`, no
`v`. `server/pyproject.toml` and `client/package.json` carry copies, and
`server/tests/test_version.py` fails if either drifts. The client reads `/VERSION` at build
time (`__APP_VERSION__`, `client/vite.config.ts`). Readers see `0.1` for `0.1.0` and `0.1.1`
for a fix. The version goes in the footer (`ideas/design.md` §9.2) and, until D10 builds
that footer, in the top bar beside the wordmark. It is never part of `PUBLIC_SITE_NAME`.

**Releases.** On every push to main, CI's `release` job runs after the server, client and
container jobs pass:
- If `v<VERSION>` is already a tag, it does nothing.
- If `VERSION` is below the latest tag, it fails.
- Otherwise it creates tag `v<VERSION>` and a GitHub Release, with notes built from the
  merged PRs.

No registry receives an image. `make image` builds `jolly-boar-inn:<VERSION>` and `:latest`
locally, with the version in the `org.opencontainers.image.version` label.

## Needs decision

[ ] **Where the asset files live, given a read-only container.** Section 7 runs the app
read-only, `cap_drop: ALL`, as uid 10001 against root-owned files, and the decision below
serves images from the app container. Those two need reconciling before Phase 3: either the
importer's output is baked into the image at build time (reproducible, but a rebuild per
dataset refresh and a fat image), or it is a mounted volume the app only reads (a
compose-file change and one more thing a selfhoster has to know about). Nothing in Phase 2
depends on the answer — `data/facts/` is small JSON that is committed like the packs — but
Pixel Hunt and Who's That NPC do, and it is cheaper to decide while the container work from
T14 is fresh.

## Decided

[x] **Licence.** AGPL-3.0

[x] **Price pack in git or generated locally.** `data/packs/prices.json` is ~200 questions of wiki-derived numbers (CC BY-NC-SA text, no images). Committing it means a working game on clone; generating it means selfhosters run the script under their own User-Agent. Decision: commit it, regenerate monthly.

[x] **Room word list.** `data/room-words.json` needs ~300 item and NPC names before the importer exists. Decision: I will handwrite 100-200 room words 

[x] **Display name word filter.** Which list, and whether it blocks or just flags. Decision: none in Phase 1, add in Phase 4.

[x]] **Image hosting.** Out of Phase 1 scope; Phase 3 decides between serving from the app container and a bucket behind Cloudflare. The schema's asset references do not depend on this. Decision: Start by serving from the app container.
