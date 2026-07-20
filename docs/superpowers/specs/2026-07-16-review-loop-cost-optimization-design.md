# Review Loop Cost Optimization — Design

**Date:** 2026-07-16
**Status:** Approved
**Fixes:** Issue 1 in `docs/user-feedbacks/2026-07-16-user-feedback.md`
**Scope:** `skills/autonomous-feature-development/stage-review-fix.md`, `skills/autonomous-feature-development/SKILL.md`

## Problem

Users report per-run cost of $29-60 on `autonomous-feature-development` /
`human-in-loop-feature-development` (Claude Sonnet 5). Goal: ~$15-20/run.

The dominant cost driver is Stage 3's capped verify↔review loop
(`stage-review-fix.md`), which fans out multiplicatively on every iteration
(up to 5):

- **Review step:** 3 independent reviewer agents (`enhanced-review`,
  `ponytail-review`, `simplify`, each `Sonnet[1m]`) + 1 consolidation agent =
  4 full-context agent calls, repeated every iteration even though the diff
  under review shrinks after iteration 1.
- **Fix pipeline:** every actionable issue — blocking or important — runs
  the same 5-phase pipeline (Plan → Review-plan → Implement → Review-impl →
  Verify), each phase a separate agent call, regardless of how small the fix
  is.

Neither Stage 2 (VERIFY — acceptance-criteria testing) nor the per-task
implementation stage (`stage-impl.md`) are in scope for this change; the user
selected only the review-fan-out and fix-pipeline optimizations from a larger
candidate list.

## Design

### 1. Review step: one multi-skill agent replaces the 3-reviewer panel + consolidator

Every loop iteration (1 through the cap), the orchestrator spawns **one**
reviewer agent instead of three-plus-a-consolidator. That agent:

1. Applies every installed review skill against the same diff read:
   `enhanced-review` and `simplify` always; `ponytail-review` only if the
   `ponytail` plugin is installed (same prerequisite check as today — skip
   the skill, not a whole reviewer, if absent).
2. Self-dedupes overlapping findings surfaced under different skill lenses.
3. Verifies each surviving finding is evidence-backed (file:line, not
   hypothetical) before including it.
4. Tags each with severity: `blocking` / `important` / `minor`.
5. Returns the final issue table directly — the same shape the old
   consolidation agent used to return. No separate consolidation call.

This agent reviews the **full cumulative diff** (`base_sha..HEAD`) on every
iteration, including iteration 1 — there is no scoped/incremental diffing and
no separate "final confirmation" pass. Both were considered and rejected (see
Decisions).

### 2. Model tier policy

Default to standard Sonnet for the reviewer agent. Escalate to `Sonnet[1m]`
only when the diff is actually large: orchestrator runs
`git diff --stat base_sha..HEAD` (git plumbing, no subagent) before spawning
the reviewer, and escalates if total changed lines > 3000 OR files changed >
20. Otherwise standard Sonnet.

### 3. Severity-gated fix pipeline

`stage-review-fix.md` Part 2 branches by severity instead of running every
actionable issue through the same 5 phases:

- **`blocking`** — unchanged 5-phase pipeline: Plan (Planner agent) →
  Review-plan (`enhanced-review` agent, loop back to Plan on rejection) →
  Implement (Implementer agent, TDD) → Review-impl (`enhanced-review` agent,
  loop back to Implement on rejection) → Verify (Implementer agent, final
  lint+test).
- **`important`** — collapsed 3-phase pipeline: Implement (Implementer
  agent, TDD: failing test → minimal fix → `<lint_cmd>` + `<test_cmd>` both
  exit 0, commit `fix(<scope>): <issue description>`) → Review
  (`enhanced-review` agent, single pass; loop back to Implement on rejection)
  → Verify (Implementer agent, final lint+test, mark resolved). No plan
  phase, no plan-review gate.
- **`minor`** — unchanged: deferred, never fixed in-loop.

The agent that implements a fix is still never the agent that reviews it, in
both pipelines — this invariant is unchanged.

### 4. Code-review log template

`.loop-logs/<id>/code-review/round-<N>.md` drops the per-reviewer "Raw
findings" subsections (A/B/C) and the separately-derived "Consolidated
issues" step. It gets one "Findings" section, written directly from the
single reviewer agent's output (which already includes severity and
evidence). The "Disposition" section (actionable vs. deferred) is unchanged.

### 5. Unchanged

Stage 2 VERIFY (acceptance-criteria testing), the Stage 2 Clearance Gate, cap
exhaustion handling (`review-loop-exhausted.md`), per-issue parallel
worktrees, squash-merge mechanics, and the ≤5 iteration cap itself.

## Out of scope

- Stage 2 VERIFY scoping to just the fix-round's ACs — a separate candidate
  optimization the user did not select.
- Per-task partial spec reads in `stage-impl.md` — not selected.
- `explain-changes` report generation cost in `stage-final.md` — not
  selected; lowest-impact item, left for a future pass if still needed.

## Scope of change

| File | Change |
| --- | --- |
| `skills/autonomous-feature-development/stage-review-fix.md` | Part 1 rewritten: 1 multi-skill reviewer agent replaces 3 reviewers + consolidator; model-tier selection step added; Part 2 branches fix-pipeline phase count by severity; code-review log template updated |
| `skills/autonomous-feature-development/SKILL.md` | Reviewer-roster description and `ponytail` prerequisite note updated from "one of three parallel reviewers" to "one of the skills the single reviewer agent applies" |

`stage-verify.md`, `stage-impl.md`, `stage-final.md`, and
`human-in-loop-feature-development/SKILL.md` are not modified.

## Verification

Static consistency check over the skill tree — every assertion below must
hold after the edit:

1. `stage-review-fix.md` no longer instructs spawning 3 separate reviewer
   subagents or a separate consolidation agent.
2. `stage-review-fix.md` documents the single reviewer agent's skill list,
   its self-consolidation responsibility (dedupe, evidence-check, severity
   tag), and its output schema.
3. `stage-review-fix.md` documents the `git diff --stat`-based model-tier
   decision step and the concrete thresholds (3000 lines / 20 files).
4. Part 2 documents two distinct phase counts keyed off severity
   (`blocking` = 5 phases, `important` = 3 phases), each still using
   separate single-responsibility agents per phase.
5. `stage-verify.md`, `stage-impl.md`, `stage-final.md` are byte-identical to
   their pre-change versions.
6. `SKILL.md`'s prerequisites section still describes `ponytail` as optional
   and gracefully degradable (skip the skill, not the reviewer, if absent).

**Residual risk, stated plainly.** No live dry-run of a full pipeline run is
part of this spec — that would require executing the skill end-to-end
against a real plan/spec. The first real run after this change should be
watched for actual cost delta against the $15-20 target; if the single
multi-skill agent misses issues the old 3-reviewer panel would have caught,
that's a quality regression to watch for, not something a static check can
catch.

## Decisions

| Question | Decision | Reason |
| --- | --- | --- |
| Exit condition: trust a cost-saving reviewer on later iterations, or run a full 3-panel confirmation before exiting? | Moot — every iteration reviews the full diff with one agent | Once per-iteration diff scoping was rejected (see below), there is no scoped-vs-full distinction left to reconcile at exit. |
| Which reviewer runs on cost-saving iterations? | One agent applying all installed review skills together, not a single skill's reviewer | Avoids 3x redundant diff loading while keeping multi-lens coverage — user's explicit preference over picking one skill (e.g. `enhanced-review` alone) or rotating skills per iteration. |
| Use the single multi-skill agent on every iteration, or only "cheap" ones? | Every iteration, including iteration 1 | Consistency — no special-cased "first pass is different" logic, and it's the maximal-savings option. |
| Keep a separate consolidation agent? | Drop it | A single agent reasoning over its own fresh findings doesn't need a second agent to reconcile multiple independent reports that no longer exist. |
| Diff scope per iteration: full cumulative diff every time, or only the fix-delta on iterations 2+? | Full cumulative diff every time | User overrode the scoped-diff recommendation, preferring simplicity/safety over the marginal extra savings incremental scoping would add. |
| Does a final full-diff pass still run when the loop hits the 5-iteration cap with issues still open? | No | Cap-exhaustion already writes `review-loop-exhausted.md` and commits `wip:`; one more review changes nothing about that outcome. |
| Fix-pipeline collapse: which severities get the shorter 3-phase pipeline? | `important` only; `blocking` keeps the full 5-phase pipeline | Blocking issues are where an unreviewed plan is most costly to get wrong; important issues are typically small enough that TDD + one review catches problems without a separate plan-approval gate. |
