# User feedbacks on 2026-08-16

## [x] Feedback 1 - Playwright MCP is blocked by organization

Some user feedbacks that Playwright MCP is blocked by their organization.

Suggested to use Playwright CLI to replace the usage of MCP in this plugin.

### Resolution

Fixed by `docs/superpowers/plans/2026-08-16-playwright-cli-replacement.md`.

Playwright MCP removed entirely (`.mcp.json`, `mcp.json` deleted). Tier-3 UI
verification now drives a throwaway Playwright script via Node, with `playwright`
cached in `~/.cache/autonomous-development-plugin/playwright-cli/` — never installed
into the target project, so nothing to allowlist or approve at the org MCP-policy
level. Same evidence contract (screenshot/console/network), same Stage 2 gate and
human-handoff behavior; only the capability probe's name (`mcp_available` →
`playwright_available`) and underlying check changed.
