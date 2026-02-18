# /eva research - EVA Research Command

Tiered research investigation with intent-based routing: L1 (WebSearch), L2 (codebase
triangulation), L3 (multi-model deep research). Results persisted with optional vision linkage.

## Usage

```
/eva research <question> [--tier L1|L2|L3] [--vision-key <key>]
```

## Instructions for Claude

### Step 1: Parse Arguments

From `$ARGUMENTS`, extract:
- **question**: Everything before any flags (required)
- **`--tier`**: `L1`, `L2`, or `L3` (optional, overrides auto-select)
- **`--vision-key`**: e.g. `VISION-EHG-L1-001` (optional, links result to vision document)

If no question is provided, ask:
```
"What would you like to research? (e.g. 'What is the current Claude API pricing?' or 'Does our handoff system support EXEC-TO-PLAN for infrastructure SDs?')"
```

---

### Step 2: Select Research Tier

**If `--tier` was provided**, use it directly. Show:
```
Research Tier: L<N> (forced via --tier flag)
```

**If `--tier` was NOT provided**, auto-select based on question keywords:

| Tier | Route to | Trigger keywords |
|------|----------|-----------------|
| **L1** | WebSearch | "what is", "define", "explain", "when was", "who", "latest", "current price", "how many", "news about", "released", "announced" |
| **L2** | triangulation-protocol | "does our", "in our codebase", "verify", "check if", "confirm whether", "is there a script", "how does our", "does the system", "in our repo" |
| **L3** | research engine | everything else — strategic, architectural, exploratory questions |

Show the selected tier before proceeding:
```
Auto-selected tier: L<N> — <reason>
(Use --tier L1|L2|L3 to override)
```

---

### Step 3: Execute Research

#### L1 — Web Search (factual/definitional)

Use the WebSearch tool directly with the question as the query. Collect the top results and
summarize as key findings (3-5 bullet points).

#### L2 — Codebase Triangulation

Use the Skill tool to invoke the `triangulation-protocol` skill with the question as the argument.
The triangulation-protocol will do a structured verification against the codebase. Collect its
output as the research result.

#### L3 — Multi-Model Deep Research

Use the Skill tool to invoke the `research` skill with the question as the argument.
The research skill will query multiple AI providers in parallel and synthesize a structured report.
Collect its output as the research result.

---

### Step 4: Validate Vision Key (if provided)

If `--vision-key` was specified, verify it exists:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('eva_vision_documents')
  .select('vision_key, level')
  .eq('vision_key', '<vision-key>')
  .single()
  .then(({data, error}) => {
    if (error || !data) console.log('VISION_KEY_VALID=false');
    else console.log('VISION_KEY_VALID=true\nVISION_LEVEL=' + data.level);
  });
" 2>/dev/null
```

- If `VISION_KEY_VALID=false`: Show warning and proceed without linkage:
  ```
  ⚠️  Vision key '<key>' not found. Proceeding without vision linkage.
  ```
- If `VISION_KEY_VALID=true`: Confirm linkage will be stored.

---

### Step 5: Display Results

Format the output based on the tier used:

#### L1 Output Format
```
════════════════════════════════════════════════════════════
  /eva research — L1 Web Search
════════════════════════════════════════════════════════════

  Question: <question>
  Tier: L1 (Web Search)
  [Vision: <vision-key>]  ← only if --vision-key provided

  KEY FINDINGS
  ────────────────────────────────────────────────────────
  • <finding 1>
  • <finding 2>
  • <finding 3>

════════════════════════════════════════════════════════════
```

#### L2 Output Format

Display the triangulation-protocol output directly, prefixed with:
```
════════════════════════════════════════════════════════════
  /eva research — L2 Codebase Triangulation
════════════════════════════════════════════════════════════

  Question: <question>
  Tier: L2 (Triangulation Protocol)
  [Vision: <vision-key>]  ← only if --vision-key provided

<triangulation-protocol output>
════════════════════════════════════════════════════════════
```

#### L3 Output Format

Display the research skill output directly, prefixed with:
```
════════════════════════════════════════════════════════════
  /eva research — L3 Multi-Model Deep Research
════════════════════════════════════════════════════════════

  Question: <question>
  Tier: L3 (Multi-Model Research)
  [Vision: <vision-key>]  ← only if --vision-key provided

<research skill output>
════════════════════════════════════════════════════════════
```

---

### Step 6: Save Research Session

Save the session to `brainstorm_sessions` with vision linkage metadata:

```bash
node scripts/eva/save-research-session.mjs \
  --topic "<question>" \
  --tier <L1|L2|L3> \
  --summary "<one-sentence summary of findings>" \
  [--vision-key <key>]
```

The script will print the session ID on success. If it fails, show a warning but do not block the
user — research results are already displayed.

---

### Step 7: Offer Next Steps

```javascript
{
  "questions": [{
    "question": "How would you like to proceed with this research?",
    "header": "Next Step",
    "multiSelect": false,
    "options": [
      {"label": "Create SD", "description": "Turn this into a strategic directive for implementation"},
      {"label": "Link to vision", "description": "Associate this research with a vision dimension"},
      {"label": "Refine question", "description": "Ask a follow-up or deeper question"},
      {"label": "Done", "description": "Research complete, no further action needed"}
    ]
  }]
}
```

**If "Create SD" selected**: Invoke the `leo` skill with args `create` and suggest a title derived from the research question.

**If "Link to vision" selected**: Ask which vision key to link to, then re-run Step 6 with the vision key.

**If "Refine question" selected**: Ask for the refined question and restart from Step 2.

---

## Related Commands

- `/eva vision` — Manage vision documents
- `/eva archplan` — Manage architecture plans
- `/triangulation-protocol` — Standalone codebase verification (L2 backend)
- `/research` — Standalone deep multi-model research (L3 backend)
- `/brainstorm` — Open-ended strategic brainstorming

## Notes

- L1 is fastest (~5s), best for factual/definitional questions
- L2 reads the codebase, best for "does our system do X?" questions
- L3 queries multiple AI providers in parallel, best for architectural exploration
- All sessions are stored in `brainstorm_sessions` with `domain='protocol'`, `mode='structured'`
- Vision linkage is stored in `metadata.vision_key` and enables EVA scoring traceability
