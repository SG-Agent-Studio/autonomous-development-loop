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
  always **diff-review**. Skip to Step 2's "Auto-triggered" row. (This
  auto-trigger only fires for runs that reach Stage 4 `stage-final.md`; Mode B
  runs that exit early via `superpowers:finishing-a-development-branch` never
  invoke this skill, by design.)
- Otherwise, infer from the human's request:
  - Mentions a diff / branch / "changes" / "what I just built" → **diff-review**.
  - Names a feature / module / mechanism / workflow, with no diff implied →
    **explainer**.
  - Ambiguous → ask which was meant before proceeding.

## Step 2 — Resolve inputs

### diff-review mode

| Context                                                  | Diff scope                                                                                                                                                                                                                                                          | Extra inputs                                                                                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-triggered from the loop                             | `git diff <base_sha> HEAD` (committed) plus `git diff` (uncommitted)                                                                                                                                                                                                | `plan_path`, `spec_path`, `.loop-logs/<id>/logs/summary.md`, `.loop-logs/<id>/code-review/round-*.md` (if any), `.loop-logs/<id>/error/*.md` (if any), `.loop-logs/<id>/logs/decisions.md` (if present) |
| Human references a completed loop, no id in conversation | Infer `id`: `grep -l "Branch:.*<current-branch>" .loop-logs/*/logs/summary.md`, take the most recently modified match, and tell the human which run was picked. Diff scope: `git diff "$(git merge-base <default-branch> HEAD)" HEAD` plus `git diff` (uncommitted) | Same set as above, read from the inferred `id`                                                                                                                                                          |
| Human triggers standalone, no loop involved              | Ask: "against main, the last commit, or just uncommitted changes?" then diff accordingly                                                                                                                                                                            | None                                                                                                                                                                                                    |

Determine `<default-branch>` via `git symbolic-ref refs/remotes/origin/HEAD`
(fall back to `main` if that fails).

If the resulting diff is empty, set `empty_diff = true` and skip Step 4 (no
subagent needed) — the report will just say so.

### explainer mode

No git inputs. Confirm the named area resolves to actual files/directories in
this repo (a quick `grep`/`find` pass). If it's too broad or nothing matches, ask
the human to narrow it rather than guessing across the whole repo.

## Step 3 — Resolve output path

| Trigger                                       | Output directory           |
| --------------------------------------------- | -------------------------- |
| Human triggers standalone (no loop mentioned) | `<repo-root>/temp/`        |
| Human triggers referencing a completed loop   | `.loop-logs/<id>/reports/` |
| Auto-triggered from the loop                  | `.loop-logs/<id>/reports/` |

`mkdir -p` the directory. Filename: `<TIMESTAMP>-<MODE>-<SLUG>.html`, where
`<TIMESTAMP>` is `date -u +%Y-%m-%dT%H%M` (UTC), `<MODE>` is `diff-review` or
`explainer`, and `<SLUG>` is the current branch name (diff-review) or a
kebab-case slug of the described area (explainer), each with any `/` replaced
by `-`.

## Step 4 — Spawn the gather + draft subagent

Skip this step if `empty_diff == true` (go straight to Step 5 with a minimal
payload: populate `title` (a concise label from the branch or described area),
`mode` (the mode resolved in Step 1), `context_label` (from Step 2), `summary`
("No changes were found"), `why` ("No modifications in the diff scope"),
`sections` (one entry stating no changes), `risks_or_deferred` (`[]`), and
`challenges_and_decisions` (`[]`)).

Read `./subagent-brief.md`. Spawn one subagent whose prompt is: the full
contents of `subagent-brief.md`, followed by every input resolved in Step 2 (the
diff text, plan/spec sections, log file contents, or — for explainer mode — the
named area and an instruction to explore it directly).

Parse the subagent's final message for a single fenced ` ```json ` block
matching the schema in `subagent-brief.md`. If no valid JSON block is found, or
the subagent errored:

- Standalone or loop-referencing human invocation: print the error and stop. Do
  not produce a report.
- Auto-triggered: print `explain-changes: report generation failed — <reason>`
  and return control to the caller. Do not raise a hard stop — the caller must be
  able to continue regardless (see the integration point in `stage-final.md`).

## Step 5 — Render the report

Read `./render-rules.md` and `./template.html`. Apply those rules to fill the template using the Step 4 payload. Write the result to the path resolved in Step 3.

## Step 6 — Report back

- Standalone or loop-referencing invocation: print the file path.
- Auto-triggered: return `Report generated: <path>` (or the Step 4 failure line)
  to the caller — do not print anything else, the caller controls what the human
  sees.

