# AGENTS.md

## Cursor Cloud specific instructions

Stock Visualizer is a Bun monorepo (`bun` 1.3+ is the runtime and package manager). Standard commands live in `README.md` and root `package.json`; prefer those. Notes below are the non-obvious bits.

### Services
- `apps/api` — Bun HTTP API on `http://localhost:3001` (`/api/health`, `/api/prices`, `/api/market-context`, `/api/report-bug`).
- `apps/web` — Vite + React dev server on `http://localhost:5173`. Vite proxies `/api/*` to the API, so the browser uses same-origin `/api/...`.
- `packages/shared` — shared types/constants consumed by both apps.

### Running
- `bun run dev` starts API + web together (via `concurrently`). `bun run dev:api` / `bun run dev:web` run them individually.
- The API fetches live data from **unofficial Yahoo Finance** endpoints, so the app needs outbound network access and can rate-limit or change shape; parsing is isolated in `apps/api/src/yahoo.ts`.

### Lint / test / typecheck
- Tests: `bun test` (root) runs the `apps/api` + `apps/web` unit tests.
- Lint: only `apps/web` has ESLint — `bun run --cwd apps/web lint`.
- Typecheck: `bun run typecheck`. Known pre-existing failure: `apps/web` typecheck reports `Cannot find module 'bun:test'` for `apps/web/src/priceChartData.test.ts` because the web `tsconfig.app.json` doesn't include Bun types. This is unrelated to environment setup; `bun test` itself passes.

### Report-bug endpoint
- `POST /api/report-bug` needs `CURSOR_API_KEY` in a repo-root `.env` (gitignored). Without it the endpoint returns 503 by design; the rest of the app works fine without it.
