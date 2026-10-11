# Jolly Boar Inn

Kahoot-style OSRS quiz game. Server: Python 3.14, FastAPI, asyncpg with hand-written SQL (no ORM), Postgres 18. Client: Svelte 5 with runes, Vite SPA, TypeScript (no SvelteKit). Use uv and pnpm, never pip or npm.

## Commands
- `make setup` installs everything. `make dev` starts Postgres in Docker, the server on :8000 and the client on :5173.
- Before a PR: `make lint` and the tests that cover what changed (touched modules, files that import them, `pnpm test` for client changes), against the real database. Run full `make test` when touching migrations, the websocket protocol, `conftest.py` or `rooms/state.py`. CI runs everything; a PR isn't done until CI is green. A run where database tests skipped doesn't count.
- One server test: `cd server && DATABASE_URL_TEST=postgresql://jbi:jbi@localhost:5432/jbi uv run pytest tests/test_x.py` (run `make db-up` first). Without `DATABASE_URL_TEST`, database tests skip silently.
- One client test: `cd client && pnpm test src/lib/x.test.ts`.

## Architecture
- One uvicorn worker holds all room state in memory. Never assume several workers.
- Migrations are numbered `.sql` files in `server/app/migrations/`. Add a new one; never edit an existing one.
- Session tokens travel only in POST bodies and the first websocket frame, never in a URL. Admin rights come from `player.role` on the server.

## Docs
- `ideas/architecture.md` describes the current architecture and wins over older notes. Read the section you need, not the whole file.
- Read `ideas/design.md` only for frontend work. Tasks are GitHub issues (`gh issue view <N>`), labelled `feature`, `design` or both, with their dependencies as "blocked by" links.
- When updating a doc, the result must be the same length or shorter unless new functionality requires more. Replace outdated text; never append next to it.

## Decisions
- Before starting an issue, read it and the architecture.md sections it touches. Tell me where they look wrong or underspecified for this task, and wait for my answers before coding.
- Before starting an issue, read the issues on its `Related:` line too. Propose taking the small ones (a bug, a tweak, a few files) into the same PR; never a placeholder or a large feature.
- Ask before deciding anything a player can see, or anything in the websocket protocol, the database schema, scoring or room settings. Decide internal details yourself and list them in your reply.
- Departing from architecture.md needs my OK. Then update architecture.md in the same PR.
- As long as we are on major version 0, there is no need to take compatibility with previous versions into account.

## Tests
- Behavior changes come with tests. A bug fix starts with a test that fails without the fix. Each accept criterion in an issue is a test unless it says "manual".
- Never weaken, skip or delete a test to get green. If a test looks wrong, tell me.

## Code style
- Comments explain why, never what. No comments restating the code, no commented-out code, no issue numbers or old task IDs (T22, D9).
- Docstrings on public functions, one line where possible.

## Git and PRs
- Always branch: `<N>-<slug>` for issue N (`82-release-order`), a short descriptive name otherwise. A PR for an issue says `Closes #N`, one line per issue it closes.
- Every PR bumps the version once, however many issues it closes: minor if any is a `feature` or `design` issue, patch otherwise. Update `VERSION`, `server/pyproject.toml` and `client/package.json` together, then run `cd server && uv lock`.
- PR descriptions under 10 lines.
- Update project board

## Subagents
- Run at most one xhigh, two high or three medium subagents at a time.
- Check the remaining plan usage before you spawn one.

## Scope and replies
- Change only what the task asks for. Mention unrelated problems in your reply instead of fixing them.
- No summary markdown files unless asked.
- Reply with what changed and what I need to check, nothing more.
