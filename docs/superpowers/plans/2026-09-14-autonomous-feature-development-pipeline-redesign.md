# Autonomous Feature Development Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-implementation plan-quality gate (Stage 1), simplify the
parallel implementation stage into a single implementer + faithfulness
verifier (Stage 3), and add a post-review E2E test-writing stage (Stage 6) to
`skills/autonomous-feature-development/`.

**Architecture:** Three new/changed stages inserted into the existing 5-stage
pipeline, which becomes 7 stages. Two brand-new stage files
(`stage-plan-gate.md`, `stage-e2e.md`), one new reference doc
(`plan-quality-checklist.md`), and renumbering/structural edits to the four
existing stage files plus `SKILL.md`.

**Tech Stack:** Markdown skill/procedure files consumed by Claude Code's
`Skill` tool — no application code, no test runner. "Tests" in this plan mean
**grep-based structural assertions**: for each edit, a `grep` command that
fails before the change (content absent) and passes after (content present)
— the closest equivalent of TDD for prose/procedure files. Every task still
follows write-check-implement-check-commit.

**Spec:** `docs/superpowers/specs/2026-09-14-autonomous-feature-development-pipeline-redesign-design.md`

## Global Constraints

- Final stage numbering (from spec): 1=Plan Detail Gate (new), 2=Guard&Setup
  (was 0), 3=Implementation (was 1, simplified), 4=Verify (was 2), 5=Review
  (was 3), 6=E2E Test Writing (new), 7=Final Commit (was 4).
- `Step 0.1` (validate inputs) and `Step 0.2` (compute run `id`) move from
  Stage 2 into Stage 1 as `Step 1.1`/`Step 1.2` — Stage 1 needs `id` for its
  own error-log path on cap exhaustion, and needs validated inputs before it
  can gate-check them. Stage 2 now starts at the old `Step 0.3` (branch
  guard), renumbered `Step 2.1`.
- Every new capped loop (Stage 1 review loop cap 3, Stage 3 faithfulness fix
  loop cap 2, Stage 6 faithfulness fix loop cap 2) hard-stops **uniformly
  regardless of `interaction_mode`** — write an error log under
  `.loop-logs/<id>/error/`, `git commit -m "wip: ..."`, stop the whole
  pipeline. No new `interaction_mode` junctures for any of these three caps.
- The only new `interaction_mode` juncture is Stage 1's elaboration
  ambiguity (synchronous in-conversation ask in `human-in-loop`, assume +
  record in `autonomous`) — it becomes juncture #1, the existing three are
  renumbered #2–#4.
- Mode B (standalone review-fix) has no `spec_path` and never runs Stage 1,
  Stage 6, or Stage 7 — it goes straight to
  `superpowers:finishing-a-development-branch` after its loop exits, exactly
  as today. Only Mode A gains Stage 1 and Stage 6.
- New durable artifacts live **next to `spec_path`**, never under
  `.loop-logs/`: `<spec-basename>-assumptions.md`,
  `<spec-basename>-e2e-test-plan.md`.
- Elaboration/revision of `plan_path` is always an **in-place edit** — one
  `### Task N:` heading per task number, never a duplicate, never a separate
  copy of the plan.

---

## File Structure

| File | Change |
|------|--------|
| `skills/autonomous-feature-development/plan-quality-checklist.md` | **Create** — self-contained plan-quality bar, used by Stage 1 |
| `skills/autonomous-feature-development/stage-plan-gate.md` | **Create** — Stage 1 procedure |
| `skills/autonomous-feature-development/stage-e2e.md` | **Create** — Stage 6 procedure |
| `skills/autonomous-feature-development/stage-impl.md` | **Modify** — renumber Stage 0→2, restructure Stage 1→3 (single implementer + faithfulness loop) |
| `skills/autonomous-feature-development/stage-verify.md` | **Modify** — renumber Stage 2→4, Stage 3 mentions→5; read `## Deferred to Verification` |
| `skills/autonomous-feature-development/stage-review-fix.md` | **Modify** — renumber Stage 2→4, Stage 3→5; route Mode A's "After the Loop" to Stage 6 |
| `skills/autonomous-feature-development/stage-final.md` | **Modify** — renumber Stage 4→7; add E2E row to summary/decisions |
| `skills/autonomous-feature-development/SKILL.md` | **Modify** — stage table, Interaction Mode junctures, Prerequisites cross-refs |

---

### Task 1: Create `plan-quality-checklist.md`

**Files:**
- Create: `skills/autonomous-feature-development/plan-quality-checklist.md`
- Test: none (new reference doc; verified via grep in Step 2)

**Interfaces:**
- Consumes: nothing (standalone reference doc)
- Produces: a checklist file that Stage 1's gate-check and elaboration
  subagents read by path
  `skills/autonomous-feature-development/plan-quality-checklist.md`. Section
  headings `## Required structure`, `## No-Placeholders red flags`,
  `## Semantic coherence`, `## Verdict` are referenced by name from
  `stage-plan-gate.md` (Task 2).

- [ ] **Step 1: Write the failing check**

```bash
test -f skills/autonomous-feature-development/plan-quality-checklist.md && echo FOUND || echo MISSING
```
Expected: `MISSING`

- [ ] **Step 2: Write the file**

```markdown
# Plan Quality Checklist

Used by Stage 1 (`stage-plan-gate.md`) to judge whether `plan_path` is
detailed enough to execute directly, and by the elaboration subagent when
revising it. Self-contained: extracted once from `superpowers:writing-plans`'
quality bar so Stage 1 never depends on invoking that external skill at
runtime — a fresh subagent can't be relied on to resolve a named external
skill, and this bar should survive `superpowers` changing internally.

## Required structure

- [ ] Header present: `Goal`, `Architecture`, `Tech Stack`, `Spec`, `Global
      Constraints`.
- [ ] Every `### Task N: <name>` heading has:
  - `Files` block: `Create:`, `Modify:` (exact path, line range if
    modifying), `Test:` — each an exact path.
  - `Interfaces` block: `Consumes:` (exact signatures used from earlier
    tasks) and `Produces:` (exact function/type names and signatures later
    tasks rely on).
  - Steps as a checklist (`- [ ] Step N: ...`), each one action: write
    failing test, run it to confirm it fails, write minimal implementation,
    run it to confirm it passes, commit.
- [ ] Every code step shows the actual code or command — never a
      description of what to do instead of showing it.

## No-Placeholders red flags

Mark the plan `insufficient` if any of these appear anywhere in a task's
content:

- `TBD`, `TODO`, "implement later", "fill in details"
- "add appropriate error handling" / "add validation" / "handle edge cases"
  without showing the actual handling
- "write tests for the above" without actual test code
- "similar to Task N" without repeating the actual content
- A step that describes an action without showing how (a code step with no
  code block)
- A reference to a type, function, or method not defined in any task in
  this plan

## Semantic coherence

A plan can pass every box above and still be vague. Also check:

- [ ] Each task's steps are plausible given `spec_path` — no invented field
      names, endpoints, or behavior that contradicts the spec.
- [ ] Task boundaries make sense — each task ends with something
      independently testable.
- [ ] Interfaces declared as `Produces` in one task are actually `Consumed`
      with matching signatures in later tasks that need them.

## Verdict

- `sufficient` — every box above is checked.
- `insufficient` — one or more boxes unchecked. List every unchecked box as
  a finding: one line, naming what's missing/wrong and where (task number
  or section).
```

- [ ] **Step 3: Run the check again**

```bash
test -f skills/autonomous-feature-development/plan-quality-checklist.md && echo FOUND || echo MISSING
grep -c "^## " skills/autonomous-feature-development/plan-quality-checklist.md
```
Expected: `FOUND`, then `4` (four `##` sections: Required structure,
No-Placeholders red flags, Semantic coherence, Verdict)

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/plan-quality-checklist.md
git commit -m "feat(autonomous-feature-development): add self-contained plan quality checklist"
```

---

### Task 2: Create `stage-plan-gate.md` (Stage 1)

**Files:**
- Create: `skills/autonomous-feature-development/stage-plan-gate.md`

**Interfaces:**
- Consumes: `plan-quality-checklist.md` (Task 1) by path reference; `spec_path`
  and `plan_path` from conversation context.
- Produces: `id` (computed here, reused by every later stage exactly as
  today's `Step 0.2` output was); a completed Stage 1 leaves `plan_path`
  with every `### Task N:` heading tagged `implementation` (non-implementation
  content moved to `## Deferred to Verification`), and either passed the
  gate as-is or been elaborated + reviewed to a `SHIP IT` verdict. Consumed
  by Stage 2 (`stage-impl.md`, Task 3) as its starting state.

- [ ] **Step 1: Write the failing check**

```bash
test -f skills/autonomous-feature-development/stage-plan-gate.md && echo FOUND || echo MISSING
```
Expected: `MISSING`

- [ ] **Step 2: Write the file**

```markdown
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
```

- [ ] **Step 3: Run the check again**

```bash
test -f skills/autonomous-feature-development/stage-plan-gate.md && echo FOUND || echo MISSING
grep -c "^## Step 1\." skills/autonomous-feature-development/stage-plan-gate.md
grep -q "Stage 1 Completion Gate" skills/autonomous-feature-development/stage-plan-gate.md && echo GATE_PRESENT
```
Expected: `FOUND`, then `5` (Steps 1.1–1.5), then `GATE_PRESENT`

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/stage-plan-gate.md
git commit -m "feat(autonomous-feature-development): add Stage 1 plan detail gate"
```

---

### Task 3: Renumber `stage-impl.md` Stage 0 → Stage 2 (Guard & Setup), add E2E command detection

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md`

**Interfaces:**
- Consumes: nothing new (same conversation-context inputs as today, minus
  the two steps moved to Stage 1).
- Produces: `<e2e_test_cmd>` (new, optional) alongside the existing
  `<lint_cmd>`/`<test_cmd>`/`<format_cmd>`/`<start_cmd>`, injected into every
  later subagent prompt exactly like the others. Consumed by Stage 6
  (`stage-e2e.md`, Task 8) to gate whether it runs at all.

- [ ] **Step 1: Write the failing check**

```bash
grep -q "^# Stage 0 + 1: Guard, Setup & Parallel Implementation" skills/autonomous-feature-development/stage-impl.md && echo OLD_HEADER_PRESENT
grep -q "e2e_test_cmd" skills/autonomous-feature-development/stage-impl.md && echo E2E_PRESENT || echo E2E_MISSING
```
Expected: `OLD_HEADER_PRESENT`, then `E2E_MISSING`

- [ ] **Step 2: Make the edits**

Replace the file header and Stage 0 section (lines 1–133 of the current
file, ending right before "## Orchestrator: Agent Output Schema and File
Ownership"):

Old text (exact, from current file lines 1–36):
```markdown
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
```

New text:
```markdown
# Stage 2 + 3: Guard, Setup & Implementation

`plan_path` and `spec_path` have already passed Stage 1 (`stage-plan-gate.md`)
by the time this file runs — `id` was already computed there (Step 1.2); it
is not recomputed here.

## Stage 2: Guard & Setup

### Step 2.1 — Branch guard
```

- [ ] **Step 2b: Renumber remaining Stage 0 steps**

Old (exact, current lines 41, 49, 77, 115):
```markdown
### Step 0.4 — Parse tasks
```
```markdown
### Step 0.5 — Initialize task files
```
```markdown
### Step 0.6 — Resolve project commands
```
```markdown
### Step 0.7 — Probe verification capability (Mode A)
```

New:
```markdown
### Step 2.2 — Parse tasks
```
```markdown
### Step 2.3 — Initialize task files
```
```markdown
### Step 2.4 — Resolve project commands
```
```markdown
### Step 2.5 — Probe verification capability (Mode A)
```

- [ ] **Step 2c: Add a one-line note under the renumbered Step 2.2 (Parse tasks) heading**

Old (exact, current lines 41-47):
```markdown
### Step 0.4 — Parse tasks

Read `plan_path`. Extract every heading matching `### Task N: <name>` (N = a number). For each match:

- Derive `task_id`: `task-<N>-<kebab-case-name>`
  - Example: `### Task 3: Tavily Service` → `task-3-tavily-service`
- Record line range (from this heading to next `### Task` heading or end of file)
```

New:
```markdown
### Step 2.2 — Parse tasks

By this point Stage 1 has already moved every `non-implementation` task into
`## Deferred to Verification` — every remaining `### Task N:` heading is
implementation work.

Read `plan_path`. Extract every heading matching `### Task N: <name>` (N = a number). For each match:

- Derive `task_id`: `task-<N>-<kebab-case-name>`
  - Example: `### Task 3: Tavily Service` → `task-3-tavily-service`
- Record line range (from this heading to next `### Task` heading or end of file)
```

- [ ] **Step 2d: Add the E2E command-resolution tier to Step 2.4 (Resolve project commands)**

Old (exact, current lines 77–113):
```markdown
### Step 0.6 — Resolve project commands

The pipeline needs four commands. Resolve each **once** here; never hardcode a tool.

| Variable       | Purpose         | Required                        |
| -------------- | --------------- | -------------------------------- |
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
```

New:
```markdown
### Step 2.4 — Resolve project commands

The pipeline needs five commands. Resolve each **once** here; never hardcode a tool.

| Variable         | Purpose          | Required                        |
| ---------------- | ---------------- | -------------------------------- |
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
```

- [ ] **Step 2e: Renumber the remaining `Stage 0`/`Step 0.x` cross-references in the file**

Old (exact matches, current lines 115, 122, 124, 128-131):
```markdown
### Step 0.7 — Probe verification capability (Mode A)

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
```

New:
```markdown
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
```

- [ ] **Step 3: Run the check again**

```bash
grep -q "^# Stage 2 + 3: Guard, Setup & Implementation" skills/autonomous-feature-development/stage-impl.md && echo NEW_HEADER
grep -q "e2e_test_cmd" skills/autonomous-feature-development/stage-impl.md && echo E2E_PRESENT
grep -c "^### Step 2\." skills/autonomous-feature-development/stage-impl.md
grep -q "^### Step 0\." skills/autonomous-feature-development/stage-impl.md && echo STALE || echo CLEAN
```
Expected: `NEW_HEADER`, `E2E_PRESENT`, `5` (Steps 2.1–2.5), `CLEAN`

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md
git commit -m "refactor(autonomous-feature-development): renumber Stage 0 to Stage 2, add E2E command detection"
```

---

### Task 4: Replace `stage-impl.md` Stage 1 with Stage 3 single-implementer design

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md`

**Interfaces:**
- Consumes: `<lint_cmd>`/`<test_cmd>` from Task 3's Step 2.4; `plan_path`
  (already Stage-1-gated) task list from Step 2.2.
- Produces: a single implementer subagent run in one worktree
  (`.worktrees/impl`) that leaves every implementation task
  `completed`/`failed` with commits inside that worktree, ready for Task 5's
  faithfulness verifier.

- [ ] **Step 1: Write the failing check**

```bash
grep -q "Spawn one worktree agent per task" skills/autonomous-feature-development/stage-impl.md && echo OLD_PARALLEL_PRESENT
grep -q "Single Implementer" skills/autonomous-feature-development/stage-impl.md && echo NEW_PRESENT || echo NEW_MISSING
```
Expected: `OLD_PARALLEL_PRESENT`, then `NEW_MISSING`

- [ ] **Step 2: Make the edit**

Replace from `## Stage 1: Parallel Implementation` through the end of the
`#### Agent Step B — Create worktree` subsection (current lines 196–224):

Old (exact):
```markdown
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
```

New:
```markdown
## Stage 3: Implementation

**One implementer subagent, one worktree for the whole stage** — not one
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
```

- [ ] **Step 2b: Adjust the "Read both log reference documents" heading label**

Old (exact, current line 225, part of "Agent Step C"):
```markdown
#### Agent Step C — Read task content and write Task Header
```

New: leave unchanged — this heading is still correct as "Agent Step C" per
task, since the implementer repeats Steps A–D once per task in its
sequential loop. No edit needed here.

- [ ] **Step 2c: Update the squash-merge section to a single merge**

Old (exact, current lines 316–331):
```markdown
### Squash Merge (after ALL agents finish)

Follow `../../rules/git-linear-history.md` — squash merge only, never plain
`git merge`, on every worktree branch below.

Wait for all worktree agents to complete (success or hard-stop).

**For each task with `"status": "completed"`:**

```bash
git merge --squash worktree/<task-id>
git commit -m "feat(<scope>): <task description>"
```

**For each task with `"status": "failed"`:** do NOT merge. Log in
`.loop-logs/<id>/logs/summary.md`: `FAILED: <task-id> — see .loop-logs/<id>/error/<task-id>.md`.
```

New:
```markdown
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
```

- [ ] **Step 2d: Replace the "Final worktree sweep" and "Stage 1 Integrity Gate" sections**

Old (exact, current lines 333–389):
```markdown
### Final worktree sweep (mandatory — both interaction modes)

After all merges, remove **every** worktree (completed and failed — failed work is
already captured in its error log):

```bash
for wt in $(git worktree list --porcelain | awk '/^worktree/ {print $2}' | grep '/.worktrees/'); do
  git worktree remove --force "$wt"
done
git worktree prune
git branch --list 'worktree/*' | xargs -r git branch -D
rmdir .worktrees 2>/dev/null || true
```

**Gate:** `git worktree list` shows no path under `.worktrees/`, and `.worktrees/`
is gone. If any remain, STOP and print which worktree could not be removed.

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
```

New:
```markdown
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
```

- [ ] **Step 3: Run the check again**

```bash
grep -q "Single implementer subagent, one worktree for the whole stage" skills/autonomous-feature-development/stage-impl.md && echo NEW_PRESENT
grep -q "Spawn one worktree agent per task" skills/autonomous-feature-development/stage-impl.md && echo STALE || echo CLEAN
grep -q "Stage 3 Task-Completion Gate" skills/autonomous-feature-development/stage-impl.md && echo GATE_PRESENT
```
Expected: `NEW_PRESENT`, `CLEAN`, `GATE_PRESENT`

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md
git commit -m "refactor(autonomous-feature-development): replace parallel per-task workers with single sequential implementer in Stage 3"
```

---

### Task 5: Add faithfulness verifier + Opus planner fix loop to Stage 3

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md`

**Interfaces:**
- Consumes: the Stage 3 Task-Completion Gate output from Task 4; `plan_path`.
- Produces: `plan_path` with either a `#### Revision N` subsection inside an
  affected `### Task N:` block, or a `## Plan Revision History` section
  (placed after `## Global Constraints`, before the first `### Task`) — both
  consumed by the implementer on its next pass through the same task(s).

- [ ] **Step 1: Write the failing check**

```bash
grep -q "Faithfulness Verification" skills/autonomous-feature-development/stage-impl.md && echo PRESENT || echo MISSING
```
Expected: `MISSING`

- [ ] **Step 2: Insert the new section**

Insert immediately after the `## Stage 3 Task-Completion Gate` section added
in Task 4 (i.e. append to end of file, since that gate is currently the last
section in `stage-impl.md`):

```markdown

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
```

- [ ] **Step 3: Run the check again**

```bash
grep -q "Faithfulness Verification" skills/autonomous-feature-development/stage-impl.md && echo PRESENT
grep -q "Opus planner subagent (model: Opus)" skills/autonomous-feature-development/stage-impl.md && echo OPUS_PRESENT
grep -q "Plan Revision History" skills/autonomous-feature-development/stage-impl.md && echo REVISION_PRESENT
```
Expected: `PRESENT`, `OPUS_PRESENT`, `REVISION_PRESENT`

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md
git commit -m "feat(autonomous-feature-development): add faithfulness verifier and Opus planner fix loop to Stage 3"
```

---

### Task 6: Renumber `stage-verify.md` (Stage 2 → 4) and read Deferred-to-Verification context

**Files:**
- Modify: `skills/autonomous-feature-development/stage-verify.md`

**Interfaces:**
- Consumes: `## Deferred to Verification` section in `plan_path`, written by
  Stage 1 (Task 2).
- Produces: no interface change — same `verification-state.json` schema, now
  described as Stage 4 instead of Stage 2.

- [ ] **Step 1: Write the failing check**

```bash
grep -q "^# Stage 2: Verification" skills/autonomous-feature-development/stage-verify.md && echo OLD_PRESENT
grep -q "Deferred to Verification" skills/autonomous-feature-development/stage-verify.md && echo NEW_PRESENT || echo NEW_MISSING
```
Expected: `OLD_PRESENT`, then `NEW_MISSING`

- [ ] **Step 2: Make the edits**

Old (exact, current line 1):
```markdown
# Stage 2: Verification (loop VERIFY step)
```
New:
```markdown
# Stage 4: Verification (loop VERIFY step)
```

Old (exact, current line 11):
```markdown
Spawn a **verifier subagent** (single responsibility). It receives `spec_path`, `playwright_available`, and the resolved commands. It is **not** given the
```
New:
```markdown
Spawn a **verifier subagent** (single responsibility). It receives `spec_path`, `playwright_available`, the resolved commands, and (if present) `plan_path`'s `## Deferred to Verification` section — content Stage 1 moved out of the numbered task list because it wasn't implementation work (e.g. a stray "manually verify staging" task). Use it as extra context on what to check; it never changes `outcome`'s pass/fail logic below. It is **not** given the
```

Old (exact, current line 86):
```markdown
backstop: Stage 0.7 already refuses to start an autonomous run with UI acceptance
```
New:
```markdown
backstop: Stage 2.5 already refuses to start an autonomous run with UI acceptance
```

Old (exact, current line 107):
```markdown
- This file is the sole input to the **Stage 2 Clearance Gate** in
```
New:
```markdown
- This file is the sole input to the **Stage 4 Clearance Gate** in
```

Old (exact, current line 155):
```markdown
   STOP — Stage 2 is awaiting human verification.
```
New:
```markdown
   STOP — Stage 4 is awaiting human verification.
```

Old (exact, current line 159):
```markdown
   Do NOT advance to Stage 3 or Stage 4.
```
New:
```markdown
   Do NOT advance to Stage 5, 6, or 7.
```

- [ ] **Step 3: Run the check again**

```bash
grep -q "^# Stage 4: Verification" skills/autonomous-feature-development/stage-verify.md && echo NEW_HEADER
grep -q "Deferred to Verification" skills/autonomous-feature-development/stage-verify.md && echo DEFERRED_PRESENT
grep -q "Stage 2 Clearance Gate" skills/autonomous-feature-development/stage-verify.md && echo STALE || echo CLEAN
```
Expected: `NEW_HEADER`, `DEFERRED_PRESENT`, `CLEAN`

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/stage-verify.md
git commit -m "refactor(autonomous-feature-development): renumber Stage 2 to Stage 4, read Deferred-to-Verification context"
```

---

### Task 7: Renumber `stage-review-fix.md` (Stage 2/3 → 4/5) and route Mode A to Stage 6

**Files:**
- Modify: `skills/autonomous-feature-development/stage-review-fix.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: Mode A's "After the Loop" now points to `stage-e2e.md`/Stage 6
  instead of directly to `stage-final.md`/Stage 7. Mode B is unchanged — it
  still goes straight to `finishing-a-development-branch`.

- [ ] **Step 1: Write the failing check**

```bash
grep -q "^# Stage 3 / Mode B: Capped Verify↔Review Loop" skills/autonomous-feature-development/stage-review-fix.md && echo OLD_PRESENT
grep -q "stage-e2e.md" skills/autonomous-feature-development/stage-review-fix.md && echo NEW_PRESENT || echo NEW_MISSING
```
Expected: `OLD_PRESENT`, then `NEW_MISSING`

- [ ] **Step 2: Make the edits**

Old (exact, current lines 1–9):
```markdown
# Stage 3 / Mode B: Capped Verify↔Review Loop

Stage 3 is not a single pass. It is a loop that alternates VERIFY (Stage 2) and
REVIEW until a review round raises **zero actionable issues**, or a hard cap of 5
iterations is hit.

Used in two contexts:

- **Mode A**: After Stage 1, the orchestrator runs the Loop Control below.
```

New:
```markdown
# Stage 4 + 5 / Mode B: Capped Verify↔Review Loop

Stage 5 is not a single pass. It is a loop that alternates VERIFY (Stage 4) and
REVIEW until a review round raises **zero actionable issues**, or a hard cap of 5
iterations is hit.

Used in two contexts:

- **Mode A**: After Stage 3, the orchestrator runs the Loop Control below.
```

Old (exact, current line 32):
```markdown
  2. REVIEW  — run the Stage 2 Clearance Gate below, then Part 1: spawn the review
```
New:
```markdown
  2. REVIEW  — run the Stage 4 Clearance Gate below, then Part 1: spawn the review
```

Old (exact, current line 71):
```markdown
### Stage 2 Clearance Gate
```
New:
```markdown
### Stage 4 Clearance Gate
```

Old (exact, current line 84):
```markdown
STOP — Stage 2 Clearance Gate failed.
```
New:
```markdown
STOP — Stage 4 Clearance Gate failed.
```

Old (exact, current line 89):
```markdown
Stage 2 is not cleared. The review agent was NOT spawned.
```
New:
```markdown
Stage 4 is not cleared. The review agent was NOT spawned.
```

Old (exact, current line 94):
```markdown
Then end the turn. Do not advance to Stage 3 or Stage 4.
```
New:
```markdown
Then end the turn. Do not advance to Stage 5, 6, or 7.
```

Old (exact, current line 243):
```markdown
**Mode A:** Read `./stage-final.md` and proceed to Stage 4.
```
New:
```markdown
**Mode A:** Read `./stage-e2e.md` and proceed to Stage 6.
```

- [ ] **Step 3: Run the check again**

```bash
grep -q "^# Stage 4 + 5 / Mode B: Capped Verify↔Review Loop" skills/autonomous-feature-development/stage-review-fix.md && echo NEW_HEADER
grep -q "stage-e2e.md" skills/autonomous-feature-development/stage-review-fix.md && echo E2E_ROUTE
grep -q "Stage 2 Clearance Gate" skills/autonomous-feature-development/stage-review-fix.md && echo STALE || echo CLEAN
```
Expected: `NEW_HEADER`, `E2E_ROUTE`, `CLEAN`

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/stage-review-fix.md
git commit -m "refactor(autonomous-feature-development): renumber Stage 2/3 to Stage 4/5, route Mode A to Stage 6"
```

---

### Task 8: Create `stage-e2e.md` (Stage 6)

**Files:**
- Create: `skills/autonomous-feature-development/stage-e2e.md`

**Interfaces:**
- Consumes: `<e2e_test_cmd>` from Task 3's Step 2.4; `spec_path`.
- Produces: `<spec-basename>-e2e-test-plan.md` (next to `spec_path`);
  `.loop-logs/<id>/tasks/e2e-state.json` — `{ "status": "skipped" |
  "passed", "reason": string | null, "scenario_doc": string | null,
  "rounds_completed": number }` — consumed by Stage 7 (`stage-final.md`,
  Task 9) to render the summary's E2E row.

- [ ] **Step 1: Write the failing check**

```bash
test -f skills/autonomous-feature-development/stage-e2e.md && echo FOUND || echo MISSING
```
Expected: `MISSING`

- [ ] **Step 2: Write the file**

```markdown
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
```

- [ ] **Step 3: Run the check again**

```bash
test -f skills/autonomous-feature-development/stage-e2e.md && echo FOUND
grep -q "e2e-state.json" skills/autonomous-feature-development/stage-e2e.md && echo STATE_PRESENT
grep -q "model: Opus" skills/autonomous-feature-development/stage-e2e.md && echo OPUS_PRESENT
```
Expected: `FOUND`, `STATE_PRESENT`, `OPUS_PRESENT`

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/stage-e2e.md
git commit -m "feat(autonomous-feature-development): add Stage 6 E2E test writing"
```

---

### Task 9: Renumber `stage-final.md` (Stage 4 → 7), add E2E summary/decisions rows

**Files:**
- Modify: `skills/autonomous-feature-development/stage-final.md`

**Interfaces:**
- Consumes: `.loop-logs/<id>/tasks/e2e-state.json` from Task 8;
  `<spec-basename>-assumptions.md` and `## Plan Revision History` /
  `#### Revision N` sections in `plan_path` from Tasks 2 and 5.
- Produces: no schema change — `summary.md`/`decisions.md` content only.

- [ ] **Step 1: Write the failing check**

```bash
grep -q "^# Stage 4: Final Commit" skills/autonomous-feature-development/stage-final.md && echo OLD_PRESENT
grep -q "e2e-state.json" skills/autonomous-feature-development/stage-final.md && echo NEW_PRESENT || echo NEW_MISSING
```
Expected: `OLD_PRESENT`, then `NEW_MISSING`

- [ ] **Step 2: Make the edits**

Old (exact, current line 1):
```markdown
# Stage 4: Final Commit
```
New:
```markdown
# Stage 7: Final Commit
```

Old (exact, current lines 3–10):
```markdown
## Step 4.1 — Final lint and format

```bash
<lint_cmd>    # must exit 0
<format_cmd>  # must exit 0 — skip if the project has no format command
```

If either fails, fix the issues before proceeding.
```
New:
```markdown
## Step 7.1 — Final lint and format

```bash
<lint_cmd>    # must exit 0
<format_cmd>  # must exit 0 — skip if the project has no format command
```

If either fails, fix the issues before proceeding.
```

Old (exact, current lines 12–44, the summary template):
```markdown
## Step 4.2 — Write summary

Write `.loop-logs/<id>/logs/summary.md`:

```markdown
# Loop Summary

**Plan:** <plan_path>
**Spec:** <spec_path>
**Branch:** <branch name>
**Date:** <timestamp>

## Tasks

| Task      | Status             | Attempts | Delivered                                        |
| --------- | ------------------ | -------- | ------------------------------------------------ |
| <task-id> | completed / failed | N        | <name from `### Task N: <name>` heading in plan> |

**Completed:** N/total
**Failed:** N/total (see .loop-logs/<id>/error/ for details)

## Verification

**Rounds:** <rounds_completed from .loop-logs/<id>/tasks/verification-state.json>

## Review

**Loop iterations:** <N> of ≤5 (<N> = count of `.loop-logs/<id>/code-review/round-<N>.md` files)
**Actionable issues found:** N
**Actionable issues fixed:** N
**Minor issues deferred (NOT handled yet):**
<list each deferred minor from the final review round, or "none">
```
```
New:
```markdown
## Step 7.2 — Write summary

Write `.loop-logs/<id>/logs/summary.md`:

```markdown
# Loop Summary

**Plan:** <plan_path>
**Spec:** <spec_path>
**Branch:** <branch name>
**Date:** <timestamp>

## Tasks

| Task      | Status             | Attempts | Delivered                                        |
| --------- | ------------------ | -------- | ------------------------------------------------ |
| <task-id> | completed / failed | N        | <name from `### Task N: <name>` heading in plan> |

**Completed:** N/total
**Failed:** N/total (see .loop-logs/<id>/error/ for details)

## Verification

**Rounds:** <rounds_completed from .loop-logs/<id>/tasks/verification-state.json>

## Review

**Loop iterations:** <N> of ≤5 (<N> = count of `.loop-logs/<id>/code-review/round-<N>.md` files)
**Actionable issues found:** N
**Actionable issues fixed:** N
**Minor issues deferred (NOT handled yet):**
<list each deferred minor from the final review round, or "none">

## E2E

Read `.loop-logs/<id>/tasks/e2e-state.json`.

- `status == "skipped"`: **E2E:** skipped — <reason>
- `status == "passed"`: **E2E:** <rounds_completed> round(s), scenarios in <scenario_doc>
```
```

Old (exact, current lines 46–79, decisions log section):
```markdown
## Step 4.2a — Write decisions log

Write `.loop-logs/<id>/logs/decisions.md`, consolidating:

- Every `### Key Decisions` bullet from every attempt in every
  `.loop-logs/<id>/logs/<task-id>.md`
- The root cause from any failed attempt (`Outcome: failed — <root cause>`), even
  if a later attempt on the same task succeeded
- Each fixed issue's Phase 1 root-cause/plan from every
  `.loop-logs/<id>/code-review/round-*.md`

```markdown
# Decisions & Challenges — <id>

## <task-id>

### Key decisions
- <bullet from Key Decisions, attempt N>

### Challenges faced
- Attempt <N> failed: <root cause>
```

If a task has no `### Key Decisions` in any attempt, omit its "Key decisions"
subsection. If every attempt on a task succeeded on the first try, omit its
"Challenges faced" subsection. Repeat the `## <task-id>` block once per task. If
the review loop fixed zero issues, omit the trailing "## Review fixes" section
below; otherwise append it:

```markdown
## Review fixes

- <issue-id>: <root cause/plan from Phase 1>
```
```
New:
```markdown
## Step 7.2a — Write decisions log

Write `.loop-logs/<id>/logs/decisions.md`, consolidating:

- Every `### Key Decisions` bullet from every attempt in every
  `.loop-logs/<id>/logs/impl.md`
- The root cause from any failed attempt (`Outcome: failed — <root cause>`), even
  if a later attempt on the same task succeeded
- Each fixed issue's Phase 1 root-cause/plan from every
  `.loop-logs/<id>/code-review/round-*.md`
- Every bullet from `<spec-basename>-assumptions.md` (Stage 1, if present)
- Every `#### Revision N` subsection and any `## Plan Revision History`
  entry in `plan_path` (Stage 3, if present)

```markdown
# Decisions & Challenges — <id>

## <task-id>

### Key decisions
- <bullet from Key Decisions, attempt N>

### Challenges faced
- Attempt <N> failed: <root cause>
```

If a task has no `### Key Decisions` in any attempt, omit its "Key decisions"
subsection. If every attempt on a task succeeded on the first try, omit its
"Challenges faced" subsection. Repeat the `## <task-id>` block once per task. If
the review loop fixed zero issues, omit the trailing "## Review fixes" section
below; otherwise append it:

```markdown
## Review fixes

- <issue-id>: <root cause/plan from Phase 1>
```

If Stage 1 produced an assumptions file, append:

```markdown
## Plan assumptions (Stage 1)

- <bullet from <spec-basename>-assumptions.md>
```

If Stage 3 recorded any revisions, append:

```markdown
## Plan revisions (Stage 3 faithfulness loop)

- <task-id or "architecture">: <root cause from #### Revision N or ## Plan Revision History>
```
```

Old (exact, current lines 81–94, generate reviewer report step):
```markdown
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
New:
```markdown
## Step 7.2b — Generate reviewer report

Invoke the `explain-changes` skill in diff-review mode, passing: `id`,
`plan_path`, `spec_path`, `base_sha` (recorded in `stage-impl.md` Step 2.1), and
the paths written above (`summary.md`, `decisions.md`, any
`code-review/round-*.md`, any `error/*.md`). Output goes to
`.loop-logs/<id>/reports/`.

Capture what it returns — `Report generated: <path>` on success, or the failure
line — as `<report_path>` for Step 7.3 (empty if it failed).

This step must never block the pipeline: if `explain-changes` is unavailable,
errors, or does not produce a file, print one line noting the failure and
continue to Step 7.3 regardless.
```

Old (exact, current lines 96–129, commit-or-handoff step):
```markdown
## Step 4.3 — Commit or hand off

**`interaction_mode == autonomous`:** stage everything (`git add -A`) and commit.

- All tasks completed: `git commit -m "feat(<scope>): <description from plan Goal line>"`
- Any task failed (partial):
  ```bash
  git commit -m "wip: partial — <completed>/<total> tasks completed

  Failed tasks:
  <task-id-1>: see .loop-logs/<id>/error/<task-id-1>.md"
  ```
Then proceed to Step 4.4.

**`interaction_mode == human-in-loop`:** do NOT commit. Collapse the run's commits
into unstaged working-tree changes for the human to review:

```bash
git reset --mixed <base_sha>
```

Confirm `git status` shows unstaged changes and `git log` shows no new commits since
`<base_sha>`. **Skip Step 4.4.** Print:

```
Implementation complete. All changes are unstaged on <branch> — review and commit manually.
Summary: .loop-logs/<id>/logs/summary.md
Report: <report_path from Step 4.2b>
```

Include the `Report:` line only if Step 4.2b produced a path; omit it entirely if
`explain-changes` failed or was unavailable.

Then stop.
```
New:
```markdown
## Step 7.3 — Commit or hand off

**`interaction_mode == autonomous`:** stage everything (`git add -A`) and commit.

- All tasks completed: `git commit -m "feat(<scope>): <description from plan Goal line>"`
- Any task failed (partial):
  ```bash
  git commit -m "wip: partial — <completed>/<total> tasks completed

  Failed tasks:
  <task-id-1>: see .loop-logs/<id>/error/<task-id-1>.md"
  ```
Then proceed to Step 7.4.

**`interaction_mode == human-in-loop`:** do NOT commit. Collapse the run's commits
into unstaged working-tree changes for the human to review:

```bash
git reset --mixed <base_sha>
```

Confirm `git status` shows unstaged changes and `git log` shows no new commits since
`<base_sha>`. **Skip Step 7.4.** Print:

```
Implementation complete. All changes are unstaged on <branch> — review and commit manually.
Summary: .loop-logs/<id>/logs/summary.md
Report: <report_path from Step 7.2b>
```

Include the `Report:` line only if Step 7.2b produced a path; omit it entirely if
`explain-changes` failed or was unavailable.

Then stop.
```

Old (exact, current lines 131–137, branch completion step):
```markdown
## Step 4.4 — Branch completion

Only runs when `interaction_mode == autonomous` (human-in-loop stopped at Step 4.3).

Run `superpowers:finishing-a-development-branch`. If the `superpowers` plugin is
not installed, stop here and tell the user to install it (see the plugin README) —
do not improvise branch completion.
```
New:
```markdown
## Step 7.4 — Branch completion

Only runs when `interaction_mode == autonomous` (human-in-loop stopped at Step 7.3).

Run `superpowers:finishing-a-development-branch`. If the `superpowers` plugin is
not installed, stop here and tell the user to install it (see the plugin README) —
do not improvise branch completion.
```

- [ ] **Step 3: Run the check again**

```bash
grep -q "^# Stage 7: Final Commit" skills/autonomous-feature-development/stage-final.md && echo NEW_HEADER
grep -q "e2e-state.json" skills/autonomous-feature-development/stage-final.md && echo E2E_PRESENT
grep -c "^## Step 7\." skills/autonomous-feature-development/stage-final.md
grep -q "Step 0\.3\|Step 4\." skills/autonomous-feature-development/stage-final.md && echo STALE || echo CLEAN
```
Expected: `NEW_HEADER`, `E2E_PRESENT`, `4` (Steps 7.1–7.4, note 7.2a/7.2b
count under the `## Step 7.2` prefix match too — adjust grep to `^## Step
7\.[0-9]` if the count looks off due to `7.2a`/`7.2b` suffixes), `CLEAN`

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/stage-final.md
git commit -m "refactor(autonomous-feature-development): renumber Stage 4 to Stage 7, add E2E summary and decisions rows"
```

---

### Task 10: Update `SKILL.md` — stage table, Interaction Mode junctures, Prerequisites cross-refs

**Files:**
- Modify: `skills/autonomous-feature-development/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: the authoritative stage table and juncture list every other
  file's cross-references assume.

- [ ] **Step 1: Write the failing check**

```bash
grep -q "stage-plan-gate.md" skills/autonomous-feature-development/SKILL.md && echo NEW_PRESENT || echo NEW_MISSING
```
Expected: `NEW_MISSING`

- [ ] **Step 2: Make the edits**

Old (exact, current lines 18, 20, 26):
```markdown
- **`ponytail`** (optional) — `ponytail:ponytail-review` is one of the skills the single Stage 3 review agent applies. If absent, skip that skill and proceed with the remaining ones.
```
```markdown
  autonomous`. Nothing to install ahead of time: the Stage 0.7 preflight probe
```
```markdown
  the end of Stage 4 (`stage-final.md` Step 4.2b). If absent, or if it fails,
```
New:
```markdown
- **`ponytail`** (optional) — `ponytail:ponytail-review` is one of the skills the single Stage 5 review agent applies. If absent, skip that skill and proceed with the remaining ones.
```
```markdown
  autonomous`. Nothing to install ahead of time: the Stage 2.5 preflight probe
```
```markdown
  the end of Stage 7 (`stage-final.md` Step 7.2b). If absent, or if it fails,
```

Old (exact, current lines 54–66, Interaction Mode junctures list):
```markdown
The orchestrator branches on `interaction_mode` at exactly three junctures:

1. **Stage 0 preflight fallback** — an unresolved command or absent Playwright CLI capability.
2. **Stage 2 verify fallback** — the verifier reports `blocked` acceptance criteria
   (browser needed, Playwright CLI unavailable). `autonomous` hard-stops; `human-in-loop` writes a
   checklist, sets `last_outcome: "awaiting_human"`, and **pauses**. The Stage 2
   Clearance Gate in `stage-review-fix.md` blocks Stage 3 until the human clears it.
3. **Stage 4 commit** — auto-commit vs leave-unstaged handoff.

Everywhere else is identical across both values. **Subagents never branch on
`interaction_mode`** — they run to completion and cannot pause. They receive
concrete inputs (resolved commands, `playwright_available`) and keep assume-and-comment
behavior internally.
```
New:
```markdown
The orchestrator branches on `interaction_mode` at exactly four junctures:

1. **Stage 1 plan-gate ambiguity** — the elaboration subagent flags a decision it
   can't resolve alone. `autonomous`: best-guess, recorded in
   `<spec-basename>-assumptions.md`. `human-in-loop`: synchronous
   in-conversation clarification (no file-based pause — nothing state-bearing
   exists yet at Stage 1).
2. **Stage 2 preflight fallback** — an unresolved command or absent Playwright CLI capability.
3. **Stage 4 verify fallback** — the verifier reports `blocked` acceptance criteria
   (browser needed, Playwright CLI unavailable). `autonomous` hard-stops; `human-in-loop` writes a
   checklist, sets `last_outcome: "awaiting_human"`, and **pauses**. The Stage 4
   Clearance Gate in `stage-review-fix.md` blocks Stage 5 until the human clears it.
4. **Stage 7 commit** — auto-commit vs leave-unstaged handoff.

Everywhere else is identical across both values. **Subagents never branch on
`interaction_mode`** — they run to completion and cannot pause. They receive
concrete inputs (resolved commands, `playwright_available`) and keep assume-and-comment
behavior internally.

Two capped loops added by this design — Stage 3's faithfulness fix loop and
Stage 6's E2E fix loop, both capped at 2 rounds — do **not** add junctures.
They hard-stop uniformly regardless of `interaction_mode`, exactly like the
existing 3-attempt TDD exhaustion and 5-iteration review-loop exhaustion:
mode-branching here is reserved for missing capabilities, not for "attempted
and failed."
```

Old (exact, current lines 68–83, Mode A stage table):
```markdown
## Mode A: Full Pipeline

Read and execute each stage file in order:

| Stage | File                    | Description                                                                                                                                                                                                                                                                                        |
| ----- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 + 1 | `./stage-impl.md`       | Guard/setup, compute run `id`, parallel worktree implementation                                                                                                                                                                                                                                    |
| 2 + 3 | `./stage-review-fix.md` | **Capped verify↔review loop** (≤5 iterations): each iteration runs the VERIFY step in `./stage-verify.md`, then spawns a single multi-skill review agent, writes a code-review log, fixes actionable (blocking+important) issues via a severity-gated pipeline, and re-verifies. Exits when a review raises zero actionable issues. |
| 4     | `./stage-final.md`      | Lint, format, summary, final commit                                                                                                                                                                                                                                                                |

**Run `id`:** computed once in Stage 0 (`stage-impl.md` Step 0.2); all logs live under
`.loop-logs/<id>/`. Mode B `id` = `<today>-review-<branch>`.

**When `interaction_mode == autonomous`: FULLY AUTONOMOUS** — never pause, never
ask; if ambiguous → reasonable assumption + code comment. When `human-in-loop`,
the orchestrator may pause at the three junctures above; subagents remain autonomous.
```
New:
```markdown
## Mode A: Full Pipeline

Read and execute each stage file in order:

| Stage | File                     | Description                                                                                                                                                                                                                                                                                        |
| ----- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `./stage-plan-gate.md`   | Validate inputs, compute run `id`, gate-check `plan_path` for detail, classify/route non-implementation tasks, elaborate + review if needed |
| 2 + 3 | `./stage-impl.md`        | Guard/setup, then single-implementer sequential implementation with a faithfulness-verifier fix loop (≤2 rounds) |
| 4 + 5 | `./stage-review-fix.md`  | **Capped verify↔review loop** (≤5 iterations): each iteration runs the VERIFY step in `./stage-verify.md`, then spawns a single multi-skill review agent, writes a code-review log, fixes actionable (blocking+important) issues via a severity-gated pipeline, and re-verifies. Exits when a review raises zero actionable issues. |
| 6     | `./stage-e2e.md`         | E2E scenario planning + implementation with a faithfulness-verifier fix loop (≤2 rounds); skipped entirely if the project has no E2E tooling |
| 7     | `./stage-final.md`       | Lint, format, summary, final commit                                                                                                                                                                                                                                                                |

**Run `id`:** computed once in Stage 1 (`stage-plan-gate.md` Step 1.2); all logs live under
`.loop-logs/<id>/`. Mode B `id` = `<today>-review-<branch>`.

**When `interaction_mode == autonomous`: FULLY AUTONOMOUS** — never pause, never
ask; if ambiguous → reasonable assumption + code comment (or, in Stage 1, a
recorded assumption — see Interaction Mode above). When `human-in-loop`,
the orchestrator may pause at the four junctures above; subagents remain autonomous.
```

Old (exact, current line 87):
```markdown
Issues already exist in conversation context. Read `./stage-review-fix.md`: the orchestrator validates the received issues and fixes them (Part 0), then enters the **same capped verify↔review loop** as Mode A until a review raises zero actionable issues.
```
New: leave unchanged — Mode B's description doesn't reference stage numbers
directly and remains correct as-is (Mode B never runs Stage 1 or Stage 6).

Old (exact, current line 96):
```markdown
   unstaged on the branch for the human (see `stage-final.md`).
```
New: leave unchanged — no stage number in this line.

- [ ] **Step 3: Run the check again**

```bash
grep -q "stage-plan-gate.md" skills/autonomous-feature-development/SKILL.md && echo NEW_PRESENT
grep -q "stage-e2e.md" skills/autonomous-feature-development/SKILL.md && echo E2E_PRESENT
grep -q "exactly four junctures" skills/autonomous-feature-development/SKILL.md && echo FOUR_JUNCTURES
grep -q "Stage 0 preflight fallback\|Stage 2 verify fallback\|Stage 4 commit\b" skills/autonomous-feature-development/SKILL.md && echo STALE || echo CLEAN
```
Expected: `NEW_PRESENT`, `E2E_PRESENT`, `FOUR_JUNCTURES`, `CLEAN`

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-feature-development/SKILL.md
git commit -m "docs(autonomous-feature-development): update SKILL.md for 7-stage pipeline"
```

---

## Final Verification (run after all 10 tasks)

- [ ] **Step 1: No stale stage numbers anywhere in the skill directory**

```bash
grep -rn "Stage 0\b" skills/autonomous-feature-development/*.md
grep -rn "Step 0\.[0-9]" skills/autonomous-feature-development/*.md
grep -rn "Step 4\.[0-9]" skills/autonomous-feature-development/stage-impl.md skills/autonomous-feature-development/SKILL.md
```
Expected: no output from any of the three (an empty grep result — exit code
1 is fine, meaning no matches).

- [ ] **Step 2: Every stage file referenced from `SKILL.md` exists**

```bash
for f in stage-plan-gate.md stage-impl.md stage-verify.md stage-review-fix.md stage-e2e.md stage-final.md; do
  test -f "skills/autonomous-feature-development/$f" && echo "OK: $f" || echo "MISSING: $f"
done
```
Expected: six `OK:` lines, no `MISSING:` lines.

- [ ] **Step 3: Full read-through**

Read `SKILL.md`, `stage-plan-gate.md`, `stage-impl.md`, `stage-verify.md`,
`stage-review-fix.md`, `stage-e2e.md`, `stage-final.md`, and
`plan-quality-checklist.md` end to end in one pass and confirm: the stage
numbering is internally consistent (1→2+3→4+5→6→7), every cross-file
reference resolves to a real heading in the target file, and no task
mentions a variable (`<e2e_test_cmd>`, `e2e-state.json`,
`<spec-basename>-assumptions.md`, `<spec-basename>-e2e-test-plan.md`) that
isn't produced somewhere upstream of its first use.

- [ ] **Step 4: Commit (if Step 3 required fixes)**

```bash
git add skills/autonomous-feature-development/
git commit -m "fix(autonomous-feature-development): final consistency pass across renumbered pipeline"
```

If Step 3 required no fixes, skip this commit — nothing to add.
