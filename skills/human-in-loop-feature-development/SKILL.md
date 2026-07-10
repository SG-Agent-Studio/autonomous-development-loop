---
name: human-in-loop-feature-development
description: Use for local, human-present feature development from a plan + spec (or review feedback) — the same pipeline as autonomous-feature-development, but it clarifies unresolved commands, hands off UI verification when Playwright MCP is unavailable, and leaves changes unstaged for the human to commit. Use when the user wants human-in-the-loop control, cannot auto-commit, or lacks `just`/MCP.
---

# Human-in-Loop Feature Development

Runs the same pipeline as `autonomous-feature-development`, with a human present:
the orchestrator clarifies instead of guessing, and pauses for human action at
capability gaps.

## Contract

Set `interaction_mode = human-in-loop`, then run `autonomous-feature-development`.
That engine owns every stage; this skill only sets the interaction contract. The
engine branches on `interaction_mode` at three orchestrator junctures:

1. **Unresolved command** (Stage 0) — ask the user, persist to `CLAUDE.md`, continue.
2. **Playwright MCP unavailable for a UI acceptance criterion** (Stage 2) — write a
   checklist to `.loop-logs/<id>/verifications/verification-<round>.md`, set
   `last_outcome: "awaiting_human"`, then **stop and end the turn**. Stage 3 is
   blocked by the Stage 2 Clearance Gate until the human clears it.

   The human fills in each `Result:` line (`PASS`, or `FAIL — <notes>`) **in that
   file**, then replies `continue`. Chat carries only the go signal; the file carries
   the results, so they survive context loss and stay auditable under `.loop-logs/`.
   Any `FAIL` re-enters the fix loop; all `PASS` proceeds to review. Items left
   `(pending)` keep the run paused.
3. **Commit** (Stage 4) — never auto-commit. Leave all changes unstaged on the
   branch and prompt the human to review + commit.

Clarify with the human on ambiguity at these junctures; pause and wait when human
action is needed. Subagents stay autonomous.

## Run

Invoke `autonomous-feature-development` with `interaction_mode = human-in-loop`.
