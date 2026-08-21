---
name: start-local-dev-server
description: Starts local development servers for this monorepo using Bun and concurrently. Covers root `dev`, `dev:api`, `dev:web`, ports, and Vite proxy to the API. Use when starting the dev server, running locally, spinning up api/web together, mentioning localhost:5173 or :3001, or when verifying the Stock Visualizer app in the browser.
disable-model-invocation: false
---

# Start Local Dev Server

## Before starting

1. Use the git repository root (folder that contains root `package.json`, `apps/web`, and `apps/api`).
2. Prefer listing or checking existing terminals before starting another long‑running server to avoid duplicate processes or port conflicts.

## Prerequisites

Requires **Bun** 1.3+ and **Python** 3.11+ (`README.md`). Run once after clone or dependency changes:

```bash
bun install
python3 -m venv apps/api/.venv
apps/api/.venv/bin/pip install -e "apps/api[dev]"
```

## Commands (this repo)

| Goal | Command |
|------|---------|
| API + web together | `bun run dev` |
| API only | `bun run dev:api` |
| Web only | `bun run dev:web` |

From repo root (`package.json` uses `concurrently` to run `apps/api` and `apps/web`).

### Ports and routing

- **Web (Vite)**: default `http://localhost:5173`
- **API (Python FastAPI)**: default `http://localhost:3001` (`bun run dev:api` → `apps/api/run.py` / uvicorn)
- Vite proxies `/api/*` to the API—use same-origin `/api/...` from the browser.

### Optional env (API)

See `README.md`: `PORT` (default `3001`), `CORS_ORIGIN` (default `http://localhost:5173`).

## If scripts differ

If root `package.json` no longer matches the table above, read the root `scripts` section and prefer the documented **`dev`** (or **`start`**) entry; align with `README.md` “Develop” if present.

## Verification

After startup, **`GET http://localhost:3001/api/health`** should respond from the API; open the web URL and confirm the chart loads for the default ticker.
