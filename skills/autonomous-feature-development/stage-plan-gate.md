# Stage 1: Plan Detail Gate

Runs first, before Stage 2's guard/setup — a malformed or under-specified
plan is caught before any branch, worktree, or task file exists.

The orchestrator never judges plan quality itself (Hard Rule 6 in
`SKILL.md`). It spawns a single-responsibility subagent for the judgment
call, and another for elaboration/revision when needed. Mode B never reaches
this stage — it has no `plan_path`/`spec_path` and starts directly in
`stage-review-fix.md`.

## Step 1.1 — Validate inputs

From conversation context, identify `plan_path` and `spec_path`. Check each
file in order:

1. Does `plan_path` exist? No → print `ERROR: Plan file not found: <plan_path>` and stop.
2. Is `plan_path` non-empty (size > 0)? No → print `ERROR: Plan file is empty: <plan_path>` and stop.
3. Does `spec_path` exist? No → print `ERROR: Spec file not found: <spec_path>` and stop.
4. Is `spec_path` non-empty (size > 0)? No → print `ERROR: Spec file is empty: <spec_path>` and stop.

## Step 1.2 — Compute run `id`

Derive `id` = `plan_path` filename basename with `.md` stripped (keep the
date prefix). Example: `2026-06-16-ticket-3-ingestion.md` →
`2026-06-16-ticket-3-ingestion`. Every log path in every later stage is
`.loop-logs/<id>/...`. Create `.loop-logs/<id>/` lazily on first write.

(Mode B's `id` is computed separately in `stage-review-fix.md` Part 0 —
`<today>-review-<branch>` — since Mode B never reaches this stage.)

## Step 1.3 — Gate check + task classification

Spawn a **gate-check subagent**. It receives `plan_path`, `spec_path`, and
`skills/autonomous-feature-development/plan-quality-checklist.md`. It:

1. Reads the checklist and applies every box to the plan.
2. Reads `spec_path` for the semantic-coherence checks.
3. Classifies every `### Task N: <name>` heading as `implementation` or
   `non-implementation` (e.g. "write E2E tests for X", "manually verify
   staging" — anything that isn't code-to-implement-and-unit-test).
4. For every `non-implementation` task: cuts its content out of the
   numbered list and appends it under a `## Deferred to Verification`
   section near the end of `plan_path` (creating the section if absent).
   **The subagent edits `plan_path` directly** for this move — the
   orchestrator never edits plan content (Hard Rule 6). This move happens
   whether or not the plan is otherwise detailed enough; classification is
   independent of the quality verdict.
5. Returns:

```json
{
  "verdict": "sufficient" | "insufficient",
  "findings": ["<unchecked box or semantic issue>", ...],
  "moved_tasks": ["<task-id>", ...]
}
```

If `verdict == "sufficient"`: skip Steps 1.4 and 1.5, proceed to Stage 2.

## Step 1.4 — Elaboration (only if `verdict == "insufficient"`)

Spawn an **elaboration subagent**. It receives `plan_path`, `spec_path`,
`findings` from Step 1.3, and `plan-quality-checklist.md`. It rewrites
`plan_path` **in place**, per task: each `### Task N:` section's content is
replaced with a version that satisfies every checklist box — exactly one
heading per task number, no duplicates, no separate file.

**Ambiguous decisions during elaboration** (a design choice the subagent
cannot resolve from the spec alone):

- `interaction_mode == autonomous`: make the best-guess call. Append one
  bullet per guess (with a one-line reason) to
  `<spec-basename>-assumptions.md` — same directory as `spec_path`, created
  with a `# Assumptions — <spec-basename>` header if absent.
- `interaction_mode == human-in-loop`: the subagent returns each ambiguous
  decision in its output instead of guessing (subagents never branch on
  `interaction_mode` — see `SKILL.md`). The **orchestrator** then asks the
  human synchronously in-conversation (e.g. via `AskUserQuestion`) for each
  one, and re-invokes the elaboration subagent with the human's answers
  folded in. No file-based pause — nothing state-bearing exists yet.

Returns:

```json
{
  "status": "elaborated",
  "ambiguous_decisions": ["<question the subagent could not resolve alone>", ...]
}
```

## Step 1.5 — Review the elaborated plan (only if Step 1.4 ran)

A plan that passed Step 1.3 as-is skips this step entirely.

```
round = 0
LOOP:
  round += 1
  Spawn enhanced-review subagent (target: Plan) against plan_path.
  If verdict == "SHIP IT": exit LOOP → proceed to Stage 2.
  If round == 3:
    Write .loop-logs/<id>/error/plan-review-exhausted.md with all 3 rounds'
    review output verbatim.
    git add -A
    git commit -m "wip: plan review exhausted after 3 rounds — see .loop-logs/<id>/error/plan-review-exhausted.md"
    STOP the whole pipeline (uniform — both interaction modes, no juncture).
  Otherwise:
    Spawn the elaboration subagent again with the review's findings; it
    revises plan_path per the findings (same in-place, per-task rule as
    Step 1.4). GOTO LOOP.
```

## Stage 1 Completion Gate

**Mandatory. Do not advance to Stage 2 until it passes.**

Read `plan_path`.

**Check 1 — Quality.** Either Step 1.3 returned `verdict: sufficient`, or
Step 1.5 exited with a `SHIP IT` review verdict.

**Check 2 — Classification.** No task heading remaining under a
`### Task N:` numbered heading is tagged `non-implementation` — every such
task was moved to `## Deferred to Verification` in Step 1.3.

If either check fails, print exactly:

```
STOP — Stage 1 completion gate failed.

<which check failed and why>
```

Do NOT proceed to Stage 2. Investigate which agent or orchestrator step was
skipped.

**If both checks pass:** Print `Plan gate passed — advancing to Stage 2.`
and proceed.
