---
name: browser-e2e-stock-visualizer
description: Runs agent-driven end-to-end verification of the Stock Visualizer (localhost) via the cursor-ide-browser MCP—dev server pre-flight, chart/volume matrix, console/network capture, mobile viewport, optional CPU profile, and a markdown report. Use after chart or dashboard changes, for CURSOR-22-style volume verification, or when the user asks for browser E2E, Glass browser QA, or MCP-driven smoke tests without Playwright.
disable-model-invocation: false
---

# Browser E2E — Stock Visualizer

Agent-driven session only (no checked-in Playwright). Uses **`cursor-ide-browser`** MCP tools against **`http://localhost:5173`** with API at **`http://localhost:3001`** (Vite proxies `/api`).

## Before testing

1. Repo root; dependencies installed (`bun install`).
2. Prefer one **`bun run dev`** process (see [.cursor/skills/start-local-dev-server/SKILL.md](../start-local-dev-server/SKILL.md)). Avoid duplicate servers / port conflicts.
3. Confirm **`GET http://localhost:3001/api/health`** returns OK and the web app loads.
4. **`browser_navigate`** to `http://localhost:5173/` (reuse tab unless a clean session is required).
5. **`browser_lock`** lock → run interactions → **`browser_lock`** unlock when finished.

## Per-matrix-row artifacts

For each scenario capture:

- Full-viewport or scoped **`browser_take_screenshot`** (save under `docs/` when the team wants artifacts in-repo).
- **`browser_snapshot`** (full page or **`selector: ".chart-container"`**).
- **`browser_console_messages`** (errors/warnings after steady state).
- **`browser_network_requests`** — note any **failed** requests (non-2xx where applicable).

On failure: keep going through the matrix; mark the row failed unless **four consecutive failures** or a hard crash (white screen / React error overlay) — then stop and report.

## Verification matrix (baseline)

Adapt tickers if APIs change; defaults match the Stock Visualizer UI.

| # | Scenario | Actions | Pass criteria |
|---|----------|---------|---------------|
| 1 | AAPL · All Time | Load default or click **All Time** | Price line visible; volume bars if series has volume; right axis shows compact volume scale (e.g. K/M/B); no console errors; no failed XHR |
| 2 | AAPL · 5 Year | Click **5 Year** | Chart updates; bars readable; price line above bars |
| 3 | AAPL · 1 Year | Click **1 Year** | Same as row 2 |
| 4 | AAPL · Today | Click **Today** | Intraday chart + volume; narrower bars than daily (`maxBarSize` tuning) |
| 5 | Tooltip | Hover a point (use **`browser_hover`** + snapshot refs, or **`browser_mouse_click_xy`** from a **fresh** viewport screenshot per MCP rules) | Tooltip shows **Close** and **Volume** where applicable; **`—`** for null volume |
| 6 | Sparse volume | Search **`^GSPC`** | Chart renders; partial/null volume handled; no crash |
| 7 | Zero volume | Symbol with **no** volume across series if known | No volume bar layer / no orphaned volume axis; price-only OK. If no symbol works, document **coverage gap** — do not fail the run |
| 8 | Invalid ticker | Search **`ZZZZZZ`** | Error banner; chart/card absent; no uncaught exceptions |
| 9 | Mobile | **`browser_resize`** `390` × `844` | Chart fits **`.chart-container`**; no obvious horizontal clipping |
| 10 | A11y | Snapshot chart wrapper | `aria-label` reflects current copy (e.g. price + volume wording for dual-axis chart) |
| 11 | Performance | On a heavy range (e.g. All Time): **`browser_profile_start`** → wait ~5s → **`browser_profile_stop`** | Record summary path; flag blockers if doc’d threshold exceeded (e.g. long tasks) |

## Wait strategy

Use **`browser_wait_for`** with **`text`** (e.g. `Export CSV`) or **`textGone`** (`Loading chart`) instead of blind long sleeps. Use short **`time`** waits only between snapshot retries.

## Deliverable — paste back as markdown

```markdown
# Stock Visualizer — Browser E2E Report

**Environment:** [date, branch/commit if known]
**Dev server:** [running | URL]

## Summary
[P rows passed / F failed / gaps]

## Matrix
| Row | Scenario | Result | Notes |
|-----|----------|--------|-------|

## Console
[clean | paste filtered errors/warnings]

## Network failures
[none | list]

## Performance
[profile path or N/A]

## Recommendation
[Ship / fix / follow-ups]

## Screenshots
[paths or embedded refs]
```

## Relation to tickets

This workflow matches the **browser-agent verification** section used for volume-on-chart (CURSOR-22) and can be reused for any chart, horizon, or export behavior—adjust the matrix rows and pass criteria only.
