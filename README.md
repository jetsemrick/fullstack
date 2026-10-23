# Stock Visualizer

Full stack app to visualize stock prices: **React** + **TypeScript** on the client, **Go** (`net/http`) on the server. The browser calls a local API which fetches from Yahoo Finance chart endpoints and returns normalized time series. Default ticker: **AAPL**.

## Monorepo layout

| Path | Description |
|------|-------------|
| `apps/web` | Vite + React + Recharts |
| `apps/api` | Go HTTP API (`/api/prices`, `/api/market-context`, `/api/health`, `/api/report-bug`) |
| `apps/api/agent` | Bun script the Go API runs for `/api/report-bug` (the Cursor SDK is TypeScript-only) |
| `packages/shared` | Shared TypeScript types and constants (mirrored in `apps/api/internal/contract`) |

## Prerequisites

- [Bun](https://bun.sh) 1.3+ (workspace scripts, web app, report-bug agent bridge)
- [Go](https://go.dev/dl/) 1.22+ (API)

## Install

```bash
bun install
```

Go has no third-party dependencies; `go run` builds the API on first start.

## Develop

Run API and web together (concurrently on ports **3001** and **5173**):

```bash
bun run dev
```

Or run them separately:

```bash
# Terminal 1 — Go API on :3001 (equivalent to `cd apps/api && go run ./cmd/api`)
bun run dev:api

# Terminal 2 — Vite on :5173
bun run dev:web
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:3001`, so the app uses same-origin fetches to `/api/prices`. The Go API does not hot-reload; restart `dev:api` after editing Go code. To build a binary instead: `bun run --cwd apps/api build` (writes `apps/api/bin/api`).

After data loads, use **Export CSV** to download the current series as one row per day (UTC date column). Broader “export by day” follow-ups are tracked in Linear as [CURSOR-21](https://linear.app/jemrick/issue/CURSOR-21/feature-export-stock-price-data-by-day).

### Environment (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | `Access-Control-Allow-Origin` for the API |
| `CURSOR_API_KEY` | _(none)_ | Cursor user or service-account API key for in-app **Report bug** (local SDK agent). Required for `POST /api/report-bug`. Set in the repo-root `.env` (gitignored). |
| `CURSOR_MODEL` | `composer-2.5` | Model id passed to `@cursor/sdk` for report-bug runs |

Create a key at [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). Put `CURSOR_API_KEY=…` in the monorepo-root `.env` (loaded by the API on startup without overriding variables already set). Never expose it to the browser.

## API

- `GET /api/health` – health check.
- `GET /api/prices?ticker=AAPL[&range=max&interval=1d]` – normalized price series (`ticker`, `currency`, `lastPrice`, `series`). `range` and `interval` are optional, validated against an allowlist, and default to `max` / `1d`. Invalid input returns `400` with `{ error, code: "VALIDATION" }`; unknown symbols return `404 NOT_FOUND`; other Yahoo failures return `502 UPSTREAM`.
- `GET /api/market-context` – US market session state plus S&P 500, Dow, and Nasdaq quotes (Yahoo v7 quote, falling back to v8 chart meta when v7 is blocked).
- `POST /api/report-bug` – body `{ "message": "…" }` (1–4000 chars). The Go API validates the request, then runs `apps/api/agent/report-bug.ts` with Bun to start a local Cursor agent (`@cursor/sdk`) against the monorepo. Requires `CURSOR_API_KEY` (`503 CONFIG` when missing) and `bun` on `PATH`.

The web UI includes a **Report bug** control (bottom-right) that posts to `/api/report-bug`.

## Test

```bash
bun run test
```

(Runs `go test ./...` in `apps/api`: Yahoo chart/quote parsing, market-state inference, `.env` loading, the report-bug bridge, and HTTP handler validation and status mapping against a stubbed Yahoo server.)

## Typecheck

```bash
bun run typecheck
```

(Includes `go vet ./...` for the API.)

## Build (web)

```bash
bun run build
```

## Notes

- Yahoo Finance endpoints are **unofficial**; they may change or rate-limit. The API isolates fetching and parsing in `apps/api/internal/yahoo`.
- Do not call Yahoo directly from the browser; use the API to avoid CORS and to keep a single place for validation and parsing.
- When changing response shapes, update both `packages/shared/src/types.ts` and `apps/api/internal/contract/contract.go`.
