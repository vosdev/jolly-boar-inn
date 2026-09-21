# syntax=docker/dockerfile:1.7

# ---- Stage 1: build the client with pnpm -----------------------------------
FROM node:24-alpine AS client
RUN npm install -g pnpm@12.4.2
WORKDIR /build/client
COPY client/package.json client/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY client/ ./
# What the client reads from outside client/: the random-name corpus (D3), and the chat
# heads, which the build packs into one sprite sheet (D4).
COPY data/player-names.json ../data/player-names.json
COPY data/heads/ ../data/heads/
RUN pnpm build

# ---- Stage 2: build the server venv with uv --------------------------------
# Builds nothing but /app/server; uv and its caches stay out of the final image.
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS builder
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app/server

# Dependencies first so they cache independently of app code.
COPY server/pyproject.toml server/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

COPY server/ ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# ---- Stage 3: runtime ------------------------------------------------------
# Same image the uv base is built from, so the venv's interpreter symlink into
# /usr/local and the absolute shebang in .venv/bin/uvicorn still resolve.
FROM python:3.14.2-slim-bookworm AS runtime

# HOME points at the tmpfs so a stray cache write cannot fail on a read-only root.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp \
    PATH="/app/server/.venv/bin:$PATH"

RUN useradd --system --no-create-home --uid 10001 app

# Layout mirrors the repo so ../client/dist, ../data/packs and ../schema resolve unchanged.
# Everything stays root-owned: the app user needs to read it, never to write it.
COPY --from=builder /app/server /app/server
COPY --from=client /build/client/dist /app/client/dist
COPY schema/ /app/schema/
COPY data/ /app/data/

# packs_dir defaults to ../data/packs, resolved against the working directory.
WORKDIR /app/server
USER 10001

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 --start-period=5s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"]

# Trusted proxies come from $FORWARDED_ALLOW_IPS, which uvicorn reads itself and
# which defaults to 127.0.0.1,::1. Set it to your reverse proxy's address, or
# X-Forwarded-For is ignored and every client shares one rate-limit bucket.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
