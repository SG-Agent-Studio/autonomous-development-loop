# Stage 2 + 3: Guard, Setup & Implementation

`plan_path` and `spec_path` have already passed Stage 1 (`stage-plan-gate.md`)
by the time this file runs — `id` was already computed there (Step 1.2); it
is not recomputed here.

## Stage 2: Guard & Setup

### Step 2.1 — Branch guard

Run: `git rev-parse --abbrev-ref HEAD`

- If on `main`: derive branch name from plan filename (basename only):
  - Strip leading `YYYY-MM-DD-` prefix if present
  - Strip `.md` suffix
  - Prepend `feature/`
  - Example: `2026-06-16-ticket-3-ingestion.md` → `feature/ticket-3-ingestion`
  - Run: `git checkout -b <branch-name>`
- Otherwise: continue on current branch.

Record `base_sha` = output of `git rev-parse HEAD` — the branch tip before any task
work. Used by the human-in-loop commit handoff (`stage-final.md` Step 7.3) and
the `explain-changes` reviewer-report invocation (`stage-final.md` Step 7.2b).

### Step 2.2 — Parse tasks

By this point Stage 1 has already moved every `non-implementation` task into
`## Deferred to Verification` — every remaining `### Task N:` heading is
implementation work.

Read `plan_path`. Extract every heading matching `### Task N: <name>` (N = a number). For each match:

- Derive `task_id`: `task-<N>-<kebab-case-name>`
  - Example: `### Task 3: Tavily Service` → `task-3-tavily-service`
- Record line range (from this heading to next `### Task` heading or end of file)

### Step 2.3 — Initialize task files

For each parsed task, write `.loop-logs/<id>/tasks/<task-id>.json`:

```json
{
  "task_id": "<task_id>",
  "plan": "<plan_path>",
  "spec": "<spec_path>",
  "status": "pending",
  "attempt": 0,
  "worktree": null,
  "completed_steps": []
}
```

**Resume guard:** If `.loop-logs/<id>/tasks/<task-id>.json` already exists with `"status": "completed"`, skip that task entirely — do not overwrite, do not spawn agent for it.

Print after all files written:

```
Setup complete. Found <N> tasks:
  - <task-id-1>
  - <task-id-2>
  ...
Working branch: <current-branch>
```

### Step 2.4 — Resolve project commands

The pipeline needs five commands. Resolve each **once** here; never hardcode a tool.

| Variable         | Purpose          | Required                        |
| ---------------- | ---------------- | ------------------------------- |
| `<lint_cmd>`     | lint             | yes                             |
| `<test_cmd>`     | unit tests       | yes                             |
| `<format_cmd>`   | format           | no (skip step if unresolved)    |
| `<start_cmd>`    | boot the system  | no (only for Tier-3/UI verify)  |
| `<e2e_test_cmd>` | E2E tests        | no (skip Stage 6 if unresolved) |

Resolve `<lint_cmd>`/`<test_cmd>`/`<format_cmd>`/`<start_cmd>` in precedence order:

1. A `## Commands` section in `CLAUDE.md` or `AGENTS.md`:

   ```markdown
   ## Commands
   - Lint: `<cmd>`
   - Test: `<cmd>`
   - Format: `<cmd>`
   - Start: `<cmd>`
   - E2E: `<cmd>`
   ```

2. Project config — `justfile`, `package.json` scripts, `Makefile`,
   `pyproject.toml`/uv, etc. (e.g. `package.json` `"scripts": { "lint": ... }` → `pnpm lint`).

Resolve `<e2e_test_cmd>` with one extra tier, since E2E tooling is easy to
have configured without a named script:

1. An `E2E:` line in `## Commands` (above).
2. Script-based project config — `package.json` scripts (`test:e2e`, `e2e`),
   `justfile`/`Makefile` targets of the same name.
3. Direct framework-config detection — scan the repo root (and one level of
   common subdirectories) for `playwright.config.{js,ts,mjs}`,
   `cypress.config.{js,ts}`, or a `cypress/`/`e2e/`/`tests/e2e/` directory.
   If found with no explicit script, infer the standard command for that
   framework: `npx playwright test` (Playwright) or `npx cypress run`
   (Cypress).

If none of the three resolve, `<e2e_test_cmd>` stays unresolved — this is
**not** an error. Stage 6 (`stage-e2e.md`) checks for this and skips itself
entirely when unresolved, in both interaction modes.

If a **required** command (`lint`, `test`) is still unresolved:

- `interaction_mode == autonomous`: **hard-stop**. Print
  `ERROR: unresolved required command(s): <names>. Add a "## Commands" section to CLAUDE.md/AGENTS.md.` and stop.
- `interaction_mode == human-in-loop`: ask the user for each unresolved command,
  write the answers into a `## Commands` section in `CLAUDE.md` (create it if
  absent), then continue.

Inject the resolved commands into **every subagent prompt** (alongside `LOG_PATH`),
so agents never re-discover. Do **not** write config-discovered commands back to
memory — only asked answers are persisted.

### Step 2.5 — Probe verification capability (Mode A)

Run the Playwright CLI preflight probe
(`skills/verifying-implementation/playwright-cli-procedure.md` § One-time cache setup)
→ `playwright_available` (y/n). Scan `spec_path` acceptance criteria for
browser-observable behavior (rendered pages, UI state, client-side interaction).

- A UI AC is present AND `playwright_available == n`:
  - `interaction_mode == autonomous`: **hard-stop**. Print
    `ERROR: UI acceptance criteria require the Playwright CLI, which is unavailable.` and stop.
  - `interaction_mode == human-in-loop`: print a heads-up that UI verification will
    be handed to the human via a checklist, and continue.

Record `playwright_available` and inject it into the verifier subagent prompt. It is
the verifier's **only** capability input — never inject `interaction_mode` into any
subagent. The verifier reports blocked criteria as facts; the orchestrator alone
translates them into mode policy (see `stage-verify.md`). Mode B has no `spec_path` —
skip the AC-scan; the verify-time per-AC backstop still applies.

---

## Orchestrator: Agent Output Schema and File Ownership

File writes are split by owner:

| File                                            | Owner                                                         | When written                                                             |
| ----------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `.loop-logs/<id>/tasks/<task-id>.json`          | Orchestrator                                                  | Before spawn (`in_progress`), after agent returns (`completed`/`failed`) |
| `.loop-logs/<id>/logs/<task-id>.md`             | Agent (written directly, both Workflow and non-Workflow mode) | Incrementally — appended after each TDD attempt                          |
| `.loop-logs/<id>/error/<task-id>.md`            | Agent (written directly, both Workflow and non-Workflow mode) | On hard stop (3 failures exhausted)                                      |
| `.loop-logs/<id>/logs/summary.md`               | Orchestrator (Stage 7 only)                                   | Stage 7 only                                                             |
| `.loop-logs/<id>/tasks/verification-state.json` | Orchestrator                                                  | After every verification round (Stage 4) — pass, fail, or `awaiting_human` |
| `.loop-logs/<id>/verifications/verification-<round>.md` | Orchestrator (written), **human (edits `Result:` lines)** | On human handoff (Stage 4, `human-in-loop` only)                    |

### Task state lifecycle (orchestrator responsibility)

Before calling each per-task agent, the orchestrator:

1. Writes `{ "status": "in_progress", "worktree": ".worktrees/<task-id>" }` into `.loop-logs/<id>/tasks/<task-id>.json` (merging with the existing fields from Stage 2).
2. Computes the absolute repo root path (e.g. via `git rev-parse --show-toplevel`) and injects two paths into the agent's prompt:
   - `LOG_PATH`: `<absolute-repo-root>/.loop-logs/<id>/logs/<task-id>.md`
   - `ERROR_LOG_PATH`: `<absolute-repo-root>/.loop-logs/<id>/error/<task-id>.md`

After the agent returns, the orchestrator writes the final task state from the agent's structured output (see schema below).

### Required agent response schema

When implementing Stage 3 via the Workflow tool, use the `schema` option on each
`agent()` call. The agent must return:

```json
{
  "status": "completed" | "failed",
  "attempt_count": 2
}
```

`attempt_count` ranges 1–3 (1 on first-pass success, 3 on hard stop). Rich attempt detail (implementation plan, lint output, test output, outcomes) is written directly to `LOG_PATH` by the agent — it does not travel through the schema.

### Orchestrator writes task JSON from schema output

After each agent returns, merge into `.loop-logs/<id>/tasks/<task-id>.json`:

```json
{
  "status": "<from schema output>",
  "attempt": <attempt_count from schema>,
  "completed_steps": ["tdd-loop-complete"]
}
```

If `status` is `"failed"`, omit `"tdd-loop-complete"` from `completed_steps`.

---

**Both Workflow and non-Workflow mode:** The agent prompt MUST include steps A–D from
the "Per-Task Instructions" section below. Agents write `LOG_PATH` and
`ERROR_LOG_PATH` directly in both modes — the orchestrator never writes those files.

---

## Stage 3: Implementation

**Single implementer subagent, one worktree for the whole stage** — not one
worktree per task, not parallel agents. It works through every remaining
`### Task N:` task **sequentially**, in task-number order.

```bash
git worktree add .worktrees/impl -b worktree/impl
```

Switch working directory to `.worktrees/impl` for ALL remaining steps in this
agent's run. All bash commands, file reads, and git operations MUST run from
within `.worktrees/impl`.

The orchestrator injects, once, before spawning:

- `LOG_PATH` — absolute path to `.loop-logs/<id>/logs/impl.md` in the main repo root
- `ERROR_LOG_PATH` — absolute path to `.loop-logs/<id>/error/impl.md` in the main repo root

Use these paths for all log writes below. Never use relative paths for log
files — the working directory is the worktree, not the repo root.

For each task, before starting it: update
`.loop-logs/<id>/tasks/<task-id>.json` — `"status": "in_progress"`,
`"worktree": ".worktrees/impl"`.

---

### Per-Task Instructions (repeated sequentially by the single implementer)

#### Agent Step A — Read task file

Read `.loop-logs/<id>/tasks/<task-id>.json`. Extract `plan`, `spec`, `attempt`, `task_id`.

#### Agent Step C — Read task content and write Task Header

From `plan_path`, read the full section for this task (from `### Task N: <name>` to next `### Task` heading or end of file). Also read full `spec_path` for architectural context.

Read both log reference documents:
- `skills/autonomous-feature-development/log-schema.md`
- `skills/autonomous-feature-development/log-sample.md`

Write the **Task Header** (Tier 1 from `log-schema.md`) to `LOG_PATH` now, before any attempt begins:
- Copy the full plan section verbatim
- Extract and list ACs (omit `### Acceptance Criteria` section if none are listed)

#### Agent Step D — TDD loop (max 3 attempts)

**Per-attempt logging:** Follow `log-schema.md` Tier 2 for the Per-Attempt Block. Append it to `LOG_PATH` after each attempt completes.

**Implement:**

1. Write the failing test first. Run it and confirm it fails with the expected reason.
2. Write the minimal implementation to make it pass.
3. Run verifiable signals in order (`<lint_cmd>`/`<test_cmd>` = the commands injected by the orchestrator in Step 2.4):
   - `<lint_cmd>` — must exit 0
   - `<test_cmd>` — must exit 0

**On pass (both green):**

Update task JSON: `"status": "completed"`, `"attempt": <N>`, append `"tdd-loop-complete"` to `completed_steps`.

Commit in worktree:

```bash
git add -A
git commit -m "feat(<scope>): <task description>"
```

Stop loop.

**On fail:**

Increment `attempt` in task JSON.

- If `attempt < 3`: return to start of TDD loop (new attempt)
- If `attempt == 3`: proceed to Hard Stop

**Hard Stop (3 attempts exhausted):**

Write `ERROR_LOG_PATH`:

```markdown
# Failed: <task-id>

**Task:** <task description from plan>
**Plan:** <plan_path>
**Spec:** <spec_path>
**Attempts:** 3

## Attempt 1

<full lint + test output from log>
<output of: git diff>

## Attempt 2

<full lint + test output from log>
<output of: git diff>

## Attempt 3

<full lint + test output from log>
<output of: git diff>

## Reproduction

cd <worktree path>
<lint_cmd>
<test_cmd>
```

Update task JSON: `"status": "failed"`.

Commit:

```bash
git add -A
git commit -m "wip: failed <task-id> after 3 attempts"
```

Stop.

---

### Squash Merge (after the implementer finishes all tasks, and Stage 3's faithfulness check passes)

Follow `../../rules/git-linear-history.md` — squash merge only, never plain
`git merge`.

If any task ended `"status": "failed"` (3-attempt TDD exhaustion — see Agent
Step D below), do NOT merge that task's work; the implementer's hard-stop
already ends the whole worktree run (see Agent Step D). Otherwise, once
every task is `"status": "completed"` and Step 3.2's faithfulness verifier
returns `faithful`:

```bash
git merge --squash worktree/impl
git commit -m "feat(<scope>): <summary of all completed tasks>"
git worktree remove .worktrees/impl --force
git branch -D worktree/impl
```

### Final worktree sweep (mandatory — both interaction modes, after squash-merge)

Remove the implementer's worktree:

```bash
git worktree remove --force .worktrees/impl 2>/dev/null || true
git worktree prune
git branch -D worktree/impl 2>/dev/null || true
rmdir .worktrees 2>/dev/null || true
```

**Gate:** `git worktree list` shows no path under `.worktrees/`. If it
remains, STOP and print which worktree could not be removed.

Verify the history is linear:

```bash
git log --oneline
```

No merge commits should appear. If any do, the wrong merge strategy was used.

---

## Stage 3 Task-Completion Gate

**This check is mandatory. Do not advance to Step 3.2 (faithfulness
verification) until it passes.**

Read every `.loop-logs/<id>/tasks/<task-id>.json` for all implementation
tasks parsed in Stage 2 Step 2.2.

**Check 1 — Status**
Every task file must have `"status": "completed"` or `"status": "failed"`.
Any file still showing `"status": "pending"` or `"status": "in_progress"`
means the implementer did not complete its bookkeeping.

**Check 2 — Log files**
Every task with `"status": "completed"` must have a corresponding file at
`.loop-logs/<id>/logs/impl.md` covering that task's attempts.

**If either check fails**, print exactly:

```
STOP — Stage 3 task-completion check failed.

Missing or stale bookkeeping detected:
<task-id>: status="pending" (expected: completed | failed)
```

Do NOT proceed. Verify the implementer's prompt included Steps A–D verbatim.

**If all checks pass:** proceed to Step 3.2 (Faithfulness Verification).

---

## Step 3.2 — Faithfulness Verification

After the Stage 3 Task-Completion Gate passes, before Stage 3 is considered
complete, spawn a **faithfulness verifier** subagent — separate from, and
narrower than, Stage 4's spec-acceptance-criteria verifier. It reviews the
cumulative worktree diff (`.worktrees/impl`, uncommitted squash not yet
done) against `plan_path`:

- Was each task implemented as described — not partially, not differently?
- Are the tests real assertions of behavior, not gutted, deleted, or
  trivial?
- Is there scope creep — changes beyond what the tasks specify?

Returns:

```json
{
  "verdict": "faithful" | "unfaithful",
  "findings": [
    { "task_id": "<task-id>", "scope": "task" | "architecture", "issue": "<description>" }
  ]
}
```

`scope: "task"` means the issue is local to one task's implementation
approach. `scope: "architecture"` means the root cause affects the plan's
design and likely touches multiple tasks.

If `verdict == "faithful"`: proceed to Squash Merge (above).

## Step 3.3 — Faithfulness Fix Loop (cap 2)

```
round = 0
LOOP:
  round += 1
  If round > 2:
    Write .loop-logs/<id>/error/faithfulness-loop-exhausted.md with both
    rounds' findings verbatim, plus the current worktree diff.
    git -C .worktrees/impl add -A
    git -C .worktrees/impl commit -m "wip: faithfulness loop exhausted after 2 rounds"
    STOP the whole pipeline (uniform — both interaction modes, no juncture).
  Spawn an Opus planner subagent (model: Opus). It receives the faithfulness
  verifier's findings and plan_path. It:
    1. Deep-dives the root cause of each finding (why did the implementer
       produce this — ambiguous task wording? missing constraint? an
       interface mismatch between tasks?).
    2. Revises plan_path:
       - For each finding with scope "task": append a `#### Revision <round>`
         subsection inside the affected `### Task N:` block — root cause,
         what was wrong, the revised Files/Interfaces/Steps.
       - For each finding with scope "architecture": append to a
         `## Plan Revision History` section (create it, placed after
         `## Global Constraints` and before the first `### Task`, if
         absent) — root cause, what was wrong, the revised approach, and
         which tasks it affects.
  Re-invoke the implementer (same worktree, .worktrees/impl) to redo the
  affected task(s) per the revised plan (Agent Steps A–D from Stage 3,
  scoped to just those task_ids).
  Re-run the Stage 3 Task-Completion Gate, then the faithfulness verifier.
  If faithful: exit LOOP → proceed to Squash Merge.
  Otherwise: GOTO LOOP.
```
