# Stage 4: Final Commit

## Step 4.1 — Final lint and format

```bash
<lint_cmd>    # must exit 0
<format_cmd>  # must exit 0 — skip if the project has no format command
```

If either fails, fix the issues before proceeding.

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

## Step 4.4 — Branch completion

Only runs when `interaction_mode == autonomous` (human-in-loop stopped at Step 4.3).

Run `superpowers:finishing-a-development-branch`. If the `superpowers` plugin is
not installed, stop here and tell the user to install it (see the plugin README) —
do not improvise branch completion.
