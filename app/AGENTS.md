# AGENTS.md — notes app

Guidance for an Agentic IDE working inside `app/`.

## Stack

- Node 22+, ESM (`"type": "module"`)
- Express for the HTTP layer
- SQLite via `better-sqlite3` (synchronous API — no await on queries)
- vitest + supertest for tests
- The UI is plain HTML/CSS/JS served statically. **No build step. No framework.**

## Commands

```bash
npm install
npm test        # vitest run
npm run dev     # http://localhost:3080 (writes notes.db)
```

Run these from `app/`, not the repo root — the root has no `package.json`,
and `npm install` there only leaves behind an empty lockfile.

## Dependencies

`package.json` cannot carry comments, so the reasoning lives here
(updated 2026-09-22):

- `better-sqlite3` `^12.11.1` — was `^11.5.0`. The 11.x line has no prebuilt
  binary for Node 24, so `npm install` fell back to compiling with node-gyp
  and failed on machines without Python and a C++ toolchain. 12.x ships
  Node 24 prebuilds; the API used here (`pragma`, `exec`, `prepare`,
  `transaction`) is unchanged. Do not downgrade below 12.
- `vitest` `^5.0.1` — was `^2.1.0`. `npm audit` flagged the 2.x chain
  (vitest, vite, vite-node, esbuild, @vitest/mocker) with one critical, one
  high and several moderate advisories. They concerned the vitest UI and vite
  dev server, which this project never runs, but the upgrade is the only way
  to a clean audit. `vitest run` needed no config or test changes.
- `npm audit` is expected to report **0 vulnerabilities**. If a new advisory
  appears, prefer `npm audit fix` (semver-compatible); reach for `--force` only
  after confirming `npm test` is still green.

## Architecture

- `src/db.js` — `createDb(file)` builds the schema and seeds it. Tests call it
  with `:memory:` so each test file is isolated; `server.js` passes a filename.
- `src/app.js` — `createApp(db)` returns the Express app. All routes live here.
  The `currentUser` middleware reads the `x-user-id` header and sets
  `req.userId`; everything under `/api` requires it.
- `src/server.js` — composition root. Nothing but wiring.
- `public/` — the UI. `app.js` there talks to the API with `fetch` and sends
  the same `x-user-id` header, chosen by the dropdown.

## Conventions

- Keep route handlers thin and readable; this code is meant to be reviewed.
- SQL goes through `db.prepare(...)` with **bound parameters**, never string
  concatenation.
- Tests are named after the behaviour they check, and each new route gets a
  test for the caller's own data **and** a test for someone else's.

## Guardrails

- **Scope every single-record query to the caller**, not only to the id.
  `WHERE id = ?` is almost never the whole condition in this app.
- Validate input **on the server**. `required` in the HTML does not count.
- Do not return columns the caller has no business seeing.
- Do not change the `x-user-id` scheme — simplified auth is intentional.
- Do not break the seeded users or tables; the tests depend on them.
- Never commit `notes.db`.
