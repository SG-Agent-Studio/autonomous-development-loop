---
name: verifying-implementation
description: Use when work has observable runtime behavior — touches a running service (Backend/Docker/DB/UI/queues/jobs), has a plan Verification section, or has acceptance criteria that require observing the live system. Applies even when unit tests pass.
---

# Verifying Implementation

Tests passing is not done. When work has runtime behavior, the only honest evidence of completion is observing the running system meet its acceptance criteria. The implementer cannot judge that — bias toward declaring own work done is universal. A fresh subagent produces the verdict.

**Complements `superpowers:verification-before-completion`.** That skill is the iron law (no claims without fresh evidence). This skill defines what counts as evidence when work has runtime behavior, and how to produce it.

**Violating the letter of this skill is violating the spirit.** "I followed the intent" is not an exemption.

Announce on use: _"I'm using verifying-implementation to gate this completion claim."_

## When this skill fires (any one trigger = MUST run the gate)

1. **Work touches a running service** — Backend, Docker, DB, Phoenix, UI, scheduled jobs, queues, anything with runtime process state.
2. **Plan or spec has an explicit Verification section** — that section is a contract, not a suggestion.
3. **AC describe observable runtime behavior** — HTTP responses, UI state, DB row mutations, file writes, log lines, traces in observability tools, queue messages, scheduled jobs firing.

None of the above? Fall back to `superpowers:verification-before-completion`.

## Exemption — and only this one

**Pure-doc changes** (no source files modified). Skip Tier 3.

"Small change," "obvious fix," "internal refactor," "just a config tweak," "I'm confident" — not exemptions.

## The Three Tiers

| Tier         | What                                 | Who runs it        |
| ------------ | ------------------------------------ | ------------------ |
| 1 — Static   | format / lint / types / compile      | Implementer        |
| 2 — Tests    | unit / integration / UI / API        | Implementer        |
| 3 — Behavior | start system → exercise AC → observe | **Fresh subagent** |

Tiers 1+2 are necessary. Tier 3 is what makes work "done" when this skill fires.

## The Gate

Run before any "done" claim:

1. Trigger fired? **No** → use `verification-before-completion`. **Yes** → continue.
2. AC defined and concrete? **No** → load `acceptance-criteria-gate.md`, STOP.
3. Tier 1 + 2 green? **No** → fix first.
4. Dispatch behavior subagent — load `subagent-template.md` for the contract; the subagent runs `tier-3-procedure.md`.
5. Read the structured per-AC report:
   - **All PASS** → done.
   - **Any FAIL** → fix; dispatch a **fresh** subagent; repeat.
   - **CANNOT-VERIFY** → document blocker, surface to user, do not claim done.

## "Done" claims this skill blocks

Until step 5 = all PASS:

- Marking a todo / `TaskUpdate` as `completed`
- Saying "done", "complete", "shipped", "ready to ship", or any synonym implying finished, in chat

If your message would let the user think the work is finished, it's in scope.

## Red flags — refuse these rationalizations

| Thought                                          | Reality                                                       |
| ------------------------------------------------ | ------------------------------------------------------------- |
| "Tests pass, that's enough"                      | Tier 3 is required by the trigger                             |
| "I read the logs / saw it work earlier"          | Implementer ≠ behavior reviewer; observation rots             |
| "AC are obvious from the diff"                   | Improvising AC = verifying what you built, not what was asked |
| "Subagent dispatch is overhead"                  | That's the point — bias-independent verdict                   |
| "Small change, just this once"                   | No exceptions outside pure-doc                                |
| "This is a fix to a previous task"               | Fixes are new work; same gate applies                         |
| "Plan didn't say Tier 3 explicitly"              | Triggers fire on the work, not on the plan's wording          |
| "Services won't start, but the code is right"    | CANNOT-VERIFY ≠ done; surface to user                         |
| "Re-use the same subagent to save time"          | Old context taints the verdict; fresh each round              |
| "User is in auto mode, just proceed"             | Auto mode does not waive verification                         |
| "I am the dispatched subagent — let me also fix" | Subagents verify or implement, never both                     |

## Why this exists

Real failure mode: agent runs mocked unit tests, sees green, declares done. The bugs that this misses:

- Config that doesn't take effect at runtime (mocked away)
- Misrouted observability (only visible in the dashboard)
- Wiring that compiles but doesn't connect at runtime
- Env-dependent behavior (works on dev machine, fails in container)

The fix isn't more unit tests — it's a separate agent watching the running system against AC.

## Sub-files (load only when needed)

- `tier-3-procedure.md` — the behavior walk-through the subagent runs
- `subagent-template.md` — the dispatch contract
- `acceptance-criteria-gate.md` — what to do when AC are missing or vague
