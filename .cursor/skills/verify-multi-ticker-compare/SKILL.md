---
name: verify-multi-ticker-compare
description: Runs a repeatable browser E2E smoke test for Stock Visualizer multi-ticker comparison (CURSOR-23). Drives add/remove compare tickers, partial failure, duplicate cap, and horizon changes at localhost:5173. Use when verifying multi-ticker chart behavior, compare UX, CURSOR-23 acceptance, or after changes to App.tsx, PriceChart.tsx, or priceChartData.ts.
disable-model-invocation: false
---

# Verify Multi-Ticker Compare (E2E)

Repeatable browser smoke for **CURSOR-23**: overlay 2+ symbols on one chart with legend, partial failures, and horizon switching.

## Prerequisites

1. Repo root with `apps/web` and `apps/api`.
2. Dev stack running — follow [start-local-dev-server](../start-local-dev-server/SKILL.md) if needed (`bun run dev`).
3. Confirm API health: `GET http://localhost:3001/api/health` → `200`.
4. Target URL: `http://localhost:5173`.

## Browser workflow

Use **cursor-ide-browser** MCP. Order: `browser_navigate` → `browser_lock` → actions → `browser_unlock`.

After each fetch-heavy action (Search, Compare, remove chip, horizon change), wait ~3s or poll `browser_snapshot` until loading skeleton disappears.

### Task progress

```
- [ ] Step 1: Default chart loads (AAPL)
- [ ] Step 2: Add MSFT via Compare
- [ ] Step 3: Add NVDA (3-ticker overlay)
- [ ] Step 4: Partial failure with invalid ticker
- [ ] Step 5: Duplicate ticker rejected
- [ ] Step 6: Remove one ticker
- [ ] Step 7: Switch to 1 Year horizon
```

### Step 1 — Default load

1. Navigate to `http://localhost:5173`.
2. Expect: Search enabled, heading **AAPL**, single-series chart, **Export CSV** visible.
3. Fail if: error banner only, perpetual loading skeleton, or Search stays disabled after ~10s.

### Step 2 — Add MSFT

1. Fill **Add ticker to compare** with `MSFT`.
2. Click **Compare**.
3. Expect:
   - Two compare chips (AAPL, MSFT) with remove buttons.
   - Legend shows AAPL + MSFT with distinct colors.
   - Note: *Chart shows percent change from horizon start for each symbol.*
   - Two lines on chart; Y-axis in percent.
   - Footer: *Export CSV is available for the primary symbol (AAPL) only.*

### Step 3 — Add NVDA

1. Fill compare input with `NVDA`, click **Compare**.
2. Expect: three chips, three legend entries, three lines. Chart remains interactive.

### Step 4 — Partial failure

1. Fill compare input with `!!!INVALID`, click **Compare**.
2. Expect:
   - Amber status banner: `Some symbols failed to load: !!!INVALID (Invalid ticker format)`.
   - Valid tickers still charted (app not blank).
   - Failed symbol does not get a chip with price data.

### Step 5 — Duplicate rejection

1. Fill compare input with `AAPL`, click **Compare`.
2. Expect: status `AAPL is already on the chart`; ticker count unchanged.

### Step 6 — Remove ticker

1. Click **Remove MSFT from chart** (or × on MSFT chip).
2. Expect: MSFT chip and legend entry gone; AAPL + remaining symbols still charted.

### Step 7 — Horizon switch

1. Click **1 Year**.
2. Expect: chart reloads with date-based X-axis (months); compare chips update; multi-line chart still renders.

## Pass criteria (CURSOR-23)

| Check | Pass |
|-------|------|
| ≥2 tickers on one chart | Legend + distinct lines |
| Partial failure | Banner + chart still usable |
| Duplicate / cap UX | Inline notice, no crash |
| Remove ticker | Chart updates without full reload failure |
| Horizon change | Compare mode survives |
| Primary CSV | Export hint names primary symbol |

## Automated baseline (run first when possible)

From repo root:

```bash
bun run typecheck
bun test
```

Web unit coverage for transforms: `apps/web/src/priceChartData.test.ts`.

## Report template

```markdown
## Multi-ticker E2E — [pass/fail]

**Environment:** localhost:5173, [date]

| Step | Result | Notes |
|------|--------|-------|
| 1 Default AAPL | | |
| 2 Add MSFT | | |
| 3 Add NVDA | | |
| 4 Invalid ticker | | |
| 5 Duplicate AAPL | | |
| 6 Remove MSFT | | |
| 7 1 Year horizon | | |

**Blockers:** [none / describe]
**Follow-up:** [fix / unit test / none]
```

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Search disabled forever | API down or Vite proxy broken — check `:3001` |
| All tickers fail | Yahoo upstream; retry or check network |
| Vite parse error in App.tsx | Fix compile error before E2E |
| Invalid ticker not in banner | Ticker rejected client-side before fetch — still pass if notice shown |

## Out of scope

- Batch API (`/api/prices/batch`) — not required for Option A.
- Portfolio math, watchlists, or CSV multi-symbol export.
