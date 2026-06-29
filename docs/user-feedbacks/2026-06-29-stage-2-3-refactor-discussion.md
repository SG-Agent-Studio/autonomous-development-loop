# Discussion Record — Autonomous Feature Development Stage 2/3 Refactor

**Date:** 2026-06-29
**Method:** `/grill-me` + `superpowers:brainstorming` (one decision at a time, recommended answer + alternatives)
**Source feedback:** `docs/user-feedbacks/user-feedback.md` (Issues 1–5)
**Scope:** `skills/autonomous-feature-development/` + one new `cleanup-loop-logs` skill

This file records the decisions made and the reasoning behind them. The formal
design lives in `docs/superpowers/specs/2026-06-29-autonomous-dev-stage-refactor-design.md`.

---

## Dependency framing

The five issues were ordered by dependency before discussion:

1. **Issue 4 (log location / `id`)** is the *data structure* decision — every other
   issue writes logs, so the `id` namespacing is the foundation. Decided first.
2. **Issue 1 (orchestrator purity)** + **Issue 2 (review loop + re-verify)** are the
   *control flow* — they restructure stages 2 and 3.
3. **Issue 3 (code-review logging)** depends on Issue 4's path layout.
4. **Issue 5 (cleanup skill)** depends on Issue 4's directory layout.

"Bad programmers worry about the code. Good programmers worry about data structures."
The `id` was settled before any control-flow discussion.

---

## Decisions

### D1 — Run `id` = plan filename basename (Issue 4)

**Decision:** A single `id` is computed once in Stage 0, equal to the plan filename
basename (e.g. `2026-06-16-ticket-3-ingestion.md` → `2026-06-16-ticket-3-ingestion`).
Mode B (no plan file) falls back to `<today>-review-<branch>`.

**Reason:** The plan filename already carries the `YYYY-MM-DD-description` shape the
user's example asked for. Deriving `id` from existing data means no new input, no
random generation, no special case. The resume guard stays deterministic (same plan
→ same `id` → finds existing task files).

**Alternatives rejected:** random short hash, user-supplied id, git-branch-based —
all add an input or a lookup the data already provides.

### D2 — Unified verify↔review loop shape (Issues 1, 2)

**Decision:** Stages 2 and 3 merge into one loop. Each iteration:
`VERIFY → REVIEW → (if actionable: fix → back to VERIFY)`. Verify always runs
*before* each review, including the first review right after Stage 1.

**Reason:** Issue 2 requires (a) repeated review until clean and (b) every change to
re-run stage 2 before the next review. Those two requirements *are* a loop; keeping
them as separate linear stages cannot satisfy "re-verify before next review."

### D3 — Loop cap = 5 with graceful `wip:` finalization (Issue 2)

**Decision:** Natural exit = a review round with zero actionable issues. Hard cap =
5 full iterations. On cap exhaustion: write `error/review-loop-exhausted.md` with
outstanding issues + per-iteration history, commit `wip:`, proceed to Stage 4.

**Reason:** "Loop until no actionable issue" can fail to terminate — reviewers always
find something, and a fix for A can reintroduce B. An autonomous loop with no human
watching must be bounded. This mirrors the existing 3-attempt TDD cap and 3-round
verify cap (same defensive pattern, consistent ceiling). Graceful finalize beats a
hard abort with no commit.

**Alternative rejected:** true uncapped loop — unbounded cost/non-termination risk.

### D4 — "Actionable" = blocking + important; minors deferred (Issue 2)

**Decision:** Only blocking + important issues re-trigger the loop. A round with zero
blocking and zero important exits the loop even if minors remain. Minors are still
listed in the per-run code-review log **and** in the final summary, flagged "not
handled yet."

**Reason:** If minor nitpicks counted, the loop would almost never converge
(reviewers always surface style nits) and would routinely burn all 5 iterations on
bikeshedding. The autonomous loop's job is correctness and real problems; a human can
sweep minors later. Keeping minors in the record preserves visibility without
blocking termination.

**Alternative rejected:** all severities actionable — far more likely to exhaust the
cap, higher cost, no correctness benefit.

### D5 — Orchestrator delegation boundary (Issue 1)

**Decision:** The orchestrator may ONLY: parse plan / compute `id` / init+merge task
JSON; spawn subagents and read their structured output + logs; git plumbing
(squash-merge, worktree add/remove, branch delete, commits); routing + loop-control
decisions; write `summary.md` and code-review log files. **Everything else is
delegated** — writing/editing product code, running tests/lint/verify, code
review/consolidation/validation, planning + implementing fixes, booting/exercising
the system.

Hard rule: *the orchestrator never reads, writes, or executes product code or quality
checks; it only coordinates and records.*

**Reason:** The user observed the main agent doing verify and fixes itself. Git
plumbing and summary writing are inherently serial coordination, not "development
work" — delegating a `git merge --squash` to a subagent would be pure overhead. The
line is drawn at *product code / quality checks*, not at *all file/git operations*.

### D6 — Subagent granularity = single-responsibility roles, implement ≠ review (Issue 2)

**Decision:** Each subagent owns one role (reviewer, consolidator, validator, planner,
plan-reviewer, implementer, impl-reviewer, verifier). The crucial guarantee: the
agent that writes a fix is never the agent that reviews it. A cohesive task like the
TDD loop (write failing test → implement → run lint/test) stays inside one
implementer agent.

**Reason:** The real intent behind "no subagent does multiple things" is *separation
of implementing from judging* (kills self-review bias), not atomizing every keystroke.
Strictly atomic agents would explode agent count, break the TDD red→green flow across
context boundaries (the implementer must see its own failing test), and contradict the
Stage 1 design the user said already works well.

**Alternative rejected:** strictly atomic (e.g. "write test" and "write impl" as two
agents).

### D7 — Code-review log: `round-<N>.md`, orchestrator-written (Issue 3)

**Decision:** One file per review iteration at `.loop-logs/<id>/code-review/round-<N>.md`,
containing: header (round N, ISO timestamp, loop iteration); raw findings per reviewer
(3 sections: enhanced-review, ponytail, simplify); consolidated validated list with
severity; disposition (actionable-fixed vs. minors-deferred, minors listed). Written
by the **orchestrator** from subagent structured output; the consolidator stays a pure
analyzer.

**Reason:** `round-<N>.md` is deterministic, ordered, and trivially greppable as a
sequence (vs. timestamped names). Centralized recording matches D5 (orchestrator is
the recorder). This is a deliberate exception to Stage 1's "agents write their own
logs" — there, parallel worktree agents log incrementally; here recording is
centralized and the orchestrator already holds all outputs.

### D8 — Cleanup skill `cleanup-loop-logs` (Issue 5)

**Decision:** New skill, `disable-model-invocation: true` (human-trigger-only).
Selection: arg = `id` (or plan path → derive `id`); no arg → list all `id` dirs under
`.loop-logs/` and ask which (or "all"). Always show what will be deleted and confirm
before removal. Removes `.loop-logs/<id>/` **and** prunes orphaned
`.worktrees/<task-id>` dirs + `worktree/*` branches for that run.

**Reason:** `disable-model-invocation` is the same mechanism `grill-me` uses, so the
orchestrator can never auto-invoke a destructive operation. Confirmation guards
against wiping the wrong run even though it is human-triggered. Worktree/branch
pruning was added (over logs-only) because interrupted runs leave orphaned worktrees
that are a real maintenance pain, and the cleanup skill is the natural place to handle
per-run teardown.

### D9 — Mode B inherits the full loop (Issues 1, 2)

**Decision:** Mode B (standalone review-fix) runs the same unified loop as Mode A.
Mode B's only distinction is its entry: validate the received external issues and fix
them, then enter the standard loop (verify → review-until-clean, cap 5) → finish.

**Reason:** The user chose consistency over a focused single pass. After fixing
external issues, the loop's verify catches fix-induced regressions and the 3-reviewer
panel catches anything the external review missed, until clean. Mode A and Mode B
share one loop implementation rather than maintaining two code paths.

---

## Settled minor points (folded into spec, not separately debated)

- `error/` stays singular (existing name) rather than the `errors/` in the feedback
  example — trivial, minimizes churn.
- The new `code-review/` folder is namespaced under `.loop-logs/<id>/` like everything
  else.
- Old flat-layout (`.loop-logs/logs/` etc.) in-flight runs are not migrated; new runs
  namespace under `<id>/`. Documented limitation.
- Nested caps are bounded: outer loop ≤5 × (verify-fix ≤3, per-issue TDD ≤3).
- Verify runs on the integrated feature branch; fix-on-failure uses a worktree.
- Final summary reports iteration count, issues found/fixed/deferred, and the deferred
  minors from the latest review round.
