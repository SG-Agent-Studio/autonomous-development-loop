# Replace Playwright MCP with Playwright CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the bundled Playwright MCP server and replace it as the sole Tier-3 UI
verification mechanism with a throwaway Playwright script run via Node, driven from a
plugin-owned cache directory that never touches the target project.

**Architecture:** Same evidence contract, different transport. The `blocked[]` /
`verified[]` verifier schema, the Stage 2 Clearance Gate, and the human-checklist
handoff are untouched — only the capability probe (`mcp_available` → `playwright_available`)
and the mechanism it gates change. `playwright` is installed once per machine into
`~/.cache/autonomous-development-plugin/playwright-cli/`; per-round CommonJS scripts
resolve it via `NODE_PATH`, proven to work by a live spike before this plan was written
(see the design doc's Verification section).

**Tech Stack:** Markdown skill definitions (the product), TypeScript + vitest (the
regression harness), pnpm (this plugin's own tooling only — the Playwright CLI
mechanism itself needs only `node`/`npm`, no `pnpm` dependency).

**Design doc:** `docs/superpowers/specs/2026-08-16-playwright-cli-replacement-design.md`

## Global Constraints

Copied from the design doc:

- **Zero footprint on the target project.** Never write to its `package.json` or
  `node_modules`. `playwright` lives only in `~/.cache/autonomous-development-plugin/playwright-cli/`.
- **`NODE_PATH` resolution requires CommonJS.** Per-round scripts are `.cjs` with
  `require()`, never ESM `import` — `NODE_PATH` does not affect ES module resolution.
- **No new states.** `playwright_available` (y/n) branches exactly where `mcp_available`
  did — same hard-stop in `autonomous`, same human-checklist handoff in `human-in-loop`.
  This is a rename plus a swapped check, not a new capability model.
- **Evidence persists.** Per-round scripts and captured screenshots/logs live under
  `.loop-logs/<id>/verifications/`, not deleted after the round.
- **Historical docs untouched.** `docs/superpowers/plans/*.md` and `specs/*.md` are
  dated records; do not edit them for this change.
- **`check-stage2-gate.test.ts` is untouched.** None of its 13 assertions reference
  "Playwright" or "MCP" (confirmed by grep) — the rename doesn't affect it.

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `tests/regression-tests/check-playwright-cli.test.ts` | Static assertions guarding against drift back to MCP wording/`mcp_available`; asserts the new procedure file and its references exist. | Create |
| `.mcp.json` | Bundled MCP server config (Claude Code). | Delete |
| `mcp.json` | Bundled MCP server config (Cursor). | Delete |
| `skills/verifying-implementation/playwright-cli-procedure.md` | Cache setup, preflight probe, per-round script template, evidence capture, failure-mode table. | Create |
| `skills/verifying-implementation/SKILL.md` | Prerequisites bullet; sub-files list. | Modify |
| `skills/verifying-implementation/tier-3-procedure.md` | UI row of the evidence table. | Modify |
| `skills/verifying-implementation/subagent-template.md` | "Observation tools available" bullet; example dispatch skeleton. | Modify |
| `skills/autonomous-feature-development/SKILL.md` | Prerequisites bullet; juncture 1; subagent-input sentence. | Modify |
| `skills/autonomous-feature-development/stage-impl.md` | Step 0.7 preflight probe. | Modify |
| `skills/autonomous-feature-development/stage-verify.md` | `mcp_available` → `playwright_available` (4 occurrences); "no MCP" wording. | Modify |
| `skills/human-in-loop-feature-development/SKILL.md` | Juncture 2 wording. | Modify |
| `docs/architecture/002-skills.md` | Dependency graph `PW` node; juncture table row; `mcp_available` mentions. | Modify |
| `README.md` | Prerequisites table row; Installation steps (both platforms); Usage paragraph. | Modify |
| `CHANGELOG.md` | New `[Unreleased]` entry. | Modify |
| `docs/user-feedbacks/2026-08-16-user-feedback.md` | Mark Feedback 1 resolved. | Modify |

**Why a committed harness rather than ad-hoc greps.** This repo ships prompts, not
code — `check-playwright-cli.test.ts` is the only thing that fails when a future edit
reintroduces "Playwright MCP" or `mcp_available`, same role `check-stage2-gate.test.ts`
already plays for the Stage 2 gate.

## Assertion → Task Map

| ID | Assertion | Made green by |
| --- | --- | --- |
| B1 | `.mcp.json` does not exist | Task 2 |
| B2 | `mcp.json` does not exist | Task 2 |
| B3 | No live doc contains the phrase "Playwright MCP" | Tasks 3–6 |
| B4 | No live doc contains `mcp_available` | Tasks 4–5 |
| B5 | `playwright_available` appears in `stage-impl.md`, `stage-verify.md`, `SKILL.md` | Task 4 |
| B6 | `playwright-cli-procedure.md` exists and is non-empty | Task 3 |
| B7 | `verifying-implementation/SKILL.md` sub-files list references `playwright-cli-procedure.md` | Task 3 |
| B8 | `tier-3-procedure.md` UI row references `playwright-cli-procedure.md`, not MCP | Task 3 |
| B9 | README Prerequisites table no longer says MCP is bundled in `.mcp.json` | Task 6 |
| B10 | `CHANGELOG.md` has an `[Unreleased]` entry mentioning Playwright CLI | Task 7 |
| B11 | `docs/user-feedbacks/2026-08-16-user-feedback.md` Feedback 1 marked `[x]` | Task 7 |
| B12 | `docs/architecture/002-skills.md` `PW` node no longer says "bundled in .mcp.json" | Task 5 |

"Live doc" scope for B3/B4 = `skills/**`, `docs/architecture/**`, `README.md`,
`CHANGELOG.md`. `docs/superpowers/plans/**` and `docs/superpowers/specs/**` are
excluded deliberately (Global Constraints).

---

### Task 1: Static assertion harness

**Files:**
- Create: `tests/regression-tests/check-playwright-cli.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm test`, a vitest suite of 12 `it()` blocks named `B1:`…`B12:`.
  `pnpm test -- -t "B1:|B2:"` runs a subset — the `--` is required.

- [ ] **Step 1: Write the harness**

Create `tests/regression-tests/check-playwright-cli.test.ts`:

```ts
/**
 * Static assertions for the Playwright MCP → Playwright CLI replacement.
 * Spec: docs/superpowers/specs/2026-08-16-playwright-cli-replacement-design.md
 *
 * These skills are prompts, not code. This harness is the only thing that can
 * fail when a stage file drifts back to bundled-MCP wording.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const AFD = "skills/autonomous-feature-development";
const VI = "skills/verifying-implementation";
const HIL = "skills/human-in-loop-feature-development/SKILL.md";
const ARCH = "docs/architecture/002-skills.md";
const README = "README.md";
const CHANGELOG = "CHANGELOG.md";

const IMPL = `${AFD}/stage-impl.md`;
const VERIFY = `${AFD}/stage-verify.md`;
const ENGINE = `${AFD}/SKILL.md`;
const VI_SKILL = `${VI}/SKILL.md`;
const TIER3 = `${VI}/tier-3-procedure.md`;
const PROCEDURE = `${VI}/playwright-cli-procedure.md`;
const FEEDBACK = "docs/user-feedbacks/2026-08-16-user-feedback.md";

/** Live behavior docs only — dated docs/superpowers/{plans,specs}/*.md are excluded. */
const LIVE_DOCS = [IMPL, VERIFY, ENGINE, VI_SKILL, TIER3, HIL, ARCH, README, CHANGELOG];

function read(relPath: string): string {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) throw new Error(`harness target missing: ${relPath}`);
  return readFileSync(abs, "utf8");
}

function exists(relPath: string): boolean {
  return existsSync(join(ROOT, relPath));
}

const docsContaining = (needle: string) => LIVE_DOCS.filter((f) => read(f).includes(needle));

describe("playwright MCP -> CLI replacement", () => {
  it("B1: .mcp.json is deleted", () => {
    expect(exists(".mcp.json")).toBe(false);
  });

  it("B2: mcp.json is deleted", () => {
    expect(exists("mcp.json")).toBe(false);
  });

  it('B3: no live doc contains the phrase "Playwright MCP"', () => {
    expect(docsContaining("Playwright MCP"), "stale MCP wording").toEqual([]);
  });

  it("B4: no live doc contains mcp_available", () => {
    expect(docsContaining("mcp_available"), "stale mcp_available reference").toEqual([]);
  });

  it("B5: playwright_available is defined in the engine's capability probe", () => {
    for (const f of [IMPL, VERIFY, ENGINE]) {
      expect(read(f), `${f} missing playwright_available`).toContain("playwright_available");
    }
  });

  it("B6: playwright-cli-procedure.md exists and is non-empty", () => {
    expect(exists(PROCEDURE)).toBe(true);
    expect(read(PROCEDURE).length, "procedure file is empty").toBeGreaterThan(200);
  });

  it("B7: verifying-implementation SKILL.md references the new procedure file", () => {
    expect(read(VI_SKILL)).toContain("playwright-cli-procedure.md");
  });

  it("B8: tier-3-procedure.md UI row references the CLI procedure, not MCP", () => {
    const s = read(TIER3);
    expect(s).toContain("playwright-cli-procedure.md");
    expect(s).not.toContain("MCP");
  });

  it("B9: README Prerequisites table no longer bundles MCP via .mcp.json", () => {
    const s = read(README);
    expect(s).not.toMatch(/playwright MCP.*bundled.*\.mcp\.json/is);
  });

  it("B10: CHANGELOG has an Unreleased entry mentioning Playwright CLI", () => {
    const s = read(CHANGELOG);
    expect(s).toContain("[Unreleased]");
    expect(s).toMatch(/Playwright CLI/);
  });

  it("B11: 2026-08-16 user feedback Feedback 1 is marked resolved", () => {
    expect(read(FEEDBACK)).toMatch(/## \[x\] Feedback 1/);
  });

  it("B12: architecture doc's PW node no longer says bundled in .mcp.json", () => {
    const s = read(ARCH);
    expect(s).not.toMatch(/PW\[.*bundled in \.mcp\.json/s);
  });
});
```

- [ ] **Step 2: Run the suite to confirm the expected baseline failures**

Run: `pnpm test -- -t "B1:|B2:|B3:|B4:|B5:|B6:|B7:|B8:|B9:|B10:|B11:|B12:"`

Expected: all 12 fail (nothing has changed yet), exit 1.

- [ ] **Step 3: Commit**

```bash
git add tests/regression-tests/check-playwright-cli.test.ts
git commit -m "test(verify): add regression harness for playwright MCP -> CLI replacement"
```

---

### Task 2: Delete the bundled MCP config

**Files:**
- Delete: `.mcp.json`
- Delete: `mcp.json`

**Interfaces:**
- Consumes: nothing.
- Produces: B1, B2 green.

- [ ] **Step 1: Delete both files**

```bash
git rm .mcp.json mcp.json
```

- [ ] **Step 2: Verify**

Run: `pnpm test -- -t "B1:|B2:"`

Expected: `2 passed (2)`, exit 0.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove bundled Playwright MCP config"
```

---

### Task 3: Author the Playwright CLI procedure and wire it into `verifying-implementation`

**Files:**
- Create: `skills/verifying-implementation/playwright-cli-procedure.md`
- Modify: `skills/verifying-implementation/SKILL.md`
- Modify: `skills/verifying-implementation/tier-3-procedure.md`
- Modify: `skills/verifying-implementation/subagent-template.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the cache-setup + per-round script contract other stage files reference
  by filename (`playwright-cli-procedure.md`).

- [ ] **Step 1: Create `skills/verifying-implementation/playwright-cli-procedure.md`**

```markdown
# Playwright CLI Procedure — UI Verification Without MCP

Loaded when a Tier-3 AC needs browser-observable behavior. Playwright MCP is not
bundled by this plugin — org policies frequently block MCP servers outright. Instead,
the verifier subagent drives a real Chromium instance with a throwaway Node script.

## Why not `npx playwright ...` per invocation

Playwright's own CLI (`playwright install`, `codegen`, `screenshot`, `show-trace`) has
no subcommand for ad-hoc interaction — nothing like MCP's `browser_click` /
`browser_navigate` tool calls outside `@playwright/test`. This procedure runs a plain
Node script against the `playwright` package's API instead. `@playwright/test` is
deliberately not used: it means writing a full test spec and parsing its report for
what is a one-shot verification pass, not a persistent suite the target project owns.

## One-time cache setup (Stage 0.7 preflight probe)

`playwright` and the Chromium browser binary are installed once into a plugin-owned
cache directory — **never into the target project**:

```bash
CACHE_DIR="$HOME/.cache/autonomous-development-plugin/playwright-cli"
if [ ! -d "$CACHE_DIR/node_modules/playwright" ]; then
  mkdir -p "$CACHE_DIR"
  echo '{"name":"pw-cli-cache","private":true}' > "$CACHE_DIR/package.json"
  (cd "$CACHE_DIR" && npm install playwright --no-save --no-audit --no-fund)
fi
(cd "$CACHE_DIR" && npx playwright install chromium)
```

Then confirm a real launch works — this catches missing OS-level dependencies that a
cached binary alone wouldn't:

```bash
NODE_PATH="$CACHE_DIR/node_modules" node -e "
const { chromium } = require('playwright');
chromium.launch().then(b => b.close()).then(() => console.log('ok'));
"
```

All commands exit `0` and the last prints `ok` → `playwright_available = y`. Any
failure (no network, no `npm`, launch fails) → `playwright_available = n` — same
downstream branching `mcp_available == n` used: hard-stop in `autonomous`, human
checklist handoff in `human-in-loop`.

This only needs the `npm install` / `playwright install` steps once per machine —
later runs skip straight to the launch check.

## Per-round script

Write a **CommonJS** script (`.cjs`, `require()` — not ESM `import`, since `NODE_PATH`
only affects CommonJS resolution) to
`.loop-logs/<id>/verifications/round-<n>-script.cjs`:

```js
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleLog = [];
  page.on("console", (msg) => consoleLog.push(`[${msg.type()}] ${msg.text()}`));

  // ... navigate/click/fill per the AC being exercised ...
  await page.goto("http://localhost:3000/some-page");
  await page.click("text=Submit");

  await page.screenshot({ path: __dirname + "/round-<n>-<ac-slug>.png" });
  fs.writeFileSync(__dirname + "/round-<n>-console.log", consoleLog.join("\n"));

  await browser.close();
})();
```

Run it:

```bash
NODE_PATH="$HOME/.cache/autonomous-development-plugin/playwright-cli/node_modules" \
  node .loop-logs/<id>/verifications/round-<n>-script.cjs
```

Capture per the AC signal:

| AC signal | Capture |
| --- | --- |
| Rendered state | `page.screenshot({ path: ... })` — path is the evidence |
| Client-side errors | `page.on("console", ...)` → `.log` file |
| Network calls | `page.on("request"/"response", ...)` → `.log` file |

Script + captured evidence persist under `.loop-logs/<id>/verifications/`, same
retention as `verification-<round>.md`.

## Failure modes

- **Script throws** (selector not found, navigation timeout, page crash) → the AC is
  `FAIL` with the error as evidence, not `CANNOT-VERIFY` — that's a real signal the
  behavior is broken, not a capability gap.
- **Preflight launch check fails** → `playwright_available = n` for the whole run; Tier
  3 UI checks degrade per `SKILL.md`'s prerequisites.
```

- [ ] **Step 2: Update `skills/verifying-implementation/SKILL.md`**

Replace:

```markdown
- **playwright MCP** (required for UI verification) — bundled in this plugin's
  `.mcp.json`. Without it, Tier 3 UI checks degrade to the user-confirmation fallback.
```

with:

```markdown
- **Playwright CLI** (required for UI verification) — a throwaway Playwright script
  run via Node, with `playwright` cached outside the target project. See
  `playwright-cli-procedure.md`. Without it, Tier 3 UI checks degrade to the
  user-confirmation fallback.
```

And at the bottom, in `## Sub-files (load only when needed)`, add a line:

```markdown
- `playwright-cli-procedure.md` — cache setup, preflight probe, and the per-round
  script contract for UI verification
```

- [ ] **Step 3: Update `skills/verifying-implementation/tier-3-procedure.md`**

Replace the UI row of the evidence table:

```markdown
| UI            | Headless browser drive (via the bundled **playwright** MCP), OR ask user to confirm visually | screenshot path or "user confirmed: yes/no" |
```

with:

```markdown
| UI            | Headless browser drive via a throwaway Playwright script (see `playwright-cli-procedure.md`), OR ask user to confirm visually | screenshot path (+ console/network log if relevant) or "user confirmed: yes/no" |
```

- [ ] **Step 4: Update `skills/verifying-implementation/subagent-template.md`**

Replace:

```markdown
6. **Observation tools available** — `curl`, headless browser (the bundled **playwright** MCP), user-in-the-loop fallback. State which.
```

with:

```markdown
6. **Observation tools available** — `curl`, headless browser (Playwright CLI script — see `playwright-cli-procedure.md`), user-in-the-loop fallback. State which.
```

And in the example dispatch skeleton's `## Tools you have` list, replace any bundled-MCP
wording with a reference to the CLI script mechanism.

- [ ] **Step 5: Verify**

Run: `pnpm test -- -t "B6:|B7:|B8:"`

Expected: `3 passed (3)`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/verifying-implementation/
git commit -m "feat(verify): replace bundled Playwright MCP with a CLI-driven procedure"
```

---

### Task 4: Rewire the autonomous-feature-development engine's capability probe

**Files:**
- Modify: `skills/autonomous-feature-development/SKILL.md`
- Modify: `skills/autonomous-feature-development/stage-impl.md`
- Modify: `skills/autonomous-feature-development/stage-verify.md`

**Interfaces:**
- Consumes: `playwright-cli-procedure.md` from Task 3.
- Produces: `playwright_available` as the sole capability input, replacing
  `mcp_available` everywhere in this skill.

- [ ] **Step 1: Update `SKILL.md` prerequisites bullet**

Replace:

```markdown
- **playwright MCP** — required for UI verification when `interaction_mode ==
  autonomous` (bundled in this plugin's `.mcp.json`). When `human-in-loop`, MCP is
  optional: if absent, UI verification degrades to a human checklist handoff (see
  `stage-verify.md`).
```

with:

```markdown
- **Playwright CLI** — required for UI verification when `interaction_mode ==
  autonomous`. Nothing to install ahead of time: the Stage 0.7 preflight probe
  bootstraps a plugin-owned cache on first use (see
  `skills/verifying-implementation/playwright-cli-procedure.md`). When
  `human-in-loop`, it's optional: if unavailable, UI verification degrades to a human
  checklist handoff (see `stage-verify.md`).
```

- [ ] **Step 2: Update the juncture list and subagent-input sentence in `SKILL.md`**

Replace:

```markdown
1. **Stage 0 preflight fallback** — an unresolved command or absent Playwright MCP.
2. **Stage 2 verify fallback** — the verifier reports `blocked` acceptance criteria
   (browser needed, MCP absent). `autonomous` hard-stops; `human-in-loop` writes a
```

with:

```markdown
1. **Stage 0 preflight fallback** — an unresolved command or absent Playwright CLI capability.
2. **Stage 2 verify fallback** — the verifier reports `blocked` acceptance criteria
   (browser needed, Playwright CLI unavailable). `autonomous` hard-stops; `human-in-loop` writes a
```

Replace:

```markdown
concrete inputs (resolved commands, `mcp_available`) and keep assume-and-comment
```

with:

```markdown
concrete inputs (resolved commands, `playwright_available`) and keep assume-and-comment
```

- [ ] **Step 3: Rewrite Step 0.7 in `stage-impl.md`**

Replace:

```markdown
### Step 0.7 — Probe verification capability (Mode A)

Check whether the bundled Playwright MCP tools are available → `mcp_available`
(y/n). Scan `spec_path` acceptance criteria for browser-observable behavior
(rendered pages, UI state, client-side interaction).

- A UI AC is present AND `mcp_available == n`:
  - `interaction_mode == autonomous`: **hard-stop**. Print
    `ERROR: UI acceptance criteria require Playwright MCP, which is unavailable.` and stop.
  - `interaction_mode == human-in-loop`: print a heads-up that UI verification will
    be handed to the human via a checklist, and continue.

Record `mcp_available` and inject it into the verifier subagent prompt. It is the
verifier's **only** capability input — never inject `interaction_mode` into any
subagent. The verifier reports blocked criteria as facts; the orchestrator alone
translates them into mode policy (see `stage-verify.md`). Mode B has no `spec_path` —
skip the AC-scan; the verify-time per-AC backstop still applies.
```

with:

```markdown
### Step 0.7 — Probe verification capability (Mode A)

Run the Playwright CLI preflight probe
(`skills/verifying-implementation/playwright-cli-procedure.md` § One-time cache setup)
→ `playwright_available` (y/n). Scan `spec_path` acceptance criteria for
browser-observable behavior (rendered pages, UI state, client-side interaction).

- A UI AC is present AND `playwright_available == n`:
  - `interaction_mode == autonomous`: **hard-stop**. Print
    `ERROR: UI acceptance criteria require the Playwright CLI, which is unavailable.` and stop.
  - `interaction_mode == human-in-loop`: print a heads-up that UI verification will
    be handed to the human via a checklist, and continue.

Record `playwright_available` and inject it into the verifier subagent prompt. It is
the verifier's **only** capability input — never inject `interaction_mode` into any
subagent. The verifier reports blocked criteria as facts; the orchestrator alone
translates them into mode policy (see `stage-verify.md`). Mode B has no `spec_path` —
skip the AC-scan; the verify-time per-AC backstop still applies.
```

- [ ] **Step 4: Rename `mcp_available` in `stage-verify.md` (4 occurrences)**

In `skills/autonomous-feature-development/stage-verify.md`, replace each of:

```markdown
in Mode B), `mcp_available`, and the resolved commands. It is **not** given the
```
→
```markdown
in Mode B), `playwright_available`, and the resolved commands. It is **not** given the
```

```markdown
      "reason": "needs browser; mcp_available=n",
```
→
```markdown
      "reason": "needs browser; playwright_available=n",
```

```markdown
- For each AC that needs the browser while `mcp_available == n`: do **not** attempt
```
→
```markdown
- For each AC that needs the browser while `playwright_available == n`: do **not** attempt
```

```markdown
| AC needs a browser AND `mcp_available == n` | `blocked`                      |
```
→
```markdown
| AC needs a browser AND `playwright_available == n` | `blocked`               |
```

And replace the "no MCP" sentence:

```markdown
backstop: Stage 0.7 already refuses to start an autonomous run with UI acceptance
criteria and no MCP.
```

with:

```markdown
backstop: Stage 0.7 already refuses to start an autonomous run with UI acceptance
criteria and no Playwright CLI capability.
```

- [ ] **Step 5: Verify**

Run: `pnpm test -- -t "B3:|B4:|B5:"`

Expected: `3 passed (3)`, exit 0.

- [ ] **Step 6: Confirm the Stage 2 gate harness still passes (nothing else regressed)**

Run: `pnpm test -- -t "A1:|A2:|A3:|A4:|A5:|A6:|A7:|A8:|A9:|A10:|A11:|A12:|A13:"`

Expected: `13 passed (13)`, exit 0. This plan does not touch the Stage 2 gate's contract
— this step confirms the rename didn't collaterally break it.

- [ ] **Step 7: Commit**

```bash
git add skills/autonomous-feature-development/
git commit -m "refactor(autonomous-dev): rename mcp_available to playwright_available"
```

---

### Task 5: Sync the wrapper skill and architecture doc

**Files:**
- Modify: `skills/human-in-loop-feature-development/SKILL.md`
- Modify: `docs/architecture/002-skills.md`

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces: B12 green; contributes to B3/B4.

- [ ] **Step 1: Update juncture 2 in `human-in-loop-feature-development/SKILL.md`**

Replace:

```markdown
2. **Playwright MCP unavailable for a UI acceptance criterion** (Stage 2) — write a
```

with:

```markdown
2. **Playwright CLI unavailable for a UI acceptance criterion** (Stage 2) — write a
```

(The rest of that list item already describes the file-based results contract
correctly and needs no further change.)

- [ ] **Step 2: Update `docs/architecture/002-skills.md`**

Replace the dependency graph node:

```mermaid
    PW[playwright MCP\nbundled in .mcp.json]
```

with:

```mermaid
    PW[Playwright CLI\ncached in ~/.cache/autonomous-development-plugin]
```

Replace the juncture table row:

```markdown
| Stage 2 — UI acceptance criterion needs Playwright MCP but it is absent | Hard-stop (preflight AC-scan + per-AC backstop) | Verifier auto-verifies non-UI ACs and returns them as `blocked[]` facts; orchestrator writes `.loop-logs/<id>/verifications/verification-<round>.md`, sets `last_outcome: "awaiting_human"`, and **pauses**. The human records each `Result:` in that file and replies `continue`; the Stage 2 Clearance Gate blocks Stage 3 until then. Any `FAIL` folds back into the fix loop |
```

with:

```markdown
| Stage 2 — UI acceptance criterion needs the Playwright CLI but it is unavailable | Hard-stop (preflight AC-scan + per-AC backstop) | Verifier auto-verifies non-UI ACs and returns them as `blocked[]` facts; orchestrator writes `.loop-logs/<id>/verifications/verification-<round>.md`, sets `last_outcome: "awaiting_human"`, and **pauses**. The human records each `Result:` in that file and replies `continue`; the Stage 2 Clearance Gate blocks Stage 3 until then. Any `FAIL` folds back into the fix loop |
```

Replace the two `mcp_available` mentions (line ~109 subagent-input sentence, and the
"Command resolution ... Stage 0 MCP AC-scan" sentence near the file-structure table):

```markdown
it** — they receive concrete inputs (resolved commands, `mcp_available`) and stay
```
→
```markdown
it** — they receive concrete inputs (resolved commands, `playwright_available`) and stay
```

```markdown
Command resolution and the commit handoff apply to both Mode A and Mode B; the
Stage 0 MCP AC-scan is Mode A only (Mode B has no `spec_path`), though the
verify-time per-AC MCP backstop still applies.
```
→
```markdown
Command resolution and the commit handoff apply to both Mode A and Mode B; the
Stage 0 Playwright CLI AC-scan is Mode A only (Mode B has no `spec_path`), though the
verify-time per-AC Playwright CLI backstop still applies.
```

Also update `verifying-implementation`'s file-structure table to list the new
`playwright-cli-procedure.md` row (mirroring the existing `tier-3-procedure.md` /
`subagent-template.md` rows).

- [ ] **Step 3: Verify**

Run: `pnpm test -- -t "B3:|B4:|B12:"`

Expected: `3 passed (3)`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add skills/human-in-loop-feature-development/SKILL.md docs/architecture/002-skills.md
git commit -m "docs: sync architecture doc and HIL wrapper with the CLI replacement"
```

---

### Task 6: Update the README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: B9 green; contributes to B3.

- [ ] **Step 1: Update the skills table's `human-in-loop-feature-development` row**

Replace "hand off UI verification when Playwright MCP is unavailable" with "hand off
UI verification when the Playwright CLI is unavailable".

- [ ] **Step 2: Update the Prerequisites table**

Replace:

```markdown
| **playwright MCP**                                                    | Tier 3 UI behavior verification in `verifying-implementation`                                                                                 | Bundled in this plugin's `.mcp.json` (`pnpx @playwright/mcp@latest`). Requires `pnpm`/`pnpx` on PATH. Without it, UI verification degrades to the user-confirmation fallback. |
```

with:

```markdown
| **Playwright CLI**                                                    | Tier 3 UI behavior verification in `verifying-implementation`                                                                                 | Nothing to install ahead of time — a throwaway script driven via Node, with `playwright` cached in `~/.cache/autonomous-development-plugin/playwright-cli/` on first use (never in your project). Requires `node`/`npm` on PATH. Without it, UI verification degrades to the user-confirmation fallback. |
```

- [ ] **Step 3: Update the Installation steps**

Claude Code step 3, replace:

```markdown
3. Ensure `pnpm`/`pnpx` is available so the bundled playwright MCP can start.
```

with:

```markdown
3. Ensure `node`/`npm` is available so the Playwright CLI verification script can run.
```

Cursor step 4, replace:

```markdown
4. Ensure `pnpm`/`pnpx` is on PATH for the bundled playwright MCP (`mcp.json`).
```

with:

```markdown
4. Ensure `node`/`npm` is on PATH for the Playwright CLI verification script.
```

- [ ] **Step 4: Update the Usage section**

Replace:

```markdown
The autonomous pipeline is **fully autonomous** by design — it does not pause for
input mid-run. Read `skills/autonomous-feature-development/SKILL.md` for the stage
breakdown and hard rules before first use. For local, human-present runs that
clarify missing commands, hand off UI verification without Playwright MCP, and
leave changes unstaged for you to commit, invoke `human-in-loop-feature-development`
instead.
```

with:

```markdown
The autonomous pipeline is **fully autonomous** by design — it does not pause for
input mid-run. Read `skills/autonomous-feature-development/SKILL.md` for the stage
breakdown and hard rules before first use. For local, human-present runs that
clarify missing commands, hand off UI verification when the Playwright CLI is
unavailable, and leave changes unstaged for you to commit, invoke
`human-in-loop-feature-development` instead.
```

- [ ] **Step 5: Verify**

Run: `pnpm test -- -t "B3:|B9:"`

Expected: `2 passed (2)`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: update README for the Playwright CLI replacement"
```

---

### Task 7: Live-verify the mechanism, changelog, close the feedback item

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/user-feedbacks/2026-08-16-user-feedback.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: B10, B11 green; the full suite green; live proof the documented commands
  in `playwright-cli-procedure.md` work verbatim, not just the pre-plan spike variant.

- [ ] **Step 1: Live-run the exact commands from `playwright-cli-procedure.md`**

Copy the "One-time cache setup" bash block verbatim and run it (this repo's own
machine already has the cache from the pre-plan spike; delete it first so this is a
genuine first-run test):

```bash
rm -rf ~/.cache/autonomous-development-plugin/playwright-cli
CACHE_DIR="$HOME/.cache/autonomous-development-plugin/playwright-cli"
if [ ! -d "$CACHE_DIR/node_modules/playwright" ]; then
  mkdir -p "$CACHE_DIR"
  echo '{"name":"pw-cli-cache","private":true}' > "$CACHE_DIR/package.json"
  (cd "$CACHE_DIR" && npm install playwright --no-save --no-audit --no-fund)
fi
(cd "$CACHE_DIR" && npx playwright install chromium)
NODE_PATH="$CACHE_DIR/node_modules" node -e "
const { chromium } = require('playwright');
chromium.launch().then(b => b.close()).then(() => console.log('ok'));
"
```

Expected: exits 0, prints `ok`. This is the literal preflight probe Step 0.7 will run
— if this fails, the procedure doc is wrong and Task 3 needs a fix before this task
continues.

- [ ] **Step 2: Add the changelog entry**

In `CHANGELOG.md`, insert immediately before the current top version heading:

```markdown
## [Unreleased]

### Changed

- Replaced the bundled Playwright MCP server with a Playwright CLI-driven procedure for Tier-3 UI verification. MCP servers are blocked outright by some orgs' client policies, so `verifying-implementation`'s UI checks now drive a real Chromium instance via a throwaway Node script instead, with `playwright` cached in `~/.cache/autonomous-development-plugin/playwright-cli/` on first use — never installed into the target project. `.mcp.json` and `mcp.json` are removed. The capability probe `mcp_available` is renamed `playwright_available`; branching behavior (hard-stop in `autonomous`, human checklist handoff in `human-in-loop`) is unchanged.

```

- [ ] **Step 3: Mark Feedback 1 resolved**

In `docs/user-feedbacks/2026-08-16-user-feedback.md`, replace the heading:

```markdown
## [ ] Feedback 1 - Playwright MCP is blocked by organization
```

with:

```markdown
## [x] Feedback 1 - Playwright MCP is blocked by organization
```

and append to the end of that section:

```markdown
### Resolution

Fixed by `docs/superpowers/plans/2026-08-16-playwright-cli-replacement.md`.

Playwright MCP removed entirely (`.mcp.json`, `mcp.json` deleted). Tier-3 UI
verification now drives a throwaway Playwright script via Node, with `playwright`
cached in `~/.cache/autonomous-development-plugin/playwright-cli/` — never installed
into the target project, so nothing to allowlist or approve at the org MCP-policy
level. Same evidence contract (screenshot/console/network), same Stage 2 gate and
human-handoff behavior; only the capability probe's name (`mcp_available` →
`playwright_available`) and underlying check changed.
```

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`

Expected: all `check-stage2-gate.test.ts` (13) and `check-playwright-cli.test.ts` (12)
assertions pass, exit 0.

- [ ] **Step 5: Confirm no stale reference survives anywhere in live docs**

```bash
grep -rn "Playwright MCP\|mcp_available" skills/ docs/architecture/ README.md CHANGELOG.md
```

Expected: no output, exit 1.

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md docs/user-feedbacks/2026-08-16-user-feedback.md
git commit -m "docs: changelog and close Feedback 1 from the 2026-08-16 feedback"
```

---

## Self-Review

**Spec coverage.**

| Spec section | Task |
| --- | --- |
| Plugin-owned cache, never the target project | Task 3 (procedure doc), verified live in Task 7 |
| Preflight probe, renamed `playwright_available` | Task 4 |
| Per-round script and evidence | Task 3 |
| What does not change (schema/gate/handoff) | No task touches `stage-review-fix.md` or the verifier schema fields — confirmed by Task 4 Step 6 re-running the untouched Stage 2 gate suite |
| Scope of change — all files | Tasks 2–7 |
| Verification — static harness + live mechanism proof | Task 1 (harness), Task 7 Step 1 (live re-run of the documented commands, not just the pre-plan scratch spike) |
| Decisions — full replacement, one-off script, cached install, auto-install browser, delete config, keep evidence, leave historical docs | All reflected in Tasks 2–7; no task edits `docs/superpowers/plans/**` or `specs/**` other than adding this plan/spec pair |

No gaps.

**Placeholder scan.** No "TBD", no "similar to Task N". Every step carries its literal
replacement text.

**Type/name consistency.** `playwright_available`, `CACHE_DIR`,
`~/.cache/autonomous-development-plugin/playwright-cli`, `playwright-cli-procedure.md`
are spelled identically across every task and match the design doc exactly.
