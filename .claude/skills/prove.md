# /prove — Interactive Venture Proving Companion

**Trigger**: User types `/prove`

## Instructions

This skill wraps the venture proving companion (scripts/venture-proving-companion.js) in a guided, menu-driven CLI experience. ALL user interaction MUST use AskUserQuestion. NEVER auto-advance past a gate — the Chairman always decides.

### Step 1: Detect Context

Query for active proving runs and session state:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Check session metadata for sticky venture
  const { data: sessions } = await supabase.from('claude_sessions')
    .select('metadata')
    .eq('status', 'active')
    .order('heartbeat_at', { ascending: false })
    .limit(1);
  const stickyVenture = sessions?.[0]?.metadata?.proving_venture_id;

  // Check for active proving runs (journal entries)
  const { data: runs } = await supabase.rpc('get_proving_run_summary')
    .catch(() => ({ data: null }));

  // Fallback: query journal directly
  if (!runs) {
    const { data: journal } = await supabase.from('stage_proving_journal')
      .select('venture_id, stage_number')
      .order('created_at', { ascending: false })
      .limit(100);

    // Group by venture
    const grouped = {};
    for (const j of (journal || [])) {
      grouped[j.venture_id] = grouped[j.venture_id] || [];
      grouped[j.venture_id].push(j.stage_number);
    }

    const activeRuns = Object.entries(grouped).map(([vid, stages]) => ({
      venture_id: vid,
      stages_assessed: stages.length,
      max_stage: Math.max(...stages)
    }));

    console.log('ACTIVE_RUNS=' + JSON.stringify(activeRuns));
  } else {
    console.log('ACTIVE_RUNS=' + JSON.stringify(runs));
  }

  console.log('STICKY_VENTURE=' + (stickyVenture || 'none'));

  // Get ventures for selector
  const { data: ventures } = await supabase.from('ventures')
    .select('id, name, venture_name, current_lifecycle_stage')
    .order('current_lifecycle_stage', { ascending: false })
    .limit(10);
  console.log('VENTURES=' + JSON.stringify(ventures));
})();
"
```

### Step 2: Show Main Menu

**If an active run exists** (ACTIVE_RUNS has entries):

Use AskUserQuestion:
```javascript
{
  "questions": [{
    "question": "You have an active proving run. What would you like to do?",
    "header": "Venture Proving Companion",
    "multiSelect": false,
    "options": [
      {"label": "Resume Run (Recommended)", "description": "<venture name> — <N>/25 stages assessed, next gate is <G>"},
      {"label": "Review Pending Decisions", "description": "<M> stages assessed but awaiting your decision"},
      {"label": "View Status", "description": "See full progress, gap breakdown, and decisions so far"},
      {"label": "Start New Venture", "description": "Begin a proving run on a different venture"},
      {"label": "Generate Report", "description": "Summary of what has been assessed so far"}
    ]
  }]
}
```

**If no active run:**

Use AskUserQuestion:
```javascript
{
  "questions": [{
    "question": "No active proving run. What would you like to do?",
    "header": "Venture Proving Companion",
    "multiSelect": false,
    "options": [
      {"label": "Start Proving Run (Recommended)", "description": "Pick a venture and begin the 25-stage assessment. First gate is at Stage 3."},
      {"label": "View Past Runs", "description": "Browse completed proving run reports"}
    ]
  }]
}
```

### Step 3: Venture Selector (if starting or switching)

Use the `rankVentures()` function from `scripts/prove-helpers.cjs` to rank ventures.

```bash
node -e "
require('dotenv').config();
const { rankVentures } = require('./scripts/prove-helpers.cjs');
// ... query ventures and journal data, then call rankVentures()
"
```

Present ventures via AskUserQuestion:
```javascript
{
  "questions": [{
    "question": "Select a venture for the proving run:",
    "header": "Venture Selector",
    "multiSelect": false,
    "options": [
      // For each ranked venture:
      {"label": "<venture name> (Recommended)", "description": "<rationale from rankVentures>"},
      {"label": "<venture name>", "description": "<rationale>"}
    ]
  }]
}
```

After selection, store in session metadata:
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('claude_sessions')
  .update({ metadata: { proving_venture_id: '<selected-venture-id>', proving_last_gate: 0 } })
  .eq('status', 'active')
  .order('heartbeat_at', { ascending: false })
  .limit(1)
  .then(() => console.log('Venture stored in session'));
"
```

### Step 4: Gate Assessment

Use `detectNextGate()` from `scripts/prove-helpers.cjs` to determine the next gate segment.

```bash
node -e "
const { detectNextGate } = require('./scripts/prove-helpers.cjs');
// ... query journal for this venture, call detectNextGate()
"
```

Then run the assessment:
```bash
node scripts/venture-proving-companion.js assess <venture-id> --from <N> --to-gate <M>
```

Display the results as inline text (gap counts, severity, recommendation).

### Step 5: Decision Prompt (ALWAYS — NEVER skip this)

After EVERY gate assessment, present the decision prompt via AskUserQuestion:

```javascript
{
  "questions": [
    {
      "question": "Gate <N> Assessment Complete. <gap_count> gaps found (<blocker_count> blockers). Recommendation: <RECOMMENDATION>. What is your decision?",
      "header": "Gate <N> Decision",
      "multiSelect": false,
      "options": [
        {"label": "Proceed", "description": "Record 'proceed' and continue to next gate segment. Gaps tracked but not blocking."},
        {"label": "Fix First", "description": "Pause here. <complexity_assessment>. Will route to /brainstorm for complex gaps or quick-fix for simple ones."},
        {"label": "Skip", "description": "Mark this gate as skipped. Move to next gate without recording gap resolution."},
        {"label": "Defer", "description": "Park this venture. Return to main menu. You can resume later."}
      ]
    },
    {
      "question": "Any notes for this decision? (optional)",
      "header": "Chairman Notes",
      "multiSelect": false,
      "options": [
        {"label": "No notes", "description": "Just record the decision"},
        {"label": "Add notes", "description": "I'll type my reasoning"}
      ]
    }
  ]
}
```

If "Add notes" selected, use AskUserQuestion with a free-text question to capture the note.

### Step 6: Record Decision

Write the chairman decision to the journal:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('stage_proving_journal')
  .update({ chairman_decision: '<decision>', journal_notes: '<notes or null>' })
  .eq('venture_id', '<venture-id>')
  .gte('stage_number', <from>)
  .lte('stage_number', <to-gate>)
  .then(({error}) => console.log(error ? 'Error: ' + error.message : 'Decision recorded'));
"
```

### Step 7: Handle Decision Outcome

**If Proceed**: Go back to Step 4 for the next gate segment.

**If Fix First**: Assess gap complexity using `assessGapComplexity()` from prove-helpers.cjs.

- **Complex gaps**: Use AskUserQuestion:
  ```javascript
  {
    "questions": [{
      "question": "These gaps need architectural thinking. How would you like to remediate?",
      "header": "Remediation",
      "multiSelect": false,
      "options": [
        {"label": "Start Brainstorm (Recommended)", "description": "<N> blocker/major gaps. /brainstorm will generate vision + arch + SD with proper governance."},
        {"label": "Create Quick-Fix", "description": "Skip governance for a fast inline fix (only if truly simple)"},
        {"label": "Skip Remediation", "description": "Just record fix-first, handle it manually later"}
      ]
    }]
  }
  ```

  If "Start Brainstorm" selected:
  1. Build brainstorm context using `buildBrainstormContext()` from prove-helpers.cjs
  2. Store proving return state in session metadata: `proving_return: true, proving_last_gate: <current_gate>`
  3. Invoke the `brainstorm` skill using the Skill tool with the gap context as args
  4. After brainstorm completes, offer: "Re-assess this gate?" or "Continue to next gate?"

- **Simple gaps**: Offer inline quick-fix or skip.

**If Skip**: Record skip, go to Step 4 for next gate.

**If Defer**: Return to main menu (Step 2).

### Step 8: Post-Completion

When `detectNextGate()` returns `isComplete: true`:

Use AskUserQuestion:
```javascript
{
  "questions": [{
    "question": "All 25 stages assessed! What would you like to do?",
    "header": "Proving Run Complete",
    "multiSelect": false,
    "options": [
      {"label": "Persist Specialists (Recommended)", "description": "Create 25 Board of Directors stage experts from this run. Improves future brainstorms."},
      {"label": "Generate Report", "description": "Full proving run summary with gap breakdown, decision tally, and metrics."},
      {"label": "Done", "description": "Return to main menu"}
    ]
  }]
}
```

If "Persist Specialists":
```bash
node scripts/venture-proving-companion.js persist-specialists <venture-id>
```

If "Generate Report":
```bash
node scripts/venture-proving-companion.js report <venture-id>
```

### Brainstorm Return Detection

At the START of /prove, check if returning from a brainstorm detour:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase.from('claude_sessions')
    .select('metadata').eq('status', 'active')
    .order('heartbeat_at', { ascending: false }).limit(1).single();
  if (data?.metadata?.proving_return) {
    console.log('BRAINSTORM_RETURN=true');
    console.log('RETURN_VENTURE=' + data.metadata.proving_venture_id);
    console.log('RETURN_GATE=' + data.metadata.proving_last_gate);
  }
})();
"
```

If `BRAINSTORM_RETURN=true`, skip main menu and show:
```javascript
{
  "questions": [{
    "question": "Welcome back from brainstorm. You were at Gate <N>. What next?",
    "header": "Proving Run Resume",
    "multiSelect": false,
    "options": [
      {"label": "Re-assess Gate (Recommended)", "description": "Run the assessment again to verify gaps were addressed"},
      {"label": "Continue to Next Gate", "description": "Skip re-assessment and move forward"}
    ]
  }]
}
```

Then clear the return flag in session metadata.
