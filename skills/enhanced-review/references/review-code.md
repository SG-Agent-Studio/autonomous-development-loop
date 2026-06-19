# Code Review Lens (Pass 1 — Observe)

Collect observations only. **No severity labels, no "garbage," no rating** — that
is Pass 2's job. For each observation, also note a first-cut "why does this code
exist?" tagged as fact (with evidence) or `[hypothesis — unverified]`.

Evidence sources for this target: `git diff main...HEAD`, `git blame <file>`,
commit messages, linked issues, existing tests, code comments.

## Layer 1: Data Structure

> "Show me your tables, and I won't usually need your flowcharts."

- What is the core data? What are its relationships?
- Where does data flow? Who owns it? Who modifies it?
- Is there unnecessary data copying or transformation?

Observe (don't yet judge): multiple representations of the same data; excessive
transformations between layers; unclear ownership; complex state machines that a
better data shape would dissolve.

## Layer 2: Edge Cases

> "Good code has no special cases."

- Count the `if/else` branches. Which are genuine business logic?
- Are there null checks or "empty" handling that better design would remove?
- Are there multiple code paths doing nearly the same thing?

Observe: functions over 3 levels of indentation; long `if/else if` chains;
try-catch wrapping whole functions; special handling for null/empty cases.

## Layer 3: Complexity

> "If it needs more than 3 levels of indentation, redesign it."

- What is the essence of this change, in one sentence?
- How many concepts does it use? Could that be halved?
- Would a junior developer understand it in 5 minutes?

Observe: functions over 50 lines; nesting deeper than 3; design patterns used
"because we should"; abstractions with one implementation; "flexible" code with no
actual variability.

## Layer 4: Backward Compatibility

> "Never break userspace."

- What existing features could this affect? Any API contract changes?
- Will existing code still compile/run? Config or data-format changes?

```bash
# Removed/changed public surface
git diff main...HEAD -- '*.ts' '*.js' | grep -E '^[-].*export (class|function|interface|type|const)'
git diff main...HEAD | grep -E '^[-].*function.*\('
# Schema/migrations
git diff main...HEAD -- '**/migrations/*'
```

Observe: removed/renamed public functions or classes; changed signatures; dropped
DB columns without migration; renamed config keys; changed response formats.

## Layer 5: Practicality

> "Theory and practice sometimes clash. Theory loses."

- Does this problem actually exist in production? Who is affected?
- Does the solution's complexity match the problem's severity?

```bash
gh issue view <number>      # is there a real report?
git diff main...HEAD -- '**/*.test.ts' '**/*.spec.ts'   # are tests real behavior?
```

Observe: complex solutions to hypothetical problems; "what if" without evidence;
defensive code for impossible states; optimizations without measurements.
