---
name: cleanup-loop-logs
description: Human-triggered cleanup of one autonomous-development run — deletes its `.loop-logs/<id>/` logs and prunes orphaned worktrees/branches. Never invoked by the model.
disable-model-invocation: true
---

# Cleanup Loop Logs

Delete the logs for one autonomous-development run (`.loop-logs/<id>/`) and prune the
worktrees/branches that run left behind. **Human-triggered only** — `disable-model-invocation`
guarantees the orchestrator can never invoke this. Touches logs, worktrees, and
branches only — never product code.

## Step 1 — Select the target run

- If the user passed an `id`, use it.
- If the user passed a plan path, derive `id` = basename with `.md` stripped.
- If nothing was passed, list every run (newest first) and ask which to clean, or `all`:

```bash
for d in $(ls -1dt .loop-logs/*/ 2>/dev/null); do
  printf '%s\t%s\n' "$(du -sh "$d" | cut -f1)" "$d"
done
```

Present the list and wait for the user to pick an `id` (or `all`).

## Step 2 — Gather what will be deleted, then confirm

For the chosen `id` (repeat for each if `all`):

```bash
ID=<id>
echo "== Logs =="; ls -R ".loop-logs/$ID/" 2>/dev/null

# Task ids belonging to this run (drives precise worktree/branch attribution)
TASK_IDS=$(ls ".loop-logs/$ID/tasks/" 2>/dev/null | sed 's/\.json$//' | grep -v '^verification-state$')

echo "== Worktrees for this run =="
for t in $TASK_IDS; do
  git worktree list | grep -E "/.worktrees/($t|fix-)" || true
done
echo "== Branches for this run =="
for t in $TASK_IDS; do
  git branch --list "worktree/$t" "worktree/fix-*" | tr -d ' *' || true
done
```

Print the exact log tree, worktrees, and branches. Ask the user to confirm. Deletion
is irreversible — do NOT proceed without an explicit "yes". `worktree/fix-*` entries
cannot be attributed to a single run by name; list them and let the user confirm which
to prune.

## Step 3 — Prune orphaned worktrees and branches

After confirmation, for each worktree/branch the user approved:

```bash
git worktree remove "<.worktrees/path>" --force
git worktree prune
git branch -D "<branch-name>"
```

## Step 4 — Delete the logs (last, so task ids stayed available in Step 2/3)

```bash
rm -rf ".loop-logs/$ID/"
```

Report exactly what was deleted (logs path, worktrees, branches).
