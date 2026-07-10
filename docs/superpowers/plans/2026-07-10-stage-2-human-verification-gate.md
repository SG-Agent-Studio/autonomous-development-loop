# Stage 2 Human Verification Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `human-in-loop` orchestrator stop at Stage 2 and wait for human verification results instead of running Stage 3 review.

**Architecture:** Split fact-reporting from policy. The verifier subagent becomes mode-blind and returns a `blocked[]` list of acceptance criteria it lacked the capability to check; the orchestrator alone maps that onto mode policy. The pause is then enforced by a durable state file plus a fail-closed **Stage 2 Clearance Gate** that refuses to spawn reviewers unless `last_outcome == "pass"` — converting an instruction the model can rationalize past into a file read it cannot.

**Tech Stack:** Markdown skill definitions (the product), TypeScript + vitest on Node 20+ (the verification harness), pnpm.

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-07-10-stage-2-human-verification-gate-design.md`:

- **The verifier reports facts. The orchestrator decides policy.** Mode-dependent behaviour belongs in exactly one place: the orchestrator.
- Subagents never branch on `interaction_mode` and never receive it. They receive concrete inputs (resolved commands, `mcp_available`).
- `blocked` means exactly one thing: *a capability this run lacks, which a human possesses.* Every other `CANNOT-VERIFY` cause routes to `failures`.
- `checklist_path` is present if and only if `last_outcome == "awaiting_human"`.
- A pause does not consume a loop iteration. `iteration` increments only at the top of LOOP.
- `skills/verifying-implementation/**` is **not** modified.
- The orchestrator never reads product code (Hard Rule 6), so it cannot author `how_to_check` / `where_to_observe`. The verifier must supply them.
- Fix-before-pause: when `failures` and `blocked` coexist in `human-in-loop`, fix failures first and re-verify. Pause only once everything machine-checkable is green.

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `tests/regression-tests/check-stage2-gate.test.ts` | The test harness. Encodes all 13 static assertions from the spec as vitest `it()` blocks; `-t "A1:|A2:"` runs a subset. | Create |
| `tsconfig.json` | Strict `noEmit` config so `pnpm typecheck` actually checks the harness. | Create |
| `package.json` | vitest/typescript devDeps; expose the harness as `pnpm verify:stage2`. | Modify |
| `skills/autonomous-feature-development/stage-verify.md` | Verifier contract (mode-blind), orchestrator translation table, state schema, checklist template, STOP block, resume procedure. | Rewrite |
| `skills/autonomous-feature-development/stage-review-fix.md` | Loop Control step `1a`; Stage 2 Clearance Gate. | Modify |
| `skills/autonomous-feature-development/stage-impl.md` | File-ownership table gains a `verifications/` row. | Modify |
| `skills/autonomous-feature-development/SKILL.md` | Juncture 2 wording; subagent rule made true. | Modify |
| `skills/human-in-loop-feature-development/SKILL.md` | File-based results contract and the `continue` resume signal. | Modify |
| `docs/architecture/002-skills.md` | Sync the juncture-2 description. | Modify |
| `CHANGELOG.md` | Entry under a new Unreleased heading. | Modify |
| `docs/user-feedbacks/2026-07-09-user-feedback.md` | Mark Bug 1 resolved. | Modify |

**Why a committed harness rather than ad-hoc greps.** This repo ships prompts, not code, so nothing else can fail on a regression. The harness is the only mechanism that makes assertion 1–13 enforceable next time someone edits a stage file. It is the plan's "test suite" and every task below runs it.

## Assertion → Task Map

| ID | Assertion | Made green by |
| --- | --- | --- |
| A1 | `needs_human` gone from `skills/` and `docs/architecture/` | Task 2 |
| A2 | Verifier contract section contains no `interaction_mode` / `human-in-loop` | Task 2 |
| A5 | No stale two-value `last_outcome` enum anywhere; new enum defined once | Task 2 |
| A6 | `## Resume after human verification` exists and the `resume` pointer names it exactly | Task 2 |
| A9 | Verifier schema has `blocked` / `how_to_check` / `where_to_observe` | Task 2 |
| A10 | `blocked` vs `CANNOT-VERIFY` disambiguation table present | Task 2 |
| A11 | Checklist uses `Result: (pending)` and has no redundant checkbox | Task 2 |
| A3 | Loop Control has the `1a` pause branch keyed on `awaiting_human` | Task 3 |
| A4 | Stage 2 Clearance Gate gates on `last_outcome == "pass"` | Task 3 |
| A7 | Engine `SKILL.md` still states the subagent rule | Task 4 |
| A12 | `stage-impl.md` ownership table lists `verifications/` | Task 4 |
| A8 | `002-skills.md` describes the `awaiting_human` pause | Task 5 |
| A13 | HIL `SKILL.md` names the checklist file and the `continue` signal | Task 5 |

**Note on A5.** The spec's assertion 5 reads "documented identically in every file that mentions it." That is not mechanically checkable, because `stage-impl.md` names the file in an ownership table and `stage-final.md` reads one field from it — neither restates the schema. The harness enforces the stricter, checkable form of the same intent: the schema is defined exactly once (in `stage-verify.md`) and the superseded two-value enum appears nowhere.

---

### Task 1: Static assertion harness

**Files:**
- Create: `tests/regression-tests/check-stage2-gate.test.ts`
- Create: `tsconfig.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm verify:stage2`, a vitest suite of 13 `it()` blocks named `A1:`…`A13:`.
  Exits `0` only if every assertion passes. `-t "A3:|A4:"` runs a subset. Every later
  task runs this.

- [ ] **Step 1: Add the dev dependencies**

```bash
pnpm add -D vitest typescript @types/node
```

- [ ] **Step 2: Write the failing test (the harness itself)**

Create `tests/regression-tests/check-stage2-gate.test.ts`:

```ts
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
```

Two decisions worth stating. `read()` **throws** on a missing file rather than
returning `""`: several assertions check that a string is *absent*, and an empty
string satisfies all of them vacuously — a harness that silently passes because it
opened nothing is worse than no harness. And `ROOT` is derived from `import.meta.url`,
not `cwd`, so the assertions mean the same thing wherever the suite is invoked from.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["tests/**/*.ts"]
}
```

vitest strips types without checking them, so `typecheck` below is what makes the
TypeScript load-bearing rather than decorative.

- [ ] **Step 4: Register the harness in `package.json`**

In `package.json`, replace the `scripts` block:

```json
  "scripts": {
    "version:bump": "node scripts/version/bump-version.js",
    "version:check": "node scripts/version/check-version.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "verify:stage2": "vitest run tests/regression-tests/check-stage2-gate.test.ts"
  },
```

- [ ] **Step 5: Run the suite to verify it fails**

Run: `pnpm verify:stage2`

Expected: exit code 1, `12 failed | 1 passed (13)`.

- A5 fails on the stale two-value enum in `stage-verify.md`.
- A11 fails: the checklist still has a redundant `- [ ]` checkbox.
- A13 fails on the missing `` `continue` `` signal — the checklist path is already named
  in the HIL skill; only the resume signal is absent.
- A1, A2, A3, A4, A6, A8, A9, A10, A12 fail for the obvious reason (the thing does not
  exist yet).
- **A7 passes.** The rule text is already in `SKILL.md`; it is merely *untrue* today,
  which is what Task 2 fixes. The harness cannot detect a lie, only an absence — this is
  the one assertion carrying real residual risk, and it is why A2 exists to check the
  behaviour the rule describes.

If any of A1–A6 or A8–A13 *passes* at this point, the harness is wrong, not the skills.
Stop and fix the harness.

- [ ] **Step 6: Confirm the harness typechecks**

Run: `pnpm typecheck`

Expected: exit 0, no output.

- [ ] **Step 7: Commit**

```bash
git add tests/regression-tests/check-stage2-gate.test.ts tsconfig.json package.json pnpm-lock.yaml
git commit -m "test(verify): add static assertion harness for stage 2 gate"
```

---

### Task 2: Rewrite the verify stage

**Files:**
- Modify: `skills/autonomous-feature-development/stage-verify.md` (full rewrite)

**Interfaces:**
- Consumes: `mcp_available` and the resolved commands, injected by `stage-impl.md` Step 0.7.
- Produces: the verifier output schema (`outcome`, `failures`, `verified[]`, `blocked[]`); the `verification-state.json` schema whose `last_outcome` enum is `"pass" | "fail" | "awaiting_human"`; the heading `## Resume after human verification`, which `stage-review-fix.md` Task 3 refers to by name.

- [ ] **Step 1: Run the assertions this task must turn green, and watch them fail**

Run: `pnpm verify:stage2 -t "A1:|A2:|A5:|A6:|A9:|A10:|A11:"`

Expected: `7 failed (7)`, exit 1.

- [ ] **Step 2: Replace the entire contents of `skills/autonomous-feature-development/stage-verify.md`**

````markdown
# Stage 2: Verification (loop VERIFY step)

The orchestrator does NOT verify or fix directly. It spawns subagents and routes on
their structured output.

**The verifier reports facts. The orchestrator decides policy.** Every mode-dependent
decision on this page belongs to the orchestrator.

## Verifier subagent contract (mode-blind)

Spawn a **verifier subagent** (single responsibility). It receives `spec_path` (absent
in Mode B), `mcp_available`, and the resolved commands. It is **not** given the
orchestrator's interaction mode and makes no mode-dependent decision.

It:

1. Runs the `verifying-implementation` skill — boots the system and exercises the
   changed endpoints/paths.
2. Matches observed output against the acceptance criteria in `spec_path`. **Mode B
   has no `spec_path`** — there the verifier instead exercises the changed paths for
   regressions only (boot succeeds and the changed endpoints/paths still work), with
   no spec-acceptance match.
3. Returns the schema below.

```json
{
  "outcome": "pass" | "fail",
  "failures": ["<root cause>", ...],
  "verified": [{ "ac": "...", "result": "PASS" | "FAIL", "evidence": "..." }],
  "blocked": [
    {
      "ac": "...",
      "reason": "needs browser; mcp_available=n",
      "how_to_check": "<smallest action a human can take>",
      "where_to_observe": "<URL / screen / log>"
    }
  ]
}
```

Rules:

- `outcome` reflects **only** the acceptance criteria the verifier could actually
  exercise. Entries in `blocked` never influence `outcome`.
- For each AC that needs the browser while `mcp_available == n`: do **not** attempt
  it. Add it to `blocked`, filling in `how_to_check` and `where_to_observe`. These are
  mandatory — the orchestrator is forbidden from reading product code (Hard Rule 6)
  and therefore cannot author them.
- Verify every other AC normally (curl / DB / logs / files / browser) and record each
  in `verified` with its evidence.

### `blocked` vs `CANNOT-VERIFY`

`verifying-implementation` returns `CANNOT-VERIFY` for several reasons. Only one of
them is human-handoff material. Route the rest to `failures`.

| Underlying cause                            | Goes to                        |
| ------------------------------------------- | ------------------------------ |
| AC needs a browser AND `mcp_available == n` | `blocked`                      |
| System failed to start                      | `failures` (→ `outcome: fail`) |
| AC unclear or unmeasurable                  | `failures` (→ `outcome: fail`) |
| Any other `CANNOT-VERIFY`                   | `failures` (→ `outcome: fail`) |

`blocked` means exactly one thing: **a capability this run lacks, which a human
possesses.** Nothing else. A crashed service is a failure, not a checklist item.

## Orchestrator: translate verifier output

The orchestrator maps the verifier's facts onto mode policy:

| `blocked`  | `outcome` | `autonomous`               | `human-in-loop`           |
| ---------- | --------- | -------------------------- | ------------------------- |
| empty      | `pass`    | → REVIEW                   | → REVIEW                  |
| empty      | `fail`    | Fix on failure             | Fix on failure            |
| non-empty  | `fail`    | hard-stop (CANNOT-VERIFY)  | **Fix on failure first**  |
| non-empty  | `pass`    | hard-stop (CANNOT-VERIFY)  | Human handoff → **PAUSE** |

**Fix-before-pause.** When real failures and blocked criteria coexist in
`human-in-loop`, run Fix on failure first and re-verify. Never hand a human a
checklist against code already known to be broken. The pause happens only once
everything machine-checkable is green. If the fix loop exhausts its 3 rounds, the
pipeline hard-stops and the pause is never reached.

**`autonomous` hard-stop.** Write `.loop-logs/<id>/error/verification-failure.md` with
the blocked AC list and stop, exactly as the 3-round failure path below does. This is a
backstop: Stage 0.7 already refuses to start an autonomous run with UI acceptance
criteria and no MCP.

## Verification state (single source of truth)

After **every** verify round — pass, fail, or pause — the orchestrator writes
`.loop-logs/<id>/tasks/verification-state.json`:

```json
{
  "rounds_completed": 2,
  "last_outcome": "pass" | "fail" | "awaiting_human",
  "checklist_path": ".loop-logs/<id>/verifications/verification-2.md",
  "resume": "See skills/autonomous-feature-development/stage-verify.md § Resume after human verification",
  "notes": "<optional context>"
}
```

- `checklist_path` is present **if and only if** `last_outcome == "awaiting_human"`.
- The `resume` pointer is load-bearing. A paused turn ends; the orchestrator's next
  context may be fresh. This field tells it where to find its own instructions.
- This file is the sole input to the **Stage 2 Clearance Gate** in
  `./stage-review-fix.md`, which admits the REVIEW step only when `last_outcome` is
  `"pass"`.

## Human verification handoff (human-in-loop only)

Reached when `outcome == "pass"` and `blocked` is non-empty.

1. The orchestrator writes `.loop-logs/<id>/verifications/verification-<round>.md`
   (`<round>` = the verify-round counter, incremented per verify), copying
   `how_to_check` and `where_to_observe` verbatim from the verifier's `blocked[]`:

   ```markdown
   # Verification Checklist — Round <round>

   **Spec:** <spec_path>
   **How to run:** `<start_cmd>` — wait for the ready signal, then verify each item.

   ## Auto-verified (reference)
   - [PASS|FAIL] <ac> — <evidence>

   ## Needs your verification
   - <ac>
     - How to check: <how_to_check>
     - Where to observe: <where_to_observe>
     - Result: (pending)

   ---
   When every `Result:` line reads PASS or FAIL, reply `continue`.
   ```

   `Result:` is the single source of truth per item, and takes exactly one of
   `(pending)`, `PASS`, or `FAIL — <notes>`. There is deliberately no checkbox
   alongside it: a second field could disagree with the first.

2. The orchestrator writes `verification-state.json` with
   `"last_outcome": "awaiting_human"` and `checklist_path` set.

3. The orchestrator prints:

   ```
   Verification checklist ready at <checklist_path>.
   Fill in each `Result:` line (PASS or FAIL — <notes>), then reply `continue`.
   ```

4. **STOP.**

   ```
   STOP — Stage 2 is awaiting human verification.

   Do NOT run the REVIEW step.
   Do NOT spawn reviewers, a consolidator, or any fix agent.
   Do NOT advance to Stage 3 or Stage 4.

   End the turn now. Resume only on the human's reply, at
   "Resume after human verification" below.
   ```

## Resume after human verification

Triggered by the human's `continue` reply. The orchestrator:

1. Re-reads `checklist_path` from `verification-state.json`.
2. **Any item still `(pending)`** → stay paused. Print which items are pending and
   re-prompt. Do not guess. Do not proceed. End the turn again.
3. **Any `FAIL`** → write `"last_outcome": "fail"`, take the human's `FAIL — <notes>`
   text as the entries of `failures`, and run "Fix on failure" below. Re-verify from
   the top of this stage afterwards.
4. **All `PASS`** → merge the human's results with the verifier's `verified[]`, write
   `"last_outcome": "pass"`, drop `checklist_path`, and proceed to the REVIEW step in
   `./stage-review-fix.md`.

Step 4's state write is the only thing that unlocks the Clearance Gate. Skip it and the
run halts rather than proceeding — the gate fails closed by design.

**A pause does not consume a loop iteration.** Resume re-enters the current iteration
at this section; `iteration` increments only at the top of Loop Control.

## Fix on failure (≤3 inner rounds)

**If `outcome == "fail"`** (from the verifier, or from human-reported `FAIL` results):

1. For each entry in `failures`, the orchestrator spawns a **fix worktree agent**
   (single-responsibility implementer) using the TDD mini-loop from `stage-impl.md`,
   targeting that root cause. The agent — not the orchestrator — plans and implements
   the fix.
2. Squash-merge the fix (orchestrator):
   ```bash
   git merge --squash worktree/verification-fix-<round>
   git commit -m "fix: address verification failure round <round>"
   git worktree remove .worktrees/verification-fix-<round> --force
   git branch -D worktree/verification-fix-<round>
   ```
3. Re-run the verifier subagent. Repeat up to **3 inner rounds total**. Write
   `verification-state.json` after each round.

**If still failing after 3 rounds**, write `.loop-logs/<id>/error/verification-failure.md`:

```markdown
# Verification Failed After 3 Rounds

**Spec:** <spec_path, or "n/a — Mode B (regression-only verify)">

## Round 1

<full verifier output>

## Round 2

<full verifier output>

## Round 3

<full verifier output>
```

Commit and STOP the whole pipeline:

```bash
git add -A
git commit -m "wip: verification failed after 3 rounds — see .loop-logs/<id>/error/verification-failure.md"
```
````

- [ ] **Step 3: Run the assertions to verify they pass**

Run: `pnpm verify:stage2 -t "A1:|A2:|A5:|A6:|A9:|A10:|A11:"`

Expected: `7 passed (7)`, exit 0.

- [ ] **Step 4: Confirm nothing else regressed**

Run: `pnpm verify:stage2`

Expected: exit 1, with only A3, A4, A8, A12, A13 still failing. A7 passes.

- [ ] **Step 5: Commit**

```bash
git add skills/autonomous-feature-development/stage-verify.md
git commit -m "fix(autonomous-dev): make verifier mode-blind and define the stage 2 pause state"
```

---

### Task 3: Enforce the pause in Loop Control

**Files:**
- Modify: `skills/autonomous-feature-development/stage-review-fix.md:20-40` (Loop Control), and the top of Part 1.

**Interfaces:**
- Consumes: `verification-state.json` `last_outcome` from Task 2; the heading `Resume after human verification` in `stage-verify.md`.
- Produces: the Stage 2 Clearance Gate — the only admission path to the REVIEW step.

- [ ] **Step 1: Run the assertions this task must turn green, and watch them fail**

Run: `pnpm verify:stage2 -t "A3:|A4:"`

Expected: `2 failed (2)`, exit 1.

- [ ] **Step 2: Replace the Loop Control block**

In `skills/autonomous-feature-development/stage-review-fix.md`, replace this:

````markdown
```
iteration = 0
LOOP:
  iteration += 1
  1. VERIFY  — run the VERIFY step in ./stage-verify.md. If verify hard-stops after 3
     inner rounds, the pipeline already stopped (verification-failure.md committed).
  2. REVIEW  — run Part 1: spawn reviewers + consolidator, then write
     .loop-logs/<id>/code-review/round-<iteration>.md.
  3. If actionable count == 0:  exit LOOP → "After the Loop".
  4. If iteration == 5:  cap reached → write .loop-logs/<id>/error/review-loop-exhausted.md,
     commit wip:, exit LOOP → "After the Loop".
  5. Otherwise: run Part 2 (fix each actionable issue), squash-merge fixes, then GOTO
     LOOP (re-verify before the next review).
```
````

with this:

````markdown
```
iteration = 0
LOOP:
  iteration += 1
  1. VERIFY  — run the VERIFY step in ./stage-verify.md. If verify hard-stops after 3
     inner rounds, the pipeline already stopped (verification-failure.md committed).
  1a. PAUSE CHECK — if verify handed off to the human (verification-state.json
     last_outcome == "awaiting_human"): STOP. Do NOT run REVIEW. End the turn.
     Resume at "Resume after human verification" in ./stage-verify.md, which
     re-enters this iteration without incrementing `iteration`.
  2. REVIEW  — run the Stage 2 Clearance Gate below, then Part 1: spawn reviewers +
     consolidator, then write .loop-logs/<id>/code-review/round-<iteration>.md.
  3. If actionable count == 0:  exit LOOP → "After the Loop".
  4. If iteration == 5:  cap reached → write .loop-logs/<id>/error/review-loop-exhausted.md,
     commit wip:, exit LOOP → "After the Loop".
  5. Otherwise: run Part 2 (fix each actionable issue), squash-merge fixes, then GOTO
     LOOP (re-verify before the next review).
```

A pause does not consume an iteration. `iteration` increments only at the top of LOOP.
The ≤5 cap therefore counts review rounds, not human round-trips.
````

- [ ] **Step 3: Insert the Stage 2 Clearance Gate at the top of Part 1**

In the same file, immediately **after** the line `## Part 1: Review (one iteration)` and **before** the line `### Spawn fresh reviewers`, insert:

````markdown
### Stage 2 Clearance Gate

**This check is mandatory. Do not spawn any reviewer until it passes.**

Read `.loop-logs/<id>/tasks/verification-state.json`.

**Proceed only if `last_outcome == "pass"`.** Any other value — and a missing or
unwritten file — halts the pipeline. The gate requires positive confirmation rather
than merely forbidding `awaiting_human`, so a silently-skipped verify is caught too.

If the gate does not pass, print exactly:

```
STOP — Stage 2 Clearance Gate failed.

verification-state.json last_outcome = <value, or "file missing">
Expected: "pass"

Stage 2 is not cleared. Reviewers were NOT spawned.
If last_outcome is "awaiting_human", the run is waiting on the checklist at
<checklist_path> — resume at "Resume after human verification" in ./stage-verify.md.
```

Then end the turn. Do not advance to Stage 3 or Stage 4.
````

- [ ] **Step 4: Run the assertions to verify they pass**

Run: `pnpm verify:stage2 -t "A3:|A4:"`

Expected: `2 passed (2)`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add skills/autonomous-feature-development/stage-review-fix.md
git commit -m "fix(autonomous-dev): gate stage 3 review behind stage 2 clearance"
```

---

### Task 4: Sync the engine skill and file ownership

**Files:**
- Modify: `skills/autonomous-feature-development/stage-impl.md` (file-ownership table, ~line 141; Step 0.7, ~line 126)
- Modify: `skills/autonomous-feature-development/SKILL.md:50-59`

**Interfaces:**
- Consumes: the verifier contract from Task 2, the gate from Task 3.
- Produces: `mcp_available` as the verifier's only capability input — the subagent rule in `SKILL.md` becomes factually true.

- [ ] **Step 1: Run the assertions this task must turn green**

Run: `pnpm verify:stage2 -t "A7:|A12:"`

Expected: A7 passes (rule text already present), A12 fails — the file-ownership table has no `verifications/` row. Exit 1.

A7 is already green and this task must keep it that way. It guards the rule text that Task 2 made true.

- [ ] **Step 2: Add the `verifications/` row to the file-ownership table**

In `skills/autonomous-feature-development/stage-impl.md`, in the table under
`## Orchestrator: Agent Output Schema and File Ownership`, replace this row:

```markdown
| `.loop-logs/<id>/tasks/verification-state.json` | Orchestrator                                                  | After each verification round (Stage 2)                                  |
```

with these two rows:

```markdown
| `.loop-logs/<id>/tasks/verification-state.json` | Orchestrator                                                  | After every verification round (Stage 2) — pass, fail, or `awaiting_human` |
| `.loop-logs/<id>/verifications/verification-<round>.md` | Orchestrator (written), **human (edits `Result:` lines)** | On human handoff (Stage 2, `human-in-loop` only)                    |
```

- [ ] **Step 3: Tighten Step 0.7's verifier-input sentence**

In the same file, in `### Step 0.7 — Probe verification capability (Mode A)`, replace:

```markdown
Record `mcp_available` and inject it into the verifier subagent prompt. Mode B has
no `spec_path` — skip the AC-scan; the verify-time per-AC backstop below still applies.
```

with:

```markdown
Record `mcp_available` and inject it into the verifier subagent prompt. It is the
verifier's **only** capability input — never inject `interaction_mode` into any
subagent. The verifier reports blocked criteria as facts; the orchestrator alone
translates them into mode policy (see `stage-verify.md`). Mode B has no `spec_path` —
skip the AC-scan; the verify-time per-AC backstop still applies.
```

- [ ] **Step 4: Correct juncture 2 in the engine skill**

In `skills/autonomous-feature-development/SKILL.md`, replace:

```markdown
2. **Stage 2 verify fallback** — a UI acceptance criterion needs the browser but MCP is absent.
```

with:

```markdown
2. **Stage 2 verify fallback** — the verifier reports `blocked` acceptance criteria
   (browser needed, MCP absent). `autonomous` hard-stops; `human-in-loop` writes a
   checklist, sets `last_outcome: "awaiting_human"`, and **pauses**. The Stage 2
   Clearance Gate in `stage-review-fix.md` blocks Stage 3 until the human clears it.
```

- [ ] **Step 5: Run the assertions to verify they pass**

Run: `pnpm verify:stage2 -t "A7:|A12:"`

Expected: `2 passed (2)`, exit 0.

- [ ] **Step 6: Confirm the whole suite is now only missing the docs assertions**

Run: `pnpm verify:stage2`

Expected: exit 1, with exactly A8 and A13 still failing.

- [ ] **Step 7: Commit**

```bash
git add skills/autonomous-feature-development/stage-impl.md skills/autonomous-feature-development/SKILL.md
git commit -m "fix(autonomous-dev): make the mode-blind subagent rule true across the engine"
```

---

### Task 5: Document the contract in the wrapper skill and architecture

**Files:**
- Modify: `skills/human-in-loop-feature-development/SKILL.md:18-26`
- Modify: `docs/architecture/002-skills.md` (the `interaction_mode` narrative, ~lines 98-110)

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: nothing downstream. This is the user-facing description of the contract.

- [ ] **Step 1: Run the assertions this task must turn green, and watch them fail**

Run: `pnpm verify:stage2 -t "A8:|A13:"`

Expected: `2 failed (2)`, exit 1.

- [ ] **Step 2: Rewrite juncture 2 in the wrapper skill**

In `skills/human-in-loop-feature-development/SKILL.md`, replace this list item:

```markdown
2. **Playwright MCP unavailable for a UI acceptance criterion** (Stage 2) — write a
   checklist to `.loop-logs/<id>/verifications/verification-<round>.md`, pause, let
   the human verify, and feed the results back into the fix loop.
```

with:

```markdown
2. **Playwright MCP unavailable for a UI acceptance criterion** (Stage 2) — write a
   checklist to `.loop-logs/<id>/verifications/verification-<round>.md`, set
   `last_outcome: "awaiting_human"`, then **stop and end the turn**. Stage 3 is
   blocked by the Stage 2 Clearance Gate until the human clears it.

   The human fills in each `Result:` line (`PASS`, or `FAIL — <notes>`) **in that
   file**, then replies `continue`. Chat carries only the go signal; the file carries
   the results, so they survive context loss and stay auditable under `.loop-logs/`.
   Any `FAIL` re-enters the fix loop; all `PASS` proceeds to review. Items left
   `(pending)` keep the run paused.
```

- [ ] **Step 3: Sync the architecture doc**

In `docs/architecture/002-skills.md`, find the sentence describing what subagents receive:

```markdown
it** — they receive concrete inputs (resolved commands, `mcp_available`) and stay
```

Immediately after the paragraph containing it, insert:

```markdown
**Stage 2 is gated, not merely instructed.** When the verifier reports `blocked`
acceptance criteria it lacked the capability to check, `human-in-loop` writes a human
checklist and records `last_outcome: "awaiting_human"` in
`.loop-logs/<id>/tasks/verification-state.json`. The Stage 2 Clearance Gate at the top
of the review step admits reviewers only when `last_outcome == "pass"`, so a missing,
stale, or `awaiting_human` state file halts the pipeline. The gate fails closed.
```

- [ ] **Step 4: Run the assertions to verify they pass**

Run: `pnpm verify:stage2 -t "A8:|A13:"`

Expected: `2 passed (2)`, exit 0.

- [ ] **Step 5: Run the full suite**

Run: `pnpm verify:stage2`

Expected: `13 passed (13)`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/human-in-loop-feature-development/SKILL.md docs/architecture/002-skills.md
git commit -m "docs: describe the stage 2 clearance gate and file-based results contract"
```

---

### Task 6: Close out the changelog and the bug report

**Files:**
- Modify: `CHANGELOG.md:5` (insert an Unreleased section above `## [0.3.0]`)
- Modify: `docs/user-feedbacks/2026-07-09-user-feedback.md:37`

**Interfaces:**
- Consumes: the completed fix.
- Produces: nothing.

- [ ] **Step 1: Add the changelog entry**

In `CHANGELOG.md`, insert immediately before the `## [0.3.0] - 2026-07-09` line:

```markdown
## [Unreleased]

### Fixed

- Stage 2 human verification no longer falls through to Stage 3. The verifier subagent is now mode-blind — it returns a `blocked[]` list of acceptance criteria it lacked the capability to check, and the orchestrator alone maps that onto mode policy. In `human-in-loop`, a blocked criterion writes a checklist, records `last_outcome: "awaiting_human"`, and pauses; a new fail-closed Stage 2 Clearance Gate refuses to spawn reviewers unless `last_outcome == "pass"`. The human records results in the checklist file and replies `continue`.

```

- [ ] **Step 2: Mark Bug 1 resolved**

In `docs/user-feedbacks/2026-07-09-user-feedback.md`, replace the heading:

```markdown
## Bug 1 - Orchastrator agent misbehave
```

with:

```markdown
## [x] Bug 1 - Orchastrator agent misbehave
```

and append to the end of that section:

```markdown
### Resolution

Fixed by `docs/superpowers/plans/2026-07-10-stage-2-human-verification-gate.md`.

Two defects, both on the same path. The pause lived in the callee (`stage-verify.md`)
while control flow lived in the caller (`stage-review-fix.md` Loop Control), which
sequenced VERIFY → REVIEW unconditionally. And the verifier was told to branch on
`interaction_mode`, which it was never given — so it might never have reported
`needs_human` at all.

The pause is now enforced by a fail-closed Stage 2 Clearance Gate that reads
`verification-state.json` and admits reviewers only on `last_outcome == "pass"`.
Regression-guarded by `pnpm verify:stage2`.
```

- [ ] **Step 3: Run the full suite one last time**

Run: `pnpm verify:stage2`

Expected: `13 passed (13)`, exit 0.

- [ ] **Step 4: Confirm no stale contract survives anywhere in the repo**

Run: `grep -rn "needs_human" skills/ docs/architecture/ CHANGELOG.md`

Expected: no output, exit 1. (Matches in `docs/superpowers/` are expected and correct — the spec and this plan both describe the removal.)

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/user-feedbacks/2026-07-09-user-feedback.md
git commit -m "docs: changelog and close bug 1 from the 2026-07-09 feedback"
```

---

## Self-Review

**Spec coverage.** Walked each spec section against the task list:

| Spec section | Task |
| --- | --- |
| §1 Verifier output contract (mode-blind) | Task 2, Step 2 |
| §1 `blocked` vs `CANNOT-VERIFY` disambiguation | Task 2, Step 2 |
| §2 Orchestrator translation table + fix-before-pause | Task 2, Step 2 |
| §3 State, single source of truth | Task 2, Step 2 |
| §4 Loop Control `1a` + Stage 2 Clearance Gate | Task 3 |
| §5 Checklist file and results channel | Task 2, Step 2 |
| §6 Resume after human verification | Task 2, Step 2 |
| §7 Edge cases | Encoded in Task 2's resume/translate sections and Task 3's gate |
| §Scope of change — all 8 files | Tasks 2–6 |
| §Verification — 8 assertions | Task 1 (as 13 vitest assertions) |
| `verifying-implementation/**` not modified | No task touches it |

No gaps.

**Placeholder scan.** No "TBD", no "handle edge cases", no "similar to Task N". Every code step carries its literal replacement text. The one deviation from the spec's wording — assertion 5 — is called out explicitly in the Assertion → Task Map with its reasoning, not silently.

**Type consistency.** Names used identically across tasks: `last_outcome`, `awaiting_human`, `checklist_path`, `resume`, `blocked`, `how_to_check`, `where_to_observe`, `verified`, `failures`, `outcome`. The harness's `CONTRACT_HEADING` (`## Verifier subagent contract (mode-blind)`) and `RESUME_HEADING` (`## Resume after human verification`) match the headings authored in Task 2 exactly — A2, A6, A9, and A10 all key off them, so a typo in either place fails loudly rather than silently passing.

One trap worth naming: A5's stale-enum probe uses a negative lookahead, because the three-value enum string *contains* the two-value one as a prefix. A naive `includes()` would report the fixed file as stale forever.
