# Agent Workflow

## Mode Selection

```mermaid
flowchart TD
    Start([Invoke skill]) --> Q{plan_path + spec_path\nin conversation?}
    Q -->|yes| ModeA[Mode A: Full Pipeline]
    Q -->|no — received review issues| ModeB[Mode B: Review Fix Only]
```

**Run `id`.** Stage 0 computes one `id` that namespaces every artifact for the run.
Every log path below is `.loop-logs/<id>/...`.

- Mode A: `id` = plan filename basename, `.md` stripped (`2026-06-16-ticket-3.md` → `2026-06-16-ticket-3`).
- Mode B: `id` = `<today>-review-<current-branch>`.

**Orchestrator purity.** The main agent is a pure orchestrator: it never reads, writes,
or executes product code, quality checks (lint/test/verify), or reviews. Every such
action is delegated to a single-responsibility subagent, and the agent that implements a
fix is never the agent that reviews it. The orchestrator only spawns subagents, reads
their structured output, does git plumbing (squash-merge, worktree/branch lifecycle,
commits), and writes the run's log/state files.

---

## Mode A: Full Pipeline

### Stage 0 + 1: Guard, Setup & Parallel Implementation

```mermaid
flowchart TD
    S0([Stage 0: Guard & Setup]) --> V1{plan_path exists\n& non-empty?}
    V1 -->|no| E1[ERROR: stop]
    V1 -->|yes| V2{spec_path exists\n& non-empty?}
    V2 -->|no| E2[ERROR: stop]
    V2 -->|yes| RID[compute run id\nlogs namespaced under it]
    RID --> BG{on main branch?}
    BG -->|yes| CB[checkout -b feature/derived-name]
    BG -->|no| PT[parse ### Task N headings]
    CB --> PT
    PT --> IT[write tasks/task-N.json\nstatus: pending]
    IT --> IG{task already\ncompleted?}
    IG -->|yes| SKIP[skip — resume guard]
    IG -->|no| S1

    S1([Stage 1: Parallel Implementation]) --> SPAWN[spawn one worktree agent\nper task simultaneously]

    SPAWN --> WA[Agent: task-1\ngit worktree add]
    SPAWN --> WB[Agent: task-2\ngit worktree add]
    SPAWN --> WC[Agent: task-N\ngit worktree add]

    WA --> TDD_A[TDD loop\nmax 3 attempts]
    WB --> TDD_B[TDD loop\nmax 3 attempts]
    WC --> TDD_C[TDD loop\nmax 3 attempts]

    TDD_A --> R1{lint + test\ngreen?}
    R1 -->|pass| OK1[commit feat\nmark completed]
    R1 -->|fail < 3| TDD_A
    R1 -->|fail == 3| HS1[hard stop\nwrite error log\ncommit wip]

    TDD_B --> R2{lint + test\ngreen?}
    R2 -->|pass| OK2[commit feat\nmark completed]
    R2 -->|fail < 3| TDD_B
    R2 -->|fail == 3| HS2[hard stop\nwrite error log\ncommit wip]

    TDD_C --> R3{lint + test\ngreen?}
    R3 -->|pass| OK3[commit feat\nmark completed]
    R3 -->|fail < 3| TDD_C
    R3 -->|fail == 3| HS3[hard stop\nwrite error log\ncommit wip]

    OK1 & OK2 & OK3 & HS1 & HS2 & HS3 --> WAIT[wait for all agents]

    WAIT --> SM[squash merge completed tasks\nskip failed tasks]
    SM --> IG2{integrity gate:\nall tasks completed\nor failed?}
    IG2 -->|fail| STOP2[STOP — bookkeeping missing]
    IG2 -->|pass| S2

    S2([Advance to Stage 2 + 3 loop])
```

### Stage 2 + 3: Capped Verify↔Review Loop

Stages 2 and 3 are a single loop, not two separate passes. Each iteration runs VERIFY
(Stage 2), then REVIEW (Stage 3), then fixes the actionable issues and re-verifies. The
loop exits when a review raises **zero actionable issues**, or after a hard cap of **5
iterations**. `actionable = blocking + important`; minor issues never re-trigger the
loop and are deferred to the final summary.

```mermaid
flowchart TD
    L0([Stage 2 + 3: enter loop\niteration = 0]) --> INC[iteration += 1]
    INC --> VER[VERIFY step\nsee Stage 2 below]
    VER --> VOK{verify pass?}
    VOK -->|fail after 3 inner rounds| VHALT[write error/verification-failure.md\ncommit wip — STOP pipeline]
    VOK -->|pass| REV[REVIEW step\nsee Stage 3 below]
    REV --> LOG[orchestrator writes\ncode-review/round-N.md]
    LOG --> AQ{actionable issues\nblocking + important\n== 0?}
    AQ -->|yes| S4[exit loop → Stage 4]
    AQ -->|no| CAP{iteration == 5?}
    CAP -->|yes| EXH[write error/review-loop-exhausted.md\ncommit wip → Stage 4]
    CAP -->|no| FIX[fix each actionable issue\nin parallel worktrees]
    FIX --> MERGE[squash-merge fixes]
    MERGE --> INC
```

#### Stage 2: VERIFY step (verifier subagent)

The orchestrator does NOT boot or verify the system itself. It spawns a verifier
subagent and routes on its structured output `{ outcome, failures }`.

```mermaid
flowchart TD
    V0([VERIFY step]) --> VSPAWN[orchestrator spawns\nverifier subagent]
    VSPAWN --> VRUN[verifier runs verifying-implementation\nboots system, exercises changed paths]
    VRUN --> VMODE{spec_path present?}
    VMODE -->|Mode A| VMATCH[match output vs\nspec acceptance criteria]
    VMODE -->|Mode B| VREG[regression-only:\nchanged paths still work]
    VMATCH & VREG --> VRET[returns outcome + failures]
    VRET --> VWRITE[orchestrator writes\ntasks/verification-state.json]
    VWRITE --> VRES{outcome}
    VRES -->|pass| RPASS([→ REVIEW step])
    VRES -->|fail| VFIX[spawn fix worktree agent\nper failure — TDD mini-loop]
    VFIX --> VSM[squash-merge fix]
    VSM --> VRR{inner rounds < 3?}
    VRR -->|yes| VSPAWN
    VRR -->|3 exhausted| VHALT[write error/verification-failure.md\ncommit wip — STOP pipeline]
```

#### Stage 3: REVIEW step + actionable fix

```mermaid
flowchart TD
    R0([REVIEW step]) --> PAR[orchestrator spawns 3 reviewers\nin parallel — Sonnet 1m each]

    PAR --> RA[Reviewer A\nenhanced-review]
    PAR --> RB[Reviewer B\nponytail-review]
    PAR --> RC[Reviewer C\nsimplify]

    RA & RB & RC --> CONS[consolidation agent:\nverify real + evidence-backed\ndeduplicate, assign severity]

    CONS --> WRITE[orchestrator writes\ncode-review/round-N.md]
    WRITE --> AQ{actionable\nblocking + important\n== 0?}
    AQ -->|yes — review clean| BACK([→ Loop Control: exit])
    AQ -->|no| FIXPAR[fix actionable issues\nin parallel worktrees]

    FIXPAR --> FI1[Issue fix worktree 1]
    FIXPAR --> FI2[Issue fix worktree 2]
    FIXPAR --> FIN[Issue fix worktree N]

    FI1 --> PH1[Phase 1: Planner agent\nroot cause + plan]
    PH1 --> PH2[Phase 2: enhanced-review agent\nreview plan]
    PH2 --> PH2OK{plan\napproved?}
    PH2OK -->|no| PH1
    PH2OK -->|yes| PH3[Phase 3: Implementer agent\nTDD: test → impl → lint + test]
    PH3 --> PH4[Phase 4: enhanced-review agent\nreview code]
    PH4 --> PH4OK{code\napproved?}
    PH4OK -->|no| PH3
    PH4OK -->|yes| PH5[Phase 5: Implementer agent\nverify: lint_cmd + test_cmd]
    PH5 --> SMF[squash merge fix\ninto branch]

    FI2 -.->|same phases| SMF
    FIN -.->|same phases| SMF

    SMF --> RELOOP([→ Loop Control: re-verify\nbefore next review])
```

Minor issues are recorded in `code-review/round-<N>.md` and surfaced in the final
summary as deferred ("not handled yet"); they are never fixed in-loop.

### Stage 4: Final Commit

```mermaid
flowchart TD
    S4([Stage 4: Final]) --> LF[lint_cmd\nformat_cmd]
    LF --> LFR{both\nexit 0?}
    LFR -->|no| FIX[fix and rerun]
    FIX --> LF
    LFR -->|yes| SUM[write logs/summary.md\nincl. loop iterations + deferred minors]
    SUM --> CMT{all tasks\ncompleted?}
    CMT -->|yes| CF[git commit feat: ...]
    CMT -->|partial| CW[git commit wip: partial ...]
    CF & CW --> BC[superpowers:finishing-a-development-branch]
    BC --> DONE([Done])
```

---

## Mode B: Standalone Review Fix

Mode B validates and fixes a received code review, then enters the **same capped
verify↔review loop** as Mode A. It has no `spec_path`, so the inherited VERIFY step runs
in regression-only mode.

```mermaid
flowchart TD
    MB([Mode B: received code review issues]) --> ID[compute id\n= today-review-branch]
    ID --> VAL[validation agent:\nread each issue\ncheck against actual code]
    VAL --> VL[mark each issue\nvalid or invalid]
    VL --> FIXV[fix validated issues\nper-issue 5-phase pipeline\nsquash-merge each]
    FIXV --> LOOP[enter same capped\nverify↔review loop as Mode A\nVERIFY runs regression-only]
    LOOP --> SUM[print summary:\nfixed N, deferred N minors,\nskipped N invalid]
    SUM --> BC[superpowers:finishing-a-development-branch]
    BC --> DONE([Done])
```

---

## File Ownership

All paths are namespaced under the run `id`.

| File                                            | Written by   | When                                                                     |
| ----------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| `.loop-logs/<id>/tasks/<task-id>.json`          | Orchestrator | Before spawn (`in_progress`), after agent returns (`completed`/`failed`) |
| `.loop-logs/<id>/logs/<task-id>.md`             | Task agent   | Incrementally after each TDD attempt                                     |
| `.loop-logs/<id>/error/<task-id>.md`            | Task agent   | On hard stop (3 failures)                                                |
| `.loop-logs/<id>/tasks/verification-state.json` | Orchestrator | After each verify round (loop VERIFY step)                               |
| `.loop-logs/<id>/error/verification-failure.md` | Orchestrator | If verify fails after 3 inner rounds (pipeline stops)                    |
| `.loop-logs/<id>/code-review/round-<N>.md`      | Orchestrator | After each REVIEW iteration                                              |
| `.loop-logs/<id>/error/review-loop-exhausted.md`| Orchestrator | If the loop hits 5 iterations with actionable issues still open          |
| `.loop-logs/<id>/logs/summary.md`               | Orchestrator | Stage 4 only                                                             |
