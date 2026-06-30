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
3. Returns:

```json
{ "outcome": "pass" | "fail", "failures": ["<root-cause summary>", ...] }
```

After each verify (pass or fail), the orchestrator writes
`.loop-logs/<id>/tasks/verification-state.json`:
```json
{ "rounds_completed": <N>, "last_outcome": "pass" | "fail", "notes": "<optional context>" }
```

**If `outcome == "pass"`:** return to the loop — proceed to the REVIEW step in
`./stage-review-fix.md`.

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
