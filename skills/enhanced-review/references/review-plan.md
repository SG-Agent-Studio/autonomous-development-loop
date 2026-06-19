# Plan Review Lens (Pass 1 — Observe)

A plan defines **how** to build it: an ordered set of steps. Collect observations
only — no ratings yet. For each, note a first-cut "why is this step here?" tagged
as fact (with evidence) or `[hypothesis — unverified]`.

**Format-agnostic:** plans come as numbered lists, checklists, phased milestones,
issues, or the superpowers format. Map these questions onto whatever structure
exists. **If an element you'd expect (e.g., a verification step after a risky
change) is absent, that absence is itself an observation — not a format
mismatch.**

Evidence sources for this target: the spec the plan derives from, the codebase the
plan will touch, related plans/runbooks.

## Layer 1: State & Data Flow Across Steps

> "Show me your tables."

- What state/data does the plan move through? Does each step have clear
  inputs and outputs?
- Is ownership of each artifact clear (who produces it, who consumes it)?

Observe: steps whose inputs are never produced by a prior step; shared mutable
state across steps with no owner; outputs that nothing consumes.

## Layer 2: Step Special Cases

> "Good code has no special cases."

- Are there steps that exist only to patch a fragile earlier choice?
- Are there conditional/branching steps ("if it fails, then…") that a better
  approach would remove?

Observe: cleanup/workaround steps; steps that undo a previous step; branches that
signal the approach itself is shaky.

## Layer 3: Sequencing & Complexity

> "Cut it in half."

- Are dependencies correct — does anything depend on a later step?
- Is every step necessary, or could the plan be half as long?
- Is the chosen approach over-engineered for the goal?

Observe: out-of-order dependencies; redundant steps; an elaborate approach where a
direct one exists; phases that add ceremony without value.

## Layer 4: Destructive Analysis

> "Never break userspace."

- Which steps touch existing behavior, data, or contracts?
- Is there a rollback / reversibility story for risky steps?
- Are migrations ordered safely (e.g., expand before contract)?

Observe: irreversible steps with no backout; destructive operations before
verification; migration ordering that risks downtime or data loss.

## Layer 5: Practicality & Verifiability

> "Theory loses."

- Is each step **independently verifiable** — is there a test or checkpoint?
- Does the plan deliver working, testable increments, or one big-bang at the end?
- Does the effort match the problem's severity?

Observe: steps with no way to confirm success; absence of test/verification steps
after meaningful changes (an absence-observation); a plan that only works if
everything lands at once.
