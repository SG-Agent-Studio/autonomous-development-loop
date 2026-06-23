# Task Log Enhancement Design

**Date:** 2026-06-23
**Branch:** chore/enhance-subagent-logs

## Problem

Current task logs produced by Stage 1 subagents are too sparse. A typical log contains:
- 3–5 bullet implementation plan
- `PASS` for lint
- `PASS (N passed)` for tests
- `Outcome: success`

This gives a reviewer or post-mortem investigator no insight into: what files changed, which acceptance criteria were covered, why the agent made specific design decisions, or what tests were written.

## Use Cases

1. **Post-mortem**: debugging why a task misimplemented something — need to see exact instructions given, decisions made, and what changed
2. **Code review prep**: understanding the intent behind a diff before reviewing it — need AC coverage, design rationale, and file role annotations

## Design

### Files

| File | Change | Purpose |
|------|--------|---------|
| `skills/autonomous-feature-development/log-schema.md` | new | Defines each log section, when to write it, and what to include |
| `skills/autonomous-feature-development/log-sample.md` | new | Concrete example of a well-written task log for agent pattern-matching |
| `skills/autonomous-feature-development/stage-impl.md` | modify | Reference schema + sample at Step C and D; remove old inline format |
| `skills/autonomous-feature-development/stage-final.md` | modify | Update summary.md format to include "Delivered" annotation per task row |

`stage-verify.md` and `stage-review-fix.md` are unchanged — they do not own task logs.

---

### Log File Structure

Each task log (`task-N-*.md`) has two tiers:

#### Tier 1 — Task Header (written once at Step C, before attempt 1)

```markdown
# Task N Log: <Task Name>

## Task Context

### Plan Section
<full verbatim plan section, from ### Task N heading to next ### Task or EOF>

### Acceptance Criteria
- AC-1: <description>
- AC-2: <description>
```

The agent extracts ACs from the plan section verbatim. If none are listed, omit the section.

#### Tier 2 — Per-Attempt Block (appended at Step D, once per TDD loop)

```markdown
## Attempt N — <ISO timestamp>

### Implementation Plan
- bullet 1
- bullet 2

### Files Changed
- created `path/to/file.py` — main implementation
- modified `path/to/tests/test_file.py` — unit tests for AC-1 and AC-2

### New Tests
- `test_function_name_1`
- `test_function_name_2`

### Key Decisions
- Chose X over Y because Z (one bullet per non-obvious decision)

### Lint Output
PASS

### Test Output
PASS (147 passed, 4 new)

### Commit
`abc1234`

### Outcome: success
```

**On failure:** `### Lint Output` and `### Test Output` contain the full raw output (not truncated). `### Outcome` reads `failed — <one-line root cause>`.

**Key decisions section:** Only non-obvious choices. If every decision was mechanical (create file, run lint), this section can be omitted.

**New tests section:** List only tests written in this task. Do not list pre-existing tests.

**Files changed section:** Prefix each line with `created` or `modified`. Include a brief role annotation.

---

### summary.md Enhancement

The task table gains a `Delivered` column, populated by the Stage 4 orchestrator:

```markdown
| Task | Status | Attempts | Delivered |
|------|--------|----------|-----------|
| task-1-embedding-utility-... | completed | 1 | Embedding utility + MemoryRetrievalNode with pgvector similarity search |
| task-2-memory-agent-case-1-... | completed | 1 | MemoryAgent Case 1: normal fact extraction from user messages |
```

The orchestrator derives the "Delivered" value from the `<name>` portion of the `### Task N: <name>` heading in the plan — no extra agent call. Example: `### Task 1: Embedding Utility + MemoryRetrievalNode Full Implementation` → `Embedding Utility + MemoryRetrievalNode Full Implementation`.

---

### `stage-impl.md` Changes

**Step C** gains a new action after reading plan/spec:

> Read `skills/autonomous-feature-development/log-schema.md` and `skills/autonomous-feature-development/log-sample.md` to understand the required log format. Then write the Task Header to `LOG_PATH` — the full verbatim plan section and extracted AC list.

**Step D** replaces the current log format block:

> Follow `log-schema.md` for the Per-Attempt Block. Append it to `LOG_PATH` after each attempt. On pass: write "PASS" for lint/test output, include commit hash, set `Outcome: success`. On fail: write full raw lint/test output, include commit hash, set `Outcome: failed — <root cause>`.

The old hardcoded markdown template in Step D is removed. `log-schema.md` is the single source of truth for format.

---

### `log-schema.md` Content

Defines each section with:
- Section name and markdown heading
- When to write it (Step C once vs Step D per-attempt)
- What to include (explicit rules, e.g. "new tests only, not pre-existing")
- What to omit (e.g. "Key Decisions can be omitted if all decisions were mechanical")

### `log-sample.md` Content

A complete example log for a fictional task, showing:
- Task header with plan section and ACs
- Two attempt blocks: one failed (with full lint/test output), one successful
- Key Decisions with rationale prose
- Files Changed with role annotations
- New Tests list

The sample should demonstrate a failed-then-recovered scenario so agents understand both the pass and fail formats.

---

## Acceptance Criteria

- AC-1: `log-schema.md` exists and defines all sections with explicit write-timing and inclusion rules
- AC-2: `log-sample.md` exists with a complete two-attempt example (one fail, one pass)
- AC-3: `stage-impl.md` Step C instructs agents to read schema + sample and write Task Header before attempt 1
- AC-4: `stage-impl.md` Step D references `log-schema.md` instead of inline format; old template removed
- AC-5: `stage-final.md` updated to include `Delivered` column in summary.md output
- AC-6: A new sample log produced under this format is human-readable and sufficient for post-mortem without opening the plan or spec
