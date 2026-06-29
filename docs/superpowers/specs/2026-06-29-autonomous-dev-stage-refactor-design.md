# Design: Autonomous Feature Development — Stage 2/3 Refactor & Log Namespacing

**Date:** 2026-06-29
**Scope:** `skills/autonomous-feature-development/` (all stage files + `SKILL.md`) and a new `cleanup-loop-logs` skill
**Discussion record:** `docs/user-feedbacks/2026-06-29-stage-2-3-refactor-discussion.md`

## Problem

User observations on the running skill (Stage 0+1 work well; the rest does not):

1. **Orchestration leak** — in Stage 2 (verify) and Stage 3 (review), the main agent
   does the verify and the fixing itself instead of delegating to subagents. The main
   agent is supposed to be a pure orchestrator.
2. **Review runs once** — Stage 3 review executes a single pass. It should loop until
   no actionable issue remains, every fix should be done by a separate single-purpose
   subagent, and every change must re-run Stage 2 (verify) before the next review.
3. **No code-review log** — review output is never recorded. Each review run should be
   a new markdown file under a `code-review/` folder.
4. **Flat log layout** — logs live directly in `.loop-logs/logs|tasks|error`. Running
   multiple plans (or not cleaning up) mixes logs from different runs together.
5. **No cleanup skill** — no human-triggered way to delete the logs for a given run.

## Design

### 1. Run namespacing — the `id` (Issue 4)

Compute a single `id` once in Stage 0 and namespace every artifact under it.

- **Mode A:** `id` = plan filename basename, `.md` stripped
  (`2026-06-16-ticket-3-ingestion.md` → `2026-06-16-ticket-3-ingestion`).
- **Mode B:** `id` = `<today>-review-<current-branch>`.

New layout (everything moves under `<id>/`):

```
.loop-logs/<id>/logs/<task-id>.md
.loop-logs/<id>/logs/summary.md
.loop-logs/<id>/tasks/<task-id>.json
.loop-logs/<id>/tasks/verification-state.json
.loop-logs/<id>/error/<task-id>.md
.loop-logs/<id>/error/verification-failure.md
.loop-logs/<id>/error/review-loop-exhausted.md      (new)
.loop-logs/<id>/code-review/round-<N>.md            (new)
```

`error/` stays singular (existing name). The orchestrator injects absolute paths
(`<repo-root>/.loop-logs/<id>/...`) into every subagent prompt, exactly as today but
with `<id>` inserted. The resume guard reads `.loop-logs/<id>/tasks/<task-id>.json`;
because `id` is deterministic from the plan filename, resume still works.

**Limitation (documented):** runs started under the old flat layout are not migrated;
new runs namespace under `<id>/`.

### 2. Unified verify↔review loop (Issues 1, 2)

Stages 2 and 3 collapse into one loop, **cap = 5 iterations**:

```
ITERATION (max 5):
  ├─ VERIFY  — orchestrator spawns a verifier subagent (runs verifying-implementation,
  │            boots & exercises against spec, returns structured pass/fail + detail)
  │     └─ fail → spawn fix subagent (TDD mini-loop in a worktree) → squash-merge
  │              → re-verify, ≤3 inner rounds → on 3rd failure: write
  │              error/verification-failure.md, commit wip:, STOP
  ├─ REVIEW  — orchestrator spawns 3 reviewers in parallel + a consolidator (all
  │            subagents); orchestrator writes code-review/round-<N>.md
  ├─ actionable (blocking + important) == 0 ?
  │     ├─ YES → exit loop → Stage 4
  │     └─ NO  → spawn per-issue fix pipelines (parallel worktrees) → squash-merge each
  │              → LOOP back to VERIFY
  └─ iteration == 5 and still actionable → write error/review-loop-exhausted.md,
                                           commit wip:, proceed to Stage 4
```

- Verify always runs **before** each review, including the first one right after
  Stage 1.
- **Actionable = blocking + important only.** Minors never re-trigger the loop; they
  are listed in `round-<N>.md` and in the final summary, flagged "not handled yet."
- Nested caps are bounded: outer ≤5 × (verify-fix ≤3, per-issue TDD ≤3).

### 3. Orchestrator purity (Issue 1)

Hard rule: **the orchestrator never reads, writes, or executes product code or quality
checks; it only coordinates and records.**

| Orchestrator MAY do directly | MUST delegate to a subagent |
|---|---|
| Parse plan, compute `id`, init/merge task JSON | Write/edit any product code |
| Spawn subagents, read structured output + logs | Run tests / lint / verify |
| Git plumbing: squash-merge, worktree add/remove, branch delete, commits | Code review / consolidation / validation |
| Routing & loop-control decisions | Plan & implement fixes |
| Write `summary.md` + `code-review/round-<N>.md` | Boot/exercise the system (verify) |

**Stage 2 change:** today the main agent runs `verifying-implementation` directly. It
must instead spawn a **verifier subagent** that runs the skill and returns a structured
result the orchestrator routes on:

```json
{ "outcome": "pass" | "fail", "failures": ["<root-cause summary>", ...] }
```

### 4. Single-responsibility subagents, implement ≠ review (Issue 2)

Each subagent owns exactly one role: `verifier`, `reviewer` (×3), `consolidator`,
`validator`, `planner`, `plan-reviewer`, `implementer`, `impl-reviewer`. The agent
that writes a fix is never the agent that reviews it. A cohesive TDD loop stays inside
one `implementer` (it must see its own failing test). The Stage 3 per-phase pipeline
(plan → review-plan → implement → review-impl → verify) already satisfies this and is
kept.

### 5. Code-review logging (Issue 3)

One file per review iteration: `.loop-logs/<id>/code-review/round-<N>.md`, written by
the orchestrator from subagent structured output:

```markdown
# Code Review — Round <N>
**Timestamp:** <ISO>
**Loop iteration:** <N> of ≤5

## Raw findings
### Reviewer A — enhanced-review
<raw>
### Reviewer B — ponytail (or: skipped — plugin not installed)
<raw>
### Reviewer C — simplify
<raw>

## Consolidated issues
| ID | Severity | Summary | Evidence |
|----|----------|---------|----------|
| ... | blocking/important/minor | ... | file:line |

## Disposition
- Actionable (fixed this iteration): <ids of blocking + important>
- Deferred (minor, NOT handled yet): <ids + summaries>
```

The 3 reviewers and the consolidator return structured findings; the orchestrator (the
designated recorder) writes the file. The consolidator remains a pure analyzer.

### 6. Cleanup skill `cleanup-loop-logs` (Issue 5)

New skill at `skills/cleanup-loop-logs/SKILL.md`, frontmatter
`disable-model-invocation: true` (human-trigger-only; same mechanism `grill-me` uses).

Behavior:
1. **Select target.** Arg = an `id`, or a plan path (derive `id` from basename). No
   arg → list every `id` directory under `.loop-logs/` (size + last-modified) and ask
   the user which one, or "all".
2. **Show & confirm.** Print exactly what will be deleted (the `.loop-logs/<id>/`
   tree) plus any orphaned worktrees/branches detected for that run. Wait for
   confirmation — deletion is irreversible.
3. **Delete logs.** Remove `.loop-logs/<id>/`.
4. **Prune orphans.** Detect leftover `.worktrees/<task-id>` dirs and `worktree/*`
   branches belonging to that run (`git worktree remove --force`, `git branch -D`).

The skill touches logs, worktrees, and branches only — never product code.

### 7. Mode B inherits the full loop (Issues 1, 2)

`SKILL.md` Mode B becomes: validate received external issues (validator subagent) →
fix validated ones (per-phase pipeline) → **enter the same unified loop** (verify →
review-until-clean, cap 5) → `superpowers:finishing-a-development-branch`. Mode B's
only distinction is the validate-and-fix-external-issues entry step; after that the
loop is identical to Mode A.

## Files Changed

| File | Change |
|------|--------|
| `skills/autonomous-feature-development/SKILL.md` | Compute/define `id`; describe the unified Stage 2↔3 loop; state the orchestrator-purity hard rule; Mode B inherits the full loop |
| `skills/autonomous-feature-development/stage-impl.md` | Namespace all paths under `.loop-logs/<id>/`; inject `<id>` into agent log paths |
| `skills/autonomous-feature-development/stage-verify.md` | Delegate verify to a verifier subagent (structured output); namespace paths; this stage becomes the loop's VERIFY step |
| `skills/autonomous-feature-development/stage-review-fix.md` | Wrap review in the capped loop; actionable = blocking+important; orchestrator writes `code-review/round-<N>.md`; re-verify after each fix batch; `review-loop-exhausted.md` on cap; namespace paths; Mode B enters the loop |
| `skills/autonomous-feature-development/stage-final.md` | Namespace summary path; summary reports loop iterations + deferred minors |
| `skills/cleanup-loop-logs/SKILL.md` | **New.** Human-only cleanup of `.loop-logs/<id>/` + orphaned worktrees/branches |

## Out of Scope

- Migration of old flat-layout logs to the namespaced layout.
- Reviewer model selection (stays Sonnet[1m]) and the reviewer skill set
  (enhanced-review / ponytail / simplify) — unchanged.
- Stage 0+1 implementation flow — works well, left intact apart from path namespacing.
- Verify booting mechanics inside a subagent — uses `verifying-implementation` as-is.
