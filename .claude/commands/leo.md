---
description: LEO stack management and session control
argument-hint: [start|restart|stop|status|next]
---

# LEO Stack Control

**Command:** /leo $ARGUMENTS

## Instructions

Based on the argument provided, execute the appropriate action:

### If argument is "start" or "s":
Run the LEO stack start command:
```bash
node scripts/cross-platform-run.js leo-stack start
```

### If argument is "restart" or "r":
Run the LEO stack restart command:
```bash
node scripts/cross-platform-run.js leo-stack restart
```

### If argument is "stop" or "x":
Run the LEO stack stop command:
```bash
node scripts/cross-platform-run.js leo-stack stop
```

### If argument is "status" or "st":
Run the LEO stack status command:
```bash
node scripts/cross-platform-run.js leo-stack status
```

### If argument is "next" or "n":
Show the SD queue to determine what to work on next:
```bash
npm run sd:next
```

### If argument is "fast" or "f":
Run fast restart (reduced delays):
```bash
node scripts/cross-platform-run.js leo-stack restart -Fast
```

### If no argument provided:
Run the LEO protocol workflow:
```bash
npm run leo
```

### If argument is "help" or "h":
Display this menu to the user:

```
LEO Commands:
  /leo          - Run LEO protocol workflow (npm run leo)
  /leo start    (s)  - Start all LEO servers
  /leo restart  (r)  - Restart all LEO servers
  /leo stop     (x)  - Stop all LEO servers
  /leo status   (st) - Check server status
  /leo next     (n)  - Show SD queue (what to work on)
  /leo fast     (f)  - Fast restart (reduced delays)
  /leo help     (h)  - Show this menu

Shortcuts: /restart = restart servers, /leo n = next
```

Then ask the user which action they'd like to take.

## Context
- Engineer runs on port 3000
- App runs on port 8080
- Agent Platform runs on port 8000
- Cross-platform runner: `node scripts/cross-platform-run.js leo-stack [command]`
- Windows: Uses `scripts/leo-stack.ps1` (PowerShell)
- Linux/macOS: Uses `scripts/leo-stack.sh` (Bash)

## Command Ecosystem Integration

### Cross-Reference

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram and relationships

---

The `/leo` command connects to other commands at key workflow points:

### After LEAD-FINAL-APPROVAL (SD Completion)

When an SD reaches LEAD-FINAL-APPROVAL and is marked complete, suggest this sequence:

```
✅ SD Completed: SD-XXX-001

📋 Post-Completion Sequence:
```

| Step | Command | Condition | Why |
|------|---------|-----------|-----|
| 1 | `/restart` | UI/feature SD, or long session | Clean environment before shipping |
| 2 | Visual review | If UI changes | Verify renders correctly |
| 3 | `/ship` | Always | Commit, PR, merge the work |
| 4 | `/document` | Feature/API SD | Update documentation |
| 5 | `/learn` | Always | Capture learnings while fresh |

**For UI/Feature SDs - Use AskUserQuestion:**

```javascript
{
  "question": "UI Feature completed! What's next?",
  "header": "Post-Completion",
  "multiSelect": false,
  "options": [
    {"label": "/restart", "description": "Fresh servers for visual review (recommended first)"},
    {"label": "/ship", "description": "Skip restart, go straight to shipping"},
    {"label": "Done for now", "description": "End session"}
  ]
}
```

**For Infrastructure/Database SDs - Use AskUserQuestion:**

```javascript
{
  "question": "Infrastructure work completed! What's next?",
  "header": "Post-Completion",
  "multiSelect": false,
  "options": [
    {"label": "/ship", "description": "Create PR and merge"},
    {"label": "/learn", "description": "Capture learnings first"},
    {"label": "Done for now", "description": "End session"}
  ]
}
```

**Auto-invoke behavior:** When user selects a command option, immediately invoke that skill using the Skill tool.

### Starting New Work

After `/leo next` shows the SD queue:
- If continuing an SD → Load appropriate CLAUDE_*.md context
- If starting fresh → Suggest `/restart` if long session (>2 hours)

### Orchestrator SD Detection (MANDATORY)

**CRITICAL**: When starting work on an SD that has children (orchestrator pattern), you MUST run the preflight check BEFORE any implementation work.

#### Detection Query
```bash
# Check if SD is an orchestrator (has children)
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('strategic_directives_v2').select('id').eq('parent_sd_id', 'SD-XXX-001').then(({data}) => {
  console.log('Children:', data?.length || 0);
  if (data?.length > 0) console.log('⚠️ ORCHESTRATOR DETECTED - Run preflight!');
});
"
```

#### Preflight Check (MANDATORY for orchestrators)
When an orchestrator is detected, run the preflight check:
```bash
node scripts/orchestrator-preflight.js SD-XXX-001
```

The preflight will:
1. Show all children and their SD types
2. Display workflow requirements PER CHILD (PRD required, E2E required, min handoffs, gate threshold)
3. Require explicit confirmation before proceeding

#### Why This Matters

Without the preflight:
- **Efficiency bias** causes Claude to treat children as sub-tasks
- **Completion bias** causes "ship code" to be confused with "complete SD"
- Children get code shipped but don't go through full LEAD→PLAN→EXEC
- Database shows 'draft'/'in_progress' while code is on main

With the preflight:
- Workflow requirements are visible BEFORE work starts (not just at completion validation)
- Each child's SD-type-specific requirements are explicit
- Explicit confirmation prevents rationalization

#### Autonomous Orchestrator Workflow

When starting work on an orchestrator SD:
1. **Run preflight automatically** - `node scripts/orchestrator-preflight.js SD-XXX-001`
2. **Display the requirements** - Let the user see child workflow requirements
3. **Proceed with full workflow** - No confirmation needed; full LEAD→PLAN→EXEC for each child is the ONLY correct path

**There is no question about how to proceed.** Children are independent SDs requiring full workflow. The preflight is for visibility, not approval.

### Child SD Pre-Work Validation (MANDATORY)

**CRITICAL**: Before starting work on any child SD (SD with parent_sd_id), you MUST run the child SD preflight validation.

#### Detection
When starting work on an SD that has a `parent_sd_id`:
1. Automatically detect it as a child SD
2. Run preflight validation BEFORE any work

#### Validation Command
```bash
node scripts/child-sd-preflight.js SD-XXX-001
```

#### What It Validates
1. **Dependency Chain**: Each SD in `dependency_chain` must be:
   - Status: `completed`
   - Progress: `100%`
   - All required handoffs accepted (varies by SD type)

2. **Parent Context**: Parent orchestrator is loaded for reference

#### If BLOCKED
- Stop immediately
- Do not start LEAD phase
- Complete blocking dependency first
- Return to original SD after dependencies satisfied

#### If PASS
- Proceed with normal LEAD→PLAN→EXEC workflow
- Parent context loaded for reference

#### Example Output (BLOCKED)
```
❌ RESULT: BLOCKED
   Cannot start SD-QUALITY-CLI-001 until dependencies are complete.

   🚫 SD-QUALITY-DB-001 is not complete:
      - Status: in_progress (expected: completed)
      - Progress: 60% (expected: 100%)
      - Handoffs: 2/4 (expected: 4)

   ACTION: Complete SD-QUALITY-DB-001 first, then return to this SD.
```

#### Integration with sd:next
The `npm run sd:next` command shows dependency status in the queue display.
Child SDs with incomplete dependencies show as BLOCKED.
