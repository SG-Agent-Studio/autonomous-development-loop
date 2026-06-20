# Loop-Logs Harness Fix — Design Spec

**Date:** 2026-06-20

---

## Problem

The `autonomous-feature-development` skill delegates bookkeeping (task JSON status updates,
attempt log writes, error file creation) to per-task worktree agents inside the Workflow
script. When an orchestrator writes agent prompts, it tends to distil the implementation
content from the plan and omit the bookkeeping steps from `stage-impl.md`. Nothing in the
skill enforces that bookkeeping happened before the pipeline advances to Stage 2.

Observed failures in the previous run:

- All 12 task files remained `"status": "pending"` after Stage 1 completed.
- No `.loop-logs/logs/<task-id>.md` files were created.
- `.loop-logs/tasks/verification-state.json` was never written during Stage 2.

---

## Root Cause

There are two compounding gaps:

**Gap 1 — No enforcement mechanism on agent output.**
The skill tells agents to follow steps A–D but does not require structured output. An
orchestrator can write any agent prompt it likes. The bookkeeping steps get dropped when the
orchestrator distils the implementation content from the plan.

**Gap 2 — No integrity check at stage boundaries.**
The pipeline advances from Stage 1 → Stage 2 without verifying that `.loop-logs/` files
reflect what actually happened. Stale task files and missing log files are silently accepted.

---

## Design Goals

1. Make bookkeeping **impossible to omit** by moving file writes to the orchestrator layer.
2. Make bookkeeping omissions **detectable and pipeline-blocking** even when orchestrators
   don't follow the schema approach.
3. Fix the `verification-state.json` gap so it is always written at the end of Stage 2
   regardless of pass/fail outcome.

---

## Acceptance Criteria

### AC-1 — Schema definition in stage-impl.md

`stage-impl.md` documents a required per-task agent response schema with fields:

- `status`: `"completed"` | `"failed"`
- `attempt_count`: integer
- `attempt_logs`: array of objects with fields `attempt` (int), `plan` (string),
  `lint_output` (string), `test_output` (string), `outcome` (string)

The schema section includes an explicit instruction: the orchestrator writes
`.loop-logs/tasks/<task-id>.json` and `.loop-logs/logs/<task-id>.md` from the agent's
return value. Agents do not write these files themselves.

### AC-2 — Orchestrator task-state ownership

`stage-impl.md` instructs the orchestrator to:

- Write `"status": "in_progress"` into the task JSON **before** calling `agent()` (not
  inside the agent prompt).
- Write `"status": "completed"` or `"status": "failed"` into the task JSON **after**
  `agent()` returns, using the schema output.

### AC-3 — Integrity gate in stage-impl.md

After the "Squash Merge" section, `stage-impl.md` adds a mandatory "Stage 1 Integrity Gate"
step that:

- Reads every `.loop-logs/tasks/<task-id>.json`.
- Fails with a `STOP` message if any file has `"status": "pending"` or `"status":
"in_progress"`.
- Fails with a `STOP` message if any task with `"status": "completed"` is missing its
  `.loop-logs/logs/<task-id>.md` file.
- Lists each failing task by name in the error output.
- Does NOT advance to Stage 2 when any check fails.

### AC-4 — Unconditional verification-state.json write in stage-verify.md

`stage-verify.md` writes `.loop-logs/tasks/verification-state.json` at the end of
verification regardless of whether the outcome is pass or fail. The write happens once per
round. On a first-pass success (round 1, outcome pass) the file is still written.

### AC-5 — No existing protocol steps removed

The per-agent TDD loop (steps A–D), squash merge logic, hard-stop behaviour, error file
format, and Stage 2–4 structure are unchanged. Only additions and clarifications are made.

### AC-6 — Clarity: orchestrator vs. agent responsibility

The revised `stage-impl.md` clearly separates what the **orchestrator** owns (task JSON
writes, log file writes) from what the **agent** owns (implementation, lint/test output
content). The distinction is explicit in the section headings and prose.

---

## Files to Modify

| File              | Change                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `stage-impl.md`   | Add schema definition + orchestrator ownership section before Stage 1; add integrity gate after squash merge |
| `stage-verify.md` | Write `verification-state.json` unconditionally at end of each round                                         |

**No new files.** No changes to `SKILL.md`, `stage-review-fix.md`, or `stage-final.md`.

---

## Out of Scope

- Retroactive repair of existing `.loop-logs/` directories from past runs.
- Changes to how the Workflow script's agent prompts are authored (the schema guidance
  covers this, but the skill cannot enforce it at parse time).
- Changes to the task JSON schema shape (fields remain identical).
- Adding pre-commit hooks.
