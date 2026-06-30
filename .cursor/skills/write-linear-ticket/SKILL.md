---
name: write-linear-ticket
description: Write Linear tickets with a consistent, scannable Markdown template. Use when drafting or updating Linear issues, especially for repository-backed implementation work.
disable-model-invocation: false
---

# Write Linear ticket

Use this skill to turn a product request, bug report, or chore into a Linear issue that is easy to scan in the Linear UI.

## Required format

1. Put the repository line first when the work targets a repository:
   `Repository: owner/repo`
2. Keep the title plain text with no emoji.
3. Use the same top-level sections, in this order:
   - Summary
   - Context
   - Scope
   - Acceptance criteria
   - Verification
   - Starting points
   - Risks and dependencies
4. Separate major sections with a horizontal rule (`---`).
5. Use checkbox lists for acceptance criteria and manual verification.
6. Use Markdown tables for Starting points and Risks/dependencies.
7. Do not include secrets, private credentials, stack traces, or personally identifiable information.

## Body template

````markdown
Repository: owner/repo

> **Summary:** One sentence explaining the outcome and why it matters.

---

## Context

Explain the problem, current behavior, customer impact, and any relevant background. Keep this concise and specific.

---

## Scope

### In scope

* Item included in this ticket
* Another included item

### Out of scope

* Explicit non-goal or follow-up
* Another non-goal

---

## Acceptance criteria

- [ ] Observable outcome reviewers can verify
- [ ] Edge case or constraint that must hold
- [ ] Documentation, migration, or compatibility requirement if applicable

---

## Verification

**Automated**

```bash
command to run, or "none - reason"
```

**Manual**

- [ ] Step to verify in the product, API, or tool
- [ ] Step to verify important rendering, error, or edge-case behavior

---

## Starting points

| Area | Location |
| -- | -- |
| Relevant code or doc | `path/to/file` |
| Related test | `path/to/test` |

---

## Risks and dependencies

|  |  |
| -- | -- |
| **Risks** | Main implementation or rollout risks, or `None` |
| **Depends on** | Upstream tickets, services, access, or `None` |
| **Blocks** | Downstream work, releases, or `None` |
````

## Quality checklist

Before creating or updating the Linear issue, confirm:

- [ ] The repository line is the first line when applicable.
- [ ] The title and body contain no emoji.
- [ ] Every major section is separated by `---`.
- [ ] Acceptance criteria are measurable checkboxes.
- [ ] Manual verification steps are checkboxes.
- [ ] Starting points and Risks/dependencies render as Markdown tables.
- [ ] The issue avoids secrets, credentials, raw logs, and unrelated implementation detail.
