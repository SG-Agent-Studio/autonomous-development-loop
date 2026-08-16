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
"$CACHE_DIR/node_modules/.bin/playwright" install chromium
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
