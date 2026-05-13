---
name: reset-demo
description: Resets the demo for this repository by closing every open pull request via GitHub CLI (gh), after listing them and confirming intent. Use when the user says reset the demo, demo reset, close all PRs, wipe open PRs for this repo, or clean up demo pull requests before reuse.
disable-model-invocation: false
---

# Reset demo (close all open PRs)

In this workflow, **resetting the demo means closing all open pull requests** for **this repository** (the GitHub repo configured as `origin`). It does **not** merge work, delete branches, or reset `main`; it only sets each open PR to closed.

## Preconditions

- Working directory should be the repo root (resolve with `git rev-parse --show-toplevel` if unsure).
- **`gh` installed and authenticated** (`gh auth status`). If `gh` is unavailable, use GitHub’s web UI to close each open PR instead.
- **`origin` is correct** before closing—e.g. `git remote get-url origin` matches the intended GitHub repo.

## Workflow

1. **Confirm intent**: If the user was vague, ask once for explicit confirmation that **all** open PRs in this repo should be closed (destructive for open review/CI state).
2. **List open PRs** (human-readable):

   ```bash
   gh pr list --state open
   ```

3. If the list is empty, report that and stop (no further commands).
4. **Close each open PR** using stable numbers from the list. Prefer one of:
   - Repeated `gh pr close <number>` per PR, or
   - Bash loop (only after list is non-empty):

     ```bash
     gh pr list --state open --json number --jq '.[].number' | while read -r n; do
       [ -n "$n" ] && gh pr close "$n"
     done
     ```

5. **Verify**: `gh pr list --state open` should return no rows (or only new PRs opened during the run).

## Rules

- Scope to **this repo** only; do not pass a different repo slug unless the user clearly asked to operate elsewhere.
- Do not add merge commits, force-push, or bulk-delete remote branches unless separately requested.
- If `gh pr close` fails (permissions, rate limit, network), report the error and which PR numbers remain open.

## Optional follow-ups (only if asked)

- Delete local or remote topic branches after PRs close.
- Archive or document demo state in README—use the **`update-readme`** project skill if documentation should change.
