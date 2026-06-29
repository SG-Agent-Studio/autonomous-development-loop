# Autonomous Feature Development — Stage 2/3 Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the autonomous-feature-development orchestrator a pure delegator, turn stages 2–3 into a capped verify↔review loop, namespace all logs under a per-run `id`, record every code review, and add a human-only cleanup skill.

**Architecture:** This is a documentation/skill-instruction refactor — no application code. We edit the five markdown stage files under `skills/autonomous-feature-development/` and add one new skill `skills/cleanup-loop-logs/SKILL.md`. The orchestrator (an agent) reads these instructions at runtime, so correctness = the instructions are internally consistent and unambiguous. There is no compiler or unit-test runner for markdown; each task is validated with `grep` invariants (red→green) and a structural read-back.

**Tech Stack:** Markdown skill files (Claude Code / Cursor plugin). Validation via `grep`/`perl` shell one-liners. No build step. `skills/` is shared by both `.claude-plugin` and `.cursor-plugin`; editing it once covers both. New skills are auto-discovered (no manifest registration).

## Global Constraints

- All run log artifacts MUST live under `.loop-logs/<id>/...` (never `.loop-logs/logs/` etc. directly). `<id>` is a literal placeholder the orchestrator substitutes with the computed run id.
- `error/` directory name stays **singular** (matches existing code; the feedback's `errors/` is not used).
- `id` (Mode A) = plan filename basename with `.md` stripped, date prefix kept (e.g. `2026-06-16-ticket-3-ingestion`). `id` (Mode B) = `<today>-review-<current-branch>`.
- "Actionable" = issues with severity **blocking OR important** only. Minor issues never re-trigger the loop and are never fixed in-loop, but MUST be listed in the per-run code-review log and in the final summary, flagged "not handled yet".
- Loop cap = **5** iterations. On exhaustion: write `error/review-loop-exhausted.md`, commit `wip:`, proceed to Stage 4 (graceful, not a hard abort).
- The orchestrator NEVER reads, writes, or executes product code or quality checks (lint/test/verify) or reviews — every such action is delegated to a single-responsibility subagent. The agent that implements a fix is never the agent that reviews it. The orchestrator MAY do git plumbing (squash-merge, worktree add/remove, branch delete, commits) and write `summary.md` + `code-review/round-<N>.md`.
- Commit message footer for every commit in this plan: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `skills/autonomous-feature-development/stage-impl.md` | Stage 0 setup + Stage 1 parallel implementation | Add `id` computation; namespace all `.loop-logs/` paths |
| `skills/autonomous-feature-development/stage-verify.md` | The loop's VERIFY step | Delegate verify to a verifier subagent (structured output); delegate fixes; namespace paths |
| `skills/autonomous-feature-development/stage-review-fix.md` | The capped verify↔review loop + REVIEW + fixes | Near-total rewrite: loop control, code-review logging, re-verify, cap handling, Mode B entry |
| `skills/autonomous-feature-development/stage-final.md` | Stage 4 finalization | Namespace summary path; report loop iterations + deferred minors |
| `skills/autonomous-feature-development/SKILL.md` | Entry point / mode selection / hard rules | Orchestrator-purity rule; loop overview in stage table; `id` note; Mode B inherits loop |
| `skills/cleanup-loop-logs/SKILL.md` | **New.** Human-only cleanup of one run's logs + orphaned worktrees/branches | Create |

**Task order & interfaces:** Task 1 establishes the `id` + `.loop-logs/<id>/` layout that Tasks 2–6 consume. Task 2 produces the verifier subagent output schema `{ "outcome": "pass"|"fail", "failures": [...] }` that Task 3's loop routes on. Task 3 produces the loop structure and `code-review/round-<N>.md` format that Tasks 4–5 reference. Task 5 (SKILL.md) is the overview tying the implemented stages together; Task 6 is independent given Task 1's layout.

---

### Task 1: `stage-impl.md` — run `id` + path namespacing

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md`

**Interfaces:**
- Produces: the `id` definition (Mode A) and the `.loop-logs/<id>/{logs,tasks,error,code-review}/` layout consumed by every later task. Produces the convention "substitute the computed `id` wherever `<id>` appears".

- [ ] **Step 1: Red — confirm un-namespaced paths currently exist**

Run:
```bash
grep -nE '\.loop-logs/(logs|tasks|error|code-review)/' skills/autonomous-feature-development/stage-impl.md
```
Expected: several matches (e.g. `.loop-logs/tasks/<task-id>.json`, `.loop-logs/logs/<task-id>.md`). This is the state we are fixing.

- [ ] **Step 2: Insert the `id`-computation step and renumber following steps**

Edit `stage-impl.md`. Replace the heading line:
```
### Step 0.2 — Branch guard
```
with:
```
### Step 0.2 — Compute run `id`

Derive a single `id` that namespaces every log artifact for this run:

- **Mode A (this stage):** `id` = plan filename basename with `.md` stripped (keep the
  date prefix). Example: `2026-06-16-ticket-3-ingestion.md` → `2026-06-16-ticket-3-ingestion`.
- **Mode B (set in `stage-review-fix.md`):** `id` = `<today>-review-<current-branch>`.

Every log path in every stage is `.loop-logs/<id>/...`. Substitute the computed `id`
wherever `<id>` appears below. Create `.loop-logs/<id>/` lazily on first write.

### Step 0.3 — Branch guard
```

Then replace `### Step 0.3 — Parse tasks` with `### Step 0.4 — Parse tasks`, and replace `### Step 0.4 — Initialize task files` with `### Step 0.5 — Initialize task files`.

- [ ] **Step 3: Namespace all log paths**

Run:
```bash
perl -pi -e 's{\.loop-logs/(logs|tasks|error|code-review)/}{.loop-logs/<id>/$1/}g' \
  skills/autonomous-feature-development/stage-impl.md
```

- [ ] **Step 4: Green — confirm no un-namespaced paths remain and `<id>` paths exist**

Run:
```bash
grep -nE '\.loop-logs/(logs|tasks|error|code-review)/' skills/autonomous-feature-development/stage-impl.md
```
Expected: **no output** (every path now has `<id>/` between `.loop-logs/` and the subdir).

Run:
```bash
grep -c '\.loop-logs/<id>/' skills/autonomous-feature-development/stage-impl.md
```
Expected: a number ≥ 5.

Read the file back and confirm Steps 0.2–0.5 are numbered in order and the `id` step reads correctly.

- [ ] **Step 5: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md
git commit -m "$(printf 'refactor(stage-impl): add run id and namespace logs under .loop-logs/<id>/\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: `stage-verify.md` — delegate verify to a subagent

**Files:**
- Modify: `skills/autonomous-feature-development/stage-verify.md`

**Interfaces:**
- Consumes: `.loop-logs/<id>/` layout (Task 1).
- Produces: the verifier subagent contract `{ "outcome": "pass" | "fail", "failures": ["<root-cause summary>", ...] }` consumed by Task 3's loop. Produces the rule "orchestrator does not verify or fix directly".

- [ ] **Step 1: Red — confirm the orchestrator currently verifies directly**

Run:
```bash
grep -n 'Run the `verifying-implementation` skill' skills/autonomous-feature-development/stage-verify.md
```
Expected: one match on line 3 (the orchestrator running verify itself — what we are removing).

- [ ] **Step 2: Replace the whole file with the delegated version**

Overwrite `skills/autonomous-feature-development/stage-verify.md` with:

````markdown
# Stage 2: Verification (loop VERIFY step)

The orchestrator does NOT verify or fix directly. It spawns subagents and routes on
their structured output.

## Verify (verifier subagent)

Spawn a **verifier subagent** (single responsibility). It:
1. Runs the `verifying-implementation` skill — boots the system and exercises the
   changed endpoints/paths.
2. Matches observed output against the acceptance criteria in `spec_path`.
3. Returns:

```json
{ "outcome": "pass" | "fail", "failures": ["<root-cause summary>", ...] }
```

After each verify (pass or fail), the orchestrator writes
`.loop-logs/<id>/tasks/verification-state.json`:
```json
{ "rounds_completed": <N>, "last_outcome": "pass" | "fail", "notes": "<optional context>" }
```

**If `outcome == "pass"`:** return to the loop — proceed to the REVIEW step in
`./stage-review-fix.md`.

## Fix on failure (≤3 inner rounds)

**If `outcome == "fail"`:**

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

**Spec:** <spec_path>

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
````

- [ ] **Step 3: Green — confirm delegation and namespacing**

Run:
```bash
grep -n 'verifier subagent' skills/autonomous-feature-development/stage-verify.md
grep -nE '\.loop-logs/(logs|tasks|error|code-review)/' skills/autonomous-feature-development/stage-verify.md
grep -n '"outcome": "pass" | "fail"' skills/autonomous-feature-development/stage-verify.md
```
Expected: first grep ≥ 1 match; second grep **no output** (all namespaced); third grep 1 match.

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/stage-verify.md
git commit -m "$(printf 'refactor(stage-verify): delegate verify+fix to subagents, namespace logs\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: `stage-review-fix.md` — capped verify↔review loop

**Files:**
- Modify (near-total rewrite): `skills/autonomous-feature-development/stage-review-fix.md`

**Interfaces:**
- Consumes: `.loop-logs/<id>/` layout (Task 1); verifier contract + VERIFY step (Task 2).
- Produces: the loop structure, the `code-review/round-<N>.md` format, and the `review-loop-exhausted.md` artifact referenced by Tasks 4–5.

- [ ] **Step 1: Red — confirm the review currently runs once and writes no log**

Run:
```bash
grep -nc 'round-<' skills/autonomous-feature-development/stage-review-fix.md
grep -nc 'code-review' skills/autonomous-feature-development/stage-review-fix.md
```
Expected: both `0` (no per-round code-review logging today).

- [ ] **Step 2: Overwrite the file with the loop version**

Overwrite `skills/autonomous-feature-development/stage-review-fix.md` with:

````markdown
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

---

## Part 1: Review (one iteration)

### Spawn fresh reviewers

The orchestrator spawns 3 reviewer subagents **in parallel** (Sonnet[1m] each). Each
reviews independently and returns raw findings:

| Agent | Skill |
|-------|-------|
| Reviewer A | `enhanced-review` |
| Reviewer B | `ponytail:ponytail-review` (skip if `ponytail` plugin not installed) |
| Reviewer C | `simplify` |

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
| ID | Severity | Summary | Evidence (file:line) |
|----|----------|---------|----------------------|
| ... | blocking/important/minor | ... | ... |

## Disposition
- Actionable (blocking + important) — fixed this iteration: <ids, or "none">
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
  fails for the expected reason, write minimal implementation, then `just lint` and
  `just test-unit` both exit 0. Commit `fix(<scope>): <issue description>`.
- **Phase 4 — Review implementation** (enhanced-review agent): review the code change;
  if issues → back to Phase 3; repeat until approved.
- **Phase 5 — Verify**: `just lint` + `just test-unit` one final time; mark resolved.

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

**Spec:** <spec_path>

## Outstanding actionable issues
<consolidated blocking + important from the final round>

## Per-iteration history
| Iteration | Actionable found | Fixed | Deferred minors |
|-----------|------------------|-------|-----------------|
| 1 | ... | ... | ... |
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
````

- [ ] **Step 3: Green — confirm loop, logging, cap, and namespacing**

Run:
```bash
grep -n 'round-<iteration>.md' skills/autonomous-feature-development/stage-review-fix.md
grep -n 'review-loop-exhausted.md' skills/autonomous-feature-development/stage-review-fix.md
grep -n 'blocking OR important' skills/autonomous-feature-development/stage-review-fix.md
grep -n 'iteration == 5' skills/autonomous-feature-development/stage-review-fix.md
grep -nE '\.loop-logs/(logs|tasks|error|code-review)/' skills/autonomous-feature-development/stage-review-fix.md
```
Expected: greps 1–4 each ≥ 1 match; grep 5 **no output** (every `.loop-logs/` path includes `<id>/`).

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/stage-review-fix.md
git commit -m "$(printf 'feat(stage-review-fix): capped verify<->review loop with per-round logging\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: `stage-final.md` — summary namespacing + reporting

**Files:**
- Modify: `skills/autonomous-feature-development/stage-final.md`

**Interfaces:**
- Consumes: `.loop-logs/<id>/` layout (Task 1); loop iteration data + deferred minors (Task 3).

- [ ] **Step 1: Red — confirm un-namespaced paths and thin Review section**

Run:
```bash
grep -nE '\.loop-logs/(logs|tasks|error|code-review)/' skills/autonomous-feature-development/stage-final.md
grep -n 'Loop iterations' skills/autonomous-feature-development/stage-final.md
```
Expected: first grep ≥ 1 match (un-namespaced); second grep no output (reporting not added yet).

- [ ] **Step 2: Namespace all log paths**

Run:
```bash
perl -pi -e 's{\.loop-logs/(logs|tasks|error|code-review)/}{.loop-logs/<id>/$1/}g' \
  skills/autonomous-feature-development/stage-final.md
```

- [ ] **Step 3: Expand the summary's Review section**

Edit `stage-final.md`. Replace:
```
## Review
**Issues found:** N
**Issues fixed:** N
```
with:
```
## Review
**Loop iterations:** <N> of ≤5
**Actionable issues found:** N
**Actionable issues fixed:** N
**Minor issues deferred (NOT handled yet):**
<list each deferred minor from the final review round, or "none">
```

- [ ] **Step 4: Green — confirm namespacing and new reporting**

Run:
```bash
grep -nE '\.loop-logs/(logs|tasks|error|code-review)/' skills/autonomous-feature-development/stage-final.md
grep -n 'Loop iterations' skills/autonomous-feature-development/stage-final.md
grep -n 'NOT handled yet' skills/autonomous-feature-development/stage-final.md
```
Expected: first grep **no output**; second and third each 1 match.

- [ ] **Step 5: Commit**

```bash
git add skills/autonomous-feature-development/stage-final.md
git commit -m "$(printf 'refactor(stage-final): namespace summary path, report loop iterations + deferred minors\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: `SKILL.md` — orchestrator purity, loop overview, Mode B

**Files:**
- Modify: `skills/autonomous-feature-development/SKILL.md`

**Interfaces:**
- Consumes: everything above (this is the overview/entry point).

- [ ] **Step 1: Red — confirm the old single-pass framing**

Run:
```bash
grep -n 'Spawn fresh reviewers, consolidate, fix' skills/autonomous-feature-development/SKILL.md
grep -nc 'orchestrator never' skills/autonomous-feature-development/SKILL.md
```
Expected: first grep 1 match (the old terminal Stage 3 row); second grep `0` (no purity rule yet).

- [ ] **Step 2: Replace the Mode A stage table with the loop version**

Edit `SKILL.md`. Replace:
```
| Stage | File | Description |
|-------|------|-------------|
| 0 + 1 | `./stage-impl.md` | Guard/setup, parallel worktree implementation |
| 2 | `./stage-verify.md` | Boot system, verify against spec acceptance criteria |
| 3 | `./stage-review-fix.md` | Spawn fresh reviewers, consolidate, fix |
| 4 | `./stage-final.md` | Lint, format, summary, final commit |
```
with:
```
| Stage | File | Description |
|-------|------|-------------|
| 0 + 1 | `./stage-impl.md` | Guard/setup, compute run `id`, parallel worktree implementation |
| 2 + 3 | `./stage-review-fix.md` | **Capped verify↔review loop** (≤5 iterations): each iteration runs the VERIFY step in `./stage-verify.md`, then spawns fresh reviewers + consolidator, writes a code-review log, fixes actionable (blocking+important) issues, and re-verifies. Exits when a review raises zero actionable issues. |
| 4 | `./stage-final.md` | Lint, format, summary, final commit |

**Run `id`:** computed once in Stage 0 (`stage-impl.md` Step 0.2); all logs live under
`.loop-logs/<id>/`. Mode B `id` = `<today>-review-<branch>`.
```

- [ ] **Step 3: Make Mode B inherit the loop**

Edit `SKILL.md`. Replace:
```
Issues already exist in conversation context. Read `./stage-review-fix.md` and follow the **Mode B path**: validate issues first, then fix validated ones.
```
with:
```
Issues already exist in conversation context. Read `./stage-review-fix.md`: the orchestrator validates the received issues and fixes them (Part 0), then enters the **same capped verify↔review loop** as Mode A until a review raises zero actionable issues.
```

- [ ] **Step 4: Add the orchestrator-purity hard rule**

Edit `SKILL.md`. Replace:
```
5. Ambiguous? → assume + comment, never stall.
```
with:
```
5. Ambiguous? → assume + comment, never stall.
6. The orchestrator never reads, writes, or executes product code or quality checks (lint/test/verify) or reviews — every such action is delegated to a single-responsibility subagent; the agent that implements a fix never reviews it. The orchestrator may do git plumbing and write `summary.md` + `code-review/round-<N>.md`.
```

- [ ] **Step 5: Green — confirm new framing**

Run:
```bash
grep -n 'Capped verify' skills/autonomous-feature-development/SKILL.md
grep -n 'same capped verify' skills/autonomous-feature-development/SKILL.md
grep -n 'orchestrator never' skills/autonomous-feature-development/SKILL.md
grep -n 'Run `id`:' skills/autonomous-feature-development/SKILL.md
```
Expected: each grep 1 match.

- [ ] **Step 6: Commit**

```bash
git add skills/autonomous-feature-development/SKILL.md
git commit -m "$(printf 'docs(skill): orchestrator-purity rule, verify<->review loop overview, Mode B loop\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: New skill `cleanup-loop-logs`

**Files:**
- Create: `skills/cleanup-loop-logs/SKILL.md`

**Interfaces:**
- Consumes: `.loop-logs/<id>/` layout (Task 1). Independent of Tasks 2–5.

- [ ] **Step 1: Red — confirm the skill does not exist**

Run:
```bash
ls skills/cleanup-loop-logs/SKILL.md 2>/dev/null && echo FOUND || echo MISSING
```
Expected: `MISSING`.

- [ ] **Step 2: Create the skill file**

Create `skills/cleanup-loop-logs/SKILL.md` with:

````markdown
---
name: cleanup-loop-logs
description: Human-triggered cleanup of one autonomous-development run — deletes its `.loop-logs/<id>/` logs and prunes orphaned worktrees/branches. Never invoked by the model.
disable-model-invocation: true
---

# Cleanup Loop Logs

Delete the logs for one autonomous-development run (`.loop-logs/<id>/`) and prune the
worktrees/branches that run left behind. **Human-triggered only** — `disable-model-invocation`
guarantees the orchestrator can never invoke this. Touches logs, worktrees, and
branches only — never product code.

## Step 1 — Select the target run

- If the user passed an `id`, use it.
- If the user passed a plan path, derive `id` = basename with `.md` stripped.
- If nothing was passed, list every run (newest first) and ask which to clean, or `all`:

```bash
for d in $(ls -1dt .loop-logs/*/ 2>/dev/null); do
  printf '%s\t%s\n' "$(du -sh "$d" | cut -f1)" "$d"
done
```

Present the list and wait for the user to pick an `id` (or `all`).

## Step 2 — Gather what will be deleted, then confirm

For the chosen `id` (repeat for each if `all`):

```bash
ID=<id>
echo "== Logs =="; ls -R ".loop-logs/$ID/" 2>/dev/null

# Task ids belonging to this run (drives precise worktree/branch attribution)
TASK_IDS=$(ls ".loop-logs/$ID/tasks/" 2>/dev/null | sed 's/\.json$//' | grep -v '^verification-state$')

echo "== Worktrees for this run =="
for t in $TASK_IDS; do
  git worktree list | grep -E "/.worktrees/($t|fix-)" || true
done
echo "== Branches for this run =="
for t in $TASK_IDS; do
  git branch --list "worktree/$t" "worktree/fix-*" | tr -d ' *' || true
done
```

Print the exact log tree, worktrees, and branches. Ask the user to confirm. Deletion
is irreversible — do NOT proceed without an explicit "yes". `worktree/fix-*` entries
cannot be attributed to a single run by name; list them and let the user confirm which
to prune.

## Step 3 — Prune orphaned worktrees and branches

After confirmation, for each worktree/branch the user approved:

```bash
git worktree remove "<.worktrees/path>" --force
git worktree prune
git branch -D "<branch-name>"
```

## Step 4 — Delete the logs (last, so task ids stayed available in Step 2/3)

```bash
rm -rf ".loop-logs/$ID/"
```

Report exactly what was deleted (logs path, worktrees, branches).
````

- [ ] **Step 3: Green — confirm frontmatter and structure**

Run:
```bash
grep -n 'disable-model-invocation: true' skills/cleanup-loop-logs/SKILL.md
grep -nc '^## Step' skills/cleanup-loop-logs/SKILL.md
grep -n 'rm -rf ".loop-logs/$ID/"' skills/cleanup-loop-logs/SKILL.md
```
Expected: first grep 1 match; second grep `4`; third grep 1 match.

- [ ] **Step 4: Commit**

```bash
git add skills/cleanup-loop-logs/SKILL.md
git commit -m "$(printf 'feat(cleanup-loop-logs): human-only skill to purge a run and prune worktrees\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Final Verification (after all tasks)

- [ ] **No un-namespaced log paths remain anywhere in the skill**

Run:
```bash
grep -rnE '\.loop-logs/(logs|tasks|error|code-review)/' skills/ || echo "CLEAN"
```
Expected: `CLEAN` (the only `.loop-logs/...` references are `.loop-logs/<id>/...`, plus the cleanup skill's `.loop-logs/*/` listing glob and `.loop-logs/$ID/`).

- [ ] **The five edited stage files + new skill all committed**

Run:
```bash
git log --oneline -6
git status --short
```
Expected: six new commits (Tasks 1–6); clean working tree.
