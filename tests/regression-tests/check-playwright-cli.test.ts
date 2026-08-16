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
const TEMPLATE = `${VI}/subagent-template.md`;
const FEEDBACK = "docs/user-feedbacks/2026-08-16-user-feedback.md";

/**
 * Live behavior docs only. Two kinds of files are deliberately excluded:
 *  - dated docs/superpowers/{plans,specs}/*.md — historical records, not live behavior.
 *  - playwright-cli-procedure.md — intentionally still mentions "Playwright MCP" and
 *    mcp_available in its explanatory prose, to explain why the old mechanism doesn't work.
 */
const LIVE_DOCS = [IMPL, VERIFY, ENGINE, VI_SKILL, TIER3, TEMPLATE, HIL, ARCH, README, CHANGELOG];

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
