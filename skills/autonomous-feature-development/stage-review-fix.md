# Stage 3 / Mode B: Complex Review + Fix

Used in two contexts:
- **Mode A Stage 3**: After verification — spawn fresh reviewers, consolidate, fix.
- **Mode B Standalone**: Issues already exist from a received code review — validate first, then fix.

---

## Part 1: Gather and Validate Issues

### Mode A — Spawn fresh reviewers

Spawn 3 subagents **in parallel** (use Sonnet[1m] for each). Each reviews independently:

| Agent | Skill |
|-------|-------|
| Reviewer A | `enhanced-review` |
| Reviewer B | `ponytail:ponytail-review` |
| Reviewer C | `simplify` |

Pass all three raw findings to a **consolidation agent**, which:
1. Verifies each issue is real and evidence-backed (not hypothetical).
2. Deduplicates overlapping findings.
3. Produces a validated issue list with severity (blocking / important / minor).

### Mode B — Validate received issues

Issues exist in conversation context from received code review. Do NOT spawn new reviewers. Spawn a **validation agent** which:
1. For each issue, reads the actual code to confirm the problem exists as described.
2. Marks each as `valid` (real, reproducible in current code) or `invalid` (stale, incorrect, or subjective).
3. Produces the same validated issue list format as Mode A.

**Do not fix invalid issues.** If an issue was valid once but the code has since changed, mark invalid and skip.

---

## Part 2: Fix Issues

Fix all validated issues **in parallel** using git worktrees. One worktree per issue.

For each issue, create a worktree:
```bash
git worktree add .worktrees/fix-<issue-id> -b worktree/fix-<issue-id>
```

All work for that issue happens inside `.worktrees/fix-<issue-id>`.

---

### Per-Issue Fix Loop

Use **separate agents per phase** — never one agent for all phases. This prevents self-review bias.

**Phase 1 — Plan** (Planner agent):
- Understand root cause and impact.
- Produce a concrete implementation plan (3-5 bullet points).

**Phase 2 — Review plan** (enhanced-review agent):
- Review the plan for correctness and approach.
- If issues found → return plan to Phase 1 with feedback. Repeat until approved.

**Phase 3 — Implement** (Implementer agent):
- Execute the plan using TDD:
  1. Write failing test first. Confirm it fails for the expected reason.
  2. Write minimal implementation to make it pass.
  3. Run `just lint` and `just test-unit` — both must exit 0.
- Commit in worktree: `fix(<scope>): <issue description>`

**Phase 4 — Review implementation** (enhanced-review agent):
- Review the actual code change.
- If issues found → return to Phase 3 with feedback. Repeat until approved.

**Phase 5 — Verify**:
- Run `just lint` + `just test-unit` one final time. Both must pass.
- Mark issue resolved.

---

### Squash Merge Each Fix

After each issue's worktree is complete:
```bash
git merge --squash worktree/fix-<issue-id>
git commit -m "fix(<scope>): <issue description>"
git worktree remove .worktrees/fix-<issue-id> --force
git branch -D worktree/fix-<issue-id>
```

After all fixes are merged, verify history is linear:
```bash
git log --oneline
```
No merge commits should appear.

---

## After All Fixes

**Mode A:** Read `./stage-final.md` and proceed to Stage 4.

**Mode B:** Run `superpowers:finishing-a-development-branch`. Before that, print a brief summary:
```
Fixed <N>/<total valid> issues.
Skipped <N> invalid issues.
```
