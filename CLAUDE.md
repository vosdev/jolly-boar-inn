# Jolly Boar Inn

Kahoot-style OSRS quiz game. Server: Python 3.14, FastAPI, asyncpg with hand-written SQL (no ORM), Postgres 18. Client: Svelte 5 with runes, Vite SPA, TypeScript (no SvelteKit). Use uv and pnpm, never pip or npm.

## Commands
- `make setup` installs everything. `make dev` starts Postgres in Docker, the server on :8000 and the client on :5173.
- `make lint test` must pass before you commit or say you're done. A run where database tests skipped doesn't count.
- One server test: `cd server && DATABASE_URL_TEST=postgresql://jbi:jbi@localhost:5432/jbi uv run pytest tests/test_x.py` (run `make db-up` first). Without `DATABASE_URL_TEST`, database tests skip silently.
- One client test: `cd client && pnpm test src/lib/x.test.ts`.
- After editing `data/examines.json`, run `make gen-examine-questions` and commit both files.

## Architecture
- One uvicorn worker holds all room state in memory. Never assume several workers.
- Migrations are numbered `.sql` files in `server/app/migrations/`. Add a new one; never edit an existing one.
- Session tokens travel only in POST bodies and the first websocket frame, never in a URL. Admin rights come from `player.role` on the server.

## Docs
- `ideas/architecture.md` describes the current architecture and wins over older notes. Read the section you need, not the whole file.
- Read `ideas/design.md` only for frontend work. T tasks are specified in `ideas/phase2.md`, D tasks in `ideas/design.md`.
- When updating a doc, the result must be the same length or shorter unless new functionality requires more. Replace outdated text; never append next to it.

## Decisions
- Before starting a T or D task, read its spec and the architecture.md sections it touches. Tell me where they look wrong or underspecified for this task, and wait for my answers before coding.
- Ask before deciding anything a player can see, or anything in the websocket protocol, the database schema, scoring or room settings. Decide internal details yourself and list them in your reply.
- Departing from architecture.md needs my OK. Then update architecture.md in the same PR.
- As long as we are on major version 0, there is no need to take compatibility with previous versions into account.

## Tests
- Behavior changes come with tests. A bug fix starts with a test that fails without the fix. Each accept criterion in a task spec is a test unless it says "manual".
- Never weaken, skip or delete a test to get green. If a test looks wrong, tell me.

## Code style
- Comments explain why, never what. No comments restating the code, no commented-out code, no task IDs (T22, D9).
- Docstrings on public functions, one line where possible.

## Git and PRs
- Always branch: `phase2-t<N>` for T tasks, `design-d<N>` for D tasks, a short descriptive name otherwise.
- Every PR bumps the version: minor for a T or D task, patch for anything else. Update `VERSION`, `server/pyproject.toml` and `client/package.json` together, then run `cd server && uv lock`.
- PR descriptions under 10 lines.

## Subagents
- Run at most one xhigh, two high or three medium subagents at a time.
- Check the remaining plan usage before you spawn one.

## Scope and replies
- Change only what the task asks for. Mention unrelated problems in your reply instead of fixing them.
- No summary markdown files unless asked.
- Reply with what changed and what I need to check, nothing more.
