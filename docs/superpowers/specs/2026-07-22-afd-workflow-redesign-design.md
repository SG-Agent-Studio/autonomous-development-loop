# AFD Workflow Redesign — Design

**Date:** 2026-07-22
**Status:** Approved
**Fixes:** `docs/user-feedbacks/2026-07-16-user-feedback.md` Issue 1 (continued — post-optimization cost still ~$40)
**Scope:** `skills/autonomous-feature-development/`

## Problem

The 2026-07-16 cost optimization (single multi-skill reviewer, severity-gated fix pipeline) brought the workflow to the correct structural shape but did not reduce cost enough. A 12-task real run (`2026-06-16-ticket-4-query-graph`) still cost ~$40. The dominant drivers are:

1. **Fix pipeline fan-out**: 4 actionable issues → 16 agent calls (2 blocking × 5 phases + 2 important × 3 phases). Each agent carries full system-prompt overhead (~50-100k tokens).
2. **Per-agent full plan load in Stage 1**: Each of 12 worktree agents reads the entire plan file (all 12 task sections) plus the full spec. Plan content that is 11/12ths irrelevant to a given agent is still loaded.
3. **explain-changes report**: 1 extra agent call at the end with no gating value (human can call the skill manually).

Target: ~$18-22 on a 12-task plan (from ~$40). Estimated agent reduction: ~35 → ~20.

## Approach

Approach B (Streamlined) from the brainstorm: apply three targeted changes and one structural cleanup, without rewriting the full pipeline.

## Design

### 1. Stage 1: Task section injection (stage-impl.md)

**Step 0.4 change:** When the orchestrator parses tasks (extracts `### Task N:` headings and line ranges), it also captures the **raw text** of each task section and holds it in memory alongside the task JSON. This text is injected verbatim into each per-task agent prompt before spawning.

**Agent prompt construction change:** Each agent prompt now contains the task section text directly, instead of a pointer to `plan_path` + an instruction to read the file.

**Agent Step C change:**

Old:
> From `plan_path`, read the full section for this task (from `### Task N: <name>` to next `### Task` heading or end of file). Also read full `spec_path` for architectural context.

New:
> Your task section is provided verbatim in this prompt (see `## Task Section` below). Read `spec_path` only for sections relevant to your task — do not read the entire file.

The agent never opens `plan_path`. The spec file is still accessible for agents that need broader architectural context, but they are instructed to read targeted sections rather than the full document.

Everything else in Stage 1 is unchanged: TDD loop (max 3 attempts), worktree per task, squash-merge back to feature branch, integrity gate, log-schema.md / log-sample.md requirements.

### 2. Stage 3: Fix pipeline collapse (stage-review-fix.md Part 2)

**Old Part 2** — per-issue worktrees, severity-gated phase counts:
- `blocking`: Plan → Review-plan → Implement → Review-impl → Verify (5 agents per issue)
- `important`: Implement → Review → Verify (3 agents per issue)
- Squash-merge per issue

**New Part 2** — one fix-all agent per loop iteration, working directly on the feature branch:

The orchestrator passes the complete actionable issue list (all blocking + important rows from the current review log) to a single **fix-all agent**. That agent:

1. Reads the current code at each `file:line` cited in the issue table.
2. For each issue (blocking issues first, then important): writes a failing test targeting the issue, confirms it fails for the expected reason, writes the minimal implementation fix, runs `<lint_cmd>` + `<test_cmd>`.
3. Once all issues are addressed and both commands exit 0: commits to the feature branch directly — `fix: address review issues round <N>`.
4. Returns `{ "status": "completed" | "failed", "issues_fixed": ["<issue-id>", ...] }`.

If lint/test fail at any point, the agent retries up to 3 times total (across all issues). On hard stop (3 attempts exhausted), it returns `"failed"` and the orchestrator writes `.loop-logs/<id>/error/fix-failure-round-<N>.md` and stops the pipeline.

**No worktrees for fixes.** No squash-merge. No per-issue git operations. The fix agent commits directly to the feature branch.

**Hard Rule 6 is preserved** — the orchestrator still never writes, reads, or executes product code. The fix-all agent is still a single-responsibility subagent; its responsibility is "fix all actionable issues in this round." The invariant "agent that implements never reviews" is preserved: the fix-all agent is distinct from the reviewer agent spawned in Part 1.

### 3. Stage 3: Verifier inlined (stage-review-fix.md)

The verifier subagent contract (currently in `stage-verify.md`) moves inline into `stage-review-fix.md` as a `## Verifier Subagent Contract` section at the top of the file — before Loop Control. No content changes; this is a relocation only.

The Loop Control step that previously read "run the VERIFY step in `./stage-verify.md`" becomes "run the VERIFY step (§ Verifier Subagent Contract below)."

The orchestrator reads one file per loop iteration instead of two. The human-verification handoff logic, resume flow, `verification-state.json` schema, `blocked` vs `CANNOT-VERIFY` routing table, and all mode-dependent policy tables move inline verbatim.

`stage-verify.md` is deleted.

### 4. Stage 4: Drop explain-changes (stage-final.md)

Step 4.2b (Generate reviewer report) is removed entirely. The human can invoke `skills/explain-changes` manually at any time after the run completes.

The handoff print statement in Step 4.3 (`human-in-loop` mode) currently includes a `Report: <report_path>` line; that line is removed. All other Step 4.3 and 4.4 logic is unchanged.

## File Inventory

| File | Action | What changes |
|---|---|---|
| `stage-impl.md` | Modified | Step 0.4 captures raw task text; agent prompt construction injects it; Step C rewritten |
| `stage-review-fix.md` | Modified | Verifier contract inlined at top; Part 2 rewritten to single fix-all agent on branch |
| `stage-final.md` | Modified | Step 4.2b deleted; Step 4.3 handoff message drops `Report:` line |
| `stage-verify.md` | **Deleted** | Content moved inline into `stage-review-fix.md` |
| `SKILL.md` | Modified | Stage table updated (verify step is now inline); `explain-changes` prerequisite removed |
| `log-schema.md` | Unchanged | — |
| `log-sample.md` | Unchanged | — |

## Agent Budget

| Stage | Before | After |
|---|---|---|
| Stage 1 — 12 parallel impl agents | 12 | 12 |
| Stage 2+3 loop — 2 iterations (verify + review + fix + re-verify) | 2 + 2 + 16 + 2 = 22 | 2 + 2 + 2 + 2 = 8 |
| Stage 4 — explain-changes | 1 | 0 |
| **Total** | **~35** | **~20** |

## Unchanged

- Verify↔review loop structure and ≤5 iteration cap
- End-to-end verification (verifying-implementation skill, `verification-state.json`, human handoff for `human-in-loop` mode)
- Worktrees for Stage 1 task implementation
- Squash-merge for Stage 1
- `decisions.md` and `summary.md` in Stage 4
- All Hard Rules except the fix-pipeline scope of Rule 6 (updated wording only)
- Mode A / Mode B selection
- `human-in-loop` vs `autonomous` interaction mode branching
- Stage 2 Clearance Gate
- Log format (`log-schema.md`, `log-sample.md`)

## Out of Scope

- Further per-task spec scoping (orchestrator injecting pre-selected spec sections per task) — the agent-reads-targeted-sections instruction covers this without orchestrator complexity
- Reducing the verify inner-round cap (currently ≤3)
- Reducing the review loop iteration cap (currently ≤5)
- Stage 2 verification scope reduction (re-verify only fix-related ACs on iterations 2+)

## Verification

Static consistency checks — every assertion below must hold after the edit:

1. `stage-review-fix.md` opens with a `## Verifier Subagent Contract` section containing the full verifier schema, `blocked` vs `CANNOT-VERIFY` routing table, verification-state.json schema, human handoff flow, and resume instructions — all verbatim from the deleted `stage-verify.md`.
2. `stage-review-fix.md` Part 2 describes exactly one fix-all agent with a max-3-retry TDD loop, a direct branch commit, and a structured return schema — no per-issue worktrees, no phase-count branching by severity.
3. `stage-impl.md` Step 0.4 captures raw task section text. The agent prompt construction step injects it. Agent Step C no longer references `plan_path` for reading.
4. `stage-final.md` contains no reference to `explain-changes`, `Step 4.2b`, or `report_path`.
5. `SKILL.md` stage table references `stage-review-fix.md` as the single file for the verify+review loop (no separate `stage-verify.md` entry).
6. `stage-verify.md` does not exist.
7. `log-schema.md` and `log-sample.md` are byte-identical to their pre-change versions.

## Decisions

| Question | Decision | Reason |
|---|---|---|
| Keep per-issue worktrees for fixes? | No — fix-all agent works directly on branch | Only reason for fix worktrees was concurrent isolation across N parallel fixers. With 1 fix agent, that reason is gone. A failed mid-fix branch is recoverable with `git reset`. |
| Keep per-issue severity-gated phase counts? | No — single fix-all agent handles all actionable issues | Phase counts exist to give small fixes less overhead. With 1 agent total, the overhead is already minimal; the agent naturally spends proportional effort per issue. |
| Inline stage-verify.md or keep as separate file? | Inline into stage-review-fix.md | Verifier contract is only ever used inside the loop. One file read per iteration instead of two, with no content loss. |
| Drop explain-changes entirely or make it optional in Stage 4? | Drop entirely | Human can invoke the skill manually. Adding optional-skip logic to stage-final.md adds complexity without reducing cost — it only saves cost if the user never wants it, in which case removing it is cleaner. |
| Scope spec per agent at orchestrator level? | No — instruct agents to read targeted sections | Orchestrator-level spec sectioning requires the orchestrator to understand which spec sections map to which task, which is brittle. Instructing agents to read targeted sections achieves equivalent reduction without orchestrator complexity. |
