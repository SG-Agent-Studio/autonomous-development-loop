# Stage 2: Verification (loop VERIFY step)

The orchestrator does NOT verify or fix directly. It spawns subagents and routes on
their structured output.

## Verify (verifier subagent)

Spawn a **verifier subagent** (single responsibility). It:

1. Runs the `verifying-implementation` skill — boots the system and exercises the
   changed endpoints/paths.
2. Matches observed output against the acceptance criteria in `spec_path`. **Mode B
   has no `spec_path`** — there the verifier instead exercises the changed paths for
   regressions only (boot succeeds and the changed endpoints/paths still work), with
   no spec-acceptance match.
3. Returns the schema below.

The verifier receives `mcp_available`. For each AC: if it needs the browser and
`mcp_available == n`, do **not** attempt it — in `autonomous` mark it
`CANNOT-VERIFY` (→ overall fail); in `human-in-loop` add it to `needs_human` and do
not fail on it. Verify every other AC normally (curl / DB / logs / files / browser).

```json
{ "outcome": "pass" | "fail" | "needs_human", "failures": ["<root cause>", ...], "needs_human": ["<AC text>", ...] }
```

After each verify (pass or fail), the orchestrator writes
`.loop-logs/<id>/tasks/verification-state.json`:

```json
{ "rounds_completed": <N>, "last_outcome": "pass" | "fail", "notes": "<optional context>" }
```

**If `outcome == "pass"`:** return to the loop — proceed to the REVIEW step in
`./stage-review-fix.md`.

**If `outcome == "needs_human"` (human-in-loop only):**

1. The orchestrator writes `.loop-logs/<id>/verifications/verification-<round>.md`
   (`<round>` = verify-round counter, incremented per verify):

   ```markdown
   # Verification Checklist — Round <round>

   **Spec:** <spec_path>
   **How to run:** `<start_cmd>` — wait for the ready signal, then verify each item.

   ## Auto-verified (reference)
   - [PASS|FAIL] <AC> — <evidence>

   ## Needs your verification
   - [ ] <AC text>
     - How to check: <smallest action>
     - Where to observe: <URL / screen / log>
     - Result: (pass / fail + notes)
   ```

2. Prompt the human: `Verification checklist ready at <path>. Verify each item and
   reply pass/fail + notes.` Then **end the turn** (the orchestrator pauses here).
3. On the human's reply, combine their per-item results with the auto-verified
   results. **Any FAIL** → treat as `outcome == "fail"` and run "Fix on failure"
   below. **All PASS** → proceed to the REVIEW step.

## Fix on failure (≤3 inner rounds)

**If `outcome == "fail"`:**

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
