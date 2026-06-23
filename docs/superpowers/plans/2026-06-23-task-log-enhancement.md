# Task Log Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance Stage 1 task logs so humans can use them for post-mortem and code review prep without opening the plan or spec.

**Architecture:** Add a `log-schema.md` (format spec) and `log-sample.md` (concrete example) to the skill directory. Update `stage-impl.md` to instruct agents to read those files and write a richer log (task header + per-attempt blocks). Update `stage-final.md` to add a `Delivered` column to `summary.md`.

**Tech Stack:** Markdown skill files only. No code, no test runner. Verification is grep-based.

## Global Constraints

- All files live under `skills/autonomous-feature-development/`
- Existing `stage-impl.md` Step A–D structure must be preserved — only Step C and Step D change
- `log-schema.md` is the single source of truth for log format; `stage-impl.md` must not redefine the format inline
- `log-sample.md` must show a two-attempt scenario: one failed attempt followed by one successful attempt
- `Delivered` column in `summary.md` is derived from the `<name>` portion of `### Task N: <name>` headings — no agent call

---

### Task 1: Create `log-schema.md`

**Files:**
- Create: `skills/autonomous-feature-development/log-schema.md`

**Interfaces:**
- Produces: format reference consumed by `stage-impl.md` Step C and Step D; also read directly by task agents at runtime

- [ ] **Step 1: Write `log-schema.md`**

Create `skills/autonomous-feature-development/log-schema.md` with this exact content:

```markdown
# Task Log Schema

This document defines the format for task log files written to `.loop-logs/logs/<task-id>.md` during Stage 1. Read it at **Agent Step C** (after reading plan/spec, before attempt 1). Also read `log-sample.md` for a concrete example.

---

## Tier 1: Task Header

Write this block **once** to `LOG_PATH` at Step C, before any attempt begins:

~~~markdown
# Task N Log: <Task Name>

## Task Context

### Plan Section
<full verbatim plan section — from `### Task N:` heading to the next `### Task` heading or EOF>

### Acceptance Criteria
- AC-1: <description>
- AC-2: <description>
~~~

**Rules:**
- Copy the full plan section verbatim. Do not summarize or paraphrase.
- Extract ACs from the plan section. If no ACs are listed, omit `### Acceptance Criteria` entirely.
- Write this block exactly once. Do not repeat on retry attempts.

---

## Tier 2: Per-Attempt Block

Append this block to `LOG_PATH` **after each TDD attempt** at Step D:

~~~markdown
## Attempt N — <ISO 8601 timestamp>

### Implementation Plan
- <bullet 1>
- <bullet 2>
- <bullet 3>

### Files Changed
- created `path/to/file.py` — <one-line role>
- modified `path/to/tests/test_file.py` — <one-line role>

### New Tests
- `test_function_name_1`
- `test_function_name_2`

### Key Decisions
- <non-obvious choice and rationale>

### Lint Output
PASS

### Test Output
PASS (N passed, N new)

### Commit
`<7-char hash>`

### Outcome: success
~~~

---

## Section Rules

| Section | Pass | Fail |
|---------|------|------|
| `### Lint Output` | `PASS` | Full raw output — do not truncate |
| `### Test Output` | `PASS (N passed, N new)` | Full raw output — do not truncate |
| `### Commit` | `\`<7-char hash>\`` | `n/a — retrying` (attempts 1–2); `wip — \`<hash>\`` (hard stop) |
| `### Outcome` | `Outcome: success` | `Outcome: failed — <one-line root cause>` |

**`### Implementation Plan`:** 3–5 bullets. Describe your plan for this specific attempt (not a repeat of prior attempts).

**`### Files Changed`:** Prefix each line with `created` or `modified`. Include a one-line role annotation. List every file touched in this attempt, including test files.

**`### New Tests`:** List only tests written in this task. Do not list pre-existing tests. Use exact function names (e.g. `test_extract_user_facts`). If no new tests were written, write `(none)`.

**`### Key Decisions`:** Only non-obvious choices with rationale — the "why" a reviewer would otherwise need to ask. Omit this section entirely if all decisions were mechanical.
```

- [ ] **Step 2: Verify required sections exist**

```bash
grep -c "## Tier 1" skills/autonomous-feature-development/log-schema.md
grep -c "## Tier 2" skills/autonomous-feature-development/log-schema.md
grep -c "## Section Rules" skills/autonomous-feature-development/log-schema.md
```

Expected: each command outputs `1`.

- [ ] **Step 3: Commit**

```bash
git add skills/autonomous-feature-development/log-schema.md
git commit -m "feat(logs): add log-schema.md defining task log format"
```

---

### Task 2: Create `log-sample.md`

**Files:**
- Create: `skills/autonomous-feature-development/log-sample.md`

**Interfaces:**
- Consumes: format defined in `log-schema.md` (Task 1)
- Produces: concrete example read by task agents at Step C

- [ ] **Step 1: Write `log-sample.md`**

Create `skills/autonomous-feature-development/log-sample.md` with this exact content:

```markdown
# Sample Task Log

This is a reference example for agents writing `.loop-logs/logs/<task-id>.md` files. It shows a two-attempt scenario: one failed attempt followed by one successful attempt.

---

# Task 3 Log: Task Status Validator

## Task Context

### Plan Section
### Task 3: Task Status Validator

Implement a `validate_task_status` function that reads a `.loop-logs/tasks/<task-id>.json`
file and verifies it has the required fields and a valid status value.

**Files to create:**
- `src/loop_utils/task_validator.py` — main implementation
- `tests/unit/test_task_validator.py` — unit tests

**Acceptance Criteria:**
- AC-1: `validate_task_status(path)` raises `ValueError` with a descriptive message if `status` is not one of `pending`, `in_progress`, `completed`, `failed`
- AC-2: `validate_task_status(path)` raises `ValueError` if any required field (`task_id`, `status`, `attempt`) is missing from the JSON
- AC-3: `validate_task_status(path)` returns `True` for a fully valid task file

### Acceptance Criteria
- AC-1: raises `ValueError` if `status` is not one of `pending`, `in_progress`, `completed`, `failed`
- AC-2: raises `ValueError` if required fields `task_id`, `status`, or `attempt` are missing
- AC-3: returns `True` for a valid task file

---

## Attempt 1 — 2026-06-23T09:12:00Z

### Implementation Plan
- Write three failing tests covering AC-1, AC-2, AC-3
- Run tests to confirm ImportError (module not yet created)
- Create `task_validator.py` with `validate_task_status`
- Run lint and full test suite

### Files Changed
- created `src/loop_utils/task_validator.py` — main implementation
- created `tests/unit/test_task_validator.py` — unit tests for AC-1, AC-2, AC-3

### New Tests
- `test_validate_rejects_invalid_status`
- `test_validate_rejects_missing_fields`
- `test_validate_accepts_valid_task`

### Key Decisions
- Raised `ValueError` rather than returning `False` on failure so callers get a descriptive message — a boolean would swallow the reason and make the integrity gate output opaque

### Lint Output
ruff check src/loop_utils/task_validator.py
src/loop_utils/task_validator.py:12:5: E501 line too long (92 > 88 characters)
1 error found

### Test Output
n/a — stopped at lint failure

### Commit
n/a — retrying

### Outcome: failed — lint error E501 on line 12

---

## Attempt 2 — 2026-06-23T09:18:44Z

### Implementation Plan
- Fix lint error: wrap long line in `validate_task_status` at column 88
- Re-run lint to confirm clean
- Run full test suite to confirm all three tests pass

### Files Changed
- modified `src/loop_utils/task_validator.py` — fixed E501 lint error on line 12

### New Tests
(none — same tests as attempt 1, no new tests written)

### Key Decisions
- Validated missing fields before checking status value — a missing `task_id` is more fundamental than an invalid `status`, so the error message surfaces the root cause first

### Lint Output
PASS

### Test Output
PASS (47 passed, 3 new)

### Commit
`a3f9c12`

### Outcome: success
```

- [ ] **Step 2: Verify sample contains both attempt outcomes**

```bash
grep -c "Outcome: failed" skills/autonomous-feature-development/log-sample.md
grep -c "Outcome: success" skills/autonomous-feature-development/log-sample.md
grep -c "## Task Context" skills/autonomous-feature-development/log-sample.md
grep -c "### Key Decisions" skills/autonomous-feature-development/log-sample.md
```

Expected: each outputs `1`.

- [ ] **Step 3: Commit**

```bash
git add skills/autonomous-feature-development/log-sample.md
git commit -m "feat(logs): add log-sample.md with two-attempt example log"
```

---

### Task 3: Update `stage-impl.md` — Steps C and D

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md`

**Interfaces:**
- Consumes: `log-schema.md` (Task 1) and `log-sample.md` (Task 2) — referenced by name in Step C
- Produces: updated agent instructions for Step C (Task Header) and Step D (Per-Attempt Block)

- [ ] **Step 1: Replace Step C with updated version**

Find this exact block in `stage-impl.md`:

```markdown
#### Agent Step C — Read task content

From `plan_path`, read the full section for this task (from `### Task N: <name>` to next `### Task` heading or end of file). Also read full `spec_path` for architectural context.
```

Replace it with:

```markdown
#### Agent Step C — Read task content and write Task Header

From `plan_path`, read the full section for this task (from `### Task N: <name>` to next `### Task` heading or end of file). Also read full `spec_path` for architectural context.

Read both log reference documents:
- `skills/autonomous-feature-development/log-schema.md`
- `skills/autonomous-feature-development/log-sample.md`

Write the **Task Header** (Tier 1 from `log-schema.md`) to `LOG_PATH` now, before any attempt begins:
- Copy the full plan section verbatim
- Extract and list ACs (omit `### Acceptance Criteria` section if none are listed)
```

- [ ] **Step 2: Verify Step C was updated**

```bash
grep -c "log-schema.md" skills/autonomous-feature-development/stage-impl.md
grep -c "log-sample.md" skills/autonomous-feature-development/stage-impl.md
grep -c "Task Header" skills/autonomous-feature-development/stage-impl.md
```

Expected: each outputs `1`.

- [ ] **Step 3: Replace Step D log format block with schema reference**

Find this block in `stage-impl.md` (the "Before each attempt" instruction and the two append blocks):

```markdown
**Before each attempt**, append to `LOG_PATH`:
```markdown
## Attempt <N> — <ISO timestamp>
### Implementation plan
<3-5 bullet points describing your approach>
```
```

And find the "On pass" append block:

```markdown
Append to `LOG_PATH`:
```markdown
### Lint output
PASS
### Test output
PASS
### Outcome: success
```
```

And find the "On fail" instruction:

```markdown
Append full output to `LOG_PATH` (lint under `### Lint output`, tests under `### Test output`). Append `### Outcome: failed — <one-line root cause>`.
```

Replace all three blocks with a single unified instruction:

```markdown
**Per-attempt logging:** Follow `log-schema.md` Tier 2 for the Per-Attempt Block. Append it to `LOG_PATH` after each attempt completes. Concretely:

- Before the attempt: append `## Attempt <N> — <ISO timestamp>` and `### Implementation Plan` bullets
- After the attempt: append `### Files Changed`, `### New Tests`, `### Key Decisions` (omit if all decisions were mechanical), `### Lint Output`, `### Test Output`, `### Commit`, `### Outcome`
- On pass: `PASS` for lint/test, 7-char commit hash, `Outcome: success`
- On fail (not hard stop): full raw lint/test output, `n/a — retrying` for commit, `Outcome: failed — <root cause>`
- On hard stop (attempt 3 fail): full raw output, `wip — \`<hash>\`` for commit, `Outcome: HARD STOP after 3 attempts`
```

- [ ] **Step 4: Verify old inline format is gone and new reference is present**

```bash
grep -c "Implementation plan" skills/autonomous-feature-development/stage-impl.md
# Expected: 0 (old lowercase heading removed)

grep -c "Per-attempt logging" skills/autonomous-feature-development/stage-impl.md
# Expected: 1 (new reference present)
```

- [ ] **Step 5: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md
git commit -m "feat(logs): update stage-impl.md Step C and D for enhanced log format"
```

---

### Task 4: Update `stage-final.md` — `Delivered` column in `summary.md`

**Files:**
- Modify: `skills/autonomous-feature-development/stage-final.md`

**Interfaces:**
- Produces: updated `summary.md` template with `Delivered` column

- [ ] **Step 1: Replace the task table in Step 4.2**

Find this block in `stage-final.md`:

```markdown
| Task | Status | Attempts |
|------|--------|----------|
| <task-id> | completed / failed | N |
```

Replace it with:

```markdown
| Task | Status | Attempts | Delivered |
|------|--------|----------|-----------|
| <task-id> | completed / failed | N | <name from `### Task N: <name>` heading in plan> |
```

- [ ] **Step 2: Verify the column was added**

```bash
grep -c "Delivered" skills/autonomous-feature-development/stage-final.md
```

Expected: `2` (once in the header row, once in the example row).

- [ ] **Step 3: Commit**

```bash
git add skills/autonomous-feature-development/stage-final.md
git commit -m "feat(logs): add Delivered column to summary.md template in stage-final"
```
