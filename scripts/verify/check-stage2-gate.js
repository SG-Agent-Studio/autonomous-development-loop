#!/usr/bin/env node
/**
 * Static assertions for the Stage 2 human verification gate.
 * Spec: docs/superpowers/specs/2026-07-10-stage-2-human-verification-gate-design.md
 *
 * These skills are prompts, not code. This harness is the only thing that can
 * fail when a stage file drifts back to the pre-fix contract.
 */
import { readFileSync, existsSync } from "node:fs";

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

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

/** Body of `heading`, up to the next heading of the same or higher level. */
function section(text, heading) {
  const level = heading.match(/^#+/)[0].length;
  const start = text.indexOf(heading);
  if (start === -1) return "";
  const rest = text.slice(start + heading.length);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next === -1 ? rest : rest.slice(0, next);
}

const ALL_SKILL_DOCS = [VERIFY, REVIEW_FIX, IMPL, ENGINE, FINAL, HIL, ARCH];

/** Each check returns `true` on pass, or a string explaining the failure. */
const checks = [
  {
    id: "A1",
    desc: "`needs_human` is gone from skills/ and docs/architecture/",
    fn: () => {
      const hits = ALL_SKILL_DOCS.filter((f) => read(f).includes("needs_human"));
      return hits.length === 0 || `still present in: ${hits.join(", ")}`;
    },
  },
  {
    id: "A2",
    desc: "verifier contract section is mode-blind",
    fn: () => {
      const s = section(read(VERIFY), CONTRACT_HEADING);
      if (!s) return `missing heading: ${CONTRACT_HEADING}`;
      const banned = ["interaction_mode", "human-in-loop"].filter((w) => s.includes(w));
      return banned.length === 0 || `verifier section mentions: ${banned.join(", ")}`;
    },
  },
  {
    id: "A3",
    desc: "Loop Control has the 1a pause branch keyed on awaiting_human",
    fn: () => {
      const s = read(REVIEW_FIX);
      if (!s.includes("awaiting_human")) return "stage-review-fix.md never mentions awaiting_human";
      if (!/^\s*1a\./m.test(s)) return "no Loop Control step `1a.`";
      return true;
    },
  },
  {
    id: "A4",
    desc: 'Stage 2 Clearance Gate gates on last_outcome == "pass"',
    fn: () => {
      const s = read(REVIEW_FIX);
      if (!s.includes("Stage 2 Clearance Gate")) return "gate heading absent";
      if (!s.includes('last_outcome == "pass"')) return "gate does not require last_outcome == \"pass\"";
      return true;
    },
  },
  {
    id: "A5",
    desc: "no stale two-value last_outcome enum; new enum defined exactly once",
    fn: () => {
      // The three-value enum contains the two-value one as a prefix, so the
      // stale-enum probe must assert the absence of the third value.
      const stale = /"last_outcome":\s*"pass"\s*\|\s*"fail"(?!\s*\|\s*"awaiting_human")/;
      const hits = ALL_SKILL_DOCS.filter((f) => stale.test(read(f)));
      if (hits.length) return `stale two-value enum in: ${hits.join(", ")}`;
      const fresh = '"last_outcome": "pass" | "fail" | "awaiting_human"';
      const defs = ALL_SKILL_DOCS.filter((f) => read(f).includes(fresh));
      if (defs.length === 0) return "three-value enum defined nowhere";
      if (defs.length > 1) return `enum defined in ${defs.length} files, expected 1: ${defs.join(", ")}`;
      if (defs[0] !== VERIFY) return `enum must be defined in ${VERIFY}, found in ${defs[0]}`;
      return true;
    },
  },
  {
    id: "A6",
    desc: "resume section exists and the state file's `resume` pointer names it exactly",
    fn: () => {
      const s = read(VERIFY);
      if (!s.includes(RESUME_HEADING)) return `missing heading: ${RESUME_HEADING}`;
      const m = s.match(/"resume":\s*"([^"]+)"/);
      if (!m) return "state schema has no `resume` pointer";
      const target = RESUME_HEADING.replace(/^#+\s*/, "");
      return m[1].includes(target) || `resume pointer does not name "${target}": ${m[1]}`;
    },
  },
  {
    id: "A7",
    desc: "engine SKILL.md still states the subagent rule",
    fn: () =>
      read(ENGINE).includes("Subagents never branch on") ||
      "SKILL.md no longer states the subagent rule",
  },
  {
    id: "A8",
    desc: "architecture doc describes the awaiting_human pause",
    fn: () => read(ARCH).includes("awaiting_human") || "002-skills.md never mentions awaiting_human",
  },
  {
    id: "A9",
    desc: "verifier schema has blocked / how_to_check / where_to_observe",
    fn: () => {
      const s = section(read(VERIFY), CONTRACT_HEADING);
      const missing = ["blocked", "how_to_check", "where_to_observe"].filter((w) => !s.includes(w));
      return missing.length === 0 || `verifier schema missing: ${missing.join(", ")}`;
    },
  },
  {
    id: "A10",
    desc: "blocked vs CANNOT-VERIFY disambiguation table is present",
    fn: () => {
      const s = section(read(VERIFY), CONTRACT_HEADING);
      const missing = ["System failed to start", "AC unclear or unmeasurable"].filter(
        (w) => !s.includes(w),
      );
      return missing.length === 0 || `disambiguation table missing rows: ${missing.join(", ")}`;
    },
  },
  {
    id: "A11",
    desc: "checklist uses `Result: (pending)` and carries no redundant checkbox",
    fn: () => {
      const s = read(VERIFY);
      if (!s.includes("Result: (pending)")) return "checklist template lacks `Result: (pending)`";
      if (s.includes("- [ ] <AC text>")) return "checklist still has a redundant `- [ ]` checkbox";
      return true;
    },
  },
  {
    id: "A12",
    desc: "stage-impl.md ownership table lists the verifications/ directory",
    fn: () =>
      read(IMPL).includes("verifications/") || "file-ownership table has no verifications/ row",
  },
  {
    id: "A13",
    desc: "HIL SKILL.md names the checklist file and the `continue` resume signal",
    fn: () => {
      const s = read(HIL);
      const missing = ["verification-<round>.md", "`continue`"].filter((w) => !s.includes(w));
      return missing.length === 0 || `HIL SKILL.md missing: ${missing.join(", ")}`;
    },
  },
];

const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .map((s) => s.trim());

const selected = only ? checks.filter((c) => only.includes(c.id)) : checks;

if (only) {
  const unknown = only.filter((id) => !checks.some((c) => c.id === id));
  if (unknown.length) {
    console.error(`unknown assertion id(s): ${unknown.join(", ")}`);
    process.exit(2);
  }
}

let failed = 0;
for (const { id, desc, fn } of selected) {
  const result = fn();
  if (result === true) {
    console.log(`PASS ${id}  ${desc}`);
  } else {
    failed++;
    console.log(`FAIL ${id}  ${desc}\n       ↳ ${result}`);
  }
}

console.log(`\n${selected.length - failed}/${selected.length} assertions passed`);
process.exit(failed === 0 ? 0 : 1);
