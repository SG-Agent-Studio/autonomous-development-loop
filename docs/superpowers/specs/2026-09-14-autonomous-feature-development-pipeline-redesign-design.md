# Autonomous Feature Development — Pipeline Redesign

**Goal:** Add a pre-implementation plan-quality gate, simplify the parallel
implementation stage into a single implementer + faithfulness-verifier loop,
and add a post-review E2E test-writing stage — closing three gaps found in
production use of `autonomous-feature-development`.

**Architecture:** Three additions/changes to the existing 5-stage pipeline
(`skills/autonomous-feature-development/`), which becomes 7 stages. Two new
stage files, one new reference doc, two new durable per-spec artifacts, and
targeted edits to the existing stage files.

**Tech Stack:** Markdown skill/stage files (prompt engineering, not code) —
no runtime/library changes. Consumed by Claude Code via the `Skill` tool.

**Spec:** This document. No separate spec exists upstream — issues were
raised directly against the running pipeline and refined via a `/grilling`
session (see Decision Log).

## Problem Statement

1. **Issue 1 — No plan-quality gate.** The pipeline assumes `plan_path` is
   already at `superpowers:writing-plans` quality (bite-sized tasks, real
   code in every step, no placeholders). When it isn't, Stage 1 (now Stage 3)
   silently attempts to implement a vague task and produces poor results with
   no earlier catch.
2. **Issue 2 — Over-parallel implementation.** Stage 1 (now Stage 3) spawns
   one worktree agent per task, all in parallel. This is more machinery than
   the problem needs, and the task parser blindly treats every
   `### Task N:` heading as something to implement, even when a plan
   contains stray non-implementation tasks (e.g. "manually verify staging")
   that belong to a later stage.
3. **Issue 3 — No E2E coverage.** TDD (Stage 1/3) only ever produces unit
   tests. Nothing in the pipeline plans or writes end-to-end tests, even when
   the target codebase has E2E tooling configured and the spec describes
   browser-observable acceptance criteria.

## Architecture Overview

### Final stage numbering

| # | Stage | Status | File |
|---|-------|--------|------|
| 1 | Plan Detail Gate | **NEW** | `stage-plan-gate.md` (new) |
| 2 | Guard & Setup | was Stage 0 | `stage-impl.md` (edited) |
| 3 | Implementation | was Stage 1, **simplified** | `stage-impl.md` (edited) |
| 4 | Verify | was Stage 2 | `stage-verify.md` (minor edit) |
| 5 | Review | was Stage 3 | `stage-review-fix.md` (unchanged) |
| 6 | E2E Test Writing | **NEW** | `stage-e2e.md` (new) |
| 7 | Final Commit | was Stage 4 | `stage-final.md` (minor edit) |

`SKILL.md`'s stage table, Mode Selection, and Interaction Mode sections are
updated to reflect this numbering and the one new juncture (below).

### New Interaction Mode junctures

The existing 3 junctures (Stage 2 preflight fallback [was Stage 0], Stage 4
verify fallback [was Stage 2], Stage 7 commit [was Stage 4]) gain a new
**first** juncture:

4. **Stage 1 plan-gate ambiguity** — `autonomous`: assume + comment (written
   into the assumptions file, see below). `human-in-loop`: synchronous
   in-conversation clarification (no file-based pause — nothing state-bearing
   exists yet at Stage 1).

The two new capped loops introduced by Issues 2 and 3 (faithfulness-verifier
loops, cap 2 each) do **not** add junctures — they hard-stop uniformly
regardless of `interaction_mode`, consistent with the existing 3-attempt TDD
exhaustion and 5-iteration review-loop exhaustion behavior. Mode-branching in
this pipeline is reserved for "the run lacks a capability a human has," not
for "we tried and failed."

## Component Design

### Stage 1: Plan Detail Gate (NEW — `stage-plan-gate.md`)

Runs first, before Stage 2's guard/setup, so a malformed plan is caught
before a branch, worktree, or task file exists.

**Step 1.1 — Gate check.** A dedicated subagent reads `plan_path` and
`spec_path` and judges whether the plan is detailed enough to execute
directly, against a new self-contained reference doc,
`skills/autonomous-feature-development/plan-quality-checklist.md`. This
checklist is extracted from `superpowers:writing-plans`' quality bar so the
gate doesn't depend on invoking that external skill at runtime (subagents
are fresh and can't be relied on to resolve a named external skill; this
also survives `superpowers` being absent or changing internally):

- Required header sections present (Goal / Architecture / Tech Stack / Spec
  / Global Constraints).
- Every `### Task N:` has `Files` (Create/Modify/Test with exact paths) and
  `Interfaces` (Consumes/Produces with exact signatures).
- Every step shows real code/commands, not descriptions of what to do.
- None of the "No Placeholders" red flags appear: `TBD`, `TODO`, "implement
  later", "add appropriate error handling", "similar to Task N" without
  repeating the content, references to undefined types/functions.
- Task content is coherent with `spec_path` (not just structurally complete
  — semantically plausible).

Returns `{ "verdict": "sufficient" | "insufficient", "findings": [...] }`.

**Step 1.2 — Task classification** (runs as part of the same gate-check
pass). The subagent tags each `### Task N:` heading as `implementation` or
`non-implementation` (e.g. a stray "write E2E tests" or "manually verify
staging" task). Non-implementation task content is moved out of the numbered
list into a new `## Deferred to Verification` section near the end of the
plan document, for Stage 4's verifier to read as extra context. This applies
whether or not elaboration (below) is needed — even an already-detailed plan
can contain a misplaced task. Stage 3's parser is unchanged: it only ever
sees `### Task N:` headings, and after this step, only implementation tasks
remain among them.

**Step 1.3 — Elaboration** (only if `verdict == "insufficient"`). An
elaboration subagent rewrites `plan_path` **in place**, per task: each
`### Task N:` section's vague content is replaced with a fully-detailed one
(Files/Interfaces/bite-sized real-code steps), following the same
`plan-quality-checklist.md`. Exactly one heading per task number — no
duplication, no separate "elaborated" file. (Provenance of the original thin
plan is preserved by git history, since `plan_path` is expected to already
be a tracked file.)

Ambiguous decisions made during elaboration:
- `autonomous`: best-guess, and every guess is recorded as a bullet in a new
  standalone file, `<spec-basename>-assumptions.md`, saved **next to
  `spec_path`** (not under `.loop-logs/`, which is ephemeral and has its own
  cleanup skill — assumptions are durable project documentation).
- `human-in-loop`: the orchestrator asks synchronously in-conversation (e.g.
  via `AskUserQuestion`) and continues in the same turn.

**Step 1.4 — Review the elaborated plan** (only runs if Step 1.3 ran; a plan
that passed Step 1.1 as-is skips straight to Stage 2). A capped loop:

```
round = 0
LOOP:
  round += 1
  Spawn enhanced-review subagent against plan_path (target: Plan)
  If verdict == SHIP IT: exit LOOP → proceed to Stage 2
  If round == 3: hard-stop (uniform, both modes) → error log + wip commit
  Otherwise: elaboration subagent revises plan_path per the findings, GOTO LOOP
```

### Stage 2: Guard & Setup (was Stage 0 — `stage-impl.md`, edited)

Unchanged except one addition to Step 2.6 (was Step 0.6)'s command
resolution table: a new **optional** `<e2e_test_cmd>`, resolved in this
order:

1. An `E2E:` line in the `## Commands` section (CLAUDE.md/AGENTS.md).
2. Script-based project config — `package.json` scripts (`test:e2e`, `e2e`),
   `justfile`/`Makefile` targets of the same name.
3. **New:** direct framework-config detection — scan the repo root (and one
   level of common subdirs) for `playwright.config.{js,ts,mjs}`,
   `cypress.config.{js,ts}`, or a `cypress/`/`e2e/`/`tests/e2e/` directory.
   If found with no explicit script, infer the standard command
   (`npx playwright test` / `npx cypress run`).

If none resolve, `<e2e_test_cmd>` stays unresolved — this is **not** an
error (unlike `lint`/`test`); it just means Stage 6 will be skipped later.

### Stage 3: Implementation (was Stage 1, simplified — `stage-impl.md`, edited)

Replaces the "spawn one worktree agent per task, all in parallel" design
with:

**Step 3.1 — Single implementer.** One worktree is created for the whole
stage (`git worktree add .worktrees/impl -b worktree/impl`), not one per
task. One implementer subagent works through every remaining implementation
task **sequentially** inside it: TDD per task (write failing test, confirm
it fails, implement, `<lint_cmd>` + `<test_cmd>` green), committing after
each task, same 3-attempt-per-task retry and hard-stop behavior as today.

**Step 3.2 — Faithfulness verification.** After all tasks pass, before Stage
3 is considered complete, a separate **faithfulness verifier** subagent
reviews the cumulative worktree diff against `plan_path`:
- Was each task implemented as described (not partially, not differently)?
- Are the tests real assertions of behavior, not gutted/trivial/deleted?
- Is there scope creep — changes beyond what the tasks specify?

Returns `{ "verdict": "faithful" | "unfaithful", "findings": [...] }`.

**Step 3.3 — Fix loop on unfaithful verdict** (cap 2):

```
round = 0
LOOP:
  round += 1
  If round > 2: hard-stop (uniform, both modes) → error log + wip commit
  Spawn Opus planner subagent: deep-dive root cause of the faithfulness
    finding(s), then revise plan_path:
      - task-level root cause → append `#### Revision N` subsection inside
        the affected `### Task N:` block (root cause + revised steps)
      - architecture/plan-level root cause → append to a
        `## Plan Revision History` section, placed after `## Global
        Constraints` and before the first `### Task` (created if absent)
  Implementer subagent re-implements per the revised plan (same worktree)
  Faithfulness verifier re-checks
  If faithful: exit LOOP → proceed to squash-merge
  Otherwise: GOTO LOOP
```

On success, squash-merge the whole worktree as one operation (existing
squash-merge/worktree-sweep machinery from today's Stage 1 applies
unchanged, just running once instead of per-task).

### Stage 4: Verify (was Stage 2 — `stage-verify.md`, minor edit)

Unchanged mechanically. One addition: the verifier subagent additionally
reads the `## Deferred to Verification` section (written by Stage 1 Step
1.2, if present) as extra context — e.g. a plan's stray "manually verify
staging" task becomes something the verifier is aware of rather than
silently dropped.

### Stage 5: Review (was Stage 3 — `stage-review-fix.md`)

Unchanged.

### Stage 6: E2E Test Writing (NEW — `stage-e2e.md`)

Runs after Stage 5's capped verify↔review loop exits with zero actionable
issues, before Stage 7's final commit.

**Step 6.1 — Gate.** If `<e2e_test_cmd>` didn't resolve in Stage 2, skip
Stage 6 entirely (both interaction modes) — note "E2E: skipped, no E2E
tooling detected" in the Stage 7 summary. No scaffolding is invented for a
project with no E2E tooling.

**Step 6.2 — Scenario plan.** If `<e2e_test_cmd>` resolved: a subagent
derives E2E scenarios (happy path + edge cases) from `spec_path`'s
browser-observable acceptance criteria, and writes them to a new durable
file, `<spec-basename>-e2e-test-plan.md`, next to `spec_path` (same
convention as the Stage 1 assumptions file).

**Step 6.3 — Implement + verify loop**, identical shape to Stage 3's Step
3.2/3.3, applied to E2E tests instead of the feature plan:

```
One worktree for the whole stage.
Implementer subagent writes E2E test code per the scenario document,
  runs <e2e_test_cmd> until green.
Faithfulness verifier subagent checks:
  - every scenario in the document has corresponding test code
  - tests are real (not trivial/gutted)
  - independently re-runs <e2e_test_cmd> itself (doesn't trust the
    implementer's claim)
On failure (cap 2, uniform hard-stop on exhaustion):
  Opus planner subagent root-causes and revises the scenario document
    (<spec-basename>-e2e-test-plan.md), hands back to implementer.
On pass: squash-merge, proceed to Stage 7.
```

### Stage 7: Final Commit (was Stage 4 — `stage-final.md`, minor edit)

Unchanged except `summary.md` gains an "E2E" row (skipped / N scenarios
written and passing) and `decisions.md` consolidation additionally pulls
from Stage 1's assumptions file and Stage 3/6's `Revision N` /
`Plan Revision History` sections when present.

## Error Handling — Uniform Hard-Stop Inventory

| Cap | Count | Mode-branches? | On exhaustion |
|-----|-------|-----------------|----------------|
| Stage 1 plan-review loop | 3 | No | error log + wip commit |
| Stage 3 TDD per-task (existing) | 3 | No | error log + wip commit |
| Stage 3 faithfulness fix loop | 2 | No | error log + wip commit |
| Stage 4↔5 verify/review loop (existing) | 5 | No | error log + wip commit |
| Stage 6 E2E fix loop | 2 | No | error log + wip commit |

Mode-branching stays reserved for capability gaps (Stage 2 preflight,
Stage 4 blocked ACs, Stage 1 plan-gate ambiguity) — never for "attempted and
failed."

## New Artifacts Introduced

| Artifact | Location | Durable? | Written by |
|----------|----------|----------|------------|
| `plan-quality-checklist.md` | `skills/autonomous-feature-development/` | Yes (skill doc) | authored once, read by Stage 1 subagents |
| `stage-plan-gate.md` | `skills/autonomous-feature-development/` | Yes (skill doc) | Stage 1 procedure |
| `stage-e2e.md` | `skills/autonomous-feature-development/` | Yes (skill doc) | Stage 6 procedure |
| `<spec-basename>-assumptions.md` | next to `spec_path` | Yes | Stage 1 elaboration (autonomous mode) |
| `<spec-basename>-e2e-test-plan.md` | next to `spec_path` | Yes | Stage 6 |
| `## Plan Revision History` / `#### Revision N` | inside `plan_path` | Yes | Stage 3 Opus planner |

## Non-Goals / Explicit Scope Boundaries

- No changes to Stage 4/5's internal loop mechanics beyond consuming the new
  `## Deferred to Verification` section.
- No new `interaction_mode` junctures beyond the one at Stage 1.
- E2E framework detection covers Playwright and Cypress only — no
  speculative support for Selenium/WebdriverIO/Puppeteer.
- Stage 6 never invents E2E tooling for a project that has none.
- Stage 1's plan-quality checklist does not depend on invoking
  `superpowers:writing-plans` at runtime, even though `superpowers` remains
  a hard prerequisite of this skill for `finishing-a-development-branch`.

## Decision Log

Captured verbatim from the `/grilling` session that produced this design.

1. **Q: Where does the new plan-detail gate live?**
   A: New Stage 1, own file, all later stages renumbered +1.
   Reason: distinct responsibility from guard/setup; keeps each stage file
   single-purpose.

2. **Q: Who judges "detailed enough" — orchestrator regex or a subagent?**
   A: A dedicated subagent (judgment call).
   Reason: consistent with the pipeline's Hard Rule 6 (orchestrator never
   judges, only routes on structured subagent output); a regex/structural
   check misses semantic vagueness.

3. **Q: Where does the elaborated plan go — new file or overwrite?**
   A: (Superseded by Q6/Q7 below — settled on in-place edit.)

4. **Q: Should elaboration depend on invoking `superpowers:writing-plans`?**
   A: No — embed a self-contained checklist instead.
   Reason: decouples plan-quality judgment from an external skill's
   internals; matches how this pipeline already embeds TDD procedure
   inline rather than delegating to a named "TDD skill."

5. **Q: How are autonomous "best guess" decisions during elaboration
   recorded?**
   A: Standalone `<spec-basename>-assumptions.md`, next to `spec_path`, not
   under `.loop-logs/`.
   Reason: `.loop-logs/` is ephemeral (has its own cleanup skill);
   assumptions are durable project documentation.

6. **Q: Where should the elaborated plan itself live, given the assumptions
   decision?**
   A: Superseded — see Q7 (append into original plan file, not a new
   durable copy).

7. **Q: Mechanically, does "append" mean in-place per-task rewrite or
   literal end-of-file append?**
   A: In-place rewrite per task, one heading per task number.
   Reason: literal append breaks Stage 2's `### Task N:` parser; git
   history already gives the provenance a separate file would have
   provided.

8. **Q: Does `enhanced-review` run on every plan or only elaborated ones?**
   A: Only elaborated ones.
   Reason: a plan that already passed the gate cleared a judgment-based
   bar; reviewing it again is the over-engineering this whole change is
   trying to cut.

9. **Q: Plan-review loop cap and exhaustion behavior?**
   A: Capped revise-loop, cap 3, uniform hard-stop on exhaustion.
   Reason: consistency with the rest of the pipeline's revise-loop pattern;
   3 is lower than the 5-cap code loop since a plan needing more passes
   signals a spec problem, not a plan-writing problem.

10. **Q: Is the new "verify the changes" agent in the simplified Stage 3
    the same as the existing Stage 4 verifier, or new?**
    A: New — a distinct "faithfulness verifier," checking diff-vs-plan
    fidelity, separate from Stage 4's spec-AC verification.
    Reason: user's explicit clarification (Option B).

11. **Q: Worktree model for the single implementer?**
    A: One worktree for the whole stage, not one per task.
    Reason: preserves today's clean hard-stop/isolation behavior with far
    less ceremony than N worktrees.

12. **Q: Faithfulness-fail path — cap, and what happens on failure?**
    A: Capped loop, but instead of the same implementer retrying, an Opus
    planner subagent root-causes and revises the plan, then hands off to
    the implementer.
    Reason: user's explicit design — retrying with the same pressure that
    caused test-gutting/scope-creep is likely to reproduce a subtler
    version of the same violation; a planner stepping back to revise the
    plan addresses the actual cause.

13. **Q: Cap value and where revisions get written in the plan?**
    A: Cap 2. Task-level issues → `#### Revision N` inside the task;
    architecture/plan-level issues → separate `## Plan Revision History`
    section after Global Constraints, before Task 1.
    Reason: keeps task-scoped history local to the task; plan-wide issues
    need a place visible before any task is read.

14. **Q: Who classifies tasks by type (implementation vs other), and how
    does classification reach the right stage?**
    A: Stage 1 classifies during its pass, moving non-implementation task
    content into a `## Deferred to Verification` section; Stage 3's parser
    stays unchanged.
    Reason: Stage 1 already owns "is this plan well-formed" and already
    edits the document; pushing filtering into Stage 3 means every future
    consumer must remember a tagging convention, and misplaced content is
    silently useless rather than actively routed.

15. **Q: Does E2E test planning mean a written plan only, or implement +
    run?**
    A: Implement + run (Option B), not planning-only.
    Reason: user's explicit choice — the original phrasing "plan for e2e
    test cases" undersold the intended scope.

16. **Q: Placement of the E2E stage, and which loop pattern does it
    follow?**
    A: After the verify↔review loop fully clears, before final commit
    (new Stage 6, pushing final commit to Stage 7). Follows the Issue-2
    loop pattern (implementer + faithfulness verifier + Opus planner on
    failure, cap 2) — not the Issue-1 plan-review pattern.
    Reason: E2E test-writing is a "write and pass tests" problem, matching
    Stage 3's shape, not a "review a document" problem.

17. **Q: How is "E2E tooling configured" detected?**
    A: Extend Stage 2's command-resolution table with an optional
    `<e2e_test_cmd>`; unresolved → Stage 6 skipped entirely, uniformly
    across both interaction modes.
    Reason: matches how `format`/`start` are already optional-and-skipped
    in Step 0.6; no scaffolding invented for a project without E2E tooling.

18. **Q: Should detection also explore the repo directly, not just
    CLAUDE.md commands?**
    A: Yes — three-tier resolution: `## Commands` → script-based project
    config → direct framework-config detection (Playwright/Cypress config
    files or directories), inferring a default run command from the
    detected framework.
    Reason: user's explicit requirement — CLAUDE.md alone under-detects
    real E2E setups.

19. **Q: Does Stage 6 need its own "plan" document to anchor the
    faithfulness loop?**
    A: Yes — `<spec-basename>-e2e-test-plan.md`, written first (scenarios
    derived from spec ACs), next to the spec.
    Reason: completes the parallel with Stage 3 (`plan_path` as the
    anchor); gives the Opus planner something concrete to revise on
    failure; produces a durable test-coverage record as a side effect.

20. **Q: Do the two new caps (Stage 3, Stage 6) need `human-in-loop`
    escalation?**
    A: No — uniform hard-stop, no new junctures.
    Reason: mode-branching in this pipeline is reserved for missing
    capabilities, not for "we tried and failed" — consistent with existing
    3-attempt and 5-iteration exhaustion behavior.
