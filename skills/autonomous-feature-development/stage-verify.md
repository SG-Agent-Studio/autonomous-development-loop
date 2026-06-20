# Stage 2: Verification

Run the `verifying-implementation` skill: boot the system and exercise changed endpoints/paths. Match observed output against the acceptance criteria in `spec_path`.

**After each verification run (pass or fail), write:**
`.loop-logs/tasks/verification-state.json`:
```json
{ "rounds_completed": <N>, "last_outcome": "pass" | "fail", "notes": "<optional context>" }
```

**If verification passes:** Read `./stage-review-fix.md` and proceed to Stage 3.

---

**If verification fails:**

1. Analyze root cause from verification output.
2. Spawn a fix worktree agent using the same TDD mini-loop from `stage-impl.md` (single task, targeting the root cause).
3. Squash-merge the fix:
   ```bash
   git merge --squash worktree/verification-fix-<round>
   git commit -m "fix: address verification failure round <round>"
   git worktree remove .worktrees/verification-fix-<round> --force
   git branch -D worktree/verification-fix-<round>
   ```
4. Re-run verification. Repeat up to **3 rounds total**.
   (Write `verification-state.json` after each round — see above.)

---

**If still failing after 3 rounds:**

Write `.loop-logs/error/verification-failure.md`:
```markdown
# Verification Failed After 3 Rounds

**Spec:** <spec_path>

## Round 1
<full verification output>

## Round 2
<full verification output>

## Round 3
<full verification output>
```

Commit and stop:
```bash
git add -A
git commit -m "wip: verification failed after 3 rounds — see .loop-logs/error/verification-failure.md"
```
