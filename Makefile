.PHONY: setup dev dev-server dev-client db-up db-down db-reset db-logs db-shell test lint

# Dev Postgres: own compose project so it never collides with `docker compose up`.
DEV_COMPOSE := docker compose -p jbi-dev -f docker-compose.dev.yml

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

test:
	cd server && uv run pytest
	cd client && pnpm build

lint:
	cd server && uv run ruff check . && uv run ruff format --check .
	cd client && pnpm check
