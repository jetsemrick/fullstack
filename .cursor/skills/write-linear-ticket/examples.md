# Linear ticket examples

## Feature — intraday session shading

**Title:** `Feature: Add intraday session shading to price chart`

**Description:**

```markdown
Repository: jetsemrick/fullstack
> **Summary:** The Today chart shows grey bands for pre/post-market and a gradient fill under the price line so session context is obvious at a glance.
## Context
The intraday view is the hero demo surface. Right now the chart reads as a flat line with no visual cue for regular vs extended hours; session shading and a subtle area gradient will make the chart feel polished without changing data behavior.
## Scope
**In:** Grey reference bands for pre-market and after-hours on the Today horizon; gradient area fill under the price line (intraday only); reuse existing market-hours helpers in `usMarket.ts`. **Out:** Multi-day horizon styling; new data sources or API routes; chart load animation.
## Acceptance criteria
Today view shows distinct shading outside regular session (9:30–16:00 ET). Area gradient uses existing CSS accent tokens and remains readable in light and dark themes. Non-intraday horizons are unchanged. No layout shift or tooltip regression on hover.
## Verification
**Automated:** `bun test apps/web`. **Manual:** Run dev server, open app, select AAPL, choose Today — session bands visible when data exists; toggle dark mode and confirm gradient and bands remain legible; switch to 1M and confirm no session bands.
## Starting points
Chart in `apps/web/src/PriceChart.tsx`; session math in `apps/web/src/usMarket.ts`; tokens in `apps/web/src/index.css`.
## Risks and dependencies
**Risks:** Sparse intraday data may leave empty bands — handle gracefully. **Depends on:** none. **Blocks:** none.
```
