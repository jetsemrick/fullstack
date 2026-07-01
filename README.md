# Stock Visualizer

Full stack app to visualize stock prices: **React** + **TypeScript** on the client, **Bun** on the server. The browser calls a local API which fetches from Yahoo Finance chart endpoints and returns normalized time series. Default ticker: **AAPL**.

## Monorepo layout

| Path | Description |
|------|-------------|
| `apps/web` | Vite + React + Recharts |
| `apps/api` | Bun HTTP API (`/api/prices`, `/api/health`) |
| `packages/shared` | Shared types and constants |

## Prerequisites

- [Bun](https://bun.sh) 1.3+

## Install

```bash
bun install
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
| `USE_SEED_DATA` | *(unset)* | When `1`, `true`, or `yes`, the API serves deterministic fixture data instead of calling Yahoo (offline demo mode) |

### Offline demo (seed data)

For repeatable demos without live Yahoo Finance, start the API with seed mode enabled:

```bash
USE_SEED_DATA=1 bun run dev
```

Or API only:

```bash
USE_SEED_DATA=1 bun run dev:api
```

**Behavior:** `/api/prices` and `/api/market-context` return stable JSON fixtures. Yahoo is not contacted. Supported price tickers: **AAPL**. Unknown tickers (e.g. `MISSING`) still return **404** `NOT_FOUND`.

**Verify:**

```bash
USE_SEED_DATA=1 bun run dev:api
curl -s "http://localhost:3001/api/prices?ticker=AAPL" | head
curl -s "http://localhost:3001/api/prices?ticker=MISSING"
```

Do **not** enable `USE_SEED_DATA` in production unless you intend to serve fixtures.

## API

- `GET /api/health` – health check.
- `GET /api/prices?ticker=AAPL&range=1y&interval=1d` – normalized price series. Query params `range` and `interval` are optional (defaults: `max` / `1d` from shared constants). Invalid values return **400**.
- `GET /api/market-context` – major US index quotes (S&P 500, Dow, Nasdaq) for the market strip.

## Test

```bash
bun test
```

(Runs from the repo root via `bun test` in `package.json` → `apps/api` tests: Yahoo `parseResult`, seed-data fixtures, and HTTP handler validation including mocked upstream responses and offline seed mode.)

## Typecheck

```bash
bun run typecheck
```

## Build (web)

```bash
bun run build
```

## Notes

- Yahoo Finance endpoints are **unofficial**; they may change or rate-limit. The API isolates parsing in `apps/api/src/yahoo.ts`.
- Do not call Yahoo directly from the browser; use the API to avoid CORS and to keep a single place for validation and parsing.
