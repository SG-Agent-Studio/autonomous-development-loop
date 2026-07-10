# Stage 2 Human Verification Gate — Design

**Date:** 2026-07-10
**Status:** Approved
**Fixes:** Bug 1 in `docs/user-feedbacks/2026-07-09-user-feedback.md`
**Supersedes parts of:** `docs/superpowers/specs/2026-07-09-human-in-loop-feature-development-design.md`

## Problem

In `human-in-loop` mode with Playwright MCP unavailable, the orchestrator wrote the
Stage 2 verification checklist and then ran Stage 3 review anyway, instead of pausing
for the human's verification results.

### Root cause

Two defects on the same path, both introduced by `516e4b2` (which added the pause to
`stage-verify.md` but never touched the file that owns the loop calling into it).

**Defect A — the pause lives in the callee, control flow lives in the caller.**
`stage-review-fix.md` Loop Control sequences `VERIFY → REVIEW` unconditionally,
enumerating exactly one early exit (the 3-round verification hard stop). The word
`needs_human` appears nowhere in that file. The pause exists only as a parenthetical
at `stage-verify.md:59` — "Then **end the turn** (the orchestrator pauses here)" —
with no `STOP` directive, no gate, and no durable state. Every other stage boundary
in this pipeline is guarded by an explicit gate (see the Stage 1 Integrity Gate at
`stage-impl.md:351`); the Stage 2 → 3 boundary was guarded only by prose.

**Defect B — the verifier branches on a variable it is never given.**
`SKILL.md:56-59` declares subagents never branch on `interaction_mode` and receive
only `mcp_available`; `stage-impl.md:126` injects only `mcp_available`. Yet
`stage-verify.md:18-22` instructs the verifier to return `CANNOT-VERIFY` in
`autonomous` and `needs_human` in `human-in-loop`. The verifier cannot make that
decision. It may return `pass` — skipping browser criteria silently — and the
orchestrator proceeds to review with no checklist written at all.

Defect A produced the reported symptom. Defect B is latent on the same path and
produces a different flavour of it.

## Principle

**The verifier reports facts. The orchestrator decides policy.**

Mode-dependent behaviour belongs in exactly one place: the orchestrator. Subagents
receive concrete capability inputs and return observations.

## Design

### 1. Verifier output contract (mode-blind)

The verifier subagent receives `spec_path` (absent in Mode B), `mcp_available`, and
the resolved commands. It does **not** receive `interaction_mode`. It returns:

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
- `needs_human` is removed from the schema entirely. So is the mode-dependent
  `CANNOT-VERIFY` instruction.
- The verifier authors `how_to_check` and `where_to_observe`. This is not optional:
  Hard Rule 6 forbids the orchestrator from reading product code, so it cannot invent
  them. It only formats what the verifier returns.

#### `blocked` vs `CANNOT-VERIFY` — a required disambiguation

`verifying-implementation` (which the verifier runs) uses `CANNOT-VERIFY` for its own
reasons: the system would not start (`tier-3-procedure.md:21`), or the acceptance
criteria were unmeasurable (`tier-3-procedure.md:11`). Those are **not** human-handoff
material and must never reach `blocked`.

| Underlying cause | Goes to |
| --- | --- |
| AC needs a browser AND `mcp_available == n` | `blocked` |
| System failed to start | `failures` (→ `outcome: "fail"`) |
| AC unclear or unmeasurable | `failures` (→ `outcome: "fail"`) |
| Any other `CANNOT-VERIFY` | `failures` (→ `outcome: "fail"`) |

`blocked` means exactly one thing: *a capability this run lacks, which a human
possesses.* Nothing else.

### 2. Orchestrator translation table

The orchestrator maps the verifier's facts onto mode policy:

| `blocked` | `outcome` | `autonomous` | `human-in-loop` |
| --- | --- | --- | --- |
| empty | `pass` | → REVIEW | → REVIEW |
| empty | `fail` | Fix on failure | Fix on failure |
| non-empty | `fail` | hard-stop (CANNOT-VERIFY) | **Fix on failure first** |
| non-empty | `pass` | hard-stop (CANNOT-VERIFY) | write checklist, **PAUSE** |

**Fix-before-pause.** When real failures and blocked criteria coexist in
`human-in-loop`, the orchestrator runs the Fix on failure loop first and re-verifies.
A human is never handed a checklist against code already known to be broken. The pause
occurs only once everything machine-checkable is green. If the fix loop exhausts its
3 rounds, the pipeline hard-stops as it does today and the pause is never reached.

The `autonomous` + non-empty `blocked` rows preserve today's behaviour: a backstop for
the Stage 0.7 preflight hard-stop, which already refuses to start an autonomous run
with UI acceptance criteria and no MCP.

### 3. State — a single source of truth

`.loop-logs/<id>/tasks/verification-state.json` gains a third `last_outcome` value
rather than a parallel boolean. Two fields that can disagree are worse than one field
with three values.

```json
{
  "rounds_completed": 2,
  "last_outcome": "pass" | "fail" | "awaiting_human",
  "checklist_path": ".loop-logs/<id>/verifications/verification-2.md",
  "resume": "See skills/autonomous-feature-development/stage-verify.md § Resume after human verification",
  "notes": "<optional context>"
}
```

- `checklist_path` is present if and only if `last_outcome == "awaiting_human"`.
- The `resume` pointer is deliberate. A paused turn ends; the orchestrator's next
  context may be fresh. The state file must tell it where to find its own instructions.
- Written after **every** verify round, including `awaiting_human`. The old text said
  "after each verify (pass or fail)", which left the pause case undefined.

### 4. Control flow

`stage-review-fix.md` Loop Control gains the missing branch:

```
iteration = 0
LOOP:
  iteration += 1
  1. VERIFY — run the VERIFY step in ./stage-verify.md.
     If verify hard-stops after 3 inner rounds, the pipeline already stopped.
  1a. If verify paused for human (verification-state.json last_outcome ==
      "awaiting_human"): STOP. Do NOT run REVIEW. End the turn. Resume re-enters
      at "Resume after human verification" in ./stage-verify.md.
  2. REVIEW — run the Stage 2 Clearance Gate, then Part 1.
  3. If actionable count == 0: exit LOOP → "After the Loop".
  4. If iteration == 5: cap reached → ...
  5. Otherwise: run Part 2, squash-merge fixes, GOTO LOOP.
```

And a new **Stage 2 Clearance Gate**, at the top of the REVIEW step, modelled on the
existing Stage 1 Integrity Gate:

```
Read .loop-logs/<id>/tasks/verification-state.json.
Proceed ONLY IF last_outcome == "pass".
Otherwise print the STOP block below and halt. Do not spawn any reviewer.
```

The gate is **positive confirmation**: it requires `pass`, rather than merely
forbidding `awaiting_human`. This also catches a missing or unwritten state file,
which is what a silently-skipped verify looks like from the outside.

**A pause does not consume a loop iteration.** `iteration` increments only at the top
of LOOP. The pause stops before REVIEW; resume re-enters mid-iteration at the
results-merge step. The ≤5 cap therefore counts review rounds, not human round-trips.

### 5. Checklist file and the results channel

The human records results **in the file**, not in chat. Chat carries only the "go"
signal. Results are then durable, survive context compaction, and remain auditable
under `.loop-logs/`.

`.loop-logs/<id>/verifications/verification-<round>.md`:

```markdown
# Verification Checklist — Round <round>

**Spec:** <spec_path>
**How to run:** `<start_cmd>` — wait for the ready signal, then verify each item.

## Auto-verified (reference)
- [PASS|FAIL] <AC> — <evidence>

## Needs your verification
- <AC text>
  - How to check: <how_to_check from verifier>
  - Where to observe: <where_to_observe from verifier>
  - Result: (pending)

---
When every `Result:` line reads PASS or FAIL, reply `continue`.
```

No checkbox. `Result:` is the single source of truth per item — a checkbox alongside
it would be a second field that can disagree with the first.

`Result:` is the machine-readable field. It takes exactly one of:

- `(pending)` — untouched, the initial value
- `PASS`
- `FAIL — <notes>`

### 6. Resume after human verification

On the human's `continue`, the orchestrator:

1. Re-reads `checklist_path`.
2. **Any item still `(pending)`** → stay paused. Re-prompt naming the pending items.
   Do not guess, do not proceed.
3. **Any `FAIL`** → write `last_outcome = "fail"`; `failures` = the human's `FAIL`
   notes → run Fix on failure (≤3 inner rounds) → re-verify from the top of VERIFY.
4. **All `PASS`** → merge with the verifier's `verified[]`; write
   `last_outcome = "pass"`; drop `checklist_path` → proceed to REVIEW, which the
   Clearance Gate now admits.

Step 4's state write is what unlocks the gate. Without it the run would deadlock —
an intentional property: the gate fails closed.

### 7. Error handling and edge cases

| Case | Behaviour |
| --- | --- |
| Context compacted mid-pause | State file + checklist survive on disk. Gate blocks; `resume` pointer restores instructions. |
| State file missing at REVIEW | Gate fails closed (requires `pass`). Prints STOP. |
| Human replies `continue` with items pending | Stay paused, re-prompt. |
| Both `failures` and `blocked`, human-in-loop | Fix failures first, re-verify, then pause. |
| Fix loop exhausts 3 rounds before the pause | Existing hard-stop wins; pause never reached. |
| Mode B (no `spec_path`) | Regression-only verify. `blocked` may still be non-empty if a changed path is browser-only. Identical handling. |
| Human adds new criteria to the checklist | Out of scope. Ignored. |
| `autonomous` + non-empty `blocked` | Hard-stop, as today. |

## Scope of change

| File | Change |
| --- | --- |
| `skills/autonomous-feature-development/stage-verify.md` | Verifier schema (mode-blind, `blocked[]`, `verified[]`); translation table; `blocked` vs `CANNOT-VERIFY` disambiguation; checklist format with `Result:` lines; STOP block; new "Resume after human verification" section; state schema |
| `skills/autonomous-feature-development/stage-review-fix.md` | Loop Control step 1a; Stage 2 Clearance Gate at the top of REVIEW |
| `skills/autonomous-feature-development/stage-impl.md` | File-ownership table gains a `verifications/` row; confirm Step 0.7 injects `mcp_available` only |
| `skills/autonomous-feature-development/SKILL.md` | Juncture 2 wording; the "subagents never branch on `interaction_mode`" rule becomes true |
| `skills/human-in-loop-feature-development/SKILL.md` | Juncture 2 describes the file-based results contract and the resume signal |
| `docs/architecture/002-skills.md` | Sync the juncture-2 description |
| `CHANGELOG.md` | Entry |
| `docs/user-feedbacks/2026-07-09-user-feedback.md` | Mark Bug 1 resolved |

`skills/verifying-implementation/**` is **not** modified. Its `CANNOT-VERIFY`
vocabulary is correct for its own scope; the mapping happens in the verifier's wrapper.

## Verification

Static consistency check over the skill tree. Every assertion below must hold:

1. `needs_human` appears nowhere in the verifier's returned schema.
2. `interaction_mode` appears in no subagent prompt specification.
3. `stage-review-fix.md` contains the Loop Control `1a` pause branch.
4. `stage-review-fix.md` contains the Stage 2 Clearance Gate, gating on
   `last_outcome == "pass"`.
5. The `verification-state.json` schema is documented identically in every file that
   mentions it (`stage-verify.md`, `stage-impl.md`, `stage-final.md`).
6. `stage-verify.md` contains a "Resume after human verification" section, and the
   `resume` pointer in the state schema names it exactly.
7. Read-through: `SKILL.md`'s subagent rule no longer contradicts `stage-verify.md`.
8. Every doc referencing the old three-outcome verifier schema is updated.

Both current defects would be caught by assertions 1–4. That is the argument for
static sufficiency here.

**Residual risk, stated plainly.** A static check proves the instructions are
coherent. It cannot prove a model obeys a `STOP` block. This is precisely why the
Clearance Gate is a *file read with a positive condition* rather than a louder
sentence — it converts obedience into a mechanical check with a fail-closed default.
A live dry-run (throwaway plan, one UI acceptance criterion, Playwright MCP off,
expect `verification-1.md` written and `.loop-logs/<id>/code-review/` absent) remains
available as follow-up behavioural evidence if wanted.

## Decisions

| Question | Decision | Reason |
| --- | --- | --- |
| Scope: defect A only, or A and B? | Both | Same defect class, same code path, one round of edits. Fixing A alone leaves a run where no checklist is ever written. |
| Verifier contract: inject `interaction_mode`, or keep the verifier mode-blind? | Mode-blind; orchestrator translates | Preserves the existing subagent rule instead of repealing it. Policy lives in one place. |
| Results channel: chat reply, or the checklist file? | Checklist file; chat carries the `continue` signal | Matches the reported expected behaviour. Durable across compaction, auditable, and keeps the checklist from being a write-only artifact. |
| Enforcement: prose `STOP`, or durable state plus a gate? | Durable state plus a mandatory gate | Prose is what failed. A gate converts obedience into a file read. |
| State shape: `last_outcome` plus an `awaiting_human` boolean, or one field? | One field, three values | Two fields can disagree. Fewer states, fewer bugs. |
| Failures and blocked criteria coexist in human-in-loop | Fix failures first, then pause | Never hand a human a checklist against known-broken code. |
| Verification approach | Static consistency check | Both live defects are statically detectable. Live dry-run available as follow-up. |
