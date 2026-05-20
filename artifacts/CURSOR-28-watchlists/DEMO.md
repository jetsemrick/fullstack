# CURSOR-28 Watchlists — Feature demo

## Video walkthrough

Screen recording of the full flow (add symbols, switch chart, validation, reload persistence):

- **File:** `demo.mp4`
- **Runtime:** ~2 minutes (paced for review)

## Screenshot sequence

| Step | Screenshot | What it shows |
|------|------------|---------------|
| 1 | `demo-screenshots/01-aapl-default.webp` | App loads with default **AAPL** chart |
| 2 | `demo-screenshots/02-msft-added.webp` | **MSFT** added to watchlist; chart updates |
| 3 | `demo-screenshots/03-googl-added.webp` | **GOOGL** added; multiple chips visible |
| 4 | `demo-screenshots/04-msft-chip-selected.webp` | Click **MSFT** chip to refocus chart |
| 5 | `demo-screenshots/05-invalid-ticker-error.webp` | `!!!` rejected with inline validation |
| 6 | `demo-screenshots/06-reload-persistence.webp` | After reload: symbols persist, chart back to **AAPL** |
| 7 | `demo-screenshots/07-googl-after-reload.webp` | Click **GOOGL** after reload |
| 8 | `demo-screenshots/08-final-overview.webp` | Watchlist panel + chart in one view |

## Reproduce locally

```bash
bun install
bun run dev
# open http://localhost:5173
```

Follow the steps in the video or use **New / Rename / Delete** on watchlists from the panel header.
