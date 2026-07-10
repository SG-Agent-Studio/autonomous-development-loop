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
