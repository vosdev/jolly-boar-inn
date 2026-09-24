# Realtime and rooms review

What I read: CLAUDE.md, all of ideas/architecture.md, all of `rooms/state.py`, plus `rooms/ready.py`, `ws/handler.py`, `ws/protocol.py`, `http/{rooms,players,headers,ratelimit}.py`, `main.py`, `db.py` and `static.py`. On the client I read `lib/{ws,stores,protocol,session,api}.ts`, `routes/Room.svelte` and `App.svelte`. I also read uvicorn 0.53's `websockets_sansio_impl.py`, the implementation `ws="auto"` picks, to find out when a send or a close can block. I did not run the tests or a server. Phone behaviour (sleep, network switches) comes from reading the code, not from a device. I skimmed engine.md and reference its findings where they overlap.

Checked and sound:
- A reconnect's `welcome` cannot be overtaken. Sends only yield when the transport is write-paused, so the snapshot is on the wire before any other task runs.
- Two sockets for one player: the old one gets 4000, and its handler's `disconnect` is a no-op.
- `_recover` handles all four places the process can die.
- Late joiners get the open question, can answer it, and count toward "everyone answered".
- Losing the last admin is the deliberate §7 gap.
- `rooms` is bounded by the table and evicted at expiry.

## Medium

### RT-1. A socket that has silently died still reads as `OPEN`, so a woken phone shows a frozen screen with no banner for up to 40 s and loses answers
- **Where:** [client/src/lib/ws.ts:90](../../client/src/lib/ws.ts#L90), [ws.ts:123](../../client/src/lib/ws.ts#L123), [ws.ts:205](../../client/src/lib/ws.ts#L205), [client/src/routes/Room.svelte:231](../../client/src/routes/Room.svelte#L231)
- **Problem:** `#onVisible` returns without doing anything when `readyState <= OPEN`. The only liveness check is the 30 s ping plus the 10 s pong timeout. When the network changed or a NAT entry expired while the phone was locked, the browser still reports `OPEN`, and:
  - `connection` stays `'open'`, so the "reconnecting" banner does not show.
  - The screen keeps the last state it saw, such as a question that closed long ago.
  - `send()` returns `true`, so `answer()` shows "Answer in" for a frame that never reaches the server.
- **Why it matters:** A phone unlocked mid-question shows the wrong state for up to 30 + 10 s. Any answer given in that window is lost without a sign. After the reconnect, `welcome` shows the question closed and the player gets 0 for it. The code follows §3 steps 3–4 exactly, so the gap is in the spec as well.
- **Fix:**
  - On `visibilitychange` to visible, and on the `online` event, when the socket claims `OPEN`: send a `ping` right away and arm a short pong timer (3–5 s) instead of returning.
  - Treat any incoming frame as proof the socket is alive.
  - Optionally, drop and reconnect if an `answer` gets no `answer_ack` or `error` within a few seconds.
  - This changes the §3 reconnect flow, so it needs your OK and an update to architecture.md.
  - Test: vitest with a fake WebSocket that stays `OPEN` and never answers. Fire `visibilitychange` and assert a reconnect within the short timeout.

### RT-2. One write-stalled socket holds up other players' acks and the game clock for up to 20 s
- **Where:** [server/app/rooms/state.py:822](../../server/app/rooms/state.py#L822), [state.py:1248](../../server/app/rooms/state.py#L1248), [state.py:1549](../../server/app/rooms/state.py#L1549), [server/app/ws/handler.py:172](../../server/app/ws/handler.py#L172)
- **Problem:** The lock rule is kept: nothing is sent while the lock is held. But every caller still awaits `_broadcast` to the end, and `_broadcast` gathers every send, each with its own 10 s `SEND_TIMEOUT`. For each failed send it then awaits `_close` (another 10 s cap) before `disconnect`.
  - In uvicorn's sansio implementation a send only blocks in `await self.writable.wait()`, which happens once asyncio's 64 KiB write buffer is full. The kernel's own buffer has to fill first. That happens to a peer that has stopped ACKing (out of coverage, NAT dropped) and has not yet hit uvicorn's 20 s + 20 s keepalive cutoff.
  - A 30–50 player room can fill those buffers within one splash. Every `ready` tap broadcasts the full `RoomView` plus all players, about 7 KB, to everyone ([state.py:1147](../../server/app/rooms/state.py#L1147)).
  - While such a socket is stalled, every broadcast waits on it:
    - `_serve` handles one frame at a time, so the player who tapped or answered gets no `answer_ack` and no `pong` until the gather finishes (handler.py:172–175).
    - The timer task awaits `_broadcast(opened)` before `_sleep_until(ends_at)`.
- **Why it matters:** For 10–20 s at a time:
  - Answerers see "Answer in" with no band and a frozen count.
  - Anyone whose 30 s ping falls in the window misses the 10 s pong deadline. Their client reconnects, which triggers more room-wide broadcasts.
  - A 10 s question stays open until the stalled open broadcast finishes. Because there is no `ends_at` check (ENG-8), answers keep being accepted after the client clocks show zero.

  The module docstring's promise that "one stalled client cannot hold up the room" is only true of the lock.
- **Fix:**
  - Give each socket a bounded outbound queue with one writer task, created in `connect`. `_broadcast` becomes a synchronous `put_nowait` to each target and awaits nothing.
  - The handler's own replies (`answer_ack`, `error`, `pong`) go through the same queue, so their order relative to broadcasts is kept.
  - When the queue overflows or a send times out, the writer closes that socket and calls `disconnect`.
  - The `_close(previous)` in `connect` and the one in `kick` go through the queue too (RT-5).
  - Test: a fake socket whose `send` never returns. Assert that another player's `answer_ack` and the next `question_closed` still arrive on time.

### RT-3. The first frame, before any auth, can be 16 MB, and parsing it stalls every room
- **Where:** [server/app/ws/handler.py:54](../../server/app/ws/handler.py#L54), [handler.py:138](../../server/app/ws/handler.py#L138), [Dockerfile:72](../../Dockerfile#L72), [Makefile:24](../../Makefile#L24)
- **Problem:** Neither command passes `--ws-max-size`, so uvicorn's default of 16 MiB applies (`uvicorn/config.py:207`). `_next_frame` runs `json.loads` on the whole frame before `Hello` is validated. That means anyone who can open `/ws/X` can make the one event loop parse 16 MB. After a join, any player can do the same on every frame, because `Answer.value` is `Any`.
  - Measured with `uv run python -c`: a 16 MB JSON array took 0.17 s to parse and peaked at about 70 MB.
- **Why it matters:** One client sending such frames in a loop blocks the single worker 170 ms at a time. Timers in every room run late, answers are stamped late (see ENG-3), and a few parallel connections add hundreds of MB. The largest legitimate client frame is well under 1 KB: an 80-character answer, six ordering keys, or a 200-character name. The security reviewer may overlap here.
- **Fix:** Add `--ws-max-size 65536` to the Dockerfile `CMD` and the `make dev` line. Over the limit, uvicorn closes with 1009 before the app sees the frame, and the client just reconnects. Test: send an over-size first frame to the running app and assert the close. Or check the flag in the same way `test_version.py` checks the version copies.

### RT-4. Nothing stops the app from running with several workers, and uvicorn picks up `WEB_CONCURRENCY` on its own
- **Where:** [Dockerfile:72](../../Dockerfile#L72), [server/app/main.py:88](../../server/app/main.py#L88)
- **Problem:** A single worker is the documented design, but nothing enforces it. The `CMD` does not pass `--workers`, and uvicorn 0.53 sets `workers` from `WEB_CONCURRENCY` when that variable exists (`uvicorn/config.py:358`). Several PaaS hosts set it. There is also no startup check such as an advisory lock.
- **Why it matters:** With two workers, each has its own `RoomManager`, and things break on the first join:
  - A `POST /join` served by worker B loads the room into B's memory and adds the player there. If that player's `hello` then lands on worker A, A's copy does not have them, so the player gets 4001. The client reads that as terminal and clears the session.
  - A `playing` room loaded by a second worker goes through `_recover`: the open question is voided and a second timer starts. Both timers then advance `current_index`, and each socket sees only its own worker's broadcasts.
  - The same happens with two containers sharing one database.
- **Fix:**
  - Pass `--workers 1` explicitly in the `CMD`. An explicit value beats `WEB_CONCURRENCY`.
  - In `lifespan`, take `pg_try_advisory_lock(<constant>)` on a dedicated connection held for the life of the process, and refuse to start if another process already holds it.
  - Test: two app instances against one test database; the second one's startup fails.

## Low
- RT-5 [state.py:895](../../server/app/rooms/state.py#L895) — `connect` awaits `_close(previous)`, and `kick` awaits the kicked socket's close ([state.py:1311](../../server/app/rooms/state.py#L1311)), before broadcasting a `room_updated` snapshot taken under the lock. If that socket is write-paused (RT-2), the close can take 10 s, and the snapshot then goes out after newer frames. Clients apply `room_updated` wholesale, so an old `phase: "splash"` or `"reveal"` can hide an open question until it closes. Build the snapshot after the close, or queue the close.
- RT-6 [ws.ts:123](../../client/src/lib/ws.ts#L123) — `send` accepts frames once the socket is `OPEN`, even before `welcome`. An answer tapped on the stale screen in that one round trip is rejected as `not_open` after the welcome, and [stores.ts:250](../../client/src/lib/stores.ts#L250) then clears the `your_answer` the welcome had just restored. `error` frames carry no `question_id`, so the client cannot tell which answer was refused. Refuse sends until the state is `'open'`.
- RT-7 [stores.ts:230](../../client/src/lib/stores.ts#L230) — `answer_ack` does not check `question_id` the way `answer_count` does. An ack delayed past the next `question_open` (RT-2) sets the new question's band and count.
- RT-8 [protocol.py:214](../../server/app/ws/protocol.py#L214) — There is no version handshake. After a deploy, the 1012 close brings every open tab back on its old bundle, because the reconnect loop never reloads the page. A renamed server field then becomes a silent `undefined` mid-game. Put the server version in `welcome` and reload when it differs from `__APP_VERSION__`. This is a protocol change.
- RT-9 [state.py:622](../../server/app/rooms/state.py#L622) — Once a room passes `expires_at` mid-game, its timer keeps broadcasting until the hourly purge. Meanwhile answers get `bad_state` ("has expired") and reconnects get 4004. A room made on Friday evening and played on Monday evening crosses its 3-day TTL. Refuse `start_game` near expiry, or extend `expires_at` on start.
- RT-10 [state.py:1147](../../server/app/rooms/state.py#L1147) — Every `ready` tap, connect and disconnect sends the full `RoomView`, including settings, plus every `PlayerView`. With 50 players that is about 7 KB × 50 recipients per tap, or about 400 KB per phone per splash. It is the volume that makes RT-2 reachable. A `players`-only delta would be much smaller.
- RT-11 [architecture.md:190](../architecture.md#L190) — §1 still describes broadcasting as `await ws.send_json` per socket, and gives `Room.phase` without `standings`. The code snapshots under the lock and sends afterwards, concurrently. Docs drift only.
- Already covered by engine.md, so not repeated: timer death freezing a room (ENG-1), a skip landing on the wrong phase (ENG-2), lock-map growth from unknown codes (ENG-5, which I confirmed also grows through `/ws/{code}` after any `hello`), kicking the last player who hadn't answered (ENG-7), no `ends_at` check (ENG-8), and a kicked player's in-flight answer raising a foreign-key error (ENG-13).

## Seen outside this area
- Nothing new at critical or high.
