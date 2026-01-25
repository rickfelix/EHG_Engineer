---
description: LEO stack management and session control
argument-hint: [init|restart|next|create|continue|complete|resume]
---

# LEO Stack Control

**Command:** /leo $ARGUMENTS

## Instructions

### SESSION INITIALIZATION (FIRST RUN)

**CRITICAL**: At the START of each new Claude Code session, BEFORE processing any `/leo` command:

1. **Check for existing session preference:**
   ```bash
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   supabase.from('claude_sessions')
     .select('metadata')
     .eq('status', 'active')
     .order('heartbeat_at', { ascending: false })
     .limit(1)
     .single()
     .then(({data, error}) => {
       if (data?.metadata?.auto_proceed !== undefined) {
         console.log('SESSION_AUTO_PROCEED=' + data.metadata.auto_proceed);
       } else {
         console.log('SESSION_NEW=true');
       }
     });
   "
   ```

2. **If SESSION_NEW=true (new session)**:
   Use AskUserQuestion with the following (two questions):
   ```javascript
   {
     "questions": [
       {
         "question": "Auto-proceed mode is ON by default. Would you like to disable it for this session?",
         "header": "Auto-Proceed",
         "multiSelect": false,
         "options": [
           {"label": "Keep ON (Recommended)", "description": "Proceed automatically through SD workflow without confirmation prompts"},
           {"label": "Turn OFF", "description": "Pause at each phase transition and ask for confirmation"}
         ]
       },
       {
         "question": "Orchestrator chaining (power user mode). When enabled, system auto-continues to next orchestrator after one completes.",
         "header": "Chaining",
         "multiSelect": false,
         "options": [
           {"label": "Keep OFF (Recommended)", "description": "Pause at orchestrator completion boundary for review"},
           {"label": "Enable Chaining", "description": "Auto-continue to next orchestrator without pausing"}
         ]
       }
     ]
   }
   ```

3. **Store the preferences** in session metadata:
   ```bash
   # After user responds, update or create session with both preferences
   # Usage: node -e "..." <auto_proceed:true|false> <chain_orchestrators:true|false>
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   const autoProceed = process.argv[2] === 'true';
   const chainOrchestrators = process.argv[3] === 'true';
   supabase.from('claude_sessions')
     .upsert({
       session_id: 'session_' + Date.now(),
       status: 'active',
       heartbeat_at: new Date().toISOString(),
       metadata: { auto_proceed: autoProceed, chain_orchestrators: chainOrchestrators }
     }, { onConflict: 'session_id' })
     .then(({error}) => {
       if (error) console.error('Error:', error.message);
       else console.log('Session preferences saved: auto_proceed=' + autoProceed + ', chain_orchestrators=' + chainOrchestrators);
     });
   " <true|false> <true|false>
   ```

---

### AUTO-PROCEED MODE (DEFAULT: ON)

**The auto_proceed setting controls workflow behavior**:

**When AUTO-PROCEED is ON (default):**
- **Phase transitions**: Execute LEAD→PLAN→EXEC handoffs automatically
- **Validation gates**: Run gates; only stop on blocking failures
- **Post-completion**: Run full ship/document/learn sequence automatically
- **Next SD**: After completing one SD, show the next SD in queue
- **DO NOT** use AskUserQuestion for "what's next?" or "should I proceed?"

**When AUTO-PROCEED is OFF:**
- **Pause at phase transitions**: Ask before executing handoffs
- **Confirm post-completion**: Ask before running ship/document/learn
- **User controls pace**: Wait for explicit "proceed" before continuing

**ALWAYS STOP AND ASK (regardless of setting):**
- A blocking error requires human decision
- Tests fail after 2 retry attempts
- Merge conflicts require human resolution

---

Based on the argument provided, execute the appropriate action:

### If argument is "init" or "i":
Run session initialization explicitly:
1. Check for existing session preference (query above)
2. Ask user about both preferences (auto-proceed AND orchestrator chaining)
3. Store preferences in session metadata
4. Display confirmation:
   ```
   ✅ Session Initialized
      Auto-Proceed: ON/OFF
      Orchestrator Chaining: ON/OFF

   💡 Ready for LEO workflow. Run `/leo next` to see SD queue.
   ```

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

**Context-Based Type Inference (MANDATORY FIRST STEP):**

Before asking the user anything, analyze the recent conversation context to infer the SD type:

| Context Signals | Inferred Type |
|-----------------|---------------|
| security, vulnerability, CVE, exposed, credentials, hardcoded secrets, authentication bypass, RLS, injection | `security` (maps to `fix`) |
| bug, error, broken, failing, crash, exception, issue, not working, regression | `fix` |
| feature, add, new functionality, implement, create, build | `feature` |
| refactor, cleanup, simplify, restructure, reorganize, tech debt | `refactor` |
| tooling, script, CI/CD, infrastructure, deployment, automation, pipeline | `infrastructure` |
| documentation, docs, README, guide | `documentation` |

**Inference Rules:**
1. If conversation discussed specific issues (bugs, security, errors) → type is `fix` or `security`
2. If user said "yes" after Claude suggested creating an SD for discussed issues → use the type matching those issues
3. If user provided explicit context (e.g., "create an SD to fix the security issues") → extract type from their words
4. **Only ask if context is truly ambiguous** (no clear signals in recent messages)

**When type IS inferred from context:**
- Skip the type question entirely
- Proceed directly to generating a title based on the context
- Auto-generate title from conversation summary if possible (e.g., "Remediate Critical Security Vulnerabilities")
- Only ask for title confirmation if auto-generated title is unclear

**When type CANNOT be inferred (ambiguous context only):**
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

After getting/inferring type, generate or ask for title:
- If context provides clear scope → auto-generate title (e.g., "Remediate Critical Security and Code Quality Issues")
- If scope is unclear → ask "What's a brief title for this SD?"

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

### If argument is "resume" or "res":
Restore session state after a crash, compaction, or interruption using the UnifiedStateManager.

1. **Check for saved state:**
   ```bash
   node -e "
   const fs = require('fs');
   const path = require('path');
   const stateFile = path.join(process.cwd(), '.claude', 'unified-session-state.json');

   if (!fs.existsSync(stateFile)) {
     console.log('STATE_EXISTS=false');
     process.exit(0);
   }

   const stat = fs.statSync(stateFile);
   const ageMinutes = Math.round((Date.now() - stat.mtime.getTime()) / 60000);
   console.log('STATE_EXISTS=true');
   console.log('STATE_AGE_MINUTES=' + ageMinutes);
   "
   ```

2. **If STATE_EXISTS=false:**
   ```
   ❌ No saved session state found

   💡 State is preserved automatically during:
      - Context compaction (PreCompact hook)
      - Manual checkpoints (/context-compact)
      - Session interruptions

   Run `/leo next` to start fresh from the SD queue.
   ```

3. **If STATE_EXISTS=true, load and display state:**
   ```bash
   node -e "
   const fs = require('fs');
   const path = require('path');
   const stateFile = path.join(process.cwd(), '.claude', 'unified-session-state.json');

   try {
     let content = fs.readFileSync(stateFile, 'utf8');
     // Remove BOM if present
     if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
     const state = JSON.parse(content);

     console.log('');
     console.log('============================================================');
     console.log('[CONTEXT RESTORED] Session state from ' + state.timestamp);
     console.log('============================================================');

     // Git info
     if (state.git) {
       console.log('[GIT] Branch: ' + state.git.branch);
       if (state.git.recentCommits && state.git.recentCommits[0]) {
         console.log('[GIT] Latest: ' + state.git.recentCommits[0]);
       }
     }

     // SD info
     if (state.sd && state.sd.id) {
       console.log('[SD] Working on: ' + state.sd.id);
       if (state.sd.phase) console.log('[SD] Phase: ' + state.sd.phase);
       if (state.sd.progress !== null) console.log('[SD] Progress: ' + state.sd.progress + '%');
     }

     // Workflow
     if (state.workflow && state.workflow.currentPhase !== 'unknown') {
       console.log('[WORKFLOW] Phase: ' + state.workflow.currentPhase);
     }

     // Decisions
     if (state.decisions && state.decisions.length > 0) {
       console.log('[DECISIONS] ' + state.decisions.length + ' recorded');
     }

     // Constraints
     if (state.constraints) {
       const blocking = state.constraints.filter(c => c.blocking);
       if (blocking.length > 0) {
         console.log('[CONSTRAINTS] ' + blocking.length + ' BLOCKING');
       }
     }

     // Open Questions
     if (state.openQuestions) {
       const unresolved = state.openQuestions.filter(q => !q.resolved);
       if (unresolved.length > 0) {
         console.log('[QUESTIONS] ' + unresolved.length + ' open');
       }
     }

     // Pending actions
     if (state.summaries && state.summaries.pendingActions && state.summaries.pendingActions.length > 0) {
       console.log('[TODO] Pending actions: ' + state.summaries.pendingActions.length);
       state.summaries.pendingActions.slice(0, 3).forEach(action => {
         console.log('       - ' + action);
       });
     }

     console.log('============================================================');
     console.log('[RESTORED] Context automatically loaded - ready to continue');
     console.log('');

     // Output resume data for Claude to use
     if (state.sd && state.sd.id) {
       console.log('RESUME_SD_ID=' + state.sd.id);
       console.log('RESUME_SD_PHASE=' + (state.sd.phase || 'unknown'));
     }
   } catch (error) {
     console.error('Error loading state: ' + error.message);
     process.exit(1);
   }
   "
   ```

4. **After displaying state, determine next action:**

   **If RESUME_SD_ID is set:**
   - Load the appropriate CLAUDE context file based on RESUME_SD_PHASE:
     - LEAD phases (LEAD_APPROVAL, LEAD_FINAL_APPROVAL) → Read `CLAUDE_LEAD.md`
     - PLAN phases (PLAN_*, PRD_*) → Read `CLAUDE_PLAN.md`
     - EXEC phases (EXEC_*, IMPLEMENTATION_*) → Read `CLAUDE_EXEC.md`
   - Display:
     ```
     ✅ Session Restored
        SD: <RESUME_SD_ID>
        Phase: <RESUME_SD_PHASE>

     📋 Ready to continue. Context file loaded for current phase.
     ```

   **If no SD in saved state:**
   - Run `npm run sd:next` to show the SD queue
   - Display:
     ```
     ✅ Session State Restored (no active SD)

     📋 Showing SD queue to pick next work...
     ```

5. **Resume behavior summary:**
   - Restores git context (branch, recent commits)
   - Restores SD context (ID, phase, progress)
   - Restores decisions, constraints, open questions
   - Restores pending actions
   - Automatically loads appropriate CLAUDE_*.md context
   - Target: <100ms state load, 95% restoration success

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
  /leo init      (i)    - Initialize session (set auto-proceed preference)
  /leo restart   (r)    - Restart all LEO servers
  /leo next      (n)    - Show SD queue (what to work on)
  /leo create    (c)    - Create new SD (interactive wizard)
  /leo continue  (cont) - Resume current working SD
  /leo complete  (comp) - Run full sequence: document → ship → learn → next
  /leo resume    (res)  - Restore session from saved state (crash recovery)

SD Creation Flags:
  /leo create                    - Interactive wizard
  /leo create --from-uat <id>    - Create from UAT finding
  /leo create --from-learn <id>  - Create from /learn pattern
  /leo create --from-feedback <id> - Create from /inbox item
  /leo create --child <parent>   - Create child SD

Session Settings:
  Auto-proceed is ON by default. Run /leo init to change.
  State is preserved automatically during compaction for /leo resume.
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

When an SD reaches LEAD-FINAL-APPROVAL and is marked complete, **check session auto_proceed preference** to determine workflow:

```
✅ SD Completed: SD-XXX-001

[If auto_proceed=true]
🚀 Auto-Proceeding with Post-Completion Sequence...

[If auto_proceed=false]
📋 SD Complete. Ready for post-completion sequence.
   Run /leo complete or confirm to proceed.
```

| Step | Command | Condition | If auto_proceed=true | If auto_proceed=false |
|------|---------|-----------|---------------------|----------------------|
| 1 | `/restart` | UI/feature SD, or long session | Auto-run | Ask first |
| 2 | Visual review | If UI changes | Auto-review | Auto-review |
| 3 | `/ship` | Always | Auto-invoke | Ask first |
| 4 | `/document` | Feature/API SD | Auto-invoke | Ask first |
| 5 | `/learn` | Always | Auto-invoke | Ask first |
| 6 | `/leo next` | After completion | Auto-show | Ask first |

**AUTO-PROCEED MODE (check session preference)**:

Check session auto_proceed setting before deciding workflow behavior:
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('claude_sessions')
  .select('metadata')
  .eq('status', 'active')
  .order('heartbeat_at', { ascending: false })
  .limit(1)
  .single()
  .then(({data}) => {
    const autoProceed = data?.metadata?.auto_proceed ?? true; // Default ON
    console.log('AUTO_PROCEED=' + autoProceed);
  });
"
```

**If AUTO_PROCEED=true (default):**
1. **Phase transitions**: Execute handoffs without confirmation
2. **Post-completion**: Run the full sequence above without asking
3. **Next SD**: After completion, automatically show the next SD in queue
- DO NOT use AskUserQuestion for workflow progression

**If AUTO_PROCEED=false:**
1. **Phase transitions**: Ask user before executing handoffs
2. **Post-completion**: Confirm before running each step
3. **Next SD**: Ask before showing queue
- Use AskUserQuestion at each decision point

**For UI/Feature SDs (when auto_proceed=true):**
```
1. Invoke /restart skill → Wait for servers
2. Perform visual review → Report findings
3. Invoke /ship skill → Create PR, merge
4. Invoke /document skill → Update docs
5. Invoke /learn skill → Capture patterns
6. Run npm run sd:next → Show next work
```

**For Infrastructure/Database SDs (when auto_proceed=true):**
```
1. Invoke /ship skill → Create PR, merge
2. Invoke /learn skill → Capture patterns
3. Run npm run sd:next → Show next work
```

**Always stop and ask user if (regardless of auto_proceed):**
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
