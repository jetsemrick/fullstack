# Stock Visualizer

Full stack app to visualize stock prices: **React** + **TypeScript** on the client, **Go** on the server. The browser calls a local API which fetches from Yahoo Finance chart endpoints and returns normalized time series. Default ticker: **AAPL**.

## Monorepo layout

| Path | Description |
|------|-------------|
| `apps/web` | Vite + React + Recharts |
| `apps/api` | Go HTTP API (`/api/prices`, `/api/health`, `/api/market-context`, `/api/report-bug`) |
| `packages/shared` | Shared types and constants |

## Prerequisites

- [Bun](https://bun.sh) 1.3+ (web app, workspaces, and root scripts)
- [Go](https://go.dev/dl/) 1.22+ (API)

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
| `CURSOR_API_KEY` | _(none)_ | Optional. When unset, `POST /api/report-bug` returns 503. The Go API does not call the Cursor agent even if this is set. Set in the repo-root `.env` (gitignored). |

The API loads a repo-root `.env` on startup (gitignored) and does not override variables already set in the environment. Never commit secrets or expose them to the browser.

## API

- `GET /api/health` – health check.
- `GET /api/prices?ticker=AAPL` – normalized close series. Optional `range` and `interval` query params are allowlisted; omitted values default to Yahoo `range=max` and `interval=1d`.
- `GET /api/market-context` – US market session state plus major index quotes.
- `POST /api/report-bug` – body `{ "message": "…" }` (1–4000 chars after trim). Invalid bodies return 400. A missing `CURSOR_API_KEY` returns 503. The Go API does not run the Cursor agent; a configured key returns an error explaining that agent execution is deferred.

The web UI includes a **Report bug** control (bottom-right) that posts to `/api/report-bug`.

## Test

```bash
bun run test
```

(Root `test` runs `go test` in `apps/api`: Yahoo chart and quote parsing plus HTTP handler validation, including mocked upstream responses.)

## Typecheck

```bash
bun run typecheck
```

## Build (web)

```bash
bun run build
```

## Notes

- Yahoo Finance endpoints are **unofficial**; they may change or rate-limit. The API isolates parsing in `apps/api/internal/yahoo`.
- Do not call Yahoo directly from the browser; use the API to avoid CORS and to keep a single place for validation and parsing.
