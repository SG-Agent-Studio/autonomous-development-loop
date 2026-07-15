# Changelog

All notable changes to this plugin are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `explain-changes` skill — generates a self-contained HTML pitch-and-quiz report explaining a diff (with plan/spec/loop-log context) or an existing codebase area, ending in a self-check quiz, so a reviewer builds real understanding before merging. Auto-invoked at the end of `autonomous-feature-development` (non-blocking).
- `autonomous-feature-development` now writes a consolidated `.loop-logs/<id>/logs/decisions.md` at Stage 4, aggregating each task's `### Key Decisions` and failed-attempt root causes plus fixed-issue root causes from the review loop.

### Fixed

- Stage 2 human verification no longer falls through to Stage 3. The verifier subagent is now mode-blind — it returns a `blocked[]` list of acceptance criteria it lacked the capability to check, and the orchestrator alone maps that onto mode policy. In `human-in-loop`, a blocked criterion writes a checklist, records `last_outcome: "awaiting_human"`, and pauses; a new fail-closed Stage 2 Clearance Gate refuses to spawn reviewers unless `last_outcome == "pass"`. The human records results in the checklist file and replies `continue`.

## [0.3.0] - 2026-07-09

### Added

- Add `human-in-loop-feature-development` skill and `interaction_mode` flag: resolve project commands instead of requiring `just`, hand off UI verification when Playwright MCP is unavailable, and leave changes unstaged (with robust worktree cleanup) for manual commit.

## [0.2.0] - 2026-06-30

### Added

- `cleanup-loop-logs` skill — human-triggered cleanup of a single autonomous-development run; deletes that run's `.loop-logs/<id>/` logs and prunes the orphaned worktrees/branches it left behind. `disable-model-invocation` guarantees the orchestrator can never call it.
- Run-id log namespacing — every run computes an `id` once in Stage 0 and writes all logs under `.loop-logs/<id>/` (Mode B `id` = `<today>-review-<branch>`), so concurrent or repeated runs no longer collide.
- Code-review logging — each review iteration writes a `code-review/round-<N>.md` log capturing the issues raised that round.

### Changed

- Unified verify↔review loop — former Stages 2 (verify) and 3 (review-fix) are now a single capped loop (≤5 iterations) in `stage-review-fix.md`: each iteration verifies against spec acceptance criteria, spawns fresh reviewers + consolidator, fixes actionable (blocking + important) issues, and re-verifies. Exits when a review raises zero actionable issues.
- Orchestrator purity (Hard Rule 6) — the orchestrator never reads, writes, or executes product code, quality checks (lint/test/verify), or reviews; every such action is delegated to a single-responsibility subagent, and the agent that implements a fix never reviews it. The orchestrator only does git plumbing and writes the run's log/state files.
- `stage-verify` now delegates verification and fixes to subagents instead of running them inline.
- `stage-final` reports the number of loop iterations and any deferred minor issues in `summary.md`.
- Mode B (standalone review-fix) now enters the same capped verify↔review loop after validating the received issues.
- Architecture docs (`001-agent-workflow.md`, `002-skills.md`) synced with the stage 2/3 refactor.

## [0.1.3] - 2026-06-23

### Added

- Architecture documentation for agent workflow (`docs/architecture/001-agent-workflow.md`) and skills (`docs/architecture/002-skills.md`), linked from the README.
- Enhanced Stage 1 task logs for post-mortem and code review prep — agents now write a structured Task Header (verbatim plan section + AC list) before attempt 1, and a richer Per-Attempt Block (files changed with role annotations, new test names, key design decisions, commit hash) after each TDD attempt.
- `log-schema.md` — single source of truth for task log format, referenced by Stage 1 agents at runtime.
- `log-sample.md` — two-attempt reference example (fail then pass) for agents to pattern-match.
- `Delivered` column in `summary.md` showing what each task produced, derived from the plan heading.
- Architecture decision record for workflow log file design (`docs/architecture/003-workflow-log-file.md`).

## [0.1.2] - 2026-06-22

### Fixed

- Subagent logs were not being written — agents now write logs directly using injected `LOG_PATH` and `ERROR_LOG_PATH` absolute paths; the orchestrator no longer owns log file writes.

## [0.1.1] - 2026-06-20

### Added

- Cursor plugin support — `.cursor-plugin/plugin.json`, `.cursor-plugin/marketplace.json`,
  and `mcp.json` ship alongside the Claude Code manifests. Both agents discover the
  same `skills/` folder; no skill files are duplicated.

### Fixed

- Missing guard for log files in the `autonomous-feature-development` skill — added schema ownership and integrity gate to `stage-impl`; `verification-state.json` is now written unconditionally after each round.

## [0.1.0] - 2026-06-20

Initial release.

### Added

- `autonomous-feature-development` skill — parallel-worktree TDD pipeline with
  verification, review, and fix loops; plus standalone review-fix mode.
- `verifying-implementation` skill — fresh-subagent Tier 3 behavior verification
  gate for work with runtime behavior.
- `enhanced-review` skill — Linus-style, evidence-backed five-why review for code,
  specs, and plans.
- Bundled playwright MCP (`.mcp.json`) for Tier 3 UI verification.
- Plugin manifest, README with documented prerequisites, and MIT license.
