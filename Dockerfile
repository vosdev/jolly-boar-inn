# syntax=docker/dockerfile:1.7

# ---- Stage 1: build the client with pnpm -----------------------------------
FROM node:24-alpine AS client
RUN npm install -g pnpm@12.4.2
WORKDIR /build/client
COPY client/package.json client/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY client/ ./
# What the client reads from outside client/: the random-name corpus, the question schema
# the editor's limits come from, the pet list with the manifest that says which have art, and
# the map's pin, which names the folder its tiles are in.
COPY data/player-names.json ../data/player-names.json
COPY data/pets.json data/assets.json data/map.json ../data/
COPY schema/question.schema.json ../schema/question.schema.json
# The app's version, which the top bar shows (ideas/architecture.md, Versioning).
COPY VERSION ../VERSION
# A selfhoster's name, logo and default theme are baked into the bundle (.env.example).
ARG PUBLIC_SITE_NAME PUBLIC_SITE_LOGO PUBLIC_HERO_NAME PUBLIC_DEFAULT_THEME
COPY branding/ ../branding/
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
    uv sync --locked --no-default-groups --no-install-project

COPY server/ ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-default-groups

# ---- Data: the scripts that write into a checkout (docker-compose.data.yml) --
# Never part of the runtime: that stage does not copy from this one, so `make image` skips it,
# and runtime must stay last for a plain `docker build`. git is here because a script asks it
# what the checkout ignores; Docker Desktop shows the mount point as root's, so git is told to
# trust it. The scripts and the app package come from the mounted repo, so a run uses the
# checkout's code rather than the code this image was built with.
FROM python:3.14.10-slim-bookworm AS data
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/* \
    && git config --system --add safe.directory /repo
COPY --from=builder /app/server/.venv /app/server/.venv
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp \
    PYTHONPATH=/repo/server \
    PATH="/app/server/.venv/bin:$PATH"
# Pillow, which the builder's venv leaves out for the runtime. uv and the lock are mounted, so
# the group is the only new layer.
RUN --mount=from=builder,source=/usr/local/bin/uv,target=/usr/local/bin/uv \
    --mount=type=bind,source=server/pyproject.toml,target=/app/server/pyproject.toml \
    --mount=type=bind,source=server/uv.lock,target=/app/server/uv.lock \
    --mount=type=cache,target=/root/.cache/uv \
    UV_CACHE_DIR=/root/.cache/uv UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    uv sync --project /app/server --locked --no-default-groups --group data --no-install-project --inexact
WORKDIR /repo/server

# ---- Logo: the data stage plus what `make logo` draws with ---------------------
# Its own stage so the data image, which CI and every other script build, stays without
# OpenCV and NumPy. uv and the lock are mounted, so the logo packages are the only new layer.
FROM data AS logo
RUN --mount=from=builder,source=/usr/local/bin/uv,target=/usr/local/bin/uv \
    --mount=type=bind,source=server/pyproject.toml,target=/app/server/pyproject.toml \
    --mount=type=bind,source=server/uv.lock,target=/app/server/uv.lock \
    --mount=type=cache,target=/root/.cache/uv \
    UV_CACHE_DIR=/root/.cache/uv UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    uv sync --project /app/server --locked --no-default-groups --group logo --no-install-project --inexact

# ---- Map: the data stage plus Java, for `make gen-map` alone ------------------
# Maven only builds the renderer: what it fetches is cached, and the JRE that runs it is
# Debian's, so the map image stays one layer on top of the data one.
FROM maven:3.9-eclipse-temurin-26 AS map-render
WORKDIR /build
COPY server/scripts/map_render/ ./
RUN --mount=type=cache,target=/root/.m2 mvn -q -B package

FROM data AS map
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*
COPY --from=map-render /build/target/*.jar /opt/map-render/

# ---- Stage 3: runtime ------------------------------------------------------
# Same image the uv base is built from, so the venv's interpreter symlink into
# /usr/local and the absolute shebang in .venv/bin/uvicorn still resolve.
FROM python:3.14.10-slim-bookworm AS runtime

# `make image` passes the contents of /VERSION; a plain `docker build` leaves it unset.
ARG VERSION=dev
LABEL org.opencontainers.image.version=$VERSION

# HOME points at the tmpfs so a stray cache write cannot fail on a read-only root.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp \
    PATH="/app/server/.venv/bin:$PATH"

# Nothing in the container installs packages, and pip's vendored urllib3 and msgpack would
# be the image's only known vulnerabilities.
RUN useradd --system --no-create-home --uid 10001 app \
    && python -m pip uninstall --yes --root-user-action=ignore pip

# Layout mirrors the repo so ../client/dist, ../data/packs and ../schema resolve unchanged.
# Everything stays root-owned: the app user needs to read it, never to write it.
COPY --from=builder /app/server /app/server
COPY --from=client /build/client/dist /app/client/dist
COPY schema/ /app/schema/
COPY data/ /app/data/
# The server sends it in every welcome, so a tab on an older bundle reloads.
COPY VERSION /app/VERSION

# packs_dir defaults to ../data/packs, resolved against the working directory.
WORKDIR /app/server
USER 10001

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 --start-period=5s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"]

# Trusted proxies come from $FORWARDED_ALLOW_IPS, which uvicorn reads itself and
# which defaults to 127.0.0.1,::1. Set it to your reverse proxy's address, or
# X-Forwarded-For is ignored and every client shares one rate-limit bucket.
# --workers 1: rooms live in one process's memory, and uvicorn otherwise takes a worker
# count from $WEB_CONCURRENCY, which some hosts set. The app also refuses to start next
# to another process on the same database.
# --ws-max-size: the default 16 MiB frame takes hundreds of MB to parse; real ones are
# under 1 KB. --limit-concurrency: past it uvicorn answers 503 rather than running the
# 512 MB container out of memory.
# --host "": one socket on 0.0.0.0 and one on ::, where there is IPv6. A single :: socket
# would be IPv6-only, since asyncio sets IPV6_V6ONLY, and 0.0.0.0 misses a network with
# IPv6 enabled.
CMD ["uvicorn", "app.main:app", "--host", "", "--port", "8000", "--proxy-headers", \
     "--workers", "1", "--ws-max-size", "65536", "--limit-concurrency", "1000"]
