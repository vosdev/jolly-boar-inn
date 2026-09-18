.PHONY: setup dev dev-server dev-client test lint

# Install all dependencies (server via uv, client via pnpm).
setup:
	cd server && uv sync
	cd client && pnpm install --frozen-lockfile

# Run server on :8000 and client on :5173 (Vite proxies /api and /ws to :8000).
dev:
	$(MAKE) -j2 dev-server dev-client

dev-server:
	cd server && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-client:
	cd client && pnpm dev

test:
	cd server && uv run pytest
	cd client && pnpm build

lint:
	cd server && uv run ruff check . && uv run ruff format --check .
	cd client && pnpm check
