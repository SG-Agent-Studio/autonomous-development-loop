# Stage 4: Final Commit

## Step 4.1 — Final lint and format

```bash
just lint    # must exit 0
just format  # must exit 0
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

## Step 4.3 — Commit

Stage everything: `git add -A`

**If all tasks completed successfully:**

```bash
git commit -m "feat(<scope>): <description derived from plan Goal line>"
```

**If any tasks failed (partial):**

```bash
git commit -m "wip: partial — <completed>/<total> tasks completed

Failed tasks:
<task-id-1>: see .loop-logs/<id>/error/<task-id-1>.md"
```

## Step 4.4 — Branch completion

Run `superpowers:finishing-a-development-branch`. If the `superpowers` plugin is
not installed, stop here and tell the user to install it (see the plugin README) —
do not improvise branch completion.
