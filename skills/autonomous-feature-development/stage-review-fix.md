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
  1a. PAUSE CHECK — if verify handed off to the human (verification-state.json
     last_outcome == "awaiting_human"): STOP. Do NOT run REVIEW. End the turn.
     Resume at "Resume after human verification" in ./stage-verify.md, which
     re-enters this iteration without incrementing `iteration`.
  2. REVIEW  — run the Stage 2 Clearance Gate below, then Part 1: spawn the review
     agent, then write .loop-logs/<id>/code-review/round-<iteration>.md.
  3. If actionable count == 0:  exit LOOP → "After the Loop".
  4. If iteration == 5:  cap reached → write .loop-logs/<id>/error/review-loop-exhausted.md,
     commit wip:, exit LOOP → "After the Loop".
  5. Otherwise: run Part 2 (fix each actionable issue), squash-merge fixes, then GOTO
     LOOP (re-verify before the next review).
```

A pause does not consume an iteration. `iteration` increments only at the top of LOOP.
The ≤5 cap therefore counts review rounds, not human round-trips.

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

### Stage 2 Clearance Gate

**This check is mandatory. Do not spawn any reviewer until it passes.**

Read `.loop-logs/<id>/tasks/verification-state.json`.

**Proceed only if `last_outcome == "pass"`.** Any other value — and a missing or
unwritten file — halts the pipeline. The gate requires positive confirmation rather
than merely forbidding `awaiting_human`, so a silently-skipped verify is caught too.

If the gate does not pass, print exactly:

```
STOP — Stage 2 Clearance Gate failed.

verification-state.json last_outcome = <value, or "file missing">
Expected: "pass"

Stage 2 is not cleared. The review agent was NOT spawned.
If last_outcome is "awaiting_human", the run is waiting on the checklist at
<checklist_path> — resume at "Resume after human verification" in ./stage-verify.md.
```

Then end the turn. Do not advance to Stage 3 or Stage 4.

### Spawn the review agent

**Model-tier decision (orchestrator git plumbing, no subagent):**

```bash
git diff --stat <base_sha>..HEAD
```

If total changed lines > 3000, OR files changed > 20: use `Sonnet[1m]` for the
reviewer agent below. Otherwise: use standard Sonnet.

The orchestrator spawns one reviewer agent (at the resolved model tier) against
the full cumulative diff (`<base_sha>..HEAD`). It applies every installed review
skill against that same diff read:

| Skill                      | Always applied?                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `enhanced-review`          | yes                                                                                 |
| `simplify`                 | yes                                                                                 |
| `ponytail:ponytail-review` | only if the `ponytail` plugin is installed — skip this skill (not the whole review) if absent |

The agent:

1. Applies each skill above against the same diff read.
2. self-dedupes overlapping findings surfaced under different skill lenses.
3. Verifies each surviving finding is evidence-backed (file:line, not hypothetical)
   before including it.
4. Tags each finding with severity: `blocking` / `important` / `minor`.
5. Returns the final issue table directly. There is no separate consolidation step — the reviewer's own output is the log's "Findings" section verbatim.

### Orchestrator writes the code-review log

The orchestrator (NOT the reviewer agent) writes
`.loop-logs/<id>/code-review/round-<iteration>.md`, using the reviewer's output
directly — there is no separate consolidation step to derive it from:

```markdown
# Code Review — Round <iteration>

**Timestamp:** <ISO>
**Loop iteration:** <iteration> of ≤5
**Model tier:** <Sonnet | Sonnet[1m]> (diff: <N> lines / <M> files changed)

## Findings

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

### Per-Issue Fix Pipeline (severity-gated)

Use **separate single-responsibility agents per phase** — the agent that implements a
fix is never the agent that reviews it. Phase count depends on the issue's severity.

**`blocking` issues — full 5-phase pipeline:**

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

**`important` issues — collapsed 3-phase pipeline (no plan-approval gate):**

- **Phase 1 — Implement** (Implementer agent): TDD — write failing test, confirm it
  fails for the expected reason, write minimal implementation, then `<lint_cmd>` and
  `<test_cmd>` both exit 0. Commit `fix(<scope>): <issue description>`.
- **Phase 2 — Review** (enhanced-review agent): review the code change; if issues →
  back to Phase 1; repeat until approved.
- **Phase 3 — Verify** (Implementer agent): `<lint_cmd>` + `<test_cmd>` one final
  time; mark resolved. The orchestrator never runs lint/test itself.

`minor` issues are never fixed in-loop, regardless of pipeline — see Loop Control.

### Squash-merge each fix (orchestrator)

Follow `../../rules/git-linear-history.md` — squash merge only, never plain
`git merge`.

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
