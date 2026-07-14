# Stock Visualizer

Full stack app to visualize stock prices: **React** + **TypeScript** on the client, **Bun** on the server. The browser calls a local API which fetches from Yahoo Finance chart endpoints and returns normalized time series. Default ticker: **AAPL**.

## Monorepo layout

| Path | Description |
|------|-------------|
| `apps/web` | Vite + React + Recharts |
| `apps/api` | Bun HTTP API (`/api/prices`, `/api/health`, `/api/report-bug`) |
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

Use **Buy-at-date backtest** to enter a ticker, positive share volume, and past trade date. The app uses the first daily close on or after that date and shows the resulting cost basis, market value, and unrealized profit or loss through the latest close.

### Environment (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | `Access-Control-Allow-Origin` for the API |
| `CURSOR_API_KEY` | _(none)_ | Cursor user or service-account API key for in-app **Report bug** (local SDK agent). Required for `POST /api/report-bug`. Set in the repo-root `.env` (gitignored). |
| `CURSOR_MODEL` | `composer-2.5` | Model id passed to `@cursor/sdk` for report-bug runs |

Create a key at [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). Put `CURSOR_API_KEY=…` in the monorepo-root `.env` (loaded by the API on startup). Never expose it to the browser.

## API

- `GET /api/health` – health check.
- `GET /api/prices?ticker=AAPL` – normalized daily price series for a fixed **1 month** window (Yahoo `range=1mo`, `interval=1d` on the server; not configurable per request).
- `GET /api/market-context` – US market session state plus major index quotes.
- `POST /api/report-bug` – body `{ "message": "…" }` (1–4000 chars). Runs a local Cursor agent (`@cursor/sdk`) against the monorepo to apply the requested edit. Requires `CURSOR_API_KEY`.

The web UI includes a **Report bug** control (bottom-right) that posts to `/api/report-bug`.
## Test

```bash
bun test
```

(Runs from the repo root via `bun test` in `package.json` → `apps/api` tests: Yahoo `parseResult` and HTTP handler validation, including a mocked upstream chart response.)

## Typecheck

```bash
bun run typecheck
```

## Lint

```bash
bun run lint
```

## Build (web)

```bash
bun run build
```

## Notes

- Yahoo Finance endpoints are **unofficial**; they may change or rate-limit. The API isolates parsing in `apps/api/src/yahoo.ts`.
- Do not call Yahoo directly from the browser; use the API to avoid CORS and to keep a single place for validation and parsing.
