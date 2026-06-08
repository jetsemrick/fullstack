---
name: implement
description: End-to-end workflow for implementing a Linear issue — assign to the current user, manage workflow status, implement against acceptance criteria, open a PR, and attach the PR link to the ticket. Use when the user shares a Linear ticket, asks to implement a Linear issue, work CURSOR-N / team-ID tickets, or says assign the ticket to me and link the PR.
disable-model-invocation: false
---

# Implement Linear ticket

Drive a Linear issue from **claimed** → **in progress** → **PR linked** → **done**, keeping the board accurate throughout.

Also load the `**mcp-linear`** skill for issue formatting and MCP conventions. Read each Linear MCP tool schema before calling.

## Preconditions

- Linear MCP is available (`save_issue`, `get_issue`, `list_issue_statuses`, `save_comment`).
- `gh` is authenticated for PR creation (`gh auth status`).
- Read `configs/linear.config.json` for default `team` and `project` when resolving statuses or filtering.

## Workflow checklist

Copy and track progress:

```
- [ ] 1. Load issue and claim it
- [ ] 2. Implement against acceptance criteria
- [ ] 3. Open PR (gh)
- [ ] 4. Attach PR to ticket and move to review
- [ ] 5. Close out when done
```

---

## 1. Load issue and claim it

**Parse the ticket** from the user message: identifier (`CURSOR-21`), Linear URL, or pasted issue body.

1. `**get_issue`** with the identifier. Read title, description, acceptance criteria, starting points, and any suggested git branch name.
2. **Name the agent** per the `agent-naming` skill: `{TICKET-ID}: {Short Title}`.
3. **Resolve workflow states** if unsure: `list_issue_statuses` for the team from `linear.config.json` (or the issue's team).
4. **Claim the ticket** with `save_issue`:
  ```json
   {
     "id": "CURSOR-21",
     "assignee": "me",
     "state": "In Progress"
   }
  ```
   Use the team's actual in-progress state name (`Started`, `In Progress`, etc.). If `save_issue` fails on `state`, re-run `list_issue_statuses` and retry with the exact name.
5. **Create a branch** before editing code:
  - Prefer the branch name from `get_issue` when present.
  - Otherwise: `{type}/{ticket-id-lowercase}-{short-kebab-description}` (e.g. `feature/cursor-21-export-csv`).
  - Follow `git-naming` / `git-hygiene` conventions.

Do **not** start implementation until assignee is `me` and state reflects active work — unless the user explicitly opts out.

---

## 2. Implement

- Treat **acceptance criteria** and **how to verify** in the description as the definition of done.
- Respect **out of scope** — no drive-by refactors.
- Run verification commands listed in the ticket (tests, lint, local smoke) before opening a PR.
- If blocked, update the ticket immediately (see **Blocked / parked** below).

---

## 3. Open PR

Follow the user's **creating-pull-requests** rule and `git-hygiene`:

1. `git status`, `git diff`, sync with base branch if needed.
2. Push branch: `git push -u origin HEAD`.
3. Create PR with `gh pr create`. PR body must include:
  - **Summary** of what changed and why.
  - **Test plan** checklist.
  - **Linear ticket** link: `https://linear.app/.../issue/{IDENTIFIER}` or `Closes {IDENTIFIER}` in the footer when appropriate.

Capture the PR URL from `gh pr create` output (or `gh pr view --json url -q .url`).

---

## 4. Attach PR to ticket and move to review

**Link the PR** with `save_issue` — `links` is append-only:

```json
{
  "id": "CURSOR-21",
  "links": [
    {
      "url": "https://github.com/org/repo/pull/42",
      "title": "PR #42"
    }
  ],
  "state": "In Review"
}
```

- Use the real PR URL and number in `title`.
- Move `state` to the team's review state (`In Review`, `Review`, etc.) when a PR is open and ready for review. If the team has no review state, leave `In Progress` until merge.

**Optional comment** via `save_comment` when useful:

```json
{
  "issueId": "<issue uuid or identifier>",
  "body": "PR opened: https://github.com/org/repo/pull/42\n\nVerified: `bun test`, manual check on /export."
}
```

---

## 5. Close out when done

When acceptance criteria are met **and** the PR is merged (or the user confirms completion):

```json
{
  "id": "CURSOR-21",
  "state": "Done"
}
```

Use the team's completed state (`Done`, `Completed`, etc.).

If implementation diverged from the ticket, add a brief `save_comment` noting follow-ups or a new ticket.

---

## Status reference


| Moment                       | Assignee         | Typical state                     |
| ---------------------------- | ---------------- | --------------------------------- |
| Agent starts work            | `me`             | In Progress / Started             |
| PR opened                    | `me`             | In Review (if available)          |
| Merged or user confirms done | `me` (unchanged) | Done / Completed                  |
| Blocked                      | `me`             | Blocked, or In Progress + comment |
| User cancels scope           | —                | Canceled                          |


Always resolve state **names** via `list_issue_statuses` — teams differ.

## Blocked / parked

If work cannot continue:

1. `save_comment` with what is blocked and what is needed.
2. Update `state` to `Blocked` or `Canceled` when appropriate.
3. Do **not** leave the ticket in `In Progress` without activity.

## Rules

- **Assignee**: Always set `assignee` to `"me"` when the agent drives the work (not `assigneeId`).
- **PR attachment**: Use `save_issue` → `links` with the GitHub PR URL. Do not rely on comments alone.
- **Ticket hygiene**: Keep status aligned with reality at each phase transition.
- **Scope**: Implement the ticket, not adjacent cleanup.
- **Opt-out**: Skip Linear updates only when the user explicitly says so.

## Related skills

- `mcp-linear` — issue format, config, MCP tool usage
- `agent-naming` — sidebar title when starting from a ticket
- `git-hygiene` / `git-naming` — branch and PR hygiene
- `run-api-tests` / `start-local-dev-server` — verify before PR when applicable

