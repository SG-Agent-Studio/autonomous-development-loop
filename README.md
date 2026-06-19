# Autonomous Development Plugin

A Claude Code plugin for running a fully autonomous feature-development pipeline:
parallel-worktree TDD implementation → behavior verification → evidence-backed
review → fix loops, plus standalone review and verification skills you can invoke
on their own.

> **Platform:** Claude Code only. The skills rely on Claude Code primitives
> (the `Skill` tool, parallel subagent dispatch, and `git worktree`) that do not
> exist in Cursor or Copilot. Cross-agent support is not provided.

## Skills

| Skill | Use it when |
|-------|-------------|
| `autonomous-feature-development` | You have a plan + spec ready to implement, or you received code-review feedback that needs validation and fixing. Runs the full pipeline or a standalone review-fix. |
| `verifying-implementation` | Work has observable runtime behavior (a service, DB, UI, queue, job). Gates a "done" claim behind a fresh subagent observing the running system meet its acceptance criteria. |
| `enhanced-review` | Before merging code, or before implementing a spec/plan. Linus-Torvalds-style review with a five-why reflection so every verdict is evidence-backed. |

## Prerequisites

This plugin depends on capabilities it does **not** bundle. Claude Code has no
automatic plugin dependency resolution, so you must install these yourself before
use. If a dependency is missing, the relevant skill will stop and tell you.

| Dependency | Required for | Notes |
|------------|--------------|-------|
| [`superpowers`](https://github.com/anthropics/superpowers) plugin | Branch completion (`superpowers:finishing-a-development-branch`) and the verification fallback (`superpowers:verification-before-completion`) | Hard requirement. Install before this plugin. |
| **playwright MCP** | Tier 3 UI behavior verification in `verifying-implementation` | Bundled in this plugin's `.mcp.json` (`pnpx @playwright/mcp@latest`). Requires `pnpm`/`pnpx` on PATH. Without it, UI verification degrades to the user-confirmation fallback. |
| [`ponytail`](https://github.com/) plugin (`ponytail:ponytail-review`) | Mode A review stage in `autonomous-feature-development` | Used as one of three parallel reviewers. If absent, that reviewer is skipped. |

The pipeline also expects a project-local `just` toolchain exposing
`just lint`, `just format`, and `just test-unit`. Adapt the stage files if your
project uses different commands.

## Installation

1. Install the `superpowers` plugin first (and `ponytail` if you use the full
   pipeline).
2. Add this repo as a marketplace, then install the plugin:
   ```
   /plugin marketplace add <this-repo-url-or-path>
   /plugin install autonomous-development-plugin@autonomous-development
   ```
   (This repo doubles as its own single-plugin marketplace — see
   `.claude-plugin/marketplace.json`.)
3. Ensure `pnpm`/`pnpx` is available so the bundled playwright MCP can start.

## Usage

Invoke a skill through Claude Code's `Skill` tool, e.g. ask Claude to "run
autonomous-feature-development" after a brainstorming/planning session, or "verify
this implementation" once a feature with runtime behavior is built.

The autonomous pipeline is **fully autonomous** by design — it does not pause for
input mid-run. Read `skills/autonomous-feature-development/SKILL.md` for the stage
breakdown and hard rules before first use.

## License

MIT — see [LICENSE](./LICENSE).
