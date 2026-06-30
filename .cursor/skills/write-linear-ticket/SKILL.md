---
name: write-linear-ticket
description: Draft and create beautifully formatted Linear issues with consistent structure, typography, and agent-ready sections. Use when writing, creating, or refining Linear tickets, issues, or backlog items — including via Linear MCP save_issue.
---

# Write Linear Ticket

Create compact, dense Linear issues. Prose over lists. No emojis.

Also load **`mcp-linear`** for team/project config and MCP tool usage. Read `configs/linear.config.json` before creating issues.

## Hard rules

- **No emojis** in title or body.
- **Dense paragraphs only** — no bullet points, dashes, numbered lists, or tables in the ticket body.
- **Minimize whitespace** — no horizontal rules. One blank line only before each `##` heading. No blank lines within sections.
- **Repository** is the first line: `Repository: owner/repo`
- Separate related ideas with periods or semicolons inside a paragraph, not new lines.
- Use **bold inline labels** (`**In:**`, `**Out:**`, `**Risks:**`) to mark structure within prose.
- No past-tense "shipped" language on **open** issues unless under **Completed work**.

## Title format

| Type | Pattern |
|------|---------|
| Feature | `Feature: {Title Case Summary}` |
| Bug | `Bug: {Title Case Summary}` |
| Chore | `Chore: {Title Case Summary}` |

---

## Feature template

```markdown
Repository: owner/repo
> **Summary:** One sentence — the user-visible outcome when this ships.
## Context
Why this matters now in 1–2 sentences. Tie to user pain or demo need.
## Scope
**In:** Deliverable 1; deliverable 2; deliverable 3. **Out:** Non-goal 1; deferred follow-up.
## Acceptance criteria
Behavior 1 must hold. Behavior 2 must hold. Error and empty states are defined. UX matches existing app patterns.
## Verification
**Automated:** `bun test && bun run lint`. **Manual:** Open `/path` and confirm the page loads; perform action X and confirm outcome Y; test edge case Z and confirm outcome W.
## Starting points
UI in `apps/web/src/Component.tsx`; API in `apps/api/src/routes/...`; shared types in `packages/shared/src/...`.
## Risks and dependencies
**Risks:** API flakiness, auth, data gaps. **Depends on:** CURSOR-N. **Blocks:** none.
```

---

## Bug template

```markdown
Repository: owner/repo
> **Summary:** One sentence — what is broken and where.
## Impact
Who is affected, severity (blocker / degraded / cosmetic), and how often it occurs — in one dense paragraph.
## Steps to reproduce
Do step one, then step two, then step three. Include any required login state or data preconditions inline.
## Expected vs actual
**Expected:** What should happen. **Actual:** What happens instead.
## Acceptance criteria
Reproduction steps no longer trigger the bug. Regression covered by test if feasible. No new console errors or failed requests.
## Verification
**Automated:** `bun test path/to/relevant.test.ts`. **Manual:** Follow reproduction steps and confirm the bug is gone; check console and network tab for new errors.
## Environment
**Browser / OS:** Chrome 125, macOS. **Branch:** if known. **Starting points:** files or routes to inspect first.
```

---

## Labels

Prefer area + stack: `UI`, `API`, `data`, `database`, `infra`.

---

## Creating via MCP

Call `save_issue` with `team` and `project` from `configs/linear.config.json`, title per table above, and description as the filled template (real newlines, not `\n` escapes).

See [examples.md](examples.md) for a filled reference.
