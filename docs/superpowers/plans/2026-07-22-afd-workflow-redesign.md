# AFD Workflow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce autonomous-feature-development per-run cost from ~$40 to ~$18-22 on a 12-task plan by collapsing the multi-phase fix pipeline to a single fix-all agent, inlining the verifier contract, and dropping the explain-changes stage.

**Architecture:** Four targeted edits to five skill Markdown files. No new files. `stage-verify.md` is deleted — its content moves inline into `stage-review-fix.md`. Each file has one focused change area; tasks are independent and can be done in any order except Task 4 (SKILL.md), which should be last.

**Tech Stack:** Markdown only — no compilation, no runtime. Verification is via `grep` and shell existence checks.

## Global Constraints

- `log-schema.md` and `log-sample.md` must not be modified
- Loop iteration cap (≤5) and verify inner-round cap (≤3) are unchanged
- Hard Rule 6 preserved: orchestrator never writes code; fix-all agent is the implementer
- All Mode A / Mode B branching preserved
- `human-in-loop` vs `autonomous` branching at the three orchestrator junctures preserved

---

### Task 1: Rewrite stage-review-fix.md and delete stage-verify.md

Three areas of `stage-review-fix.md` change, plus the source file is deleted:

1. Insert the Verifier Subagent Contract section (content relocated from `stage-verify.md`) before `## Loop Control`
2. Update the four cross-references that pointed at `./stage-verify.md`
3. Replace Part 2 (per-issue severity-gated pipeline → single fix-all agent)

**Files:**
- Modify: `skills/autonomous-feature-development/stage-review-fix.md`
- Delete: `skills/autonomous-feature-development/stage-verify.md`

**Interfaces:**
- Produces: self-contained `stage-review-fix.md` that owns the verifier contract, the loop, and the fix-all agent spec; `stage-verify.md` no longer exists

- [ ] **Step 1: Confirm pre-conditions**

```bash
grep -n "stage-verify.md" skills/autonomous-feature-development/stage-review-fix.md
```

Expected: 3 matches (Loop Control step 1, Loop Control step 1a, Stage 2 Clearance Gate).

```bash
grep -n "## Part 2:" skills/autonomous-feature-development/stage-review-fix.md
```

Expected: 1 match showing `## Part 2: Fix Actionable Issues (one iteration)`.

- [ ] **Step 2: Insert the Verifier Subagent Contract section**

Open `skills/autonomous-feature-development/stage-review-fix.md`. Find the line `## Loop Control` (currently around line 20). Insert the following block **immediately before** that line (leave a blank line between the inserted block and `## Loop Control`):

```markdown
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

```

- [ ] **Step 3: Update the four cross-references to `stage-verify.md`**

In `skills/autonomous-feature-development/stage-review-fix.md`, make the following four targeted replacements (search for the exact strings below):

**Replacement A — Loop Control step 1:**

Find:
```
  1. VERIFY  — run the VERIFY step in ./stage-verify.md. If verify hard-stops after 3
     inner rounds, the pipeline already stopped (verification-failure.md committed).
```

Replace with:
```
  1. VERIFY  — run the VERIFY step (§ Verifier Subagent Contract above). If verify
     hard-stops after 3 inner rounds, the pipeline already stopped
     (verification-failure.md committed).
```

**Replacement B — Loop Control step 1a:**

Find:
```
     Resume at "Resume after human verification" in ./stage-verify.md, which
```

Replace with:
```
     Resume at "Resume after human verification" (§ Verifier Subagent Contract above),
     which
```

**Replacement C — Stage 2 Clearance Gate print block:**

Find:
```
If last_outcome is "awaiting_human", the run is waiting on the checklist at
<checklist_path> — resume at "Resume after human verification" in ./stage-verify.md.
```

Replace with:
```
If last_outcome is "awaiting_human", the run is waiting on the checklist at
<checklist_path> — resume at §Resume after human verification in this file.
```

- [ ] **Step 4: Verify the three Loop Control / Clearance Gate references are updated**

```bash
grep -n "stage-verify.md" skills/autonomous-feature-development/stage-review-fix.md
```

Expected: **no output** (zero matches remaining in stage-review-fix.md).

- [ ] **Step 5: Replace Part 2**

Find the line `## Part 2: Fix Actionable Issues (one iteration)` and replace everything from that heading through the next `---` separator (exclusive — keep the `---`) with:

```markdown
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

```

- [ ] **Step 6: Verify Part 2 replacement**

```bash
grep -n "fix-all agent" skills/autonomous-feature-development/stage-review-fix.md
```

Expected: multiple matches (the new Part 2 content).

```bash
grep -n "blocking.*5-phase\|5-phase pipeline\|blocking.*full 5" skills/autonomous-feature-development/stage-review-fix.md
```

Expected: **no output** (old severity-gated pipeline is gone).

```bash
grep -n "worktree.*fix-\|fix-.*worktree" skills/autonomous-feature-development/stage-review-fix.md
```

Expected: **no output** in Part 2 area (worktrees still appear in Part 0 verification-fix section, which is unchanged — that's correct).

- [ ] **Step 7: Delete stage-verify.md**

```bash
rm skills/autonomous-feature-development/stage-verify.md
```

- [ ] **Step 8: Verify deletion**

```bash
[ ! -f skills/autonomous-feature-development/stage-verify.md ] && echo "DELETED OK" || echo "ERROR: still exists"
```

Expected: `DELETED OK`

- [ ] **Step 9: Commit**

```bash
git add skills/autonomous-feature-development/stage-review-fix.md
git add -u skills/autonomous-feature-development/stage-verify.md
git commit -m "refactor(skill): inline verifier contract and collapse fix pipeline

- Verifier subagent contract moved from stage-verify.md inline into
  stage-review-fix.md as ## Verifier Subagent Contract section
- Part 2 rewritten: single fix-all agent replaces per-issue severity-gated
  pipeline (was up to 16 agents per iteration; now 1)
- stage-verify.md deleted
- All cross-references updated"
```

---

### Task 2: Update stage-impl.md (task section injection)

Three targeted changes: Step 0.4 captures raw task text; the orchestrator's task state lifecycle step injects it into agent prompts; Agent Step C no longer reads `plan_path`.

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md`

**Interfaces:**
- Consumes: `task_sections` map populated by Step 0.4
- Produces: agents that receive their task section via prompt injection, never opening `plan_path`

- [ ] **Step 1: Confirm pre-conditions**

```bash
grep -n "read the full section for this task" skills/autonomous-feature-development/stage-impl.md
grep -n "Also read full.*spec_path" skills/autonomous-feature-development/stage-impl.md
```

Expected: both lines found.

```bash
grep -n "Record line range" skills/autonomous-feature-development/stage-impl.md
```

Expected: 1 match (the current Step 0.4 ends here).

- [ ] **Step 2: Extend Step 0.4 to capture raw task text**

Find the Step 0.4 bullet that reads:
```
- Record line range (from this heading to next `### Task` heading or end of file)
```

Add one new bullet immediately after it:

```markdown
- Capture the **raw text** of the task section (from `### Task N: <name>` through the last line before the next `### Task` heading or EOF) and store it in memory as `task_sections[task_id]`
```

- [ ] **Step 3: Verify Step 0.4 change**

```bash
grep -n "task_sections\[task_id\]" skills/autonomous-feature-development/stage-impl.md
```

Expected: 1 match.

- [ ] **Step 4: Inject TASK_SECTION into the orchestrator's agent prompt construction**

Find the "Task state lifecycle" section. Locate the numbered item that currently reads:

```
2. Computes the absolute repo root path (e.g. via `git rev-parse --show-toplevel`) and injects two paths into the agent's prompt:
   - `LOG_PATH`: `<absolute-repo-root>/.loop-logs/<id>/logs/<task-id>.md`
   - `ERROR_LOG_PATH`: `<absolute-repo-root>/.loop-logs/<id>/error/<task-id>.md`
```

Replace it with:

```markdown
2. Computes the absolute repo root path (e.g. via `git rev-parse --show-toplevel`) and injects into the agent's prompt:
   - `LOG_PATH`: `<absolute-repo-root>/.loop-logs/<id>/logs/<task-id>.md`
   - `ERROR_LOG_PATH`: `<absolute-repo-root>/.loop-logs/<id>/error/<task-id>.md`
   - `TASK_SECTION`: the raw task section text from `task_sections[task_id]` (captured in Step 0.4), injected verbatim including the `### Task N: <name>` heading
```

- [ ] **Step 5: Verify prompt injection change**

```bash
grep -n "TASK_SECTION" skills/autonomous-feature-development/stage-impl.md
```

Expected: 2 matches (Step 0.4 definition site + Step prompt injection site).

- [ ] **Step 6: Rewrite Agent Step C**

Find the section that begins:

```
#### Agent Step C — Read task content and write Task Header

From `plan_path`, read the full section for this task (from `### Task N: <name>` to next `### Task` heading or end of file). Also read full `spec_path` for architectural context.
```

Replace the opening two sentences (up to and including "for architectural context.") with:

```markdown
#### Agent Step C — Read task content and write Task Header

Your task section is provided verbatim in the `TASK_SECTION` variable injected into
this prompt — do **not** open `plan_path`. Read `spec_path` only for sections
relevant to your task; do not read the entire file.
```

Leave the remainder of Step C unchanged (the log-schema.md / log-sample.md reads, and the Task Header writing instructions stay as-is).

Also update the Task Header bullet that currently reads:
```
- Copy the full plan section verbatim
```

Replace with:
```
- Copy the task section from `TASK_SECTION` verbatim
```

- [ ] **Step 7: Verify Agent Step C changes**

```bash
grep -n "plan_path.*read the full section\|read the full section.*plan_path" skills/autonomous-feature-development/stage-impl.md
```

Expected: **no output**.

```bash
grep -n "TASK_SECTION" skills/autonomous-feature-development/stage-impl.md
```

Expected: 3 matches (Step 0.4 capture, prompt injection, and Step C instruction).

```bash
grep -n "do not open.*plan_path\|not open.*plan_path" skills/autonomous-feature-development/stage-impl.md
```

Expected: 1 match (the new Step C instruction).

- [ ] **Step 8: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md
git commit -m "refactor(skill): inject task section into agent prompts in stage-impl

Each Stage 1 agent now receives its task section verbatim via TASK_SECTION
in the prompt rather than reading the full plan file. Step 0.4 captures
raw task text; agent Step C updated to use TASK_SECTION, not plan_path."
```

---

### Task 3: Update stage-final.md (drop explain-changes)

Two changes: remove Step 4.2b entirely and clean up the Step 4.3 handoff message that referenced it.

**Files:**
- Modify: `skills/autonomous-feature-development/stage-final.md`

**Interfaces:**
- Produces: Stage 4 with no explain-changes invocation; `report_path` variable no longer referenced anywhere

- [ ] **Step 1: Confirm pre-conditions**

```bash
grep -n "explain-changes\|report_path\|4\.2b" skills/autonomous-feature-development/stage-final.md
```

Expected: multiple matches (Step 4.2b block + Step 4.3 conditional).

- [ ] **Step 2: Delete Step 4.2b**

Find and delete the entire Step 4.2b block — from the heading line through the paragraph ending "continue to Step 4.3 regardless.":

```
## Step 4.2b — Generate reviewer report

Invoke the `explain-changes` skill in diff-review mode, passing: `id`,
`plan_path`, `spec_path`, `base_sha` (recorded in `stage-impl.md` Step 0.3), and
the paths written above (`summary.md`, `decisions.md`, any
`code-review/round-*.md`, any `error/*.md`). Output goes to
`.loop-logs/<id>/reports/`.

Capture what it returns — `Report generated: <path>` on success, or the failure
line — as `<report_path>` for Step 4.3 (empty if it failed).

This step must never block the pipeline: if `explain-changes` is unavailable,
errors, or does not produce a file, print one line noting the failure and
continue to Step 4.3 regardless.
```

Delete this block completely (including any surrounding blank lines that become double-blank after removal — reduce to a single blank line).

- [ ] **Step 3: Update Step 4.3 handoff print block (human-in-loop mode)**

In Step 4.3, find the print block for `human-in-loop` mode:

```
   ```
   Implementation complete. All changes are unstaged on <branch> — review and commit manually.
   Summary: .loop-logs/<id>/logs/summary.md
   Report: <report_path from Step 4.2b>
   ```

   Include the `Report:` line only if Step 4.2b produced a path; omit it entirely if
   `explain-changes` failed or was unavailable.
```

Replace with:

```markdown
   ```
   Implementation complete. All changes are unstaged on <branch> — review and commit manually.
   Summary: .loop-logs/<id>/logs/summary.md
   ```
```

Remove the "Include the `Report:` line only if..." conditional sentence entirely.

- [ ] **Step 4: Verify changes**

```bash
grep -n "explain-changes\|report_path\|4\.2b\|Report:" skills/autonomous-feature-development/stage-final.md
```

Expected: **no output**.

- [ ] **Step 5: Commit**

```bash
git add skills/autonomous-feature-development/stage-final.md
git commit -m "refactor(skill): remove explain-changes from stage-final

Step 4.2b deleted. Human can invoke the explain-changes skill manually.
Step 4.3 handoff message updated to remove the Report: line."
```

---

### Task 4: Update SKILL.md (prerequisites + stage table)

Two targeted changes: remove the `explain-changes` prerequisite bullet and update the Stage 2+3 table row to reflect the inlined verifier and collapsed fix pipeline.

**Files:**
- Modify: `skills/autonomous-feature-development/SKILL.md`

**Interfaces:**
- Produces: SKILL.md that accurately describes the post-redesign pipeline with no dangling references to deleted files or removed features

- [ ] **Step 1: Confirm pre-conditions**

```bash
grep -n "explain-changes\|stage-verify.md" skills/autonomous-feature-development/SKILL.md
```

Expected: at least 2 matches (explain-changes prerequisite bullet + stage-verify.md in the stage table description).

- [ ] **Step 2: Delete the explain-changes prerequisite bullet**

Find and delete the entire bullet:

```
- **`explain-changes`** (optional) — generates a reviewer-facing HTML report at
  the end of Stage 4 (`stage-final.md` Step 4.2b). If absent, or if it fails,
  skip it and proceed to commit/handoff — report generation never blocks the
  pipeline.
```

- [ ] **Step 3: Update the Stage 2+3 table row**

Find the stage table row:

```
| 2 + 3 | `./stage-review-fix.md` | **Capped verify↔review loop** (≤5 iterations): each iteration runs the VERIFY step in `./stage-verify.md`, then spawns a single multi-skill review agent, writes a code-review log, fixes actionable (blocking+important) issues via a severity-gated pipeline, and re-verifies. Exits when a review raises zero actionable issues. |
```

Replace with:

```markdown
| 2 + 3 | `./stage-review-fix.md` | **Capped verify↔review loop** (≤5 iterations): each iteration runs the VERIFY step (verifier contract defined inline in `./stage-review-fix.md`), spawns a single multi-skill review agent, writes a code-review log, fixes all actionable (blocking+important) issues via a single fix-all agent, and re-verifies. Exits when a review raises zero actionable issues. |
```

- [ ] **Step 4: Verify all references cleaned up across the entire skill directory**

```bash
grep -rn "stage-verify.md" skills/autonomous-feature-development/
```

Expected: **no output**.

```bash
grep -rn "explain-changes" skills/autonomous-feature-development/
```

Expected: **no output**.

- [ ] **Step 5: Verify the seven spec consistency checks**

```bash
# Check 1: Verifier Subagent Contract section exists in stage-review-fix.md
grep -n "## Verifier Subagent Contract" skills/autonomous-feature-development/stage-review-fix.md
# Expected: 1 match

# Check 2: Single reviewer agent description still present (unchanged)
grep -n "one reviewer agent\|single.*reviewer\|spawns one reviewer" skills/autonomous-feature-development/stage-review-fix.md
# Expected: at least 1 match

# Check 3: Model-tier decision step still present (unchanged)
grep -n "git diff --stat" skills/autonomous-feature-development/stage-review-fix.md
# Expected: 1 match

# Check 4: Fix-all agent is the only fix mechanism in Part 2
grep -n "fix-all agent" skills/autonomous-feature-development/stage-review-fix.md
# Expected: multiple matches (new Part 2 content)

# Check 5: stage-verify.md does not exist
[ ! -f skills/autonomous-feature-development/stage-verify.md ] && echo "CHECK 5: PASS" || echo "CHECK 5: FAIL"

# Check 6: stage-final.md has no explain-changes
grep "explain-changes" skills/autonomous-feature-development/stage-final.md
# Expected: no output

# Check 7: log-schema.md and log-sample.md are unmodified (check git status)
git diff --name-only skills/autonomous-feature-development/log-schema.md skills/autonomous-feature-development/log-sample.md
# Expected: no output (no changes)
```

- [ ] **Step 6: Commit**

```bash
git add skills/autonomous-feature-development/SKILL.md
git commit -m "refactor(skill): update SKILL.md for workflow redesign

Remove explain-changes prerequisite. Update stage 2+3 table description
to reference inlined verifier contract and single fix-all agent."
```
