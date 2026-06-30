# 003 — Workflow Log File Design

**Date:** 2026-06-23
**Status:** Accepted
**Branch:** chore/enhance-subagent-logs

---

> **Update (2026-06-30, commit `237cfab`):** the stage 2/3 refactor namespaced every log
> under a per-run `id`. The flat paths below (`.loop-logs/logs/<task-id>.md`,
> `.loop-logs/tasks/...`) are now `.loop-logs/<id>/logs/<task-id>.md`,
> `.loop-logs/<id>/tasks/...`, etc. The log **format** decisions in this record are
> unchanged — only the directory layout moved. See `001-agent-workflow.md` (File
> Ownership) for the current paths.

---

## Context

Stage 1 task logs (`.loop-logs/logs/<task-id>.md`) were too sparse to be useful. A typical log contained:

- 3–5 bullet implementation plan
- `PASS` for lint
- `PASS (N passed)` for tests
- `Outcome: success`

This gave a reviewer or post-mortem investigator no insight into what files changed, which acceptance criteria were covered, why the agent made specific design decisions, or what tests were written.

---

## Decisions

### Use Cases

The enhanced log serves two primary use cases:

1. **Post-mortem** — debugging why a task misimplemented something: need to see exact instructions given, decisions made, and what changed
2. **Code review prep** — understanding the intent behind a diff before reviewing: need AC coverage, design rationale, and file role annotations

### Format: Hybrid

Logs use a **hybrid format**: a structured skeleton (files, tests, ACs) combined with a short free-text rationale block. This makes the log scannable for quick audits while preserving the "why" that a reviewer would otherwise need to ask.

Pure narrative (prose only) was rejected — too hard to scan. Pure structured (fields only) was rejected — loses design intent.

### Log Structure: Two Tiers

The log is split into two tiers to avoid repeating static context on every retry:

**Tier 1 — Task Header** (written once at Agent Step C, before attempt 1):
- Full verbatim plan section (from `### Task N:` to next `### Task` or EOF)
- Extracted acceptance criteria list

**Tier 2 — Per-Attempt Block** (appended at Agent Step D, once per TDD loop):
- Implementation plan (3–5 bullets)
- Files changed with role annotations
- New test names (written in this task only)
- Key decisions (non-obvious choices only)
- Lint output (PASS or full raw output on failure)
- Test output (PASS + counts, or full raw output on failure)
- Commit hash
- Outcome

### Task-Specific Context: Full Plan Section Verbatim

The orchestrator prompt injected into each agent contains a task-specific section extracted from the plan file. Rather than summarising it, the agent writes the **full verbatim plan section** into the Task Header. This ensures post-mortem reviewers can see exactly what instructions the agent was given, without needing to locate and open the original plan file.

Static skill boilerplate (the full stage-impl.md content) is not recorded — it is already version-controlled and adds noise without signal.

### Acceptance Criteria Coverage

Each Task Header explicitly lists the ACs from the plan section. This lets a reviewer verify "did this task address AC-1?" without cross-referencing the plan manually.

### Test Recording: New Tests Only

The log lists **only the test function names written in this task** — not the full test suite output. A reviewer wants to know what the agent wrote, not the result of every pre-existing test. Full suite output is captured in the error log on failure.

### Files Changed: Paths with Role Annotation

Each file entry is prefixed with `created` or `modified` and includes a one-line role annotation (e.g., `created path/to/file.py — main implementation`). This orients a reviewer before they open the diff.

### Key Decisions: Separate Section, Non-Obvious Only

Design rationale is captured in a dedicated `### Key Decisions` section rather than annotating individual implementation plan bullets. Only non-obvious choices are recorded — if all decisions were mechanical, the section is omitted entirely.

### Commit Hash: Recorded Per Attempt

Each attempt records the resulting 7-character commit hash. This lets a post-mortem investigator run `git show <hash>` to see the exact diff. On non-hard-stop failures (attempts 1–2), the value is `n/a — retrying`. On hard stop (attempt 3 failure), it is `wip — <hash>`.

### `summary.md`: Delivered Column

The Stage 4 `summary.md` task table gains a `Delivered` column, derived from the `<name>` portion of each `### Task N: <name>` heading in the plan. No extra agent call is needed — it is a deterministic string extraction at orchestrator time.

Example:
```
| Task | Status | Attempts | Delivered |
|------|--------|----------|-----------|
| task-1-embedding-utility-... | completed | 1 | Embedding Utility + MemoryRetrievalNode Full Implementation |
```

---

## Implementation

| File | Change |
|------|--------|
| `skills/autonomous-feature-development/log-schema.md` | **new** — single source of truth for log format |
| `skills/autonomous-feature-development/log-sample.md` | **new** — two-attempt example (one fail, one pass) for agent reference |
| `skills/autonomous-feature-development/stage-impl.md` | **modified** — Step C writes Task Header; Step D references log-schema.md |
| `skills/autonomous-feature-development/stage-final.md` | **modified** — summary.md template adds Delivered column |

See spec: `docs/superpowers/specs/2026-06-23-task-log-enhancement-design.md`
See plan: `docs/superpowers/plans/2026-06-23-task-log-enhancement.md`
