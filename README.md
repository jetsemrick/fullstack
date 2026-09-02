# Stock Visualizer

Full stack app to visualize stock prices: **React** + **TypeScript** on the client and **Python** + **FastAPI** on the server. The browser calls a local API which fetches from Yahoo Finance chart endpoints and returns normalized time series. Default ticker: **AAPL**.

## Monorepo layout

| Path | Description |
|------|-------------|
| `apps/web` | Vite + React + Recharts |
| `apps/api` | Python FastAPI service (`/api/prices`, `/api/health`, `/api/market-context`, `/api/report-bug`) |
| `packages/shared` | Shared types and constants |

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- Python 3.11+

## Install

```bash
bun install
python3 -m venv apps/api/.venv
source apps/api/.venv/bin/activate
python3 -m pip install -r apps/api/requirements.txt
```

## Develop

Activate the Python environment, then run API and web together (concurrently on ports **3001** and **5173**):

```bash
source apps/api/.venv/bin/activate
bun run dev
```

Or run them separately:

```bash
# Terminal 1
bun run dev:api

# Terminal 2
bun run dev:web
```

The Vite dev server proxies `/api/*` to `http://localhost:3001`, so the app uses same-origin fetches to `/api/prices`.

After data loads, use **Export CSV** to download the current series as one row per day (UTC date column). Broader “export by day” follow-ups are tracked in Linear as [CURSOR-21](https://linear.app/jemrick/issue/CURSOR-21/feature-export-stock-price-data-by-day).

### Environment (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | `Access-Control-Allow-Origin` for the API |

## API

- `GET /api/health` – health check.
- `GET /api/prices?ticker=AAPL` – normalized price series. Optional allowlisted Yahoo `range` and `interval` query parameters default to `max` and `1d`.
- `GET /api/market-context` – US market session state plus major index quotes.
- `POST /api/report-bug` – validates body `{ "message": "…" }` (1–4000 chars), then returns a typed `503 CONFIG` response. The previous `@cursor/sdk` implementation is TypeScript-only and is intentionally deferred from the Python migration.

The web UI includes a **Report bug** control (bottom-right) that posts to `/api/report-bug`.
## Test

```bash
source apps/api/.venv/bin/activate
bun test
```

(Runs the Python API route and Yahoo parser tests through `pytest`.)

## Typecheck

```bash
bun run typecheck
```

## Build (web)

```bash
bun run build
```

## Notes

- Yahoo Finance endpoints are **unofficial**; they may change or rate-limit. The API isolates fetching and defensive parsing in `apps/api/app/yahoo.py`.
- Do not call Yahoo directly from the browser; use the API to avoid CORS and to keep a single place for validation and parsing.
