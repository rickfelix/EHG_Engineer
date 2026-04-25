<!-- reasoning_effort: medium -->

# Friday Meeting Command

Run the structured weekly Friday meeting with EVA.

Presents a 5-section strategic agenda and collects chairman decisions interactively.

## Arguments

Parse `$ARGUMENTS` for flags:
- No args -> Full interactive meeting
- `--summary` -> Show data sections only, skip decisions
- `--dry-run` -> Preview meeting without saving decisions

## Instructions

### Step 1: Run the meeting script

```bash
node scripts/eva/friday-meeting.mjs
```

### Step 2: Parse the output

Look for `FRIDAY_MEETING_DECISIONS_PAYLOAD=` in the output. This contains a JSON payload for AskUserQuestion.

### Step 3: Present decisions to chairman

If findings exist, use AskUserQuestion with the payload from the script output. Present each finding one at a time for the chairman to accept, dismiss, or defer.

### Step 4: Process decisions

After the chairman responds to all findings, process the decisions:

```javascript
// For each finding response:
// - "Accept" -> Update eva_consultant_recommendations: status='accepted', chairman_feedback, feedback_at
// - "Dismiss" -> Update: status='dismissed', chairman_feedback, feedback_at
// - "Defer" -> Leave as pending (no update needed)
```

Use the processMeetingDecisions function or update directly:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const decisions = [
  // { id: 'finding-uuid', status: 'accepted|dismissed', feedback: 'reason' }
];

async function apply() {
  for (const d of decisions) {
    await supabase.from('eva_consultant_recommendations')
      .update({ status: d.status, chairman_feedback: d.feedback, feedback_at: new Date().toISOString() })
      .eq('id', d.id);
  }
  console.log('Decisions applied:', decisions.length);
}
apply();
"
```

### Step 5: Display summary

Show the meeting summary with decision counts:
```
Friday Meeting Complete
  Accepted:  N
  Dismissed: N
  Deferred:  N
  Total:     N
```

## Context

- The consultant analysis round (Child A) populates eva_consultant_recommendations every Monday
- Only high-confidence findings (confidence_tier='high') appear in the meeting
- Management review data comes from management-review-round.mjs
- Decisions feed back into the confidence engine to improve future analysis
- **Section 5d (Learning Insights)** runs every other week (even ISO weeks) — shows approval rates, recurrence monitoring, and top rejection reasons from `/learn insights`
