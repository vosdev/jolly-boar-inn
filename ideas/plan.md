# Jolly Boar Inn Quiz Night

The product pitch and the plans past Phase 2. How it is built is `ideas/architecture.md`,
which wins wherever the two disagree; the modes are `ideas/games.md`.

## Goal

Run a quiz night for the clan where everyone plays on their laptop or phone, scores are tracked automatically, and the winner is obvious at the end. Also usable by other clans who want to host it themselves.

What existing projects do not do: OSRSGuesser, Jingle, GieliGuessr and Scapedle are all singleplayer dailies. Nobody offers a multiplayer room with mixed game modes and live scoring. That is where the value sits: every 30 seconds or so a new question pops up and people click the right answer as quickly as they can, solely OSRS themed.

Out of scope: accounts, teams, a mobile app, i18n. Interface language is English.

## Custom room questions

This is what turns a clan quiz into a party game: a round about the GE, a round about NPCs, and then a question about which player got a pet after 7k KC.

Custom questions are about real people. Keep those rooms unlisted by default, never index them, and delete them with the room. If uploads ever arrive, expire the files with the room too and cap the size.

A host keeps at most five rooms at once (T33).

## Community submissions (Phase 6)

Two routes into the same files.

GitHub pull request, for people who are comfortable with it. They add entries to a pack file, CI validates the schema, you review and merge. Zero infrastructure and it is the canonical path.

Web suggestion form, for the rest. Submissions land in a `suggestions` table with status `pending`. You review them in an admin view. On approval, a bot writes the entry into the right pack file and opens a PR, so git stays the single source of truth and you keep a history of who contributed what. Approved-but-unmerged content never reaches players.

Things to handle before this page goes public:

- Submissions are untrusted input. Escape on render, strip HTML, no user-supplied URLs.
- Deduplicate on a normalised hash of the prompt, otherwise you will get the same Abyssal whip question forty times.
- Rate limit per IP, plus a honeypot field. No account requirement, no captcha.
- Add contributor terms to the form: submitted content is published under the repo licence. One sentence, but without it you cannot redistribute what people send you.
- Log the reviewer decision. Rejecting silently is fine, rejecting without a record is not.

An import command (`make import-suggestions`) that turns approved rows into pack entries keeps the web side optional. Selfhosters who do not want a submission page simply never enable it.

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

## Hosting and ops

Host at the datacenter, not at home. Not for bandwidth, but because of who gets woken up during an outage, and because a public service ties your home IP to strangers.

- Ingress through Cloudflare Tunnel or a plain Caddy config; the README documents both (T43).
- Serve media from a separate path with long cache headers.
- One replica, a PodDisruptionBudget, and do not drain that node during a quiz night.
- Postgres on a PVC with a nightly `pg_dump` to the NAS.
- Monitoring and alerting before it goes public.

Abuse measures for the public instance (Phase 4): rate limit joins per IP, cap rooms per IP and players per room, and a display-name word filter.

## Phasing

Phases 0–2 are the decisions, the core with More or Less, and `ideas/phase2.md`.

Phase 3. Importer for MOID and Bucket. Then Pixel Hunt and Who's That NPC?.

Phase 4. Go public for our own clan. Abuse measures, monitoring, docs, and testing docker-compose on a clean machine.

Phase 5. Go public for some other clans (ask on the OSRS Discord?).

Phase 6. The suggestion page and review flow. Deliberately after going public, because submissions are worthless without players.

Phase 7. Maybe. Minimap geoguessr, then screenshot geoguessr and music.
