# Stock Visualizer

Full stack app to visualize stock prices: **React** + **TypeScript** on the client, **Python FastAPI** on the server. The browser calls a local API which fetches from Yahoo Finance chart endpoints and returns normalized time series. Default ticker: **AAPL**.

## Monorepo layout

| Path | Description |
|------|-------------|
| `apps/web` | Vite + React + Recharts |
| `apps/api` | Python FastAPI service (`/api/prices`, `/api/health`, `/api/market-context`, `/api/report-bug`) |
| `packages/shared` | Shared types and constants |

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- Python 3.12+

## Install

```bash
bun install
python3 -m venv apps/api/.venv
apps/api/.venv/bin/python -m pip install -r apps/api/requirements.txt
```

## Develop

Run API and web together (concurrently on ports **3001** and **5173**):

```bash
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
| `CURSOR_API_KEY` | _(none)_ | Reserved for in-app **Report bug**. The Python API keeps validation and config errors compatible, but the previous TypeScript `@cursor/sdk` agent runner is not ported. |
| `CURSOR_MODEL` | `composer-2.5` | Reserved for a future report-bug agent runner |

Put optional API settings in the monorepo-root `.env` (loaded by the API on startup). Never expose secrets to the browser.

## API

- `GET /api/health` – health check.
- `GET /api/prices?ticker=AAPL&range=max&interval=1d` – normalized price series. `ticker`, `range`, and `interval` are validated server-side before proxying Yahoo chart data.
- `GET /api/market-context` – US market session state plus major index quotes.
- `POST /api/report-bug` – body `{ "message": "…" }` (1–4000 chars). The Python service preserves validation and typed config errors; the TypeScript Cursor SDK runner is deferred.

The web UI includes a **Report bug** control (bottom-right) that posts to `/api/report-bug`.

## Test

```bash
bun run test
```

(Runs from the repo root via `bun run test` in `package.json` → `apps/api` Pytest coverage for Yahoo parsers and FastAPI routes.)

## Typecheck

```bash
bun run typecheck
```

## Build (web)

```bash
bun run build
```

## Notes

- Yahoo Finance endpoints are **unofficial**; they may change or rate-limit. The API isolates parsing in `apps/api/stock_api/yahoo.py` and `apps/api/stock_api/yahoo_quote.py`.
- Do not call Yahoo directly from the browser; use the API to avoid CORS and to keep a single place for validation and parsing.
