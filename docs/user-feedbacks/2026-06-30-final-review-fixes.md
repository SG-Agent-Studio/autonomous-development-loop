# Final-Review Findings & Fixes — Stage 2/3 Refactor

**Date:** 2026-06-30
**Relates to:** [spec](../superpowers/specs/2026-06-29-autonomous-dev-stage-refactor-design.md),
[plan](../superpowers/plans/2026-06-29-autonomous-dev-stage-refactor.md)
**Context:** After the six-task refactor (run `id` + namespacing, delegated verify,
capped verify↔review loop, summary reporting, orchestrator-purity rule, cleanup skill)
was implemented and each task passed its per-task review, a final whole-branch review
was run on the most capable model to catch **cross-file** inconsistencies that
single-task reviews cannot see.

## Outcome of the final review

Verdict: **ready to merge with fixes.** All cross-file integration checks PASSED —
every `./stage-*.md` reference resolves to content that says what the referrer claims,
the `id` lifecycle and `.loop-logs/<id>/` namespacing are consistent, the loop exits
and caps correctly (actionable==0 checked before the cap; cap exhaustion is graceful,
not a hard abort), nested caps (verify ≤3 inner × loop ≤5 outer) don't contradict, and
orchestrator purity holds. No over-building beyond the spec.

Crucially, **every finding traced to the approved spec/plan, not to the
implementation** — the implementers faithfully transcribed the plan's mandated content.
The user chose to fix the design-level gap and the wording nits, and to update the
spec so it stays the source of truth.

## Findings and what was applied

### 1. (Important) Mode B inherited a spec-dependent VERIFY but is the no-spec branch

**Finding:** `SKILL.md` selects Mode B precisely when `plan_path + spec_path` are
*absent*. Mode B then enters the same loop, whose VERIFY step matched output "against
the acceptance criteria in `spec_path`" and whose error templates printed
`**Spec:** <spec_path>`. With no `spec_path` in Mode B, the inherited VERIFY had
nothing to verify against — a contradiction only visible across `SKILL.md` +
`stage-review-fix.md` + `stage-verify.md`. Root cause: spec §7 ("Mode B inherits the
full loop") did not say what verify does without a spec.

**Fix applied:**
- `stage-verify.md` — the verifier's spec-match step now states Mode B has no
  `spec_path` and instead exercises the changed paths for **regressions only** (boot
  succeeds + changed paths still work, no spec-acceptance match). The
  `verification-failure.md` template's `**Spec:**` line tolerates absence
  (`n/a — Mode B (regression-only verify)`).
- `stage-review-fix.md` Part 0 — added a sentence: Mode B has no `spec_path`, so the
  inherited VERIFY runs in regression-only mode (pointer to `stage-verify.md`). The
  cap-exhaustion `**Spec:**` line tolerates absence (`n/a — Mode B`).
- `spec` §3 and §7 — documented the regression-only Mode B verify behavior so the
  design and the skill agree.

### 2. (Minor) Round-log "fixed this iteration" was written before the fix

**Finding:** The `code-review/round-<N>.md` Disposition line read "Actionable … fixed
this iteration", but the log is written during REVIEW, *before* Part 2 fixes run. On
the cap-exhaustion round the loop exits before any fix, so `round-5.md` would claim
"fixed" while `review-loop-exhausted.md` lists the same issues as outstanding.

**Fix applied:** changed "fixed this iteration" → "to fix this iteration" in
`stage-review-fix.md` and in spec §5, making the field a forward-looking intent that
stays accurate even when the cap pre-empts the fix step.

### 3. (Minor) Orchestrator-purity rule's writable-file list read as exhaustive

**Finding:** `SKILL.md` hard rule 6 said the orchestrator "may … write `summary.md` +
`code-review/round-<N>.md`", but it also writes task JSON, `verification-state.json`,
and `error/*.md` — a reader could take the two-item list as the complete set.

**Fix applied:** rule 6 now says "write the run's log/state files (e.g. `summary.md`,
`code-review/round-<N>.md`, task JSON, `verification-state.json`, `error/*.md`)".

### 4. (Minor) Per-issue Phase 5 ("Verify") had no agent label

**Finding:** Phases 1–4 of the Per-Issue Fix Pipeline name their agent; Phase 5 just
said "`just lint` + `just test-unit` one final time", ambiguous against rule 6 (the
orchestrator never runs lint/test).

**Fix applied:** labeled it "Phase 5 — Verify (Implementer agent)" and added "The
orchestrator never runs lint/test itself."

### 5. (Minor) Summary "Loop iterations" source not pinned

**Finding:** `stage-final.md`'s `**Loop iterations:**` field sat next to a "Rounds"
field sourced from `verification-state.json` (which counts verifier rounds, not loop
iterations), inviting the orchestrator to conflate the two counters.

**Fix applied:** pinned the source — "(`<N>` = count of
`.loop-logs/<id>/code-review/round-<N>.md` files)".

### Deferred (not applied)

- **(Minor, cosmetic) cleanup-loop-logs `($t|fix-)` over-lists.** The `fix-` glob in
  the worktree/branch attribution loop prints `fix-*` entries once per task id. The
  skill already discloses this limitation and gates every deletion behind explicit
  user confirmation, so it is purely cosmetic output noise. Left as-is to avoid
  restructuring a destructive-ops skill for no behavioral gain; recorded here as a
  known follow-up (a `sort -u` on the gathered list would tidy the output).

## Verification

All original grep invariants from the plan still hold after the fixes
(`grep -rnE '\.loop-logs/(logs|tasks|error|code-review)/' skills/` → CLEAN; every
per-file marker present; markdown fences balanced). The fixes were re-reviewed before
merge.
