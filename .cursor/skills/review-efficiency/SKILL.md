---
name: review-efficiency
description: Scans git working changes for performance and conciseness wins. Use when the user asks for efficiency review, performance pass, faster or leaner code, before commit, or after editing TypeScript, React, or Bun API code in this repo.
---

# Review efficiency of working changes

## When to apply

User wants **efficiency**, **performance**, **leaner** or **tighter** code, or a pass on **uncommitted / recent** changes. Prefer reviewing **what changed** (`git diff`, `git diff --staged`) rather than the whole codebase unless they ask otherwise.

## Workflow

1. Run `git status` and `git diff` (and `git diff --staged` if relevant) to see the working set.
2. Focus on **modified files and new code paths** only, unless the user broadens scope.
3. For each issue, note **why it matters** (hot path, bundle, allocation, readability cost) and **a concrete fix** (not vague “optimize this”).

## Performance (prioritize by impact)

- **React (`*.tsx`)**: avoid new function/object identities in render when they force child re-renders; missing deps in `useEffect`/`useCallback`/`useMemo`; expensive work in render vs `useMemo` or moving up/down the tree; large lists without virtualization when scale demands it; unnecessary re-fetches.
- **Data / network**: duplicate requests, missing abort/cancel when inputs change, serial awaits that could be parallel, large payloads to the client.
- **Bun / Node API**: O(n²) where n can grow, unnecessary JSON parse/stringify, tight loops with allocation churn; add caching only with clear keys and invalidation.

## Conciseness (without harming clarity)

- Remove **dead code**, **duplicate branches**, and **redundant** variables or checks already implied by types or earlier validation.
- Prefer **one clear path** over nested special cases; collapse repeated patterns into a small helper only if it **reduces** total lines and names the idea well.
- Do **not** trade readability for a micro-optimization; flag “low value” micro-optimizations as optional.

## Output format

- **High impact** — brief bullet, file/region, suggested change
- **Medium** — same
- **Low / optional** — only if quick wins
- If nothing meaningful: say so in one sentence.

## Boundaries

- Do not rewrite unrelated files or introduce new dependencies unless the user asked.
- If profiling data is needed (e.g. React Profiler, benchmarks), state what to measure and where, instead of guessing.
