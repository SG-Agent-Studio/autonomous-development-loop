---
name: enhanced-review
description: Linus Torvalds-style review for code, specs, AND plans. Defers every verdict behind an evidence-backed five-why reflection so judgment is earned, not reflexive. Reviews for good taste, simplicity, data structures, edge cases, and backward compatibility. Use before merging code, or before implementing a spec/plan (shift-left).
---

# Enhanced Review (Linus Torvalds Style + Five-Why Reflection)

## What This Skill Does

Reviews a **code change, a spec, or a plan** through Linus Torvalds' philosophy —
simplicity, data structures over algorithms, elimination of edge cases,
pragmatism, backward compatibility — with one discipline added: **judgment is
deferred until you understand why the artifact is the way it is, and that
understanding is backed by evidence.** Catching a bloated requirement or a
mis-sequenced plan before implementation is far cheaper than catching it in code.

## When To Use

- **Before merging code** — catch design flaws before they become tech debt.
- **Before implementing a spec** — catch vague, contradictory, or over-scoped
  requirements while they're cheap to change (shift-left).
- **Before executing a plan** — catch bad step ordering, missing verification, or
  an over-engineered approach.
- **When something feels off** — trust the intuition, then verify systematically.

## What This Review Is NOT

- NOT bike-shedding or style-preference enforcement.
- NOT being "nice" at the expense of technical truth.
- NOT theoretical perfection over practical usability.
- NOT a snap verdict — no rating before the five-why reflection.
- NOT blaming a person — every cause is a system fact.

## The Linus Philosophy

> "Bad programmers worry about the code. Good programmers worry about data
> structures and their relationships."

1. **Good Taste** — eliminate special cases; make them the normal case.
2. **Never Break Userspace** — backward compatibility is sacred.
3. **Pragmatism** — solve real problems, not imaginary ones.
4. **Simplicity** — more than 3 levels of indentation means redesign it.

These apply to specs and plans too: a spec full of special-case requirements has a
bad data model; a plan full of special-case steps has a fragile design.

## Non-Negotiable Rules

These hold for every review, regardless of target. Do not skip them.

1. **See before you judge.** Pass 1 collects observations with NO severity labels,
   NO "garbage," NO rating. Verdicts come only in Pass 2, after reflection.
2. **Evidence or hypothesis.** Every "why" answer must cite an observation (git
   blame, commit, issue, test, comment, the source spec/goal) OR be tagged
   `[hypothesis — unverified]`. A hypothesis can NEVER drive a negative verdict as
   if it were fact.
3. **System facts, not blame.** Never name a person as a cause. Restate every
   person-centric answer as a missing process, mechanism, or control.
4. **Close with a systemic change.** Every finding's recommendation names a durable
   change that prevents the whole class of problem — not just "fix this line."

## Process

### Step 0 — Detect the target

Decide what you're reviewing — **code, spec, or plan** — from its substance, not
its filename or template (specs/plans may be a BRD, an issue, a Notion export, or
any format):

- **Code** → source files, a diff, language syntax.
- **Spec** → prose describing WHAT to build: behavior, requirements, constraints.
- **Plan** → an ordered set of actions describing HOW: steps, phases, tasks.
- **Mixed or unclear** → state your best guess and ask the user.

### Step 1 — The Three Questions

1. **Real problem or imaginary?** Check commits, issues, the source goal.
2. **Is there a simpler way?** Complexity is guilty until proven necessary.
3. **Will this break anything?** Backward compatibility is the law.

### Step 2 — Identify what's under review + evidence sources

Scope the artifact (blast radius) and note the evidence you can draw on:
- Code → `git diff main...HEAD`, `git blame`, commits, issues, tests.
- Spec → the goal/BRD it serves, user reports, prior art.
- Plan → the spec it derives from, the codebase it will touch.

### Step 3 — Pass 1: Observe (no verdicts)

Load the lens for your target and collect observations. **Descriptive only — no
ratings.** For each, capture a first-cut "why does this exist?", flagged as fact or
`[hypothesis — unverified]`.

- Code → read `references/review-code.md`
- Spec → read `references/review-spec.md`
- Plan → read `references/review-plan.md`

### Step 4 — Pass 2: Interrogate, then judge

For EVERY observation, run a proportional five-why chain, then assign its verdict.
Read `references/five-why-reflection.md` for the full discipline. In short:
fine element → one "why" and stop; candidate flaw → walk back to a systemic,
actionable cause; each "why" is evidence-backed or labelled hypothesis; convert
blame to system facts; branch when causes are multiple; verdict (🟢/🟡/🔴) LAST.

### Step 5 — Produce the review

Read `references/output-format.md` and write the review in that format: earned
taste rating, findings with one-line causal chains, recommendations upgraded to
root cause + systemic closing change, and a self-check line. For good/bad taste
illustrations, see `references/examples.md`.

## Remember

> "Talk is cheap. Show me the code." — Linus Torvalds

The goal is not to be mean, but to be honest — and to be *right*. A harsh verdict
on an artifact you didn't understand is just noise. Understand first, with
evidence; then judge without flinching.
