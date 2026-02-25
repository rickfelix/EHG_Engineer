# /eva review - Post-Creation Vision & Architecture Review

Review existing vision documents and/or architecture plans using a 3-agent team (Challenger, Visionary, Pragmatist) to identify blind spots, opportunities, and feasibility concerns.

## Usage

```
/eva review --vision-key <key>
/eva review --plan-key <key>
/eva review --vision-key <key> --plan-key <key>
```

## Instructions for Claude

### Step 0: Parse Arguments

From `$ARGUMENTS`, extract:
- `--vision-key <key>` — vision document to review
- `--plan-key <key>` — architecture plan to review

If neither key is provided, ask using AskUserQuestion:

```javascript
{
  "questions": [{
    "question": "What would you like to review?",
    "header": "Review Target",
    "multiSelect": false,
    "options": [
      {"label": "Vision document", "description": "Review a vision document by key"},
      {"label": "Architecture plan", "description": "Review an architecture plan by key"},
      {"label": "Both", "description": "Review a vision document and its linked architecture plan"}
    ]
  }]
}
```

Then ask for the specific key(s). Run `list` commands to help the user choose:
- `node scripts/eva/vision-command.mjs list`
- `node scripts/eva/archplan-command.mjs list`

---

### Step 1: Fetch Document(s)

Fetch the document content from the database:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const visionKey = process.argv[2] || null;
  const planKey = process.argv[3] || null;
  const results = {};
  if (visionKey) {
    const { data } = await supabase.from('eva_vision_documents')
      .select('vision_key, level, content, extracted_dimensions, addendums, status, version')
      .eq('vision_key', visionKey).single();
    results.vision = data;
  }
  if (planKey) {
    const { data } = await supabase.from('eva_architecture_plans')
      .select('plan_key, content, extracted_dimensions, addendums, status, version')
      .eq('plan_key', planKey).single();
    results.plan = data;
  }
  console.log(JSON.stringify(results, null, 2));
}
main().catch(e => console.error(e.message));
" "<VISION_KEY>" "<PLAN_KEY>"
```

If document not found, report the error and exit.

---

### Step 2: Spawn 3-Agent Review Team

Use TeamCreate:

```
team_name: "eva-review"
description: "3-agent review of EVA vision/architecture documents"
```

Then spawn 3 teammates using the Task tool with `team_name: "eva-review"`:

**Challenger** (subagent_type: "general-purpose"):
```
You are the Challenger reviewing an EVA vision/architecture document. Your job is to stress-test it.

Document(s):
[DOCUMENT CONTENT]

Analyze for:
1. BLIND SPOTS: 2-3 things the document fails to address (missing stakeholders, unaddressed failure modes, ignored competitors)
2. ASSUMPTION TESTING: 2-3 assumptions that could be wrong (market, technical, resource)
3. SCOPE CREEP RISK: Areas where scope could expand uncontrollably
4. MISSING STAKEHOLDERS: Who is affected but not mentioned?

Output your analysis as structured markdown sections. Be specific — reference document sections by name.
```

**Visionary** (subagent_type: "general-purpose"):
```
You are the Visionary reviewing an EVA vision/architecture document. Your job is to assess strategic alignment and opportunities.

Document(s):
[DOCUMENT CONTENT]

Analyze for:
1. L1 ALIGNMENT: How well does this align with portfolio-level strategic vision? Score 1-10.
2. HEAL SCORING POTENTIAL: Will the extracted dimensions produce meaningful HEAL scores? Flag weak dimensions.
3. DOWNSTREAM SD QUALITY: Will SDs created from this document have clear scope and success criteria?
4. OPPORTUNITIES: 2-3 strategic opportunities the document could better leverage

Output your analysis as structured markdown sections.
```

**Pragmatist** (subagent_type: "general-purpose"):
```
You are the Pragmatist reviewing an EVA vision/architecture document. Your job is to assess feasibility and implementation reality.

Document(s):
[DOCUMENT CONTENT]

Analyze for:
1. IMPLEMENTABILITY: Score 1-10. Can this actually be built as described?
2. RESOURCE REALISM: Are the implied resources (time, people, infrastructure) realistic?
3. TIMELINE FEASIBILITY: Is the phasing/evolution plan achievable?
4. RECOMMENDED AMENDMENTS: 2-3 specific changes that would improve implementability

Output your analysis as structured markdown sections. Be concrete — suggest specific amendments.
```

**Timeout**: 90 seconds per agent. If an agent times out, proceed with available perspectives.

---

### Step 3: Synthesize Results

After all agents respond (or timeout), synthesize:

```
## Review Synthesis

### Consensus
[Where 2+ perspectives agree — these are high-confidence findings]

### Tensions
[Where perspectives conflict — these are the most valuable insights for the chairman]

### Composite Risk Score
[Low / Medium / High — based on Challenger severity weighted against Pragmatist implementability]

### Key Recommendations
1. [Most impactful recommendation]
2. [Second recommendation]
3. [Third recommendation]
```

Present the full synthesis to the user.

---

### Step 4: Action Decision

Ask using AskUserQuestion:

```javascript
{
  "questions": [{
    "question": "How would you like to act on these review findings?",
    "header": "Review Action",
    "multiSelect": false,
    "options": [
      {"label": "Add addendum with findings", "description": "Append review synthesis as an addendum to the document(s)"},
      {"label": "Update document manually", "description": "I'll make changes myself based on the findings"},
      {"label": "No changes", "description": "Review noted — no modifications needed"}
    ]
  }]
}
```

---

### Step 5: Execute Action

**If "Add addendum"**: Format the synthesis as addendum text and run:

For vision documents:
```bash
node scripts/eva/vision-command.mjs addendum \
  --vision-key <key> \
  --section "<formatted-synthesis>"
```

For architecture plans:
```bash
node scripts/eva/archplan-command.mjs addendum \
  --plan-key <key> \
  --section "<formatted-synthesis>"
```

**If "Update manually"**: Display the key findings in a copy-friendly format.

**If "No changes"**: Acknowledge and proceed.

---

### Step 6: Shutdown Review Team

Send shutdown requests to all 3 teammates:

```
type: "shutdown_request"
recipient: "<agent-name>"
content: "Review complete, shutting down"
```

---

## Related Commands

- `/eva vision` — Create and manage vision documents
- `/eva archplan` — Create and manage architecture plans
- `/brainstorm` — Strategic brainstorming (creates documents that can be reviewed)
- `/heal` — Score codebase against vision dimensions

## Notes

- This skill is read-only by default — it only writes when the user explicitly chooses "Add addendum"
- The 3-agent team mirrors the brainstorm analysis team (Challenger/Visionary/Pragmatist) for consistency
- Review findings are most valuable when the document has been in use for a while and assumptions can be tested
- Addendums preserve the original document while recording review insights for traceability
