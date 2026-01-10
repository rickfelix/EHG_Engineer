# /learn Command

Improve the LEO Protocol by learning from historical patterns, retrospectives, and extracted improvements.

## Overview

The `/learn` command is a two-command suite designed to evolve the LEO Protocol systematically.

1.  **`/learn`**: The main self-improvement loop (Process → Review → Approve → Apply).
2.  **`/learn insights`**: Effectiveness analysis and trend reporting.

## Usage

### `/learn`

Run this command before starting a new Strategic Directive (SD) or periodically to apply accumulated protocol improvements.

**Phases:**

1.  **PROCESS**: The system identifies relevant issue patterns, recent lessons, and pending protocol improvements.
2.  **REVIEW (Devil's Advocate)**: For every proposed item, the system generates a counter-argument highlighting potential risks or downsides.
3.  **PAUSE**: The system presents all items and waits for your explicit approval.
4.  **APPLY**: Approved changes are executed, `CLAUDE.md` is updated, and an audit trail is created.

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
For each category (Patterns, Lessons, Improvements), use AskUserQuestion with multiSelect: true to let the user approve items.

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

**Step 3: Collect Rejection Reasons**

For any REJECTED items, ask the user why:

```
Use AskUserQuestion to gather rejection reasons for items not selected.
This feedback improves future /learn suggestions.
```

**Step 4: Execute APPLY Phase**

Build the decisions JSON from user selections and run:

```bash
node scripts/modules/learning/index.js apply --decisions='{"ITEM_ID": {"status": "APPROVED"}, "ITEM_ID_2": {"status": "REJECTED", "reason": "User provided reason"}}'
```

**Step 5: Summarize Results**

- Report what was applied
- Mention CLAUDE.md regeneration if protocol was updated
- Provide the decision ID for potential rollback

### When user runs `/learn insights`:

```bash
node scripts/modules/learning/index.js insights
```

Display the output which shows:
- Approval rates by category
- Recurrence monitor (patterns that came back)
- Top rejection reasons

---

## Safety and Rollback

- All changes are logged in the `learning_decisions` table.
- If an improvement causes issues, use:
  ```bash
  node scripts/modules/learning/index.js rollback <DECISION_ID>
  ```

## Key Design Decisions (Triangulation Consensus)

| Decision | Value |
|----------|-------|
| Commands | 2: `/learn` + `/learn insights` |
| DA Mode | Always show (no skip option) |
| Approval | Checkbox-style, rejection reasons required |
| Display | Top 5 per category |
| Auto-suggest | Minimal ("💡 Run /learn?") after /ship |
| Integration | Bidirectional with /ship |

## Database Tables Used

- `retrospectives` - Source of lessons
- `issue_patterns` - Source of recurring patterns
- `protocol_improvement_queue` - Source of pending improvements
- `learning_decisions` - Audit trail for all decisions
- `leo_protocol_sections` - Target for protocol updates

## Example Session

```
User: /learn

Claude: [Runs process command]
        [Displays patterns, lessons, improvements with DA]
        [Uses AskUserQuestion for approval]

User: [Selects items to approve, provides rejection reasons]

Claude: [Runs apply command with decisions]
        Applied 3 improvements. Decision ID: abc123
        CLAUDE.md has been regenerated.

User: /learn insights

Claude: [Displays approval rates, recurrence monitor, top rejections]
```
