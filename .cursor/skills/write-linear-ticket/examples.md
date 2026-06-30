# Write Linear ticket examples

## Beautified template demo

````markdown
Repository: jetsemrick/fullstack

> **Summary:** Demo ticket showcasing the new Linear issue format with structured sections, tables, and checkboxes instead of a wall of plain text.

---

## Context

Existing tickets in this workspace were unstructured paragraphs that were hard to scan and inconsistent across issues. This ticket demonstrates the new template defined in the `write-linear-ticket` skill so the team can confirm it renders well in the Linear UI before adopting it broadly.

---

## Scope

### In scope

* New section layout: Summary, Context, Scope, Acceptance criteria, Verification, Starting points, Risks
* Tables for Starting points and Risks/dependencies
* Checkbox-based acceptance criteria and manual verification steps

### Out of scope

* Retroactively reformatting existing closed tickets
* Changes to Linear workflow states or labels

---

## Acceptance criteria

- [ ] Ticket renders with clear section breaks (`---`) in the Linear UI
- [ ] No emojis present anywhere in title or body
- [ ] Repository line appears as the first line of the description
- [ ] Tables render correctly for Starting points and Risks sections

---

## Verification

**Automated**

```bash
none - formatting-only change, no code to test
```

**Manual**

- [ ] Open this ticket in the Linear web or desktop app
- [ ] Confirm headings, the summary blockquote, and checkboxes render cleanly
- [ ] Confirm the two tables below display as tables, not raw pipes

---

## Starting points

| Area | Location |
| -- | -- |
| Ticket template | `.cursor/skills/write-linear-ticket/SKILL.md` |
| Filled example | `.cursor/skills/write-linear-ticket/examples.md` |
| MCP conventions | `mcp-linear` skill |

---

## Risks and dependencies

|  |  |
| -- | -- |
| **Risks** | None - this is a demo ticket with no code impact |
| **Depends on** | None |
| **Blocks** | None |
````
