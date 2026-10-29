# Decision: optional multi-subagent implementation

Trigger: `docs/user-feedbacks/2026-10-27-autonomous-development-slowness.md`.

| Q | A | Reason |
| - | - | - |
| How choose mode? | `implementation_mode` input: prompt > `CLAUDE.local.md` `## Pipeline` > `single`. HIL asks once if unset, stores. Autonomous never asks/writes. | Non-blocking in CI; HIL remembers preference. |
| Waves? | Optional `**Depends on:**` per task; none = one wave; cycle/unknown id = Stage 1 hard-stop. | 0.5.0 had no deps (all at once); explicit > inferred. |
| Merge model? | Per-task worktree; squash-merge each task as it finishes via serial queue. | No idle wait; linear history rule. |
| Conflicts? | Conflict-resolver subagent (Hard Rule 6: orchestrator touches no code); lint+test after; `unsure` = hard-stop both modes. | Conflicts expected resolvable; avoid silent bad merges. |
| Faithfulness? | Once per wave after its merges; existing cap-2 fix loop. | Matches wave granularity. |
| Task failure in multi? | In-flight finish+merge, no new tasks/waves, stop; resume via existing guard. | No wasted work. |
