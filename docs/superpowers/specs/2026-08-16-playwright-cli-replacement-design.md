# Replace Playwright MCP with Playwright CLI — Design

**Date:** 2026-08-16
**Status:** Approved
**Fixes:** Feedback 1 in `docs/user-feedbacks/2026-08-16-user-feedback.md`

## Problem

Playwright MCP (`.mcp.json` / `mcp.json`, `pnpx @playwright/mcp@latest`) is the only
Tier-3 UI verification mechanism this plugin bundles. Several orgs block MCP servers
outright at the client-policy level, so `verifying-implementation`'s UI checks degrade
to the user-confirmation fallback for every run in those orgs — not just the runs that
need it. `.claude/settings.local.json` in this repo already carries
`"disabledMcpjsonServers": ["playwright"]`, so the author is hitting this personally,
not just relaying a third-party report.

MCP has no capability here that Playwright's own Node API lacks. There is no reason to
carry two verification mechanisms once one covers the same ground without the
org-policy exposure.

## Principle

**Same evidence contract, different transport.** Tier 3 UI verification still means
"drive a real browser, capture concrete evidence (screenshot / console / network),
compare against AC." Only the mechanism that drives the browser changes — from MCP
tool calls to a throwaway Node script run against the `playwright` package. Nothing in
the Stage 2 gate, the `blocked[]`/`verified[]` schema, or the human-handoff contract
(all correct and unrelated to the transport) changes.

## Why not `npx playwright ...` directly, per invocation

Playwright's own CLI (`playwright install`, `codegen`, `screenshot`, `show-trace`) has
no subcommand for ad-hoc interaction — nothing like MCP's `browser_click` /
`browser_navigate` tool calls outside of `@playwright/test`. Two options were
considered for the driving mechanism:

1. A one-off Node script per verification round, written against the `playwright`
   package's own API (`chromium.launch()`, `page.goto()`, `page.click()`, …) — same
   shape as this skill's existing curl-based API checks.
2. A real `@playwright/test` spec file, run via `npx playwright test`, read back from
   its JSON/HTML report.

(1) was chosen. (2) pulls in a whole test-framework's conventions and a report format
to parse for what is a single verification pass, not a persistent test suite the
target project owns.

## Design

### 1. A plugin-owned cache, never the target project

The plugin runs against arbitrary target projects it does not own — it must not add
`playwright` to their `package.json` or `node_modules`, mirroring how `.mcp.json`
never touched the target project either.

`playwright` is installed once, on first use, into a fixed cache directory:

```
~/.cache/autonomous-development-plugin/playwright-cli/
├── package.json        # {"name":"pw-cli-cache","private":true}
└── node_modules/playwright/...
```

Per-round scripts (written anywhere, including inside the target project's
`.loop-logs/`) resolve `playwright` via `NODE_PATH` pointed at that cache's
`node_modules`, using CommonJS `require()` — **not** `import`, because Node's
`NODE_PATH` only affects CommonJS resolution, not ES module resolution. This was
spiked directly (see Verification) before committing to it: a `.cjs` script in an
unrelated directory, run with `NODE_PATH=<cache>/node_modules node script.cjs`,
successfully launched Chromium, navigated, and wrote a screenshot.

This is a strictly lighter prerequisite than MCP had: `npm` ships with `node`, so
`pnpm`/`pnpx` — previously required for `.mcp.json` to start — is no longer a
Playwright-verification prerequisite at all (still required for the plugin's own
`pnpm test`/`pnpm typecheck`, unrelated).

### 2. Preflight probe (Stage 0.7), renamed `playwright_available`

Replaces the `mcp_available` (y/n) check with the same shape, different underlying
test:

```bash
CACHE_DIR="$HOME/.cache/autonomous-development-plugin/playwright-cli"
if [ ! -d "$CACHE_DIR/node_modules/playwright" ]; then
  mkdir -p "$CACHE_DIR"
  echo '{"name":"pw-cli-cache","private":true}' > "$CACHE_DIR/package.json"
  (cd "$CACHE_DIR" && npm install playwright --no-save --no-audit --no-fund)
fi
(cd "$CACHE_DIR" && npx playwright install chromium)   # auto-installs on first miss
NODE_PATH="$CACHE_DIR/node_modules" node -e "
const { chromium } = require('playwright');
chromium.launch().then(b => b.close()).then(() => console.log('ok'));
"
```

All steps exit `0` and the last prints `ok` → `playwright_available = y`. Any failure
(no network, no `npm`, browser fails to launch — e.g. missing OS-level deps) →
`playwright_available = n`, and every downstream branch that read `mcp_available == n`
today reads `playwright_available == n` unchanged: same hard-stop in `autonomous`,
same human-checklist handoff in `human-in-loop`. **No new branches, no new states** —
this is a variable rename plus a swapped check, not a new capability model.

The `npm install` and `playwright install chromium` steps are a one-time cost per
machine (subsequent runs skip straight to the launch check, which is the only step
that must re-run every time — it also catches launch-time regressions a cached binary
wouldn't).

### 3. Per-round script and evidence

For each UI AC, the verifier subagent writes a CommonJS script to
`.loop-logs/<id>/verifications/round-<n>-script.cjs`, tailored to the AC (navigate,
click, fill, assert visible state), and runs it:

```bash
NODE_PATH="$HOME/.cache/autonomous-development-plugin/playwright-cli/node_modules" \
  node .loop-logs/<id>/verifications/round-<n>-script.cjs
```

Evidence capture, matching the existing Tier-3 evidence table:

| AC signal | Capture | 
| --- | --- |
| Rendered state | `page.screenshot({ path: ... })` → path becomes the evidence |
| Client-side errors | `page.on("console", ...)` → written to a `.log` file |
| Network calls | `page.on("request"/"response", ...)` → written to a `.log` file |

Script + captured evidence persist under `.loop-logs/<id>/verifications/`, same
retention as the existing `verification-<round>.md` audit file — not deleted after the
round, so a later human or agent can inspect exactly what was observed.

A script that throws (selector not found, navigation timeout, crash) is a `FAIL` with
the error as evidence, not `CANNOT-VERIFY` — that is a real, meaningful signal that the
built behavior is broken, not a capability gap.

### 4. What does not change

The `blocked[]` / `verified[]` verifier schema, the orchestrator's mode-translation
table, `verification-state.json`, the Stage 2 Clearance Gate, and the human-checklist
handoff format are all correct today and orthogonal to the transport. None of them are
touched — only their capability input's name and underlying check.

## Scope of change

| File | Change |
| --- | --- |
| `.mcp.json` | Delete |
| `mcp.json` | Delete |
| `skills/verifying-implementation/playwright-cli-procedure.md` | **New.** Cache setup, preflight probe, per-round script template, evidence capture, failure-mode table |
| `skills/verifying-implementation/SKILL.md` | Prerequisites bullet (MCP → CLI); sub-files list gains the new file |
| `skills/verifying-implementation/tier-3-procedure.md` | UI row of the evidence table references the new procedure file |
| `skills/verifying-implementation/subagent-template.md` | "Observation tools available" bullet; example dispatch skeleton |
| `skills/autonomous-feature-development/SKILL.md` | Prerequisites bullet; juncture 1 wording; `mcp_available` → `playwright_available` |
| `skills/autonomous-feature-development/stage-impl.md` | Step 0.7 rewritten around the new probe; `mcp_available` → `playwright_available` |
| `skills/autonomous-feature-development/stage-verify.md` | `mcp_available` → `playwright_available` (4 occurrences); "no MCP" → "no Playwright CLI capability" |
| `skills/human-in-loop-feature-development/SKILL.md` | Juncture 2 wording (MCP → CLI) |
| `docs/architecture/002-skills.md` | Dependency graph node `PW`; juncture table row; `mcp_available` mentions |
| `README.md` | Prerequisites table row; Installation steps (both platforms); Usage paragraph |
| `CHANGELOG.md` | New `[Unreleased]` entry |
| `docs/user-feedbacks/2026-08-16-user-feedback.md` | Mark Feedback 1 resolved |
| `tests/regression-tests/check-playwright-cli.test.ts` | **New.** Static assertions guarding against drift back to MCP wording / `mcp_available` |

**Left untouched, deliberately:** `docs/superpowers/plans/*.md` and
`docs/superpowers/specs/*.md` — dated decision records, accurate for when they were
written. `tests/regression-tests/check-stage2-gate.test.ts` — none of its 13
assertions reference "Playwright" or "MCP" (confirmed by grep before starting), so the
rename doesn't touch it. `.claude/settings.local.json` — gitignored, personal, and
becomes moot once `.mcp.json` no longer exists.

## Verification

Two layers, matching this repo's own established pattern for a prompts-only codebase:

1. **Static regression test** (`check-playwright-cli.test.ts`) — asserts no live skill
   doc contains "Playwright MCP" or `mcp_available`; asserts `.mcp.json`/`mcp.json`
   don't exist; asserts `playwright_available` and the new procedure file are present
   and referenced. This is what stops a future edit from silently reintroducing MCP
   wording, the same role `check-stage2-gate.test.ts` already plays for the Stage 2
   gate.

2. **Live mechanism spike (already run, not hypothetical).** Before committing to the
   `NODE_PATH` + CommonJS design, it was verified directly on this machine: installed
   `playwright` into an isolated cache dir, ran `playwright install chromium`, then
   from a completely unrelated directory ran a `.cjs` script with
   `NODE_PATH=<cache>/node_modules node script.cjs` that launched Chromium, navigated
   to a data URL, read back rendered text, and wrote a screenshot — all successful.
   This is the same category of residual-risk statement the Stage 2 gate spec made
   about `STOP` blocks: a static check proves the instructions are coherent, but only a
   real run proves the underlying mechanism (module resolution across an unrelated
   directory) actually works. That proof already exists; the plan re-runs an
   equivalent smoke test as part of the new procedure file's own worked example.

## Decisions

| Question | Decision | Reason |
| --- | --- | --- |
| Scope: full replacement, or keep MCP as a fallback? | Full replacement | MCP has no capability CLI lacks here; carrying two mechanisms for the thing that's *blocked* defeats the point |
| Driving mechanism: one-off script, `@playwright/test` spec, or `playwright screenshot` CLI only? | One-off Node script per round | Matches the existing curl-based evidence pattern; a full test framework's conventions/report format are overhead for a one-shot verification pass; the CLI's built-in subcommands can't click/fill |
| Dependency management: ephemeral per-invocation `npx`, project-local install, or require pre-installed? | Cached install in a plugin-owned directory, never the target project | Zero footprint on the target project (same property MCP had); avoids re-fetching the `playwright` package on every verification round; `NODE_PATH` + CommonJS resolves it reliably regardless of script location (spiked) |
| Browser binary: auto-install on first miss, or require pre-installed? | Auto-install (`playwright install chromium`, no `--with-deps`, no sudo) | Matches MCP's zero-config feel; one-time ~300MB cost per machine, not per run |
| `.mcp.json` / `mcp.json`: delete or keep as empty stubs? | Delete both | No MCP servers bundled anymore; deletion over addition, re-add if a real MCP dependency ever shows up |
| Evidence retention: keep script + screenshots/logs, or delete after the round? | Keep under `.loop-logs/<id>/verifications/` | Matches the existing `verification-<round>.md` audit-trail convention |
| Historical `docs/superpowers/plans/specs/*.md`: update or leave as-is? | Leave as-is | Dated decision records, accurate for their time; only live behavior docs get updated |
