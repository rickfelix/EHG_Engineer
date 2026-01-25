# /learn Command

Improve the LEO Protocol by learning from historical patterns, retrospectives, and extracted improvements.

## Overview

The `/learn` command is a two-command suite designed to evolve the LEO Protocol systematically.

1.  **`/learn`**: The main self-improvement loop (Process → Review → Approve → Create SD).
2.  **`/learn insights`**: Effectiveness analysis and trend reporting.

## New Workflow (v2)

**Key Change:** Instead of directly inserting metadata into tables (which had no enforcement), `/learn` now creates a **Strategic Directive (SD)** that goes through the full LEO Protocol workflow.

```
User selects items → SD Created → LEAD → PLAN → EXEC → Patterns Resolved
```

This ensures that approved improvements are actually implemented and validated.

## Usage

### `/learn`

Run this command before starting a new Strategic Directive (SD) or periodically to address accumulated issues.

**Phases:**

1.  **PROCESS**: The system identifies relevant issue patterns, recent lessons, and pending protocol improvements.
2.  **REVIEW (Devil's Advocate)**: For every proposed item, the system generates a counter-argument highlighting potential risks or downsides.
3.  **PAUSE**: The system presents all items and waits for your explicit approval.
4.  **CREATE SD**: Approved items create a Strategic Directive (or Quick-Fix) that goes through LEO Protocol.

### `/learn insights`

Run this to see how well the protocol is evolving and identify effectiveness of past improvements.

---

## Instructions for Claude

### When user runs `/learn`:

**Step 1: Execute PROCESS Phase**

```bash
node scripts/modules/learning/index.js process
```

This will output:
- Top 5 patterns from `issue_patterns` table
- Top 5 lessons from `retrospectives` table
- Top 5 improvements from `protocol_improvement_queue` table
- Each item includes a Devil's Advocate counter-argument

**Step 2: Present Findings with Approval Interface**

After running the process command, present the findings to the user using the AskUserQuestion tool with checkbox-style approval:

```
For each category (Patterns, Improvements), use AskUserQuestion with multiSelect: true to let the user approve items.

Example structure:
{
  "questions": [
    {
      "question": "Which patterns should we address?",
      "header": "Patterns",
      "multiSelect": true,
      "options": [
        {"label": "[PAT-001] Schema mismatch", "description": "DA: Only 2 occurrences..."},
        {"label": "[PAT-002] Test path errors", "description": "DA: Trend is decreasing..."}
      ]
    }
  ]
}
```

**Step 3: Execute APPLY Phase (Creates SD)**

Build the decisions JSON from user selections and run:

```bash
node scripts/modules/learning/index.js apply --decisions='{"ITEM_ID": {"status": "APPROVED"}}'
```

This will:
1. Classify complexity (Quick-Fix vs Full SD)
2. Generate SD ID (SD-LEARN-NNN or QF-YYYYMMDD-NNN)
3. Create the SD in `strategic_directives_v2`
4. Tag source patterns/improvements with `assigned_sd_id`
5. Display next steps

**Step 4: Summarize Results**

- Report the created SD ID
- Show classification (Quick-Fix or Full SD)
- Display next steps: "Run `npm run sd:next` to continue with LEO Protocol"

**Step 5: Continue with LEO Protocol (Command Ecosystem)**

### Cross-Reference

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram and relationships

---

The created SD will appear in the SD queue. Follow normal LEO workflow:
- LEAD approval
- PLAN phase (PRD creation)
- EXEC phase (implementation)
- LEAD-FINAL-APPROVAL (auto-resolves patterns)

**AUTO-PROCEED Detection**: Before asking, check if AUTO-PROCEED mode is active:

```bash
# Check for AUTO-PROCEED context (uses claude_sessions.metadata.auto_proceed)
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('claude_sessions')
  .select('metadata')
  .eq('status', 'active')
  .order('heartbeat_at', { ascending: false })
  .limit(1)
  .single()
  .then(({data}) => {
    const autoProceed = data?.metadata?.auto_proceed ?? true;
    if (autoProceed) console.log('AUTO-PROCEED: ACTIVE');
    else console.log('AUTO-PROCEED: INACTIVE');
  });
"
```

**If AUTO-PROCEED is ACTIVE:**
- Skip AskUserQuestion
- Output status: `🤖 AUTO-PROCEED: Learning captured, continuing to next SD...`
- Auto-invoke `/leo next` to continue with next SD in queue

**If AUTO-PROCEED is INACTIVE:**
**After SD creation - Use AskUserQuestion:**

```javascript
{
  "question": "SD created: SD-LEARN-XXX. What's next?",
  "header": "Next Step",
  "multiSelect": false,
  "options": [
    {"label": "/leo next", "description": "Start LEO Protocol workflow for this SD"},
    {"label": "Done for now", "description": "End session, work on SD later"}
  ]
}
```

**Auto-invoke behavior:** When user selects "/leo next", immediately invoke that skill using the Skill tool.

This connects `/learn` → `/leo` in the command ecosystem.

### When user runs `/learn insights`:

```bash
node scripts/modules/learning/index.js insights
```

Display the output which shows:
- Approval rates by category
- Recurrence monitor (patterns that came back)
- Top rejection reasons

---

## Quick-Fix vs Full SD Classification

The system automatically classifies based on LEO Quick-Fix rules:

**Quick-Fix (QF) criteria - ALL must be true:**
- Category in ['bug', 'polish', 'typo', 'documentation']
- No forbidden keywords (database, auth, migration, security, RLS)
- No risk keywords (refactor, complex, breaking change)
- Single item selected

**Full SD - ANY triggers:**
- Category is 'feature' or 'infrastructure'
- Contains forbidden/risk keywords
- Multiple items selected

---

## SD Completion → Auto-Resolution

When an SD created from `/learn` reaches LEAD-FINAL-APPROVAL:
1. Patterns with `assigned_sd_id` are marked `status: 'resolved'`
2. Improvements with `assigned_sd_id` are marked `status: 'APPLIED'`
3. `resolution_notes` captures which SD resolved the pattern

This closes the learning loop automatically.

---

## Safety and Rollback

- All decisions are logged in the `learning_decisions` table with `sd_created_id`.
- If an SD was created in error, cancel it before LEAD approval.
- Legacy direct-apply mode available via `--legacy` flag (not recommended).

## Key Design Decisions

| Decision | Value |
|----------|-------|
| Commands | 2: `/learn` + `/learn insights` |
| Apply Mode | Creates SD (new) or direct insert (legacy) |
| DA Mode | Always show (no skip option) |
| Approval | Checkbox-style via AskUserQuestion |
| Display | Top 5 per category |
| Classification | Auto (Quick-Fix vs Full SD) |
| Resolution | Auto on SD completion |

## Database Tables Used

- `retrospectives` - Source of lessons
- `issue_patterns` - Source of recurring patterns (now has `assigned_sd_id`)
- `protocol_improvement_queue` - Source of pending improvements (now has `assigned_sd_id`)
- `learning_decisions` - Audit trail (now has `sd_created_id`)
- `strategic_directives_v2` - Target for created SDs

## Example Session

```
User: /learn

Claude: [Runs process command]
        [Displays patterns, improvements with DA]
        [Uses AskUserQuestion for approval]

User: [Selects items to approve]

Claude: [Runs apply command with decisions]
        ============================================================
          /learn → SD Creation Workflow
        ============================================================
        Approved items: 2
        Classification: FULL-SD
        ✅ Created: SD-LEARN-003
           Type: Strategic Directive
           Items: 2 tagged
           Status: draft (awaiting LEAD approval)

        📋 Next Steps:
           1. Run: npm run sd:next
           2. The SD will appear in the queue for LEAD review
           3. Follow LEO Protocol: LEAD → PLAN → EXEC
        ============================================================

User: npm run sd:next
[Continues with normal LEO Protocol workflow]

[After SD completion via LEAD-FINAL-APPROVAL]
   📚 Resolving /learn items...
   ✅ Resolved 1 pattern(s)
   ✅ Applied 1 improvement(s)
```
