# Stage 3 / Mode B: Capped Verify↔Review Loop

Stage 3 is not a single pass. It is a loop that alternates VERIFY (Stage 2) and
REVIEW until a review round raises **zero actionable issues**, or a hard cap of 5
iterations is hit.

Used in two contexts:

- **Mode A**: After Stage 1, the orchestrator runs the Loop Control below.
- **Mode B Standalone**: Issues already exist from a received code review — the
  orchestrator first validates and fixes them (Part 0), then enters the same loop.

The orchestrator NEVER reviews, validates, consolidates, plans, or fixes itself. Every
such action is delegated to a single-responsibility subagent. The agent that implements
a fix is never the agent that reviews it. The orchestrator only spawns agents, reads
their structured output, does git plumbing, and writes logs.

---

## Loop Control

```
iteration = 0
LOOP:
  iteration += 1
  1. VERIFY  — run the VERIFY step in ./stage-verify.md. If verify hard-stops after 3
     inner rounds, the pipeline already stopped (verification-failure.md committed).
  2. REVIEW  — run Part 1: spawn reviewers + consolidator, then write
     .loop-logs/<id>/code-review/round-<iteration>.md.
  3. If actionable count == 0:  exit LOOP → "After the Loop".
  4. If iteration == 5:  cap reached → write .loop-logs/<id>/error/review-loop-exhausted.md,
     commit wip:, exit LOOP → "After the Loop".
  5. Otherwise: run Part 2 (fix each actionable issue), squash-merge fixes, then GOTO
     LOOP (re-verify before the next review).
```

`actionable = issues tagged blocking OR important`. Minor issues never count toward the
loop and are never fixed in-loop; they are recorded in Part 1 and surfaced in the final
summary as deferred ("not handled yet").

---

## Part 0: Mode B — Validate & Fix Received Issues (Mode B only)

Compute `id = <today>-review-<current-branch>`. Issues exist in conversation context
from a received code review. The orchestrator spawns a **validation agent** which:

1. For each issue, reads the actual code to confirm the problem exists as described.
2. Marks each `valid` (real, reproducible in current code) or `invalid` (stale,
   incorrect, or subjective).
3. Produces a validated issue list with severity (blocking / important / minor).

Do NOT fix invalid issues. Fix each valid issue using the Per-Issue Fix Pipeline
(Part 2) and squash-merge. Then **enter Loop Control above** (starting at VERIFY).

Mode B has no `spec_path` in context, so the inherited VERIFY step runs in
regression-only mode (see `./stage-verify.md`): it confirms the changed paths still
work, with no spec-acceptance match.

---

## Part 1: Review (one iteration)

### Spawn fresh reviewers

The orchestrator spawns 3 reviewer subagents **in parallel** (Sonnet[1m] each). Each
reviews independently and returns raw findings:

| Agent      | Skill                                                                |
| ---------- | -------------------------------------------------------------------- |
| Reviewer A | `enhanced-review`                                                    |
| Reviewer B | `ponytail:ponytail-review` (skip if `ponytail` plugin not installed) |
| Reviewer C | `simplify`                                                           |

The orchestrator passes all raw findings to a **consolidation agent**, which:

1. Verifies each issue is real and evidence-backed (not hypothetical).
2. Deduplicates overlapping findings.
3. Returns a validated issue list, each tagged severity blocking / important / minor.

### Orchestrator writes the code-review log

The orchestrator (NOT the consolidator) writes
`.loop-logs/<id>/code-review/round-<iteration>.md`:

```markdown
# Code Review — Round <iteration>

**Timestamp:** <ISO>
**Loop iteration:** <iteration> of ≤5

## Raw findings

### Reviewer A — enhanced-review

<raw>
### Reviewer B — ponytail
<raw, or: skipped — plugin not installed>
### Reviewer C — simplify
<raw>

## Consolidated issues

| ID  | Severity                 | Summary | Evidence (file:line) |
| --- | ------------------------ | ------- | -------------------- |
| ... | blocking/important/minor | ...     | ...                  |

## Disposition

- Actionable (blocking + important) — to fix this iteration: <ids, or "none">
- Deferred (minor — NOT handled yet): <ids + summaries, or "none">
```

`actionable count` = number of blocking + important rows. Pass it to Loop Control step 3.

---

## Part 2: Fix Actionable Issues (one iteration)

Fix all actionable (blocking + important) issues **in parallel** using git worktrees,
one worktree per issue:

```bash
git worktree add .worktrees/fix-<issue-id> -b worktree/fix-<issue-id>
```

### Per-Issue Fix Pipeline

Use **separate single-responsibility agents per phase** — the agent that implements a
fix is never the agent that reviews it:

- **Phase 1 — Plan** (Planner agent): root cause + a concrete 3–5 bullet plan.
- **Phase 2 — Review plan** (enhanced-review agent): if issues → back to Phase 1 with
  feedback; repeat until approved.
- **Phase 3 — Implement** (Implementer agent): TDD — write failing test, confirm it
  fails for the expected reason, write minimal implementation, then `<lint_cmd>` and
  `<test_cmd>` both exit 0. Commit `fix(<scope>): <issue description>`.
- **Phase 4 — Review implementation** (enhanced-review agent): review the code change;
  if issues → back to Phase 3; repeat until approved.
- **Phase 5 — Verify** (Implementer agent): `<lint_cmd>` + `<test_cmd>` one final
  time; mark resolved. The orchestrator never runs lint/test itself.

### Squash-merge each fix (orchestrator)

```bash
git merge --squash worktree/fix-<issue-id>
git commit -m "fix(<scope>): <issue description>"
git worktree remove .worktrees/fix-<issue-id> --force
git branch -D worktree/fix-<issue-id>
```

After all fixes merged, confirm linear history (`git log --oneline`, no merge commits),
then return to Loop Control (re-verify).

---

## Cap Exhaustion

If iteration reaches 5 with actionable issues still open, the orchestrator writes
`.loop-logs/<id>/error/review-loop-exhausted.md`:

```markdown
# Review Loop Exhausted After 5 Iterations

**Spec:** <spec_path, or "n/a — Mode B">

## Outstanding actionable issues

<consolidated blocking + important from the final round>

## Per-iteration history

| Iteration | Actionable found | Fixed | Deferred minors |
| --------- | ---------------- | ----- | --------------- |
| 1         | ...              | ...   | ...             |
```

Then commit and proceed:

```bash
git add -A
git commit -m "wip: review loop exhausted after 5 iterations — see .loop-logs/<id>/error/review-loop-exhausted.md"
```

---

## After the Loop

**Mode A:** Read `./stage-final.md` and proceed to Stage 4.

**Mode B:** Run `superpowers:finishing-a-development-branch` (requires the `superpowers`
plugin — if absent, stop and tell the user to install it). Before that, print:

```
Fixed <N> actionable issues across <iterations> iteration(s).
Deferred <N> minor issues (see .loop-logs/<id>/code-review/).
Skipped <N> invalid issues (Mode B only).
```
