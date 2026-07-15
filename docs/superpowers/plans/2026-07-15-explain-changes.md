# Explain Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `explain-changes` skill that generates a self-contained HTML pitch-and-quiz report (diff-review or codebase-explainer mode), plus a consolidated `decisions.md` log and one non-blocking integration point in `autonomous-feature-development`.

**Architecture:** One model-invoked skill (`skills/explain-changes/`) with a single-subagent-gather-then-orchestrator-renders pipeline: the orchestrator resolves mode/inputs/output path, spawns one subagent that returns structured JSON findings, then fills a fixed HTML template and writes the file. `autonomous-feature-development` gains one new Stage 4 sub-step that writes a consolidated decisions log from existing per-task data, then calls `explain-changes`.

**Tech Stack:** Markdown skill files (Claude Code skill format), a static HTML/CSS template (no JS), bash/git for diff and file resolution. No application code, no test framework.

## Global Constraints

- **No TDD.** This is a skill/prompt-authoring task, not code with automated tests — per explicit user instruction. Every task's "verification" step is a `grep`/structural check with an exact expected output, not a test run.
- Quiz mechanic must be static HTML (`<details>`/`<summary>`), zero `<script>` tags — must render correctly from a bare `file://` URL.
- Report generation must never block the `autonomous-feature-development` pipeline: a failure in `explain-changes` is logged and swallowed at the call site in `stage-final.md`.
- Skill name is `explain-changes` (user-specified), directory `skills/explain-changes/`.
- Output filename format is exactly `<TIMESTAMP>-<MODE>-<SLUG>.html` (UTC timestamp `YYYY-MM-DDTHHMM`).
- Spec of record: `docs/superpowers/specs/2026-07-14-explain-changes-design.md`.

---

### Task 1: `subagent-brief.md` — structured-output contract for the gather+draft subagent

**Files:**
- Create: `skills/explain-changes/subagent-brief.md`

**Interfaces:**
- Produces: the JSON schema (`mode`, `title`, `context_label`, `empty_diff`, `summary`, `why`, `sections[].heading/body/quiz[].question/answer/explanation`, `risks_or_deferred[]`, `challenges_and_decisions[]`) that Task 3's `SKILL.md` parses and Task 2's `template.html` placeholders map onto.

- [ ] **Step 1: Create the file**

```markdown
# Explain Changes — Subagent Brief

Read this file, then produce the structured findings + drafted content described
below. Do not write any files — return your findings only.

## Your task

You are given one of two contexts:

- **diff-review**: a diff plus supporting context (plan, spec, prior loop logs).
  Explain what changed and why, in language a code reviewer can use to build real
  understanding before merging.
- **explainer**: a named feature/module/mechanism/workflow, with no diff. Explore
  the relevant code yourself and explain how it works.

Whichever context you're given, produce:

1. A short narrative explanation — the "why" before the "what," then the "what,"
   broken into logical sections (one per task/module/sub-area, not one per file).
2. For **diff-review only**, when the input includes it: a "challenges and
   decisions" list, and a "risks / deferred" list.
3. A self-check quiz **grouped under the same headings as your narrative
   sections** — enough questions to actually test whether the reader understood
   that section, with no fixed cap. A one-line fix needs one or two questions; a
   50-file change needs a quiz section per major area, not one flat list.

Write for a reviewer who has not read the diff yet. Explain intent, not just
mechanics — "what problem this solves," "why this approach over the obvious
alternative," not just "renamed X to Y."

## Output format

Return **only** the JSON object below, inside a single fenced ` ```json ` code
block, as your final message. No prose outside the block.

```json
{
  "mode": "diff-review | explainer",
  "title": "short human-readable title",
  "context_label": "branch/task id (diff-review) or the area described (explainer)",
  "empty_diff": false,
  "summary": "2-3 sentence overview",
  "why": "the intent/context behind this change or area — 1-3 short paragraphs",
  "sections": [
    {
      "heading": "section heading",
      "body": "narrative explanation for this section, plain prose, may use short paragraphs separated by a blank line",
      "quiz": [
        {
          "question": "a question that tests understanding of this section",
          "answer": "the correct answer, one line",
          "explanation": "why that's the answer, referencing the specific code/behavior"
        }
      ]
    }
  ],
  "risks_or_deferred": ["one line per known risk or deferred item — omit/empty for explainer mode"],
  "challenges_and_decisions": ["one line per notable challenge faced or decision made — omit/empty for explainer mode, or when no loop-logs decisions were supplied"]
}
```

## Field rules

- `mode`, `title`, `context_label`, `summary`, `why`, `sections` are always required.
- `sections` must have at least one entry, and every section's `quiz` must have at
  least one question — a section with nothing to ask about should be merged into
  its neighbor instead of left with an empty quiz.
- `risks_or_deferred` and `challenges_and_decisions`: return `[]` when the input
  you were given has nothing for that field (e.g. explainer mode, or a loop run
  with no deferred issues) — do not invent content to fill them.
- `empty_diff`: set `true` only when you were explicitly told the diff is empty;
  when true, every other field may be minimal (e.g. one section explaining that
  nothing changed).
```

- [ ] **Step 2: Verify**

Run: `grep -c '"mode"\|"sections"\|"risks_or_deferred"\|"challenges_and_decisions"' skills/explain-changes/subagent-brief.md`
Expected: `4` (each schema field name appears at least once)

Run: `grep -c '```json' skills/explain-changes/subagent-brief.md`
Expected: `1` (exactly one fenced JSON schema block)

- [ ] **Step 3: Commit**

```bash
git add skills/explain-changes/subagent-brief.md
git commit -m "feat: add explain-changes subagent-brief schema"
```

---

### Task 2: `template.html` — static HTML/CSS report template

**Files:**
- Create: `skills/explain-changes/template.html`

**Interfaces:**
- Consumes: nothing (static file).
- Produces: placeholder tokens (`{{TITLE}}`, `{{MODE_LABEL}}`, `{{CONTEXT_LABEL}}`, `{{DATE}}`, `{{SUMMARY}}`, `{{WHY}}`, `{{SECTION_HEADING}}`, `{{SECTION_BODY}}`, `{{QUIZ_QUESTION}}`, `{{QUIZ_ANSWER}}`, `{{QUIZ_EXPLANATION}}`, `{{CHALLENGE_TEXT}}`, `{{RISK_TEXT}}`) and repeat-block markers (`SECTION`, `QUIZ_ITEM`, `CHALLENGES`, `RISKS`) that Task 3's `SKILL.md` Step 5 fills in and duplicates.

- [ ] **Step 1: Create the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{{TITLE}}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 780px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
  header { border-bottom: 2px solid #ccc; margin-bottom: 1.5rem; padding-bottom: 1rem; }
  .badge { display: inline-block; background: #eee; border-radius: 4px; padding: 0.15rem 0.5rem; font-size: 0.85rem; margin-right: 0.5rem; }
  section.area { margin: 2rem 0; padding-top: 1rem; border-top: 1px solid #ddd; }
  .quiz { background: #f7f7f7; border-radius: 6px; padding: 1rem; margin-top: 1rem; }
  .quiz details { margin: 0.75rem 0; }
  .quiz summary { cursor: pointer; font-weight: 600; }
  .quiz .answer { margin-top: 0.5rem; padding: 0.5rem 0.75rem; background: #fff; border-left: 3px solid #888; }
  ul.plain li { margin-bottom: 0.5rem; }
</style>
</head>
<body>

<header>
  <span class="badge">{{MODE_LABEL}}</span>
  <span class="badge">{{CONTEXT_LABEL}}</span>
  <span class="badge">{{DATE}}</span>
  <h1>{{TITLE}}</h1>
  <p>{{SUMMARY}}</p>
</header>

<section>
  <h2>Why</h2>
  <p>{{WHY}}</p>
</section>

<!-- SECTION:BEGIN — duplicate this whole <section class="area"> block once per entry in sections[] -->
<section class="area">
  <h2>{{SECTION_HEADING}}</h2>
  <p>{{SECTION_BODY}}</p>

  <div class="quiz">
    <h3>Self-check</h3>
    <!-- QUIZ_ITEM:BEGIN — duplicate this <details> block once per quiz item in this section -->
    <details>
      <summary>{{QUIZ_QUESTION}}</summary>
      <div class="answer"><strong>{{QUIZ_ANSWER}}</strong><br>{{QUIZ_EXPLANATION}}</div>
    </details>
    <!-- QUIZ_ITEM:END -->
  </div>
</section>
<!-- SECTION:END -->

<!-- CHALLENGES:BEGIN — include this whole <section> only if challenges_and_decisions is non-empty -->
<section>
  <h2>Challenges &amp; decisions</h2>
  <ul class="plain">
    <!-- CHALLENGE_ITEM:BEGIN — duplicate this <li> once per entry -->
    <li>{{CHALLENGE_TEXT}}</li>
    <!-- CHALLENGE_ITEM:END -->
  </ul>
</section>
<!-- CHALLENGES:END -->

<!-- RISKS:BEGIN — include this whole <section> only if risks_or_deferred is non-empty -->
<section>
  <h2>Known risks &amp; deferred items</h2>
  <ul class="plain">
    <!-- RISK_ITEM:BEGIN — duplicate this <li> once per entry -->
    <li>{{RISK_TEXT}}</li>
    <!-- RISK_ITEM:END -->
  </ul>
</section>
<!-- RISKS:END -->

</body>
</html>
```

- [ ] **Step 2: Verify**

Run: `grep -c '<script' skills/explain-changes/template.html`
Expected: `0` (no JS — must render from a bare `file://` URL)

Run: `grep -c '{{TITLE}}\|{{SECTION_HEADING}}\|{{QUIZ_QUESTION}}' skills/explain-changes/template.html`
Expected: `3`

- [ ] **Step 3: Commit**

```bash
git add skills/explain-changes/template.html
git commit -m "feat: add explain-changes static HTML template"
```

---

### Task 3: `SKILL.md` — mode detection, input/output resolution, subagent dispatch, render

**Files:**
- Create: `skills/explain-changes/SKILL.md`

**Interfaces:**
- Consumes: `subagent-brief.md`'s JSON schema field names (Task 1), `template.html`'s placeholder/marker names (Task 2). Also consumes, when invoked by `autonomous-feature-development`: `id`, `plan_path`, `spec_path`, `base_sha` (recorded in `stage-impl.md` Step 0.3), and the paths `.loop-logs/<id>/logs/summary.md`, `.loop-logs/<id>/logs/decisions.md`, `.loop-logs/<id>/code-review/round-*.md`, `.loop-logs/<id>/error/*.md`.
- Produces: an HTML report file at a path it prints/returns, and — for the auto-triggered case — the single-line result `Report generated: <path>` or `explain-changes: report generation failed — <reason>`, which Task 4's `stage-final.md` step reads.

- [ ] **Step 1: Create the file**

```markdown
---
name: explain-changes
description: Use to generate a self-contained HTML report explaining a diff or an existing feature/module/mechanism/workflow, ending in a self-check quiz, so a reviewer builds real understanding before merging. Use when the user asks to explain, understand, or review changes/a diff/a branch, or to explain how a feature/module/mechanism/workflow works. Also invoked by autonomous-feature-development at the end of a loop.
---

# Explain Changes

Generates a static HTML pitch + self-check quiz report — either explaining a diff
and its context (**diff-review** mode) or an existing part of the codebase
(**explainer** mode).

## Step 1 — Resolve mode

- If invoked by `autonomous-feature-development` (the caller states this
  explicitly and supplies `id`, `plan_path`, `spec_path`, `base_sha`): mode is
  always **diff-review**. Skip to Step 2's "Auto-triggered" row.
- Otherwise, infer from the human's request:
  - Mentions a diff / branch / "changes" / "what I just built" → **diff-review**.
  - Names a feature / module / mechanism / workflow, with no diff implied →
    **explainer**.
  - Ambiguous → ask which was meant before proceeding.

## Step 2 — Resolve inputs

### diff-review mode

| Context | Diff scope | Extra inputs |
| --- | --- | --- |
| Auto-triggered from the loop | `git diff <base_sha> HEAD` (committed) plus `git diff` (uncommitted) | `plan_path`, `spec_path`, `.loop-logs/<id>/logs/summary.md`, `.loop-logs/<id>/code-review/round-*.md` (if any), `.loop-logs/<id>/error/*.md` (if any), `.loop-logs/<id>/logs/decisions.md` (if present) |
| Human references a completed loop, no id in conversation | Infer `id`: `grep -l "Branch: <current-branch>" .loop-logs/*/logs/summary.md`, take the most recently modified match, and tell the human which run was picked. Diff scope: `git diff "$(git merge-base <default-branch> HEAD)" HEAD` plus `git diff` (uncommitted) | Same set as above, read from the inferred `id` |
| Human triggers standalone, no loop involved | Ask: "against main, the last commit, or just uncommitted changes?" then diff accordingly | None |

Determine `<default-branch>` via `git symbolic-ref refs/remotes/origin/HEAD`
(fall back to `main` if that fails).

If the resulting diff is empty, set `empty_diff = true` and skip Step 4 (no
subagent needed) — the report will just say so.

### explainer mode

No git inputs. Confirm the named area resolves to actual files/directories in
this repo (a quick `grep`/`find` pass). If it's too broad or nothing matches, ask
the human to narrow it rather than guessing across the whole repo.

## Step 3 — Resolve output path

| Trigger | Output directory |
| --- | --- |
| Human triggers standalone (no loop mentioned) | `<repo-root>/temp/` |
| Human triggers referencing a completed loop | `.loop-logs/<id>/reports/` |
| Auto-triggered from the loop | `.loop-logs/<id>/reports/` |

`mkdir -p` the directory. Filename: `<TIMESTAMP>-<MODE>-<SLUG>.html`, where
`<TIMESTAMP>` is `date -u +%Y-%m-%dT%H%M` (UTC), `<MODE>` is `diff-review` or
`explainer`, and `<SLUG>` is the current branch name (diff-review) or a
kebab-case slug of the described area (explainer), each with any `/` replaced
by `-`.

## Step 4 — Spawn the gather + draft subagent

Skip this step if `empty_diff == true` (go straight to Step 5 with a minimal
payload: `sections` = one entry stating no changes were found,
`risks_or_deferred` = `[]`, `challenges_and_decisions` = `[]`).

Read `./subagent-brief.md`. Spawn one subagent whose prompt is: the full
contents of `subagent-brief.md`, followed by every input resolved in Step 2 (the
diff text, plan/spec sections, log file contents, or — for explainer mode — the
named area and an instruction to explore it directly).

Parse the subagent's final message for a single fenced ` ```json ` block
matching the schema in `subagent-brief.md`. If no valid JSON block is found, or
the subagent errored:

- Standalone human invocation: print the error and stop. Do not produce a report.
- Auto-triggered: print `explain-changes: report generation failed — <reason>`
  and return control to the caller. Do not raise a hard stop — the caller must be
  able to continue regardless (see the integration point in `stage-final.md`).

## Step 5 — Render the report

Read `./template.html`. Fill it using the JSON payload from Step 4:

- Replace `{{TITLE}}` with `title`, `{{MODE_LABEL}}` with `mode`,
  `{{CONTEXT_LABEL}}` with `context_label`, `{{SUMMARY}}` with `summary`, and
  `{{WHY}}` with `why` — all four taken directly from the JSON payload.
  `{{DATE}}` is not part of the JSON payload — fill it with today's date
  (`date -u +%Y-%m-%d`), generated locally at render time.
- For each entry in `sections`, duplicate the block between
  `<!-- SECTION:BEGIN -->` and `<!-- SECTION:END -->`, filling
  `{{SECTION_HEADING}}`/`{{SECTION_BODY}}`, and within it duplicate the block
  between `<!-- QUIZ_ITEM:BEGIN -->`/`<!-- QUIZ_ITEM:END -->` once per quiz
  question.
- If `challenges_and_decisions` is non-empty, keep the block between
  `<!-- CHALLENGES:BEGIN -->`/`<!-- CHALLENGES:END -->` and duplicate its `<li>`
  once per entry; otherwise delete that whole block. Same rule for
  `risks_or_deferred` and the `<!-- RISKS:BEGIN -->`/`<!-- RISKS:END -->` block.
- Remove every `<!-- ...:BEGIN -->` / `<!-- ...:END -->` marker comment from the
  final output — they exist only to mark the template's repeat boundaries.

Write the filled HTML to the path resolved in Step 3.

## Step 6 — Report back

- Standalone or loop-referencing invocation: print the file path.
- Auto-triggered: return `Report generated: <path>` (or the Step 4 failure line)
  to the caller — do not print anything else, the caller controls what the human
  sees.

## Error handling

| Case | Behavior |
| --- | --- |
| Empty diff (diff-review) | Report says so plainly (see Step 4). No fabricated content. |
| Explainer target not found / too vague | Ask the human to narrow it (Step 2). No report produced yet. |
| Subagent failure, standalone | Surface the error, stop. No report. |
| Subagent failure, auto-triggered | Log and return control — never blocks the caller (Step 4). |
| `.loop-logs/<id>/logs/decisions.md` missing | Omit `challenges_and_decisions` (empty array) — not an error. |
| Ambiguous mode | Ask which mode was meant (Step 1). |
```

- [ ] **Step 2: Verify**

Run: `grep -c '^## Step' skills/explain-changes/SKILL.md`
Expected: `6` (Steps 1–6 present)

Run: `grep -c 'diff-review\|explainer' skills/explain-changes/SKILL.md`
Expected output: a number greater than `0` (both modes are named in the file) — confirm by eye that both mode names appear in Step 1.

Run: `grep -c 'subagent-brief.md\|template.html' skills/explain-changes/SKILL.md`
Expected: `2` or more (both sibling files are referenced as context pointers)

- [ ] **Step 3: Commit**

```bash
git add skills/explain-changes/SKILL.md
git commit -m "feat: add explain-changes skill"
```

---

### Task 4: Integrate into `autonomous-feature-development` Stage 4

**Files:**
- Modify: `skills/autonomous-feature-development/stage-final.md:12` (insert new sections after Step 4.2, before the existing Step 4.3)

**Interfaces:**
- Consumes: Task 3's `SKILL.md` Step 2 "Auto-triggered" input contract (`id`, `plan_path`, `spec_path`, `base_sha`, and the loop-logs paths).
- Produces: `.loop-logs/<id>/logs/decisions.md` (new file, orchestrator-owned, written once at Stage 4 — same ownership model as `summary.md`).

- [ ] **Step 1: Insert the two new sub-steps**

In `skills/autonomous-feature-development/stage-final.md`, find this existing boundary:

```markdown
**Minor issues deferred (NOT handled yet):**
<list each deferred minor from the final review round, or "none">
```

## Step 4.3 — Commit or hand off
```

Replace it with (adds two new sections between the summary template and Step
4.3; the `## Step 4.3` line and everything after it is unchanged):

```markdown
**Minor issues deferred (NOT handled yet):**
<list each deferred minor from the final review round, or "none">
```

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

## Step 4.2b — Generate reviewer report

Invoke the `explain-changes` skill in diff-review mode, passing: `id`,
`plan_path`, `spec_path`, `base_sha` (recorded in `stage-impl.md` Step 0.3), and
the paths written above (`summary.md`, `decisions.md`, any
`code-review/round-*.md`, any `error/*.md`). Output goes to
`.loop-logs/<id>/reports/`.

This step must never block the pipeline: if `explain-changes` is unavailable,
errors, or does not produce a file, print one line noting the failure and
continue to Step 4.3 regardless.

## Step 4.3 — Commit or hand off
```

- [ ] **Step 2: Verify**

Run: `grep -c '^## Step 4\.' skills/autonomous-feature-development/stage-final.md`
Expected: `6` (4.1, 4.2, 4.2a, 4.2b, 4.3, 4.4)

Run: `grep -n 'explain-changes' skills/autonomous-feature-development/stage-final.md`
Expected output: at least one match, inside the Step 4.2b block, with the surrounding text stating the step "must never block the pipeline."

- [ ] **Step 3: Commit**

```bash
git add skills/autonomous-feature-development/stage-final.md
git commit -m "feat: write decisions log and invoke explain-changes at end of loop"
```

---

### Task 5: Declare `explain-changes` as an optional dependency

**Files:**
- Modify: `skills/autonomous-feature-development/SKILL.md:12-24` (Prerequisites section)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — documentation only.

- [ ] **Step 1: Add the new bullet**

In `skills/autonomous-feature-development/SKILL.md`, find:

```markdown
- **playwright MCP** — required for UI verification when `interaction_mode ==
  autonomous` (bundled in this plugin's `.mcp.json`). When `human-in-loop`, MCP is
  optional: if absent, UI verification degrades to a human checklist handoff (see
  `stage-verify.md`).
```

Replace it with:

```markdown
- **playwright MCP** — required for UI verification when `interaction_mode ==
  autonomous` (bundled in this plugin's `.mcp.json`). When `human-in-loop`, MCP is
  optional: if absent, UI verification degrades to a human checklist handoff (see
  `stage-verify.md`).
- **`explain-changes`** (optional) — generates a reviewer-facing HTML report at
  the end of Stage 4 (`stage-final.md` Step 4.2b). If absent, or if it fails,
  skip it and proceed to commit/handoff — report generation never blocks the
  pipeline.
```

- [ ] **Step 2: Verify**

Run: `grep -c 'explain-changes' skills/autonomous-feature-development/SKILL.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add skills/autonomous-feature-development/SKILL.md
git commit -m "docs: list explain-changes as an optional dependency"
```

---

### Task 6: Sync architecture docs and changelog

**Files:**
- Modify: `docs/architecture/002-skills.md` (Overview table, Dependency Graph, new `### explain-changes` section, Stage 4 description on the existing `stage-final.md` file-structure row)
- Modify: `CHANGELOG.md` (`## [Unreleased]` section)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — documentation only.

- [ ] **Step 1: Add a row to the Overview table**

In `docs/architecture/002-skills.md`, find:

```markdown
| `cleanup-loop-logs`              | `skills/cleanup-loop-logs/SKILL.md`              | Human-only purge of one run's `.loop-logs/<id>/` logs + orphaned worktrees/branches                   | Human-triggered only (`disable-model-invocation`); never invoked by the model                                     |
```

Add a new row directly after it:

```markdown
| `cleanup-loop-logs`              | `skills/cleanup-loop-logs/SKILL.md`              | Human-only purge of one run's `.loop-logs/<id>/` logs + orphaned worktrees/branches                   | Human-triggered only (`disable-model-invocation`); never invoked by the model                                     |
| `explain-changes`                | `skills/explain-changes/SKILL.md`                | Generates a static HTML pitch-and-quiz report explaining a diff or a codebase area, ending in a self-check quiz | Human asks to explain/understand/review a diff, branch, or feature/module/mechanism/workflow; also auto-invoked at the end of `autonomous-feature-development` |
```

- [ ] **Step 2: Add a node and edge to the Dependency Graph**

In the same file, find:

```markdown
    PW[playwright MCP\nbundled in .mcp.json]

    HIL -->|sets interaction_mode = human-in-loop| AFD
```

Replace with:

```markdown
    PW[playwright MCP\nbundled in .mcp.json]
    EC[explain-changes]

    HIL -->|sets interaction_mode = human-in-loop| AFD
```

Then find:

```markdown
    AFD -->|Stage 4 branch completion| SP
```

Replace with:

```markdown
    AFD -->|Stage 4 branch completion| SP
    AFD -->|Stage 4 reviewer report, non-blocking| EC
```

- [ ] **Step 3: Update the `stage-final.md` file-structure row**

In the same file, find:

```markdown
| `stage-final.md`      | Stage 4 (lint/format, summary with loop iterations + deferred minors, commit, branch completion)                        |
```

Replace with:

```markdown
| `stage-final.md`      | Stage 4 (lint/format, summary with loop iterations + deferred minors, decisions log, reviewer report, commit, branch completion) |
```

- [ ] **Step 4: Add a new `### explain-changes` section**

In the same file, after the existing `### cleanup-loop-logs` section (its
`**File structure:**` table is the last content in the file), append:

```markdown

### `explain-changes`

Generates a self-contained HTML report — a narrative explanation plus a
self-check quiz — either for a diff (**diff-review** mode) or an existing
codebase area (**explainer** mode). Model-invoked, and also called by
`autonomous-feature-development` at the end of Stage 4 (non-blocking).

**Flow:**

1. **Resolve mode** — inferred from the request, or fixed to diff-review when
   auto-triggered.
2. **Resolve inputs** — diff scope + plan/spec/logs for diff-review; a
   confirmed codebase area for explainer.
3. **Resolve output path** — `temp/` (standalone), or
   `.loop-logs/<id>/reports/` (loop-referencing or auto-triggered).
4. **Spawn one subagent** — gathers context and drafts structured findings +
   quiz content as JSON (skipped for an empty diff).
5. **Render** — fills `template.html` with the subagent's JSON and writes the
   report.

**File structure:**

| File                 | Purpose                                                        |
| -------------------- | --------------------------------------------------------------- |
| `SKILL.md`           | Mode/input/output resolution, subagent dispatch, render steps  |
| `template.html`      | Static HTML/CSS report template, no JS                         |
| `subagent-brief.md`  | JSON schema + instructions for the gather+draft subagent       |
```

- [ ] **Step 5: Add the CHANGELOG entry**

In `CHANGELOG.md`, find:

```markdown
## [Unreleased]

### Fixed
```

Replace with:

```markdown
## [Unreleased]

### Added

- `explain-changes` skill — generates a self-contained HTML pitch-and-quiz report explaining a diff (with plan/spec/loop-log context) or an existing codebase area, ending in a self-check quiz, so a reviewer builds real understanding before merging. Auto-invoked at the end of `autonomous-feature-development` (non-blocking).
- `autonomous-feature-development` now writes a consolidated `.loop-logs/<id>/logs/decisions.md` at Stage 4, aggregating each task's `### Key Decisions` and failed-attempt root causes plus fixed-issue root causes from the review loop.

### Fixed
```

- [ ] **Step 6: Verify**

Run: `grep -c 'explain-changes' docs/architecture/002-skills.md`
Expected output: a number `>= 5` (Overview row, graph node, graph edge, file-structure row, new section heading)

Run: `grep -c 'explain-changes' CHANGELOG.md`
Expected: `1` or more, inside the new `### Added` block under `## [Unreleased]`

- [ ] **Step 7: Commit**

```bash
git add docs/architecture/002-skills.md CHANGELOG.md
git commit -m "docs: document explain-changes in architecture reference and changelog"
```
