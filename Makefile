.PHONY: all setup dev dev-server dev-client db-up db-down db-reset db-logs db-shell test lint validate-packs check-contrast gen-protocol gen-modes gen-price-questions gen-pixel-hunt import-suggestions edit-packs edit-roster rehash-questions fetch-assets logo loadtest image

# The app's version: /VERSION is the one place it lives (ideas/architecture.md, Versioning).
VERSION := $(shell cat VERSION)

# Dev Postgres: own compose project so it never collides with `docker compose up`.
DEV_COMPOSE := docker compose -p jbi-dev -f docker-compose.dev.yml

# The data scripts run in a container (docker-compose.data.yml), so a server needs no uv. As
# the host user, so what they write is yours; --build keeps the image on the current uv.lock.
DATA := HOST_UID=$$(id -u) HOST_GID=$$(id -g) docker compose -f docker-compose.data.yml run --rm --build data python
# `make logo` alone needs OpenCV and NumPy, so it has its own image on top of the data one.
LOGO := HOST_UID=$$(id -u) HOST_GID=$$(id -g) docker compose -f docker-compose.data.yml run --rm --build logo python
# `make gen-map` alone needs Java, so it has its own image too.
MAP := HOST_UID=$$(id -u) HOST_GID=$$(id -g) docker compose -f docker-compose.data.yml run --rm --build map python

# Postgres server the test suite creates throwaway databases on. Defaults to the dev
# database above; override with `make test DATABASE_URL_TEST=...`.
DATABASE_URL_TEST ?= postgresql://jbi:jbi@localhost:5432/jbi

# Everything a production checkout needs after `git pull`, ending in the compose image; then
# `docker compose up -d` swaps it in. One step at a time, since the data steps share an image.
# The owner's logo is redrawn only when .env uses it.
all:
	$(MAKE) fetch-assets
	$(MAKE) gen-map
	$(MAKE) gen-price-questions
	@if grep -q '^PUBLIC_SITE_LOGO=branding/boar/' .env 2>/dev/null; then $(MAKE) logo; fi
	docker compose build --build-arg VERSION=$(VERSION)

# Install all dependencies (server via uv, client via pnpm); `git blame` skips bulk reformats.
setup:
	cd server && uv sync
	cd client && pnpm install --frozen-lockfile
	git config blame.ignoreRevsFile .git-blame-ignore-revs

# Start the dev database, then run server on :8000 and client on :5173
# (Vite proxies /api and /ws to :8000).
dev: db-up
	$(MAKE) -j2 dev-server dev-client

dev-server:
	cd server && CLIENT_PICTURES=../client/public/pictures CLIENT_MAP=../client/public/map uv run uvicorn app.main:app --reload --reload-dir . --reload-dir ../data --reload-include "*.sql" --reload-include "*.json" --host 127.0.0.1 --port 8000 --ws-max-size 65536 --ws-per-message-deflate false

dev-client:
	cd client && pnpm dev

# Postgres 18 on 127.0.0.1:5432 (override with DEV_POSTGRES_PORT in .env),
# matching the default DATABASE_URL. Data survives db-down in a named volume.
db-up:
	$(DEV_COMPOSE) up -d --wait

db-down:
	$(DEV_COMPOSE) down

# Throw the data away and start clean.
db-reset:
	$(DEV_COMPOSE) down -v
	$(MAKE) db-up

db-logs:
	$(DEV_COMPOSE) logs -f postgres

db-shell:
	$(DEV_COMPOSE) exec postgres psql -U $${POSTGRES_USER:-jbi} -d $${POSTGRES_DB:-jbi}

# Migration tests need Postgres, so start the dev database first.
test: db-up validate-packs check-contrast
	cd server && DATABASE_URL_TEST=$(DATABASE_URL_TEST) uv run pytest --require-db
	cd client && pnpm test && pnpm build

# Every shipped question pack: schema, content ids, answer consistency, unique ids.
validate-packs:
	cd server && uv run python scripts/validate_packs.py

# D1: every theme in client/src/app.css against the token contract in ideas/design.md.
check-contrast:
	cd server && uv run python scripts/check_contrast.py

# The websocket protocol's schema from server/app/ws/protocol.py, then the client's types from
# it. Run after changing a message; a server and a client test fail until it has been.
gen-protocol:
	cd server && uv run python scripts/gen_protocol_schema.py
	cd client && pnpm gen:protocol

# The mode registry (server/app/modes) as schema/modes.json, which the client reads its
# per-mode rules from. Run after changing a mode; a server and a client test fail until it has been.
gen-modes:
	cd server && uv run python scripts/gen_modes.py

lint:
	cd server && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run python scripts/check_workflows.py
	cd client && pnpm lint && pnpm check

# 30 bot players through one room over websockets, asserting no error frames or refusals, a
# p99 answer -> answer_ack under 200 ms, an exact answers row count and identical standings.
# Needs a live server that trusts X-Forwarded-For from 127.0.0.1 (uvicorn's default) and its
# database, so it is never part of `test` or CI: run `make dev` in another terminal first. For
# the compose stack the bundled Postgres is not published to the host, so run the script in
# the app container instead:
#   docker compose exec app python scripts/loadtest.py
# Takes about twelve and a half minutes. Pass flags through with LOADTEST_ARGS, e.g.
#   make loadtest LOADTEST_ARGS="--questions 5 --pace run"
loadtest:
	cd server && uv run python scripts/loadtest.py $(LOADTEST_ARGS)

# Regenerate data/packs/prices.json from the roster and the wiki price API (two requests,
# /mapping and /latest). Never part of test, CI or app startup, and never committed: each
# instance runs it, through `make all`, and offers no Price is Right until then. Idempotent, so
# a re-run against unchanged prices is a no-op. Needs WIKI_USER_AGENT, from .env or the
# environment (.env.example).
gen-price-questions:
	$(DATA) scripts/gen_price_questions.py

# Rewrite data/packs/pixel_hunt.json from the roster: one question per item with a detail
# picture in data/assets.json, bar the script's blocklist, keeping each item's difficulty.
# Offline. Run it after add_detail_pictures.py or a roster change, then commit the pack.
gen-pixel-hunt:
	$(DATA) scripts/gen_pixel_hunt.py

# Add an export from /admin's suggestion queue to the packs and the roster, then review the
# diff and commit it. FILE may be anywhere, such as ~/Downloads: it is copied into the
# mounted repo for the run. A file with any refused entry writes nothing, and importing the
# same file twice changes nothing. Needs WIKI_USER_AGENT when the file suggests new items.
import-suggestions:
	@test -n "$(FILE)" || { echo "usage: make import-suggestions FILE=path/to/export.json"; exit 1; }
	cp "$(FILE)" server/.import-suggestions.json
	$(DATA) scripts/import_suggestions.py .import-suggestions.json; status=$$?; \
		rm -f server/.import-suggestions.json; exit $$status

# Apply an export of /admin's question edits and deletes to the packs, then review the diff
# and commit it. FILE may be anywhere, as for import-suggestions. One refused change, or
# packs that would not load, writes nothing.
edit-packs:
	@test -n "$(FILE)" || { echo "usage: make edit-packs FILE=path/to/export.json"; exit 1; }
	cp "$(FILE)" server/.edit-packs.json
	$(DATA) scripts/edit_packs.py .edit-packs.json; status=$$?; \
		rm -f server/.edit-packs.json; exit $$status

# Rewrite every pack question id that no longer matches its content, after editing a pack by
# hand, printing old -> new. Only those ids change. Packs that would still not load write nothing.
rehash-questions:
	$(DATA) scripts/rehash_questions.py

# Apply an export of /admin's popular-item renames and removals to data/popular-items.json,
# then review the diff and commit it. FILE may be anywhere, as for import-suggestions. One
# refused change, or packs that would not load, writes nothing. Run gen-price-questions
# afterwards: the price pack still holds the old names and the removed items.
edit-roster:
	@test -n "$(FILE)" || { echo "usage: make edit-roster FILE=path/to/export.json"; exit 1; }
	cp "$(FILE)" server/.edit-roster.json
	$(DATA) scripts/edit_roster.py .edit-roster.json; status=$$?; \
		rm -f server/.edit-roster.json; exit $$status

# Fetch the NPC, pet, team, theme and trophy art in data/assets.json from the wiki into client/src/assets/,
# where the client looks for it, and the question pictures into .pictures/, which the script then
# has build_pictures.py copy into client/public/pictures/ under random names, unless DRY_RUN=1.
# Never part of test or the image build (CI only dry-runs it), and never committed: run it
# before `make image`, which bundles what is on disk. Skips files that are
# there, so a re-run sends nothing. Needs WIKI_USER_AGENT (.env.example). The script's flags are
# variables, since make reads `--force` as its own, e.g. `make fetch-assets FORCE=1 ONLY=npcs`:
#   FORCE=1 refetches files that exist, DRY_RUN=1 lists what is missing and sends nothing,
#   ONLY="npcs pets pictures teams themes trophies" limits the categories, FROM_DIR=dir takes the files
#   from dir instead.
# Only the repo is mounted, so FROM_DIR is a folder inside it, relative to server/.
FETCH_ASSETS_FLAGS = $(if $(filter 1,$(FORCE)),--force) $(if $(filter 1,$(DRY_RUN)),--dry-run) \
	$(foreach c,$(ONLY),--only $(c)) $(if $(FROM_DIR),--from-dir $(FROM_DIR))
fetch-assets:
	$(DATA) scripts/fetch_assets.py $(strip $(FETCH_ASSETS_FLAGS))

# Render the surface map from the game cache data/map.json pins into client/public/map/, about
# a minute, 35 MB and 1.5 GB of free memory (swap will do). Never part of test or the image build,
# and never committed: run it before `make image`, which bundles what is on disk. Sends nothing
# once that cache's tiles are complete.
# Change the pin to update the map (ideas/architecture.md, section 12).
gen-map:
	$(MAP) scripts/gen_map.py

# The owner's logo, drawn from the art `make fetch-assets ONLY=logo` fetched, into branding/boar/
# (git-ignored). Use it with PUBLIC_SITE_LOGO=branding/boar/logo.svg in .env: the hero and
# icons are found beside that file, and rebuild the client after. A selfhoster brings their own
# logo instead (branding/README.md).
logo:
	$(LOGO) scripts/build_logo.py

# Build the production image, tagged with the version and as latest. Releases themselves are
# git tags, which CI creates on main when VERSION changes; this is the local image to match.
image:
	docker build --build-arg VERSION=$(VERSION) -t jolly-boar-inn:$(VERSION) -t jolly-boar-inn:latest .
