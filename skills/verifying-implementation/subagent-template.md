# Subagent Dispatch Template

Loaded when the gate reaches step 4. The implementer (controller) dispatches a fresh subagent with the contract below.

## Required dispatch context (all 7 fields)

The dispatch prompt MUST contain ALL of:

1. **AC verbatim** — quoted from the plan / spec / task. Not paraphrased.
2. **Edge cases** — enumerated; each one becomes a separate PASS/FAIL line in the report.
3. **What was built** — file paths and a one-line summary of the change at each. Diff is optional but helpful.
4. **How to start the system** — exact command(s), required env vars, expected ready signal.
5. **Where to observe** — URLs (UI, dashboards), log file paths, DB connection details, trace store endpoint.
6. **Observation tools available** — `curl`, headless browser, user-in-the-loop fallback. State which.
7. **The Tier 3 procedure** — include `tier-3-procedure.md` content (or a link the subagent can read).

If the dispatcher cannot fill all 7 fields, the missing ones are themselves a verification blocker. Surface to the user before dispatching.

## Subagent's job

- Run the Tier 3 walk-through.
- Return a structured per-AC report.
- Stop.

## Subagent forbidden actions

- **Improvising AC** not in the dispatch prompt
- **Implementing fixes** (any code change)
- **Declaring PASS** without observed evidence on the same line
- **Re-using cached judgments** from prior runs
- **Marking work "done"** — only the dispatcher does that, after reading the report
- **Inferring intent** from the diff to fill gaps in AC

## On FAIL: re-dispatch is FRESH

If the report has any FAIL, the dispatcher fixes the code, then dispatches a NEW subagent. Old context taints the verdict. Each verification round starts clean.

## Output contract

```
## Verification Report

**System started:** <command output excerpt confirming ready signal>

### Per-AC results
- [PASS|FAIL|CANNOT-VERIFY] AC1: <verbatim AC text> — <observed evidence>
- [PASS|FAIL|CANNOT-VERIFY] AC2: <verbatim AC text> — <observed evidence>
- ...

### Edge cases
- [PASS|FAIL|CANNOT-VERIFY] Edge 1: <text> — <observed evidence>
- ...

### Overall verdict
[PASS | FAIL | CANNOT-VERIFY]

### Notes (optional)
Any observed-but-not-AC behavior worth flagging.
```

## Example dispatch prompt skeleton

```
You are the behavior-verification subagent. Run the Tier 3 walk-through against the running system and return a structured per-AC report. Do not implement fixes. Do not improvise AC.

## AC (verbatim from the plan)
1. POST /api/notes returns 201 with the created note's id
2. The note appears in pgvector with the correct embedding
3. A Phoenix trace is recorded under project "second-brain" with an LLM call span

## Edge cases
- Empty body → 400
- Body > 10KB → 413

## What was built
- src/api/notes.py — new POST handler
- src/services/notes_service.py — embedding + insert
- (small changes to docker-compose.yml)

## How to start
`just up-capstone`. Wait for "Application startup complete" in app log.

## Where to observe
- API: http://localhost:3001
- Phoenix UI: http://localhost:6006 (project "second-brain")
- DB: postgres://postgres@localhost:5432/postgres, table notes
- Logs: `docker compose logs app`

## Tools you have
- curl
- psql
- User-in-the-loop fallback for the Phoenix UI check

## Procedure
<inline tier-3-procedure.md, or link to it>

Return the report. Stop.
```
