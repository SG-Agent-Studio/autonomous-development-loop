# Autonomous Development Plugin

A Claude Code plugin for running a fully autonomous feature-development pipeline:
parallel-worktree TDD implementation → behavior verification → evidence-backed
review → fix loops, plus standalone review and verification skills you can invoke
on their own.

> **Platforms:** Claude Code **and** Cursor. Both read the same `skills/` folder
> (identical `SKILL.md` format), so this single repo ships manifests for each:
> `.claude-plugin/` + `.mcp.json` for Claude Code, `.cursor-plugin/` + `mcp.json`
> for Cursor. The skills depend on agent primitives — cross-skill invocation,
> subagent dispatch, and `git worktree`. Claude Code supports all of them and
> auto-installs the `superpowers`/`ponytail` dependencies below as plugin
> dependencies (see Prerequisites). Cursor supports subagents and `git worktree`,
> but its dispatch semantics differ and it has no equivalent dependency
> auto-install, and `superpowers`/`ponytail` aren't on the Cursor marketplace at
> all, so on Cursor both stages degrade to their built-in fallbacks. On Cursor,
> treat first runs as a compatibility test, not a guarantee.

## Skills

| Skill | Use it when |
|-------|-------------|
| `autonomous-feature-development` | You have a plan + spec ready to implement, or you received code-review feedback that needs validation and fixing. Runs the full pipeline or a standalone review-fix. |
| `human-in-loop-feature-development` | You are developing locally with a human present and want the pipeline to clarify unresolved commands, hand off UI verification when Playwright MCP is unavailable, and leave changes unstaged for you to commit. |
| `verifying-implementation` | Work has observable runtime behavior (a service, DB, UI, queue, job). Gates a "done" claim behind a fresh subagent observing the running system meet its acceptance criteria. |
| `enhanced-review` | Before merging code, or before implementing a spec/plan. Linus-Torvalds-style review with a five-why reflection so every verdict is evidence-backed. |

## Prerequisites

This plugin depends on capabilities it does **not** bundle. On Claude Code,
`superpowers` and `ponytail` are declared as plugin `dependencies` in
`.claude-plugin/plugin.json` (requires Claude Code v2.1.110+), so `/plugin
install autonomous-development-plugin@autonomous-development` auto-installs
both alongside it. If a dependency is somehow still missing at runtime, the
relevant skill will stop and tell you rather than failing silently.

| Dependency | Required for | Notes |
|------------|--------------|-------|
| [`superpowers`](https://github.com/anthropics/superpowers) plugin | Branch completion (`superpowers:finishing-a-development-branch`) and the verification fallback (`superpowers:verification-before-completion`) | Auto-installed from the official `claude-plugins-official` marketplace. |
| [`ponytail`](https://github.com/DietrichGebert/ponytail) plugin (`ponytail:ponytail-review`) | Mode A review stage in `autonomous-feature-development` | Used as one of three parallel reviewers. Auto-installed from its `ponytail` marketplace. |
| **playwright MCP** | Tier 3 UI behavior verification in `verifying-implementation` | Bundled in this plugin's `.mcp.json` (`pnpx @playwright/mcp@latest`). Requires `pnpm`/`pnpx` on PATH. Without it, UI verification degrades to the user-confirmation fallback. |

The pipeline needs project-local `lint` and `test` commands (with optional
`format` and `start`). It resolves them at Stage 0 from a `## Commands` section in
`CLAUDE.md`/`AGENTS.md` or from project config (`justfile`, `package.json`,
`Makefile`, `pyproject.toml`, …) — no specific tool such as `just` is required.

## Installation

This repo doubles as its own single-plugin marketplace for both agents.

### Claude Code

1. Add this repo as a marketplace, then install the plugin — `superpowers` and
   `ponytail` auto-install alongside it as declared dependencies:
   ```
   /plugin marketplace add <this-repo-url-or-path>
   /plugin install autonomous-development-plugin@autonomous-development
   ```
   (See `.claude-plugin/marketplace.json`.) Requires Claude Code v2.1.110+.
2. Ensure `pnpm`/`pnpx` is available so the bundled playwright MCP can start.

### Cursor

1. Push this repo somewhere Cursor can reach it (any public/accessible Git URL).
2. In Cursor, add it as a marketplace source and install the plugin — Cursor reads
   `.cursor-plugin/marketplace.json` and `.cursor-plugin/plugin.json` from the repo
   root, discovering the same `skills/` folder.
3. Reload Cursor (**Developer: Reload Window**) and confirm the skills appear
   in settings.
4. Ensure `pnpm`/`pnpx` is on PATH for the bundled playwright MCP (`mcp.json`).
5. `superpowers` and `ponytail` are **not** on the Cursor marketplace. Their
   skills are unavailable, so the stages that call them degrade to the built-in
   fallbacks rather than failing (each skill says so when a dependency is missing).

## Usage

Invoke a skill through Claude Code's `Skill` tool, e.g. ask Claude to "run
autonomous-feature-development" after a brainstorming/planning session, or "verify
this implementation" once a feature with runtime behavior is built.

The autonomous pipeline is **fully autonomous** by design — it does not pause for
input mid-run. Read `skills/autonomous-feature-development/SKILL.md` for the stage
breakdown and hard rules before first use. For local, human-present runs that
clarify missing commands, hand off UI verification without Playwright MCP, and
leave changes unstaged for you to commit, invoke `human-in-loop-feature-development`
instead.

## Architecture

- [Agent Workflow](./docs/architecture/001-agent-workflow.md) — stage-by-stage flowcharts for Mode A (full pipeline) and Mode B (standalone review fix)
- [Skills Reference](./docs/architecture/002-skills.md) — skill overview, dependency graph, file structure per skill

## Development

### Tests

```
pnpm install       # vitest, typescript, @types/node
pnpm test          # run the suite
pnpm typecheck     # tsc --noEmit; vitest strips types without checking them
```

The skills in this repo are prompts, not code, so nothing compiles and nothing fails on
its own when a stage file drifts. `tests/regression-tests/check-stage2-gate.test.ts` is
the substitute: 13 static assertions over the skill and architecture markdown, each named
`A1:` through `A13:`. It is what stops the Stage 2 human-verification gate from silently
regressing.

To run a subset, filter by test name:

```
pnpm test -- -t "A3:|A4:"
```

The `--` is required. `pnpm test -t "A3:"` silently drops the filter and runs all 13,
reporting a green suite — `test` is an npm lifecycle script, so pnpm only forwards flags
that follow a bare `--`. Anchor each id on its colon, too: `-t "A1"` is a regex that also
matches `A10` through `A13`.

### Bumping the version

```
pnpm bump          # patch bump (default): 0.1.1 → 0.1.2
pnpm bump minor    # 0.1.1 → 0.2.0
pnpm bump major    # 0.1.1 → 1.0.0
pnpm bump 1.2.3    # set explicit version
```

Updates `version` in both `plugin.json` files and `metadata.version` in both
`marketplace.json` files.

## License

MIT — see [LICENSE](./LICENSE).
