---
description: Enforce linear git history — no merge commits from worktree branches on feature branches
globs: ["**/*"]
---

# Git Linear History

Feature branches must stay linear. Merge commits from parallel worktree agents are not allowed.

## When merging worktree branches back

Use `--squash`, never plain `git merge`:

```bash
# CORRECT — squashes all worktree commits into one staged change
git merge --squash <worktree-branch>
git commit -m "fix(scope): description"

# WRONG — creates a merge commit and may pull in noise commits
git merge <worktree-branch> --no-edit
```

## Workflow merge agent instructions

Any merge agent in a parallel-worktree workflow MUST:

1. Use `git merge --squash <branch>` for every worktree branch.
2. After squash, commit once per logical group with a conventional commit message.
3. Never use `git merge --no-edit` or bare `git merge` on worktree branches.
4. Run `git log --oneline` after all merges to verify the history is linear before reporting done.

## Why

Plain `git merge` on worktree branches:
- Creates merge commits that clutter the feature branch graph.
- Pulls in noise commits from the worktree base (e.g. plugin installs, internal config).
- Produces duplicate commits when multiple worktrees diverged from different points.

`--squash` collapses everything into a single staged diff, giving full control over the commit message and keeping the graph linear.
