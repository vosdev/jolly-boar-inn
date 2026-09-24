# Security review

Read CLAUDE.md, all of architecture.md, T31–T34 in phase2.md, every file under `server/app/http/` and `server/app/ws/`, `rooms/state.py`, `settings.py`, `selection.py`, `codes.py`, `ready.py`, `questions/` (schema, custom, normalize, vocab, types), `static.py`, `accesslog.py`, `config.py`, `main.py`, `db.py`, the client's `session.ts`, `api.ts` and `ws.ts`, name rendering, the Dockerfile, the compose files, `.env.example` and CI. Measurements were taken with `uv run python -c` on pure functions. I did not start a server, so throughput numbers are estimates and are marked as such.
Overlaps: SEC-1 extends RT-3 with an out-of-memory crash. SEC-5 extends ENG-5. I agree with ENG-4 (a host can relabel their own question and score on it) and would rate it medium. It is not repeated here.

## Critical

### SEC-1. Two websocket frames, sent before any login, run the server out of memory
- **Where:** [server/app/ws/handler.py:112](../../server/app/ws/handler.py#L112), [handler.py:67](../../server/app/ws/handler.py#L67), [handler.py:138](../../server/app/ws/handler.py#L138), [Dockerfile:72](../../Dockerfile#L72), [docker-compose.yml:37](../../docker-compose.yml#L37), [server/app/http/rooms.py:65](../../server/app/http/rooms.py#L65)
- **Problem:** RT-3 found that the first frame can be 16 MiB and that parsing it stalls the event loop. The frame's shape makes it worse than RT-3's 70 MB. I parsed one 16 MiB frame of `[{},{},…]` with `json.loads`. It took 0.65 s and allocated **388 MB** of Python heap. Compose limits the container to `mem_limit: 512m`. The socket is accepted before the room is looked up, so any code works, and the frame never has to be a valid `hello`.
  Three more limits are missing. `_handshake` waits for the first frame with no timeout. uvicorn runs without `--limit-concurrency`. Nothing counts sockets per address. So idle unauthenticated sockets pile up with no bound, and client libraries answer the pings that would otherwise close them.
  HTTP has the same gap. FastAPI reads and `json.loads` the whole body before pydantic applies the `max_length` checks, and uvicorn has no body cap. nginx's default 1 MB `client_max_body_size` stops this. A proxy with no body limit does not.
- **Attack:** Open two sockets to `/ws/ANYTHING` and send each a 16 MiB `[{},{},…]` frame.
- **Why it matters:** The container is OOM-killed and `restart: unless-stopped` brings it back. On restart, rehydrate voids the open question in every room that was playing (T11). The attack takes a few seconds and needs no account or room, so repeating it keeps the instance down.
- **Fix:** Add `--ws-max-size 65536` (RT-3's fix). Wrap `_handshake` in `asyncio.timeout(10)` and close with 4001 when it expires. Set `--limit-concurrency`, or cap sockets per address. Add a body-size limit on `/api/*` of 256 KiB. The largest real body is a create with at most 20 custom questions, far below that. Tests: an oversized first frame gets 1009, a silent socket is closed after the timeout, and a 1 MB POST gets 413.

## High

### SEC-2. `question_id` is a hash of the whole payload, so a player can recover the answer while the question is open
- **Where:** [server/app/rooms/state.py:334](../../server/app/rooms/state.py#L334), [server/app/questions/schema.py:56](../../server/app/questions/schema.py#L56), [state.py:545](../../server/app/rooms/state.py#L545)
- **Problem:** `OpenQuestion.question_id` is the content id: `sha256(type + "\n" + canonical_json(payload))`, which includes the answer. For most payloads, the only fields `client_view` leaves out are the answer and things derived from it:
  - `multiple_choice` without an `explanation`: the answer is one of at most 6 `answer_index` values.
  - `price_is_right`: 4 candidates, because `value = options[i]` whenever `answer_index = i`.
  - `pick_from_list`: one candidate per vocabulary entry, with `subject = {name, asset: "item:<id>"}`. The entries come from `/api/vocab`.

  I rebuilt candidate payloads from each question's `client_view` and hashed them. That recovered the answer for 100 of 100 `price_is_right` questions in `prices.json`, 18 of 18 in `examine.json` and 21 of 21 NPC `multiple_choice` questions in `random_events/*.json`. A host's own questions are hashed the same way in `custom.envelopes`, so they leak too, even though they are in no public file. Two more cases could be searched the same way, but I did not test them: a `closest_number` with a small integer answer, and a `free_text` whose answer is in a word list.
- **Attack:** Paste a snippet into devtools that wraps `WebSocket.onmessage`. On each `question_open`, it hashes the candidates and sends the one that matches. The result is a correct answer in speed bucket 1 on every question.
- **Why it matters:** This defeats §3 "What the server withholds" for every player, not only admins. It also defeats the promise that a host's questions are unknown to everyone but their author. Committing the packs was a deliberate decision, and it already lets a cheater build a lookup table per pack. The id makes cheating generic, and extends it to questions that are in no pack.
- **Fix:** Put an opaque per-room handle on the wire, such as the `questions.id` row uuid or the position, and have `answer` send it back. Keep the content id on the server. This changes the protocol, so it needs your decision. Test: `question_open` carries no content id.

### SEC-3. Anyone can list every live room and fill it with players who come back after a kick
- **Where:** [server/app/rooms/codes.py:39](../../server/app/rooms/codes.py#L39), [server/app/http/rooms.py:80](../../server/app/http/rooms.py#L80), [server/app/http/players.py:20](../../server/app/http/players.py#L20), [state.py:1046](../../server/app/rooms/state.py#L1046), [state.py:1285](../../server/app/rooms/state.py#L1285)
- **Problem:** Codes are the 297 words in `room-words.json` first, and a word plus two digits (29,700 more) only after collisions. Most live rooms therefore have a plain word as their code. `GET /api/rooms/{code}` needs no login and has no rate limit. It answers 200 with every player's name, role and connection state, 404 for no room and 410 for expired, so 297 requests list the live rooms. Joining needs only a name and has no limit. `max_players` counts disconnected players too. A kick deletes the row and records nothing, so the same script rejoins under a new name at once.
- **Attack:** For each word, `GET` it. For each 200, send `POST /join` 50 times with random names. Real players now get `room_full`. Bots that stay connected and never tap ready keep every splash below its 80% threshold, so the host has to skip each one. Kicked bots rejoin.
- **Why it matters:** One script disrupts every game on an instance. Word codes are a documented decision (§7, "Room word list"). The problem is the combination with an open lookup, unlimited joins and no way to keep a kicked player out. The small code space can also be exhausted: about 30,000 live rooms make `allocate` fail, which returns a 500 for every create. With a 3-day TTL that takes roughly 42 IPv4 addresses, or one IPv6 prefix (SEC-8).
- **Fix:** Rate-limit `GET /api/rooms/{code}` and join per address, for example 10 a minute, with the /64 key from T33. Cap joins per address per room. Two further options are player-visible and need your call: a host "lock room" toggle, and blocking a kicked player's address for the rest of the room's life. Longer codes, such as a word plus 3 digits from the first room, make scanning expensive.

### SEC-4. One player can flood the room with unlimited ready taps and renames, and slow every room on the server
- **Where:** [server/app/ws/handler.py:155](../../server/app/ws/handler.py#L155), [state.py:1117](../../server/app/rooms/state.py#L1117), [state.py:1068](../../server/app/rooms/state.py#L1068), [server/app/db.py:35](../../server/app/db.py#L35)
- **Problem:** `_serve` has no per-socket message rate limit. In the lobby, the ready toggle is deliberately unlimited. Each toggle takes the room lock and sends a full `RoomView` plus every `PlayerView` to every socket, about 7 KB × 50 in a full room (RT-10). `set_profile` works in any status. Alternating between two names means an `UPDATE` on a connection from the pool (at most 10) plus the same broadcast.
- **Attack:** Join any room, or create one, and send `ready: true` and `ready: false` in a tight loop. Or alternate `set_profile` between "a1" and "a2" from a few sockets.
- **Why it matters:** One uvicorn worker serves every room (a documented decision). The flood takes up the event loop and the outgoing bandwidth. Renames also tie up the pool, while other rooms' `_open_question` and `submit_answer` wait for a connection with their room lock held. Timers everywhere run late and answers are timed late (ENG-3). I did not measure throughput, but the cost per message grows with the size of the room.
- **Fix:** Add a token bucket per socket in `_serve`, for example 10 messages a second with a burst of 20, and close with 4008 when it is exceeded. Add a cooldown on lobby ready toggles and on `set_profile`, for example one every 2 s. Test: a burst of 100 `ready` frames produces at most the burst's worth of `room_updated`.

### SEC-5. Unknown vocabulary names and room codes each stay in memory forever
- **Where:** [server/app/questions/vocab.py:153](../../server/app/questions/vocab.py#L153), [server/app/http/vocab.py:32](../../server/app/http/vocab.py#L32), [state.py:591](../../server/app/rooms/state.py#L591)
- **Problem:** `vocab.get` is wrapped in `functools.cache`, which has no size limit. It also caches the `None` returned for an unknown name. So each `GET /api/vocab/<name>` with a new name adds an entry whose key is the whole path segment, and the entry is never removed. The request needs no database, no login and has no rate limit, which makes it the cheapest request in the app. uvicorn's httptools protocol sets no limit on URL length. ENG-5 describes the same leak for `_locks`, reached through `/api/rooms/{code}`, join and the websocket.
- **Attack:** Send `GET /api/vocab/<random 8 KB string>` about 65,000 times. 8 KB fits within nginx's default header buffers. That adds about 520 MB, and the container is OOM-killed as in SEC-1.
- **Why it matters:** It is a remote crash from ordinary-sized GETs that a load-testing tool can send in under a minute (estimated).
- **Fix:** Look up `SOURCES` before the cache, and cache only known names. Type `name` in the route as `Literal["items", "npcs"]`. Apply ENG-5's fix to `_locks`. Hold `code` to `^[A-Za-z0-9]{1,34}$` in the HTTP and websocket routes (the client's `ROOM_PATH` already uses a similar pattern). Test: 1,000 unknown names leave the cache the same size.

### SEC-6. Free-text grading runs in quadratic time on answers that grow under NFKC, and blocks the event loop
- **Where:** [server/app/questions/normalize.py:33](../../server/app/questions/normalize.py#L33), [normalize.py:55](../../server/app/questions/normalize.py#L55), [server/app/questions/types/free_text.py:69](../../server/app/questions/types/free_text.py#L69), [state.py:1574](../../server/app/rooms/state.py#L1574)
- **Problem:** `validate_value` limits an answer to 80 code points, and the schema limits each accepted answer to 80. Grading applies NFKC first, which turns U+FDFA into 18 characters (80 become 1,440). `distance` is a pure-Python Levenshtein that takes O(len×len), run once for each of up to 20 accepted answers. It runs inside `_close_question`, on the one event loop, with the room lock held.
  Measured:
  - An 80-character U+FDFB answer (640 after NFKC) against 20 accepted answers of 79×U+FDFA took **1.35 s**.
  - An 80×U+FDFA answer against 20 ordinary 80-character accepted answers took 0.13 s.
- **Attack:** In any room with a host's `free_text` question, 49 bots answer 80×U+FDFA, which blocks every room for about 6 s at the close. A host who also pads `accepted` this way can block the server for minutes with one full room.
- **Why it matters:** Every game on the instance freezes. Clients' 10 s pong timeout then starts a wave of reconnects.
- **Fix:** In `accepts`, skip any candidate whose normalised length differs by more than `max_distance`, and use a banded Levenshtein. `max_distance` is at most 2, so the cost drops to O(n·5). Also reject an answer whose normalised form is longer than 80. Test: an 80×U+FDFA answer against the worst `accepted` grades in under 10 ms.

## Medium

### SEC-7. Display names allow invisible, bidirectional and look-alike characters, so a player can impersonate another
- **Where:** [server/app/rooms/state.py:185](../../server/app/rooms/state.py#L185), [client/src/components/Lobby.svelte:65](../../client/src/components/Lobby.svelte#L65), [Lobby.svelte:82](../../client/src/components/Lobby.svelte#L82), [client/src/components/Scoreboard.svelte:64](../../client/src/components/Scoreboard.svelte#L64)
- **Problem:** `normalize_name` blocks only `<`, `>` and ASCII control and space characters. I checked that it accepts all of these:
  - `"Dan​"`, and `"​"` alone, which is an invisible name.
  - `"‮Host"`, a right-to-left override.
  - `"Dаn"`, with a Cyrillic а.
  - `"Dan\x80"`, a C1 control character.
  - A letter followed by 23 combining marks.

  The unique index compares `lower(display_name)`, so "Dan" and "Dan​" can both be in a room. Names are joined into sentences, such as "Still waiting on …", the kick confirm and the podium, with no bidirectional isolation, so a U+202E in one name reverses the rest of the sentence.
- **Attack:** Join as "Dan​" before the host's second device, which is named "Dan", joins. The host promotes the wrong Dan. There is no demote, so the impostor can then end the game, kick players or delete the room. `set_profile` also allows the rename in the middle of a game.
- **Why it matters:** The damage stays inside one room, but promoting the wrong player cannot be undone.
- **Fix:** Apply NFKC to names. Refuse categories Cf, Cc, Co and Cs, and cap combining marks. Check uniqueness on NFKC plus casefold. Render names inside `<bdi>`, or with `unicode-bidi: isolate`. Which characters to refuse is player-visible, so it is your call.

### SEC-8. Only room creation is rate-limited, and behind a proxy one visitor can use up the whole instance's quota
- **Where:** [server/app/http/ratelimit.py:13](../../server/app/http/ratelimit.py#L13), [server/app/http/rooms.py:72](../../server/app/http/rooms.py#L72), [docker-compose.yml:25](../../docker-compose.yml#L25), [server/app/config.py:33](../../server/app/config.py#L33)
- **Problem:**
  - The one limiter covers `POST /api/rooms`. Join, GET, DELETE, vocab and websockets have none (SEC-3, SEC-4, SEC-5).
  - The key is `request.client.host`. With `FORWARDED_ALLOW_IPS` unset, compose passes an empty string, which trusts no address (checked with `_TrustedHosts('')`). Behind a proxy, every visitor then shares one bucket of 10 rooms an hour.
  - IPv6 is keyed per address, so one /64 has effectively no limit.
  - Every created room stays in `self.rooms` until it expires, so this limit is also what bounds memory.

  T33 plans the runtime warning, the higher default and the /64 key, so this is known. None of it has landed yet.
- **Attack:** From behind a shared proxy address, create 10 rooms. Everyone then gets 429 on create for an hour.
- **Why it matters:** It is the failure T33 predicts for a quiz night, and anyone can cause it on purpose.
- **Fix:** Land T33. Put joins and lookups behind the same keyed limiter (SEC-3). Key IPv6 on the /64.

## Low
- SEC-9 [handler.py:112](../../server/app/ws/handler.py#L112) — `/ws` does not check `Origin`. That is safe today because nothing ambient logs a socket in: the token comes from localStorage in the first frame. Add an Origin allow-list if a cookie is ever introduced.
- SEC-10 [api.ts:28](../../client/src/lib/api.ts#L28) — FastAPI parses a body that has no `Content-Type` as JSON. A cross-site `fetch(url, {mode: 'no-cors', method: 'POST', body: new Blob([json])})` sends no content type, so any website can make its visitors join rooms from their own addresses (SEC-3). Require `application/json` on `/api` writes.
- SEC-11 [state.py:1267](../../server/app/rooms/state.py#L1267) — Promotion cannot be undone, and any admin can `DELETE` the room. Both are documented decisions ("There is no demote"). With SEC-7, one mistaken promotion hands the room to a griefer.
- SEC-12 [static.py:26](../../server/app/static.py#L26) — A path containing `%00` makes `Path.resolve()` raise `ValueError` (checked), which becomes a 500 instead of a 404. Traversal is correctly blocked by `is_relative_to`.
- SEC-13 [docker-compose.yml:21](../../docker-compose.yml#L21) — The comment says an unset `FORWARDED_ALLOW_IPS` means uvicorn's `127.0.0.1,::1`. Compose actually passes `""`, which trusts nothing. The effect on the bridge is the same, but the comment is wrong.
- SEC-14 [state.py:585](../../server/app/rooms/state.py#L585) — Codes and questions are drawn with `random.Random` (Mersenne Twister). That is harmless while codes are not secret (SEC-3). Use `secrets.SystemRandom` for codes if they ever need to be unguessable.
- SEC-15 [ci.yml:32](../../.github/workflows/ci.yml#L32) — Actions are pinned to tags, not commit SHAs, and the release job holds `contents: write`. Pinning to SHAs closes the tag-hijack route.

## Seen outside this area
- engine: after a restart, any `GET /api/rooms/{code}` for a room that was playing rehydrates it and starts its timer. That includes scanners (SEC-3) and link-preview bots. With `splash_seconds: 0` and nobody connected, the game then plays itself to `finished`.
