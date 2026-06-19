# Review Output Format

Write the review in this format. "Artifact" = the code change, spec, or plan under
review. The taste rating is an **earned conclusion** from Pass 2 — never write it
before the reflection is done.

```markdown
## Review: [Artifact name] — [Code | Spec | Plan]

### 【Taste Rating】
[🟢 Good Taste / 🟡 Mediocre / 🔴 Garbage] — earned after reflection.

### 【Three Questions】
1. **Real problem?** [Yes/No] — [why]
2. **Simpler way?** [Yes/No] — [alternative if yes]
3. **Breaks anything?** [Yes/No] — [what, if yes]

### 【Findings】
For each finding (most severe first):

#### [Finding title]  — [🟢/🟡/🔴]
**Observation:** [what is in the artifact]
**Causal chain:** [one line: symptom → why → … → root cause; mark any
`[hypothesis — unverified]` link]
**Root cause:** [the systemic cause — a process/mechanism/absence, never a person]
**Closing change:** [the durable systemic fix — test/lint/eval/schema for code;
tightened requirement/acceptance criterion for a spec; reordered step/added
checkpoint for a plan]

### 【Final Verdict】
✅ **SHIP IT** — [why] / 🟡 **FIX BEFORE PROCEEDING** — [must-fix list] /
❌ **RETHINK THIS** — [why fundamentally flawed + what to do instead]

### 【Linus Would Say】
[One direct, sharp, honest line — aimed at the artifact, never the author.]

### 【Self-check】
no person blamed · evidence per link (hypotheses labelled) · didn't stop early or
over-reach · branched where needed · every finding has a concrete closing change.
```

Notes:
- A 🟢 finding's causal chain is one line and needs no closing change.
- If a finding's chain rests on an unverified hypothesis, say so and do not state
  the verdict more harshly than the evidence supports.
