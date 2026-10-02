.PHONY: setup dev dev-server dev-client db-up db-down db-reset db-logs db-shell test lint validate-packs check-contrast gen-price-questions gen-examine-questions fetch-assets loadtest image

# The app's version: /VERSION is the one place it lives (ideas/architecture.md, Versioning).
VERSION := $(shell cat VERSION)

# Dev Postgres: own compose project so it never collides with `docker compose up`.
DEV_COMPOSE := docker compose -p jbi-dev -f docker-compose.dev.yml

# The data scripts run in a container (docker-compose.data.yml), so a server needs no uv. As
# the host user, so what they write is yours; --build keeps the image on the current uv.lock.
DATA := HOST_UID=$$(id -u) HOST_GID=$$(id -g) docker compose -f docker-compose.data.yml run --rm --build data python

# Postgres server the test suite creates throwaway databases on. Defaults to the dev
# database above; override with `make test DATABASE_URL_TEST=...`.
DATABASE_URL_TEST ?= postgresql://jbi:jbi@localhost:5432/jbi

# Install all dependencies (server via uv, client via pnpm).
setup:
	cd server && uv sync
	cd client && pnpm install --frozen-lockfile

# Start the dev database, then run server on :8000 and client on :5173
# (Vite proxies /api and /ws to :8000).
dev: db-up
	$(MAKE) -j2 dev-server dev-client

dev-server:
	cd server && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --ws-max-size 65536

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

lint:
	cd server && uv run ruff check . && uv run ruff format --check .
	cd client && pnpm check

# T15: 30 bot players through one room over websockets, asserting no error frames, a p99
# answer -> answer_ack under 200 ms, an exact answers row count and identical standings.
# Needs a live server and its database, so it is never part of `test` or CI: run `make dev`
# in another terminal first. For the compose stack the bundled Postgres is not published to
# the host, so run the script in the app container instead:
#   docker compose exec app python scripts/loadtest.py
# Takes about six and a half minutes. Pass flags through with LOADTEST_ARGS, e.g.
#   make loadtest LOADTEST_ARGS="--questions 5 --question-seconds 5"
loadtest:
	cd server && uv run python scripts/loadtest.py $(LOADTEST_ARGS)

# Regenerate data/packs/prices.json from the roster and the wiki price API (two requests,
# /mapping and /latest). Never part of test, CI or app startup: run it about monthly and
# commit the result. Idempotent, so a re-run against unchanged prices is a no-op. Needs
# WIKI_USER_AGENT, from .env or the environment (.env.example).
gen-price-questions:
	$(DATA) scripts/gen_price_questions.py

# Regenerate data/packs/examine.json from data/examines.json, offline. Run it after adding an
# examine and commit both files; the test suite fails when the two disagree.
gen-examine-questions:
	$(DATA) scripts/gen_examine_questions.py

# Fetch the NPC and trophy art in data/assets.json from the wiki into client/src/assets/, where
# the client looks for it. Never part of test or the image build (CI only dry-runs it), and never
# committed: run it before `make image`, which bundles what is on disk. Skips files that are
# there, so a re-run sends nothing. Needs WIKI_USER_AGENT (.env.example). The script's flags are
# variables, since make reads `--force` as its own, e.g. `make fetch-assets FORCE=1 ONLY=npcs`:
#   FORCE=1 refetches files that exist, DRY_RUN=1 lists what is missing and sends nothing,
#   ONLY="npcs trophies" limits the categories, FROM_DIR=dir takes the files from dir instead.
# Only the repo is mounted, so FROM_DIR is a folder inside it, relative to server/.
FETCH_ASSETS_FLAGS = $(if $(filter 1,$(FORCE)),--force) $(if $(filter 1,$(DRY_RUN)),--dry-run) \
	$(foreach c,$(ONLY),--only $(c)) $(if $(FROM_DIR),--from-dir $(FROM_DIR))
fetch-assets:
	$(DATA) scripts/fetch_assets.py $(strip $(FETCH_ASSETS_FLAGS))

# Build the production image, tagged with the version and as latest. Releases themselves are
# git tags, which CI creates on main when VERSION changes; this is the local image to match.
image:
	docker build --build-arg VERSION=$(VERSION) -t jolly-boar-inn:$(VERSION) -t jolly-boar-inn:latest .
