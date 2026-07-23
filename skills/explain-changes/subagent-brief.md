# Explain Changes — Subagent Brief

Read this file, then produce the structured findings described below. Do not write any files — return findings only.

## Your task

You are given one of two contexts:

- **diff-review**: a diff plus supporting context (plan, spec, prior loop logs). Explain what changed and why, for a reviewer building real understanding before merging.
- **explainer**: a named feature/module/mechanism/workflow, no diff. Explore the relevant code and explain how it works.

Produce:

1. A short narrative — "why" before "what," broken into logical sections (one per task/module/sub-area, not one per file).
2. For **diff-review** only: a "challenges and decisions" list and a "risks / deferred" list (when the input includes them).
3. A consolidated quiz across all sections — multiple-choice, 4 options each, exactly one correct. Enough questions to test real understanding: one-line change = 1–2 questions; large change = 2–4 questions per major section.

Write for a reviewer who has not read the diff. Explain intent first — "what problem this solves," "why this approach over the obvious alternative" — not just "renamed X to Y."

**Write extremely concisely. Sacrifice grammar for brevity. No padding. Technical prose only.**

## Output format

Return **only** the JSON object below, inside a single fenced JSON code block, as your final message. No prose outside the block.

```json
{
  "mode": "diff-review | explainer",
  "title": "short human-readable title",
  "context_label": "branch/task id (diff-review) or the area described (explainer)",
  "summary": "1-2 sentence overview — extremely concise",
  "why": "intent/context — 1-2 short paragraphs, terse",
  "stats": [
    {"n": "12/12", "l": "tasks done"}
  ],
  "sections": [
    {
      "heading": "section heading",
      "body": "narrative for this section — short paragraphs separated by blank line, concise",
      "quiz": [
        {
          "q": "question testing understanding of this section",
          "options": ["option A", "option B", "option C", "option D"],
          "correct": 1,
          "explain": "why that's correct, referencing specific code/behavior — one sentence"
        }
      ]
    }
  ],
  "risks_or_deferred": ["one terse line per known risk or deferred item — omit/empty for explainer"],
  "challenges_and_decisions": ["one terse line per notable challenge or decision — omit/empty for explainer, or when no loop-log decisions supplied"]
}
```

## Field rules

- `mode`, `title`, `context_label`, `summary`, `why`, `sections` are always required.
- `stats`: include meaningful counts from the diff/logs (task counts, test counts, review rounds, issues fixed). Use empty array `[]` when nothing meaningful is available.
- `sections` must have at least one entry; every section's `quiz` must have at least one question.
- Each quiz item: `options` is exactly 4 strings; `correct` is 0-indexed (0–3); one correct answer only.
- `risks_or_deferred` and `challenges_and_decisions`: return `[]` when nothing applicable — do not invent content.
- All prose: extremely concise. Omit filler sentences. No "in summary", "as mentioned", "it's worth noting".
