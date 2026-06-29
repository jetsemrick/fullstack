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

### Multi-ticker comparison

Compare up to **5** symbols on one chart:

1. Search for a primary ticker (e.g. AAPL).
2. Use **Compare** to add additional symbols (e.g. MSFT, NVDA).
3. Each symbol gets a distinct line color and chip in the toolbar legend.
4. Lines show **absolute close prices** on a shared Y-axis.
5. If one symbol fails to load, a warning banner appears and successful symbols still render; failed chips can be removed.
6. **Export CSV** downloads the **primary** ticker only.

Horizon buttons (Today, 1 Year, 5 Year, All Time) apply to all compared symbols.

### Environment (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | `Access-Control-Allow-Origin` for the API |

## API

- `GET /api/health` – health check.
- `GET /api/prices?ticker=AAPL&range=1y&interval=1d` – normalized price series. Query params:
  - `ticker` – symbol (defaults to AAPL)
  - `range` – Yahoo chart range (`1d`, `1y`, `5y`, `max`, etc.)
  - `interval` – bar interval (`5m`, `1d`, etc.)

The web app fetches one symbol per request; multi-ticker comparison uses parallel client calls to this endpoint.

## Test

```bash
bun test
```

(Runs from the repo root via `bun test` in `package.json` → `apps/api` tests: Yahoo `parseResult` and HTTP handler validation, including a mocked upstream chart response.)

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
