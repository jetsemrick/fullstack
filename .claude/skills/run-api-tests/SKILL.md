---
name: run-api-tests
description: "[FILL IN: Triggers — run API tests, verify route changes, bun test apps/api, before finishing API work]"
---

# Run API Tests

> **Demo:** New skill — fill in, then create `.cursor/skills/run-api-tests/SKILL.md`.

## When to run

- [FILL IN: After changing `apps/api/src/` routes or Yahoo parsing]
- [FILL IN: Before marking API work complete]
- [FILL IN: When user asks to verify or regression-test the API]

## Commands

From repo root:

```bash
[FILL IN: e.g. bun test]
```

Narrow run (API only):

```bash
[FILL IN: e.g. cd apps/api && bun test]
```

Single file:

```bash
[FILL IN: e.g. bun test apps/api/tests/routes.test.ts]
```

## What to check

- [FILL IN: All tests pass]
- [FILL IN: New routes have matching tests in `apps/api/tests/`]
- [FILL IN: Fixtures updated if Yahoo response shape changed]

## On failure

1. [FILL IN: Read failure output; identify route vs parser vs fixture issue]
2. [FILL IN: Fix production code or test — prefer fixing code if behavior regressed]
3. [FILL IN: Re-run until green; report command and outcome]
