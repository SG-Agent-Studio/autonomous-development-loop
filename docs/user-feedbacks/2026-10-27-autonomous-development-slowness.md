# Handoff: fix slow `04-autonomous-development` (plugin + pipeline)

Next session focus: improve plugin skill `autonomous-development-plugin:autonomous-feature-development` (and pipeline glue) to cut the timeout -> recover -> rerun loop.

## Context

Branch `chore/116/create-feature-flags-for-non-r1-features`, MR !77, ticket REG-116 (22-task plan).
Needed 4 dev runs (5th running at time of writing). ~7h compute, >19h wall clock.
Pipeline config: `.gitlab-ci.yml`, `gitlab-templates/development.yml` (105m `timeout -k 60s` around `claude -p "/execute-plan"`).
Scripts: `scripts/pipeline/{handoff-bundle,recover-development,fetch-handoff-context}.sh`. Repo skill: `.claude/skills/execute-plan/SKILL.md`.
Plugin source (read-only cache, v0.6.0 and 0.5.0): `~/.claude/plugins/cache/autonomous-development/autonomous-development-plugin/`. Enabled in `.claude/settings.json:114`. Not verified which version CI image installs.

## Timeline (pipelines on the branch)

| Run | Pipeline | Window (10-22/23) | Result                                                                          |
| --- | -------- | ----------------- | ------------------------------------------------------------------------------- |
| 1   | 25292063 | 06:07-07:53       | Tasks 1-5 done in `worktree/impl`; **0 landed** (bundle missed worktree branch) |
| 2   | 25303998 | 08:00-09:45       | Tasks 1-9 committed; timeout in 10-15                                           |
| 3   | 25321983 | 13:54-15:40       | Tasks 10-22 done by 15:17; rest = suites, review, "Revision 1" rework; timeout  |
| 4   | 25332611 | 22:55-00:41       | Rev-1 tests, e2e (~40 min, not green), review round; timeout                    |
| 5   | 25335268 | 01:00-            | running; left: 7 e2e Step 5 items, Task 22 Steps 4-5                            |

Manual gaps timeout -> recover play: ~4h, ~7h (~11h of wall clock, zero compute).

## Findings

Root cause: plan too big for one 105m window + plugin does everything in one session with no checkpoints.

1. **Run 1 loss = plugin/pipeline mismatch.** Plugin Stage 3 implements all tasks in `.worktrees/impl` (`worktree/impl`), squash-merges onto branch only after faithfulness verifier passes. `handoff-bundle.sh` bundles only `$CI_COMMIT_SHA..HEAD` of checked-out branch -> worktree commits lost on timeout.
2. **Rework is plugin's own loops.** Stage 3.3 faithfulness loop (cap 2): Opus planner writes `#### Revision N` into plan, implementer redoes tasks. Stage 4+5 verify<->review loop (cap 5): reviewer + per-issue fix pipelines (blocking = 5 agent phases, important = 3). Stage 6 e2e plan + implement + faithfulness (cap 2). All serial, one session.
3. **Plugin state not persisted.** `.loop-logs/<id>/tasks/*.json` (stage/round counters) not on branch (file tree grep showed none; gitignore status unchecked). Each run re-reads handoff comment + plan checkboxes, redoes Stage 1 plan gate, command resolution, Playwright probe.
4. **E2E slow + flaky.** `e2e/playwright.config.ts`: `retries: 3` in CI, `timeout: 180_000`, `workers: 1`. Runtime flag flip reaches only 1 of 2 gunicorn workers (`/notebooks/` -> 302x3, 404x3). CI `e2e-test` job 4 min baseline -> 8 (run 3) -> 29 (run 4).
5. **Env rediscovered every run.** Test DB host is `docker:5433` not localhost (runs 1-3 each found it). Baseline integration run each run; run 3's hit 10-min kill (piped through `tail`, no output). Idle-transaction timeout (15s) set on test DBs ad hoc, not persisted.
6. `check-development-footprint` fails in every pipeline (not investigated; likely expected while plan/spec files exist).

## Candidate fixes (not decided)

Plugin / skill:

- Commit directly on branch (or push `worktree/impl` commits incrementally) so timeout loses nothing. Or make `handoff-bundle.sh` bundle all `worktree/*` refs.
- Persist `.loop-logs` (WIP commit or restore from prior job artifact) so stage counters survive.
- Split into phases with own time budgets: implement+push -> verify/review -> e2e. Optionally separate CI jobs.
- Lower caps for pipeline use: faithfulness loop 2->1, review loop 5->2; allow revisions only after all tasks committed.
- Skip Stage 1 gate / Playwright probe / baseline integration run on resume.
- Cap tasks per run (~8-10) or split big plans.
- Parallelise independent tasks only if safe (plan notes `base.html` edited by 11 tasks -> serial merge needed).

Pipeline / repo:

- Put env facts (`docker:5433`, no piped `tail`) in `/execute-plan` skill; persist idle-txn timeout.
- E2E: `retries: 0` for flag-flip specs, single gunicorn worker in `docker-compose.e2e.yml`, run e2e last with hard budget.
- Auto-play recover (e.g. `pipeline-monitor` agent) to remove overnight gaps.

## Open questions

- Which plugin version does CI use? (diff 0.5.0 vs 0.6.0: did sequential single implementer in 0.6.0 slow things?)
- Plugin source repo location / who owns it? Cache dir is read-only; edits must go to the source repo.
- Is `.loop-logs` gitignored? Artifacts download failed (`glab job artifact` 404; `glab api` blocked by guard hook), so per-phase timing came from commit times + trace summaries. Real `.loop-logs` timings would sharpen the ranking.
- Wanted: decision doc in `docs/` (questions, answers, decisions, reasons) per user CLAUDE.md.

## Suggested skills

- `superpowers:brainstorming` / `grilling` - pick fix set before editing plugin.
- `superpowers:writing-plans` - plan plugin changes (touches several stage files).
- `superpowers:writing-skills` - editing the plugin skill; verify before deploy.
- `plugin-authoring` - only if packaging/hook changes needed.
- `superpowers:systematic-debugging` - if re-verifying a cause with real `.loop-logs`.

## Constraints

- CLAUDE.md: plan first, show analysis before code changes; no commit to master; branch name `<type>/<ticket|000>/<desc>`.
- `glab api` blocked by guard hook; use `glab ci get/trace`.
- Concise writing for docs.
