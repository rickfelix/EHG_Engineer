<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-02-20T18:40:12.279Z -->
<!-- git_commit: 0f099db7 -->
<!-- db_snapshot_hash: 48d945e119e4c835 -->
<!-- file_content_hash: pending -->

# CLAUDE_CORE_DIGEST.md - Core Protocol (Enforcement)

**Protocol**: LEO 4.3.3
**Purpose**: Essential workflow rules and constraints (<10k chars)

---

## RCA Issue Resolution Mandate

## ⚠️ CRITICAL: Issue Resolution Protocol

**When you encounter ANY issue, error, or unexpected behavior:**

1. **DO NOT work around it** - Workarounds hide problems and create technical debt
2. **DO NOT ignore it** - Every issue is a signal that something needs attention
3. **INVOKE the RCA Sub-Agent** - Use `subagent_type="rca-agent"` via the Task tool

### Sub-Agent Prompt Quality Standard (Five-Point Brief)

**CRITICAL**: The prompt you write when spawning ANY sub-agent is the highest-impact point in the entire agent chain. Everything downstream — team composition, investigation direction, finding quality — inherits from it.

Every sub-agent invocation MUST include these five elements:

| Element | What to Include | Example |
|---------|----------------|---------|
| **Symptom** | Observable behavior (what IS happening) | "The /users endpoint returns 504 after 30s" |
| **Location** | Files, endpoints, DB tables involved | "routes/users.js line 45, lib/queries/user-lookup.js" |
| **Frequency** | How often, when it started, pattern | "Started 2h ago, every 3rd request fails" |
| **Prior attempts** | What was already tried (so agent doesn't repeat) | "Server restart didn't help, DNS is fine" |
| **Desired outcome** | What success looks like | "Identify root cause, propose fix with <30min implementation" |

**Anti-patterns** (NEVER do these):
- ❌ "Analyze why [issue] is occurring" — too vague, agent has nothing to anchor on
- ❌ Dumping entire conversation context — unrelated tokens waste investigation capacity
- ❌ Omitting prior attempts — agent repeats your failed approaches

**Example invocation (GOOD - RCA agent):**
```
Task tool with subagent_type="rca-agent":
"Symptom: SD cannot be marked completed. DB trigger rejects with 'Progress: 20% (need 100%)'.
Location: get_progress_breakdown() function, trigger on strategic_directives_v2, UUID: 7d2aa25e
Frequency: 6th child of orchestrator. First 5 siblings completed. Only this one stuck.
Prior attempts: Direct status update blocked. Checked sd_phase_handoffs — empty for all siblings.
Desired outcome: Identify what mechanism marked sibling phases complete, apply same to this SD."
```

**Example invocation (BAD - too vague):**
```
Task tool with subagent_type="rca-agent":
"Analyze why the SD completion is failing. Perform 5-whys analysis and identify the root cause."
```

**Why this matters:**
- Root cause fixes prevent recurrence
- Issues captured in `issue_patterns` table benefit future sessions
- Systematic analysis produces better solutions than quick fixes

**The only acceptable response to an issue is understanding WHY it happened.**

## 🚫 MANDATORY: Phase Transition Commands (BLOCKING)

## MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions.

### Required Commands

**Pre-flight Batch Validation (RECOMMENDED)**:
**Phase Transitions**:
### Error Codes
| Code | Meaning | Fix |
|------|---------|-----|
| `ERR_TESTING_REQUIRED` | TESTING sub-agent must run | Run TESTING first |
| `ERR_CHAIN_INCOMPLETE` | Missing prerequisite handoff | Complete missing handoff |
| `ERR_NO_PRD` | No PRD for PLAN-TO-EXEC | Create PRD first |

### Emergency Bypass (Rate-Limited)
- 3 bypasses per SD max, 10 per day globally
- All bypasses logged to `audit_log` with severity=warning

### Compliance Check
**FAILURE TO RUN THESE COMMANDS = LEO PROTOCOL VIOLATION**

## Mandatory Agent Invocation Rules

**CRITICAL**: Certain task types REQUIRE specialized agent invocation - NO ad-hoc manual inspection allowed.

### Task Type -> Required Agent

| Task Keywords | MUST Invoke | Purpose |
|---------------|-------------|---------|
| UI, UX, design, landing page, styling, CSS, colors, buttons | **design-agent** | Accessibility audit (axe-core), contrast checking |
| accessibility, a11y, WCAG, screen reader, contrast | **design-agent** | WCAG 2.1 AA compliance validation |
| form, input, validation, user flow | **design-agent** + **testing-agent** | UX + E2E verification |
| performance, slow, loading, latency | **performance-agent** | Load testing, optimization |
| security, auth, RLS, permissions | **security-agent** | Vulnerability assessment |
| API, endpoint, REST, GraphQL | **api-agent** | API design patterns |
| database, migration, schema | **database-agent** | Schema validation |
| test, E2E, Playwright, coverage | **testing-agent** | Test execution |

### Why This Exists

**Incident**: Human-like testing perspective interpreted as manual content inspection.
**Result**: 47 accessibility issues missed, including critical contrast failures (1.03:1 ratio).
**Root Cause**: Ad-hoc review instead of specialized agent invocation.
**Prevention**: Explicit rules mandate agent use for specialized tasks.

### How to Apply

1. Detect task type from user request keywords
2. Invoke required agent(s) BEFORE making changes
3. Agent findings inform implementation
4. Re-run agent AFTER changes to verify fixes

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

## Execution Philosophy

### Quality-First (PARAMOUNT)
**Get it right, not fast.** Correctness > speed. 2-4 hours careful implementation beats 6-12 hours rework.

### Testing-First (MANDATORY)
- E2E testing is MANDATORY
- 100% user story coverage required
- Both unit tests AND E2E tests must pass

### Database-First (REQUIRED)
**Zero markdown files.** Database tables are single source of truth:
- SDs → `strategic_directives_v2`
- PRDs → `product_requirements_v2`
- Handoffs → `sd_phase_handoffs`
- Retrospectives → `retrospectives`

### Validation-First (GATEKEEPING)
- LEAD validates: Real problem? Feasible? Resources?
- After approval: SCOPE LOCK - deliver what was approved

### Anti-Bias Rules (MANDATORY)
| Bias | Incorrect | Correct |
|------|-----------|---------|
| Efficiency | Skip workflow steps | Full workflow is non-negotiable |
| Completion | "complete" = code works | "complete" = database status + validations |
| Abstraction | Children are sub-tasks | Children are INDEPENDENT SDs |
| Autonomy | No human gates | Each phase requires validation |

**RULE**: When ANY bias-pattern detected, STOP and verify with user.

**NEVER**:
- Ship without completing full LEO Protocol
- Skip LEAD approval for child SDs
- Skip PRD creation for child SDs
- Mark parent complete before all children complete in database

## Global Negative Constraints

These anti-patterns apply across ALL phases. Violating them leads to failed handoffs and rework.

### NC-001: No Markdown Files as Source of Truth
❌ Creating/updating .md files to store requirements, PRDs, or status
✅ Use database tables via scripts

### NC-002: No Bypassing Process Scripts
❌ Directly inserting into database tables
✅ Always use handoff.js, add-prd-to-database.js

### NC-003: No Guessing File Locations
❌ Assuming file paths based on naming conventions
✅ Use Glob/Grep to find exact paths, read files before editing

### NC-004: No Implementation Without Reading
❌ Starting to code before reading existing implementation
✅ Read ≥5 relevant files before writing any code

### NC-005: No Workarounds Before Root Cause Analysis
❌ Implementing quick fixes without understanding why something fails
✅ Identify root cause first, then fix

### NC-006: No Background Execution for Validation
❌ Using `run_in_background: true` for handoff/validation commands
✅ Run all LEO process scripts inline with appropriate timeouts

**Affected Commands** (MUST run inline):
- `node scripts/handoff.js execute ...`
- `node scripts/add-prd-to-database.js ...`
- `node scripts/phase-preflight.js ...`

## AUTO-PROCEED Mode

**AUTO-PROCEED** enables fully autonomous LEO Protocol execution, allowing Claude to work through SD workflows without manual confirmation at each phase transition.

### Activation

AUTO-PROCEED is **ON by default** for new sessions. To change:
- Run `/leo init` or `/leo settings` to set session preference
- Preference stored in `claude_sessions.metadata.auto_proceed`

Check status:
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

**CRITICAL**: When AUTO-PROCEED encounters issues that cannot be immediately resolved, use the **RCA (Root Cause Analysis) sub-agent** to systematically diagnose and prevent recurrence.

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

## Sub-Agent Invocation Quality Standard

**CRITICAL**: The prompt you write when spawning a sub-agent is the highest-impact point in the entire agent chain. Everything downstream — team composition, investigation direction, finding quality — inherits from it.

### Required Elements (The Five-Point Brief)

When invoking ANY sub-agent via the Task tool, your prompt MUST include:

| Element | What to Include | Example |
|---------|----------------|---------|
| **Symptom** | What is actually happening (observable behavior) | "The /users endpoint returns 504 after 30s" |
| **Location** | Files, endpoints, systems, or DB tables involved | "API route in routes/users.js, query in lib/queries/" |
| **Frequency** | One-time, recurring, pattern, or regression | "Started 2 hours ago, affects every 3rd request" |
| **Prior attempts** | What has already been tried or ruled out | "Restarted server — no improvement. Not a DNS issue." |
| **Impact** | Severity and what is blocked downstream | "Blocking all user signups, P0 severity" |

### What to EXCLUDE from Sub-Agent Prompts

| Exclude | Why |
|---------|-----|
| **Your hypothesis about the cause** | Biases the investigation — let the agent form its own hypothesis |
| **Large log/code dumps** | The agent has Read and Bash tools — point to files instead |
| **Unrelated context** | Every extra token is a token not spent on investigation |
| **Vague descriptions** | "Look into this error" gives the agent nothing to anchor on |

### Quality Examples

**GOOD prompt** (RCA agent):
```
"Analyze why the /api/users endpoint returns 504 timeout after 30 seconds.
- Location: routes/users.js line 45 calls lib/queries/user-lookup.js
- Frequency: Started 2 hours ago, every 3rd request fails
- Prior attempts: Server restart did not help, DNS resolution is fine
- Impact: All user signups blocked (P0)
Perform 5-whys analysis and identify the root cause."
```

**BAD prompt** (same scenario):
```
"Investigate this timeout issue. Something is wrong with the users endpoint."
```

### Why This Matters

The prompt quality compounds through every level of the agent chain:

```
Strong prompt -> Agent understands domain -> Picks RIGHT teammates
  -> Teammates get focused assignments -> Findings are actionable

Weak prompt -> Agent guesses at scope -> Generic team spawned
  -> Broad investigation -> Scattered findings -> "12 possible issues"
```

### Enforcement

This standard applies to ALL sub-agent invocations, not just RCA. Whether spawning DATABASE, TESTING, SECURITY, PERFORMANCE, or any other agent — include the Five-Point Brief.

**Exception**: Routine/automated invocations (e.g., DOCMON on phase transitions) that follow a fixed template are exempt.

## Critical Term Definitions

## 🚫 CRITICAL TERM DEFINITIONS (BINDING)

These definitions are BINDING. Misinterpretation is a protocol violation.

### "Complete an SD"
**Definition**: An SD is "complete" ONLY when:
1. Full LEAD→PLAN→EXEC cycle executed (per sd_type requirements)
2. Database status = 'completed'
3. All required handoffs recorded
4. Retrospective created
5. LEO Protocol validation trigger passes

**NOT complete**: Code shipped but database shows 'draft'/'in_progress'

### "Continue autonomously"
**Definition**: Execute the current SD through its full LEO Protocol workflow WITHOUT stopping to ask for user confirmation at each step.
**NOT**: Skip workflow steps for efficiency.
**AUTO-PROCEED**: Phase transitions, post-completion sequence, and next SD selection all happen automatically.
**ONLY STOP IF**:
- Blocking error requires human decision (e.g., merge conflicts)
- Tests fail after 2 retry attempts
- Critical security or data-loss scenario

### "Child SD"
**Definition**: An INDEPENDENT Strategic Directive that requires its own full LEAD→PLAN→EXEC cycle.
**NOT**: A sub-task or implementation detail of the parent.
**Each child**: Has its own PRD, handoffs, retrospective, and completion validation.

### "Ship" vs "Complete"
**Ship**: Code merged to main branch.
**Complete**: Ship + database status 'completed' + all handoffs + retrospective.
**CRITICAL**: Shipping is NECESSARY but NOT SUFFICIENT for completion.

## SD Type-Aware Workflow Paths

## SD Type Validation & Workflow Paths

**IMPORTANT**: Different SD types have different required handoffs AND different gate pass thresholds.

### Gate Pass Thresholds
| SD Type | Threshold | Required Handoffs | Notes |
|---------|-----------|-------------------|-------|
| `feature` | 85% | All 5 | Full validation |
| `bugfix` | 85% | All 5 | Regression testing critical |
| `database` | 85% | All 5 | May skip UI-dependent E2E |
| `security` | 90% | All 5 | Strictest validation |
| `refactor` | 75-90% | All 5 | Varies by intensity |
| `infrastructure` | 80% | 4 (skip EXEC-TO-PLAN) | No production code |
| `documentation` | 60% | 4 (skip EXEC-TO-PLAN) | No code changes |
| `orchestrator` | 70% | Coordinates children | USER_STORY gate bypassed |

### Workflow Paths

**Full Workflow (5 handoffs)** - feature, bugfix, database, security, refactor:
```
LEAD-TO-PLAN → PLAN-TO-EXEC → [EXEC] → EXEC-TO-PLAN → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL
```

**Reduced Workflow (4 handoffs)** - infrastructure, documentation:
```
LEAD-TO-PLAN → PLAN-TO-EXEC → [EXEC] → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL
                                    ↑ (skip EXEC-TO-PLAN)
```

### Required Sub-Agents by Type
| SD Type | Required Sub-Agents |
|---------|---------------------|
| `feature` | TESTING, DESIGN, DATABASE, STORIES |
| `bugfix` | TESTING, REGRESSION |
| `database` | DATABASE |
| `security` | SECURITY, TESTING |
| `infrastructure` | DOCMON |

### UAT Requirements
| SD Type | UAT Required | Notes |
|---------|-------------|-------|
| `feature` | **YES** | Human-verifiable outcome |
| `bugfix` | **YES** | Verify fix works |
| `infrastructure` | **EXEMPT** | Internal tooling |
| `documentation` | No | No runtime behavior |

### Pre-Handoff Check
Reference: `lib/utils/sd-type-validation.js`

## Database Sub-Agent Auto-Invocation

## Database Sub-Agent Semantic Triggering

When SQL execution intent is detected, the database sub-agent should be auto-invoked instead of outputting manual execution instructions.

### Intent Detection Triggers

The following phrases trigger automatic database sub-agent invocation:

| Category | Example Phrases | Priority |
|----------|-----------------|----------|
| **Direct Command** | "run this sql", "execute the query" | 9 |
| **Delegation** | "use database sub-agent", "have the database agent" | 8 |
| **Imperative** | "please run", "can you execute" | 8 |
| **Operational** | "update the table", "create the table" | 7 |
| **Result-Oriented** | "make this change in the database" | 6 |
| **Contextual** | "run it", "execute it" (requires SQL context) | 5 |

### Denylist Phrases (Block Execution Intent)

These phrases force NO_EXECUTION intent:
- "do not execute"
- "for reference only"
- "example query"
- "sample sql"
- "here is an example"

### Integration

When Claude generates SQL with execution instructions:
1. Check for SQL execution intent using `shouldAutoInvokeAndExecute()`
2. If intent detected with confidence >= 80%, use Task tool with database-agent
3. Never output "run this manually" when auto-invocation is permitted

### Configuration

Runtime configuration in `db_agent_config` table:
- `MIN_CONFIDENCE_TO_INVOKE`: 0.80 (default)
- `DB_AGENT_ENABLED`: true (default)
- `DENYLIST_PHRASES`: Array of blocking phrases

### Audit Trail

All invocation decisions logged to `db_agent_invocations` table with:
- correlation_id for tracing
- intent and confidence scores
- matched trigger IDs
- decision outcome

## Background Task Output Retrieval

## Global Negative Constraints

These anti-patterns apply across ALL phases. Violating them leads to failed handoffs and rework.

### NC-001: No Markdown Files as Source of Truth
❌ Creating/updating .md files to store requirements, PRDs, or status
✅ Use database tables via scripts

### NC-002: No Bypassing Process Scripts
❌ Directly inserting into database tables
✅ Always use handoff.js, add-prd-to-database.js

### NC-003: No Guessing File Locations
❌ Assuming file paths based on naming conventions
✅ Use Glob/Grep to find exact paths, read files before editing

### NC-004: No Implementation Without Reading
❌ Starting to code before reading existing implementation
✅ Read ≥5 relevant files before writing any code

### NC-005: No Workarounds Before Root Cause Analysis
❌ Implementing quick fixes without understanding why something fails
✅ Identify root cause first, then fix

### NC-006: No Background Execution for Validation
❌ Using `run_in_background: true` for handoff/validation commands
✅ Run all LEO process scripts inline with appropriate timeouts

**Affected Commands** (MUST run inline):
- `node scripts/handoff.js execute ...`
- `node scripts/add-prd-to-database.js ...`
- `node scripts/phase-preflight.js ...`

## Sub-Agent Trigger Keywords (Quick Reference)

**CRITICAL**: When user query contains these keywords, PROACTIVELY invoke the corresponding sub-agent via Task tool.

| Sub-Agent | Trigger Keywords |
|-----------|------------------|
| `ANALYTICS` | analytics tracking, conversion tracking, funnel analysis (+31 more) |
| `API` | add endpoint, api design, api endpoint (+44 more) |
| `CRM` | contact management, crm system, customer relationship (+21 more) |
| `DATABASE` | EXEC-TO-PLAN, add column, alter table (+91 more) |
| `DEPENDENCY` | dependency update, dependency vulnerability, npm audit (+36 more) |
| `DESIGN` | a11y, accessibility, component design (+74 more) |
| `DOCMON` | DAILY_DOCMON_CHECK, EXEC_COMPLETION, EXEC-TO-PLAN (+37 more) |
| `FINANCIAL` | burn rate, cash flow analysis, financial model (+28 more) |
| `GITHUB` | EXEC-TO-PLAN, LEAD_APPROVAL_COMPLETE, PLAN_VERIFICATION_PASS (+40 more) |
| `LAUNCH` | deploy to production, go live checklist, launch checklist (+27 more) |
| `MARKETING` | brand awareness, content marketing, go to market (+27 more) |
| `MONITORING` | alerting system, application monitoring, datadog (+30 more) |
| `PERFORMANCE` | bottleneck, cpu usage, load time (+34 more) |
| `PRICING` | cac ltv, pricing model, pricing page (+26 more) |
| `QUICKFIX` | easy fix, hotfix, minor fix (+20 more) |
| `RCA` | 5 whys, causal analysis, ci_pipeline_failure (+53 more) |
| `REGRESSION` | api signature, backward compatible, backwards compatible (+41 more) |
| `RETRO` | LEAD_APPROVAL_COMPLETE, LEAD_REJECTION, PLAN_VERIFICATION_COMPLETE (+56 more) |
| `RISK` | architecture decision, high risk, pros and cons (+86 more) |
| `SALES` | close deal, objection handling, sales cycle (+24 more) |
| `SECURITY` | api key exposed, authentication bypass, csrf vulnerability (+41 more) |
| `STORIES` | acceptance criteria, as a user, definition of done (+30 more) |
| `TESTING` | EXEC-TO-PLAN, add tests, create tests (+49 more) |
| `UAT` | acceptance criteria, click through, happy path (+38 more) |
| `VALIDATION` | already exists, already implemented, before i build (+25 more) |
| `VALUATION` | acquisition target, company valuation, dcf analysis (+27 more) |
| `VETTING` | vet, vetting, proposal (+21 more) |

*Full trigger list in CLAUDE_CORE.md. Use Task tool with `subagent_type="<agent-code>"`*



---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE_CORE.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

*DIGEST generated: 2026-02-20 1:40:12 PM*
*Protocol: 4.3.3*
