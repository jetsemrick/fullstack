# Stock Visualizer

> **Demo source file.** After filling in placeholders below, migrate persistent instructions to `.cursor/rules/` (see `.claude/CONVERSION-GUIDE.md`).

Full stack stock price visualizer: React + TypeScript (`apps/web`), Bun API (`apps/api`), shared types (`packages/shared`).

## Quick reference

[FILL IN: Default dev command — e.g. `bun run dev` from repo root]

[FILL IN: Web port and API port — e.g. 5173 and 3001]

[FILL IN: How the browser reaches the API — e.g. Vite proxies `/api/*`]

## Always do

- [FILL IN: e.g. Run `bun test` before finishing API changes]
- [FILL IN: e.g. Never commit secrets; use env vars]
- [FILL IN: e.g. Validate server inputs; browser is untrusted]

## Project layout

| Path | Role |
|------|------|
| `apps/web` | [FILL IN] |
| `apps/api` | [FILL IN] |
| `packages/shared` | [FILL IN] |

## Modular config

Detailed rules, skills, and subagents live under `.claude/`:

- **Rules** — `.claude/rules/` (security, frontend tokens, API conventions)
- **Skills** — `.claude/skills/` (dev server, tests, README, demo reset)
- **Subagents** — `.claude/agents/` (unit-test-writer, api-reviewer)
