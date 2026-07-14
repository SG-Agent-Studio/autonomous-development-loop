# Git Linear History Rule Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `rules/git-linear-history.md` the single source of truth for the squash-merge-only policy, referenced by the `autonomous-feature-development` skill instead of duplicated inline in three places.

**Architecture:** Pure documentation edit, no code. `rules/git-linear-history.md` stays at the plugin root (Cursor auto-discovers it there; Claude Code has no auto-load for it). Three skill files that currently restate the policy get a one-line pointer to the rule file instead, keeping only their location-specific bash commands inline.

**Tech Stack:** Markdown only.

**Status:** Approved

## Global Constraints

- Do not move `rules/git-linear-history.md` out of the plugin root — it must stay outside the skill folder (per design doc).
- Do not touch `.claude-plugin/plugin.json` or `.cursor-plugin/plugin.json` — no manifest entry needed for either ecosystem.
- Keep the actual bash commands (`git merge --squash ...`, `git log --oneline`) inline in the stage files — only the restated _policy prose_ is deduplicated into the rule file.
- Relative path from `skills/autonomous-feature-development/*.md` to the rule file is `../../rules/git-linear-history.md`.

---

### Task 1: Add `alwaysApply: true` to the rule file's frontmatter

**Files:**

- Modify: `rules/git-linear-history.md:1-4`

**Interfaces:**

- Produces: `rules/git-linear-history.md` frontmatter now includes `alwaysApply: true`, satisfying Cursor's documented required field and making Claude Code's forthcoming pointer text accurate ("this is a hard rule, not optional guidance").

- [ ] **Step 1: Edit the frontmatter**

Current content (lines 1–4):

```markdown
---
description: Enforce linear git history — no merge commits from worktree branches on feature branches
globs: ["**/*"]
---
```

Replace with:

```markdown
---
description: Enforce linear git history — no merge commits from worktree branches on feature branches
globs: ["**/*"]
alwaysApply: true
---
```

- [ ] **Step 2: Verify**

Run: `head -5 rules/git-linear-history.md`
Expected output:

```
---
description: Enforce linear git history — no merge commits from worktree branches on feature branches
globs: ["**/*"]
alwaysApply: true
---
```

- [ ] **Step 3: Commit**

```bash
git add rules/git-linear-history.md
git commit -m "docs(rules): mark git-linear-history as always-apply"
```

---

### Task 2: Point `SKILL.md` Hard Rule #2 at the rule file

**Files:**

- Modify: `skills/autonomous-feature-development/SKILL.md:88`

**Interfaces:**

- Consumes: `rules/git-linear-history.md` (Task 1, unchanged path/name)
- Produces: `SKILL.md` Hard Rules list no longer restates the policy inline — later readers of `SKILL.md` are pointed to the canonical file.

- [ ] **Step 1: Edit Hard Rule #2**

Current content (`## Hard Rules (both modes)`, item 2):

```markdown
2. Squash merge only — never plain `git merge` on worktree branches.
```

Replace with:

```markdown
2. Squash merge only — never plain `git merge` on worktree branches. See
   `../../rules/git-linear-history.md` for the full rule and rationale.
```

- [ ] **Step 2: Verify**

Run: `grep -n "git-linear-history" skills/autonomous-feature-development/SKILL.md`
Expected output: one match on the line just edited.

- [ ] **Step 3: Commit**

```bash
git add skills/autonomous-feature-development/SKILL.md
git commit -m "docs(skill): point Hard Rule 2 at git-linear-history rule file"
```

---

### Task 3: Point `stage-impl.md`'s Squash Merge section at the rule file

**Files:**

- Modify: `skills/autonomous-feature-development/stage-impl.md:314-323`

**Interfaces:**

- Consumes: `rules/git-linear-history.md` (Task 1)
- Produces: no change to the executable bash commands in this section — only a pointer line is added above them.

- [ ] **Step 1: Edit the Squash Merge section**

Current content (lines 314–323):

````markdown
### Squash Merge (after ALL agents finish)

Wait for all worktree agents to complete (success or hard-stop).

**For each task with `"status": "completed"`:**

```bash
git merge --squash worktree/<task-id>
git commit -m "feat(<scope>): <task description>"
```
````

````

Replace with:

```markdown
### Squash Merge (after ALL agents finish)

Follow `../../rules/git-linear-history.md` — squash merge only, never plain
`git merge`, on every worktree branch below.

Wait for all worktree agents to complete (success or hard-stop).

**For each task with `"status": "completed"`:**

```bash
git merge --squash worktree/<task-id>
git commit -m "feat(<scope>): <task description>"
````

````

- [ ] **Step 2: Verify**

Run: `grep -n "git-linear-history" skills/autonomous-feature-development/stage-impl.md`
Expected output: one match, on the line just added.

- [ ] **Step 3: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md
git commit -m "docs(stage-impl): point squash-merge step at git-linear-history rule"
````

---

### Task 4: Point `stage-review-fix.md`'s Squash-merge section at the rule file

**Files:**

- Modify: `skills/autonomous-feature-development/stage-review-fix.md:175-182`

**Interfaces:**

- Consumes: `rules/git-linear-history.md` (Task 1)
- Produces: no change to the executable bash commands in this section — only a pointer line is added above them.

- [ ] **Step 1: Edit the Squash-merge section**

Current content (lines 175–182):

````markdown
### Squash-merge each fix (orchestrator)

```bash
git merge --squash worktree/fix-<issue-id>
git commit -m "fix(<scope>): <issue description>"
git worktree remove .worktrees/fix-<issue-id> --force
git branch -D worktree/fix-<issue-id>
```
````

````

Replace with:

```markdown
### Squash-merge each fix (orchestrator)

Follow `../../rules/git-linear-history.md` — squash merge only, never plain
`git merge`.

```bash
git merge --squash worktree/fix-<issue-id>
git commit -m "fix(<scope>): <issue description>"
git worktree remove .worktrees/fix-<issue-id> --force
git branch -D worktree/fix-<issue-id>
````

````

- [ ] **Step 2: Verify**

Run: `grep -n "git-linear-history" skills/autonomous-feature-development/stage-review-fix.md`
Expected output: one match, on the line just added.

- [ ] **Step 3: Commit**

```bash
git add skills/autonomous-feature-development/stage-review-fix.md
git commit -m "docs(stage-review-fix): point squash-merge step at git-linear-history rule"
````

---

### Task 5: Final check — no duplicated policy prose remains

**Files:**

- None modified; verification only.

- [ ] **Step 1: Confirm all three skill files reference the rule file**

Run: `grep -rn "git-linear-history" skills/autonomous-feature-development/`
Expected output: exactly 3 matches — one each in `SKILL.md`, `stage-impl.md`, `stage-review-fix.md`.

- [ ] **Step 2: Confirm the rule file itself is unmoved and still at the plugin root**

Run: `git ls-files rules/`
Expected output: `rules/git-linear-history.md`

- [ ] **Step 3: Confirm relative paths resolve from each referencing file**

Run:

```bash
test -f skills/autonomous-feature-development/../../rules/git-linear-history.md && echo OK
```

Expected output: `OK`
