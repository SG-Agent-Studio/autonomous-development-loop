/**
 * Static assertions for the Stage 2 human verification gate.
 * Spec: docs/superpowers/specs/2026-07-10-stage-2-human-verification-gate-design.md
 *
 * These skills are prompts, not code. This harness is the only thing that can
 * fail when a stage file drifts back to the pre-fix contract.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/** Repo root, so the assertions hold regardless of the caller's cwd. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const AFD = "skills/autonomous-feature-development";
const HIL = "skills/human-in-loop-feature-development/SKILL.md";
const ARCH = "docs/architecture/002-skills.md";

const VERIFY = `${AFD}/stage-verify.md`;
const REVIEW_FIX = `${AFD}/stage-review-fix.md`;
const IMPL = `${AFD}/stage-impl.md`;
const ENGINE = `${AFD}/SKILL.md`;
const FINAL = `${AFD}/stage-final.md`;

const CONTRACT_HEADING = "## Verifier subagent contract (mode-blind)";
const RESUME_HEADING = "## Resume after human verification";

const ALL_SKILL_DOCS = [VERIFY, REVIEW_FIX, IMPL, ENGINE, FINAL, HIL, ARCH];

/**
 * Reads a repo-relative path. A missing file is a bug in this harness, not a
 * passing assertion: several checks assert a string is *absent*, and an empty
 * string satisfies all of them vacuously.
 */
function read(relPath: string): string {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) throw new Error(`harness target missing: ${relPath}`);
  return readFileSync(abs, "utf8");
}

/** Body of `heading`, up to the next heading of the same or higher level. */
function section(text: string, heading: string): string {
  const level = heading.match(/^#+/)![0].length;
  const start = text.indexOf(heading);
  if (start === -1) return "";
  const rest = text.slice(start + heading.length);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next === -1 ? rest : rest.slice(0, next);
}

/** The verifier contract section, which several assertions scope themselves to. */
function contractSection(): string {
  const s = section(read(VERIFY), CONTRACT_HEADING);
  expect(s, `missing heading: ${CONTRACT_HEADING}`).not.toBe("");
  return s;
}

const docsContaining = (needle: string) => ALL_SKILL_DOCS.filter((f) => read(f).includes(needle));

describe("stage 2 human verification gate", () => {
  it("A1: `needs_human` is gone from skills/ and docs/architecture/", () => {
    expect(docsContaining("needs_human")).toEqual([]);
  });

  it("A2: verifier contract section is mode-blind", () => {
    const s = contractSection();
    const banned = ["interaction_mode", "human-in-loop"].filter((w) => s.includes(w));
    expect(banned, "verifier contract must not mention the orchestrator's mode").toEqual([]);
  });

  it("A3: Loop Control has the 1a pause branch keyed on awaiting_human", () => {
    const s = read(REVIEW_FIX);
    expect(s, "stage-review-fix.md never mentions awaiting_human").toContain("awaiting_human");
    expect(s, "no Loop Control step `1a.`").toMatch(/^\s*1a\./m);
  });

  it('A4: Stage 2 Clearance Gate gates on last_outcome == "pass"', () => {
    const s = read(REVIEW_FIX);
    expect(s, "gate heading absent").toContain("Stage 2 Clearance Gate");
    expect(s, "gate does not require a positive pass").toContain('last_outcome == "pass"');
  });

  it("A5: no stale two-value last_outcome enum; new enum defined exactly once", () => {
    // The three-value enum contains the two-value one as a prefix, so the
    // stale-enum probe must assert the absence of the third value.
    const stale = /"last_outcome":\s*"pass"\s*\|\s*"fail"(?!\s*\|\s*"awaiting_human")/;
    expect(ALL_SKILL_DOCS.filter((f) => stale.test(read(f))), "stale two-value enum").toEqual([]);

    const fresh = '"last_outcome": "pass" | "fail" | "awaiting_human"';
    expect(docsContaining(fresh), "enum must be defined exactly once, in stage-verify.md").toEqual([
      VERIFY,
    ]);
  });

  it("A6: resume section exists and the state file's `resume` pointer names it exactly", () => {
    const s = read(VERIFY);
    expect(s, `missing heading: ${RESUME_HEADING}`).toContain(RESUME_HEADING);

    const m = s.match(/"resume":\s*"([^"]+)"/);
    expect(m, "state schema has no `resume` pointer").not.toBeNull();
    expect(m![1], "resume pointer must name the resume heading").toContain(
      RESUME_HEADING.replace(/^#+\s*/, ""),
    );
  });

  it("A7: engine SKILL.md still states the subagent rule", () => {
    expect(read(ENGINE)).toContain("Subagents never branch on");
  });

  it("A8: architecture doc describes the awaiting_human pause", () => {
    expect(read(ARCH)).toContain("awaiting_human");
  });

  it("A9: verifier schema has blocked / how_to_check / where_to_observe", () => {
    const s = contractSection();
    const missing = ["blocked", "how_to_check", "where_to_observe"].filter((w) => !s.includes(w));
    expect(missing, "verifier schema fields").toEqual([]);
  });

  it("A10: blocked vs CANNOT-VERIFY disambiguation table is present", () => {
    const s = contractSection();
    const missing = ["System failed to start", "AC unclear or unmeasurable"].filter(
      (w) => !s.includes(w),
    );
    expect(missing, "disambiguation table rows").toEqual([]);
  });

  it("A11: checklist uses `Result: (pending)` and carries no redundant checkbox", () => {
    const s = read(VERIFY);
    expect(s, "checklist template lacks `Result: (pending)`").toContain("Result: (pending)");
    expect(s, "checklist still has a redundant `- [ ]` checkbox").not.toContain("- [ ] <AC text>");
  });

  it("A12: stage-impl.md ownership table lists the verifications/ directory", () => {
    expect(read(IMPL)).toContain("verifications/");
  });

  it("A13: HIL SKILL.md names the checklist file and the `continue` resume signal", () => {
    const s = read(HIL);
    const missing = ["verification-<round>.md", "`continue`"].filter((w) => !s.includes(w));
    expect(missing, "HIL SKILL.md references").toEqual([]);
  });
});
