# Acceptance Criteria Gate

Loaded when the gate reaches step 2 and AC are missing or vague.

## Why this gate exists

You cannot verify what isn't specified. If you proceed without AC, you'll verify the diff against itself — which always passes, and proves nothing.

## When to load this

The current task has no AC, OR the AC are too vague to produce a PASS/FAIL judgment. Examples of vague:

- "improve performance" (no target)
- "make it work" (no inputs / outputs specified)
- "support feature X" (no observable behavior named)
- "fix the bug" (no reproducer or expected post-fix behavior)

## What to do

1. **Stop the gate.** Do not dispatch the verification subagent.
2. **Propose candidate AC.** Read the task, plan, spec, and diff. Write a candidate AC list — concrete, observable, testable.
3. **Ask the user to confirm or edit.** Use the template below.
4. **Wait for explicit user response.** Do not proceed on assumed assent. The user must confirm, edit, or supply their own AC.
5. **Once AC are confirmed, return to the gate at step 3.**

## User-prompt template

```
I cannot verify this work because AC aren't defined (or are too vague to test).

Based on <plan/task/diff>, my candidate AC list:

1. <AC text — observable, testable, single PASS/FAIL>
2. <AC text>
...

Edge cases I'd also verify:
- <edge case>
- ...

Please confirm, edit, or replace this list before I dispatch verification.
```

## What counts as a "good enough" AC

- Names a specific input or trigger ("user submits a chat message", "service starts", "POST /notes called with valid body")
- Names a specific observable result ("HTTP 200 with body matching schema X", "trace appears in Phoenix project Y", "row inserted in table Z with column W = ...")
- Is judgable in a single PASS/FAIL after observation; no "kind of works"

## What does NOT count

- "Should work"
- "Behaves correctly"
- "Performance is good"
- "User can use the feature" (without naming what user does and what they observe)

If a candidate AC fails this bar, rewrite it before sending to the user.

## Forbidden shortcuts

- Do **not** infer AC from the diff and proceed silently — the diff is what was built; AC are what was asked. Verifying the diff against itself is not verification.
- Do **not** treat user silence in auto mode as confirmation. Auto mode does not waive AC definition.
- Do **not** invent AC just to push past this gate. If the user can't articulate AC, the work isn't ready to be marked done.
