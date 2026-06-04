# AGENTS.md

Guidance for AI agents working in this repository.

## Project overview

**Stock Visualizer** — Bun monorepo with React/Vite web app (`apps/web`) and Bun HTTP API (`apps/api`). Yahoo Finance data is fetched server-side; the browser uses same-origin `/api/*` via Vite proxy.

See `README.md` for install, dev, test, and build commands.

## Cursor Cloud specific instructions

### Runtime

- **Bun 1.3+** is required (API server, package manager, test runner). If `bun` is missing, install from https://bun.sh and ensure `~/.bun/bin` is on `PATH`.
- No Docker, database, or API keys are needed for local development.

### Start dev servers

From repo root (see also `.cursor/skills/start-local-dev-server/SKILL.md`):

```bash
bun run dev
```

This starts both services via `concurrently`:

| Service | URL |
|---------|-----|
| Web (Vite) | http://localhost:5173 |
| API (Bun) | http://localhost:3001 |

Quick API check: `curl http://localhost:3001/api/health` → `{"ok":true}`.

Use a tmux session for long-running dev servers in Cloud Agent VMs (avoid one-shot background shells).

### Lint, test, typecheck, build

| Command | Scope |
|---------|--------|
| `bun test` | All tests (API + web unit tests via Bun) |
| `bun run typecheck` | Shared, API, and web TypeScript |
| `bun run --cwd apps/web lint` | ESLint (web only) |
| `bun run build` | Web production build (`tsc -b && vite build`) |

**Known repo quirks (as of setup):**

- `bun run typecheck` and `bun run build` can fail on `apps/web/src/priceChartData.test.ts` because `bun:test` types are not in the web `tsconfig`. `bun test` still passes.
- `bun run --cwd apps/web lint` may report a pre-existing `react-hooks/set-state-in-effect` warning in `App.tsx`.

### External dependency

Live charts need network access to Yahoo Finance (`query1.finance.yahoo.com`). Unit tests mock upstream responses; browser verification requires outbound internet.

### Hello-world verification

1. `bun install && bun run dev`
2. Open http://localhost:5173 — default ticker **AAPL** should show a price chart and market strip.
3. Toggle time ranges (e.g. **1Y**, **5Y**) to confirm the chart updates.
