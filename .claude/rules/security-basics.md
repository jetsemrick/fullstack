# Security basics

> **Demo:** Fill in each section, then convert to `.cursor/rules/security-basics.mdc` with `alwaysApply: true` and no `globs`.

## Secrets and config

[FILL IN: Policy for API keys, tokens, and credentials — env vars, never commit secrets, README documents names only]

[FILL IN: Logging policy — redact secrets, auth headers, and PII in logs and client errors]

## Trust boundaries

[FILL IN: Server-side validation rule — query params, body, path; reject with typed 4xx bodies]

[FILL IN: External API data — parse defensively, no raw HTML/JSON to `dangerouslySetInnerHTML` or `eval`]

## Network and CORS

[FILL IN: Call third-party APIs from backend when possible]

[FILL IN: CORS — narrow origins in production, not `*`]

## Dependencies and surface

[FILL IN: Minimal deps; audit on security-sensitive changes]

[FILL IN: Security headers in production — CSP, etc.]

## Example: server input

```ts
// BAD: [FILL IN — one-line anti-pattern]
// GOOD: [FILL IN — one-line preferred pattern]
```

## User-generated content

[FILL IN: If forms/uploads are added later — sanitize, size limits, path traversal]
