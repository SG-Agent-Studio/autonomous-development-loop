# Loop-Logs Harness Fix — Implementation Plan

**Goal:** Harden `autonomous-feature-development` skill so that per-task bookkeeping
(task JSON updates, attempt log files, `verification-state.json`) is enforced by the
orchestrator layer and caught by an integrity gate before the pipeline advances.

**Spec:** `docs/superpowers/specs/2026-06-20-loop-logs-harness-fix-design.md`

**Skill files path:**
`/Users/jasonlee/.claude/plugins/cache/autonomous-development/autonomous-development-plugin/0.1.0/skills/autonomous-feature-development/`

---

## Global Constraints

- Edit only `stage-impl.md` and `stage-verify.md`. No other skill files change.
- Do not remove or reword any existing protocol step (TDD loop, squash merge, hard-stop,
  error file format). Only add and clarify.
- Do not change the task JSON schema shape — fields remain identical.
- Commit using conventional commits: `docs(skill): <description>`
- No `just lint` / `just test-unit` applies here (these are markdown files, not code). The
  verification step is a manual read-back against the spec's acceptance criteria.

---

## File Map

| Status | Path              | Responsibility                                       |
| ------ | ----------------- | ---------------------------------------------------- |
| Modify | `stage-impl.md`   | Add schema + orchestrator ownership + integrity gate |
| Modify | `stage-verify.md` | Unconditional verification-state.json write          |

---

### Task 1: Add schema definition and orchestrator ownership to stage-impl.md

**File:** `stage-impl.md`

**Where to insert:** Between the "Stage 0" section (ends after the "Print after all files
written" block) and the "## Stage 1: Parallel Implementation" heading.

Insert the following new section verbatim:

---

````markdown
---

## Orchestrator: Agent Output Schema and File Ownership

**The orchestrator owns all `.loop-logs/` file writes. Agents own implementation and
return content. This separation is the key to reliable bookkeeping.**

### Task state lifecycle (orchestrator responsibility)

Before calling each per-task agent, the orchestrator writes:

```json
{ "status": "in_progress", "worktree": ".worktrees/<task-id>" }
```
````

into `.loop-logs/tasks/<task-id>.json` (merging with the existing fields from Stage 0).

After the agent returns, the orchestrator writes the final state from the agent's
structured output (see schema below).

The agent MUST NOT write to `.loop-logs/tasks/<task-id>.json` or
`.loop-logs/logs/<task-id>.md` itself. Those are orchestrator-only files.

### Required agent response schema

When implementing Stage 1 via the Workflow tool, use the `schema` option on each
`agent()` call. The agent must return:

```json
{
  "status": "completed" | "failed",
  "attempt_count": 1,
  "attempt_logs": [
    {
      "attempt": 1,
      "plan": "3-5 bullet points describing the approach",
      "lint_output": "full lint stdout/stderr, or PASS",
      "test_output": "full test stdout/stderr, or PASS",
      "outcome": "success | failed — <one-line root cause> | HARD STOP after 3 attempts"
    }
  ]
}
```

`attempt_logs` has one entry per TDD attempt. On hard stop (3 failures), `attempt_logs`
has 3 entries and `status` is `"failed"`.

### Orchestrator writes log file from schema output

After each agent returns, the orchestrator writes `.loop-logs/logs/<task-id>.md` by
formatting the `attempt_logs` array:

```markdown
# <task-id>

## Attempt <N> — <timestamp>

### Implementation plan

<plan from attempt_logs[N].plan>

### Lint output

<lint_output>

### Test output

<test_output>

### Outcome: <outcome>
```

Repeat one `## Attempt N` block per entry in `attempt_logs`.

### Orchestrator writes task JSON from schema output

After each agent returns, merge into `.loop-logs/tasks/<task-id>.json`:

```json
{
  "status": "<from schema output>",
  "attempt": <attempt_count from schema>,
  "completed_steps": ["tdd-loop-complete"]
}
```

If `status` is `"failed"`, omit `"tdd-loop-complete"` from `completed_steps`.

---

> **If not using the Workflow tool:** The agent prompt MUST include steps A–D from the
> "Per-Task Agent Instructions" section below verbatim. The plan's implementation content
> is additional context, not a replacement for those steps. In this mode the agent writes
> the files directly as specified in steps B and D.

````

---

**Where to insert (integrity gate):** After the final line of the "Squash Merge" section
(which ends with the `git log --oneline` note: "No merge commits should appear. If any do,
the wrong merge strategy was used."), append the following new section:

---

```markdown
---

## Stage 1 Integrity Gate

**This check is mandatory. Do not advance to Stage 2 until it passes.**

Read every `.loop-logs/tasks/<task-id>.json` for all tasks parsed in Stage 0.

**Check 1 — Status**
Every task file must have `"status": "completed"` or `"status": "failed"`.
Any file still showing `"status": "pending"` or `"status": "in_progress"` means the
orchestrator or agent did not complete its bookkeeping.

**Check 2 — Log files**
Every task with `"status": "completed"` must have a corresponding file at
`.loop-logs/logs/<task-id>.md`.

**If either check fails:**
````

STOP — Stage 1 integrity check failed.

Missing or stale bookkeeping detected:
<task-id>: status="pending" (expected: completed | failed)
<task-id>: missing .loop-logs/logs/<task-id>.md

Do NOT proceed to Stage 2. Investigate which agent or orchestrator step was skipped.
If using schema-enforced output, verify the orchestrator wrote the files after agent() returned.
If agents wrote files directly, check the agent prompt included steps A–D verbatim.

```

**If all checks pass:** Print `Integrity gate passed — advancing to Stage 2.` and proceed.
```

---

**Verification (before committing):**

Read back the modified `stage-impl.md` and confirm:

- [ ] New "Orchestrator: Agent Output Schema and File Ownership" section exists between
      Stage 0 and Stage 1.
- [ ] Schema JSON shows `status`, `attempt_count`, `attempt_logs` array with `attempt`,
      `plan`, `lint_output`, `test_output`, `outcome` fields.
- [ ] Orchestrator lifecycle clearly states: write `in_progress` before agent(), write
      final state after.
- [ ] "Agents MUST NOT write" statement is present and unambiguous.
- [ ] Fallback note for non-Workflow usage (include steps A–D verbatim) is present.
- [ ] "Stage 1 Integrity Gate" section exists after the squash merge section.
- [ ] Gate explicitly says `STOP` and lists which task IDs failed.
- [ ] Gate says "Do NOT proceed to Stage 2" — not advisory, mandatory.
- [ ] Original per-task Agent Steps A–D and squash merge instructions are unchanged.

**Commit:**

```bash
git add stage-impl.md
git commit -m "docs(skill): add schema ownership and integrity gate to stage-impl"
```

---

### Task 2: Fix stage-verify.md to write verification-state.json unconditionally

**File:** `stage-verify.md`

**Current state:**

- `verification-state.json` is only written inside the "If verification fails" branch
  (step 4).
- On first-pass success, the file is never written.

**Required change:**

Replace the current file structure:

```
**If verification passes:** Read `./stage-review-fix.md` and proceed to Stage 3.

---

**If verification fails:**
1. Analyze root cause...
2. Spawn a fix worktree agent...
3. Squash-merge the fix...
4. Update `.loop-logs/tasks/verification-state.json`:
   { "rounds_completed": <N>, "last_outcome": "pass" | "fail" }
5. Re-run verification. Repeat up to 3 rounds total.
```

With this structure:

````
**After each verification run (pass or fail), write:**
`.loop-logs/tasks/verification-state.json`:
```json
{ "rounds_completed": <N>, "last_outcome": "pass" | "fail", "notes": "<optional context>" }
````

Where `<N>` is 1 on first run, incrementing on each re-run.

**If verification passes:** Read `./stage-review-fix.md` and proceed to Stage 3.

---

**If verification fails:**

1. Analyze root cause from verification output.
2. Spawn a fix worktree agent using the same TDD mini-loop from `stage-impl.md`
   (single task, targeting the root cause).
3. Squash-merge the fix:
   ...
4. Re-run verification. Repeat up to **3 rounds total**.
   (Write `verification-state.json` after each round — see above.)

````

**Key change:** The `verification-state.json` write moves from step 4 (inside the failure
branch) to a top-level step that runs unconditionally after every verification run.

**Verification (before committing):**

Read back the modified `stage-verify.md` and confirm:

- [ ] `verification-state.json` write appears before the "If verification passes" line.
- [ ] The write instruction says "pass or fail" — not conditional.
- [ ] The failure path still contains a reminder `(see above)` rather than a duplicate
      write instruction.
- [ ] The JSON format still includes `rounds_completed`, `last_outcome`, and `notes`.
- [ ] The rest of stage-verify.md (fix worktree, squash-merge, max 3 rounds, hard-stop
      error file format) is unchanged.

**Commit:**
```bash
git add stage-verify.md
git commit -m "docs(skill): write verification-state.json unconditionally after each round"
````

---

## End-to-End Verification

After both tasks are committed, verify the fix by reading the spec's acceptance criteria:

| AC                           | Where to check                     | Expected                                                  |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------- |
| AC-1: Schema definition      | stage-impl.md                      | `attempt_logs` array with 5 sub-fields present            |
| AC-2: Orchestrator ownership | stage-impl.md                      | "in_progress before agent()", "final state after agent()" |
| AC-3: Integrity gate         | stage-impl.md (after squash merge) | `STOP` + lists failing tasks + "Do NOT proceed"           |
| AC-4: Unconditional write    | stage-verify.md                    | Write block before "If verification passes" line          |
| AC-5: Protocol unchanged     | stage-impl.md Steps A–D            | TDD loop, squash merge, hard-stop unchanged               |
| AC-6: Role separation        | stage-impl.md                      | "Orchestrator owns X / Agent owns Y" explicit             |

All 6 AC must be checkable by reading the modified files directly.
