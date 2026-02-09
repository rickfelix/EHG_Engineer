# CLAUDE.md - LEO Protocol Context Router

## ⚠️ CRITICAL: Issue Resolution Protocol

**When you encounter ANY issue, error, or unexpected behavior:**

1. **DO NOT work around it** - Workarounds hide problems and create technical debt
2. **DO NOT ignore it** - Every issue is a signal that something needs attention
3. **INVOKE the RCA Sub-Agent** - Use `subagent_type="rca-agent"` via the Task tool

**Example invocation:**
```
Task tool with subagent_type="rca-agent":
"Analyze why [describe the issue] is occurring.
Perform 5-whys analysis and identify the root cause."
```

**Why this matters:**
- Root cause fixes prevent recurrence
- Issues captured in `issue_patterns` table benefit future sessions
- Systematic analysis produces better solutions than quick fixes

**The only acceptable response to an issue is understanding WHY it happened.**

**This file is AUTO-GENERATED from the database.**

## To Make Changes:
1. **For dynamic content** (agents, sub-agents, triggers): Update database tables directly
2. **For static sections** (guides, examples, instructions): Add/update in `leo_protocol_sections` table
3. **Regenerate file**: Run `node scripts/generate-claude-md-from-db.js`

**Any direct edits to this file will be lost on next regeneration!**

See documentation for table structure: `database/schema/007_leo_protocol_schema_fixed.sql`

## Session Prologue (Short)

1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate varies by SD type (60-90%, typically 85%)
2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
3. **Database-first** - No markdown files as source of truth
4. **USE PROCESS SCRIPTS** - ⚠️ NEVER bypass add-prd-to-database.js, handoff.js ⚠️
5. **Small PRs** - Target ≤100 lines, max 400 with justification
6. **Priority-first** - Use `npm run prio:top3` to justify work
7. **Version check** - If stale protocol detected, run `node scripts/generate-claude-md-from-db.js`

*For copy-paste version: see `templates/session-prologue.md` (generate via `npm run session:prologue`)*

## Migration Execution Protocol

## ⚠️ CRITICAL: Migration Execution Protocol

**CRITICAL**: When you need to execute a migration, INVOKE the DATABASE sub-agent rather than writing execution scripts yourself.

The DATABASE sub-agent handles common blockers automatically:
- **Missing SUPABASE_DB_PASSWORD**: Uses `SUPABASE_POOLER_URL` instead (no password required)
- **Connection issues**: Uses proven connection patterns
- **Execution failures**: Tries alternative scripts before giving up

**Never give up on migration execution** - the sub-agent has multiple fallback methods.

**Invocation**:
```
Task tool with subagent_type="database-agent":
"Execute the migration file: database/migrations/YYYYMMDD_name.sql"
```

## AUTO-PROCEED Mode

**AUTO-PROCEED** enables fully autonomous LEO Protocol execution, allowing Claude to work through SD workflows without manual confirmation at each phase transition.

### Activation

AUTO-PROCEED is **ON by default** for new sessions. To change:
- Run `/leo init` or `/leo settings` to set session preference
- Preference stored in `claude_sessions.metadata.auto_proceed`

Check status:
```bash
node -e "require('dotenv').config(); const {createClient}=require('@supabase/supabase-js'); createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY).from('claude_sessions').select('metadata').eq('status','active').order('heartbeat_at',{ascending:false}).limit(1).single().then(({data})=>console.log('AUTO_PROCEED='+(data?.metadata?.auto_proceed??true)))"
```

### Behavior Summary

| When AUTO-PROCEED is ON | When OFF |
|-------------------------|----------|
| Phase transitions execute automatically | Pause and ask before each transition |
| Post-completion runs /document → /ship → /learn | Ask before each step |
| Shows next SD after completion | Ask before showing queue |
| No confirmation prompts | AskUserQuestion at each decision |

### CRITICAL: No Background Tasks

**When AUTO-PROCEED is active, NEVER use `run_in_background: true` on ANY tool that supports it.**

This applies to:
- **Bash tool**: `run_in_background: true` is FORBIDDEN
- **Task tool**: `run_in_background: true` is FORBIDDEN

All commands and sub-agents must run inline/foreground to maintain workflow continuity. Background task completion notifications interrupt the autonomous flow, causing unexpected pauses.

| Tool | Parameter | AUTO-PROCEED ON | AUTO-PROCEED OFF |
|------|-----------|-----------------|------------------|
| Bash | `run_in_background: true` | FORBIDDEN | Allowed |
| Task | `run_in_background: true` | FORBIDDEN | Allowed |
| Both | `run_in_background: false` or omitted | Required | Allowed |

**Why this matters:**
- Background tasks return control immediately, breaking the sequential workflow
- Completion notifications arrive asynchronously, interrupting current work
- The workflow stops unexpectedly waiting for user acknowledgment
- If session goes stale, orphaned background tasks complete later and pollute new sessions

**This is a hard behavioral constraint, not a suggestion.**

**2026-02-01 Incident**: Background Task tool invocations were spawned during AUTO-PROCEED, creating orphaned tasks that completed in later sessions. Root cause: Rule only mentioned Bash, not Task tool.

### Platform-Level Enforcement

**RECOMMENDED**: Set the `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` environment variable to enforce this constraint at the platform level:

```bash
# Add to .env file
CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1
```

**What this disables (when set to 1):**
- `run_in_background: true` parameter on Bash and Task tools
- Auto-backgrounding behavior
- Ctrl+B keyboard shortcut

**Benefits:**
- Platform-native enforcement (maintained by Claude Code team)
- Zero maintenance burden vs custom validators
- Takes effect at process startup
- Simpler than documentation-only rules

**Available since**: Claude Code v2.1.4

**Pattern Reference**: See `docs/patterns/PAT-AUTO-PROCEED-001.md` for full analysis of the background task enforcement gap.

### Pause Points (When ON)

AUTO-PROCEED runs continuously EXCEPT at these boundaries:
1. **Orchestrator completion** - After all children complete, pauses for /learn review
2. **Blocking errors** - Errors that cannot be auto-resolved
3. **Test failures** - After 2 retry attempts
4. **Merge conflicts** - Require human resolution
5. **All children blocked** - Shows blockers and waits for decision

### Multi-Session Coordination Infrastructure

**SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001** provides database-level protection ensuring only ONE Claude session can claim a given SD at any time.

#### Database Constraint

A **partial unique index** enforces single active claim at the database level:

```sql
-- Only one session can have status='active' for a given sd_id
CREATE UNIQUE INDEX idx_claude_sessions_unique_active_claim
ON claude_sessions (sd_id)
WHERE sd_id IS NOT NULL AND status = 'active';
```

**Impact on AUTO-PROCEED**: When a session attempts to claim an SD already held by another active session, the claim is rejected with detailed owner information (session ID, heartbeat age, hostname).

#### Heartbeat Manager

The heartbeat manager (`lib/heartbeat-manager.mjs`) maintains session liveness:

- **Interval**: 30 seconds (automatic updates)
- **Stale threshold**: 5 minutes (300 seconds)
- **Max failures**: 3 consecutive before stopping

**AUTO-PROCEED uses heartbeat to**:
- Detect if previous session crashed (stale heartbeat)
- Allow claim takeover for abandoned SDs
- Maintain claim ownership during long operations

#### Enhanced Session View

The `v_active_sessions` view provides real-time session monitoring:

| Field | Description |
|-------|-------------|
| `heartbeat_age_seconds` | Seconds since last heartbeat |
| `heartbeat_age_human` | Human-readable age ("30s ago", "2m ago") |
| `seconds_until_stale` | Countdown to 5-minute threshold |
| `computed_status` | active, stale, idle, or released |

**Query stale sessions**:
```sql
SELECT session_id, sd_id, heartbeat_age_human
FROM v_active_sessions WHERE computed_status = 'stale';
```

#### Claim Conflict Resolution

When AUTO-PROCEED encounters a claim conflict:

1. **Check existing claim** - Query `v_active_sessions` for owner details
2. **Evaluate staleness** - If heartbeat > 5 minutes, session is stale
3. **Auto-release stale** - Use `release_sd()` RPC for abandoned claims
4. **Retry claim** - Attempt to claim after releasing stale session

**Related documentation**:
- Migration: `database/migrations/20260130_multi_session_pessimistic_locking.sql`
- Heartbeat API: `docs/reference/heartbeat-manager.md`
- Ops runbook: `docs/06_deployment/multi-session-coordination-ops.md`

### Error Resolution with RCA Sub-Agent

**CRITICAL**: When AUTO-PROCEED encounters issues that cannot be immediately resolved, leverage the **RCA (Root Cause Analysis) sub-agent** to systematically diagnose and prevent recurrence.

**When to invoke RCA sub-agent:**
- After 2+ retry attempts fail on the same issue
- When the same error pattern appears across multiple SDs
- Database errors, migration failures, or schema conflicts
- Test failures that aren't obvious code bugs
- Any blocking error before pausing for human intervention

**RCA Workflow in AUTO-PROCEED:**
1. **Detect persistent issue** → Invoke RCA sub-agent via Task tool
2. **RCA performs 5-Whys analysis** → Identifies true root cause
3. **Generate CAPA** → Corrective and Preventive Actions
4. **Auto-create fix SD if needed** → For systemic issues requiring code changes
5. **Document pattern** → Add to issue_patterns table for future prevention

**Example invocation:**
```
Task tool with subagent_type="rca-agent":
"Analyze why [error description] keeps occurring.
Perform 5-whys analysis and recommend systematic fix."
```

**Benefits:**
- Prevents repeated failures on the same issue type
- Creates institutional knowledge through issue patterns
- Enables truly autonomous operation by learning from failures
- Reduces human intervention over time

### How to Stop

- **User interrupt**: Type in terminal at any time (auto-resumes after handling)
- **Explicit stop**: Say "stop AUTO-PROCEED" or "disable AUTO-PROCEED"
- **Session preference**: Run `/leo init` and select "Turn OFF"

### Quick Start

```
1. Start session → AUTO-PROCEED ON by default
2. Run /leo next → See SD queue
3. Pick SD → Work begins automatically
4. Phase transitions → No confirmation needed
5. Completion → /document → /ship → /learn → next SD
6. Orchestrator done → /learn runs, queue displayed, PAUSE
```

### Discovery Decisions Summary (D01-D29)

| # | Area | Decision |
|---|------|----------|
| D01 | Pause points | Never within session, only at orchestrator completion |
| D02 | Error handling | Auto-retry with exponential backoff, then RCA for persistent issues |
| D03 | Visibility | Full streaming (show all activity) |
| D04 | Limits | None - run until complete or interrupted |
| D05 | UAT | Auto-pass with flag for later human review |
| D06 | Notifications | Terminal + Claude Code sound notification |
| D07 | Learning trigger | Auto-invoke /learn at orchestrator end |
| D08 | Post-learn | Show queue, pause for user selection |
| D09 | Context | Existing compaction process handles it |
| D10 | Restart | Auto-restart with logging for visibility |
| D11 | Handoff | Propagate AUTO-PROCEED flag through handoff.js |
| D12 | Activation | Uses claude_sessions.metadata.auto_proceed (default: true) |
| D13 | Interruption | Built-in, auto-resume after handling user input |
| D14 | Multi-orchestrator | Show full queue of available orchestrators/SDs |
| D15 | Chaining | Configurable (default: pause at orchestrator boundary) |
| D16 | Validation failures | Skip failed children, mark as blocked, continue |
| D17 | Session summary | Detailed - all SDs processed, status, time, issues |
| D18 | Crash recovery | Both auto-load AND explicit /leo resume |
| D19 | Metrics | Use existing retrospectives and issue patterns |
| D20 | Sensitive SDs | No exceptions - all SD types treated the same |
| D21 | Mid-exec blockers | Attempt to identify and resolve dependency first |
| D22 | Re-prioritization | Auto-adjust queue based on learnings |
| D23 | All blocked | Show blockers, pause for human decision |
| D24 | Mode reminder | Display AUTO-PROCEED status when /leo starts SD |
| D25 | Status line | Add mode + phase + progress (keep existing content) |
| D26 | Completion cue | No acknowledgment between SDs - smooth continuation |
| D27 | Compaction notice | Brief inline notice when context compacted |
| D28 | Error retries | Log inline with "Retrying... (attempt X/Y)", RCA after failures |
| D29 | Resume reminder | Show what was happening before resuming |

*Full discovery details: docs/discovery/auto-proceed-enhancement-discovery.md*

## Orchestrator Chaining Mode

**Orchestrator Chaining** controls behavior when an orchestrator SD completes.

### Default: OFF (pause at orchestrator boundary)

**When Chaining is OFF (default):**
- After completing an orchestrator, PAUSE for review
- Run /learn to capture learnings from all children
- Show SD queue and wait for user selection
- Provides time for human review of major work

**When Chaining is ON (power user mode):**
- After completing an orchestrator, auto-continue to next
- Still runs /learn but continues without pausing
- Useful for batch processing multiple orchestrators
- For experienced users comfortable with continuous operation

### Configuration

| Level | How to Set | Scope |
|-------|------------|-------|
| Session | `/leo settings` or `/leo init` | This session only |
| Global | `/leo settings` → Global defaults | All future sessions |
| CLI | `--chain` / `--no-chain` | This invocation only |

### Settings Command

Use `/leo settings` (or `/leo s`) to view and modify:
- **Global defaults** - Apply to all new sessions
- **Session settings** - Override global for current session

### Precedence (Highest to Lowest)

1. **CLI flags**: `--chain` / `--no-chain`
2. **Session metadata**: `claude_sessions.metadata.chain_orchestrators`
3. **Global default**: `leo_settings.chain_orchestrators`
4. **Hard-coded fallback**: `false` (OFF)

### When to Enable Chaining

Consider enabling chaining when:
- Working through a queue of related orchestrators
- High confidence in workflow stability
- Minimal need for inter-orchestrator review
- Running overnight or during dedicated sessions

Keep chaining disabled when:
- New to the codebase or protocol
- Working on high-risk or complex orchestrators
- Need time to review /learn outputs
- Debugging or investigating issues

### Related Settings

- **AUTO-PROCEED**: Controls phase transitions within an SD
- **Chaining**: Controls transitions between orchestrator SDs

Both can be configured via `/leo settings`.

## SD Continuation Truth Table

**CRITICAL**: This table is AUTHORITATIVE for ALL SD transition decisions. It covers every transition type, not just orchestrator boundaries. When behavior is ambiguous, THIS TABLE WINS.

### Complete Transition Matrix

| Transition Context | AUTO-PROCEED | Chaining | Behavior | Implementation |
|-------------------|:------------:|:--------:|----------|----------------|
| **Handoff completes (not LEAD-FINAL-APPROVAL)** | * | * | **TERMINAL** - Phase work required before next handoff | `getNextInWorkflow()` returns null |
| Handoff completes (LEAD-FINAL-APPROVAL) | ON | * | **AUTO-CONTINUE** to next ready child (if orchestrator) | Child-to-child continuation |
| Handoff completes (LEAD-FINAL-APPROVAL) | OFF | * | PAUSE for user selection | User must invoke next handoff |
| **Child completes → next child** | ON | * | **AUTO-CONTINUE** to next ready child (priority-based) | `getNextReadyChild()` |
| Child completes → next child | OFF | * | PAUSE for user selection | User must invoke `/leo next` |
| **Child fails gate (retries exhausted)** | ON | * | **SKIP** to next sibling (D16) | `executeSkipAndContinue()` |
| Child fails gate (retries exhausted) | OFF | * | PAUSE with failure details | Manual remediation |
| **All children complete (orchestrator done)** | ON | ON | Run /learn → **AUTO-CONTINUE** to next orchestrator | `orchestrator-completion-hook.js` |
| All children complete (orchestrator done) | ON | OFF | Run /learn → Show queue → **PAUSE** (D08) | User selects next orchestrator |
| All children complete (orchestrator done) | OFF | * | PAUSE before /learn | Maximum human control |
| **All children blocked** | * | * | **PAUSE** - show blockers (D23) | Human decision required |
| **Dependency unresolved** | * | * | **SKIP** SD, continue to next ready | `checkDependenciesResolved()` |
| **Grandchild completes** | ON | * | Return to parent context, continue to next child | Hierarchical traversal |

### Phase Work Between Handoffs (D34 - Added 2026-02-06)

**ALL handoffs are terminal.** Phase work must happen between every handoff:

| After Handoff | Required Phase Work | Next Handoff |
|---------------|---------------------|--------------|
| LEAD-TO-PLAN | Create PRD via `add-prd-to-database.js` | PLAN-TO-EXEC |
| PLAN-TO-EXEC | Implement features (coding, testing) | EXEC-TO-PLAN |
| EXEC-TO-PLAN | Verify implementation (QA, review) | PLAN-TO-LEAD |
| PLAN-TO-LEAD | Final review, address feedback | LEAD-FINAL-APPROVAL |
| LEAD-FINAL-APPROVAL | (Triggers child-to-child continuation) | (Next child SD via AUTO-PROCEED) |

**Why handoffs are terminal:**
- Prevents skipping critical work (PRD creation, implementation, verification)
- Clarifies AUTO-PROCEED scope: child-to-child only, not handoff-to-handoff
- Aligns with original design intent

**SD-type-specific workflows** are defined in `workflow-definitions.js` (which handoffs are required/optional per type), not in auto-chaining logic.

### Key Rules

1. **AUTO-PROCEED OFF always pauses** - Chaining has no effect when AUTO-PROCEED is OFF
2. **Chaining only affects orchestrator-to-orchestrator transitions** - Child-to-child is controlled by AUTO-PROCEED alone
3. **All handoffs are terminal (D34)** - No auto-chaining within a single SD, phase work required between handoffs
4. **Priority determines next SD** - `sortByUrgency()` ranks by: Band (P0→P3) → Score → FIFO
5. **Dependencies gate readiness** - SD with unresolved deps is skipped, not paused on
6. **Both ON = no pauses except hard stops** - Runs until D23 (all blocked) or context exhaustion

### Next SD Selection Priority

When AUTO-PROCEED determines "next SD", selection follows this order:

```
1. Unblocked children of current orchestrator (by urgency score)
2. Unblocked grandchildren (depth-first, urgency-sorted)
3. Next orchestrator (if Chaining ON and current orchestrator complete)
4. PAUSE (if nothing ready or Chaining OFF at orchestrator boundary)
```

**Urgency Score Components** (from `urgency-scorer.js`):
- SD Priority (critical/high/medium/low): 25% weight
- Active issue patterns: 20% weight
- Downstream blockers: 15% weight
- Time sensitivity: 15% weight
- Learning signals: 40% blend
- Progress (≥80% complete): 10% bonus

### Decision Flow (Complete)

```
SD Completes (child, grandchild, or orchestrator)
         │
         ▼
   Is this a handoff completion (not LEAD-FINAL-APPROVAL)?
    │           │
   YES          NO (LEAD-FINAL-APPROVAL or child SD done)
    │           │
    │           └──► Continue below to check AUTO-PROCEED
    ▼
   TERMINAL - Show phase work guidance
   Example: "Create PRD, then run PLAN-TO-EXEC"
   PAUSE
         │
         ▼
   AUTO-PROCEED ON?
    │           │
   YES          NO
    │           └──► PAUSE (ask user to invoke /leo next)
    ▼
   Is this an orchestrator with all children done?
    │           │
   YES          NO (more children remain)
    │           │
    │           └──► getNextReadyChild() → Continue to next child
    ▼
   Run /learn automatically
         │
         ▼
   Chaining ON?
    │           │
   YES          NO
    │           └──► Show queue → PAUSE (D08)
    ▼
   findNextAvailableOrchestrator()
    │           │
   Found       Not Found
    │           └──► Show queue → PAUSE (no more work)
    ▼
   Auto-continue to next orchestrator
```

### Implementation Files

| Component | File | Key Function |
|-----------|------|--------------|
| Handoff termination | `scripts/modules/handoff/cli/cli-main.js` | `getNextInWorkflow()` (always returns null) |
| Child selection | `scripts/modules/handoff/child-sd-selector.js` | `getNextReadyChild()` |
| Skip failed child | `scripts/modules/handoff/skip-and-continue.js` | `executeSkipAndContinue()` |
| Orchestrator completion | `scripts/modules/handoff/orchestrator-completion-hook.js` | `executeOrchestratorCompletionHook()` |
| Urgency scoring | `scripts/modules/auto-proceed/urgency-scorer.js` | `sortByUrgency()` |
| Dependency check | `scripts/modules/sd-next/dependency-resolver.js` | `checkDependenciesResolved()` |
| Mode resolution | `scripts/modules/handoff/auto-proceed-resolver.js` | `resolveAutoProceed()` |
| SD-type workflows | `scripts/modules/handoff/cli/workflow-definitions.js` | `getWorkflowForType()` |

### Conflict Resolution

If documentation elsewhere conflicts with this truth table:
1. **This truth table wins** - It is the canonical specification
2. **Report the conflict** - Create an issue or RCA to fix inconsistent text
3. **Never guess** - When behavior is ambiguous, consult this table

### Historical Notes

**2026-02-06 (v3)**: D34 added - All handoffs are terminal (no auto-chaining within SD). Added phase work guidance table. Previous auto-chaining behavior (LEAD-TO-PLAN → PLAN-TO-EXEC) removed as it skipped PRD creation.

**2026-02-01 (v2)**: Expanded to cover ALL transition types, not just orchestrator boundaries. Added child-to-child and grandchild transitions.

**2026-02-01 (v1)**: D08 was written as absolute rule without Chaining exception. Added orchestrator completion matrix.


## Session Initialization - SD Selection

### Intent Detection Keywords
When the user says any of the following, run `npm run sd:next` FIRST:
- "start LEO", "start the LEO protocol"
- "what should we work on", "what's next"
- "identify next work", "next SD", "next strategic directive"
- "continue work", "resume", "pick up where we left off"
- "show queue", "show priorities", "what's ready"

### Automatic SD Queue Loading
```bash
npm run sd:next
```

This command provides:
1. **Track View** - Three parallel execution tracks (A: Infrastructure, B: Features, C: Quality)
2. **Dependency Status** - Which SDs are READY vs BLOCKED
3. **Continuity** - Recent git activity and "Working On" flag
4. **Recommendations** - Suggested starting point per track

### After Running sd:next
1. If SD marked "CONTINUE" (is_working_on=true) → Resume that SD
2. If no active SD → Pick highest-ranked READY SD from appropriate track
3. Load CLAUDE_LEAD.md for SD approval workflow

### Related Commands
| Command | Purpose |
|---------|---------|
| `npm run sd:next` | Show intelligent SD queue |
| `npm run sd:status` | Progress vs baseline |
| `npm run sd:burnrate` | Velocity and forecasting |
| `npm run sd:baseline view` | Current execution plan |


## Work Item Creation Routing

**Before creating any work item, determine the appropriate workflow:**

| Criteria | Use Quick-Fix | Use Strategic Directive |
|----------|---------------|-------------------------|
| LOC estimate | ≤50 LOC | >50 LOC |
| Scope | 1-2 files | Multiple components |
| DB changes | Data only | Schema changes |
| Root cause | Clear & obvious | Needs investigation |
| Planning | Minimal | Full LEAD approval |

### Commands

| Workflow | Command | When to Use |
|----------|---------|-------------|
| Quick-Fix | `node scripts/create-quick-fix.js --title "<title>" --type bug` | Small bugs, polish, ≤50 LOC |
| Strategic Directive | `node scripts/leo-create-sd.js LEO bugfix "<title>"` | Features, refactors, complex work |

### Prefix Enforcement

- **QF-*** prefix → Indicates Quick-Fix workflow. `leo-create-sd.js` will warn and redirect.
- **SD-*** prefix → Strategic Directive workflow (full LEAD→PLAN→EXEC).
- Use `--force` flag to override QF- prefix warning if intentional.

### Pattern Reference
PAT-WORKFLOW-ROUTING-001: Quick-Fix and SD systems are separate. Route correctly at creation time.

## Skill Intent Detection (Proactive Invocation)

**CRITICAL**: When user query or response matches these patterns, IMMEDIATELY invoke the corresponding skill using the Skill tool. Do not just acknowledge - execute.

### SD Creation Triggers → **Semantic Intent**: User wants to create a new trackable work item in the LEO system.

**Explicit triggers** (user directly mentions SD/directive):
- "create an SD", "create a strategic directive", "new SD", "new directive"
- "I want to create an SD", "I want to create a strategic directive"
- "let's create an SD", "make this an SD", "turn this into an SD"
- "create another SD", "another strategic directive"
- "add this to the queue", "queue this up", "track this as an SD"

**Plan-based triggers** (user has a plan and wants to create SD from it):
- "create SD from the plan", "create from plan", "from the plan"
- "SD from the plan we discussed", "make this plan an SD"
- "use the plan to create", "turn the plan into an SD"
- "create the strategic directive from the plan"

**Action for plan-based**: Run 
**Contextual triggers** (user describes work that should become an SD):
- "this should be tracked", "we should track this", "this needs tracking"
- "turn this into a directive", "make this a directive"
- "I want to [refactor/fix/add/build/implement] ..." (when scope is non-trivial)

**After agreement triggers** (when Claude suggests an SD and user agrees):
- "yes", "yes, create", "sure", "ok, create it", "go ahead"
- "yes, let's do that", "sounds good, create it"

**Intelligence hint**: If the user describes a task that would typically require:
- Multiple files to modify
- More than ~50 lines of code
- Planning before implementation
- Tracking in the database

...then SUGGEST creating an SD if one doesn't exist for this work.

**Plan file auto-detection**: If a plan file exists in ~/.claude/plans/ modified within the last hour AND user asks to create an SD, prompt to use --from-plan workflow.

**Action**: Use Skill tool with  and 
### Quick-Fix Triggers → - "quick fix", "small fix", "just fix this quickly"
- "patch this", "minor bug", "simple fix"
- "can you fix that real quick", "tiny change needed"
- After  confirms small issue (<50 LOC)

**Action**: Use Skill tool with  and 
### Documentation Triggers → - "document this", "update the docs", "add documentation"
- "we should document this", "this needs documentation"
- After completing feature/API SD work
- When new commands or features are implemented

**Action**: Use Skill tool with 
### Learning Triggers → - "capture this pattern", "we should learn from this"
- "add this as a learning", "this is a recurring issue"
- "remember this for next time", "pattern detected"
- After  completes successfully

**Action**: Use Skill tool with 
### Verification Triggers → - "verify this with other AIs", "triangulate this"
- "is this actually implemented?", "check if this works"
- "get external AI opinion", "multi-AI verification"
- When debugging conflicting claims about codebase state

**Action**: Use Skill tool with 
### UAT Triggers → - "test this", "let's do acceptance testing"
- "run UAT", "human testing needed", "manual test"
- "verify this works", "acceptance test"
- After  for feature/bugfix/security SDs

**Action**: Use Skill tool with 
### Shipping Triggers → - "commit this", "create PR", "ship it", "let's ship"
- "push this", "merge this", "ready to ship"
- "create a pull request", "commit and push"
- After UAT passes or for exempt SD types

**Action**: Use Skill tool with 
### Server Management Triggers → - "restart servers", "fresh environment"
- "restart the stack", "restart LEO", "reboot servers"
- Before UAT, after long sessions, before visual review

**Action**: Use Skill tool with 
### RCA Triggers → - "this keeps failing", "stuck on this", "blocked"
- "need root cause", "root cause analysis", "rca"
- "why does this keep happening", "5 whys", "five whys"
- "diagnose", "debug", "investigate"
- "what caused this", "recurring issue"

**Action**: Use Skill tool with 
### Feedback Triggers → - "check feedback", "see inbox", "any feedback?"
- "review feedback items", "pending feedback"

**Action**: Use Skill tool with 
### Simplify Triggers → - "simplify this code", "clean this up", "refactor for clarity"
- "make this cleaner", "reduce complexity"
- Before shipping if session had rapid iteration

**Action**: Use Skill tool with 
### Context Compaction Triggers → - "context is getting long", "summarize context"
- "compact the conversation", "running out of context"

**Action**: Use Skill tool with 
---

### Command Ecosystem Flow (Quick Reference)

### Auto-Invoke Behavior

**CRITICAL**: When user agrees to a suggested command (e.g., "yes, let's ship", "sure, create an SD"), IMMEDIATELY invoke the skill. Do not:
- Just acknowledge the request
- Wait for explicit  syntax
- Ask for confirmation again

The user's agreement IS the confirmation. Execute immediately.

## Common Commands

- `node scripts/cross-platform-run.js leo-stack restart` - Restart all LEO servers (Engineer on 3000, App on 8080, Agent Platform on 8000)
- `node scripts/cross-platform-run.js leo-stack status` - Check server status
- `node scripts/cross-platform-run.js leo-stack stop` - Stop all servers

**Note**: The cross-platform runner automatically selects the appropriate script:
- **Windows**: Uses `leo-stack.ps1` (PowerShell)
- **Linux/macOS**: Uses `leo-stack.sh` (Bash)

## Slash Commands & Command Ecosystem

LEO Protocol includes intelligent slash commands that interconnect based on workflow context:

| Command | Purpose | Key Integration |
|---------|---------|-----------------|
| `/leo` | Protocol orchestrator, SD queue management | Suggests post-completion sequence |
| `/restart` | Restart all LEO stack servers | Pre-ship for UI work, post-completion |
| `/ship` | Commit, create PR, merge workflow | Always after completion, suggests /learn |
| `/learn` | Self-improvement, pattern capture | After shipping, creates SDs |
| `/document` | Update documentation | After feature/API work |
| `/quick-fix` | Small bug fixes (<50 LOC) | After triangulation confirms small bug |
| `/triangulation-protocol` | Multi-AI ground-truth verification | Before fixes, suggests /quick-fix |

**Command Ecosystem**: Commands intelligently suggest related commands based on context. See full workflow:
- **[Command Ecosystem Reference](docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram

**Example Flow (UI Feature Completion)**:
```
LEAD-FINAL-APPROVAL → /restart → Visual Review → /document → /ship → /learn → /leo next
```

## DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: 2026-02-09 5:48:15 AM
**Source**: Supabase Database (not files)
**Auto-Update**: Run `node scripts/generate-claude-md-from-db.js` anytime

## CURRENT LEO PROTOCOL VERSION: 4.3.3

**CRITICAL**: This is the ACTIVE version from database
**ID**: leo-v4-3-3-ui-parity
**Status**: ACTIVE
**Title**: LEO Protocol v4.3.3 - UI Parity Governance

## CLAUDE.md Router (Context Loading)

### Loading Strategy
1. **ALWAYS**: Read CLAUDE_CORE.md first (15k)
2. **Phase Detection**: Load phase-specific file based on keywords
3. **On-Demand**: Load reference docs only when issues arise

**CRITICAL**: This loading strategy applies to ALL SD work:
- New SDs being created
- Existing SDs being resumed
- **Child SDs of orchestrators** (each child requires fresh context loading)

Skipping CLAUDE_CORE.md causes: unknown SD type requirements, missed gate thresholds, skipped sub-agents.

### ⚠️ MANDATORY: Read Entire Files (No Partial Reads)

**When reading any file that contains instructions, requirements, or critical context, you MUST read the ENTIRE file from start to finish.**

**General Rule**: If a file is important enough to read, read it completely. Partial reads lead to missed requirements.

**Files that MUST be read in full (no `limit` parameter):**
- CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md
- PRD content from database
- Any file containing protocol instructions, requirements, or acceptance criteria
- Configuration files (.json, .yaml, .env.example)
- Test files when debugging failures
- Migration files when working on database changes

**When `limit` parameter IS acceptable:**
- Log files (reading recent entries)
- Large data files where you only need a sample
- Files explicitly marked as "preview only"

**Correct usage:**
```
Read tool: CLAUDE_EXEC.md (no limit parameter)
Read tool: docs/reference/database-agent-patterns.md (no limit parameter)
```

**Incorrect usage:**
```
Read tool: CLAUDE_EXEC.md with limit: 200  ← VIOLATION
Read tool: PRD file with limit: 100  ← VIOLATION
```

**Why this matters:** Critical instructions are often in later sections of files. Partial reads cause:
- Missed validation requirements
- Skipped sub-agent invocations
- Incomplete understanding of acceptance criteria
- Protocol violations

### Phase Keywords → File
| Keywords | Load |
|----------|------|
| "approve", "LEAD", "directive", "simplicity" | CLAUDE_LEAD.md |
| "PRD", "PLAN", "validation", "schema" | CLAUDE_PLAN.md |
| "implement", "EXEC", "code", "test" | CLAUDE_EXEC.md |

### Issue → Reference Doc
| Issue | Load |
|-------|------|
| Database/schema/RLS errors | docs/reference/database-agent-patterns.md |
| Migration execution | docs/reference/database-agent-patterns.md |
| Validation failures | docs/reference/validation-enforcement.md |
| Test/E2E issues | docs/reference/qa-director-guide.md |
| Context >70% | docs/reference/context-monitoring.md |

### Context Budget
- Router + Core: 18k (9% of 200k budget) ✅
- + Phase file: 43k avg (22%) ✅
- + Reference doc: 58k (29%) ✅

## Sub-Agent Trigger Keywords (Quick Reference)

**CRITICAL**: When user query contains these keywords, PROACTIVELY invoke the corresponding sub-agent via Task tool.

| Sub-Agent | Trigger Keywords |
|-----------|------------------|
| `ANALYTICS` | analytics tracking, conversion tracking, funnel analysis, google analytics, kpi dashboard, metrics dashboard, mixpanel, user analytics, AARRR, KPI (+24 more) |
| `API` | add endpoint, api design, api endpoint, api route, backend route, create endpoint, graphql api, openapi, rest api, swagger (+37 more) |
| `CRM` | contact management, crm system, customer relationship, hubspot setup, lead tracking, salesforce integration, CRM, HubSpot, Salesforce, account (+14 more) |
| `DATABASE` | EXEC_IMPLEMENTATION_COMPLETE, add column, alter table, apply migration, apply schema changes, apply the migration, create table, data model, database migration, database schema (+84 more) |
| `DEPENDENCY` | dependency update, dependency vulnerability, npm audit, npm install, outdated packages, package update, pnpm add, security advisory, yarn add, CVE (+29 more) |
| `DESIGN` | a11y, accessibility, component design, dark mode, design system, mobile layout, responsive design, shadcn, ui design, ux design (+67 more) |
| `DOCMON` | DAILY_DOCMON_CHECK, EXEC_COMPLETION, EXEC_IMPLEMENTATION, FILE_CREATED, HANDOFF_ACCEPTED, HANDOFF_CREATED, LEAD_APPROVAL, LEAD_HANDOFF_CREATION, LEAD_SD_CREATION, PHASE_TRANSITION (+30 more) |
| `FINANCIAL` | burn rate, cash flow analysis, financial model, p&l statement, profit and loss, revenue projection, runway calculation, EBITDA, P&L, break even (+21 more) |
| `GITHUB` | EXEC_IMPLEMENTATION_COMPLETE, LEAD_APPROVAL_COMPLETE, PLAN_VERIFICATION_PASS, ci pipeline, code review, create pr, git merge, git rebase, github actions, github workflow (+33 more) |
| `LAUNCH` | deploy to production, go live checklist, launch checklist, production deployment, ready to launch, release to production, ship to prod, GA release, beta release, cutover (+20 more) |
| `MARKETING` | brand awareness, content marketing, go to market, gtm strategy, marketing campaign, marketing strategy, seo strategy, GTM, SEO, advertising (+20 more) |
| `MONITORING` | alerting system, application monitoring, datadog, error monitoring, health check, prometheus, sentry, system monitoring, uptime monitoring, Datadog (+23 more) |
| `PERFORMANCE` | bottleneck, cpu usage, load time, memory leak, n+1 query, performance issue, performance optimization, response time, slow query, speed optimization (+27 more) |
| `PRICING` | cac ltv, pricing model, pricing page, pricing strategy, subscription pricing, tiered pricing, unit economics, CAC, LTV, arpu (+19 more) |
| `QUICKFIX` | easy fix, hotfix, minor fix, one liner, quick fix, quickfix, simple fix, small fix, trivial fix, adjust (+13 more) |
| `RCA` | 5 whys, causal analysis, ci_pipeline_failure, fault tree, fishbone, five whys, get to the bottom, handoff_rejection, ishikawa, keeps happening (+46 more) |
| `REGRESSION` | api signature, backward compatible, backwards compatible, before and after, breaking change, no behavior change, refactor safely, regression test, DRY violation, backward (+34 more) |
| `RETRO` | LEAD_APPROVAL_COMPLETE, LEAD_REJECTION, PLAN_VERIFICATION_COMPLETE, action items, continuous improvement, learn from this, lessons learned, post-mortem, postmortem, retrospective (+49 more) |
| `RISK` | architecture decision, high risk, pros and cons, risk analysis, risk assessment, risk mitigation, security risk, system design, tradeoff analysis, LEAD_PRE_APPROVAL (+79 more) |
| `SALES` | close deal, objection handling, sales cycle, sales pipeline, sales playbook, sales process, sales strategy, close, closing, deal (+17 more) |
| `SECURITY` | api key exposed, authentication bypass, csrf vulnerability, cve, exposed credential, hardcoded secret, owasp, penetration test, security audit, security vulnerability (+34 more) |
| `STORIES` | acceptance criteria, as a user, definition of done, epic, feature request, i want to, so that, user stories, user story, PLAN_PRD (+23 more) |
| `TESTING` | EXEC_IMPLEMENTATION_COMPLETE, add tests, create tests, e2e test, end to end test, integration test, vitest test, playwright test, spec file, test coverage (+42 more) |
| `UAT` | acceptance criteria, click through, happy path, human test, manual test, test scenario, uat test, user acceptance test, user journey, TEST-AUTH (+31 more) |
| `VALIDATION` | already exists, already implemented, before i build, check if exists, codebase search, duplicate check, existing implementation, codebase, codebase check, conflict (+18 more) |
| `VALUATION` | acquisition target, company valuation, dcf analysis, exit strategy, fundraising round, series a, startup valuation, DCF, IPO, Series A (+20 more) |
| `VETTING` | vet, vetting, proposal, rubric, constitutional, aegis, governance check, compliance check, validate proposal, assess feedback (+14 more) |

*Full trigger list in CLAUDE_CORE.md. Use Task tool with `subagent_type="<agent-code>"`*


---

*Router generated from database: 2026-02-09*
*Protocol Version: 4.3.3*
*Part of LEO Protocol router architecture*

## ⚠️ CRITICAL: Issue Resolution Protocol

**When you encounter ANY issue, error, or unexpected behavior:**

1. **DO NOT work around it** - Workarounds hide problems and create technical debt
2. **DO NOT ignore it** - Every issue is a signal that something needs attention
3. **INVOKE the RCA Sub-Agent** - Use `subagent_type="rca-agent"` via the Task tool

**Example invocation:**
```
Task tool with subagent_type="rca-agent":
"Analyze why [describe the issue] is occurring.
Perform 5-whys analysis and identify the root cause."
```

**Why this matters:**
- Root cause fixes prevent recurrence
- Issues captured in `issue_patterns` table benefit future sessions
- Systematic analysis produces better solutions than quick fixes

**The only acceptable response to an issue is understanding WHY it happened.**
