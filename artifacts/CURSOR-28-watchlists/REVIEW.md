# CURSOR-28 — Watchlists review artifact

## Summary

Implements client-side named watchlists for Stock Visualizer with `localStorage` persistence (`stock-visualizer-watchlists-v1`).

## What to review

| Area | Path |
|------|------|
| Shared ticker validation | `packages/shared/src/ticker.ts` |
| Watchlist state + storage | `apps/web/src/watchlists.ts` |
| UI panel | `apps/web/src/WatchlistPanel.tsx` |
| App integration | `apps/web/src/App.tsx` |
| Styles | `apps/web/src/app.css` (`.watchlist-*`) |

## Verification (already run)

```bash
bun run typecheck   # pass
bun test            # 28 pass
bun run build       # pass → apps/web/dist
```

## Manual smoke test

1. `bun run dev` → http://localhost:5173
2. Add `MSFT` to watchlist → chart loads MSFT
3. Reload → watchlist and symbols persist; chart still defaults to **AAPL** on fresh session ticker state
4. Export CSV while a watchlist symbol is selected
5. Add `!!!` → inline validation error (no API call)

## Production build preview

```bash
cd apps/web && bun run preview
# or serve artifacts/CURSOR-28-watchlists/web-dist with any static server
```

Built assets are in `web-dist/` in this folder.
