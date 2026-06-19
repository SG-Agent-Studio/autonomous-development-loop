# Tier 3 Procedure — Behavior Verification

Loaded when the gate reaches step 4. The behavior subagent follows this procedure. The implementer (controller) includes this in the dispatch prompt.

## The Walk-Through

### 1. Read AC verbatim

Open the plan / spec / task. Copy AC items as written. Do not paraphrase. Do not infer additional AC from the diff.

If AC are unclear or unmeasurable → return `CANNOT-VERIFY` with the ambiguity called out. Do not guess.

### 2. Start the system; wait until ready

Use the project's documented start command (e.g., `just up-capstone`, `docker compose up`, `npm run dev`). Confirm:

- All depended-on services are healthy (DB, Phoenix, etc.)
- The application has logged its "ready" / "listening on port X" indicator
- No startup errors in any service log

If start fails → return `CANNOT-VERIFY` with the exact failure output. Do not proceed to step 3.

### 3. Exercise each AC item and each enumerated edge case

For each AC item and each edge case, perform the smallest action that exercises it:

| AC type       | Action                                                              | Evidence to capture                         |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| HTTP API      | `curl` with realistic input                                         | status, headers, response body              |
| UI            | Headless browser drive, OR ask user to confirm visually             | screenshot path or "user confirmed: yes/no" |
| DB mutation   | Run `SELECT` after the action                                       | resulting row state                         |
| Log / trace   | grep the log; query trace store; or open dashboard URL for the user | log line, trace ID, or "user confirmed"     |
| Scheduled job | Trigger or wait for it                                              | resulting side effect                       |
| File write    | Inspect the path                                                    | file contents excerpt                       |
| Queue message | Inspect the queue                                                   | message body                                |

If an enumerated edge case is missing from AC → that's an AC-missing problem; return to the AC gate before proceeding.

### 4. Compare and report

For each AC item and each edge case, write one line:

```
- [PASS|FAIL|CANNOT-VERIFY] <AC text> — <observed evidence>
```

Evidence MUST be concrete: a response body, a log line, a trace ID, a DB row, a screenshot path, or "user confirmed: yes/no".

**"Looks fine" / "seems to work" is not evidence.** Reject the temptation to summarize.

## Verdict rules

- All lines PASS → overall **PASS**.
- Any FAIL → overall **FAIL**. List failing items first; PASS items after.
- Any CANNOT-VERIFY (and no FAIL) → overall **CANNOT-VERIFY**. Do not claim PASS even if other items pass.

## Hard rules for the subagent

- Do not implement fixes. Only verify.
- Do not improvise AC.
- Do not declare PASS without observed evidence on the same line.
- Do not re-use cached judgments from prior runs (every dispatch is fresh).
- Do not mark work "done" — only the dispatcher does that, after reading this report.

Return the report. Stop.
