# Stage 0 + 1: Guard, Setup & Parallel Implementation

## Stage 0: Guard & Setup

### Step 0.1 — Validate inputs

From conversation context, identify `plan_path` and `spec_path`. Check each file in order:

1. Does `plan_path` exist? No → print `ERROR: Plan file not found: <plan_path>` and stop.
2. Is `plan_path` non-empty (size > 0)? No → print `ERROR: Plan file is empty: <plan_path>` and stop.
3. Does `spec_path` exist? No → print `ERROR: Spec file not found: <spec_path>` and stop.
4. Is `spec_path` non-empty (size > 0)? No → print `ERROR: Spec file is empty: <spec_path>` and stop.

### Step 0.2 — Compute run `id`

Derive a single `id` that namespaces every log artifact for this run:

- **Mode A (this stage):** `id` = plan filename basename with `.md` stripped (keep the
  date prefix). Example: `2026-06-16-ticket-3-ingestion.md` → `2026-06-16-ticket-3-ingestion`.
- **Mode B (set in `stage-review-fix.md`):** `id` = `<today>-review-<current-branch>`.

Every log path in every stage is `.loop-logs/<id>/...`. Substitute the computed `id`
wherever `<id>` appears below. Create `.loop-logs/<id>/` lazily on first write.

### Step 0.3 — Branch guard

Run: `git rev-parse --abbrev-ref HEAD`

- If on `main`: derive branch name from plan filename (basename only):
  - Strip leading `YYYY-MM-DD-` prefix if present
  - Strip `.md` suffix
  - Prepend `feature/`
  - Example: `2026-06-16-ticket-3-ingestion.md` → `feature/ticket-3-ingestion`
  - Run: `git checkout -b <branch-name>`
- Otherwise: continue on current branch.

### Step 0.4 — Parse tasks

Read `plan_path`. Extract every heading matching `### Task N: <name>` (N = a number). For each match:

- Derive `task_id`: `task-<N>-<kebab-case-name>`
  - Example: `### Task 3: Tavily Service` → `task-3-tavily-service`
- Record line range (from this heading to next `### Task` heading or end of file)

### Step 0.5 — Initialize task files

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

### Step 0.6 — Resolve project commands

The pipeline needs four commands. Resolve each **once** here; never hardcode a tool.

| Variable       | Purpose         | Required                        |
| -------------- | --------------- | ------------------------------- |
| `<lint_cmd>`   | lint            | yes                             |
| `<test_cmd>`   | unit tests      | yes                             |
| `<format_cmd>` | format          | no (skip step if unresolved)    |
| `<start_cmd>`  | boot the system | no (only for Tier-3/UI verify)  |

Resolve in precedence order:

1. A `## Commands` section in `CLAUDE.md` or `AGENTS.md`:

   ```markdown
   ## Commands
   - Lint: `<cmd>`
   - Test: `<cmd>`
   - Format: `<cmd>`
   - Start: `<cmd>`
   ```

2. Project config — `justfile`, `package.json` scripts, `Makefile`,
   `pyproject.toml`/uv, etc. (e.g. `package.json` `"scripts": { "lint": ... }` → `pnpm lint`).

If a **required** command (`lint`, `test`) is still unresolved:

- `interaction_mode == autonomous`: **hard-stop**. Print
  `ERROR: unresolved required command(s): <names>. Add a "## Commands" section to CLAUDE.md/AGENTS.md.` and stop.
- `interaction_mode == human-in-loop`: ask the user for each unresolved command,
  write the answers into a `## Commands` section in `CLAUDE.md` (create it if
  absent), then continue.

Inject the resolved commands into **every subagent prompt** (alongside `LOG_PATH`),
so agents never re-discover. Do **not** write config-discovered commands back to
memory — only asked answers are persisted.

---

## Orchestrator: Agent Output Schema and File Ownership

File writes are split by owner:

| File                                            | Owner                                                         | When written                                                             |
| ----------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `.loop-logs/<id>/tasks/<task-id>.json`          | Orchestrator                                                  | Before spawn (`in_progress`), after agent returns (`completed`/`failed`) |
| `.loop-logs/<id>/logs/<task-id>.md`             | Agent (written directly, both Workflow and non-Workflow mode) | Incrementally — appended after each TDD attempt                          |
| `.loop-logs/<id>/error/<task-id>.md`            | Agent (written directly, both Workflow and non-Workflow mode) | On hard stop (3 failures exhausted)                                      |
| `.loop-logs/<id>/logs/summary.md`               | Orchestrator (Stage 4 only)                                   | Stage 4 only                                                             |
| `.loop-logs/<id>/tasks/verification-state.json` | Orchestrator                                                  | After each verification round (Stage 2)                                  |

### Task state lifecycle (orchestrator responsibility)

Before calling each per-task agent, the orchestrator:

1. Writes `{ "status": "in_progress", "worktree": ".worktrees/<task-id>" }` into `.loop-logs/<id>/tasks/<task-id>.json` (merging with the existing fields from Stage 0).
2. Computes the absolute repo root path (e.g. via `git rev-parse --show-toplevel`) and injects two paths into the agent's prompt:
   - `LOG_PATH`: `<absolute-repo-root>/.loop-logs/<id>/logs/<task-id>.md`
   - `ERROR_LOG_PATH`: `<absolute-repo-root>/.loop-logs/<id>/error/<task-id>.md`

After the agent returns, the orchestrator writes the final task state from the agent's structured output (see schema below).

### Required agent response schema

When implementing Stage 1 via the Workflow tool, use the `schema` option on each
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
the "Per-Task Agent Instructions" section below. Agents write `LOG_PATH` and
`ERROR_LOG_PATH` directly in both modes — the orchestrator never writes those files.

---

## Stage 1: Parallel Implementation

Spawn one worktree agent per task **simultaneously** — all at once, not sequentially. Each agent receives its `task_id` and the path to its task file: `.loop-logs/<id>/tasks/<task-id>.json`.

---

### Per-Task Agent Instructions

#### Agent Step A — Read task file

Read `.loop-logs/<id>/tasks/<task-id>.json`. Extract `plan`, `spec`, `attempt`, `task_id`.

#### Agent Step B — Create worktree

```bash
git worktree add .worktrees/<task-id> -b worktree/<task-id>
```

Switch working directory to `.worktrees/<task-id>` for ALL remaining steps. All bash commands, file reads, and git operations MUST run from within `.worktrees/<task-id>`.

The orchestrator injects two absolute paths into this agent's prompt before spawning:

- `LOG_PATH` — absolute path to `.loop-logs/<id>/logs/<task-id>.md` in the main repo root
- `ERROR_LOG_PATH` — absolute path to `.loop-logs/<id>/error/<task-id>.md` in the main repo root

Use these paths for all log writes in Step D. Never use relative paths for log files — the working directory is the worktree, not the repo root.

Update task JSON: `"status": "in_progress"`, `"worktree": ".worktrees/<task-id>"`.

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
3. Run verifiable signals in order (`<lint_cmd>`/`<test_cmd>` = the commands injected by the orchestrator in Step 0.6):
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

### Squash Merge (after ALL agents finish)

Wait for all worktree agents to complete (success or hard-stop).

**For each task with `"status": "completed"`:**

```bash
git merge --squash worktree/<task-id>
git commit -m "feat(<scope>): <task description>"
git worktree remove .worktrees/<task-id> --force
git branch -D worktree/<task-id>
```

**For each task with `"status": "failed"`:**

- Do NOT merge its worktree.
- Log in `.loop-logs/<id>/logs/summary.md`: `FAILED: <task-id> — see .loop-logs/<id>/error/<task-id>.md`

**After all merges**, verify the history is linear:

```bash
git log --oneline
```

No merge commits should appear. If any do, the wrong merge strategy was used.

---

## Stage 1 Integrity Gate

**This check is mandatory. Do not advance to Stage 2 until it passes.**

Read every `.loop-logs/<id>/tasks/<task-id>.json` for all tasks parsed in Stage 0.

**Check 1 — Status**
Every task file must have `"status": "completed"` or `"status": "failed"`.
Any file still showing `"status": "pending"` or `"status": "in_progress"` means the
orchestrator or agent did not complete its bookkeeping.

**Check 2 — Log files**
Every task with `"status": "completed"` must have a corresponding file at
`.loop-logs/<id>/logs/<task-id>.md`.

**If either check fails**, print exactly:

```
STOP — Stage 1 integrity check failed.

Missing or stale bookkeeping detected:
<task-id>: status="pending" (expected: completed | failed)
<task-id>: missing .loop-logs/<id>/logs/<task-id>.md
```

Do NOT proceed to Stage 2. Investigate which agent or orchestrator step was skipped.
Verify the agent prompt included steps A–D verbatim. Under this design, agents always write log files directly — the orchestrator never writes them.

**If all checks pass:** Print `Integrity gate passed — advancing to Stage 2.` and proceed.
