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

Add up to **five** ticker symbols via **Add**; the chart overlays **indexed % change vs the first visible bar per symbol** by default (switch to raw **Close price** when you need absolute levels — scales differ heavily across symbols).

After data loads, use **Export CSV** to download the **primary ticker’s** visible series only (UTC date column; one ticker per export). Broader export follow-ups are tracked in Linear as [CURSOR-21](https://linear.app/jemrick/issue/CURSOR-21/feature-export-stock-price-data-by-day).

### Environment (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | `Access-Control-Allow-Origin` for the API |

## API

- `GET /api/health` – health check.
- `GET /api/prices?ticker=AAPL` – normalized Yahoo Finance chart series (close + optional volume timestamps). Omitting `range` / `interval` uses package defaults (**max** window, **1d** bars). Allowed `range`: `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`, `10y`, `ytd`, `max`. Allowed `interval`: `1m`, `2m`, `5m`, `15m`, `30m`, `60m`, `90m`, `1h`, `1d`, `5d`, `1wk`, `1mo`, `3mo`. Invalid values → `400 VALIDATION`.

The web UI calls `/api/prices` once **per ticker** using the horizons above (`1d`+`5m` for Today, multi-day ranges with `1d`, etc.).
- `GET /api/market-context` – aggregated US-market context (indexes and session hints) for the market strip.

## Test

```bash
bun test
```

(Runs API tests (`apps/api`) plus chart helper modules in `apps/web/src/**/*.test.ts` — Yahoo `parseResult`, HTTP handler validation, and comparison-merge helpers.)

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
