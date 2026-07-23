# Render rules — explain-changes

Fill `template.html` using the JSON payload from Step 4.

**Simple replacements** (direct from payload):
- `{{TITLE}}` → `title`
- `{{MODE_LABEL}}` → `mode`
- `{{CONTEXT_LABEL}}` → `context_label`
- `{{SUMMARY}}` → `summary`
- `{{DATE}}` → today's date (`date -u +%Y-%m-%d`)

**`{{WHY}}` and `{{SECTION_BODY}}`**: split on blank lines; emit one `<p>…</p>` per paragraph.

**`{{STATS_HTML}}`**: for each entry in `stats`, emit:
`<div class="stat"><div class="n">{{n}}</div><div class="l">{{l}}</div></div>`.
If `stats` is empty, emit nothing.

**Section numbering**: Why = 1. Content sections start at 2. Challenges (if present) and Risks (if present) follow. Quiz is always last. Track a running counter.

**`{{TOC_ITEMS}}`**: one `<li><a href="#{{id}}">{{num}}. {{heading}}</a></li>` per section, in order:
- `#why` → "Why" (num 1)
- One per `sections[]`: id = slugify(heading) (lowercase, spaces→hyphens, strip non-alphanumeric except hyphens), num = running counter
- `#challenges` → "Challenges & decisions" (if non-empty), with its num
- `#risks` → "Known risks & deferred" (if non-empty), with its num
- `#quiz` → "Quiz" with its num

**SECTION:BEGIN/END block**: duplicate once per `sections[]` entry. Fill:
- `{{SECTION_NUM}}` → section's counter value
- `{{SECTION_ID}}` → slugified heading
- `{{SECTION_HEADING}}` → `heading`
- `{{SECTION_BODY}}` → `body` split into `<p>` blocks

**CHALLENGES:BEGIN/END block**: keep if `challenges_and_decisions` non-empty; fill `{{CHALLENGES_NUM}}`. Duplicate `CHALLENGE_ITEM <li>` per entry, filling `{{CHALLENGE_TEXT}}`. Delete whole block if empty.

**RISKS:BEGIN/END block**: same for `risks_or_deferred`, filling `{{RISKS_NUM}}` and `{{RISK_TEXT}}`. Delete whole block if empty.

**Quiz section**:
- `{{QUIZ_NUM}}` → quiz's counter value (always last)
- `{{QUIZ_TOTAL}}` → total questions across all `sections[]`
- `{{QUIZ_PASS_THRESHOLD}}` → `Math.ceil(total * 10 / 12)`, minimum 1
- `{{QUIZ_QUESTIONS_JS}}` → flat JS array literal from all sections' `quiz[]`, concatenated in order:

```
[
  {q: "question text", options: ["A", "B", "C", "D"], correct: 1, explain: "explanation"},
  ...
]
```

Use unquoted JS keys. Escape any backticks or `${` in string values.

**Cleanup**: remove all `<!-- ...:BEGIN -->` / `<!-- ...:END -->` marker comments from the final output.
