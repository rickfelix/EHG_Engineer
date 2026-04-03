---
description: LEO stack management and session control
argument-hint: [start <SD-ID>|assist|history|inbox|create|next|continue|complete|restart|settings]
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
       if (data && data.metadata && data.metadata.auto_proceed === undefined) {
         console.log('SESSION_NEW=true');
       } else if (data && data.metadata) {
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

**AUTO-PROCEED**: See CLAUDE.md for full behavior. Default ON. Always stop on blocking errors, test failures (2 retries), merge conflicts.

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

### If argument is "history" or "h":
Show an AI-generated narrative summary of project evolution based on merged GitHub PRs.

1. **Ask which application:**
   ```javascript
   {
     "questions": [{
       "question": "Which application's history would you like to view?",
       "header": "Application",
       "multiSelect": false,
       "options": [
         {"label": "EHG_Engineer", "description": "Backend - CLI, tooling, infrastructure"},
         {"label": "EHG", "description": "Frontend - React/Vite application"},
         {"label": "Both", "description": "Combined history across both repositories"}
       ]
     }]
   }
   ```

2. **Ask date range:**
   ```javascript
   {
     "questions": [{
       "question": "What time period would you like to review?",
       "header": "Date Range",
       "multiSelect": false,
       "options": [
         {"label": "Last month", "description": "Past 30 days"},
         {"label": "Last 3 months", "description": "Past 90 days"},
         {"label": "Last 6 months", "description": "Past 180 days"},
         {"label": "This year", "description": "Since January 1, 2026"}
       ]
     }]
   }
   ```
   (User can select "Other" for custom start/end dates via free text)

3. **Ask granularity (context-sensitive based on date range):**

   | Date Range | Options shown |
   |---|---|
   | Last month | By day, By week |
   | Last 3 months | By week, By month |
   | Last 6 months | By month, By quarter |
   | This year | By month, By quarter |
   | Custom (<=60 days) | By day, By week |
   | Custom (61-180 days) | By week, By month |
   | Custom (>180 days) | By month, By quarter |

   Build the AskUserQuestion dynamically based on the selected date range:
   ```javascript
   // Example for "Last month":
   {
     "questions": [{
       "question": "What level of detail would you like?",
       "header": "Granularity",
       "multiSelect": false,
       "options": [
         {"label": "By week (Recommended)", "description": "Group PRs by week"},
         {"label": "By day", "description": "Group PRs by day (more detailed)"}
       ]
     }]
   }
   ```

4. **Compute dates from selection:**
   - "Last month" → since = 30 days ago, until = today
   - "Last 3 months" → since = 90 days ago, until = today
   - "Last 6 months" → since = 180 days ago, until = today
   - "This year" → since = Jan 1 of current year, until = today
   - Custom → parse user-provided dates

5. **Map repos:**
   - "EHG_Engineer" → `--repos "rickfelix/EHG_Engineer"`
   - "EHG" → `--repos "rickfelix/ehg"`
   - "Both" → `--repos "rickfelix/EHG_Engineer,rickfelix/ehg"`

6. **Map granularity:**
   - "By day" → `day`
   - "By week" → `week`
   - "By month" → `month`
   - "By quarter" → `quarter`

7. **Execute:**
   ```bash
   node scripts/leo-history.mjs --repos "<repos>" --since "<YYYY-MM-DD>" --until "<YYYY-MM-DD>" --granularity "<day|week|month|quarter>"
   ```

   Display the script's stdout output directly to the user.

### If argument is "settings" or "s":

**DELEGATES TO**: `/leo-settings` skill (`.claude/commands/leo-settings.md`)

Invoke the `leo-settings` skill using the Skill tool:
```
Skill tool: skill="leo-settings"
```

The leo-settings skill handles querying current settings, displaying them, and modifying global defaults or session overrides.

### If argument is "restart" or "r":
Run the LEO stack restart command:
```bash
node scripts/cross-platform-run.js leo-stack restart
```

### If argument is "assist" or "a":
Run intelligent autonomous inbox processing. This is the primary way to process feedback items.

**Invoke the assist skill:**
Use the Skill tool to invoke the `assist` skill.

```javascript
// Check for --dry-run flag
const dryRun = "$ARGUMENTS".includes("--dry-run");
```

**Modes:**
- `/leo assist` - Full autonomous processing
- `/leo assist --dry-run` - Preview mode (no changes made)

**What it does:**
1. **Phase 1 (Autonomous)**: Processes all issues without user interaction
   - Prioritizes by P0 → related to recent work → P1 → P2/P3
   - Quick-fixes (<50 LOC) implemented directly with intelligent retry
   - Larger issues create SDs

2. **Phase 2 (Interactive)**: Schedules enhancements one-by-one
   - Shows AI recommendations for each enhancement
   - User decides: Now / This week / Next week / Backlog / Won't do

3. **Summary**: Reports what was processed, fixed, scheduled

**Related:**
- `/leo inbox` - Just view inbox (no processing)
- `/leo assist --dry-run` - Preview what would happen

### If argument is "inbox" or "inb":
Show feedback inbox with options to manage items or create SDs from them.

1. **Invoke the inbox skill:**
   Use the Skill tool to invoke the `inbox` skill with any additional arguments passed.

   Example: `/leo inbox` → Invoke `inbox` skill (shows list)
   Example: `/leo inbox focus` → Invoke `inbox` skill with args: `focus`
   Example: `/leo inbox new` → Invoke `inbox` skill with args: `new`

2. **Display integration hint:**
   After showing inbox, remind user of SD creation option:
   ```
   💡 To create an SD from a feedback item:
      /leo create --from-feedback <id>

   💡 To process inbox autonomously:
      /leo assist
   ```

### If argument is "next" or "n":
Show the SD queue to determine what to work on next:

1. **Run the queue display (MANDATORY — NO EXCEPTIONS):**
   **ALWAYS execute `npm run sd:next` via the Bash tool, even if it was recently run in this session.**
   Do NOT skip this step, reuse cached output, or summarize previous results. The queue state changes between runs.
   ```bash
   npm run sd:next
   ```

2. **AUTO-PROCEED Detection**: After displaying the queue, check if AUTO-PROCEED mode is active:
   ```bash
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

3. **If AUTO-PROCEED is ACTIVE:**
   - Parse the recommended SD from `npm run sd:next` output (look for the `START` badge or top READY SD in the "RECOMMENDED ACTIONS" section)
   - Output status: `🤖 AUTO-PROCEED: Starting recommended SD: <SD-ID>...`
   - Auto-invoke: `/leo start <SD-ID>` (which claims the SD and loads protocol context)
   - Do NOT use AskUserQuestion — skip it entirely

4. **If AUTO-PROCEED is INACTIVE:**
   - Display the queue results
   - Wait for user to manually invoke `/leo start <SD-ID>` or `/leo <SD-ID>`

### If argument starts with "create" or "c":
Launch the SD creation wizard. Parse additional flags:

**Step 0: Vision Readiness Rubric (unified routing — runs before type inference)**

Before type inference, run the Vision Readiness Rubric to determine routing:

```bash
node scripts/modules/vision-readiness-rubric.js --title "<title>" --type "<inferred-or-unknown>" --source "interactive" --output-json
```

Parse the JSON output and apply these rules:
- **route == "EXEMPT"** → Source has upstream governance. Skip rubric, proceed to type inference.
- **route == "QUICK_FIX"** → Present `askUserQuestionPayload` to user:
  - User picks **"Create Quick Fix"** → run `node scripts/create-quick-fix.js --title "<title>" --type <type>`, then stop
  - User picks **"Create Direct SD"** → proceed to type inference
  - User picks **"Vision-First"** → launch `/brainstorm` pipeline, then stop
- **route == "DIRECT_SD"** → Present `askUserQuestionPayload` to user:
  - User picks **"Create SD"** → proceed to type inference (normal SD creation)
  - User picks **"Start Vision Pipeline"** → launch `/brainstorm` pipeline, then stop
- **route == "VISION_FIRST"** → Present `askUserQuestionPayload` to user:
  - User picks **"Start Vision Pipeline"** → launch `/brainstorm` pipeline, then stop
  - User picks **"Create Direct SD (Override)"** → proceed to type inference

**Exemptions (loop-breaking):**
- `--from-plan`, `--child`, `--vision-key`, `--arch-key` flags → EXEMPT (upstream governance provenance)
- `--from-uat`, `--from-feedback`, `--from-learn` → EXEMPT (corrective/tactical sources)

**Rubric Dimensions (scored 1-5 each, total 4-20):**
- **Scope Breadth**: How many systems/components (keywords, LOC estimate)
- **Novelty**: New capability vs. incremental (keywords, SD type)
- **Vision Coverage**: Existing vision doc overlap (DB query against eva_vision_documents)
- **Decomposition Likelihood**: Orchestrator probability (keywords, LOC, vision signals)

**Thresholds:** ≤7 = Quick Fix | 8-12 = Direct SD | ≥13 = Vision-First

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

- `create --from-plan [path]`: Create from Claude Code plan file

  **MANDATORY**: Before running `--from-plan`, you MUST read protocol files:
  ```
  Read tool: CLAUDE_CORE.md    (SD types, validation requirements, sub-agent triggers)
  Read tool: CLAUDE_LEAD.md    (SD creation process, field requirements, handoff gates)
  ```

  Then run the creation script:
  ```bash
  # Auto-detect most recent plan in ~/.claude/plans/
  node scripts/leo-create-sd.js --from-plan

  # Use specific plan file
  node scripts/leo-create-sd.js --from-plan ~/.claude/plans/my-plan.md
  ```

  This extracts from the plan:
  - **Title** from `# Plan: Title` or first `# Heading`
  - **Summary/Description** from `## Goal` or `## Summary` section
  - **Success Criteria** from `- [ ]` checklist items (max 10)
  - **Scope** from file modification tables
  - **SD Type** inferred from content keywords (security, bug, refactor, infrastructure, documentation → appropriate type)

  The original plan is archived to `docs/plans/archived/{sd-key}-plan.md` for reference.

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
   - **ALWAYS read `CLAUDE_CORE.md` first** (sub-agent prompt quality standard, SD type requirements)
   - Then read the phase-specific context file based on `current_phase`:
     - LEAD phases (LEAD_APPROVAL, LEAD_FINAL_APPROVAL) → Read `CLAUDE_LEAD.md`
     - PLAN phases (PLAN_*, PRD_*) → Read `CLAUDE_PLAN.md`
     - EXEC phases (EXEC_*, IMPLEMENTATION_*) → Read `CLAUDE_EXEC.md`
   - Load BOTH context files using the Read tool
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

   **Step 3: Heal**
   ```
   🩺 Running /heal sd...
   ```
   Invoke the `heal` skill with args: `sd --sd-id <SD-KEY>`.
   - Non-blocking: if heal fails or times out, log warning and continue.
   - If HEAL_STATUS=PASS: continue to next step.
   - If HEAL_STATUS=NEEDS_CORRECTION: corrective SD is queued (appears in sd:next), continue.

   **Step 4: Learn**
   ```
   📚 Running /learn...
   ```
   Invoke the `learn` skill using Skill tool.

   **Step 5: Next**
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
   - /heal sd - Codebase verified against SD promises
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

   if (fs.existsSync(stateFile) === false) {
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
       if (state.sd.progress === null) { /* skip */ } else { console.log('[SD] Progress: ' + state.sd.progress + '%'); }
     }

     // Workflow
     if (state.workflow && state.workflow.currentPhase && state.workflow.currentPhase === 'unknown' ? false : true) {
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
       const unresolved = state.openQuestions.filter(q => q.resolved === false || q.resolved === undefined);
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
   - **ALWAYS read `CLAUDE_CORE.md` first** (sub-agent prompt quality standard, SD type requirements)
   - Then read the phase-specific context file based on RESUME_SD_PHASE:
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

### If argument starts with "QF-" (Quick-Fix Detection)

**CRITICAL**: When the argument starts with `QF-`, this is a Quick-Fix ID, NOT a regular SD. Route to the quick-fix workflow.

1. **Detect Quick-Fix pattern:**
   - Pattern: `QF-` prefix (e.g., `QF-CLAIM-CONFLICT-UX-001`, `QF-20260130-001`)
   - Quick-fixes use a simplified workflow (no LEAD→PLAN→EXEC)
   - Quick-fixes are stored in `quick_fixes` table, NOT `strategic_directives_v2`

2. **Check quick_fixes table:**
   ```bash
   node -e "
   const { createClient } = require('@supabase/supabase-js');
   require('dotenv').config();
   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   const qfId = '<QF-ID>';
   supabase.from('quick_fixes')
     .select('*')
     .eq('id', qfId)
     .then(function(result) {
       if (result.data && result.data.length > 0) {
         var qf = result.data[0];
         console.log('QF_FOUND=true');
         console.log('QF_STATUS=' + qf.status);
         console.log('QF_TITLE=' + qf.title);
         console.log('QF_COMPLIANCE_SCORE=' + (qf.compliance_score || 'pending'));
       } else {
         console.log('QF_FOUND=false');
       }
     });
   "
   ```

3. **If QF_FOUND=true:**
   Display status and route accordingly:
   ```
   🔧 Quick-Fix: <QF-ID>
      Title: <title>
      Status: <status>
      Compliance: <score>/100

   [If status=open or in_progress]
   📋 Continue with /quick-fix workflow

   [If status=completed]
   ✅ This quick-fix is already completed.

   [If status=escalated]
   ⚠️ This quick-fix was escalated to SD: <escalated_to_sd_id>
      Run: /leo <escalated_to_sd_id>
   ```

4. **If QF_FOUND=false:**
   Check git history to see if already merged:
   ```bash
   git log --oneline -10 --grep="<QF-ID>"
   ```

   **If commits found with QF-ID:**
   ```
   ✅ Quick-Fix Already Completed: <QF-ID>

   📜 Git History:
   <commit hash> <commit message>

   This quick-fix was completed and merged. No further action needed.

   💡 Run `/leo next` to see the SD queue.
   ```

   **If no commits found:**
   ```
   🔧 New Quick-Fix: <QF-ID>

   This quick-fix doesn't exist yet. Would you like to create it?

   📋 Run `/quick-fix` to start the quick-fix workflow.
   ```

5. **Key differences from SD workflow:**
   - NO LEAD approval phase
   - NO PRD required
   - Scope limit: ≤50 LOC
   - Simplified compliance rubric (100-point scale)
   - Auto-escalates to full SD if complexity exceeds threshold

### If argument is "start" followed by SD-ID (e.g., `/leo start SD-XXX-001`)

**DELEGATES TO**: `/sd-start` skill (`.claude/commands/sd-start.md`)

Parse the SD-ID from the argument and invoke the `sd-start` skill using the Skill tool:
```
Skill tool: skill="sd-start", args="<SD-ID>"
```

The sd-start skill handles the full protocol: claim, worktree activation, phase context loading, orchestrator/child preflight, and display.

### If argument looks like an SD ID (SD-* pattern)

**DELEGATES TO**: `/sd-start` skill

When the argument matches `SD-*` pattern (e.g., `SD-FEATURE-001`), invoke the `sd-start` skill:
```
Skill tool: skill="sd-start", args="<SD-ID>"
```

### If argument is "audit" or "au":
Run the LEO audit discovery report to show issue patterns, compliance alerts, and retrospective insights.

```bash
node scripts/leo-audit.js
```

**Flags:**
- `--verbose` or `-v`: Show detailed output with proven solutions and key learnings
- `--format json`: Output machine-readable JSON

**What it shows:**
1. **Issue Patterns** - Active issues sorted by frequency, with severity and trends
2. **Compliance Alerts** - Unresolved protocol compliance violations
3. **Retrospective Insights** - Recent retrospective quality scores and learnings

### If argument is "analytics" or "an":
Run the LEO self-improvement analytics dashboard to show metrics across feedback, enhancements, patterns, and vetting.

```bash
node scripts/leo-analytics.js
```

**Flags:**
- `--verbose` or `-v`: Show detailed breakdowns by category
- `--format json`: Output machine-readable JSON

**What it shows:**
1. **Feedback Pipeline** - Total items, processed count, resolution rate
2. **Enhancement Outcomes** - Proposals created, approval rate, implementation rate
3. **Pattern Resolution** - Patterns identified, resolved, recurring, by severity
4. **Vetting Coverage** - Proposals vetted, average rubric score, approval rate

### If argument is "run":
Run the LEO protocol workflow:
```bash
npm run leo
```

### If no argument provided OR argument not recognized:
Display the available commands:

```
LEO Commands:
  /leo                   - Show this help menu
  /leo start <SD-ID>     - Start SD with auto protocol file loading (RECOMMENDED)
  /leo assist    (a)     - Autonomous inbox processing (issues + enhancements)
  /leo audit     (au)    - Show audit discovery report (patterns, alerts, retros)
  /leo analytics (an)    - Show self-improvement analytics dashboard
  /leo restart   (r)     - Restart all LEO servers
  /leo inbox     (inb)   - Show feedback inbox (view only)
  /leo next      (n)     - Show SD queue (what to work on)
  /leo create    (c)     - Create new SD (interactive wizard)
  /leo continue  (cont)  - Resume current working SD
  /leo complete  (comp)  - Run full sequence: document → ship → learn → next
  /leo history   (h)     - View AI-generated project evolution history
  /leo settings  (s)     - View/modify AUTO-PROCEED and Chaining settings

Inbox Processing:
  /leo assist            - Process inbox autonomously (recommended)
  /leo assist --dry-run  - Preview what would be processed
  /leo inbox             - View inbox without processing

Direct ID Access:
  /leo SD-XXX-001        - Start/continue work on a Strategic Directive
  /leo QF-XXX-001        - Start/continue work on a Quick-Fix

SD Creation Flags:
  /leo create                    - Interactive wizard
  /leo create --from-uat <id>    - Create from UAT finding
  /leo create --from-learn <id>  - Create from /learn pattern
  /leo create --from-feedback <id> - Create from /inbox item
  /leo create --from-plan [path] - Create from Claude Code plan file
  /leo create --child <parent>   - Create child SD

Quick-Fix vs SD:
  QF-* prefix → Quick-fix workflow (≤50 LOC, no LEAD phase)
  SD-* prefix → Full SD workflow (LEAD→PLAN→EXEC)

Session Settings:
  Auto-proceed is ON by default. Run /leo init or /leo settings to change.
  Settings hierarchy: CLI flags > Session > Global defaults > Hard-coded
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

### After SD Completion

Post-completion is handled by `/leo complete` (see above). The sequence is:
1. `/ship` → `/heal sd` → `/document` (feature SDs) → `/learn` → `sd:next`

AUTO-PROCEED controls whether each step runs automatically or asks first.
Always stop on: blocking errors, test failures after 2 retries, merge conflicts.

### Orchestrator, Child SD, and Context Loading

**DELEGATES TO**: `/sd-start` skill (`.claude/commands/sd-start.md`)

The `/sd-start` skill handles all SD initialization concerns:
- Orchestrator detection and preflight (`node scripts/orchestrator-preflight.js`)
- Child SD dependency validation (`node scripts/child-sd-preflight.js`)
- Mandatory context loading (CLAUDE.md, CLAUDE_CORE.md, phase-specific files)
- Worktree activation (PAT-WORKTREE-LIFECYCLE-001)

When `/leo start <SD-ID>` or `/leo <SD-ID>` is invoked, all of these are executed automatically by the sd-start skill.

### Strategic Directive Creation

**DELEGATES TO**: `/leo create` sub-command (handled above in this file)

SD creation reads CLAUDE.md, CLAUDE_CORE.md, and the field reference automatically.
SD Type Quick Reference:

| SD Type | PRD Required | Min Handoffs | Gate Threshold |
|---------|--------------|--------------|----------------|
| `feature` | YES | 4 | 85% |
| `infrastructure` | YES | 3 | 80% |
| `enhancement` | Optional | 2 | 75% |
| `fix` | NO | 1 | 70% |
| `documentation` | NO | 1 | 60% |
