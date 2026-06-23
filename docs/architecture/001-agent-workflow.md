# Agent Workflow

## Mode Selection

```mermaid
flowchart TD
    Start([Invoke skill]) --> Q{plan_path + spec_path\nin conversation?}
    Q -->|yes| ModeA[Mode A: Full Pipeline]
    Q -->|no — received review issues| ModeB[Mode B: Review Fix Only]
```

---

## Mode A: Full Pipeline

### Stage 0 + 1: Guard, Setup & Parallel Implementation

```mermaid
flowchart TD
    S0([Stage 0: Guard & Setup]) --> V1{plan_path exists\n& non-empty?}
    V1 -->|no| E1[ERROR: stop]
    V1 -->|yes| V2{spec_path exists\n& non-empty?}
    V2 -->|no| E2[ERROR: stop]
    V2 -->|yes| BG{on main branch?}
    BG -->|yes| CB[checkout -b feature/derived-name]
    BG -->|no| PT[parse ### Task N headings]
    CB --> PT
    PT --> IT[write .loop-logs/tasks/task-N.json\nstatus: pending]
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

    S2([Advance to Stage 2])
```

### Stage 2: Verification

```mermaid
flowchart TD
    S2([Stage 2: Verification]) --> BOOT[boot system\nrun verifying-implementation skill]
    BOOT --> VS{matches spec\nacceptance criteria?}
    VS -->|pass| VSWRITE[write verification-state.json\nlast_outcome: pass]
    VSWRITE --> S3

    VS -->|fail| ANALYZE[analyze root cause]
    ANALYZE --> FIXWT[spawn fix worktree agent\nTDD mini-loop]
    FIXWT --> SM2[squash merge fix]
    SM2 --> RERUN[re-run verification\nwrite verification-state.json]
    RERUN --> R2{rounds\n< 3?}
    R2 -->|yes, still failing| ANALYZE
    R2 -->|pass| S3
    R2 -->|3 rounds exhausted| VF[write error/verification-failure.md\ncommit wip\nstop]

    S3([Advance to Stage 3])
```

### Stage 3: Review + Fix

```mermaid
flowchart TD
    S3([Stage 3: Review]) --> PAR[spawn 3 reviewers in parallel\nSonnet 1m each]

    PAR --> RA[Reviewer A\nenhanced-review]
    PAR --> RB[Reviewer B\nponytail-review\nif installed]
    PAR --> RC[Reviewer C\nsimplify]

    RA & RB & RC --> CONS[consolidation agent:\nverify real + evidence-backed\ndeduplicate\nassign severity]

    CONS --> FIXPAR[fix all validated issues\nin parallel worktrees]

    FIXPAR --> FI1[Issue fix worktree 1]
    FIXPAR --> FI2[Issue fix worktree 2]
    FIXPAR --> FIN[Issue fix worktree N]

    FI1 --> PH1[Phase 1: Planner agent\nroot cause + plan]
    PH1 --> PH2[Phase 2: enhanced-review\nreview plan]
    PH2 --> PH2OK{plan\napproved?}
    PH2OK -->|no| PH1
    PH2OK -->|yes| PH3[Phase 3: Implementer\nTDD: test → impl → lint + test]
    PH3 --> PH4[Phase 4: enhanced-review\nreview code]
    PH4 --> PH4OK{code\napproved?}
    PH4OK -->|no| PH3
    PH4OK -->|yes| PH5[Phase 5: verify\njust lint + just test-unit]
    PH5 --> SMF[squash merge fix\ninto branch]

    FI2 -.->|same phases| SMF
    FIN -.->|same phases| SMF

    SMF --> S4

    S4([Advance to Stage 4])
```

### Stage 4: Final Commit

```mermaid
flowchart TD
    S4([Stage 4: Final]) --> LF[just lint\njust format]
    LF --> LFR{both\nexit 0?}
    LFR -->|no| FIX[fix and rerun]
    FIX --> LF
    LFR -->|yes| SUM[write .loop-logs/logs/summary.md]
    SUM --> CMT{all tasks\ncompleted?}
    CMT -->|yes| CF[git commit feat: ...]
    CMT -->|partial| CW[git commit wip: partial ...]
    CF & CW --> BC[superpowers:finishing-a-development-branch]
    BC --> DONE([Done])
```

---

## Mode B: Standalone Review Fix

```mermaid
flowchart TD
    MB([Mode B: received code review issues]) --> VAL[validation agent:\nread each issue\ncheck against actual code]
    VAL --> VL[mark each issue\nvalid or invalid]
    VL --> FIXPAR[fix validated issues\nin parallel worktrees\none per issue]

    FIXPAR --> FI[Per-issue: same\n5-phase fix loop as Mode A Stage 3]
    FI --> SMF[squash merge each fix]

    SMF --> SUM[print summary:\nfixed N/total valid\nskipped N invalid]
    SUM --> BC[superpowers:finishing-a-development-branch]
    BC --> DONE([Done])
```

---

## File Ownership

| File                                       | Written by   | When                                                                     |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------ |
| `.loop-logs/tasks/<task-id>.json`          | Orchestrator | Before spawn (`in_progress`), after agent returns (`completed`/`failed`) |
| `.loop-logs/logs/<task-id>.md`             | Task agent   | Incrementally after each TDD attempt                                     |
| `.loop-logs/error/<task-id>.md`            | Task agent   | On hard stop (3 failures)                                                |
| `.loop-logs/tasks/verification-state.json` | Orchestrator | After each verification round (Stage 2)                                  |
| `.loop-logs/error/verification-failure.md` | Orchestrator | If verification fails after 3 rounds                                     |
| `.loop-logs/logs/summary.md`               | Orchestrator | Stage 4 only                                                             |
