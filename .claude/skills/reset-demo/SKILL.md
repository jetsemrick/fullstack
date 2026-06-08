---
name: reset-demo
description: "[FILL IN: Triggers — reset demo, close all PRs, wipe open PRs, clean up before reuse]"
---

# Reset demo (close all open PRs)

> **Demo:** Fill in workflow details, then copy to `.cursor/skills/reset-demo/SKILL.md`.

In this workflow, **resetting the demo means closing all open pull requests** for **this repository** (`origin`). It does **not** merge, delete branches, or reset `main`.

## Preconditions

- [FILL IN: Working directory — repo root]
- [FILL IN: `gh` installed and authenticated]
- [FILL IN: Confirm `origin` URL is the intended GitHub repo]

## Workflow

1. **Confirm intent** — [FILL IN: ask once if user wants ALL open PRs closed]
2. **List open PRs:**

   ```bash
   [FILL IN: gh pr list command]
   ```

3. If empty, [FILL IN: report and stop].
4. **Close each PR** — [FILL IN: `gh pr close <number>` or loop pattern]
5. **Verify** — [FILL IN: re-list open PRs; expect none]

## Rules

- [FILL IN: Scope to this repo only]
- [FILL IN: No merge commits, force-push, or branch deletion unless asked]
- [FILL IN: Report failures and remaining open PR numbers]

## Optional follow-ups (only if asked)

- [FILL IN: Delete topic branches]
- [FILL IN: Update README — point to update-readme skill]
