.PHONY: setup dev dev-server dev-client db-up db-down db-reset db-logs db-shell test lint validate-packs check-contrast gen-price-questions loadtest image

# The app's version: /VERSION is the one place it lives (ideas/architecture.md, Versioning).
VERSION := $(shell cat VERSION)

# Dev Postgres: own compose project so it never collides with `docker compose up`.
DEV_COMPOSE := docker compose -p jbi-dev -f docker-compose.dev.yml

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
	cd server && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

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
	cd server && DATABASE_URL_TEST=$(DATABASE_URL_TEST) uv run pytest
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
# commit the result. Idempotent, so a re-run against unchanged prices is a no-op.
gen-price-questions:
	cd server && uv run python scripts/gen_price_questions.py

# Build the production image, tagged with the version and as latest. Releases themselves are
# git tags, which CI creates on main when VERSION changes; this is the local image to match.
image:
	docker build --build-arg VERSION=$(VERSION) -t jolly-boar-inn:$(VERSION) -t jolly-boar-inn:latest .
