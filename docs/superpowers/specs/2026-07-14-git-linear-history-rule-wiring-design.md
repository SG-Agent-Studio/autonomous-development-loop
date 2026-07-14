# Design: Wire `rules/git-linear-history.md` into the plugin

**Date:** 2026-07-14
**Scope:** `rules/git-linear-history.md`, `skills/autonomous-feature-development/SKILL.md`, `stage-impl.md`, `stage-review-fix.md`
**Status:** Approved

## Problem

`rules/git-linear-history.md` was added at the plugin root to document the squash-merge-only policy for worktree branches. The same policy is currently duplicated inline in three places in the `autonomous-feature-development` skill:

- `SKILL.md` Hard Rule #2
- `stage-impl.md`'s "Squash Merge (after ALL agents finish)" section
- `stage-review-fix.md`'s "Squash-merge each fix (orchestrator)" section

The rule file itself is not referenced from any of them, so it's dead documentation. The goal is to make it the single source of truth the skill actually follows during its merge steps, without moving it into the skill folder.

## Research findings

**Claude Code plugins** have no native "rules" component. Per the official plugin reference, a `CLAUDE.md` at the plugin root is not loaded as project context — "Plugins contribute context through skills, agents, and hooks rather than CLAUDE.md. To ship instructions that load into Claude's context, put them in a skill." Installed plugins also cannot reference files _outside the plugin root_, but `rules/` is inside the plugin root (a sibling of `skills/`), so a skill file can safely reference it by relative path — the whole plugin directory ships together. This repo's `SKILL.md` already uses exactly this pattern to pull in `stage-impl.md`, `stage-review-fix.md`, etc. by relative path.

**Cursor plugins** treat `rules/*.mdc` as a first-class, auto-discovered component (default path `./rules/`, no manifest entry needed). Cursor applies each rule per its own frontmatter (`alwaysApply`, `globs`, `description`) with no cross-component wiring available or needed — the Cursor side of this is already correct as-is.

Conclusion: keep the file where it is; wire it into Claude Code's skill by reference (Read-and-follow pointer), change nothing structural for Cursor.

## Design

### 1. Rule file frontmatter

Add the `alwaysApply: true` field to `rules/git-linear-history.md`, which Cursor's docs list as required frontmatter and which matches the rule's actual intent (hard policy, not a suggestion).

### 2. Replace duplicated policy prose with a pointer

In each of the three spots, keep only the parts that are location-specific (the actual bash commands, e.g. `git merge --squash worktree/<task-id>`), and replace the restated policy/rationale with a one-line reference to `../../rules/git-linear-history.md`, instructing the reader to follow it before merging.

| File                                                        | Change                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `rules/git-linear-history.md`                               | Add `alwaysApply: true` to frontmatter                                          |
| `skills/autonomous-feature-development/SKILL.md`            | Hard Rule #2 becomes a pointer to the rule file instead of restating the policy |
| `skills/autonomous-feature-development/stage-impl.md`       | "Squash Merge" section gets a pointer line before its bash block                |
| `skills/autonomous-feature-development/stage-review-fix.md` | "Squash-merge each fix" section gets a pointer line before its bash block       |

No changes to `.claude-plugin/plugin.json` or `.cursor-plugin/plugin.json` — neither needs a manifest entry for this (Claude Code has no rules concept to declare; Cursor auto-discovers `./rules/` by default).

## Out of scope

- Enforcement via a `PreToolUse` hook that blocks bare `git merge` — not requested; the skill's existing squash-merge commands already comply procedurally, this change only fixes the documentation duplication.
- `stage-final.md` — no merge/worktree logic there, confirmed by grep.

## Files changed

- `rules/git-linear-history.md`
- `skills/autonomous-feature-development/SKILL.md`
- `skills/autonomous-feature-development/stage-impl.md`
- `skills/autonomous-feature-development/stage-review-fix.md`
