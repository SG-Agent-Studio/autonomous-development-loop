# Changelog

All notable changes to this plugin are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Architecture documentation for agent workflow (`docs/architecture/001-agent-workflow.md`) and skills (`docs/architecture/002-skills.md`), linked from the README.

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
