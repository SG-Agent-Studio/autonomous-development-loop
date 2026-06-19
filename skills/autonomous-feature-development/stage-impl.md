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
