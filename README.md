# Stock Visualizer

Full stack app to visualize stock prices: **React** + **TypeScript** on the client, **Python FastAPI** on the server. The browser calls a local API which fetches from Yahoo Finance chart endpoints and returns normalized time series. Default ticker: **AAPL**.

## Monorepo layout

| Path | Description |
|------|-------------|
| `apps/web` | Vite + React + Recharts |
| `apps/api` | Python FastAPI (`/api/prices`, `/api/health`, `/api/market-context`, `/api/report-bug`) |
| `packages/shared` | Shared TypeScript types and constants (web client) |

## Prerequisites

- [Bun](https://bun.sh) 1.3+ (workspace scripts and web app)
- Python 3.11+ with `pip`

## Install

```bash
bun install
bun run --cwd apps/api install:py
```

## Develop

Run API and web together (concurrently on ports **3001** and **5173**):

```bash
bun run dev
```

Or run them separately:

```bash
# Terminal 1 — Python API (uvicorn on 3001)
bun run dev:api

# Terminal 2 — Vite web
bun run dev:web
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:3001`, so the app uses same-origin fetches to `/api/prices`.

After data loads, use **Export CSV** to download the current series as one row per day (UTC date column). Broader “export by day” follow-ups are tracked in Linear as [CURSOR-21](https://linear.app/jemrick/issue/CURSOR-21/feature-export-stock-price-data-by-day).

### Environment (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | `Access-Control-Allow-Origin` for the API |
| `CURSOR_API_KEY` | _(none)_ | Required for a successful report-bug agent run. The Python API validates the key and request body but **defers** `@cursor/sdk` agent execution (TypeScript-only SDK). |
| `CURSOR_MODEL` | `composer-2.5` | Reserved for a future Python agent integration; unused by the current stub. |

Create a key at [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). Put `CURSOR_API_KEY=…` in the monorepo-root `.env` (loaded by the API on startup). Never expose it to the browser.

## API

- `GET /api/health` – health check (`{ "ok": true }`).
- `GET /api/prices?ticker=AAPL` – normalized price series (`ticker`, `currency`, `lastPrice`, `series`). Optional `range` / `interval` query params (Yahoo allowlists); defaults match shared constants (`max` / `1d`).
- `GET /api/market-context` – US market session state plus major index quotes.
- `POST /api/report-bug` – body `{ "message": "…" }` (1–4000 chars). Validates input and `CURSOR_API_KEY`; agent execution is stubbed in Python (see env table).

The web UI includes a **Report bug** control (bottom-right) that posts to `/api/report-bug`.

## Test

```bash
bun run test
```

Runs the Python API pytest suite under `apps/api` (Yahoo parse coverage and HTTP route validation with mocked upstream responses).

## Typecheck

```bash
bun run typecheck
```

(Shared package + web; the API is typed with Python.)

## Build (web)

```bash
bun run build
```

## Notes

- Yahoo Finance endpoints are **unofficial**; they may change or rate-limit. The API isolates parsing in `apps/api/app/yahoo.py` and `apps/api/app/yahoo_quote.py`.
- Do not call Yahoo directly from the browser; use the API to avoid CORS and to keep a single place for validation and parsing.
