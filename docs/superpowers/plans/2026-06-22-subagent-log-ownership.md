# Subagent Log File Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `stage-impl.md` so agents write their own log files directly in both Workflow and non-Workflow modes, while the orchestrator retains ownership of task state JSON.

**Architecture:** Two focused edits to a single skill file — first the orchestrator schema/ownership section, then the per-task agent instructions. Task 2 depends on Task 1 (it references `LOG_PATH` and `ERROR_LOG_PATH` introduced in Task 1).

**Tech Stack:** Markdown

## Global Constraints

- Only `skills/autonomous-feature-development/stage-impl.md` is modified — no other files change.
- All other stage files (`stage-verify.md`, `stage-review-fix.md`, `stage-final.md`) are untouched.
- No new files are created.

---

### Task 1: Update orchestrator schema and ownership section

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md` (lines 64–157)

**Interfaces:**
- Produces: `LOG_PATH` and `ERROR_LOG_PATH` concepts (absolute paths injected by orchestrator before spawning agents) — Task 2 references these.

- [ ] **Step 1: Define verification checklist**

Before editing, write these checks on paper (or mentally). After editing, verify each one:

```
[ ] Ownership preamble says agents write logs in both modes (not "orchestrator owns all writes")
[ ] Ownership table is present listing who owns which file
[ ] "MUST NOT write" prohibition for Workflow agents is removed
[ ] Schema has only {status, attempt_count} — no attempt_logs field
[ ] "Orchestrator writes log file from schema output" section is gone
[ ] Orchestrator section adds LOG_PATH/ERROR_LOG_PATH injection instruction
[ ] Fallback note replaced with flat rule applying to both modes
```

- [ ] **Step 2: Replace the ownership preamble (lines 66–82)**

Find this block (lines 66–82):
```
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
```

Replace with:
```
File writes are split by owner:

| File | Owner |
|------|-------|
| `.loop-logs/tasks/<task-id>.json` | Orchestrator |
| `.loop-logs/logs/<task-id>.md` | Agent (written directly, both Workflow and non-Workflow mode) |
| `.loop-logs/error/<task-id>.md` | Agent (written directly, both Workflow and non-Workflow mode) |
| `.loop-logs/logs/summary.md` | Orchestrator (Stage 4 only) |

### Task state lifecycle (orchestrator responsibility)

Before calling each per-task agent, the orchestrator:

1. Writes `{ "status": "in_progress", "worktree": ".worktrees/<task-id>" }` into `.loop-logs/tasks/<task-id>.json` (merging with the existing fields from Stage 0).
2. Computes the absolute repo root path (e.g. via `git rev-parse --show-toplevel`) and injects two paths into the agent's prompt:
   - `LOG_PATH`: `<absolute-repo-root>/.loop-logs/logs/<task-id>.md`
   - `ERROR_LOG_PATH`: `<absolute-repo-root>/.loop-logs/error/<task-id>.md`

After the agent returns, the orchestrator writes the final task state from the agent's structured output (see schema below).
```

- [ ] **Step 3: Shrink the required agent response schema (lines 84–106)**

Find this block (lines 84–106):
```
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
```

Replace with:
```
### Required agent response schema

When implementing Stage 1 via the Workflow tool, use the `schema` option on each
`agent()` call. The agent must return:

```json
{
  "status": "completed" | "failed",
  "attempt_count": 2
}
```

`attempt_count` ranges 1–3 (1 on first-pass success, 3 on hard stop). Rich attempt detail (implementation plan, lint output, test output, outcomes) is written directly to `LOG_PATH` by the agent — it does not travel through the schema.
```

- [ ] **Step 4: Remove the "Orchestrator writes log file from schema output" section (lines 108–133)**

Find and delete this entire block (lines 108–133):
```
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
```

Delete the block entirely. Nothing replaces it.

- [ ] **Step 5: Replace the fallback note with a flat rule (lines 149–154)**

Find this block (lines 149–155, after the `---` separator):
```
> **If not using the Workflow tool:** The agent prompt MUST include steps A–D from the
> "Per-Task Agent Instructions" section below verbatim. The plan's implementation content
> is additional context, not a replacement for those steps. In this mode the agent writes
> the files directly as specified in steps B and D.
```

Replace with:
```
**Both Workflow and non-Workflow mode:** The agent prompt MUST include steps A–D from
the "Per-Task Agent Instructions" section below. Agents write `LOG_PATH` and
`ERROR_LOG_PATH` directly in both modes — the orchestrator never writes those files.
```

- [ ] **Step 6: Verify checklist from Step 1**

Read the modified section (from `## Orchestrator: Agent Output Schema and File Ownership` to the `---` separator before `## Stage 1`). Tick off each item in the checklist. If any item fails, fix it before continuing.

- [ ] **Step 7: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md
git commit -m "feat(skill): split log ownership — agents write logs, orchestrator owns task JSON"
```

---

### Task 2: Update Per-Task Agent Instructions

**Depends on:** Task 1 (introduces `LOG_PATH` and `ERROR_LOG_PATH`)

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md` (lines 165–270)

**Interfaces:**
- Consumes: `LOG_PATH`, `ERROR_LOG_PATH` — absolute paths injected by orchestrator, defined in Task 1.

- [ ] **Step 1: Define verification checklist**

Before editing, write these checks. Verify each after editing:

```
[ ] Agent Step B mentions receiving LOG_PATH and ERROR_LOG_PATH from the orchestrator
[ ] Agent Step D "Before each attempt" appends to LOG_PATH (not relative path)
[ ] Agent Step D "On pass" appends to LOG_PATH
[ ] Agent Step D "On fail" appends to LOG_PATH
[ ] Agent Step D "Hard Stop" appends HARD STOP outcome to LOG_PATH
[ ] Agent Step D "Hard Stop" writes ERROR_LOG_PATH (not relative path)
[ ] No remaining references to relative path `.loop-logs/logs/<task-id>.md` in agent steps
[ ] No remaining references to relative path `.loop-logs/error/<task-id>.md` in agent steps
```

- [ ] **Step 2: Update Agent Step B to reference injected paths (lines 171–179)**

Find this block (lines 171–179):
```
#### Agent Step B — Create worktree

```bash
git worktree add .worktrees/<task-id> -b worktree/<task-id>
```

Switch working directory to `.worktrees/<task-id>` for ALL remaining steps. All bash commands, file reads, and git operations MUST run from within `.worktrees/<task-id>`.

Update task JSON: `"status": "in_progress"`, `"worktree": ".worktrees/<task-id>"`.
```

Replace with:
```
#### Agent Step B — Create worktree

```bash
git worktree add .worktrees/<task-id> -b worktree/<task-id>
```

Switch working directory to `.worktrees/<task-id>` for ALL remaining steps. All bash commands, file reads, and git operations MUST run from within `.worktrees/<task-id>`.

The orchestrator injects two absolute paths into this agent's prompt before spawning:
- `LOG_PATH` — absolute path to `.loop-logs/logs/<task-id>.md` in the main repo root
- `ERROR_LOG_PATH` — absolute path to `.loop-logs/error/<task-id>.md` in the main repo root

Use these paths for all log writes in Step D. Never use relative paths for log files — the working directory is the worktree, not the repo root.

Update task JSON: `"status": "in_progress"`, `"worktree": ".worktrees/<task-id>"`.
```

- [ ] **Step 3: Update Agent Step D — "Before each attempt" append (line 187)**

Find (line 187):
```
**Before each attempt**, append to `.loop-logs/logs/<task-id>.md`:
```

Replace with:
```
**Before each attempt**, append to `LOG_PATH`:
```

- [ ] **Step 4: Update Agent Step D — "On pass" append (line 203)**

Find (line 203):
```
Append to log:
```

Replace with:
```
Append to `LOG_PATH`:
```

- [ ] **Step 5: Update Agent Step D — "On fail" append (line 224)**

Find (line 224):
```
Append full output to log (lint under `### Lint output`, tests under `### Test output`). Append `### Outcome: failed — <one-line root cause>`. Increment `attempt` in task JSON.
```

Replace with:
```
Append full output to `LOG_PATH` (lint under `### Lint output`, tests under `### Test output`). Append `### Outcome: failed — <one-line root cause>`. Increment `attempt` in task JSON.
```

- [ ] **Step 6: Update Agent Step D — Hard Stop log appends (lines 231–233)**

Find (lines 231–233):
```
Append `### Outcome: HARD STOP after 3 attempts` to log.

Write `.loop-logs/error/<task-id>.md`:
```

Replace with:
```
Append `### Outcome: HARD STOP after 3 attempts` to `LOG_PATH`.

Write `ERROR_LOG_PATH`:
```

- [ ] **Step 7: Verify checklist from Step 1**

Read the full "Per-Task Agent Instructions" section. Tick off each item. Search for any remaining occurrences of `.loop-logs/logs/<task-id>.md` and `.loop-logs/error/<task-id>.md` in agent steps — both must be gone. If any item fails, fix it before continuing.

- [ ] **Step 8: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md
git commit -m "feat(skill): agents use injected LOG_PATH/ERROR_LOG_PATH in both modes"
```
