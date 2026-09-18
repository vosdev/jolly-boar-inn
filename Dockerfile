# syntax=docker/dockerfile:1.7

# ---- Stage 1: build the client with pnpm -----------------------------------
FROM node:24-alpine AS client
RUN npm install -g pnpm@12.4.2
WORKDIR /build/client
COPY client/package.json client/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY client/ ./
RUN pnpm build

# ---- Stage 2: server with uv, plus the built client -------------------------
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS server
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1

WORKDIR /app/server

# Dependencies first so they cache independently of app code.
COPY server/pyproject.toml server/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

COPY server/ ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# Layout mirrors the repo so ../client/dist and ../data/packs resolve unchanged.
COPY --from=client /build/client/dist /app/client/dist

RUN useradd --system --create-home --uid 10001 app && chown -R app:app /app
USER app

ENV PATH="/app/server/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
