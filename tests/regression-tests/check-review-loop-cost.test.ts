/**
 * Static assertions for the Stage 3 review-loop cost optimization.
 * Spec: docs/superpowers/specs/2026-07-16-review-loop-cost-optimization-design.md
 *
 * These skills are prompts, not code. This harness is the only thing that can
 * fail when a stage file drifts back to the pre-optimization 3-reviewer contract.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const AFD = "skills/autonomous-feature-development";
const REVIEW_FIX = `${AFD}/stage-review-fix.md`;
const ENGINE = `${AFD}/SKILL.md`;
const ARCH_WORKFLOW = "docs/architecture/001-agent-workflow.md";
const ARCH_SKILLS = "docs/architecture/002-skills.md";
const README = "README.md";

const ALL_AFFECTED_DOCS = [REVIEW_FIX, ENGINE, ARCH_WORKFLOW, ARCH_SKILLS, README];

function read(relPath: string): string {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) throw new Error(`harness target missing: ${relPath}`);
  return readFileSync(abs, "utf8");
}

const docsContaining = (needle: string) =>
  ALL_AFFECTED_DOCS.filter((f) => read(f).includes(needle));

describe("stage 3 review-loop cost optimization", () => {
  it("C1: no affected doc keeps the stale 3-reviewer/consolidator vocabulary", () => {
    const stale = [
      "Reviewer A",
      "Reviewer B",
      "Reviewer C",
      "three parallel reviewers",
      "consolidation agent",
      "reviewers + consolidator",
      "spawns 3 reviewer",
      "spawn reviewers",
      "Reviewers were NOT spawned",
      "admits reviewers only",
    ];
    for (const phrase of stale) {
      expect(docsContaining(phrase), `stale phrase still present: "${phrase}"`).toEqual([]);
    }
  });

  it("C2: stage-review-fix.md documents the single multi-skill reviewer", () => {
    const s = read(REVIEW_FIX);
    const required = [
      "one reviewer agent",
      "enhanced-review",
      "simplify",
      "ponytail:ponytail-review",
      "self-dedupes",
      "evidence-backed",
      "no separate consolidation step",
    ];
    const missing = required.filter((w) => !s.includes(w));
    expect(missing, "single-reviewer contract elements").toEqual([]);
  });

  it("C3: stage-review-fix.md documents the model-tier decision step", () => {
    const s = read(REVIEW_FIX);
    const required = ["git diff --stat", "3000", "20", "Sonnet[1m]"];
    const missing = required.filter((w) => !s.includes(w));
    expect(missing, "model-tier decision elements").toEqual([]);
  });

  it("C4: stage-review-fix.md documents severity-keyed phase counts", () => {
    const s = read(REVIEW_FIX);
    const required = [
      "full 5-phase pipeline",
      "collapsed 3-phase pipeline",
      "no plan-approval gate",
    ];
    const missing = required.filter((w) => !s.includes(w));
    expect(missing, "severity-gated pipeline markers").toEqual([]);
  });

  it("C5: SKILL.md frames ponytail as an optional skill, not a dedicated reviewer", () => {
    const s = read(ENGINE);
    expect(s, "still describes ponytail as one of three reviewers").not.toContain(
      "one of three parallel reviewers",
    );
    expect(s, "missing the skill-the-review-agent-applies framing").toContain(
      "the single Stage 3 review agent applies",
    );
  });
});
