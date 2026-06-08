---
paths:
  - "[FILL IN: glob for apps/web TSX/CSS — e.g. apps/web/**/*.{tsx,css,html}]"
---

# Frontend design schema

> **Demo:** Fill in tokens from `apps/web/src/index.css`, then convert to `.cursor/rules/frontend-design-schema.mdc` with matching `globs` and `alwaysApply: false`.

Canonical tokens live in `apps/web/src/index.css` under `:root`. Treat that file as the **single source of truth**.

## Tokens (reference)

| Token | Role |
|-------|------|
| `[FILL IN]` | [FILL IN] |
| `[FILL IN]` | [FILL IN] |
| `[FILL IN]` | [FILL IN] |

## Rules

1. [FILL IN: Prefer CSS variables over hard-coded hex for layout chrome]
2. [FILL IN: Add new primitives in `:root` before using in components]
3. [FILL IN: Focus — `:focus-visible` with accent outline]
4. [FILL IN: Spacing — match existing patterns in `app.css`]

### Example

```css
/* Good */
.panel {
  /* [FILL IN: example using var(--card), var(--fg), etc.] */
}

/* Avoid */
.panel {
  /* [FILL IN: example of hard-coded colors to avoid] */
}
```

[FILL IN: Note on dark mode — extend same token names, don't branch per component]
