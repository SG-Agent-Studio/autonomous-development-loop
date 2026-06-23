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
(On failure: see Section Rules below for Outcome and Commit values)
~~~

---

## Section Rules

| Section | Pass | Fail |
|---------|------|------|
| `### Lint Output` | `PASS` | Full raw output — do not truncate |
| `### Test Output` | `PASS (N passed, N new)` | Full raw output — do not truncate |
| `### Commit` | `\`<7-char hash>\`` | `n/a — retrying` (attempts 1–2); `n/a — hard stop` (attempt 3) |
| `### Outcome` | `Outcome: success` | `Outcome: failed — <one-line root cause>` |

**`### Implementation Plan`:** 3–5 bullets. Describe your plan for this specific attempt (not a repeat of prior attempts).

**`### Files Changed`:** Prefix each line with `created` or `modified`. Include a one-line role annotation. List every file touched in this attempt, including test files.

**`### New Tests`:** List only tests written in this task. Do not list pre-existing tests. Use exact function names (e.g. `test_extract_user_facts`). If no new tests were written, write `(none)` or `(none — <brief reason>)`.

**`### Key Decisions`:** Only non-obvious choices with rationale — the "why" a reviewer would otherwise need to ask. Omit this section entirely if all decisions were mechanical.
