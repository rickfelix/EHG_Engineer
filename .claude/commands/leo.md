---
description: LEO stack management and session control
argument-hint: [restart|next|create|continue|complete]
---

# LEO Stack Control

**Command:** /leo $ARGUMENTS

## Instructions

### AUTO-PROCEED MODE (ALWAYS ENABLED)

**CRITICAL DIRECTIVE**: When working on a Strategic Directive, proceed AUTOMATICALLY through the entire workflow without stopping to ask for user confirmation.

- **Phase transitions**: Execute LEAD→PLAN→EXEC handoffs automatically
- **Validation gates**: Run gates; only stop on blocking failures
- **Post-completion**: Run full ship/document/learn sequence automatically
- **Next SD**: After completing one SD, show the next SD in queue

**DO NOT:**
- Use AskUserQuestion to ask "what's next?" or "should I proceed?"
- Wait for user confirmation between phases
- Stop after completing an SD - continue to post-completion sequence

**ONLY STOP AND ASK IF:**
- A blocking error requires human decision
- Tests fail after 2 retry attempts
- Merge conflicts require human resolution

---

Based on the argument provided, execute the appropriate action:

### If argument is "restart" or "r":
Run the LEO stack restart command:
```bash
node scripts/cross-platform-run.js leo-stack restart
```

### If argument is "next" or "n":
Show the SD queue to determine what to work on next:
```bash
npm run sd:next
```

### If argument starts with "create" or "c":
Launch the SD creation wizard. Parse additional flags:

**Interactive mode (no flags):**
Use AskUserQuestion to collect SD details:

```javascript
{
  "questions": [
    {
      "question": "What type of SD is this?",
      "header": "SD Type",
      "multiSelect": false,
      "options": [
        {"label": "Fix", "description": "Bug fix or error correction"},
        {"label": "Feature", "description": "New functionality"},
        {"label": "Infrastructure", "description": "Tooling, scripts, CI/CD"},
        {"label": "Refactor", "description": "Code restructuring"}
      ]
    }
  ]
}
```

After getting type, ask for title:
- "What's a brief title for this SD?"

Then generate the SD key using SDKeyGenerator:
```bash
node scripts/modules/sd-key-generator.js LEO <type> "<title>"
```

**Flag-based creation:**

- `create --from-uat <test-id>`: Create from UAT finding
  ```bash
  node scripts/leo-create-sd.js --from-uat <test-id>
  ```

- `create --from-learn <pattern-id>`: Create from /learn pattern
  ```bash
  node scripts/leo-create-sd.js --from-learn <pattern-id>
  ```

- `create --from-feedback <id>`: Create from /inbox feedback item
  ```bash
  node scripts/leo-create-sd.js --from-feedback <id>
  ```

- `create --child <parent-key>`: Create child SD
  ```bash
  node scripts/modules/sd-key-generator.js --child <parent-key> <index>
  ```

After generating the key, create the SD in database with initial fields:
- status: 'draft'
- current_phase: 'LEAD'
- priority: 'medium' (can be adjusted)

Then display:
```
✅ SD Created: <generated-key>
   Title: <title>
   Type: <type>
   Status: draft
   Phase: LEAD

📋 Next: Run LEAD-TO-PLAN handoff when ready
   node scripts/handoff.js execute LEAD-TO-PLAN <generated-key>
```

### If argument is "continue" or "cont":
Resume work on the current working SD.

1. **Query for active SD:**
   ```bash
   node scripts/get-working-on-sd.js
   ```

2. **If SD found (is_working_on = true and progress < 100):**
   - Display the SD info from the script output
   - Determine the appropriate context file based on `current_phase`:
     - LEAD phases (LEAD_APPROVAL, LEAD_FINAL_APPROVAL) → Read `CLAUDE_LEAD.md`
     - PLAN phases (PLAN_*, PRD_*) → Read `CLAUDE_PLAN.md`
     - EXEC phases (EXEC_*, IMPLEMENTATION_*) → Read `CLAUDE_EXEC.md`
   - Load that context file using the Read tool
   - Show recommended next action based on phase:
     - LEAD phases: "Continue LEAD approval workflow"
     - PLAN phases: "Continue PRD/planning work"
     - EXEC phases: "Continue implementation"

3. **If no SD found:**
   ```
   ❌ No SD is currently marked as "Working On"

   💡 Run `/leo next` to see the SD queue and pick your next task.
   ```

### If argument is "complete" or "comp":
Run the post-completion sequence for the current working SD.

1. **Pre-condition check:**
   ```bash
   node scripts/get-working-on-sd.js --id-only
   ```
   If no working SD exists, show error and suggest `/leo next`.

2. **If working SD exists, execute sequence in order:**

   **Step 1: Document**
   ```
   📄 Running /document...
   ```
   Invoke the `document` skill using Skill tool.

   **Step 2: Ship**
   ```
   🚀 Running /ship...
   ```
   Invoke the `ship` skill using Skill tool.

   **Step 3: Learn**
   ```
   📚 Running /learn...
   ```
   Invoke the `learn` skill using Skill tool.

   **Step 4: Next**
   ```
   📋 Showing next SD in queue...
   ```
   ```bash
   npm run sd:next
   ```

3. **Summary on completion:**
   ```
   ✅ Post-Completion Sequence Complete

   Executed:
   - /document - Documentation updated
   - /ship - Changes committed and PR created
   - /learn - Patterns captured
   - sd:next - Queue displayed
   ```

### If no argument provided:
Run the LEO protocol workflow:
```bash
npm run leo
```

### If argument not recognized:
Display the available commands:

```
LEO Commands:
  /leo           - Run LEO protocol workflow (npm run leo)
  /leo restart   (r)    - Restart all LEO servers
  /leo next      (n)    - Show SD queue (what to work on)
  /leo create    (c)    - Create new SD (interactive wizard)
  /leo continue  (cont) - Resume current working SD
  /leo complete  (comp) - Run full sequence: document → ship → learn → next

SD Creation Flags:
  /leo create                    - Interactive wizard
  /leo create --from-uat <id>    - Create from UAT finding
  /leo create --from-learn <id>  - Create from /learn pattern
  /leo create --from-feedback <id> - Create from /inbox item
  /leo create --child <parent>   - Create child SD
```

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

When an SD reaches LEAD-FINAL-APPROVAL and is marked complete, **AUTOMATICALLY proceed through the post-completion sequence without asking for confirmation.**

```
✅ SD Completed: SD-XXX-001

🚀 Auto-Proceeding with Post-Completion Sequence...
```

| Step | Command | Condition | Auto-Execute |
|------|---------|-----------|--------------|
| 1 | `/restart` | UI/feature SD, or long session | YES - auto-run |
| 2 | Visual review | If UI changes | YES - perform review |
| 3 | `/ship` | Always | YES - auto-invoke |
| 4 | `/document` | Feature/API SD | YES - auto-invoke |
| 5 | `/learn` | Always | YES - auto-invoke |
| 6 | `/leo next` | After completion | YES - show next SD |

**AUTO-PROCEED MODE (DEFAULT)**:

When working on a Strategic Directive, proceed through the ENTIRE workflow automatically:
1. **Phase transitions**: Execute handoffs without confirmation
2. **Post-completion**: Run the full sequence above without asking
3. **Next SD**: After completion, automatically show the next SD in queue

**DO NOT use AskUserQuestion during SD workflow.** The user has authorized full autonomous operation.

**For UI/Feature SDs - Auto-execute:**
```
1. Invoke /restart skill → Wait for servers
2. Perform visual review → Report findings
3. Invoke /ship skill → Create PR, merge
4. Invoke /document skill → Update docs
5. Invoke /learn skill → Capture patterns
6. Run npm run sd:next → Show next work
```

**For Infrastructure/Database SDs - Auto-execute:**
```
1. Invoke /ship skill → Create PR, merge
2. Invoke /learn skill → Capture patterns
3. Run npm run sd:next → Show next work
```

**Only stop and ask user if:**
- A blocking error occurs that cannot be auto-resolved
- Tests fail after 2 retry attempts
- Merge conflicts require human decision

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

### Strategic Directive Creation (MANDATORY REFERENCES)

**CRITICAL**: When creating new strategic directives, you MUST read these reference documents BEFORE creating the SD:

#### Required Reading
1. **CLAUDE_CORE.md** - Core protocol guidance, SD types, workflow requirements
   - Contains SD type definitions and their mandatory requirements
   - Specifies PRD requirements, handoff counts, and gate thresholds per SD type
   - Defines the LEAD→PLAN→EXEC workflow phases

2. **docs/database/strategic_directives_v2_field_reference.md** - Complete field reference
   - Defines all required and optional fields
   - Explains `id` vs `uuid_id` usage
   - Documents JSONB array structures (key_changes, success_criteria, dependencies, etc.)
   - Shows status workflow and priority levels
   - Provides LEO Protocol phase definitions

#### SD Creation Checklist
Before creating any SD, ensure you:
- [ ] Read CLAUDE_CORE.md for SD type requirements
- [ ] Read field reference for required fields and formats
- [ ] Use proper ID format: `SD-{CATEGORY}-{NUMBER}` (e.g., SD-FEATURE-001)
- [ ] Set appropriate `sd_type` based on scope and requirements
- [ ] Populate JSONB fields with correct structure
- [ ] Set `current_phase` to 'LEAD_APPROVAL' for new SDs
- [ ] Specify `parent_sd_id` if this is a child of an orchestrator

#### SD Type Quick Reference (from CLAUDE_CORE.md)
| SD Type | PRD Required | Min Handoffs | Gate Threshold |
|---------|--------------|--------------|----------------|
| `feature` | YES | 4 | 85% |
| `infrastructure` | YES | 3 | 80% |
| `enhancement` | Optional | 2 | 75% |
| `fix` | NO | 1 | 70% |
| `documentation` | NO | 1 | 60% |

**Note**: Always verify current requirements from CLAUDE_CORE.md as they may be updated.
