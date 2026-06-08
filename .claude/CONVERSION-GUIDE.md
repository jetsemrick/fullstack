# Claude → Cursor conversion guide (demo)

Use this repo's `.claude/` folder as the **source** and `.cursor/` as the **target**. During the demo, fill in the `[FILL IN]` placeholders, then migrate each file using the mapping below.

## Directory mapping

| Claude (source) | Cursor (target) | Notes |
|-----------------|-----------------|-------|
| `.claude/CLAUDE.md` | `.cursor/rules/*.mdc` or root context | Split always-on context into rules with `alwaysApply: true` |
| `.claude/rules/*.md` | `.cursor/rules/*.mdc` | Rename extension; see frontmatter mapping |
| `.claude/skills/*/SKILL.md` | `.cursor/skills/*/SKILL.md` | Same layout; tweak frontmatter fields |
| `.claude/agents/*.md` | `.cursor/agents/*.md` | Same layout; add `model:` if desired |

## Frontmatter mapping

### Rules

**Claude** (`.claude/rules/foo.md`):

```yaml
---
paths:
  - "apps/web/**/*.tsx"
---
```

**Cursor** (`.cursor/rules/foo.mdc`):

```yaml
---
description: One-line summary for the rule picker
globs: apps/web/**/*.tsx
alwaysApply: false
---
```

| Claude | Cursor |
|--------|--------|
| No `paths` field (loads every session) | `alwaysApply: true` |
| `paths: ["apps/api/**"]` | `globs: apps/api/**` and `alwaysApply: false` |
| `.md` | `.mdc` |

### Skills

Both use `name` and `description` in YAML frontmatter. Cursor also supports `disable-model-invocation: false` to allow auto-invocation.

### Subagents

Both use `name`, `description`, and optional `model` in frontmatter. Cursor agent files live in `.cursor/agents/`.

## Demo workflow

1. **Fill in** placeholders in `.claude/rules/`, `.claude/skills/`, and `.claude/agents/`.
2. **Convert rules** — create or update matching `.mdc` files under `.cursor/rules/`.
3. **Convert skills** — copy filled `SKILL.md` files into `.cursor/skills/<name>/`.
4. **Convert subagents** — copy filled agent files into `.cursor/agents/`.
5. **Verify** — ask the agent to start the dev server, write a unit test, or review an API change; confirm the right rule/skill/agent triggers.

## Files in this demo

| Source | Target (when converted) | Status |
|--------|------------------------|--------|
| `rules/security-basics.md` | `rules/security-basics.mdc` | Partial — fill in security policy |
| `rules/frontend-design-schema.md` | `rules/frontend-design-schema.mdc` | Partial — fill in design tokens |
| `rules/api-conventions.md` | `rules/api-conventions.mdc` | New — fill in API patterns |
| `skills/start-local-dev-server/SKILL.md` | same path under `.cursor/` | Partial — fill in ports/commands |
| `skills/reset-demo/SKILL.md` | same path under `.cursor/` | Partial — fill in gh workflow |
| `skills/update-readme/SKILL.md` | same path under `.cursor/` | Partial — fill in README sections |
| `skills/run-api-tests/SKILL.md` | same path under `.cursor/` | New — fill in test commands |
| `agents/unit-test-writer.md` | same path under `.cursor/` | Partial — fill in test conventions |
| `agents/api-reviewer.md` | same path under `.cursor/` | New — fill in review checklist |

Reference implementations already exist in `.cursor/` for this repo — use them as the answer key after the demo, not during it.
