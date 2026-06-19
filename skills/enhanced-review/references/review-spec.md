# Spec Review Lens (Pass 1 — Observe)

A spec defines **what** to build. Collect observations only — no ratings yet. For
each, note a first-cut "why is this requirement here?" tagged as fact (with
evidence) or `[hypothesis — unverified]`.

**Format-agnostic:** specs come as BRDs, issues, Notion exports, ticket
paragraphs, or the superpowers format. Map these questions onto whatever structure
exists. **If an element you'd expect (e.g., a testable acceptance criterion) is
absent, that absence is itself an observation — not a format mismatch.**

Evidence sources for this target: the goal/BRD the spec serves, user reports,
prior art, related specs.

## Layer 1: The Implied Data Model

> "Show me your tables."

- What core entities/data does this spec imply, and how do they relate?
- Is the same concept named two different ways across the spec?
- Does the spec describe data ownership and lifecycle, or leave it undefined?

Observe: contradictory descriptions of the same entity; relationships left
implicit; a data model that would force special-case code downstream.

## Layer 2: Requirement Special Cases

> "Good code has no special cases" — and neither does a good spec.

- Count the "if X then special behavior" requirements. Which are essential?
- Are any requirements contradictory or overlapping?
- Could a cleaner model collapse several requirements into one?

Observe: special-case requirements that hint at a wrong underlying model;
mutually exclusive requirements; requirements that restate each other.

## Layer 3: Scope & Complexity

> "Cut the concept count in half, then again."

- State the spec's essence in one sentence. Does every requirement serve it?
- Is there scope creep — requirements nobody asked for?
- How many concepts must a reader hold to understand it?

Observe: gold-plating; "nice to have" mixed with "must have" without distinction;
requirements driven by imagined future needs (YAGNI violations).

## Layer 4: Compatibility & Contracts

> "Never break userspace."

- Does this spec change existing user-visible behavior or contracts?
- Are there migration/transition requirements, or are breaks silent?
- Does it conflict with an existing spec or established expectation?

Observe: behavior changes with no migration story; assumptions that contradict the
current system; unstated breaking changes.

## Layer 5: Practicality & Testability

> "Theory loses. Every single time."

- Is this a real, evidenced problem? Who is genuinely affected?
- Does each requirement have a **testable** acceptance criterion?
- Does the spec's ambition match the problem's severity?

Observe: requirements with no way to verify "done"; success defined subjectively;
complexity disproportionate to the problem; **missing acceptance criteria** (an
absence-observation).
