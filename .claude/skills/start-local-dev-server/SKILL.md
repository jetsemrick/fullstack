---
name: start-local-dev-server
description: "[FILL IN: Triggers — starting dev server, localhost:5173, :3001, verifying Stock Visualizer locally]"
---

# Start Local Dev Server

> **Demo:** Fill in commands and ports, then copy to `.cursor/skills/start-local-dev-server/SKILL.md`.

## Before starting

1. [FILL IN: Use repo root — folder with root `package.json`, `apps/web`, `apps/api`]
2. [FILL IN: Check existing terminals to avoid duplicate servers / port conflicts]

## Prerequisites

```bash
[FILL IN: e.g. bun install — when to run]
```

[FILL IN: Runtime version — e.g. Bun 1.3+]

## Commands (this repo)

| Goal | Command |
|------|---------|
| API + web together | `[FILL IN]` |
| API only | `[FILL IN]` |
| Web only | `[FILL IN]` |

### Ports and routing

- **Web (Vite):** [FILL IN: URL and port]
- **API (Bun):** [FILL IN: URL and port]
- **Proxy:** [FILL IN: e.g. Vite proxies `/api/*` — use same-origin from browser]

### Optional env (API)

[FILL IN: Table or list — PORT, CORS_ORIGIN, defaults from README]

## Verification

[FILL IN: Health check — e.g. GET `/api/health` on API port]

[FILL IN: UI check — open web URL, confirm chart loads for default ticker]
