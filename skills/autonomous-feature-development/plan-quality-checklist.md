# Plan Quality Checklist

Used by Stage 1 (`stage-plan-gate.md`) to judge whether `plan_path` is
detailed enough to execute directly, and by the elaboration subagent when
revising it. Self-contained: extracted once from `superpowers:writing-plans`'
quality bar so Stage 1 never depends on invoking that external skill at
runtime — a fresh subagent can't be relied on to resolve a named external
skill, and this bar should survive `superpowers` changing internally.

## Required structure

- [ ] Header present: `Goal`, `Architecture`, `Tech Stack`, `Spec`, `Global
      Constraints`.
- [ ] Every `### Task N: <name>` heading has:
  - `Files` block: `Create:`, `Modify:` (exact path, line range if
    modifying), `Test:` — each an exact path.
  - `Interfaces` block: `Consumes:` (exact signatures used from earlier
    tasks) and `Produces:` (exact function/type names and signatures later
    tasks rely on).
  - Steps as a checklist (`- [ ] Step N: ...`), each one action: write
    failing test, run it to confirm it fails, write minimal implementation,
    run it to confirm it passes, commit.
- [ ] Every code step shows the actual code or command — never a
      description of what to do instead of showing it.

## No-Placeholders red flags

Mark the plan `insufficient` if any of these appear anywhere in a task's
content:

- `TBD`, `TODO`, "implement later", "fill in details"
- "add appropriate error handling" / "add validation" / "handle edge cases"
  without showing the actual handling
- "write tests for the above" without actual test code
- "similar to Task N" without repeating the actual content
- A step that describes an action without showing how (a code step with no
  code block)
- A reference to a type, function, or method not defined in any task in
  this plan

## Semantic coherence

A plan can pass every box above and still be vague. Also check:

- [ ] Each task's steps are plausible given `spec_path` — no invented field
      names, endpoints, or behavior that contradicts the spec.
- [ ] Task boundaries make sense — each task ends with something
      independently testable.
- [ ] Interfaces declared as `Produces` in one task are actually `Consumed`
      with matching signatures in later tasks that need them.

## Verdict

- `sufficient` — every box above is checked.
- `insufficient` — one or more boxes unchecked. List every unchecked box as
  a finding: one line, naming what's missing/wrong and where (task number
  or section).
