# Stage 6: E2E Test Writing

Runs after Stage 5's capped verify↔review loop exits with zero actionable
issues. **Mode A only** — Mode B has no `spec_path` and proceeds straight
to `superpowers:finishing-a-development-branch` after its loop exits,
exactly as today; it never reaches this stage.

## Step 6.1 — Gate

Read `<e2e_test_cmd>` (resolved in Stage 2 Step 2.4). If unresolved: this
stage is skipped entirely, in both interaction modes — no scaffolding is
invented for a project with no E2E tooling. Write
`.loop-logs/<id>/tasks/e2e-state.json`:

```json
{ "status": "skipped", "reason": "no E2E tooling detected", "scenario_doc": null, "rounds_completed": 0 }
```

Proceed to Stage 7.

If `<e2e_test_cmd>` resolved, continue to Step 6.2.

## Step 6.2 — Scenario plan

Spawn a **scenario subagent**. It reads `spec_path`'s acceptance criteria,
identifies every browser-observable one, and writes
`<spec-basename>-e2e-test-plan.md` (same directory as `spec_path`) — one
happy-path scenario plus one scenario per browser-observable edge-case AC:

```markdown
# E2E Test Plan — <spec-basename>

**Spec:** <spec_path>

## Scenario 1: <happy path name>
**AC:** <acceptance criterion this covers>
**Steps:** <numbered user-visible steps>
**Expected:** <observable outcome>

## Scenario 2: <edge case name>
**AC:** <acceptance criterion this covers>
**Steps:** <numbered user-visible steps>
**Expected:** <observable outcome>
```

## Step 6.3 — Implement + verify loop (cap 2)

One worktree for the whole stage:

```bash
git worktree add .worktrees/e2e -b worktree/e2e
```

**Implementer subagent:** reads `<spec-basename>-e2e-test-plan.md`, writes
E2E test code for every scenario using the project's already-configured
framework, runs `<e2e_test_cmd>` until it exits 0. Commits.

**Faithfulness verifier subagent:** independently re-runs `<e2e_test_cmd>`
itself — never trusts the implementer's claim — and checks:
- Every scenario in the document has corresponding test code.
- Assertions are real (not a stub like `expect(true).toBe(true)`).
- No scenario was silently dropped.

Returns:

```json
{
  "verdict": "faithful" | "unfaithful",
  "findings": [
    { "scenario": "<Scenario N title>", "scope": "scenario" | "suite", "issue": "<description>" }
  ]
}
```

`scope: "scenario"` means the issue is local to one scenario's test code.
`scope: "suite"` means the root cause affects the overall test plan (e.g.
wrong flow targeted entirely, missing coverage class) and likely touches
multiple scenarios.

```
round = 0
LOOP:
  round += 1
  If round > 2:
    Write .loop-logs/<id>/error/e2e-loop-exhausted.md with both rounds'
    findings verbatim.
    git -C .worktrees/e2e add -A
    git -C .worktrees/e2e commit -m "wip: e2e loop exhausted after 2 rounds"
    STOP the whole pipeline (uniform — both interaction modes, no juncture).
  Run the implementer, then the faithfulness verifier.
  If faithful: exit LOOP → Squash Merge (below).
  Otherwise:
    Spawn an Opus planner subagent (model: Opus). It deep-dives the root
    cause of each finding, then revises <spec-basename>-e2e-test-plan.md:
      - For each finding with scope "scenario": append a
        `#### Revision <round>` subsection under the affected
        `## Scenario N:` block — root cause, what was wrong, the revised
        Steps/Expected.
      - For each finding with scope "suite": append to a
        `## Test Plan Revision History` section (create it, placed after
        the `**Spec:**` line and before the first `## Scenario`, if
        absent) — root cause, what was wrong, the revised approach, and
        which scenarios it affects.
    Hand off to the implementer to redo the affected scenario(s).
    GOTO LOOP.
```

### Squash Merge

Follow `../../rules/git-linear-history.md` — squash merge only.

```bash
git merge --squash worktree/e2e
git commit -m "test(e2e): add end-to-end coverage for <feature>"
git worktree remove .worktrees/e2e --force
git branch -D worktree/e2e
```

Write `.loop-logs/<id>/tasks/e2e-state.json`:

```json
{ "status": "passed", "reason": null, "scenario_doc": "<spec-basename>-e2e-test-plan.md", "rounds_completed": <N> }
```

Proceed to Stage 7.
