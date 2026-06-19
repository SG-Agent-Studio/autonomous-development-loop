# Five-Why Reflection (Pass 2 — Interrogate, then judge)

For **every** observation from Pass 1, run a five-why chain, then — and only then —
assign its verdict. This is the discipline that turns a snap reaction into an
earned conclusion.

## Proportional length

The chain length matches the observation:

- **Obviously-fine element** → resolve in a single "why" and stop.
  Example: `Why is this loop here? — It maps inputs to outputs; intentional,
  evidence: matches the spec's requirement R3. Fine.`
- **Candidate flaw** → walk back fully to a systemic, actionable cause.

This is how "every observation gets a chain" stays readable.

## The loop

1. **State the observation concretely** — the symptom: what is here, and what's
   odd about it.
2. **Ask "why is it this way?"** — answer with a single cause. The answer must
   **cite an observation** (git blame, commit message, linked issue, test,
   comment; or for specs/plans: the source goal/BRD, the spec a plan derives from,
   the codebase it touches) **or be tagged `[hypothesis — unverified]`.**
3. **Take that answer as the new subject and ask "why?" again.** Re-read the chain
   backwards with "therefore" to validate each link.
4. **Stop** when the cause is both **systemic** (fixing it prevents the whole
   *class* of problem) **and actionable** (the fix is in your team's scope).
5. **Branch** when an observation has multiple independent contributing causes;
   carry each branch to its own root cause.
6. **Assign the verdict (🟢/🟡/🔴) LAST.**

## The non-negotiable rules

- **Evidence or hypothesis.** A confident-sounding reason is always available —
  the model will happily generate one. Plausibility is not evidence. Any link you
  cannot back with an observation is `[hypothesis — unverified]`, and **a
  hypothesis can never drive a negative verdict as if it were fact.** Go get the
  evidence, or soften the verdict.
- **System facts, not blame.** Never name a person as the cause — human error is a
  symptom of a missing guardrail. Wrong: "the engineer forgot the null check."
  Right: "there is no lint rule or test that catches a missing null check before
  merge."
- **Don't stop too early** (the first satisfying answer is usually still a
  symptom) and **don't over-reach** (a chain that bottoms out at "wrong company
  culture" is true but useless — stop at the deepest cause your team can change).

## The closing change (what the chain is FOR)

The output of a chain is not the chain — it's the **durable, systemic fix the
chain justifies**. Per target:

- **Code** → an automated test that fails on the bug; an alert/monitor; a schema
  or type constraint that makes the bad state unrepresentable; a lint rule.
- **Spec** → a tightened/clarified requirement; removed scope; an added testable
  acceptance criterion; a resolved contradiction.
- **Plan** → a reordered or removed step; an added verification checkpoint; a
  rollback step for a risky operation.

Prefer fixes that make the failure *impossible* or *automatically detected* over
fixes that merely make it less likely. **A chain that produces no change was an
exercise, not an investigation.**

## Worked examples

**Code:**
- Observation: a function null-checks every field before use.
- Why? — The upstream parser can return partial objects. _(evidence: parser
  returns `Partial<T>`.)_
- Why can it? — The schema allows every field to be optional. _(evidence: type
  definition.)_
- Root cause: the type is too loose; nothing enforces required fields.
- Closing change: tighten the schema so required fields are non-optional; the
  null-checks become unnecessary. Verdict: 🟡 (defensible today, but the data
  model is the real fix).

**Spec:**
- Observation: "the system should be fast" appears as a requirement.
- Why is it phrased this way? — No latency target was agreed. _(evidence: no
  number anywhere in the doc.)_
- Why not? — `[hypothesis — unverified]` the author may not have had one. Do not
  let this drive the verdict; the *observation* (untestable requirement) stands on
  its own.
- Closing change: replace with a testable acceptance criterion (e.g., p95 < 200ms
  on the reference dataset). Verdict: 🟡.

**Plan:**
- Observation: the migration step runs before any backup step.
- Why this order? — The plan lists steps in feature order, not safety order.
  _(evidence: step numbering.)_
- Why does that matter? — A failed migration has no backout. _(evidence: no
  rollback step anywhere.)_
- Root cause: the plan has no reversibility discipline for destructive steps.
- Closing change: add a backup checkpoint before the migration and a rollback
  step. Verdict: 🔴 (data-loss risk).

## Self-check before declaring done

- [ ] No person blamed — every cause is a system fact.
- [ ] Every link has evidence, or is labelled `[hypothesis — unverified]`.
- [ ] Didn't stop at the first satisfying symptom.
- [ ] Didn't over-reach past what the team can change.
- [ ] Branched where causes were genuinely multiple.
- [ ] Each finding produces a concrete, systemic closing change.
