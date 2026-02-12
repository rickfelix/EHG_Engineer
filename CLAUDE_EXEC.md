# CLAUDE_EXEC.md - EXEC Phase Operations

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

**Generated**: 2026-02-12 8:24:59 PM
**Protocol**: LEO 4.3.3
**Purpose**: EXEC agent implementation requirements and testing (20-25k chars)

---

## Autonomous Continuation Directives

**CRITICAL**: These directives guide autonomous agent behavior during EXEC phase execution.

### Core Directives (Always Apply)

**1. Autonomous Continuation**
Continue through the strategic directive and its children SDs autonomously until completion or blocker. Do not stop to ask for permission at each step.

**2. Quality Over Speed**
Prioritize quality over speed. Do not cut corners. Ensure tests pass, code is clean, and documentation is updated.

### Handoff Directives (Apply at Phase Start)

**1. Protocol Familiarization**
At each handoff point, familiarize yourself with and read the LEO protocol documentation for the relevant phase.

### Conditional Directives (Apply When Issues Occur)

**Trigger**: When encountering errors, blockers, or failures during execution.

**1. 5-Whys Root Cause Analysis**
When encountering issues or blockers, determine the root cause by asking five whys before attempting fixes. Use /rca to invoke the formal 5-Whys analysis process.

**2. Sustainable Resolution**
Resolve root causes so they do not happen again in the future. Update processes, documentation, or automation to prevent recurrence.

---

*Directives from `leo_autonomous_directives` table (SD-LEO-CONTINUITY-001)*


## 🚫 MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions. Do NOT use database-agent to create handoffs directly.

### ⛔ NEVER DO THIS:
- Using `database-agent` to directly insert into `sd_phase_handoffs`
- Creating handoff records without running validation scripts
- Skipping preflight knowledge retrieval

### ✅ ALWAYS DO THIS:

#### Pre-flight Batch Validation (RECOMMENDED)
```bash
# SD-LEO-STREAMS-001: Find ALL issues at once (reduces handoff iterations 60-70%)
node scripts/handoff.js precheck PLAN-TO-EXEC SD-XXX-001
```

#### LEAD → PLAN Transition
```bash
# Step 1: MANDATORY - Run preflight (loads context from database)
node scripts/phase-preflight.js --phase PLAN --sd-id SD-XXX-001

# Step 2: MANDATORY - Execute handoff (validates and blocks if not ready)
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001
```

#### PLAN → EXEC Transition
```bash
# Step 1: MANDATORY - Run preflight
node scripts/phase-preflight.js --phase EXEC --sd-id SD-XXX-001

# Step 2: MANDATORY - Execute handoff (enforces BMAD, branch, and gate validation)
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
```

#### EXEC → PLAN Transition (Verification)
```bash
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001
```

#### PLAN → LEAD Transition (Final Approval)
```bash
node scripts/handoff.js execute PLAN-TO-LEAD SD-XXX-001
```

### Emergency Bypass (SD-LEARN-010)
For emergencies ONLY. Bypasses require audit logging and are rate-limited.

```bash
# Emergency bypass with mandatory justification (min 20 chars)
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001 \
  --bypass-validation \
  --bypass-reason "Production outage requires immediate fix - JIRA-12345"
```

**Rate Limits:**
- 3 bypasses per SD maximum
- 10 bypasses per day globally
- All bypasses logged to `audit_log` table with severity=warning

### What These Scripts Enforce
| Script | Validations |
|--------|-------------|
| `phase-preflight.js` | Loads context, patterns, and lessons from database |
| `handoff.js precheck` | **Batch validation** - runs ALL gates, git checks, reports ALL issues at once |
| `handoff.js LEAD-TO-PLAN` | SD completeness (100% required), strategic objectives |
| `handoff.js PLAN-TO-EXEC` | PRD exists (`ERR_NO_PRD`), chain completeness (`ERR_CHAIN_INCOMPLETE`) |
| `handoff.js EXEC-TO-PLAN` | TESTING enforcement (`ERR_TESTING_REQUIRED`), chain completeness |
| `handoff.js PLAN-TO-LEAD` | Traceability, workflow ROI, retrospective quality |

### Error Codes (SD-LEARN-010)
| Code | Meaning | Remediation |
|------|---------|-------------|
| `ERR_TESTING_REQUIRED` | TESTING sub-agent must run before EXEC-TO-PLAN (feature/qa SDs) | Run TESTING sub-agent first |
| `ERR_CHAIN_INCOMPLETE` | Missing prerequisite handoff in chain | Complete missing handoff first |
| `ERR_NO_PRD` | No PRD found for PLAN-TO-EXEC | Create PRD before proceeding |

### Compliance Marker
Valid handoffs are recorded with `created_by: 'UNIFIED-HANDOFF-SYSTEM'`. Handoffs with other `created_by` values indicate process bypass.

### Check Compliance
```bash
npm run handoff:compliance        # Check all recent handoffs
npm run handoff:compliance SD-ID  # Check specific SD
```

**FAILURE TO RUN THESE COMMANDS = LEO PROTOCOL VIOLATION**

## 🚨 EXEC Agent Implementation Requirements

### MANDATORY Pre-Implementation Verification
Before writing ANY code, EXEC MUST:

0. **AMBIGUITY RESOLUTION** 🔍 CRITICAL FIRST STEP
   - Review PRD for unclear requirements, missing details, or conflicting specifications
   - Do NOT proceed with implementation if ANY ambiguity exists
   - Use 3-tier escalation to resolve:
     1. **Re-read PRD**: Check acceptance_criteria, functional_requirements, test_scenarios
     2. **Query database context**: Check user stories, implementation_context, SD strategic_objectives
     3. **Ask user**: Use AskUserQuestion tool with specific, focused questions
   - Document resolution: "Ambiguity in [area] resolved via [method]: [resolution]"
   - **If still unclear after escalation**: BLOCK implementation and await user clarification

**Common Ambiguities to Watch For**:
- Vague feature descriptions ("improve UX", "make it better")
- Missing edge case handling ("what if user inputs invalid data?")
- Unclear success criteria ("should be fast", "should look good")
- Conflicting requirements between PRD sections
- Undefined behavior for error states

**Example Ambiguity Resolution**:
```
❌ BAD: Guess at implementation based on similar feature
✅ GOOD:
  - Tier 1: Re-read PRD section 3.2 → Still unclear on validation rules
  - Tier 2: Query user_stories table → Found implementation_context with validation spec
  - Resolution: "Email validation will use regex pattern from US-002 context"
```

0.5. **PRD INTEGRATION SECTION CHECK** 📋 CRITICAL
   - Read PRD `integration_operationalization` section BEFORE coding
   - Extract and document:
     - **Consumers**: Who/what uses this feature? What breaks if it fails?
     - **Dependencies**: Upstream systems to call, downstream systems that call us
     - **Failure modes**: How to handle when each dependency fails (error handling)
     - **Data contracts**: Schema changes, API shapes to implement
     - **Runtime config**: Env vars to add, feature flags to configure
     - **Observability**: Metrics to track, rollout/rollback plan
   - If section is missing: Flag to PLAN for remediation before EXEC proceeds
   - Document: "Integration context reviewed: [X consumers, Y dependencies, Z metrics]"

1. **APPLICATION CHECK** ⚠️ CRITICAL
   - **ALL UI changes** (user AND admin) go to `/mnt/c/_EHG/EHG/`
   - **User features**: `/mnt/c/_EHG/EHG/src/components/` and `/src/pages/`
   - **Admin features**: `/mnt/c/_EHG/EHG/src/components/admin/` and `/src/pages/admin/`
   - **Stage components**: `/mnt/c/_EHG/EHG/src/components/stages/admin/`
   - **Backend API only**: `/mnt/c/_EHG/EHG_Engineer/` (routes, scripts, no UI)
   - Verify: `cd /mnt/c/_EHG/EHG && pwd`
   - Check GitHub: `git remote -v` should show `rickfelix/ehg.git` for frontend

2. **URL Verification** ✅
   - Navigate to the EXACT URL specified in the PRD
   - Confirm the page loads and is accessible
   - Take a screenshot for evidence
   - Document: "Verified: [URL] is accessible"

3. **Component Identification** 🎯
   - Identify the exact file path of the target component
   - Confirm component exists at specified location
   - Document: "Target component: [full/path/to/component.tsx]"

4. **Application Context** 📁
   - Verify correct application directory
   - Confirm port number matches PRD (8080 for frontend, 3000 for backend API)
   - Document: "Application: [/path/to/app] on port [XXXX]"

5. **Visual Confirmation** 📸
   - Screenshot current state BEFORE changes
   - Identify exact location for new features
   - Document: "Current state captured, changes will go at [location]"

### Implementation Checklist Template
```markdown
## EXEC Pre-Implementation Checklist
- [ ] **Ambiguity Check**: All requirements clear and unambiguous
- [ ] **Ambiguity Resolution**: [NONE FOUND | Resolved via Tier X: description]
- [ ] **Application verified**: [EHG unified frontend confirmed]
- [ ] **Feature type**: [User /src/ | Admin /src/components/admin/ | Backend API EHG_Engineer]
- [ ] **URL verified**: [exact URL from PRD]
- [ ] **Page accessible**: [YES/NO]
- [ ] **Component identified**: [path/to/component]
- [ ] **Port confirmed**: [8080 frontend | 3000 backend API]
- [ ] **Screenshot taken**: [timestamp]
- [ ] **Target location confirmed**: [where changes go]
```

### Common Mistakes to AVOID
- ❌ Assuming component location based on naming similarity
- ❌ Implementing without navigating to the URL first
- ❌ Ignoring port numbers in URLs
- ❌ Pattern matching without verification
- ❌ Starting to code before completing checklist
- ❌ Not restarting dev servers after changes
- ❌ **CRITICAL**: Creating files for PRDs, handoffs, or documentation
- ❌ **CRITICAL**: Proceeding with implementation when requirements are ambiguous
- ❌ **CRITICAL**: Putting admin UI code in EHG_Engineer (all UI goes to EHG)

### Gate 0 Enforcement 🚨

**CRITICAL**: Before ANY implementation work, verify SD has passed LEAD approval:

```bash
# Check SD phase status
node scripts/verify-sd-phase.js SD-XXX-001

# Or check via sd:status
npm run sd:status SD-XXX-001
```

**Valid Phases for Implementation**:
- PLANNING, PLAN_PRD, PLAN, PLAN_VERIFICATION (PRD creation)
- EXEC (implementation authorized)

**Blocked Phases**:
- draft - SD not approved
- LEAD_APPROVAL - Awaiting LEAD approval

**Why This Matters**: Gate 0 prevents the anti-pattern where code is shipped while SDs remain in draft status. This is the "naming illusion" - using LEO terminology while bypassing LEO workflow.

**Enforcement Layers**:
1. Pre-commit hook (blocks commits for draft SDs)
2. CLAUDE_EXEC.md (mandatory Phase 1 check)
3. LOC threshold (>500 LOC requires SD)
4. verify-sd-phase.js script
5. GitHub Action (PR validation)
6. Orchestrator progress calculation

See: `docs/03_protocols_and_standards/gate0-workflow-entry-enforcement.md` for complete documentation.

**If SD is in draft**: STOP. Do not implement. Run LEAD-TO-PLAN handoff first.


## ❌ Anti-Patterns from Retrospectives (EXEC Phase)

**Source**: Analysis of 175 high-quality retrospectives (score ≥60)

These patterns have caused significant time waste. **AVOID them.**

### 1. Manual Test Creation (2-3 hours waste per SD)
**Pattern**: Writing tests manually instead of delegating to testing-agent

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Manual test creation wasted 2-3 hours instead of delegating to testing-agent"

**Fix**: Always use Task tool with `subagent_type: "testing-agent"`
```
Task(subagent_type="testing-agent", prompt="Create E2E tests for [feature] based on PRD acceptance criteria")
```

---

### 2. Skipping Knowledge Retrieval (4-6 hours rework)
**Pattern**: Starting implementation without querying retrospectives/patterns

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Zero consultation of retrospectives before implementation (research_confidence_score = 0.00)"

**Fix**: Run before EXEC starts:
```bash
node scripts/automated-knowledge-retrieval.js <SD-ID>
```
If `research_confidence_score = 0.00`, you skipped this step.

---

### 3. Workarounds Before Root Cause (2-3x time multiplier)
**Pattern**: Working around issues instead of fixing root causes

**Evidence**: SD-2025-1020-E2E-SELECTORS (Score: 100)
> "Time spent on workarounds >> time to follow protocol"
> "Multiple workarounds instead of fixing root causes"

**Fix**: Before implementing a workaround, ask:
- [ ] Have I identified the root cause?
- [ ] Is this a fix or a workaround?
- [ ] What is the time multiplier? (typical: 2-3x)

---

### 4. Accepting Environmental Blockers Without Debug
**Pattern**: Accepting "it's environmental" without investigation

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Environmental issues treated as blockers rather than investigation opportunities"

**Fix**: 5-step minimum debug before accepting as environmental:
1. Check logs for specific error
2. Verify credentials/tokens
3. Test in isolation (curl, manual browser)
4. Check network/ports
5. Compare with known working state

---

### 5. Manual Sub-Agent Simulation (15% quality delta)
**Pattern**: Manually creating sub-agent results instead of executing tools

**Evidence**: SD-RECONNECT-014 (Score: 90)
> "Manual: 75% confidence. Tool: 60% confidence (-15% delta)"
> "Manual sub-agent simulation is an anti-pattern"

**Fix**: Sub-agent results MUST have:
- `tool_executed: true`
- Actual execution timestamp
- Real output (not simulated)

---

### Quick Reference

| Anti-Pattern | Time Cost | Fix |
|--------------|-----------|-----|
| Manual test creation | 2-3 hours | Use testing-agent |
| Skip knowledge retrieval | 4-6 hours | Run automated-knowledge-retrieval.js |
| Workarounds first | 2-3x multiplier | Fix root cause |
| Accept environmental | Hours of idle | 5-step debug minimum |
| Simulate sub-agents | 15% quality loss | Execute actual tools |

**Pattern References**: PAT-RECURSION-001 through PAT-RECURSION-005

## Branch Creation (Automated at LEAD-TO-PLAN)

## 🌿 Branch Creation (Automated at LEAD-TO-PLAN)

### Automatic Branch Creation

As of LEO v4.4.1, **branch creation is automated** during the LEAD-TO-PLAN handoff:

1. When you run `node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001`
2. The `SD_BRANCH_PREPARATION` gate automatically creates the branch
3. Branch is created with correct naming: `<type>/<SD-ID>-<slug>`
4. Database is updated with branch name for tracking

### Manual Branch Creation (If Needed)

If branch creation fails or you need to create one manually:

```bash
# Create branch for an SD (looks up title from database)
npm run sd:branch SD-XXX-001

# Create with auto-stash (non-interactive)
npm run sd:branch:auto SD-XXX-001

# Check if branch exists
npm run sd:branch:check SD-XXX-001

# Full command with options
node scripts/create-sd-branch.js SD-XXX-001 --app EHG --auto-stash
```

### Branch Naming Convention

| SD Type | Branch Prefix | Example |
|---------|---------------|---------|
| Feature | `feat/` | `feat/SD-UAT-001-user-auth` |
| Fix | `fix/` | `fix/SD-FIX-001-login-bug` |
| Docs | `docs/` | `docs/SD-DOCS-001-api-guide` |
| Refactor | `refactor/` | `refactor/SD-REFACTOR-001-cleanup` |
| Test | `test/` | `test/SD-TEST-001-e2e-coverage` |

### Branch Hygiene Rules

From CLAUDE_EXEC.md (enforced at PLAN-TO-EXEC):
- **≤7 days stale** at PLAN-TO-EXEC handoff
- **One SD per branch** (no mixing work)
- **Merge main at phase transitions**

### When Branch is Created

```
LEAD Phase                    PLAN Phase                   EXEC Phase
    |                              |                            |
    |   LEAD-TO-PLAN handoff       |                            |
    |---[Branch Created Here]----->|                            |
    |                              |   PRD Creation             |
    |                              |   Sub-agent validation     |
    |                              |                            |
    |                              |   PLAN-TO-EXEC handoff     |
    |                              |---[Branch Validated]------>|
    |                              |                            |
```


## EXEC Phase Negative Constraints

## 🚫 EXEC Phase Negative Constraints

<negative_constraints phase="EXEC">
These anti-patterns are specific to the EXEC phase. Violating them leads to failed tests and rejected handoffs.

### NC-EXEC-001: No Scope Creep
**Anti-Pattern**: Implementing features not in PRD, "improving" unrelated code, adding "nice to have" features
**Why Wrong**: Scope creep derails timelines, introduces untested changes, confuses review
**Correct Approach**: Implement ONLY what's in the PRD. Create new SD for additional work.

### NC-EXEC-002: No Wrong Application Directory
**Anti-Pattern**: Working in EHG_Engineer when target is ehg app (or vice versa)
**Why Wrong**: Changes applied to wrong codebase, tests fail in CI, deployment issues
**Correct Approach**: Verify pwd matches PRD target_application before ANY changes

### NC-EXEC-003: No Tests Without Execution
**Anti-Pattern**: Claiming "tests exist" without actually running them
**Why Wrong**: 30-minute gaps between "complete" and discovering failures (SD-EXPORT-001)
**Correct Approach**: Run BOTH npm run test:unit AND npm run test:e2e, document results

### NC-EXEC-004: No Manual Sub-Agent Simulation
**Anti-Pattern**: Manually creating sub-agent results instead of executing actual tools
**Why Wrong**: 15% quality delta between manual (75%) and tool-executed (60%) confidence
**Correct Approach**: Sub-agent results must have tool_executed: true with real output

### NC-EXEC-005: No UI Without Visibility
**Anti-Pattern**: Backend implementation without corresponding UI to display results
**Why Wrong**: LEO v4.3.3 UI Parity Gate blocks features users can't see
**Correct Approach**: Every backend field must have corresponding UI component
</negative_constraints>

## Migration Execution - DATABASE Sub-Agent Delegation

### CRITICAL: Delegate Migration Execution to DATABASE Sub-Agent

**CRITICAL**: When you need to execute a migration, INVOKE the DATABASE sub-agent rather than writing execution scripts yourself.

The DATABASE sub-agent handles common blockers automatically:
- **Missing SUPABASE_DB_PASSWORD**: Uses `SUPABASE_POOLER_URL` instead (no password required)
- **Connection issues**: Uses proven connection patterns
- **Execution failures**: Tries alternative scripts before giving up

**Never give up on migration execution** - the sub-agent has multiple fallback methods.

**Trigger the DATABASE sub-agent when you need to**:
- Apply a migration file to the database
- Execute schema changes
- Run SQL statements against Supabase

**Invocation pattern**:
```
Task tool with subagent_type="database-agent":
"Execute the migration file: database/migrations/YYYYMMDD_name.sql"
```

The DATABASE sub-agent (v1.3.0+) has autonomous execution capability and will:
1. Determine if operation is safe (AUTO-EXECUTE) or needs routing
2. Use the correct connection pattern (SUPABASE_POOLER_URL - no password needed)
3. Split and execute SQL statements properly
4. Verify success and report results

**Only write your own migration script if**:
- DATABASE sub-agent is unavailable
- You need custom pre/post processing logic
- The migration has special transaction requirements

The next section ("Migration Script Pattern") provides the FALLBACK pattern if sub-agent is unavailable.

## Migration Script Pattern (MANDATORY)

**Issue Pattern**: PAT-DB-MIGRATION-001

When writing migration scripts, you MUST use the established pattern:

### Correct Pattern
```javascript
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';

const migrationSQL = readFileSync('path/to/migration.sql', 'utf-8');
const client = await createDatabaseClient('engineer', { verify: true });
const statements = splitPostgreSQLStatements(migrationSQL);

for (const statement of statements) {
  await client.query(statement);
}

await client.end();
```

### NEVER Use This Pattern
```javascript
// WRONG - exec_sql RPC does not exist
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, key);
await supabase.rpc('exec_sql', { sql_query: sql }); // FAILS
```

### Before Writing Migration Scripts
1. Search for existing patterns: `Glob *migration*.js`
2. Read `scripts/run-sql-migration.js` as canonical template
3. Use `lib/supabase-connection.js` utilities

## 📚 Skill Integration (EXEC Phase)

## Skill Integration During EXEC

### When to Invoke Skills

During EXEC, invoke Skills for creative guidance on HOW to implement:

| Task | Invoke Skill | What It Provides |
|------|-------------|------------------|
| Creating database table | `skill: "schema-design"` | Column types, constraints, naming conventions |
| Writing RLS policy | `skill: "rls-patterns"` | Policy templates, common patterns |
| Building React component | `skill: "component-architecture"` | 300-600 LOC sizing, Shadcn patterns |
| Writing E2E test | `skill: "e2e-patterns"` | Playwright structure, user story mapping |
| Handling authentication | `skill: "auth-patterns"` | Supabase Auth patterns, session management |
| Error handling | `skill: "error-handling"` | Unified error patterns, user feedback |
| API endpoints | `skill: "rest-api-design"` | RESTful patterns, status codes |

### Skill Invocation

```
skill: "schema-design"
```

Skills provide patterns, templates, and examples. Apply them to your specific implementation.

### Skills vs Sub-Agents in EXEC

| Layer | When | Purpose | Example |
|-------|------|---------|---------|
| **Skills** | During implementation | Pattern guidance (creative) | "How do I structure this component?" |
| **Sub-agents** | After implementation | Validation (verification) | "Is this migration safe?" |

**Do NOT** invoke sub-agents during EXEC implementation. Save validation for PLAN_VERIFY phase.

### Common Skill Chains by Task

| Implementation Task | Skill Chain (invoke in order) |
|--------------------|-------------------------------|
| New database feature | `schema-design` → `rls-patterns` → `migration-safety` |
| New UI component | `component-architecture` → `design-system` → `ui-testing` |
| New API endpoint | `rest-api-design` → `api-error-handling` → `input-validation` |
| Authentication flow | `auth-patterns` → `access-control` → `secret-management` |
| E2E test suite | `e2e-patterns` → `test-selectors` → `test-fixtures` |
| Performance work | `query-optimization` → `react-performance` → `bundle-optimization` |

### Skill Selection Guide

**Database work**:
- `schema-design` - Table structure, relationships
- `rls-patterns` - Row Level Security
- `migration-safety` - Safe migration practices
- `supabase-patterns` - Triggers, functions

**Frontend work**:
- `component-architecture` - Component sizing, structure
- `design-system` - Tailwind, styling conventions
- `ehg-frontend-design` - EHG design system specifics
- `accessibility-guide` - WCAG 2.1 AA patterns

**Testing work**:
- `e2e-patterns` - Playwright structure
- `test-selectors` - Resilient locators
- `test-fixtures` - Auth fixtures, test data
- `test-debugging` - Troubleshooting Arsenal

**Security work**:
- `auth-patterns` - Authentication flows
- `input-validation` - XSS, SQL injection prevention
- `access-control` - RBAC, route protection

### Remember

Skills are for **creative guidance** (how to build).
Sub-agents are for **validation** (did you build it right).
Use skills during EXEC, save sub-agents for PLAN_VERIFY.

## Multi-Instance Coordination (MANDATORY)

## 🔀 Multi-Instance Coordination (MANDATORY)

**Root Cause**: Multiple Claude Code instances operating in the same git working directory causes branch conflicts, stash collisions, and interrupted operations.

### MANDATORY: Git Worktrees for Parallel SD Work

When multiple Claude Code instances may run concurrently on different SDs:

#### Before Starting EXEC Phase:
```bash
# 1. Create isolated worktree (NOT shared /mnt/c/_EHG/ehg)
cd /mnt/c/_EHG/ehg
git worktree add /mnt/c/_EHG/ehg-worktrees/${SD_ID} -b feat/${SD_ID}-branch

# 2. Work ONLY in worktree directory
cd /mnt/c/_EHG/ehg-worktrees/${SD_ID}

# 3. All git operations happen here
git add . && git commit -m "feat(${SD_ID}): description"
git push origin feat/${SD_ID}-branch
```

#### After PR Merged:
```bash
# Cleanup worktree
cd /mnt/c/_EHG/ehg
git worktree remove /mnt/c/_EHG/ehg-worktrees/${SD_ID}
```

### Forbidden Operations (Multi-Instance)

| Operation | Why Forbidden | Alternative |
|-----------|---------------|-------------|
| `git stash pop` across SDs | Mixes changes between instances | Use worktrees |
| `git checkout` to different SD branch | Switches shared directory | Use worktrees |
| Working in `/mnt/c/_EHG/ehg` during parallel execution | Shared state conflicts | Use worktree path |
| Branch switching mid-operation | Interrupts other instance | Complete or stash first |

### Quick Reference

```bash
# Node CLI (recommended)
node scripts/session-worktree.js --sd-key SD-STAGE-09-001 --branch feat/SD-STAGE-09-001

# List active worktrees
node scripts/session-worktree.js --list

# Check if directory is worktree
git rev-parse --is-inside-work-tree
```

### Why Worktrees?

- **Complete isolation**: Each instance has its own filesystem
- **Shared history**: All worktrees share the same .git
- **No conflicts**: Branch operations don't affect other instances
- **Built-in**: No custom tooling required

**Evidence**: SD-STAGE-09-001 + SD-EVA-DECISION-001 collision - parallel instances caused branch switch during commit, resulting in mixed changes and failed operations.

## 📦 Database-First Progress Tracking (MANDATORY)

### ✅ AUTOMATED TRACKING (SD-DELIVERABLES-V2-001)

**As of v2.0**, deliverable tracking is now **FULLY AUTOMATED** via database triggers and sync mechanisms. Manual updates are **no longer required** in most cases.

### How Automated Tracking Works

#### 1. Bi-Directional Sync Triggers
- **User Story → Deliverable**: When user story `validation_status` changes to `validated`, linked deliverables auto-complete
- **Deliverable → User Story**: When all linked deliverables complete, user stories update via trigger
- **Loop Prevention**: `pg_trigger_depth()` prevents infinite trigger loops

#### 2. Sub-Agent Result Triggers  
Sub-agent PASS verdicts auto-complete matching deliverables:
| Sub-Agent | Auto-Completes |
|-----------|----------------|
| TESTING   | test deliverables |
| DATABASE  | database, migration deliverables |
| DESIGN    | ui_feature deliverables |
| SECURITY  | api, integration deliverables |
| QA        | test deliverables |

#### 3. Git Sync (Optional)
Run `node scripts/sync-deliverables-from-git.js <SD-ID>` to match git commits to deliverables.

#### 4. 100% Confidence Auto-Complete
Deliverables with `confidence_score >= 100` are auto-completed by database trigger.

### When Manual Updates Are Still Needed

Manual updates only required when:
- Deliverable isn't linked to a user story
- No sub-agent verification exists
- Work completed outside normal triggers

```javascript
// Only if automated tracking missed a deliverable:
await supabase
  .from('sd_scope_deliverables')
  .update({
    completion_status: 'completed',
    completion_evidence: 'Manual: description of work',
    verified_by: 'EXEC',
    verified_at: new Date().toISOString()
  })
  .eq('sd_id', 'SD-XXX-YYY')
  .eq('deliverable_name', 'Name');
```

### Verification Functions

```sql
-- Check deliverable status before handoff
SELECT * FROM get_deliverable_verification_report('SD-XXX-YYY');

-- Enhanced progress with real-time tracking  
SELECT * FROM get_progress_breakdown_v2('SD-XXX-YYY');

-- Parent SD with child rollup
SELECT * FROM get_parent_sd_progress_with_children('SD-PARENT-001');
```

### Handoff Verification Gate

EXEC→PLAN handoffs now have **intelligent verification**:
- **100%**: PASS - all deliverables complete
- **80-99%**: PASS_WITH_WARNING - shows incomplete items
- **<80%**: BLOCKED - recorded in metadata, requires completion

### Why This Matters
- **Zero Manual Overhead**: Triggers handle tracking automatically
- **Real-Time Progress**: `get_progress_breakdown_v2()` shows incremental EXEC progress
- **Evidence-Based Completion**: All completions require evidence/commit hash
- **Verification Gate**: Prevents premature handoffs

## Component Sizing Guidelines

**Evidence from Retrospectives**: Proven pattern in SD-UAT-020 and SD-008.

### Optimal Component Size: 300-600 Lines

**Success Pattern** (SD-UAT-020):
> "Split settings into three focused components. Each ~500 lines. Easy to test and maintain."

### Sizing Rules

| Lines of Code | Action | Rationale |
|---------------|--------|-----------|
| **<200** | Consider combining | Too granular |
| **300-600** | ✅ **OPTIMAL** | Sweet spot |
| **>800** | **MUST split** | Too complex |

## TODO Comment Standard

## TODO Comment Standard (When Deferring Work)

**Evidence from Retrospectives**: Proven pattern in SD-UAT-003 saved 4-6 hours.

### Standard TODO Format

```typescript
// TODO (SD-ID): Action required
// Requires: Dependencies, prerequisites
// Estimated effort: X-Y hours
// Current state: Mock/temporary/placeholder
```

**Success Pattern** (SD-UAT-003):
> "Comprehensive TODO comments provided clear future work path. Saved 4-6 hours."

## Human-Like E2E Testing Fixtures

### Human-Like E2E Testing Enhancements (LEO v4.4)

Enhanced Playwright fixtures for human-like testing that catches "feels wrong" issues, accessibility regressions, and failure-mode gaps.

### Available Fixtures (`tests/e2e/fixtures/`)

| Fixture | Purpose | Import Pattern |
|---------|---------|----------------|
| `accessibility.ts` | axe-core WCAG 2.1 AA testing | `import { test, a11y } from './fixtures/accessibility'` |
| `keyboard-oracle.ts` | Tab order, focus traps, skip links | `import { test, keyboard } from './fixtures/keyboard-oracle'` |
| `chaos-saboteur.ts` | Network failure simulation, resilience | `import { test, chaos } from './fixtures/chaos-saboteur'` |
| `visual-oracle.ts` | CLS measurement, layout shift detection | `import { test, visual } from './fixtures/visual-oracle'` |
| `llm-ux-oracle.ts` | GPT-5.2 multi-lens UX evaluation | `import { test, uxOracle } from './fixtures/llm-ux-oracle'` |
| `stringency-resolver.ts` | Auto-determines test stringency | `import { determineStringency } from './fixtures/stringency-resolver'` |

### Stringency Levels (Auto-Determined)

| Level | Behavior | Triggers |
|-------|----------|----------|
| `strict` | Block any violation | Critical paths: /checkout, /auth, /payment |
| `standard` | Block critical/serious, warn moderate | Default for most pages |
| `relaxed` | Warn only, collect data | New features, /admin routes |

### LLM UX Evaluation Lenses (~$20/month budget)

| Lens | Evaluates |
|------|-----------|
| `first-time-user` | Is purpose clear? Are CTAs obvious? Is there guidance? |
| `accessibility` | Visual a11y beyond automated WCAG checks |
| `mobile-user` | Touch targets (44px min), thumb zones, scroll depth |
| `error-recovery` | Helpful errors, clear recovery paths |
| `cognitive-load` | Too many choices? Overwhelming forms? |

### Chaos Testing Capabilities

```typescript
// Network failure injection (30% failure rate)
await chaos.attachNetworkChaos(0.3, {
  failureTypes: ['error'],
  targetPatterns: ['**/api/**']
});

// Temporary offline simulation
await chaos.simulateOffline(2000); // 2 seconds

// Latency injection
await chaos.injectLatency('**/api/**', 500); // 500ms

// Double-submit idempotency test
const result = await chaos.testDoubleSubmit('button[type="submit"]');
assertNoDuplicateSubmit(result);

// Recovery verification
const recovery = await chaos.checkRecovery('body', 10000);
expect(recovery.recovered).toBe(true);
```

### Sample Test Files

| File | Tests |
|------|-------|
| `tests/e2e/accessibility/wcag-check.spec.ts` | WCAG 2.1 AA compliance, keyboard navigation |
| `tests/e2e/resilience/chaos-testing.spec.ts` | Network failure recovery, idempotency |
| `tests/e2e/ux-evaluation/llm-ux.spec.ts` | LLM-powered UX evaluation |

### CI Workflow

**File:** `.github/workflows/e2e-human-like.yml`

Runs all human-like tests on PR:
- Accessibility (axe-core) - ~1 min
- Keyboard navigation - ~30 sec
- Chaos/resilience - ~2 min
- LLM UX evaluation (if OPENAI_API_KEY set) - ~2 min

### Integration with Evidence Pack

All human-like test results are automatically included in the LEO evidence pack:
- `test_results.attachments.accessibility` - axe-core violations
- `test_results.attachments.chaos` - resilience test results
- `test_results.attachments.llm_ux` - LLM evaluation scores

## EXEC Dual Test Requirement

### ⚠️ MANDATORY: Dual Test Execution

**CRITICAL**: "Smoke tests" means BOTH test types, not just one!

**Evidence**: SD-EXPORT-001 - Tests existed but weren't executed. 30-minute gap between "complete" and validation. SD-EVA-MEETING-002 - 67% E2E failure rate when finally run.

Before creating EXEC→PLAN handoff, EXEC MUST run:

#### 1. Unit Tests (Business Logic Validation)
```bash
cd /mnt/c/_EHG/ehg
npm run test:unit
```
- **What it validates**: Service layer, business logic, data transformations
- **Failure means**: Core functionality is broken
- **Required for**: EXEC→PLAN handoff
- **Framework**: Vitest

#### 2. E2E Tests (UI/Integration Validation)
```bash
cd /mnt/c/_EHG/ehg
npm run test:e2e
```
- **What it validates**: User flows, component rendering, integration
- **Failure means**: User-facing features don't work
- **Required for**: EXEC→PLAN handoff
- **Framework**: Playwright

#### Verification Checklist
- [ ] Unit tests executed: `npm run test:unit`
- [ ] Unit tests passed: [X/X tests]
- [ ] E2E tests executed: `npm run test:e2e`
- [ ] E2E tests passed: [X/X tests]
- [ ] Both test types documented in EXEC→PLAN handoff
- [ ] Screenshots captured for E2E test evidence
- [ ] Test results included in handoff "Deliverables Manifest"

**❌ BLOCKING**: Cannot create EXEC→PLAN handoff without BOTH test types passing.

**Common Mistakes** (from SD-EXPORT-001):
- ❌ "Tests exist" ≠ "Tests passed"
- ❌ Running only E2E tests and claiming "all tests passed"
- ❌ Marking SD complete before running any tests
- ❌ Creating handoff without test evidence documentation
- ✅ Run BOTH unit AND E2E tests explicitly
- ✅ Document pass/fail counts in handoff
- ✅ Include screenshots for visual evidence

### Why This Matters
- **SD-EXPORT-001**: 30-minute gap between marking "complete" and discovering tests weren't run
- **SD-EVA-MEETING-002**: 67% E2E failure rate revealed only when tests finally executed
- **Impact**: Testing enforcement prevents claiming "done" without proof

## ✅ EXEC UI Parity Verification Checklist

**Added in LEO v4.3.3** - MANDATORY before marking implementation complete

### Pre-Completion Checklist

Before marking any backend implementation as complete, verify:

#### 1. Data Contract Mapping
```
For each field in output contract:
  ├── [ ] Field has corresponding UI component
  ├── [ ] Component displays actual value (not derived)
  └── [ ] Component handles loading/error states
```

#### 2. Stage Output Visibility
```
For stage implementations:
  ├── [ ] StageOutputViewer component exists
  ├── [ ] Key findings displayed in list format
  ├── [ ] Recommendations are actionable
  ├── [ ] Score breakdown is visible
  └── [ ] Confidence indicators shown
```

#### 3. User Accessibility
```
For all features:
  ├── [ ] User can navigate to view outputs
  ├── [ ] No hidden data (no "check logs" or "query DB")
  ├── [ ] Loading states indicate progress
  └── [ ] Error states are informative
```

### Integration with Dual Test Requirement

The existing dual test requirement (Unit + E2E) is extended:

| Test Type | Original | With UI Parity |
|-----------|----------|----------------|
| Unit | Backend logic | Backend logic |
| E2E | Feature works | Feature works AND is visible |

**E2E tests MUST now verify:**
1. Feature functionality (existing)
2. Output visibility in UI (NEW)
3. Data displayed matches backend (NEW)

### Handoff Modification

Update implementation handoff to include:
```
UI Parity Status:
- Backend Fields: X
- Fields with UI: Y
- Coverage: Y/X (Z%)
- Missing: [list]
- Gate 2.5 Status: PASS/FAIL
```

## 🔀 SD/Quick-Fix Completion: Commit, Push, Merge

## 🔀 SD/Quick-Fix Completion: Commit, Push, Merge (MANDATORY)

**Every completed Strategic Directive and Quick-Fix MUST end with:**

1. **Commit** - All changes committed with proper message format
2. **Push** - Branch pushed to remote
3. **Merge to Main** - Feature branch merged into main

### For Quick-Fixes

The `complete-quick-fix.js` script handles this automatically:

```bash
node scripts/complete-quick-fix.js QF-YYYYMMDD-NNN --pr-url https://...
```

The script will:
1. Verify tests pass and UAT completed
2. Commit and push changes
3. **Prompt to merge PR to main** (or local merge if no PR)
4. Delete the feature branch

### For Strategic Directives

After LEAD approval, execute the following:

```bash
# 1. Ensure all changes committed
git add .
git commit -m "feat(SD-YYYY-XXX): [description]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 2. Push to remote
git push origin feature/SD-YYYY-XXX

# 3. Create PR if not exists
gh pr create --title "feat(SD-YYYY-XXX): [title]" --body "..."

# 4. Merge PR (preferred method)
gh pr merge --merge --delete-branch

# OR local merge fallback
git checkout main
git pull origin main
git merge --no-ff feature/SD-YYYY-XXX
git push origin main
git branch -d feature/SD-YYYY-XXX
git push origin --delete feature/SD-YYYY-XXX
```

### Merge Checklist

Before merging, verify:
- [ ] All tests passing (unit + E2E)
- [ ] CI/CD pipeline green
- [ ] Code review completed (if required)
- [ ] No merge conflicts
- [ ] SD status = 'archived' OR Quick-Fix status = 'completed'

### Anti-Patterns

❌ **NEVER** leave feature branches unmerged after completion
❌ **NEVER** skip the push step
❌ **NEVER** merge without verifying tests pass
❌ **NEVER** force push to main

### Verification

After merge, confirm:
```bash
git checkout main
git pull origin main
git log --oneline -5  # Should show your merge commit
```

## 🌿 Branch Hygiene Gate (MANDATORY)

## Branch Hygiene Gate (MANDATORY)

**Evidence from Retrospectives**: SD-STAGE4-UX-EDGE-CASES-001 revealed a feature branch with 14 commits, 450 files, and 13 days of divergence became unsalvageable due to accumulated unrelated changes.

### MANDATORY Before PLAN-TO-EXEC Handoff

EXEC MUST verify these branch hygiene requirements BEFORE starting implementation:

### 1. Branch Freshness (≤7 Days Stale)

```bash
# Check days since branch diverged from main
git log main..HEAD --oneline | wc -l  # Should be reasonable
git log --oneline main..HEAD --format="%ar" | tail -1  # Check age
```

**Threshold**: Feature branch must be ≤7 days stale at PLAN-TO-EXEC handoff
**Action**: If exceeded, rebase or merge main before proceeding

### 2. Single-SD Branch Rule (No Mixing)

```bash
# All commits should reference the same SD-ID
git log main..HEAD --oneline | grep -E "SD-[A-Z0-9-]+"
```

**Rule**: One SD per branch - no mixing unrelated work
**Anti-Pattern**: "Kitchen sink" branches that accumulate work from multiple SDs
**Action**: If multiple SDs detected, create separate branches

### 3. Merge Main at Phase Transitions

**At PLAN-TO-EXEC**:
```bash
git fetch origin main
git merge origin/main --no-edit  # Or rebase if preferred
```

**Rule**: Sync with main at each phase transition (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN)
**Benefit**: Catches conflicts early, prevents accumulation

### 4. Maximum Branch Lifetime (14 Days)

| Age | Action |
|-----|--------|
| 0-7 days | ✅ Proceed normally |
| 7-10 days | ⚠️ Warning - sync with main |
| 10-14 days | 🔴 Must sync before any handoff |
| >14 days | ❌ Create fresh branch, cherry-pick changes |

### Branch Health Check Script

```bash
# Quick branch health check
echo "=== Branch Health Check ==="
DIVERGE_COMMIT=$(git merge-base main HEAD)
DAYS_OLD=$(( ( $(date +%s) - $(git log -1 --format=%ct $DIVERGE_COMMIT) ) / 86400 ))
COMMIT_COUNT=$(git rev-list --count main..HEAD 2>/dev/null || echo 0)
FILE_COUNT=$(git diff --name-only main...HEAD 2>/dev/null | wc -l || echo 0)

echo "Days since divergence: $DAYS_OLD"
echo "Commits on branch: $COMMIT_COUNT"
echo "Files changed: $FILE_COUNT"

if [ $DAYS_OLD -gt 7 ]; then
  echo "⚠️ WARNING: Branch is stale (>7 days). Sync with main before EXEC."
fi
if [ $FILE_COUNT -gt 100 ]; then
  echo "⚠️ WARNING: Many files changed (>100). Consider splitting work."
fi
```

### Why This Matters

- **Prevents unsalvageable branches**: 13-day divergence = 450 file conflicts
- **Isolates SD work**: One SD per branch = clean merges and rollbacks
- **Catches conflicts early**: Regular syncing = smaller conflict resolution
- **Maintains velocity**: Fresh branches = fast PRs and reviews

### EXEC Agent Action

When starting implementation:
1. Run branch health check
2. If >7 days stale → merge main first
3. If multiple SDs detected → split branches
4. If >100 files changed → assess scope creep
5. Document branch health in handoff notes

## Auto-Merge Workflow for SD Completion

### Auto-Merge Workflow (RECOMMENDED)

After creating a PR, enable auto-merge to allow Claude to continue to the next SD without waiting:

```bash
# Create PR and enable auto-merge in one step
gh pr create --title "feat(SD-XXX): title" --body "..." --base main
gh pr merge --auto --squash --delete-branch
```

**Benefits**:
- Claude continues to next SD immediately
- Merge happens automatically when CI passes
- No manual intervention required
- Branch auto-deleted after merge

**Requirements for Auto-Merge**:
- Repository must have auto-merge enabled in GitHub settings
- All required status checks must pass
- No merge conflicts with main

**Usage Pattern**:
```bash
# After EXEC phase tests pass:
git add . && git commit -m "feat(SD-XXX): description"
git push origin feat/SD-XXX-branch
gh pr create --title "feat(SD-XXX): title" --body "## Summary..."  --base main
gh pr merge --auto --squash --delete-branch
# Claude immediately continues to next SD
```

## E2E Testing: Dev Mode vs Preview Mode

**E2E Testing Mode**: Default to dev mode (port 5173) for reliable tests.

**Issue**: Preview mode (4173) may have rendering problems
**Solution**: Use dev mode for tests, preview only for production validation
```typescript
baseURL: 'http://localhost:5173'  // Dev mode
```

**Full Guide**: See `docs/reference/e2e-testing-modes.md`

## Working with Child SDs During EXEC

### Child SD Lifecycle

**Children have FULL workflow** (not simplified):
1. LEAD validates child (strategic value, scope, risks)
2. PLAN creates child PRD (detailed requirements)
3. PLAN→EXEC handoff (with validation gates)
4. EXEC implements (full testing required)
5. EXEC→PLAN handoff (verification)
6. Mark child as 'completed'

### Sequential Execution Rules

**Database trigger enforces**:
- Child B cannot start until Child A has `status = 'completed'`
- Attempting to activate out-of-order will fail

**EXEC agent must**:
1. Check dependency status before starting
2. Wait if dependency not complete
3. Document in handoff when dependency cleared

### Progress Tracking

```javascript
// Update child progress as you work
await supabase.from('strategic_directives_v2')
  .update({ progress: 75 })
  .eq('id', 'SD-PARENT-001-A');

// Parent progress auto-calculates
// DO NOT manually set parent progress
```

### Parent Completion

After last child completes:
1. Parent progress auto-updates to 100%
2. Parent status auto-updates to 'completed'
3. (Optional) Create orchestration retrospective

### Common Mistakes

| Mistake | Why Wrong | Fix |
|---------|-----------|-----|
| Starting Child B before Child A done | Violates dependencies | Wait for dependency |
| Setting parent progress manually | Overwrites calculation | Let function calculate |
| Skipping child LEAD | No strategic validation | Full LEAD required |
| Skipping child PRD | No requirements doc | Full PLAN required |

### Why Full Workflow Matters

Each child SD is a strategic directive, not a task:
- **LEAD validates**: Is this child strategically sound?
- **PLAN defines**: What exactly does this child deliver?
- **EXEC implements**: How do we build it?

Skipping phases = skipping essential validation.

> **Team Capabilities**: During EXEC, any agent can spawn specialist teams for cross-domain investigation (e.g., DB + API + Security). See **Teams Protocol** in CLAUDE.md for templates and dynamic agent creation.

## Branch Should Already Exist (LEO v4.4.1)

### Branch Should Already Exist (LEO v4.4.1)

As of LEO v4.4.1, the branch is **automatically created during LEAD-TO-PLAN handoff**:
- The `SD_BRANCH_PREPARATION` gate creates the branch proactively
- By the time EXEC starts, the branch should already exist
- This gate now **validates** the branch rather than creating it

If branch doesn't exist (legacy SDs or manual workflow):
```bash
npm run sd:branch SD-XXX-001    # Creates and switches to branch
```


## Test Coverage Quality Gate (EXEC-TO-PLAN)

**Source**: SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-B (Fixes GAP-002, GAP-004)

**Purpose**: Validates that changed code files have adequate test coverage before returning to PLAN phase for review. Reads `coverage/coverage-summary.json` and evaluates coverage for CHANGED files only (not entire codebase).

### Complexity Thresholds

| SD Type | Threshold | Mode |
|---------|-----------|------|
| feature, bugfix, security | 60% line coverage | **BLOCKING** |
| infrastructure, refactor | 40% line coverage | ADVISORY (warning only) |
| All others | 40% line coverage | ADVISORY |

### What It Checks

1. **Detects changed code files** via `git diff` (supports .js, .ts, .tsx, .jsx, .mjs, .cjs, .py, .rb, .go, .rs, .java, .cs, .php, .sql)
2. **Reads coverage data** from `coverage/coverage-summary.json`
3. **Matches changed files** to coverage entries (handles Windows/Unix path normalization)
4. **Flags zero-coverage files** (changed files with 0% coverage)
5. **Flags below-threshold files** (changed files below the type-specific threshold)

### Auto-Skip Conditions

- No code files changed in the branch
- Coverage summary file does not exist (warns to generate with `npx vitest run --coverage`)
- No changed files match coverage entries (path normalization mismatch warning)

### Remediation

When this gate fails:
1. Run `npx vitest run --coverage` to generate fresh coverage
2. Add tests for flagged zero-coverage files
3. Improve tests for files below the threshold
4. Re-run the EXEC-TO-PLAN handoff

### Implementation

- **File**: `scripts/modules/handoff/executors/exec-to-plan/gates/test-coverage-quality.js`
- **Export**: `createTestCoverageQualityGate(supabase)`
- **Gate Key**: `GATE_TEST_COVERAGE_QUALITY`

## Integration Test Requirement Gate (EXEC-TO-PLAN)

**Source**: SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-E (Fixes GAP-003)

**Purpose**: Ensures complex SDs include integration tests before returning to PLAN phase. Only applies to SDs that meet complexity criteria.

### Complexity Criteria (ANY triggers the gate)

| Criterion | Threshold |
|-----------|-----------|
| Story Points | >= 5 |
| Has Children | SD is a parent with child SDs |
| Modified Modules | >= 3 top-level directories changed |

If no complexity criteria are met, the gate auto-passes.

### Enforcement Modes

| SD Type | Story Points | Mode |
|---------|-------------|------|
| feature, refactor | >= 5 | **BLOCKING** |
| Any other type | Any | ADVISORY (warning only) |
| Any type | < 5 (no other criteria) | Auto-pass |

### What It Checks

1. **Classifies SD complexity** from story_points, child SD presence, and git diff module count
2. **Scans `tests/integration/`** directory for test files (.js, .ts, .mjs, .cjs)
3. **Counts `test(` calls** across all integration test files
4. **Requires > 10 test() calls** to be considered non-trivial

### Security

- Symlinks that escape the repository root are skipped
- Directory traversal is bounded to the repo root

### Remediation

When this gate fails:
1. Create `tests/integration/` directory if it does not exist
2. Add integration test files with meaningful test cases
3. Ensure > 10 `test()` calls across all integration files
4. Re-run the EXEC-TO-PLAN handoff

### Implementation

- **File**: `scripts/modules/handoff/executors/exec-to-plan/gates/integration-test-requirement.js`
- **Export**: `createIntegrationTestRequirementGate(supabase)`
- **Gate Key**: `GATE_INTEGRATION_TEST_REQUIREMENT`

## Triangulated Runtime Audit Protocol

### Purpose
A structured workflow for manually testing the EHG application with AI-assisted diagnosis and remediation planning. Uses Claude Code as the testing guide and triangulates findings across 3 AI models (Claude, ChatGPT, Antigravity) for high-confidence root cause analysis and fix proposals.

### When to Use
- Periodic product health checks
- After major deployments
- When users report multiple issues
- Before major releases
- When you want to "click around" and find what's broken

### Quick Start
Invoke with: `/runtime-audit`

---

### Protocol Phases

#### Phase 1: SETUP
1. Start app: `bash scripts/leo-stack.sh restart`
2. Define context anchor (vision, immutables, pending SDs)
3. Claude enters "testing guide mode"

#### Phase 2: MANUAL TESTING (Claude Guides)
- Claude provides next click step
- You report what you see
- Claude logs issues in structured format
- Claude identifies "nearby failures" to check

**Issue Format:**
```
[Flow]-[##]: One-line description
Route: /path
Severity: Critical | Major | Minor
Notes: expected vs actual
```

**Flow Priority:**
1. `/chairman/*` (Chairman Console)
2. `/ventures/*` (Venture Management)
3. `/eva-assistant`, `/ai-agents` (EVA/Agents)
4. `/analytics/*`, `/reports/*` (Analytics)
5. `/governance`, `/security/*` (Governance)

#### Phase 3: ROOT CAUSE DIAGNOSIS (All 3 Models)
- Claude creates diagnostic prompt from logged issues
- Send SAME prompt to ChatGPT and Antigravity
- Each model investigates independently
- Compare findings to identify consensus vs divergence

#### Phase 4: REMEDIATION PLANNING (All 3 Models)
- Send confirmed root causes to all 3 models
- Each proposes fixes independently
- Triangulate to find best approach
- Decision rules:
  - All agree → High confidence, execute
  - 2 agree → Evaluate trade-offs, Chairman decides
  - Safety concern → Immediate investigation

#### Phase 5: SD CREATION (Claude Executes)
- Follow LEO Protocol orchestrator/child pattern (see `docs/recommendations/child-sd-pattern-for-phased-work.md`)
- Use proper hierarchy fields: `relationship_type`, `parent_sd_id`, `sequence_rank`
- Embed triangulation evidence in metadata
- Reference: `scripts/templates/sd-creation-template.js`

#### Phase 6: EXECUTION
- Execute child SDs in priority order
- Regression test each fix
- Mark complete when done

#### Phase 7: AUDIT RETROSPECTIVE

Immediately after SD creation, generate audit retrospective to capture lessons.

**Trigger:**
```bash
npm run audit:retro -- --file docs/audits/YYYY-MM-DD-audit.md
```

**System Aggregates:**
- All findings with dispositions from `audit_finding_sd_mapping`
- Triangulation consensus data from `audit_triangulation_log`
- Chairman verbatim observations (2x weighting)
- Sub-agent contributions

**RETRO Generates:**
- Process learnings (about the audit itself)
- Divergence insights (where models disagreed)
- Pattern candidates for `issue_patterns` table
- Protocol improvements

**Quality Criteria:**
- 100% triage coverage (all items have disposition)
- >= 3 Chairman verbatim citations
- >= 1 model divergence insight
- All lessons cite evidence (NAV-xx, SD-xx)
- Time constraint: <= 15-20 minutes

**Output:**
- Retrospective record in `retrospectives` (retro_type='AUDIT')
- Contributions in `retrospective_contributions`
- Runtime audit marked 'retro_complete'

---

### Roles

| Model | Role | When Used |
|-------|------|-----------|
| **Claude Code** | Testing Guide + Synthesizer | Throughout |
| **ChatGPT** | Triangulation Partner | Phases 3-4 |
| **Antigravity** | Triangulation Partner | Phases 3-4 |

---

### Templates

#### Context Anchor Template
```markdown
## Context Anchor

### Vision & Immutables
1. EHG is an Autonomous Venture Orchestrator
2. Role/permissions enforced at every action
3. No irreversible action without confirmation + audit trail
4. AI outputs labeled (recommendation vs action vs system-executed)
5. Venture state transitions must be valid and traceable
6. Governance and runtime are separate domains

### Pending SDs
[List any SDs in progress]

### Guardrails
- Don't propose changes that increase technical debt
- Prefer minimal diffs over refactors
```

#### Diagnostic Prompt Template
See: `/runtime-audit` skill for full template

#### Remediation Prompt Template
See: `/runtime-audit` skill for full template

---

### Synthesis Grid Template

| Issue | Claude | ChatGPT | Antigravity | Consensus |
|-------|--------|---------|-------------|-----------|
| A-01 | [finding] | [finding] | [finding] | HIGH/MED/LOW |

---

### Decision Rules

| Scenario | Action |
|----------|--------|
| All 3 models agree on root cause + fix | Execute with high confidence |
| 2 models agree, 1 differs | Evaluate trade-offs, Chairman decides |
| All 3 differ significantly | More investigation needed |
| Single model flags safety/permission issue | Immediate investigation (don't wait) |
| Divergent fixes are complementary (A+B) | Take union of both approaches |
| Divergent fixes are contradictory (A vs B) | Chairman decides based on vision |

---

### Checklist

**Before Starting:**
- [ ] App running on localhost:8080
- [ ] Logged in with correct role
- [ ] Context anchor defined
- [ ] ChatGPT session ready
- [ ] Antigravity session ready

**During Testing:**
- [ ] Issues logged with ID, route, severity
- [ ] Nearby failures identified
- [ ] Console errors captured

**After Testing:**
- [ ] Diagnostic prompt sent to all models
- [ ] Root causes triangulated
- [ ] Remediation triangulated
- [ ] SDs created with evidence

**After SD Creation (Phase 7):**
- [ ] Audit findings ingested (`npm run audit:ingest`)
- [ ] All items triaged (100% coverage)
- [ ] Audit retrospective generated (`npm run audit:retro`)
- [ ] Quality score >= 70
- [ ] Action items assigned

---

### Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| Issue Log | Inline or TEST_LOG.md | Track findings |
| Diagnostic Prompt | Generated by Claude | Send to partners |
| Synthesis Grid | Inline | Compare findings |
| SD Script | scripts/create-sd-runtime-audit-*.mjs | Create SDs |
| Strategic Directives | Database | Track fixes |
| Audit Mappings | audit_finding_sd_mapping | Track all findings |
| Audit Retrospective | retrospectives (type=AUDIT) | Capture learnings |
| Triangulation Log | audit_triangulation_log | Model consensus |

---

### Related Skills
- `baseline-testing` - Establishing test baselines
- `e2e-ui-verification` - Verifying UI before testing
- `codebase-search` - Finding code references
- `schema-design` - Database schema issues


## Playwright MCP Integration

## 🎭 Playwright MCP Integration

**Status**: ✅ READY (Installed 2025-10-12)

### Overview
Playwright MCP (Model Context Protocol) provides browser automation capabilities for testing, scraping, and UI verification.

### Installed Components
- **Chrome**: Google Chrome browser for MCP operations
- **Chromium**: Chromium 141.0.7390.37 (build 1194) for standard Playwright tests
- **Chromium Headless Shell**: Headless browser for CI/CD pipelines
- **System Dependencies**: All required Linux libraries installed

### Available MCP Tools

#### Navigation
- `mcp__playwright__browser_navigate` - Navigate to URL
- `mcp__playwright__browser_navigate_back` - Go back to previous page

#### Interaction
- `mcp__playwright__browser_click` - Click elements
- `mcp__playwright__browser_fill` - Fill form fields
- `mcp__playwright__browser_select` - Select dropdown options
- `mcp__playwright__browser_hover` - Hover over elements
- `mcp__playwright__browser_type` - Type text into elements

#### Verification
- `mcp__playwright__browser_snapshot` - Capture accessibility snapshot
- `mcp__playwright__browser_take_screenshot` - Take screenshots
- `mcp__playwright__browser_evaluate` - Execute JavaScript

#### Management
- `mcp__playwright__browser_close` - Close browser
- `mcp__playwright__browser_tabs` - Manage tabs

### Testing Integration

**When to Use Playwright MCP**:
1. ✅ Visual regression testing
2. ✅ UI component verification
3. ✅ Screenshot capture for evidence
4. ✅ Accessibility tree validation
5. ✅ Cross-browser testing

**When to Use Standard Playwright**:
1. ✅ E2E test suites (`npm run test:e2e`)
2. ✅ CI/CD pipeline tests
3. ✅ Automated test runs
4. ✅ User story validation

### Usage Example

```javascript
// Using Playwright MCP for visual verification
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/dashboard' });
await mcp__playwright__browser_snapshot(); // Get accessibility tree
await mcp__playwright__browser_take_screenshot({ name: 'dashboard-state' });
await mcp__playwright__browser_click({ element: 'Submit button', ref: 'e5' });
```

### QA Director Integration

The QA Engineering Director sub-agent now has access to:
- Playwright MCP for visual testing
- Standard Playwright for E2E automation
- Both Chrome (MCP) and Chromium (tests) browsers

**Complete Guide**: See `docs/reference/playwright-mcp-guide.md`

## Edge Case Testing Checklist

When implementing tests, ensure coverage for:

### Input Validation Edge Cases
- [ ] Empty strings, null values, undefined
- [ ] Maximum length inputs (overflow testing)
- [ ] Special characters (SQL injection, XSS vectors)
- [ ] Unicode and emoji inputs
- [ ] Whitespace-only inputs

### Boundary Conditions
- [ ] Zero, negative, and maximum numeric values
- [ ] Array min/max lengths (empty, single item, very large)
- [ ] Date boundaries (leap years, timezone edge cases)

### Concurrent Operations
- [ ] Race conditions (simultaneous updates)
- [ ] Database transaction rollbacks
- [ ] Cache invalidation timing

### Error Scenarios
- [ ] Network failures (timeout, disconnect)
- [ ] Database connection errors
- [ ] Invalid authentication tokens
- [ ] Permission denied scenarios

### State Transitions
- [ ] Idempotency (repeated operations)
- [ ] State rollback on error
- [ ] Partial success scenarios

## Vision V2 Implementation Requirements (SD-VISION-V2-*)

### MANDATORY: Vision Spec Consultation Before Implementation

**For ALL implementations of SDs matching `SD-VISION-V2-*`:**

Before writing any code, you MUST:

1. **Query SD metadata for vision spec references**
2. **Read ALL files listed in `must_read_before_exec`**
3. **Follow patterns and structures defined in specs**

### Implementation Requirements for Vision V2

| Requirement | Description |
|-------------|-------------|
| **Spec Compliance** | Code MUST match spec definitions exactly (table names, column types, API shapes) |
| **25-Stage Insulation** | CEO Runtime MUST be OBSERVER-COMMITTER only - no direct venture_stage_work writes |
| **Glass Cockpit Design** | UI MUST follow progressive disclosure, minimal chrome philosophy |
| **Token Budget Enforcement** | All agent operations MUST respect venture token budgets |

### CREATE_FROM_NEW Policy

All Vision V2 SDs have this implementation guidance:
- **REVIEW** all vision files before implementation
- **CREATE FROM NEW** - similar files may exist to learn from, but implement fresh
- **DO NOT MODIFY** existing files - create new implementations per vision specs

### 25-Stage Insulation Checklist (SD-VISION-V2-005 CRITICAL)

**Before marking SD-VISION-V2-005 complete:**

- [ ] Zero direct INSERT/UPDATE/DELETE on `venture_stage_work`
- [ ] All stage transitions via `fn_advance_venture_stage()` only
- [ ] Gate types (auto/advisory/hard) respected
- [ ] E2E test verifies no direct writes to stage tables
- [ ] No new columns added to existing stage tables

## Database Schema Constraints Reference

**CRITICAL**: These constraints are enforced by the database. Agents MUST use valid values to avoid insert failures.

### leo_handoff_executions

| Column | Valid Values | Hint |
|--------|--------------|------|
| `status` | pending, accepted, rejected, failed | Use one of: pending, accepted, rejected, failed |
| `validation_score` | N/A | Validation score must be an integer between 0 and 100. Use Math.round() and clamp to 0-100. |

### leo_protocols

| Column | Valid Values | Hint |
|--------|--------------|------|
| `status` | active, superseded, draft, deprecated | Use one of: active, superseded, draft, deprecated. Only ONE protocol can be "active" at a time. |

### product_requirements_v2

| Column | Valid Values | Hint |
|--------|--------------|------|
| `status` | draft, planning, in_progress, testing, approved, completed, archived | Use one of: draft, planning, in_progress, testing, approved, completed, archived |

### sd_backlog_map

| Column | Valid Values | Hint |
|--------|--------------|------|
| `item_type` | epic, story, task | Use one of: epic, story, task |
| `verification_status` | not_run, failing, passing | Use one of: not_run, failing, passing |

### sd_phase_handoffs

| Column | Valid Values | Hint |
|--------|--------------|------|
| `from_phase` | LEAD, PLAN, EXEC | Use one of: LEAD, PLAN, EXEC (uppercase) |
| `to_phase` | LEAD, PLAN, EXEC | Use one of: LEAD, PLAN, EXEC (uppercase) |
| `status` | pending_acceptance, accepted, rejected | Use one of: pending_acceptance, accepted, rejected |

### sd_scope_deliverables

| Column | Valid Values | Hint |
|--------|--------------|------|
| `completion_status` | pending, in_progress, completed, blocked, cancelled | Use one of: pending, in_progress, completed, blocked, cancelled |

### strategic_directives_v2

| Column | Valid Values | Hint |
|--------|--------------|------|
| `status` | draft, lead_review, plan_active, exec_active, completed, on_hold, cancelled | Use one of: draft, lead_review, plan_active, exec_active, completed, on_hold, cancelled |
| `priority` | critical, high, medium, low | Use one of: critical, high, medium, low |

### sub_agent_execution_results

| Column | Valid Values | Hint |
|--------|--------------|------|
| `status` | pending, running, completed, failed, skipped | Use one of: pending, running, completed, failed, skipped |

### user_stories

| Column | Valid Values | Hint |
|--------|--------------|------|
| `status` | draft, completed, in_progress, ready | Use one of: draft, completed, in_progress, ready. NOT "approved" - that is not a valid value. |
| `validation_status` | pending, in_progress, validated, failed, skipped | Use one of: pending, in_progress, validated, failed, skipped |
| `e2e_test_status` | not_created, created, passing, failing, skipped | Use one of: not_created, created, passing, failing, skipped |



## LEO Process Scripts Reference

**Usage**: All scripts use positional arguments unless noted otherwise.

### Generation Scripts

#### generate-claude-md-from-db.js
Generates modular CLAUDE files (CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md) from database tables.

**Usage**: `node scripts/generate-claude-md-from-db.js`

**Examples**:
- `node scripts/generate-claude-md-from-db.js`

**Common Errors**:
- Pattern: `No active protocol found` -> Fix: Ensure one protocol has status=active in leo_protocols table

### Handoff Scripts

#### unified-handoff-system.js
Unified LEO Protocol handoff execution system. Handles all handoff types with database-driven templates and validation.

**Usage**: `node scripts/unified-handoff-system.js <command> [TYPE] [SD-ID] [PRD-ID]`

**Examples**:
- `node scripts/unified-handoff-system.js execute LEAD-TO-PLAN SD-IDEATION-STAGE1-001`
- `node scripts/unified-handoff-system.js execute PLAN-TO-EXEC SD-IDEATION-STAGE1-001 PRD-IDEATION-001`
- `node scripts/unified-handoff-system.js list SD-IDEATION-STAGE1-001`
- `node scripts/unified-handoff-system.js stats`

**Common Errors**:
- Pattern: `--type.*not recognized` -> Fix: Use positional: execute TYPE SD-ID, not --type TYPE
- Pattern: `Strategic Directive.*not found` -> Fix: Create SD first using LEO Protocol dashboard or create-strategic-directive.js

### Migration Scripts

#### run-sql-migration.js
Executes SQL migration files against the database. Handles statement splitting and error reporting.

**Usage**: `node scripts/run-sql-migration.js <migration-file-path>`

**Examples**:
- `node scripts/run-sql-migration.js database/migrations/20251127_leo_v432.sql`

**Common Errors**:
- Pattern: `relation .* does not exist` -> Fix: Check table names and run migrations in order

### Prd Scripts

#### add-prd-to-database.js
Adds a Product Requirements Document to the database with proper schema validation.

**Usage**: `node scripts/add-prd-to-database.js --sd-id <SD-ID> --title <title> [options]`

**Examples**:
- `node scripts/add-prd-to-database.js --sd-id SD-IDEATION-STAGE1-001 --title "Stage 1 Implementation"`

### Utility Scripts

#### insert-leo-v431-protocol.js
Inserts a new LEO protocol version and copies sections from previous version.

**Usage**: `node scripts/insert-leo-v431-protocol.js`

**Examples**:
- `node scripts/insert-leo-v431-protocol.js`

**Common Errors**:
- Pattern: `violates check constraint.*status` -> Fix: Use valid status: active, superseded, draft, deprecated

### Validation Scripts

#### check-leo-version.js
Verifies version consistency between CLAUDE*.md files and database. Use --fix to auto-regenerate.

**Usage**: `node scripts/check-leo-version.js [--fix]`

**Examples**:
- `node scripts/check-leo-version.js`
- `node scripts/check-leo-version.js --fix`

**Common Errors**:
- Pattern: `No active protocol found` -> Fix: Ensure leo_protocols has exactly one active record

#### verify-handoff-plan-to-exec.js
Verifies PLAN to EXEC handoff requirements including PRD completeness and sub-agent validations.

**Usage**: `node scripts/verify-handoff-plan-to-exec.js <SD-ID> [PRD-ID]`

**Examples**:
- `node scripts/verify-handoff-plan-to-exec.js SD-IDEATION-STAGE1-001`

#### verify-handoff-lead-to-plan.js
Verifies LEAD to PLAN handoff requirements are met before allowing transition.

**Usage**: `node scripts/verify-handoff-lead-to-plan.js <SD-ID>`

**Examples**:
- `node scripts/verify-handoff-lead-to-plan.js SD-IDEATION-STAGE1-001`



---

*Generated from database: 2026-02-12*
*Protocol Version: 4.3.3*
*Load when: User mentions EXEC, implementation, coding, or testing*

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
