# Stock Visualizer

Full stack app to visualize stock prices: **React** + **TypeScript** on the client, **Python FastAPI** on the server. The browser calls a local API which fetches from Yahoo Finance chart endpoints and returns normalized time series. Default ticker: **AAPL**.

## Monorepo layout

| Path | Description |
|------|-------------|
| `apps/web` | Vite + React + Recharts |
| `apps/api` | Python FastAPI (`/api/prices`, `/api/health`, `/api/market-context`, `/api/report-bug`) |
| `packages/shared` | Shared TypeScript types and constants (web client contracts) |

## Prerequisites

- [Bun](https://bun.sh) 1.3+ (web app and workspace scripts)
- [Python](https://www.python.org/) 3.11+ (API)

## Install

```bash
bun install
python3 -m venv apps/api/.venv
apps/api/.venv/bin/pip install -e "apps/api[dev]"
```

`bun run dev:api` / `run.py` prefer `apps/api/.venv` when it exists.

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

The Vite dev server proxies `/api/*` to `http://127.0.0.1:3001`, so the app uses same-origin fetches to `/api/prices`.

After data loads, use **Export CSV** to download the current series as one row per day (UTC date column). Broader “export by day” follow-ups are tracked in Linear as [CURSOR-21](https://linear.app/jemrick/issue/CURSOR-21/feature-export-stock-price-data-by-day).

### Environment (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | `Access-Control-Allow-Origin` for the API |
| `CURSOR_API_KEY` | _(none)_ | Cursor API key for in-app **Report bug**. Required for `POST /api/report-bug` to pass the config gate. The Python API keeps the same validation and error codes; the TypeScript `@cursor/sdk` local agent is not ported. |
| `CURSOR_MODEL` | `composer-2.5` | Unused by the Python API (documented for the previous SDK path). |

Create a key at [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). Put `CURSOR_API_KEY=…` in the monorepo-root `.env` (loaded by the API on startup). Never expose it to the browser.

## API

- `GET /api/health` – health check.
- `GET /api/prices?ticker=AAPL` – normalized price series. Optional `range` and `interval` query params (Yahoo allowlists); defaults are `range=max` and `interval=1d`.
- `GET /api/market-context` – US market session state plus major index quotes.
- `POST /api/report-bug` – body `{ "message": "…" }` (1–4000 chars). Validates the same as before. Missing `CURSOR_API_KEY` returns `503` / `CONFIG`. Running the Cursor local agent is deferred in this Python service (`502` / `UPSTREAM` when a key is set).

The web UI includes a **Report bug** control (bottom-right) that posts to `/api/report-bug`.

## Test

```bash
bun test
```

(Runs from the repo root via `package.json` → `apps/api` pytest: Yahoo `parse_result` / quote parsing and HTTP handler validation, including mocked upstream chart and quote responses.)

## Typecheck

```bash
bun run typecheck
```

(Web + shared TypeScript. The API is Python.)

## Build (web)

```bash
bun run build
```

## Notes

- Yahoo Finance endpoints are **unofficial**; they may change or rate-limit. The API isolates parsing in `apps/api/src/stock_api/yahoo.py` and `yahoo_quote.py`.
- Do not call Yahoo directly from the browser; use the API to avoid CORS and to keep a single place for validation and parsing.
