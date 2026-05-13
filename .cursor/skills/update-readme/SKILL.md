---
name: update-readme
description: Maintains README.md accuracy for Stock Visualizer: monorepo layout, scripts, ports, proxy behavior, documented API endpoints, env vars table, prerequisites, tests, build, and product notes—without widening scope unnecessarily. Use when editing README.md, syncing docs after feature or script changes, onboarding updates, “document this in readme,” PR doc refresh, or when package.json/scripts or public API surfaces change.
disable-model-invocation: false
---

# Update README

## When to update

Prefer a README change when behavior or setup that **new contributors run** differs from what `README.md` says—especially:

- Root or workspace **`package.json`** `scripts`
- **`apps/web` / `apps/api`** tooling, ports, or dev proxy conventions
- **Public HTTP routes** and query parameters users or integrators rely on
- **Optional env vars** exposed by the API (names, defaults, purpose only)
- **Monorepo layout** (paths under `apps/*`, `packages/*`)
- **Prerequisites** (runtime versions, Bun)

Do **not** expand README into exhaustive architecture essays unless explicitly requested; mirror existing brevity.

## Security

- Document **required configuration by name**, defaults, and non-secret descriptions only.
- **Never** add real API keys, tokens, credential examples, or private URLs. For third-party quirks, describe behavior (e.g. rate limits), not payloads that could expose misuse.

## Conventions for this README

Preserve the established section pattern where possible:

| Section | Keep accurate |
|---------|----------------|
| Lead paragraph | Stack, data flow summary, notable default UX (e.g. default ticker) |
| Monorepo layout | Table: path → stack / role |
| Prerequisites | Minimal bullet list |
| Install / Develop | Commands that match root `scripts`; concurrent vs split terminals; port numbers; Vite `/api/*` proxy note |
| Environment (optional) | Markdown table `Variable \| Default \| Description` |
| API | Bullet list: method + path + one-line semantics (match server behavior and tests) |
| Test / Typecheck / Build | Commands from root `package.json` |
| Notes | Operational caveats (e.g. unofficial upstream endpoints, “call API not Yahoo from browser”) |

After edits, skim for **broken links**, **stale ticker examples**, **wrong ports**, **README promising scripts that do not exist** (or inverse).

## Workflow

1. Read current `README.md` and identify which sections are affected by the task.
2. Cross-check **repository root `package.json`** scripts and affected app `package.json` files if scripts or workspaces changed.
3. Cross-check **`apps/api`** route handlers / OpenAPI-ish comments if documenting API contracts.
4. Apply the smallest edit that restores truth; reuse existing tables and heading levels.
5. If a feature warrants a tracked issue link (as with Linear in the CSV export note), add only stable public links the team already uses—do not invent ticket URLs.
