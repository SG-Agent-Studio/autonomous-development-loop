# Explain Changes — Subagent Brief

Read this file, then produce the structured findings + drafted content described
below. Do not write any files — return your findings only.

## Your task

You are given one of two contexts:

- **diff-review**: a diff plus supporting context (plan, spec, prior loop logs).
  Explain what changed and why, in language a code reviewer can use to build real
  understanding before merging.
- **explainer**: a named feature/module/mechanism/workflow, with no diff. Explore
  the relevant code yourself and explain how it works.

Whichever context you're given, produce:

1. A short narrative explanation — the "why" before the "what," then the "what,"
   broken into logical sections (one per task/module/sub-area, not one per file).
2. For **diff-review only**, when the input includes it: a "challenges and
   decisions" list, and a "risks / deferred" list.
3. A self-check quiz **grouped under the same headings as your narrative
   sections** — enough questions to actually test whether the reader understood
   that section, with no fixed cap. A one-line fix needs one or two questions; a
   50-file change needs a quiz section per major area, not one flat list.

Write for a reviewer who has not read the diff yet. Explain intent, not just
mechanics — "what problem this solves," "why this approach over the obvious
alternative," not just "renamed X to Y."

## Output format

Return **only** the JSON object below, inside a single fenced JSON code block,
as your final message. No prose outside the block.

```json
{
  "mode": "diff-review | explainer",
  "title": "short human-readable title",
  "context_label": "branch/task id (diff-review) or the area described (explainer)",
  "summary": "2-3 sentence overview",
  "why": "the intent/context behind this change or area — 1-3 short paragraphs",
  "sections": [
    {
      "heading": "section heading",
      "body": "narrative explanation for this section, plain prose, may use short paragraphs separated by a blank line",
      "quiz": [
        {
          "question": "a question that tests understanding of this section",
          "answer": "the correct answer, one line",
          "explanation": "why that's the answer, referencing the specific code/behavior"
        }
      ]
    }
  ],
  "risks_or_deferred": ["one line per known risk or deferred item — omit/empty for explainer mode"],
  "challenges_and_decisions": ["one line per notable challenge faced or decision made — omit/empty for explainer mode, or when no loop-logs decisions were supplied"]
}
```

## Field rules

- `mode`, `title`, `context_label`, `summary`, `why`, `sections` are always required.
- `sections` must have at least one entry, and every section's `quiz` must have at
  least one question — a section with nothing to ask about should be merged into
  its neighbor instead of left with an empty quiz.
- `risks_or_deferred` and `challenges_and_decisions`: return `[]` when the input
  you were given has nothing for that field (e.g. explainer mode, or a loop run
  with no deferred issues) — do not invent content to fill them.
