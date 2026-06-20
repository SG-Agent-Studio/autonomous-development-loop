# Stage 0 + 1: Guard, Setup & Parallel Implementation

## Stage 0: Guard & Setup

### Step 0.1 — Validate inputs

From conversation context, identify `plan_path` and `spec_path`. Check each file in order:

1. Does `plan_path` exist? No → print `ERROR: Plan file not found: <plan_path>` and stop.
2. Is `plan_path` non-empty (size > 0)? No → print `ERROR: Plan file is empty: <plan_path>` and stop.
3. Does `spec_path` exist? No → print `ERROR: Spec file not found: <spec_path>` and stop.
4. Is `spec_path` non-empty (size > 0)? No → print `ERROR: Spec file is empty: <spec_path>` and stop.

### Step 0.2 — Branch guard

Run: `git rev-parse --abbrev-ref HEAD`

- If on `main`: derive branch name from plan filename (basename only):
  - Strip leading `YYYY-MM-DD-` prefix if present
  - Strip `.md` suffix
  - Prepend `feature/`
  - Example: `2026-06-16-ticket-3-ingestion.md` → `feature/ticket-3-ingestion`
  - Run: `git checkout -b <branch-name>`
- Otherwise: continue on current branch.

### Step 0.3 — Parse tasks

Read `plan_path`. Extract every heading matching `### Task N: <name>` (N = a number). For each match:

- Derive `task_id`: `task-<N>-<kebab-case-name>`
  - Example: `### Task 3: Tavily Service` → `task-3-tavily-service`
- Record line range (from this heading to next `### Task` heading or end of file)

### Step 0.4 — Initialize task files

For each parsed task, write `.loop-logs/tasks/<task-id>.json`:

```json
{
  "task_id": "<task_id>",
  "plan": "<plan_path>",
  "spec": "<spec_path>",
  "status": "pending",
  "attempt": 0,
  "worktree": null,
  "completed_steps": []
}
```

**Resume guard:** If `.loop-logs/tasks/<task-id>.json` already exists with `"status": "completed"`, skip that task entirely — do not overwrite, do not spawn agent for it.

Print after all files written:
```
Setup complete. Found <N> tasks:
  - <task-id-1>
  - <task-id-2>
  ...
Working branch: <current-branch>
```

---


## Orchestrator: Agent Output Schema and File Ownership

**The orchestrator owns all `.loop-logs/` file writes. Agents own implementation and
return content. This separation is the key to reliable bookkeeping.**

### Task state lifecycle (orchestrator responsibility)

Before calling each per-task agent, the orchestrator writes:

```json
{ "status": "in_progress", "worktree": ".worktrees/<task-id>" }
```

into `.loop-logs/tasks/<task-id>.json` (merging with the existing fields from Stage 0).

After the agent returns, the orchestrator writes the final state from the agent's
structured output (see schema below).

When using the Workflow tool: The agent MUST NOT write to `.loop-logs/tasks/<task-id>.json` or `.loop-logs/logs/<task-id>.md`. The orchestrator performs those writes using the agent's structured output. In non-Workflow mode, see the fallback note below — agents write files directly via Steps B and D.

### Required agent response schema

When implementing Stage 1 via the Workflow tool, use the `schema` option on each
`agent()` call. The agent must return:

```json
{
  "status": "completed" | "failed",
  "attempt_count": 2,
  "attempt_logs": [
    {
      "attempt": 1,
      "plan": "3-5 bullet points describing the approach",
      "lint_output": "full lint stdout/stderr, or PASS",
      "test_output": "full test stdout/stderr, or PASS",
      "outcome": "success | failed — <one-line root cause> | HARD STOP after 3 attempts"
    }
  ]
}
```

`attempt_logs` has one entry per TDD attempt. `attempt_count` ranges 1–3 (1 on first-pass success, 3 on hard stop). On hard stop (3 failures), `attempt_logs`
has 3 entries and `status` is `"failed"`.

### Orchestrator writes log file from schema output

After each agent returns, the orchestrator writes `.loop-logs/logs/<task-id>.md` by
formatting the `attempt_logs` array:

```markdown
# <task-id>

## Attempt <N> — <timestamp>

### Implementation plan

<plan from attempt_logs[N].plan>

### Lint output

<lint_output>

### Test output

<test_output>

### Outcome: <outcome>
```

Repeat one `## Attempt N` block per entry in `attempt_logs`.

### Orchestrator writes task JSON from schema output

After each agent returns, merge into `.loop-logs/tasks/<task-id>.json`:

```json
{
  "status": "<from schema output>",
  "attempt": <attempt_count from schema>,
  "completed_steps": ["tdd-loop-complete"]
}
```

If `status` is `"failed"`, omit `"tdd-loop-complete"` from `completed_steps`.

---

> **If not using the Workflow tool:** The agent prompt MUST include steps A–D from the
> "Per-Task Agent Instructions" section below verbatim. The plan's implementation content
> is additional context, not a replacement for those steps. In this mode the agent writes
> the files directly as specified in steps B and D.


---

## Stage 1: Parallel Implementation

Spawn one worktree agent per task **simultaneously** — all at once, not sequentially. Each agent receives its `task_id` and the path to its task file: `.loop-logs/tasks/<task-id>.json`.

---

### Per-Task Agent Instructions

#### Agent Step A — Read task file

Read `.loop-logs/tasks/<task-id>.json`. Extract `plan`, `spec`, `attempt`, `task_id`.

#### Agent Step B — Create worktree

```bash
git worktree add .worktrees/<task-id> -b worktree/<task-id>
```

Switch working directory to `.worktrees/<task-id>` for ALL remaining steps. All bash commands, file reads, and git operations MUST run from within `.worktrees/<task-id>`.

Update task JSON: `"status": "in_progress"`, `"worktree": ".worktrees/<task-id>"`.

#### Agent Step C — Read task content

From `plan_path`, read the full section for this task (from `### Task N: <name>` to next `### Task` heading or end of file). Also read full `spec_path` for architectural context.

#### Agent Step D — TDD loop (max 3 attempts)

**Before each attempt**, append to `.loop-logs/logs/<task-id>.md`:
```markdown
## Attempt <N> — <ISO timestamp>
### Implementation plan
<3-5 bullet points describing your approach>
```

**Implement:**
1. Write the failing test first. Run it and confirm it fails with the expected reason.
2. Write the minimal implementation to make it pass.
3. Run verifiable signals in order:
   - `just lint` — must exit 0
   - `just test-unit` — must exit 0

**On pass (both green):**

Append to log:
```markdown
### Lint output
PASS
### Test output
PASS
### Outcome: success
```

Update task JSON: `"status": "completed"`, `"attempt": <N>`, append `"tdd-loop-complete"` to `completed_steps`.

Commit in worktree:
```bash
git add -A
git commit -m "feat(<scope>): <task description>"
```

Stop loop.

**On fail:**

Append full output to log (lint under `### Lint output`, tests under `### Test output`). Append `### Outcome: failed — <one-line root cause>`. Increment `attempt` in task JSON.

- If `attempt < 3`: return to start of TDD loop (new attempt)
- If `attempt == 3`: proceed to Hard Stop

**Hard Stop (3 attempts exhausted):**

Append `### Outcome: HARD STOP after 3 attempts` to log.

Write `.loop-logs/error/<task-id>.md`:
```markdown
# Failed: <task-id>

**Task:** <task description from plan>
**Plan:** <plan_path>
**Spec:** <spec_path>
**Attempts:** 3

## Attempt 1
<full lint + test output from log>
<output of: git diff>

## Attempt 2
<full lint + test output from log>
<output of: git diff>

## Attempt 3
<full lint + test output from log>
<output of: git diff>

## Reproduction
cd <worktree path>
just lint
just test-unit
```

Update task JSON: `"status": "failed"`.

Commit:
```bash
git add -A
git commit -m "wip: failed <task-id> after 3 attempts"
```

Stop.

---

### Squash Merge (after ALL agents finish)

Wait for all worktree agents to complete (success or hard-stop).

**For each task with `"status": "completed"`:**
```bash
git merge --squash worktree/<task-id>
git commit -m "feat(<scope>): <task description>"
git worktree remove .worktrees/<task-id> --force
git branch -D worktree/<task-id>
```

**For each task with `"status": "failed"`:**
- Do NOT merge its worktree.
- Log in `.loop-logs/logs/summary.md`: `FAILED: <task-id> — see .loop-logs/error/<task-id>.md`

**After all merges**, verify the history is linear:
```bash
git log --oneline
```
No merge commits should appear. If any do, the wrong merge strategy was used.

---
## Stage 1 Integrity Gate

**This check is mandatory. Do not advance to Stage 2 until it passes.**

Read every `.loop-logs/tasks/<task-id>.json` for all tasks parsed in Stage 0.

**Check 1 — Status**
Every task file must have `"status": "completed"` or `"status": "failed"`.
Any file still showing `"status": "pending"` or `"status": "in_progress"` means the
orchestrator or agent did not complete its bookkeeping.

**Check 2 — Log files**
Every task with `"status": "completed"` must have a corresponding file at
`.loop-logs/logs/<task-id>.md`.

**If either check fails**, print exactly:
```
STOP — Stage 1 integrity check failed.

Missing or stale bookkeeping detected:
<task-id>: status="pending" (expected: completed | failed)
<task-id>: missing .loop-logs/logs/<task-id>.md
```

Do NOT proceed to Stage 2. Investigate which agent or orchestrator step was skipped.
If using schema-enforced output, verify the orchestrator wrote the files after agent() returned.
If agents wrote files directly, check the agent prompt included steps A–D verbatim.

**If all checks pass:** Print `Integrity gate passed — advancing to Stage 2.` and proceed.

