# Jolly Boar Inn Quiz Night

Plan and technical outline. A multiplayer quiz platform with OSRS themed game modes, self-hostable, open source.

## Goal

Run a quiz night for the clan where everyone plays on their laptop or phone, scores are tracked automatically, and the winner is obvious at the end. Also usable by other clans who want to host it themselves.

What existing projects do not do: OSRSGuesser, Jingle, GieliGuessr and Scapedle are all singleplayer dailies. Nobody offers a multiplayer room with mixed game modes and live scoring. That is where the value sits. This game takes inspiration from popular quiz games where every 30 seconds or so a new question pops up and people have to click the right answer as quickly as possible. But this time, solely OSRS themed.

## Scope for version 1

Must work:

- Create a room with a readable code (random OSRS item or NPC name, or a custom one). (The creator is now the admin of this room.)
- The admin gets admin rights through a link and plays along like everyone else.
- Players join with a display name, no account.
- Players that join the room can be promoted to an additional admin for this room by an existing admin.
- The admin picks which game modes are in the room.
- Points based on correctness and speed.
- Live scoreboard between questions and a final standing.
- Rooms live for at least a week after creation.
- The admin can add custom questions/answers to a room at creation time, in the same format as our existing questions.
- A (configurable) number of questions are picked from the available questions at random.

Out of scope for version 1: accounts, a public room list, teams, a mobile app, i18n.

## Game modes

See ideas/games.md


## Question format

One JSON schema serves three sources: the packs shipped in the repo, community submissions, and per-room custom questions. Get this right early, because everything else hangs off it.

Rough shape per question:

- `id`, stable and content-derived.
- `type`, matching a game mode.
- `payload`, type-specific (prompt, options, correct answer, asset references, tolerance for numeric answers).
- `difficulty`, optional.
- `source`, one of `pack`, `community`, `room`.
- `tags`, for filtering (pvm, quests, prices, lore, pre-2007).
- `author` and `added_at` for community items.

Asset references point at dataset entries (an item id, an NPC id, a map crop), never at raw external URLs. Questions stay small and portable, and the importer owns the heavy files.

Repo packs live in `data/packs/*.json`, validated in CI against the schema.

Where and how do we host images?

## Community submissions

Two routes into the same files.

GitHub pull request, for people who are comfortable with it. They add entries to a pack file, CI validates the schema, you review and merge. Zero infrastructure and it is the canonical path.

Web suggestion form, for the rest. Submissions land in a `suggestions` table with status `pending`. You review them in an admin view. On approval, a bot writes the entry into the right pack file and opens a PR, so git stays the single source of truth and you keep a history of who contributed what. Approved-but-unmerged content never reaches players.

Things to handle before this page goes public:

- Submissions are untrusted input. Escape on render, strip HTML, no user-supplied URLs in version 1.
- Deduplicate on a normalised hash of the prompt, otherwise you will get the same Abyssal whip question forty times.
- Rate limit per IP, plus a honeypot field. No account requirement, no captcha.
- Cap the length of every field in the schema, not only in the form.
- Add contributor terms to the form: submitted content is published under the repo licence. One sentence, but without it you cannot redistribute what people send you.
- Log the reviewer decision. Rejecting silently is fine, rejecting without a record is not.

An import command (`make import-suggestions`) that turns approved rows into pack entries keeps the web side optional. Selfhosters who do not want a submission page simply never enable it.

## Custom room questions

The admin adds their own questions when creating a room. This is what turns a clan quiz into a party game: a round about the GE, a round about NPCs, and then a question about which player got a pet after 7k KC or who maxed their account tonight?

How it works:

- Custom questions use the same schema, with `source: room`, stored in the `questions` table on that room. They never touch the shared packs.
- The admin editor supports the simple types first: multiple choice, free text with an answer list, and closest number. Image-based custom questions come later, since they need uploads.
- Mixing is per room: the admin picks pack modes plus their own questions, and chooses fixed order or shuffle.
- Export and import a room's custom questions as JSON, same schema. Now people can reuse their set next time, or share it with another clan.

Two things worth getting right:

The author should not score on their own questions. Either exclude the admin from scoring on `source: room` questions, or let them mark a question as host-only. Otherwise the person who wrote "who got a pet at 7k KC" wins their own quiz night, and that is the fastest way to make the feature unfun.

Custom questions are about real people. Keep those rooms unlisted by default, never index them, and delete them with the room at `expires_at`. If you later add uploads, expire the files with the room too and cap the size.

Free text answers need normalisation: lowercase, trim, collapse whitespace, strip punctuation, and let the admin supply multiple accepted answers. Levenshtein distance of 1 or 2 catches typos without accepting wrong answers. Test this with clan names before you trust it.

## Wiki data

Do not email anyone, do not scrape HTML. Weird Gloop only asks for a descriptive User-Agent with contact details, for example `jolly-boar-quiz-importer - twintigapril on Discord`. There is no explicit rate limit, but be polite: one request per second, send `If-Modified-Since`, make it resumable.

Sources:

- `prices.runescape.wiki`, `/mapping` for id, name, examine, high alch, low alch and buy limit. `/latest` for current prices.
- MOID at `chisel.weirdgloop.org/moid` for clean item, NPC and object renders from the cache.
- Bucket API (`meta.weirdgloop.org/w/Extension:Bucket/Api`) for structured infobox data and drops. Better than parsing wikitext.
- MediaWiki API at `oldschool.runescape.wiki/api.php` for the rest. Use generators, for example `generator=categorymembers` with `prop=imageinfo`, 50 titles per request.

Rules for the importer:

- Runs as a separate job, never during a quiz. Live requests to the wiki while a game is running are forbidden.
- Output: a local dataset plus a manifest with checksums.
- Pre-generate zoom frames, eight per item. No resizing per request.
- Convert every image to webp at 50 to 100KB.
- Do not commit wiki images to the repo. Selfhosters run the importer themselves, under their own User-Agent.

Licensing and credits: wiki text is CC BY-NC-SA, game assets remain Jagex property. Keep it non-commercial, no ads, no paywall. Wiki credit and a "not affiliated with Jagex" disclaimer in the footer.

## Architecture

One application process, one replica, Postgres next to it. No Redis. Room state lives in memory in the process, with Postgres as the source of truth.

Why no cache layer: 25 players times 30 questions is roughly 750 rows per night. Postgres does not notice. Redis with AOF everysec still loses a second on a crash and adds a second stateful component.

Recovery model: write every answer to Postgres synchronously before confirming to the player. Scores are computed from the answers table, never tracked separately. A crash costs the open question at most. Restart, players reconnect, carry on.

Route all room state through one module. If you ever want multiple replicas you need room affinity (consistent hashing on the room code) or Postgres LISTEN/NOTIFY. Do not build that now, but keep it replaceable.

### Data model

- `rooms`: code, admin_id, status, settings jsonb, created_at, expires_at. Unique index on code, retry loop on collision.
- `players`: room_id, display_name, session_token, role, joined_at.
- `questions`: room_id, order, type, source, payload jsonb, author_player_id, shown_at, closed_at.
- `answers`: question_id, player_id, answer, received_at.
- `suggestions`: payload jsonb, status, submitted_at, reviewed_at, reviewer, note.

Clean up with a cron on `expires_at`. Thirty days is fine, storage is not the constraint.

### Scoring

The server stamps `shown_at` and `received_at`. The client never sends a timestamp. Answer order is arrival order on the server.

Use five speed buckets instead of a continuous curve. That makes the wifi versus 4G difference (50 to 150 ms) irrelevant and kills the argument before it starts. RTT compensation can come later.

### Admin and tokens

The token in the URL is single use. The admin opens the link, the server swaps it for an httpOnly cookie or a session, marks the token as consumed, and calls `history.replaceState` to clean the URL.

Reason: the admin shares their screen in Discord. A token in the address bar is a token the whole voice channel can read. It also leaks through the Referer header, browser history and access logs.

Also:

- Set `Referrer-Policy: no-referrer`.
- Never log the full query string.
- The admin role is a flag on the player row, not a separate entity.
- An admin who plays along does not receive the question payload in advance.
- Make the role transferable, otherwise a room with a disconnected admin is stuck.

### Client

- Session token in localStorage so reconnects work. People lock their phones between questions.
- Preload the assets for question N+1 during question N.
- Websocket ping frame every 30 seconds against idle timeouts in the tunnel or proxy.
- When a question closes: edit the message, disable the buttons, show the correct answer.

## Hosting and ops

Host at the datacenter, not at home. Not for bandwidth (a gigabit uplink handles this easily), but because of who gets woken up during an outage, and because a public service ties your home IP to strangers.

- Ingress through Cloudflare Tunnel. Free TLS, no port forward, image caching included.
- Serve media from a separate path with long cache headers.
- One replica, a PodDisruptionBudget, and do not drain that node during a quiz night.
- Postgres on a PVC with a nightly `pg_dump` to the NAS. SQLite with Litestream is defensible at this scale too.
- Monitoring and alerting before it goes public.
- info/debug logs for popularity visibility.

Abuse measures for the public instance:

- Rate limit joins per IP, room codes are enumerable.
- A room is only joinable once the admin opens it.
- Display names: length limits, HTML escaping, a word filter.
- Cap rooms per IP per hour and players per room.

## Repo

- Everything through environment variables.
- A `docker-compose.yml` with app and Postgres that works out of the box.
- Migrations run automatically at start.
- `make fetch-data` for the importer, `make import-suggestions` for approved submissions.
- Document two ingress routes: Cloudflare Tunnel and a plain Caddy config.
- Licence: Probably AGPL, maybe MIT?

Worth reading before you freeze the question schema: the websocket protocol docs from Razzia and the question types in PBLive (mcq, short answer, draw, speed). Do not fork either, just borrow the shape.

## Phasing

Phase 0. Make decisions on architecture. Client language Svelte. Server language FastAPI. Database Postgres. Something for images if required. Everything should go in containers. 

Phase 1. Core plus one mode. Rooms, join, admin token, websockets, scoring, scoreboard, higher or lower. No asset pipeline needed. This is already a playable night.

Phase 2. Custom room questions and the three remaining price modes (alch or trash, guess the examine, the price is right). Same dataset, different question shapes. Custom questions land here because they need nothing beyond the schema and an editor, and they add the most fun per hour of work.

Phase 3. Importer for MOID and Bucket. Then zoom quiz and name this NPC.

Phase 4. Go public for our own clan. Abuse measures, monitoring, docs, and testing docker-compose on a clean machine.

Phase 5. Go public for some other clans (Ask on OSRS discord?)

Phase 6. The suggestion page and review flow. Deliberately after going public, because submissions are worthless without players.

Phase 7. Maybe. Minimap geoguessr, then screenshot geoguessr and music.

Do not build a generic game mode framework first. Build two modes concretely, then extract the abstraction.

## Misc decisions.

- Rooms run on a timer. Probably configurable between 30 and 60 seconds by admin at room creation
- Individuals only, no teams
- Interface language: English
- Admins can create max 5 rooms per hour. Rooms stored in cookies. Rooms need to be deleted before you can continue after 5.
- Version 1 requires image support