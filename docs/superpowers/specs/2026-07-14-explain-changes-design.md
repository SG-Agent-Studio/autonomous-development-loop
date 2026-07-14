# Explain Changes — Design

**Date:** 2026-07-14
**Status:** Approved

## Motivation

`docs/article-reference/finding-your-unknowns.md` (lines 173-198) argues that the highest-leverage post-implementation artifact is a combined **pitch/explainer + quiz**: a document that gives a reviewer the same context the implementer had, then tests whether they actually absorbed it before merging.

This repo's loop (`autonomous-feature-development`) produces plans, specs, logs, and code-review rounds, but nothing packages them into a single reviewer-facing artifact. A human reviewing a multi-file, multi-task autonomous run currently has to reconstruct intent and risk from raw diffs and scattered `.loop-logs/` files.

## Use cases

1. **Diff review** — after an implementation is done, generate an HTML report explaining the changes and the context behind them, ending in a self-check quiz. Triggered by a human standalone, by a human referencing a completed loop, or automatically at the end of a loop.
2. **Codebase explainer** — a human wants to understand an existing feature/module/mechanism/workflow, with no diff involved. Same pitch + quiz shape, but sourced from exploring the current code instead of a diff.

## Design

### 1. Skill identity and invocation

- Name: `explain-changes`, directory `skills/explain-changes/`.
- Model-invoked (keeps its `description`, no `disable-model-invocation`) — required because `autonomous-feature-development` must reach it by name from another skill, and a human should be able to trigger it by describing intent without knowing an exact command.

### 2. Mode detection and inputs

Mode is inferred from the request — no separate commands. If the request names a change/branch/diff (or the skill is auto-triggered), it's **diff-review mode**. If it names a feature/module/mechanism/workflow with no diff implied, it's **codebase-explainer mode**. Ask if genuinely ambiguous.

**Diff-review mode**, scope resolution by context:

| Trigger context | Diff scope | Extra inputs |
| --- | --- | --- |
| Auto-triggered from the loop (Section 6) | Whatever exists at `stage-final.md` Step 4.2 (committed history so far + unstaged changes) | `plan_path`, `spec_path`, `.loop-logs/<id>/logs/summary.md`, `.loop-logs/<id>/code-review/round-*.md`, `.loop-logs/<id>/error/*.md` (if any), `.loop-logs/<id>/logs/decisions.md` (Section 5) |
| Human references a completed loop, id not in conversation | Infer `id`: match current branch against every `.loop-logs/*/logs/summary.md` "Branch:" field, pick the most recent match, state which one was picked | Same as above |
| Human triggers standalone, no loop involved | Ask which comparison point to diff against (main / last commit / uncommitted) | None |

**Codebase-explainer mode:** no git inputs. The subagent explores the named area directly (relevant files/directories). If the area is too vague to scope, ask the human to narrow it rather than guessing across the whole repo.

### 3. Pipeline architecture

Single subagent call, orchestrator renders a fixed template — chosen over a two-stage gather→compose pipeline (extra hop, rarely justified for report-sized inputs) and over a subagent that writes the HTML itself (formatting would drift run to run):

1. Orchestrator resolves mode, inputs (Section 2), and output path (Section 4).
2. Orchestrator spawns one subagent with everything relevant for the resolved mode. The subagent returns **structured findings + drafted content**, not HTML:
   ```json
   {
     "summary": "...",
     "why": "...",
     "sections": [{ "heading": "...", "body": "...", "quiz": [{ "question": "...", "answer": "...", "explanation": "..." }] }],
     "risks_or_deferred": ["..."],
     "challenges_and_decisions": ["..."]
   }
   ```
3. Orchestrator fills `template.html` (Section 7) with that data and writes the report file. The template owns page structure, styling, and the quiz reveal mechanic — identical across every run regardless of what the subagent wrote.
4. Orchestrator reports the file path back (and, for auto-trigger, includes it in the loop's completion message).

Quiz depth scales to actual complexity — no fixed ceiling. For multi-file/multi-task changes, quiz questions are grouped under the same headings as their pitch section (one mini-quiz per module/task) rather than one long flat list, so a 20+ question quiz stays navigable. The quiz mechanic itself is static: `<details>`/`<summary>` reveal-on-click, no JS — works from a bare `file://` URL.

### 4. Output location and filename

| Trigger scenario | Output directory |
| --- | --- |
| Human triggers standalone (no loop mentioned) | `<PROJECT_ROOT>/temp/` |
| Human triggers referencing a completed loop | `.loop-logs/<TASK_ID>/reports/` |
| Auto-triggered at end of loop | `.loop-logs/<TASK_ID>/reports/` |

Filename: `<TIMESTAMP>-<MODE>-<SLUG>.html`, e.g. `2026-07-14T0930-diff-review-auth-refactor.html` — sorts chronologically in a directory listing. `<SLUG>` derives from branch name (diff-review) or the described area (explainer). Directories are created with `mkdir -p` if missing.

### 5. New consolidated decisions log in `autonomous-feature-development`

`log-schema.md` already captures per-attempt `### Key Decisions` and failed-attempt `Outcome: failed — <root cause>` inside `.loop-logs/<id>/logs/<task-id>.md`, and the review fix pipeline captures root-cause plans in `.loop-logs/<id>/code-review/round-<N>.md`. That data is real but scattered across N per-task files plus review rounds.

Add a **new orchestrator step in `stage-final.md`**, alongside Step 4.2 (same place `summary.md` is written, from the same source files already being read there): write `.loop-logs/<id>/logs/decisions.md`, consolidating:

- Per task: every `### Key Decisions` bullet from `.loop-logs/<id>/logs/<task-id>.md` (all attempts)
- Per task: root cause from any failed attempt, even if a later retry succeeded — a challenge faced, not just a decision
- From the review loop: each fixed issue's Phase 1 root-cause/plan from `.loop-logs/<id>/code-review/round-<N>.md`

This is a read-and-consolidate step with the same ownership model as `summary.md` (orchestrator-owned, written once, Stage 4 only). It requires **no change** to per-task agent instructions in `stage-impl.md` or to the fix pipeline in `stage-review-fix.md` — those already produce the source data.

`explain-changes` reads `.loop-logs/<id>/logs/decisions.md` directly as one input, instead of re-parsing every per-task log itself. If the file is absent (older runs predating this change, or Mode B runs with fewer per-task logs), the report's challenges/decisions section is simply omitted — no error.

### 6. Integration with `autonomous-feature-development`

- New step in `stage-final.md`, right after Step 4.2 (write summary, and now `decisions.md`) and before Step 4.3 (commit/handoff) — fires for both `interaction_mode` values, using whatever diff exists at that point.
- The orchestrator invokes `explain-changes` in diff-review mode, passing `id`, `plan_path`, `spec_path`, and the loop-logs paths from Section 2. Output goes to `.loop-logs/<id>/reports/`.
- Runs regardless of task outcome, including a partial/failed run (`wip:` commit path) — per-task failures are exactly the "left-over error" case this needs to surface, via `.loop-logs/<id>/error/*.md`.
- If `explain-changes` itself fails or a dependency is unavailable, this must not block the loop from finishing: log the failure and continue to Step 4.3. Report generation is a reviewer aid, not a pipeline gate.
- `autonomous-feature-development`'s Prerequisites section gains a new optional-dependency line for `explain-changes`, matching the existing `ponytail`-style "if absent, skip and proceed" pattern.

### 7. Report content

- Header: title, mode, date, and (diff-review) branch/task id or (explainer) area described.
- **Why** — intent/context: from plan/spec in diff-review mode, from what the human asked to understand in explainer mode.
- **What changed / how it works** — narrative sections, one per logical unit of change or per sub-area explored.
- **Challenges faced & decisions made** — from `.loop-logs/<id>/logs/decisions.md` (diff-review mode with a loop only; omitted otherwise).
- **Known risks / deferred items** — from code-review rounds' deferred-minor list and error logs, when present (diff-review only).
- **Quiz** — grouped under the same headings as above, `<details>`/`<summary>` reveal-on-click.

### 8. Skill file layout

```
skills/explain-changes/
  SKILL.md          — mode detection, input resolution, subagent dispatch steps
  template.html      — fixed HTML/CSS template incl. quiz reveal mechanic
  subagent-brief.md  — structured-output schema + instructions for the gather+draft subagent
```

### 9. Error handling and edge cases

| Case | Behaviour |
| --- | --- |
| Empty diff (diff-review mode, nothing changed) | Report says so plainly. No fabricated pitch/quiz. |
| Codebase area not found / too vague (explainer mode) | Ask the human to narrow it. |
| Subagent failure, standalone human invocation | Surface the error directly. No report produced. |
| Subagent failure, auto-triggered from the loop | Log and continue Step 4.3. Never blocks the loop. |
| `.loop-logs/<id>/logs/decisions.md` missing | Omit the challenges/decisions section. Not an error. |
| Ambiguous mode (request doesn't clearly imply diff-review or explainer) | Ask which mode was meant. |

## Scope of change

| File | Change |
| --- | --- |
| `skills/explain-changes/SKILL.md` | New. Mode detection, input resolution, subagent dispatch, template render, output-path resolution. |
| `skills/explain-changes/template.html` | New. Fixed HTML/CSS report template with the quiz reveal mechanic. |
| `skills/explain-changes/subagent-brief.md` | New. Structured-output schema and instructions for the gather+draft subagent. |
| `skills/autonomous-feature-development/stage-final.md` | New step alongside Step 4.2: write `.loop-logs/<id>/logs/decisions.md`. New step between 4.2 and 4.3: invoke `explain-changes` in diff-review mode; failure is non-blocking. |
| `skills/autonomous-feature-development/SKILL.md` | Prerequisites section gains an optional-dependency line for `explain-changes`. |
| `skills/autonomous-feature-development/log-schema.md` | No change — `### Key Decisions` and failed-attempt outcomes already exist and are the source data for `decisions.md`. |
| `CHANGELOG.md` | Entry |

## Verification

Static consistency check over the skill tree:

1. `skills/explain-changes/SKILL.md` names both modes and states the inference rule (diff/branch/change → diff-review; feature/module/mechanism/workflow → explainer).
2. Every diff-scope row in Section 2's table has a corresponding step in `SKILL.md`.
3. `stage-final.md` writes `decisions.md` before invoking `explain-changes`, and invokes `explain-changes` before Step 4.3 (commit/handoff) — ordering matters because the report should reflect the run's final state.
4. `stage-final.md`'s `explain-changes` invocation is wrapped so a failure there cannot prevent reaching Step 4.3 — read-through the file to confirm no unconditional `STOP` sits between them.
5. `SKILL.md`'s Prerequisites section lists `explain-changes` as optional, with explicit skip-on-absence wording, matching the `ponytail` pattern already there.
6. `template.html` contains no scripting — a grep for `<script` returns nothing, confirming the "static, `file://`-safe" requirement.
7. `subagent-brief.md`'s schema matches every field `SKILL.md` says it reads when rendering the template (no orphaned fields on either side).

A live dry-run (throwaway branch, a small multi-file change, run the loop end-to-end, confirm a report lands in `.loop-logs/<id>/reports/` and opens correctly from `file://`) remains available as follow-up behavioural evidence.

## Decisions

| Question | Decision | Reason |
| --- | --- | --- |
| Quiz in both modes, or diff-review only? | Both | Consistent pitch+quiz shape everywhere; codebase-explainer still benefits from a "did you actually absorb this" check. |
| Diff scope for standalone human invocation | Ask the human | Avoids guessing wrong on a repo with unusual branching; no diff-review context to infer from. |
| Mode selection mechanism | Infer from the request | One entry point, lowest cognitive load; ambiguity falls back to asking. |
| Auto-trigger inputs beyond the diff | Plan+spec, summary+code-review rounds, error logs | Gives the pitch real "why," not just "what," and surfaces partial/failed runs. |
| Quiz mechanic in a static HTML file | `<details>`/`<summary>` self-check, no JS | Zero dependencies, works from `file://`, no scoring logic to maintain or get wrong. |
| Delegate analysis to a subagent? | Yes | Keeps the main conversation's context small, especially at the end of an already-long loop. |
| Auto-trigger point in the loop | Right after Step 4.2 summary, before commit/handoff; same for both `interaction_mode` values | Runs regardless of commit outcome, satisfying "even if there is any left-over error." Human-in-loop still benefits — the human reviews unstaged changes, but a pitch+quiz is still useful context, not redundant. |
| Locating the right loop-logs dir when triggered standalone after a loop | Infer from current branch, then confirm | Low-friction, self-correcting if wrong. |
| Pipeline shape | One subagent (gather+draft), orchestrator renders template | Predictable formatting across every run; avoids the extra hop of a two-stage pipeline for report-sized inputs. |
| Skill name | `explain-changes` | User preference. |
| Quiz question ceiling | None — scales with complexity, grouped by section for large changes | A fixed low ceiling (e.g. 3-8) breaks down for 50+ file changes; grouping keeps a large quiz navigable. |
| Filename format | `<TIMESTAMP>-<MODE>-<SLUG>.html` | User preference; sorts chronologically by filename. |
| Source for "challenges faced and decisions made" | New consolidated `.loop-logs/<id>/logs/decisions.md`, written by the orchestrator at Stage 4 from existing per-task `### Key Decisions`/failed-outcome data and code-review root-causes | User preference for a single consolidated artifact over having `explain-changes` re-parse N scattered per-task logs itself. Zero change to per-task agent instructions since the source data already exists. |
