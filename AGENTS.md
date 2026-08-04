# AGENTS.md

## Cursor Cloud specific instructions

Stock Visualizer is a Bun monorepo (see `README.md`): `apps/api` (Bun HTTP API), `apps/web` (Vite + React + Recharts), `packages/shared` (shared types). The browser calls the local API, which fetches from Yahoo Finance.

### Runtime / setup
- Uses **Bun** (1.3.x), not npm/node, to install and run. The Bun binary lives at `/usr/local/bin/bun` (installed during environment setup because `bun.sh` is egress-blocked; it was fetched via the npm `bun` wrapper and copied to a stable PATH location). The startup update script runs `bun install`; you normally do not need to install anything yourself.
- Node/nvm is also present but only `bun` is used for this repo's scripts.

### Run / test / build (all from repo root)
- Dev servers: `bun run dev` (API on `:3001`, web on `:5173`; Vite proxies `/api/*` → `:3001`). See the `start-local-dev-server` skill. Prefer starting long-running servers under tmux.
- Tests: `bun test` (Bun test runner; 20 API/web unit tests). This is the reliable way to run tests.
- Lint (web only): `bun run --cwd apps/web lint`.

### Known gotcha: `bun run build` and `bun run typecheck` fail on a pre-existing config issue
- Both scripts run `tsc`, which compiles `apps/web/src/priceChartData.test.ts`. That file imports `bun:test`, but `apps/web/tsconfig.app.json` includes `src` while restricting `types` to `["vite/client"]`, so `tsc` errors with `Cannot find module 'bun:test'`. This is a repo config issue unrelated to environment setup — do not "fix" it as part of setup.
- The actual app builds fine: `apps/web/node_modules/.bin/vite build` succeeds, and the Vite dev server (`bun run dev`) does not typecheck, so development is unaffected.

### Yahoo Finance / network
- `GET /api/prices?ticker=AAPL` and `GET /api/market-context` fetch live Yahoo Finance endpoints. These are reachable from the cloud VM. If they ever start returning errors, suspect upstream rate-limiting/egress rather than a code bug.

### Optional: Report bug feature
- `POST /api/report-bug` and the web "Report bug" control require `CURSOR_API_KEY` in a repo-root `.env` (gitignored). Without it the API logs `CURSOR_API_KEY: missing` and that endpoint is disabled; everything else works.
