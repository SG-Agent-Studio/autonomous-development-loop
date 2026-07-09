# Human-in-Loop Feature Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split feature development into a strict `autonomous-feature-development` engine and a new `human-in-loop-feature-development` wrapper, driven by one `interaction_mode` flag, so the pipeline degrades gracefully when `just`, Playwright MCP, or auto-commit are unavailable.

**Architecture:** The existing engine gains an `interaction_mode` variable (`autonomous` default | `human-in-loop`) that the orchestrator reads at exactly three junctures — Stage 0 preflight fallback, Stage 2 verify fallback, Stage 4 commit. A thin wrapper skill sets `interaction_mode = human-in-loop` and delegates to the engine (mirroring `/grill-me` → `/grilling`). Subagents never branch on the flag.

**Tech Stack:** Claude Code / Cursor skill files (Markdown `SKILL.md` + stage files). No code, no build. Skills are prose consumed by an orchestrating agent and its subagents.

## Global Constraints

- Every skill edit applies the **`writing-great-skills`** skill: predictability, information hierarchy, single source of truth, checkable completion criteria, aggressive pruning of no-ops. (Invoke `/writing-great-skills` before editing.)
- The interaction flag is named **`interaction_mode`** with values `autonomous` (default) and `human-in-loop` — deliberately distinct from the existing **Mode A / Mode B** pipeline selection, to avoid the word "mode" colliding.
- Skills are prose — there are **no unit tests** and the repo has no lint/test scripts. Each task's verification is: (a) read-back against explicit criteria, and (b) a scenario walk-through tracing what the orchestrator would do (spec §8). A live end-to-end run against a sandbox repo is the final user acceptance, out of this plan's per-task loop.
- Resolved command variables used across stages: `<lint_cmd>`, `<test_cmd>`, `<format_cmd>`, `<start_cmd>`.
- Do not weaken any existing Hard Rule except where a task explicitly scopes it to `interaction_mode == autonomous`.
- Commit after each task with a conventional-commit message.
- Spec of record: `docs/superpowers/specs/2026-07-09-human-in-loop-feature-development-design.md`.

---

### Task 1: Introduce `interaction_mode` in the engine SKILL.md

**Files:**
- Modify: `skills/autonomous-feature-development/SKILL.md`

**Interfaces:**
- Produces: the `interaction_mode` variable (`autonomous` default | `human-in-loop`) and the "three orchestrator junctures" contract that Tasks 2–5 rely on. Produces the rule that **subagents never branch on `interaction_mode`**.

- [ ] **Step 1: Invoke `/writing-great-skills`** to load the skill-editing principles before editing.

- [ ] **Step 2: Add an "Interaction Mode" section.** Insert immediately after the `## Mode Selection` section:

```markdown
## Interaction Mode

`interaction_mode` controls how the orchestrator handles missing capabilities and
human handoffs. It is distinct from the Mode A / Mode B pipeline selection above.

- `autonomous` (default) — assumed unless the invoking skill sets otherwise. Fail
  fast: a missing capability is a hard-stop error. Never pause, never ask.
- `human-in-loop` — set only by the `human-in-loop-feature-development` wrapper.
  Clarify with the human on a missing capability; pause and wait for input when
  human action is needed.

The orchestrator branches on `interaction_mode` at exactly three junctures:

1. **Stage 0 preflight fallback** — an unresolved command or absent Playwright MCP.
2. **Stage 2 verify fallback** — a UI acceptance criterion needs the browser but MCP is absent.
3. **Stage 4 commit** — auto-commit vs leave-unstaged handoff.

Everywhere else is identical across both values. **Subagents never branch on
`interaction_mode`** — they run to completion and cannot pause. They receive
concrete inputs (resolved commands, `mcp_available`) and keep assume-and-comment
behavior internally.
```

- [ ] **Step 3: Scope the "FULLY AUTONOMOUS" line** (currently `SKILL.md:50`). Replace:

```markdown
**FULLY AUTONOMOUS.** Never pause. Never ask. If ambiguous → reasonable assumption + code comment.
```

with:

```markdown
**When `interaction_mode == autonomous`: FULLY AUTONOMOUS** — never pause, never
ask; if ambiguous → reasonable assumption + code comment. When `human-in-loop`,
the orchestrator may pause at the three junctures above; subagents remain autonomous.
```

- [ ] **Step 4: Scope Hard Rules 3 and 5.** Replace Hard Rule 3 (`Always commit at the end, even partial (wip: prefix if any task failed).`) with:

```markdown
3. `interaction_mode == autonomous`: always commit at the end, even partial (`wip:`
   prefix if any task failed). `human-in-loop`: never auto-commit — leave changes
   unstaged on the branch for the human (see `stage-final.md`).
```

Replace Hard Rule 5 (`Ambiguous? → assume + comment, never stall.`) with:

```markdown
5. Ambiguous? Subagents always assume + comment, never stall. The orchestrator does
   likewise when `interaction_mode == autonomous`; when `human-in-loop`, it clarifies
   at the three junctures instead.
```

- [ ] **Step 5: Update Prerequisites for MCP.** In the `- **playwright MCP**` bullet, replace `(required for UI work)` behavior with:

```markdown
- **playwright MCP** — required for UI verification when `interaction_mode ==
  autonomous` (bundled in this plugin's `.mcp.json`). When `human-in-loop`, MCP is
  optional: if absent, UI verification degrades to a human checklist handoff (see
  `stage-verify.md`).
```

- [ ] **Step 6: Verify (read-back).** Confirm: (a) `interaction_mode` default is `autonomous`; (b) the three junctures are listed; (c) the "subagents never branch" rule is present; (d) Hard Rules 3 and 5 and the FULLY AUTONOMOUS line are scoped, not deleted; (e) no other stage content changed. Run the `writing-great-skills` no-op test on each new sentence.

- [ ] **Step 7: Commit**

```bash
git add skills/autonomous-feature-development/SKILL.md
git commit -m "feat(autonomous-dev): add interaction_mode flag and scope autonomous-only rules"
```

---

### Task 2: Issue 1 — resolve commands, remove all `just`

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md` (Stage 0 + TDD loop `:184-185` + reproduction block `:237-238`)
- Modify: `skills/autonomous-feature-development/stage-review-fix.md` (`:136-137`, `:140`)
- Modify: `skills/autonomous-feature-development/stage-final.md` (`:6-7`)
- Modify: `skills/verifying-implementation/tier-3-procedure.md` (`:15`)
- Modify: `skills/verifying-implementation/subagent-template.md` (`:81`)

**Interfaces:**
- Consumes: `interaction_mode` (Task 1).
- Produces: Stage 0 Step 0.6 that resolves `<lint_cmd>`/`<test_cmd>`/`<format_cmd>`/`<start_cmd>` and injects them into subagent prompts; the `## Commands` memory-file format.

- [ ] **Step 1: Invoke `/writing-great-skills`.**

- [ ] **Step 2: Add Stage 0 command resolution.** In `stage-impl.md`, add a new step after `Step 0.5 — Initialize task files`:

````markdown
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
````

- [ ] **Step 3: Replace `just` in `stage-impl.md`.** At the TDD loop (`:184-185`):

```markdown
   - `<lint_cmd>` — must exit 0
   - `<test_cmd>` — must exit 0
```

At the Hard Stop reproduction block (`:237-238`):

```markdown
cd <worktree path>
<lint_cmd>
<test_cmd>
```

Add one clarifying line at first use of a command variable in this file: `` `<lint_cmd>`/`<test_cmd>` = the commands injected by the orchestrator in Step 0.6. ``

- [ ] **Step 4: Replace `just` in `stage-review-fix.md`.** Phase 3 (`:136-137`): `then `<lint_cmd>` and `<test_cmd>` both exit 0`. Phase 5 (`:140`): `` `<lint_cmd>` + `<test_cmd>` one final time ``.

- [ ] **Step 5: Replace `just` in `stage-final.md` Step 4.1:**

```markdown
```bash
<lint_cmd>    # must exit 0
<format_cmd>  # must exit 0 — skip if the project has no format command
```
```

- [ ] **Step 6: Genericize the verify examples.** In `tier-3-procedure.md:15`, change `(e.g., `just up-capstone`, `docker compose up`, `npm run dev`)` to `(the resolved `<start_cmd>` — e.g. `docker compose up`, `npm run dev`)`. In `subagent-template.md:81`, change `` `just up-capstone`. Wait for... `` to `` `<start_cmd>`. Wait for... ``.

- [ ] **Step 7: Confirm no `just` remains.** Run: `grep -rn "\bjust \(lint\|test\|format\|up-\)" skills/` → expect no matches. (The word "just" as English prose in other skills is fine.)

- [ ] **Step 8: Scenario walk-through (spec §8).** Trace Step 0.6 against three repos: (a) memory `## Commands` present → resolved from source 1; (b) only `package.json` scripts → resolved from source 2, not written back; (c) nothing → autonomous hard-stops listing lint+test, human-in-loop asks and writes `## Commands` to `CLAUDE.md`. Confirm the prose produces each outcome.

- [ ] **Step 9: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md skills/autonomous-feature-development/stage-review-fix.md skills/autonomous-feature-development/stage-final.md skills/verifying-implementation/tier-3-procedure.md skills/verifying-implementation/subagent-template.md
git commit -m "feat(autonomous-dev): resolve project commands instead of hardcoding just"
```

---

### Task 3: Issue 2 — MCP verification fallback

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md` (add Stage 0 Step 0.7)
- Modify: `skills/autonomous-feature-development/stage-verify.md` (verifier output + orchestrator handoff)

**Interfaces:**
- Consumes: `interaction_mode` (Task 1), `<start_cmd>` (Task 2).
- Produces: `mcp_available` (y/n) injected into the verifier prompt; the checklist artifact `.loop-logs/<id>/verifications/verification-<round>.md`; the extended verifier output schema with `needs_human`.

- [ ] **Step 1: Invoke `/writing-great-skills`.**

- [ ] **Step 2: Add Stage 0 verification-capability probe** to `stage-impl.md` after Step 0.6:

```markdown
### Step 0.7 — Probe verification capability (Mode A)

Check whether the bundled Playwright MCP tools are available → `mcp_available`
(y/n). Scan `spec_path` acceptance criteria for browser-observable behavior
(rendered pages, UI state, client-side interaction).

- A UI AC is present AND `mcp_available == n`:
  - `interaction_mode == autonomous`: **hard-stop**. Print
    `ERROR: UI acceptance criteria require Playwright MCP, which is unavailable.` and stop.
  - `interaction_mode == human-in-loop`: print a heads-up that UI verification will
    be handed to the human via a checklist, and continue.

Record `mcp_available` and inject it into the verifier subagent prompt. Mode B has
no `spec_path` — skip the AC-scan; the verify-time per-AC backstop below still applies.
```

- [ ] **Step 3: Extend the verifier subagent contract** in `stage-verify.md`. In the `## Verify (verifier subagent)` section, add before the return schema:

```markdown
The verifier receives `mcp_available`. For each AC: if it needs the browser and
`mcp_available == n`, do **not** attempt it — in `autonomous` mark it
`CANNOT-VERIFY` (→ overall fail); in `human-in-loop` add it to `needs_human` and do
not fail on it. Verify every other AC normally (curl / DB / logs / files / browser).
```

Replace the return schema with:

```json
{ "outcome": "pass" | "fail" | "needs_human", "failures": ["<root cause>", ...], "needs_human": ["<AC text>", ...] }
```

- [ ] **Step 4: Add the human-in-loop handoff branch.** After the `**If outcome == "pass"**` paragraph in `stage-verify.md`, add:

````markdown
**If `outcome == "needs_human"` (human-in-loop only):**

1. The orchestrator writes `.loop-logs/<id>/verifications/verification-<round>.md`
   (`<round>` = verify-round counter, incremented per verify):

   ```markdown
   # Verification Checklist — Round <round>

   **Spec:** <spec_path>
   **How to run:** `<start_cmd>` — wait for the ready signal, then verify each item.

   ## Auto-verified (reference)
   - [PASS|FAIL] <AC> — <evidence>

   ## Needs your verification
   - [ ] <AC text>
     - How to check: <smallest action>
     - Where to observe: <URL / screen / log>
     - Result: (pass / fail + notes)
   ```

2. Prompt the human: `Verification checklist ready at <path>. Verify each item and
   reply pass/fail + notes.` Then **end the turn** (the orchestrator pauses here).
3. On the human's reply, combine their per-item results with the auto-verified
   results. **Any FAIL** → treat as `outcome == "fail"` and run "Fix on failure"
   below. **All PASS** → proceed to the REVIEW step.
````

- [ ] **Step 5: Verify (read-back).** Confirm: autonomous still hard-stops on UI-AC + no MCP (preflight and per-AC backstop); human-in-loop writes the checklist, pauses, and routes FAIL→fix / PASS→review; the verifier never pauses (only the orchestrator does).

- [ ] **Step 6: Scenario walk-through (spec §8 MCP fallback).** Trace: MCP absent + UI AC → autonomous hard-stop; human-in-loop → `verification-1.md` written + pause; human reports one FAIL → enters "Fix on failure" ≤3 rounds → re-verify writes `verification-2.md`.

- [ ] **Step 7: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md skills/autonomous-feature-development/stage-verify.md
git commit -m "feat(autonomous-dev): MCP-absent verification handoff for human-in-loop"
```

---

### Task 4: Issue 3 — commit handoff + worktree cleanup

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md` (record `base_sha`; move worktree cleanup to a final sweep + gate)
- Modify: `skills/autonomous-feature-development/stage-final.md` (Step 4.3 commit vs handoff; Step 4.4 autonomous-only)

**Interfaces:**
- Consumes: `interaction_mode` (Task 1).
- Produces: `base_sha` recorded in Stage 0; the "Final worktree sweep" gate reused by `stage-final.md`.

- [ ] **Step 1: Invoke `/writing-great-skills`.**

- [ ] **Step 2: Record `base_sha`.** At the end of `stage-impl.md` Step 0.3 (Branch guard), add:

```markdown
Record `base_sha` = output of `git rev-parse HEAD` — the branch tip before any task
work. Used by the human-in-loop commit handoff (`stage-final.md` Step 4.3).
```

- [ ] **Step 3: Fix worktree cleanup.** In `stage-impl.md` `### Squash Merge (after ALL agents finish)`, change the completed-task block to merge + commit only (drop the inline `git worktree remove` / `git branch -D`), and replace the failed-task block + add a sweep:

````markdown
**For each task with `"status": "completed"`:**

```bash
git merge --squash worktree/<task-id>
git commit -m "feat(<scope>): <task description>"
```

**For each task with `"status": "failed"`:** do NOT merge. Log in
`.loop-logs/<id>/logs/summary.md`: `FAILED: <task-id> — see .loop-logs/<id>/error/<task-id>.md`.

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
````

- [ ] **Step 4: Verify the linear-history check still follows** the sweep in `stage-impl.md` (it reads `git log --oneline` — unaffected).

- [ ] **Step 5: Rewrite `stage-final.md` Step 4.3 as an interaction_mode branch.** Replace the entire `## Step 4.3 — Commit` section:

````markdown
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
```

Then stop.
````

- [ ] **Step 6: Scope Step 4.4** (`## Step 4.4 — Branch completion`) by adding a first line: `Only runs when `interaction_mode == autonomous` (human-in-loop stopped at Step 4.3).`

- [ ] **Step 7: Verify (read-back).** Confirm: sweep removes failed-task worktrees; the gate asserts `.worktrees/` is gone; human-in-loop reaches unstaged state via `git reset --mixed <base_sha>` and skips branch completion; autonomous behavior is byte-for-byte the prior behavior.

- [ ] **Step 8: Scenario walk-through (spec §8 commit + worktree).** Trace: 3 tasks, 1 failed → completed merged, failed worktree swept, gate passes; human-in-loop end state = `git status` all unstaged, no new commit, no `.worktrees/`.

- [ ] **Step 9: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md skills/autonomous-feature-development/stage-final.md
git commit -m "feat(autonomous-dev): unstaged commit handoff and robust worktree cleanup"
```

---

### Task 5: New `human-in-loop-feature-development` wrapper skill

**Files:**
- Create: `skills/human-in-loop-feature-development/SKILL.md`

**Interfaces:**
- Consumes: the engine's `interaction_mode` contract (Task 1) and the three junctures (Tasks 2–4).
- Produces: the user-facing entry point that sets `interaction_mode = human-in-loop`.

- [ ] **Step 1: Invoke `/writing-great-skills`.**

- [ ] **Step 2: Create the wrapper file** with exactly this content:

````markdown
---
name: human-in-loop-feature-development
description: Use for local, human-present feature development from a plan + spec (or review feedback) — the same pipeline as autonomous-feature-development, but it clarifies unresolved commands, hands off UI verification when Playwright MCP is unavailable, and leaves changes unstaged for the human to commit. Use when the user wants human-in-the-loop control, cannot auto-commit, or lacks `just`/MCP.
---

# Human-in-Loop Feature Development

Runs the same pipeline as `autonomous-feature-development`, with a human present:
the orchestrator clarifies instead of guessing, and pauses for human action at
capability gaps.

## Contract

Set `interaction_mode = human-in-loop`, then run `autonomous-feature-development`.
That engine owns every stage; this skill only sets the interaction contract. The
engine branches on `interaction_mode` at three orchestrator junctures:

1. **Unresolved command** (Stage 0) — ask the user, persist to `CLAUDE.md`, continue.
2. **Playwright MCP unavailable for a UI acceptance criterion** (Stage 2) — write a
   checklist to `.loop-logs/<id>/verifications/verification-<round>.md`, pause, let
   the human verify, and feed the results back into the fix loop.
3. **Commit** (Stage 4) — never auto-commit. Leave all changes unstaged on the
   branch and prompt the human to review + commit.

Clarify with the human on ambiguity at these junctures; pause and wait when human
action is needed. Subagents stay autonomous.

## Run

Invoke `autonomous-feature-development` with `interaction_mode = human-in-loop`.
````

- [ ] **Step 3: Verify (read-back).** Confirm the description front-loads its leading word and lists distinct trigger branches (human-in-loop control / no auto-commit / missing `just`/MCP); the body is a thin contract that delegates — no duplicated stage logic (single source of truth is the engine). Run the no-op test per sentence.

- [ ] **Step 4: Commit**

```bash
git add skills/human-in-loop-feature-development/SKILL.md
git commit -m "feat: add human-in-loop-feature-development wrapper skill"
```

---

### Task 6: Documentation sync

**Files:**
- Modify: `README.md` (Skills table + any "three skills" count)
- Modify: `docs/architecture/002-skills.md` (skill overview + `interaction_mode` + fallbacks)
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the finished skills from Tasks 1–5.

- [ ] **Step 1: Read the current docs** to match their format:

```bash
sed -n '18,30p' README.md
sed -n '1,40p' docs/architecture/002-skills.md
sed -n '1,20p' CHANGELOG.md
```

- [ ] **Step 2: Add the wrapper to the README Skills table.** Add a row after the `autonomous-feature-development` row:

```markdown
| `human-in-loop-feature-development` | You are developing locally with a human present and want the pipeline to clarify unresolved commands, hand off UI verification when Playwright MCP is unavailable, and leave changes unstaged for you to commit. |
```

Update any hardcoded skill count (e.g. "the three skills") to reflect the new skill.

- [ ] **Step 3: Update `docs/architecture/002-skills.md`** — add `human-in-loop-feature-development` to the skill overview and dependency graph, and document the `interaction_mode` flag with its three junctures and fallbacks. Match the file's existing heading structure (read in Step 1; do not invent a new format).

- [ ] **Step 4: Add a CHANGELOG entry** under the top/unreleased section, matching the existing bullet style:

```markdown
- Add `human-in-loop-feature-development` skill and `interaction_mode` flag: resolve project commands instead of requiring `just`, hand off UI verification when Playwright MCP is unavailable, and leave changes unstaged (with robust worktree cleanup) for manual commit.
```

- [ ] **Step 5: Verify (read-back).** Confirm the README table renders, the architecture doc describes all three fallbacks, and no doc still claims `just` is required or that there are only three skills.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/architecture/002-skills.md CHANGELOG.md
git commit -m "docs: document human-in-loop skill and interaction_mode"
```

---

## Self-Review

**1. Spec coverage:**
- §2 two-skill split + `interaction_mode` → Task 1 (flag) + Task 5 (wrapper). ✓
- §3 Issue 1 command resolution + kill `just` → Task 2. ✓
- §4 Issue 2 two-layer MCP detection + checklist handoff → Task 3. ✓
- §5 Issue 3 unstaged handoff + worktree sweep → Task 4. ✓
- §6 files touched → Tasks 1–5 cover every listed file; Task 6 adds the doc sync implied by a new skill. ✓
- §2 Mode A/B applicability → Task 2 (commands both modes), Task 3 (AC-scan Mode A only, backstop both), Task 4 (commit handoff both). ✓

**2. Placeholder scan:** No "TBD/TODO/handle edge cases". Concrete prose blocks given for every substantial edit; mechanical `just` edits list exact lines. The only intentional literal placeholders are the `<lint_cmd>`-style command variables, defined in Task 2 Step 2 and injected at runtime — not plan gaps.

**3. Type/name consistency:** `interaction_mode` (values `autonomous`/`human-in-loop`), `<lint_cmd>`/`<test_cmd>`/`<format_cmd>`/`<start_cmd>`, `mcp_available`, `base_sha`, and `.loop-logs/<id>/verifications/verification-<round>.md` are used identically across Tasks 1–6.

**Note on verification honesty:** these are prose-skill edits with no automated test harness. Per-task verification is read-back + scenario walk-through; the true end-to-end acceptance is a live run of `human-in-loop-feature-development` against a sandbox repo, which the user runs after the plan completes.
