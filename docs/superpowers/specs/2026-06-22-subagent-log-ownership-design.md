# Design: Subagent Log File Ownership

**Date:** 2026-06-22  
**Scope:** `skills/autonomous-feature-development/stage-impl.md`

## Problem

In the current skill, `.loop-logs/` file writes are split by mode:

- **Workflow tool mode**: orchestrator writes all files from structured agent output (`attempt_logs` in schema)
- **Non-Workflow mode**: agents write files directly (Steps B and D)

In practice, only `summary.md` materializes. Per-task log files (`.loop-logs/logs/<task-id>.md`) do not reliably appear. When something goes wrong, developers have no record of what each subagent actually did — implementation plans, lint output, test output, and failure reasons are lost.

Root cause: the orchestrator only knows what the agent's structured schema captures, and writing log files from that schema is a step that gets skipped or produces thin output.

## Design

### File Ownership Map

Split ownership explicitly. Agents own their own logs; orchestrator owns task state.

| File | Owner | When written |
|------|-------|--------------|
| `.loop-logs/tasks/<task-id>.json` | Orchestrator | Before spawn (`in_progress`), after agent returns (`completed`/`failed`) |
| `.loop-logs/logs/<task-id>.md` | **Agent** | Incrementally — appended after each TDD attempt |
| `.loop-logs/error/<task-id>.md` | **Agent** | On hard stop (3 failures exhausted) |
| `.loop-logs/logs/summary.md` | Orchestrator | Stage 4 only |
| `.loop-logs/tasks/verification-state.json` | Orchestrator | After each verification round |

The key rule: **agents always write their own log files, regardless of whether the Workflow tool is used.**

### Workflow Schema Change

Remove `attempt_logs` from the required agent response schema. Agents write that detail directly to their log file. The schema shrinks to:

```json
{
  "status": "completed" | "failed",
  "attempt_count": 2
}
```

The orchestrator uses only these two fields to write `.loop-logs/tasks/<task-id>.json`. It no longer formats a log file from schema output — that section is removed entirely.
This is a breaking schema change — any existing Workflow `agent()` call that reads `attempt_logs` from the result must be updated to expect only `status` and `attempt_count`.

### Agent Prompt Changes

**Remove the Workflow/non-Workflow split.** The current note that says "if not using the Workflow tool, include steps A–D verbatim" is replaced with a flat rule:

> Agents always write `.loop-logs/logs/<task-id>.md` and `.loop-logs/error/<task-id>.md` directly. This applies in both Workflow and non-Workflow mode.

**Add absolute log path injection.** Agents run inside `.worktrees/<task-id>` but must write logs to the main repo root. Before spawning each agent, the orchestrator computes the absolute path and injects it into the agent prompt:

```
Log path: <absolute-repo-root>/.loop-logs/logs/<task-id>.md
Error log path: <absolute-repo-root>/.loop-logs/error/<task-id>.md
```

Steps C and D in the Per-Task Agent Instructions already contain the correct append-to-log pattern — they only need the absolute path and removal of the "non-Workflow only" qualifier.

### Integrity Gate

No change. Stage 1 Check 2 already verifies `.loop-logs/logs/<task-id>.md` exists before advancing to Stage 2. Under this design, a missing log file unambiguously means the agent did not run to completion — the orchestrator can no longer be the silent explanation.

## Out of Scope

- Stage 3 fix agents (`.loop-logs/logs/fix-<issue-id>.md`) — separate improvement
- Stage 2 verification state — orchestrator ownership unchanged
- Stage 4 summary — orchestrator ownership unchanged

## Files Changed

| File | Change |
|------|--------|
| `skills/autonomous-feature-development/stage-impl.md` | Remove "orchestrator writes log from schema" section; shrink Workflow schema; remove Workflow/non-Workflow split on file writing; add absolute log path injection in agent prompt |
| `skills/autonomous-feature-development/stage-verify.md` | None |
| `skills/autonomous-feature-development/stage-review-fix.md` | None |
| `skills/autonomous-feature-development/stage-final.md` | None |
