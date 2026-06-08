---
paths:
  - "apps/api/**/*"
---

# API conventions

> **Demo:** New rule — fill in, then create `.cursor/rules/api-conventions.mdc` with `globs: apps/api/**/*`.

## Route handlers

[FILL IN: Where routes are defined — e.g. `apps/api/src/routes.ts`, `handleApiRequest`]

[FILL IN: How to test routes — `new Request(...)`, expected status codes]

## Input validation

[FILL IN: Validate and normalize query params and path segments on the server]

[FILL IN: Reject invalid input with clear 4xx and typed error bodies]

## Upstream data (Yahoo)

[FILL IN: Parse defensively in `yahoo.ts` / `yahoo-quote.ts`]

[FILL IN: Map upstream failures to 502, not raw stack traces to clients]

## Error responses

```ts
// [FILL IN: Example error response shape the API should return]
```

## Tests

[FILL IN: Test runner — `bun test` under `apps/api/tests/`]

[FILL IN: Fixtures location — `apps/api/tests/fixtures/`]
