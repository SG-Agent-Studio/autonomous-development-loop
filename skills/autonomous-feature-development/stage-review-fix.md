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

## Verifier Subagent Contract

The orchestrator does NOT verify or fix directly. It spawns subagents and routes on
their structured output.

**The verifier reports facts. The orchestrator decides policy.** Every mode-dependent
decision in this section belongs to the orchestrator.

### Verifier subagent (mode-blind)

Spawn a **verifier subagent** (single responsibility). It receives `spec_path` (absent
in Mode B), `mcp_available`, and the resolved commands. It is **not** given the
orchestrator's interaction mode and makes no mode-dependent decision.

It:

1. Runs the `verifying-implementation` skill — boots the system and exercises the
   changed endpoints/paths.
2. Matches observed output against the acceptance criteria in `spec_path`. **Mode B
   has no `spec_path`** — there the verifier instead exercises the changed paths for
   regressions only (boot succeeds and the changed endpoints/paths still work), with
   no spec-acceptance match.
3. Returns the schema below.

```json
{
  "outcome": "pass" | "fail",
  "failures": ["<root cause>", ...],
  "verified": [{ "ac": "...", "result": "PASS" | "FAIL", "evidence": "..." }],
  "blocked": [
    {
      "ac": "...",
      "reason": "needs browser; mcp_available=n",
      "how_to_check": "<smallest action a human can take>",
      "where_to_observe": "<URL / screen / log>"
    }
  ]
}
```

Rules:

- `outcome` reflects **only** the acceptance criteria the verifier could actually
  exercise. Entries in `blocked` never influence `outcome`.
- For each AC that needs the browser while `mcp_available == n`: do **not** attempt
  it. Add it to `blocked`, filling in `how_to_check` and `where_to_observe`. These are
  mandatory — the orchestrator is forbidden from reading product code (Hard Rule 6)
  and therefore cannot author them.
- Verify every other AC normally (curl / DB / logs / files / browser) and record each
  in `verified` with its evidence.

### `blocked` vs `CANNOT-VERIFY`

`verifying-implementation` returns `CANNOT-VERIFY` for several reasons. Only one of
them is human-handoff material. Route the rest to `failures`.

| Underlying cause                            | Goes to                        |
| ------------------------------------------- | ------------------------------ |
| AC needs a browser AND `mcp_available == n` | `blocked`                      |
| System failed to start                      | `failures` (→ `outcome: fail`) |
| AC unclear or unmeasurable                  | `failures` (→ `outcome: fail`) |
| Any other `CANNOT-VERIFY`                   | `failures` (→ `outcome: fail`) |

`blocked` means exactly one thing: **a capability this run lacks, which a human
possesses.** Nothing else. A crashed service is a failure, not a checklist item.

### Orchestrator: translate verifier output

The orchestrator maps the verifier's facts onto mode policy:

| `blocked`  | `outcome` | `autonomous`               | `human-in-loop`           |
| ---------- | --------- | -------------------------- | ------------------------- |
| empty      | `pass`    | → REVIEW                   | → REVIEW                  |
| empty      | `fail`    | Fix on failure             | Fix on failure            |
| non-empty  | `fail`    | hard-stop (CANNOT-VERIFY)  | **Fix on failure first**  |
| non-empty  | `pass`    | hard-stop (CANNOT-VERIFY)  | Human handoff → **PAUSE** |

**Fix-before-pause.** When real failures and blocked criteria coexist in
`human-in-loop`, run Fix on failure first and re-verify. Never hand a human a
checklist against code already known to be broken. The pause happens only once
everything machine-checkable is green. If the fix loop exhausts its 3 rounds, the
pipeline hard-stops and the pause is never reached.

**`autonomous` hard-stop.** Write `.loop-logs/<id>/error/verification-failure.md` with
the blocked AC list and stop, exactly as the 3-round failure path below does. This is a
backstop: Stage 0.7 already refuses to start an autonomous run with UI acceptance
criteria and no MCP.

### Verification state (single source of truth)

After **every** verify round — pass, fail, or pause — the orchestrator writes
`.loop-logs/<id>/tasks/verification-state.json`:

```json
{
  "rounds_completed": 2,
  "last_outcome": "pass" | "fail" | "awaiting_human",
  "checklist_path": ".loop-logs/<id>/verifications/verification-2.md",
  "resume": "See skills/autonomous-feature-development/stage-review-fix.md § Resume after human verification",
  "notes": "<optional context>"
}
```

- `checklist_path` is present **if and only if** `last_outcome == "awaiting_human"`.
- The `resume` pointer is load-bearing. A paused turn ends; the orchestrator's next
  context may be fresh. This field tells it where to find its own instructions.
- This file is the sole input to the **Stage 2 Clearance Gate** in the REVIEW step,
  which admits the REVIEW step only when `last_outcome` is `"pass"`.

### Human verification handoff (human-in-loop only)

Reached when `outcome == "pass"` and `blocked` is non-empty.

1. The orchestrator writes `.loop-logs/<id>/verifications/verification-<round>.md`
   (`<round>` = the verify-round counter, incremented per verify), copying
   `how_to_check` and `where_to_observe` verbatim from the verifier's `blocked[]`:

   ```markdown
   # Verification Checklist — Round <round>

   **Spec:** <spec_path>
   **How to run:** `<start_cmd>` — wait for the ready signal, then verify each item.

   ## Auto-verified (reference)
   - [PASS|FAIL] <ac> — <evidence>

   ## Needs your verification
   - <ac>
     - How to check: <how_to_check>
     - Where to observe: <where_to_observe>
     - Result: (pending)

   ---
   When every `Result:` line reads PASS or FAIL, reply `continue`.
   ```

   `Result:` is the single source of truth per item, and takes exactly one of
   `(pending)`, `PASS`, or `FAIL — <notes>`. There is deliberately no checkbox
   alongside it: a second field could disagree with the first.

2. The orchestrator writes `verification-state.json` with
   `"last_outcome": "awaiting_human"` and `checklist_path` set.

3. The orchestrator prints:

   ```
   Verification checklist ready at <checklist_path>.
   Fill in each `Result:` line (PASS or FAIL — <notes>), then reply `continue`.
   ```

4. **STOP.**

   ```
   STOP — Stage 2 is awaiting human verification.

   Do NOT run the REVIEW step.
   Do NOT spawn reviewers, a consolidator, or any fix agent.
   Do NOT advance to Stage 3 or Stage 4.

   End the turn now. Resume only on the human's reply, at
   "Resume after human verification" below.
   ```

### Resume after human verification

Triggered by the human's `continue` reply. The orchestrator:

1. Re-reads `checklist_path` from `verification-state.json`.
2. **Any item still `(pending)`** → stay paused. Print which items are pending and
   re-prompt. Do not guess. Do not proceed. End the turn again.
3. **Any `FAIL`** → write `"last_outcome": "fail"`, take the human's `FAIL — <notes>`
   text as the entries of `failures`, and run "Fix on failure" below. Re-verify from
   the top of this stage afterwards.
4. **All `PASS`** → merge the human's results with the verifier's `verified[]`, write
   `"last_outcome": "pass"`, drop `checklist_path`, and proceed to the REVIEW step
   (§ Part 1: Review below).

Step 4's state write is the only thing that unlocks the Clearance Gate. Skip it and the
run halts rather than proceeding — the gate fails closed by design.

**A pause does not consume a loop iteration.** Resume re-enters the current iteration
at this section; `iteration` increments only at the top of Loop Control.

### Fix on failure (≤3 inner rounds)

**If `outcome == "fail"`** (from the verifier, or from human-reported `FAIL` results):

1. For each entry in `failures`, the orchestrator spawns a **fix worktree agent**
   (single-responsibility implementer) using the TDD mini-loop from `stage-impl.md`,
   targeting that root cause. The agent — not the orchestrator — plans and implements
   the fix.
2. Squash-merge the fix (orchestrator):
   ```bash
   git merge --squash worktree/verification-fix-<round>
   git commit -m "fix: address verification failure round <round>"
   git worktree remove .worktrees/verification-fix-<round> --force
   git branch -D worktree/verification-fix-<round>
   ```
3. Re-run the verifier subagent. Repeat up to **3 inner rounds total**. Write
   `verification-state.json` after each round.

**If still failing after 3 rounds**, write `.loop-logs/<id>/error/verification-failure.md`:

```markdown
# Verification Failed After 3 Rounds

**Spec:** <spec_path, or "n/a — Mode B (regression-only verify)">

## Round 1

<full verifier output>

## Round 2

<full verifier output>

## Round 3

<full verifier output>
```

Commit and STOP the whole pipeline:

```bash
git add -A
git commit -m "wip: verification failed after 3 rounds — see .loop-logs/<id>/error/verification-failure.md"
```

---

## Loop Control

```
iteration = 0
LOOP:
  iteration += 1
  1. VERIFY  — run the VERIFY step (§ Verifier Subagent Contract above). If verify
     hard-stops after 3 inner rounds, the pipeline already stopped
     (verification-failure.md committed).
  1a. PAUSE CHECK — if verify handed off to the human (verification-state.json
     last_outcome == "awaiting_human"): STOP. Do NOT run REVIEW. End the turn.
     Resume at "Resume after human verification" (§ Verifier Subagent Contract above),
     which re-enters this iteration without incrementing `iteration`.
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
regression-only mode (see § Verifier Subagent Contract above): it confirms the changed paths still
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
<checklist_path> — resume at §Resume after human verification in this file.
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

The orchestrator passes the full actionable issue list — all `blocking` and `important`
rows from the current review log (issue ID, severity, summary, and `file:line`
evidence) — to a single **fix-all agent**. The agent works directly on the feature
branch; no worktrees are used for review fixes.

The fix-all agent:

1. For each issue (blocking issues first, then important):
   a. Reads the code at the cited `file:line`.
   b. Writes a failing test that targets this specific issue.
   c. Confirms the test fails for the expected reason.
   d. Writes the minimal implementation fix.
   e. Runs `<lint_cmd>` + `<test_cmd>` — both must exit 0 before moving to the next issue.
2. When all issues are addressed and the full test suite is green:
   ```bash
   git add -A
   git commit -m "fix: address review issues round <N>"
   ```
3. Returns:
   ```json
   {
     "status": "completed" | "failed",
     "issues_fixed": ["<issue-id>", ...]
   }
   ```

**Retry limit:** If lint or tests fail at any point, the agent retries the full batch
up to **3 times total**. On hard stop (3 attempts exhausted), it returns `"failed"`.

**The agent that fixes issues is never the agent that reviewed them** — the reviewer
from Part 1 and the fix-all agent are always distinct spawns (Hard Rule 6 preserved).

### On fix-all failure

The orchestrator writes `.loop-logs/<id>/error/fix-failure-round-<N>.md`:

```markdown
# Fix Failed — Round <N>

**Issues attempted:**
<issue ID, severity, summary — one per line from the review log>
**Attempts:** 3

## Attempt 1
<full lint + test output>
<output of: git diff>

## Attempt 2
<full lint + test output>
<output of: git diff>

## Attempt 3
<full lint + test output>
<output of: git diff>
```

Then commits and stops the pipeline:

```bash
git add -A
git commit -m "wip: fix-all failed round <N> — see .loop-logs/<id>/error/fix-failure-round-<N>.md"
```

The loop does not continue after a fix-all failure.

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
