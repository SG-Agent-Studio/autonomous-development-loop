# Human-in-Loop Feature Development — Design

**Date:** 2026-07-09
**Status:** Approved (design)
**Source feedback:** `docs/user-feedbacks/2026-07-09-user-feedback.md`
**Skills touched:** `autonomous-feature-development` (engine), new `human-in-loop-feature-development` (wrapper), `verifying-implementation`

---

## 1. Problem

The `autonomous-feature-development` pipeline hardcodes three environmental
assumptions. When any fails, it breaks instead of degrading:

1. **`just` exists** — baked into `stage-impl`, `stage-review-fix`, `stage-final`
   (and verify examples). Repos without `just` get flagged as broken.
2. **Playwright MCP is available** — the only Tier-3 UI verification mechanism.
   When MCP is disabled the agent cannot verify UI work.
3. **Auto-commit is allowed** — the pipeline always commits. Users whose rules
   forbid agent commits need the work left for manual review, and worktrees are
   currently not cleaned up.

All three share one shape: *what happens when an environmental assumption fails.*
They split cleanly by **use case**, not by patching one skill with three fallbacks.

## 2. Core decision — two skills, one `mode` flag

Two use cases exist:

- **Full automation pipeline** — strict, fail-fast, no human present.
- **Local machine, human in the loop** — clarify, pause, hand off.

Rather than one skill branching everywhere, split by use case:

| | `autonomous-feature-development` (existing engine) | `human-in-loop-feature-development` (new wrapper) |
| --- | --- | --- |
| Role | Owns all stages + Stage 0 hard-stop rules | Thin, grill-me-style. States clarify/pause philosophy, then invokes the engine with `mode=human-in-loop` |
| Default `mode` | `autonomous` | sets `mode=human-in-loop` |
| Missing capability | Preflight detects → hard-stop (throw error; pipeline's reaction is out of scope) | Clarify with human; pause and wait when human action is needed |

**The engine reads `mode` at exactly three orchestrator junctures** — preflight
fallback, verify fallback, commit handoff. Everywhere else is shared and
mode-agnostic. `SKILL.md` "FULLY AUTONOMOUS — never pause, never ask" and Hard
Rule 5 (ambiguous → assume + comment) get scoped to `mode=autonomous`.

**Only the orchestrator branches on `mode`.** Subagents (implementers, verifiers,
reviewers) run to completion and cannot wait for a human, so they stay fully
autonomous. They receive concrete inputs (resolved commands, "MCP available? y/n")
and keep assume-and-comment behavior internally. Every clarify/pause happens at
the orchestrator level.

The wrapper mirrors the `/grill-me` → `/grilling` pattern (a thin entry skill that
delegates), with the one honest addition that the engine must read a `mode` flag —
because Issues 2 and 3 change in-pipeline behavior a pre-call wrapper cannot reach.

**`mode` applies across both engine modes (A: full pipeline, B: review-fix only).**
Command resolution (Issue 1) and commit handoff (Issue 3) apply to both. The MCP
preflight AC-scan (Issue 2) is Mode A only — Mode B has no `spec_path`, so its
verify stays regression-only; the verify-time per-AC MCP backstop still applies if
a regression check needs the browser.

## 3. Issue 1 — command resolution

Remove every hardcoded `just` (`stage-impl.md`, `stage-review-fix.md`,
`stage-final.md`, and the verify examples). Commands become resolved variables.

**Command set:** `lint` + `test` are **required**; `format` + `start` are
**optional** (`format` skipped if the project has none; `start` only needed when
Tier-3/UI verify runs).

**Resolution (Stage 0, once per run), in precedence order:**
1. A `## Commands` section in `CLAUDE.md` / `AGENTS.md` (explicit, authoritative,
   and how persisted answers are reused across runs).
2. Project config — `justfile`, `package.json` scripts, `Makefile`,
   `pyproject.toml`/uv, etc.
3. Not found → mode-specific fallback.

**Delivery to subagents:** resolved commands are **injected into subagent prompts**
(ephemeral, exactly like the existing `LOG_PATH` injection). **No `.loop-logs`
commands file** — `.loop-logs/` is throwaway; commands are either re-derived each
run (config-discovered) or persisted to the memory file (asked).

**Not-found fallback:**
- `autonomous` → **hard-stop** at preflight, listing exactly which commands were
  unresolved.
- `human-in-loop` → **ask the user** per unresolved command, write answers into a
  `## Commands` section in `CLAUDE.md` (default), then continue.

**Persist to memory only on the ask-path.** Config-discovered commands are NOT
written back — that keeps autonomous/CI runs from mutating repo files, and they
are deterministically re-discoverable each run.

## 4. Issue 2 — MCP verification fallback

**Two layers of detection:**

- **Preflight (Stage 0):** probe MCP availability + scan the spec's ACs for
  browser-observable ones.
  - `autonomous`: UI-AC present **and** MCP absent → hard-stop early (fail fast).
  - `human-in-loop`: heads-up to the user that UI verification will be handed off.
  - Records MCP status either way.
- **Verify-time, per-AC (authoritative backstop):** for any AC that actually needs
  the browser with MCP absent:
  - `autonomous` → hard-stop.
  - `human-in-loop` → route to the checklist handoff below.

**Human-in-loop verify behavior (option B — automate what it can):**
1. The verifier subagent still auto-verifies non-UI ACs it can observe
   (curl/API, DB `SELECT`, logs, file writes). It returns the list of ACs that
   need the browser/human.
2. **The orchestrator (not the subagent) writes**
   `.loop-logs/<id>/verifications/verification-<round>.md` — a per-AC checklist
   following `stage-verify.md` requirements — prompts the human to take over
   verification, and ends its turn. `<round>` = verify-round counter, incremented
   on each verify performed (mirrors `code-review/round-<N>.md`).
3. The human works the checklist and replies pass/fail + feedback.
4. The orchestrator ingests results: any **FAIL** → existing fix loop
   (`stage-verify.md` "Fix on failure, ≤3 inner rounds"); all **PASS** → proceed
   to REVIEW.

The checklist lives under `.loop-logs/<id>/` because it is a per-run, per-round
artifact (unlike commands, which are cross-run config).

## 5. Issue 3 — commit handoff + worktree cleanup

**Commit handoff (`human-in-loop`):**
- Record the branch tip as `base_sha` in Stage 0.
- Run the pipeline normally (per-task commits + squash-merges reused as-is).
- At the final stage: `git reset --mixed <base_sha>` collapses everything into
  **unstaged** working-tree changes.
- **Skip `finishing-a-development-branch`**; prompt the human to review + commit;
  stop.
- Error-stop paths (verification failed after 3 rounds, review loop exhausted)
  likewise leave changes unstaged for the human instead of a `wip:` commit.
- `autonomous` commit behavior is unchanged (commit + branch completion).

**Worktree cleanup (both modes) — fixes an existing bug.** In `stage-impl.md` the
squash-merge loop removes worktrees only for **completed** tasks; **failed**-task
worktrees are never removed, and fix-loop worktrees leak on hard-stop, leaving the
`.worktrees/` directory behind. Fix = a **final cleanup sweep** in Stage 4 /
pre-handoff (both modes):
1. `git worktree remove --force` every remaining worktree.
2. `git worktree prune`.
3. Remove the `.worktrees/` directory if empty.
4. **Verification gate** asserting no worktrees remain.

Failed-task worktrees are **discarded** — the human reviews the branch, not
worktrees, and the failed diff is already captured in the error log.

**Logs stay tracked.** `git add -A` is unchanged; the skill takes no `.gitignore`
action. Only honor a gitignore of `.loop-logs/` if the human's memory file, rules,
or prompt already ask for it.

## 6. Files touched

| File | Change |
| --- | --- |
| `skills/autonomous-feature-development/SKILL.md` | Introduce `mode` (default `autonomous`); scope "never pause" + Hard Rule 5 to autonomous; update Prerequisites (MCP now conditional/degradable in wrapper) |
| `skills/autonomous-feature-development/stage-impl.md` | Remove `just`; use injected resolved commands; add Stage 0 command + MCP preflight detection with mode fallback; record `base_sha`; fix worktree cleanup (failed tasks + final sweep + gate) |
| `skills/autonomous-feature-development/stage-verify.md` | Two-layer MCP detection; human-in-loop checklist handoff + orchestrator pause/resume; per-AC backstop |
| `skills/autonomous-feature-development/stage-review-fix.md` | Remove `just` from fix pipeline (Phases 3 & 5) → resolved commands |
| `skills/autonomous-feature-development/stage-final.md` | Remove `just lint`/`just format` → resolved commands; mode branch: autonomous commit + finish vs human-in-loop reset-to-unstaged + handoff; worktree sweep + gate |
| `skills/verifying-implementation/tier-3-procedure.md`, `subagent-template.md` | Genericize `just up-capstone` examples to resolved `start` command |
| `skills/human-in-loop-feature-development/SKILL.md` | **New.** Thin wrapper: clarify/pause philosophy + invoke engine with `mode=human-in-loop` |

All edits follow the `writing-great-skills` skill (predictability, information
hierarchy, single source of truth, aggressive pruning).

## 7. Out of scope

- How a CI pipeline reacts to an autonomous-mode hard-stop error (retry, notify,
  fail the job) — pipeline configuration, not the skill's concern.
- Changing the brainstorming/planning flow that produces the plan + spec.
- Reworking the verify↔review loop cap or review reviewer set.

## 8. Verification approach

- **Command resolution:** dry-run Stage 0 against (a) a repo with a `## Commands`
  memory section, (b) a repo with only `package.json` scripts, (c) a repo with
  nothing → confirm autonomous hard-stops and human-in-loop asks + persists.
- **MCP fallback:** simulate MCP-absent with a UI AC → confirm autonomous
  hard-stops and human-in-loop writes `verification-<round>.md` + pauses; feed a
  FAIL back → confirm it enters the fix loop.
- **Commit handoff:** run human-in-loop to completion → confirm `git status` shows
  all changes **unstaged**, no commit added, no `.worktrees/` left, no worktrees in
  `git worktree list`.
- **Worktree cleanup:** force a failed task → confirm its worktree is removed and
  the gate passes.
- Skills are prose; verification is by reading each modified skill against its
  stated behavior and running the above scenarios end-to-end where a sandbox repo
  allows.

---

## Decisions Log

### Q1. How to reconcile "fully autonomous, never ask" with the three handoff needs?
- **Answer / Decision:** Split into two skills by use case — keep
  `autonomous-feature-development` as a strict engine, add
  `human-in-loop-feature-development` as a thin wrapper. Engine reads a `mode` flag.
- **Reason:** The two behaviors are two use cases, not one skill with scattered
  fallbacks. Splitting by use case keeps each path readable; a single `mode` flag
  at three junctures avoids duplicating the ~90% shared core.

### Q2. Should the wrapper be pure delegation like `/grill-me` → `/grilling`?
- **Answer / Decision:** No — the engine must read a `mode` flag at three points.
  The wrapper handles clarify/pause philosophy and command pre-resolution; the
  engine branches internally for verify and commit behavior.
- **Reason:** `grill-me` adds no behavioral change. Here, Issues 2 and 3 change
  in-pipeline behavior (Stage 2 verify, Stage 1/4 commit) that a pre-call wrapper
  cannot reach without hacks (e.g. commit-then-`git reset`). A single mode flag is
  cleaner and honest.

### Q3. Where are resolved commands stored?
- **Answer / Decision:** Never in `.loop-logs/` (throwaway). Persist to
  `CLAUDE.md`/`AGENTS.md` **only** when asked (human-in-loop). Config-discovered
  commands are injected into subagent prompts per run, not written back.
- **Reason:** Commands are cross-run config; the memory file is their canonical
  home. Prompt injection covers the run without a temp file, and not writing back
  config-discovered commands keeps CI runs from mutating repo files.

### Q4. Required vs optional commands? Persistence target?
- **Answer / Decision:** `lint` + `test` required; `format` + `start` optional.
  Persist asked answers to `CLAUDE.md` by default.
- **Reason:** Lint and tests are the non-negotiable quality gates; format/start are
  conditional. `CLAUDE.md` is the default memory file already in use.

### Q5. Human-in-loop verify when MCP is absent — full handoff or automate what it can?
- **Answer / Decision:** Option B — auto-verify non-UI ACs; hand off only the ACs
  that need the browser/human, via `.loop-logs/<id>/verifications/verification-<round>.md`.
- **Reason:** Wastes less of the human's time; the agent still catches non-UI
  regressions automatically.

### Q6. When is MCP-absent fatal in autonomous mode — preflight or verify-time?
- **Answer / Decision:** Both. Preflight AC-scan + MCP probe fails fast when UI
  work is detected; verify-time per-AC is the authoritative backstop.
- **Reason:** Two layers of defense — early failure when detectable, per-AC
  authority when not.

### Q7. Failed-task worktrees — discard or preserve?
- **Answer / Decision:** Discard. The human reviews branch changes, not worktrees;
  the failed diff is already in the error log.
- **Reason:** Leaving them around is the bug being fixed; the error log preserves
  the record.

### Q8. Gitignore `.loop-logs/`?
- **Answer / Decision:** No — leave logs tracked (`git add -A` unchanged). Only
  honor a gitignore if the human's memory/rules/prompt ask for it.
- **Reason:** Consistent with current behavior; the human may want the logs.
