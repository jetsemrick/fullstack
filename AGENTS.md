# AGENTS.md

## Cursor Cloud specific instructions

### Services

| Service | Port | Command |
|---------|------|---------|
| Bun API server | 3001 | `bun run dev:api` |
| Vite web dev server | 5173 | `bun run dev:web` |
| Both together | 3001 + 5173 | `bun run dev` |

### Running

- Bun must be on `$PATH`. The update script ensures `~/.bun/bin` is available; if running manually, `export PATH="$HOME/.bun/bin:$PATH"`.
- `bun run dev` uses `concurrently` to start both servers. The Vite dev server proxies `/api/*` to `localhost:3001`.
- No database, Docker, or secrets are required. The API calls Yahoo Finance public endpoints (no API key).

### Testing and linting

- `bun test` — runs all tests (API route tests + web unit tests). All 17 tests pass.
- `bun run typecheck` — runs `tsc --noEmit` across all packages. Note: `apps/web/src/priceChartData.test.ts` triggers a TS error on `bun:test` import since it's outside Bun's type scope in the web tsconfig. This is a known pre-existing issue.
- `bun run --cwd apps/web lint` — ESLint. One pre-existing `react-hooks/set-state-in-effect` warning in `App.tsx`.

### Gotchas

- Yahoo Finance endpoints are unofficial and may intermittently rate-limit or change. If `/api/prices` returns errors, it's likely transient.
- The API server uses `Bun.serve()` directly (not Node-compatible). You cannot run it with `node`.
