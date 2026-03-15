# /prove — Venture Proving Companion

**Trigger**: User types `/prove`

## Instructions

This skill guides the Chairman through the full venture lifecycle — from discovering an opportunity, through creating a venture, through proving all 25 stages. ALL user interaction MUST use AskUserQuestion. NEVER auto-advance past a gate — the Chairman always decides.

### Step 0: Detect Context

Query for active proving runs, pending stage-zero requests, and session state:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Check session metadata for brainstorm return or sticky venture
  const { data: sessions } = await supabase.from('claude_sessions')
    .select('metadata')
    .eq('status', 'active')
    .order('heartbeat_at', { ascending: false })
    .limit(1);
  const meta = sessions?.[0]?.metadata || {};
  console.log('BRAINSTORM_RETURN=' + (meta.proving_return ? 'true' : 'false'));
  console.log('STICKY_VENTURE=' + (meta.proving_venture_id || 'none'));
  if (meta.proving_return) {
    console.log('RETURN_GATE=' + meta.proving_last_gate);
  }

  // Check for pending/processing stage-zero requests
  const { data: pendingRequests } = await supabase.from('stage_zero_requests')
    .select('id, path, status, strategy, created_at')
    .in('status', ['pending', 'claimed', 'processing'])
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('PENDING_REQUESTS=' + JSON.stringify(pendingRequests || []));

  // Check for active proving runs (journal entries)
  const { data: journal } = await supabase.from('stage_proving_journal')
    .select('venture_id, stage_number')
    .order('created_at', { ascending: false })
    .limit(100);
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

  // Get ventures
  const { data: ventures } = await supabase.from('ventures')
    .select('id, name, current_lifecycle_stage, status, is_demo')
    .eq('status', 'active')
    .eq('is_demo', false)
    .order('current_lifecycle_stage', { ascending: false })
    .limit(10);
  console.log('VENTURES=' + JSON.stringify(ventures || []));

  // Get discovery strategy scores for menu
  const { data: stratScores } = await supabase.rpc('get_discovery_strategy_scores')
    .catch(() => ({ data: null }));
  console.log('STRATEGY_SCORES=' + JSON.stringify(stratScores || []));
})();
"
```

### Step 0.5: Brainstorm Return Detection

If `BRAINSTORM_RETURN=true`, skip the main menu entirely:

```javascript
{
  "questions": [{
    "question": "Welcome back from brainstorm. You were proving <venture name> at Gate <N>. What next?",
    "header": "Resume",
    "multiSelect": false,
    "options": [
      {"label": "Re-assess Gate (Recommended)", "description": "Run the assessment again to verify gaps were addressed by the brainstorm output"},
      {"label": "Continue to Next Gate", "description": "Skip re-assessment and move forward"}
    ]
  }]
}
```

Then clear the return flag in session metadata and jump to **Step 5** (Gate Assessment).

---

### Step 1: Main Menu

Present a context-aware menu based on detected state:

**If a pending stage-zero request exists** (discovery in progress):

```javascript
{
  "questions": [{
    "question": "A discovery pipeline is running (<strategy>). What would you like to do?",
    "header": "Proving",
    "multiSelect": false,
    "options": [
      {"label": "Check Discovery Status (Recommended)", "description": "See if the <strategy> pipeline has produced candidates yet"},
      {"label": "Resume Proving Run", "description": "Continue an existing venture proving run"},
      {"label": "Start Fresh Discovery", "description": "Launch a new opportunity discovery"}
    ]
  }]
}
```

**If an active proving run exists** (ACTIVE_RUNS has entries):

```javascript
{
  "questions": [{
    "question": "You have an active proving run. What would you like to do?",
    "header": "Proving",
    "multiSelect": false,
    "options": [
      {"label": "Resume Proving Run (Recommended)", "description": "<venture name> — <N>/25 stages assessed, next gate is <G>"},
      {"label": "View Status", "description": "See progress, gap breakdown, and decisions so far"},
      {"label": "Find New Opportunity", "description": "Discover and start a new venture"},
      {"label": "Generate Report", "description": "Summary of what has been assessed so far"}
    ]
  }]
}
```

**If no active run and ventures exist:**

```javascript
{
  "questions": [{
    "question": "What would you like to do?",
    "header": "Proving",
    "multiSelect": false,
    "options": [
      {"label": "Find an Opportunity (Recommended)", "description": "Discover a new venture opportunity using AI-driven research"},
      {"label": "Prove an Existing Venture", "description": "Start a 25-stage proving run on one of your <N> ventures"},
      {"label": "View Past Runs", "description": "Browse completed proving run reports"}
    ]
  }]
}
```

**If no ventures at all:**

```javascript
{
  "questions": [{
    "question": "No ventures yet. Let's find your first opportunity.",
    "header": "Proving",
    "multiSelect": false,
    "options": [
      {"label": "Find an Opportunity (Recommended)", "description": "Use AI to discover a venture opportunity worth building"},
      {"label": "View Past Runs", "description": "Browse any previous proving run data"}
    ]
  }]
}
```

---

### Step 2: Opportunity Discovery (if "Find an Opportunity" selected)

Present discovery strategy selection:

```javascript
{
  "questions": [{
    "question": "How would you like to discover opportunities?",
    "header": "Discovery",
    "multiSelect": false,
    "options": [
      {"label": "Capabilities Overhang", "description": "Find AI capabilities that exist but aren't yet productized. Exploits the gap between what AI can do vs what products offer."},
      {"label": "Trend Scanner", "description": "Find trending products and emerging markets with $1K+/month potential from real app store data."},
      {"label": "Democratization Finder", "description": "Find premium services ($500+/session) that AI can offer at 1/10th the cost."},
      {"label": "Nursery Re-eval", "description": "Reassess parked ventures for changed market or tech conditions."}
    ]
  }]
}
```

If STRATEGY_SCORES data is available, add the composite score to each description and star the highest-scoring strategy as recommended.

### Step 3: Launch Discovery Pipeline

After strategy selection, submit a stage-zero request:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await supabase.from('stage_zero_requests')
    .insert({
      path: 'discovery_mode',
      strategy: '<selected_strategy>',
      status: 'pending',
      metadata: { candidate_count: 5, source: 'prove_skill' }
    })
    .select('id, status');
  if (error) console.log('Error:', error.message);
  else console.log('REQUEST_ID=' + data[0].id);
})();
"
```

Then display:

```
Discovery pipeline launched: <strategy_name>
The Stage Zero processor will generate candidates. This typically takes 2-5 minutes.
```

Present polling options:

```javascript
{
  "questions": [{
    "question": "Discovery pipeline is running. The processor picks it up automatically. What would you like to do while waiting?",
    "header": "Discovery",
    "multiSelect": false,
    "options": [
      {"label": "Check Status (Recommended)", "description": "Poll the request status to see if candidates are ready"},
      {"label": "Work on Something Else", "description": "Exit /prove and come back later. The pipeline runs in the background."}
    ]
  }]
}
```

If "Check Status" selected, poll the request:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase.from('stage_zero_requests')
    .select('id, status, result, error_message, completed_at')
    .eq('id', '<REQUEST_ID>')
    .single();
  console.log('STATUS=' + data.status);
  if (data.status === 'completed' && data.result) {
    console.log('RESULT=' + JSON.stringify(data.result));
  }
  if (data.error_message) console.log('ERROR=' + data.error_message);
})();
"
```

**If status is 'pending' or 'claimed' or 'processing'**: Tell the user it's still running, offer to check again or exit.

**If status is 'completed'**: Display the result summary and proceed to Step 3.5.

**If status is 'failed'**: Display the error and offer to retry or pick a different strategy.

### Step 3.5: Review Discovery Results

When the discovery pipeline completes, the result contains ranked candidates and a chairman review decision. Display the top candidate summary:

```
Discovery Results: <strategy_name>

Top Candidate: <candidate_name>
  Problem: <problem_statement>
  Solution: <solution_approach>
  Market: <target_market>
  Revenue Potential: <monthly_revenue_potential>
  Automation Feasibility: <score>/100

  Chairman Review: <decision> (ready/seed/sprout/park)
```

If the chairman review produced `decision = 'ready'`, a venture was auto-created at Stage 1:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Find the most recently created venture (from this discovery)
  const { data } = await supabase.from('ventures')
    .select('id, name, current_lifecycle_stage, status, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (data) {
    console.log('NEW_VENTURE_ID=' + data.id);
    console.log('NEW_VENTURE_NAME=' + data.name);
    console.log('NEW_VENTURE_STAGE=' + data.current_lifecycle_stage);
  }
})();
"
```

Present next step:

```javascript
{
  "questions": [{
    "question": "Venture '<name>' created at Stage <N>! Ready to start the proving run?",
    "header": "Venture Created",
    "multiSelect": false,
    "options": [
      {"label": "Start Proving Run (Recommended)", "description": "Begin the 25-stage assessment for <venture_name>. First gate checkpoint is at Stage 3."},
      {"label": "View Venture Details", "description": "See the full venture profile before starting"},
      {"label": "Find Another Opportunity", "description": "Discover more opportunities before committing to a proving run"}
    ]
  }]
}
```

If the chairman review parked the candidate (`seed`/`sprout`/`park`), inform the user and offer to try another strategy or view what was parked.

---

### Step 4: Venture Selector (if "Prove an Existing Venture" selected)

Use `rankVentures()` from `scripts/prove-helpers.cjs` to rank ventures by readiness.

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { rankVentures } = require('./scripts/prove-helpers.cjs');
(async () => {
  const { data: ventures } = await supabase.from('ventures')
    .select('id, name, current_lifecycle_stage, status')
    .eq('status', 'active')
    .eq('is_demo', false);
  const { data: journalCounts } = await supabase.rpc('get_journal_counts_by_venture')
    .catch(() => ({ data: [] }));
  // Fallback: manual count
  if (!journalCounts) {
    const { data: journal } = await supabase.from('stage_proving_journal').select('venture_id');
    const counts = {};
    for (const j of (journal || [])) { counts[j.venture_id] = (counts[j.venture_id] || 0) + 1; }
    const manual = Object.entries(counts).map(([venture_id, count]) => ({ venture_id, count }));
    console.log('RANKED=' + JSON.stringify(rankVentures(ventures || [], manual)));
  } else {
    console.log('RANKED=' + JSON.stringify(rankVentures(ventures || [], journalCounts)));
  }
})();
"
```

Present ventures via AskUserQuestion — first option starred with rationale from `rankVentures()`.

After selection, store in session metadata:
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  await supabase.from('claude_sessions')
    .update({ metadata: { proving_venture_id: '<selected-venture-id>', proving_last_gate: 0 } })
    .eq('status', 'active')
    .order('heartbeat_at', { ascending: false })
    .limit(1);
  console.log('Venture stored in session');
})();
"
```

---

### Step 5: Gate Assessment

Use `detectNextGate()` from `scripts/prove-helpers.cjs`:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { detectNextGate } = require('./scripts/prove-helpers.cjs');
(async () => {
  const { data: journal } = await supabase.from('stage_proving_journal')
    .select('stage_number')
    .eq('venture_id', '<venture-id>');
  const next = detectNextGate(journal || []);
  console.log('FROM=' + next.from);
  console.log('TO_GATE=' + next.toGate);
  console.log('IS_COMPLETE=' + next.isComplete);
})();
"
```

**If IS_COMPLETE=true**: Jump to Step 9 (Post-Completion).

Otherwise, run the assessment:
```bash
node scripts/venture-proving-companion.js assess <venture-id> --from <FROM> --to-gate <TO_GATE>
```

Display the results as inline text (gap counts, severity breakdown, recommendation, top blocker).

---

### Step 6: Decision Prompt (ALWAYS — NEVER skip this)

After EVERY gate assessment, present the decision via AskUserQuestion:

```javascript
{
  "questions": [
    {
      "question": "Gate <N> Assessment Complete. <gap_count> gaps found (<blocker_count> blockers). Recommendation: <RECOMMENDATION>. What is your decision?",
      "header": "Gate <N>",
      "multiSelect": false,
      "options": [
        {"label": "Proceed", "description": "Record 'proceed' and move to next gate segment. Gaps tracked but not blocking."},
        {"label": "Fix First", "description": "Pause here. Will route to /brainstorm for complex gaps or quick-fix for simple ones."},
        {"label": "Skip", "description": "Mark gate as skipped. Move to next gate without recording resolution."},
        {"label": "Defer", "description": "Park this venture. Return to main menu. You can resume later with /prove."}
      ]
    },
    {
      "question": "Any notes for this decision? (optional)",
      "header": "Notes",
      "multiSelect": false,
      "options": [
        {"label": "No notes", "description": "Just record the decision"},
        {"label": "Add notes", "description": "I'll type my reasoning"}
      ]
    }
  ]
}
```

If "Add notes" selected, use AskUserQuestion to capture free-text.

### Step 7: Record Decision

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { error } = await supabase.from('stage_proving_journal')
    .update({ chairman_decision: '<decision>', journal_notes: '<notes or null>' })
    .eq('venture_id', '<venture-id>')
    .gte('stage_number', <from>)
    .lte('stage_number', <to_gate>);
  console.log(error ? 'Error: ' + error.message : 'Decision recorded');
})();
"
```

### Step 8: Handle Decision Outcome

**If Proceed**: Go back to Step 5 for the next gate.

**If Fix First**: Assess complexity using `assessGapComplexity()` from prove-helpers.cjs.

- **Complex** (blockers or 3+ majors):
  ```javascript
  {
    "questions": [{
      "question": "These gaps need architectural thinking. How would you like to remediate?",
      "header": "Remediation",
      "multiSelect": false,
      "options": [
        {"label": "Start Brainstorm (Recommended)", "description": "<N> blocker/major gaps. /brainstorm generates vision + arch + SD with governance."},
        {"label": "Create Quick-Fix", "description": "Skip governance for a fast inline fix"},
        {"label": "Skip Remediation", "description": "Just record fix-first, handle manually later"}
      ]
    }]
  }
  ```

  If "Start Brainstorm":
  1. Build context with `buildBrainstormContext()` from prove-helpers.cjs
  2. Store return state: `proving_return: true, proving_last_gate: <gate>`
  3. Invoke `/brainstorm` skill with gap context as args
  4. When /prove is invoked again, Step 0.5 catches the return

- **Simple** (minor/cosmetic only): Offer inline quick-fix or skip.

**If Skip**: Record skip, go to Step 5 for next gate.

**If Defer**: Return to Step 1 (main menu).

---

### Step 9: Post-Completion

When all 25 stages are assessed:

```javascript
{
  "questions": [{
    "question": "All 25 stages assessed! What would you like to do?",
    "header": "Complete",
    "multiSelect": false,
    "options": [
      {"label": "Persist Specialists (Recommended)", "description": "Create 25 Board of Directors stage experts. Improves future brainstorms and ventures."},
      {"label": "Generate Report", "description": "Full summary with gap breakdown, decision tally, and stage completion rate."},
      {"label": "Find Next Opportunity", "description": "Start discovery for your next venture."},
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

If "Find Next Opportunity": Jump to Step 2.
