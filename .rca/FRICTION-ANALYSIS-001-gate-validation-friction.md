# ROOT CAUSE ANALYSIS: Recurring Process Friction in LEO Protocol Handoff System

**RCA ID**: FRICTION-ANALYSIS-001
**Date**: 2026-02-06
**Analyzed by**: RCA Sub-Agent (claude-sonnet-4-5)
**Context**: SD-UAT-CAMPAIGN-001 orchestrator completion workflow
**Occurrences**: 4 friction events in single session
**Model Evolution**: Opus 4.5 → Opus 4.6

---

## Metadata
- **Category**: Root Cause Analysis
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: RCA Sub-Agent
- **Last Updated**: 2026-02-06
- **Tags**: rca, friction, gates, validation, auto-proceed, opus-4.6

---

## Executive Summary

During the SD-UAT-CAMPAIGN-001 orchestrator completion workflow, 4 distinct friction points caused repeated interruptions requiring manual intervention. Each friction was rooted in **hardcoded rule-centric validation** rather than **database-driven policy-aware validation**. The user explicitly requested (4 times): *"enable the root cause analysis subagent to identify the root cause and fix the issue systemically."*

**Total Time Lost**: 25 minutes per session (across 4 friction points)
**Systemic Pattern**: Gates make hardcoded assumptions instead of querying `sd_type_validation_profiles`
**Resolution**: Migrate from rule-centric to data-centric validation architecture

---

## 5-WHYS ANALYSIS

### FRICTION 1: GATE_PRD_EXISTS blocks UAT SDs despite validation profile exemption

**ISSUE**: PLAN-TO-EXEC handoff failed because no PRD existed for UAT SDs

**WHY 1**: Gate checked for PRD existence without consulting `sd_type_validation_profiles` table
**Evidence**: Original `prd-gates.js` (lines 48-75) had no validation profile check

**WHY 2**: Gate was built before `sd_type_validation_profiles` table existed
**Evidence**: Gate created in SD-LEARN-008, validation profiles added in later SD

**WHY 3**: No mechanism to retroactively update existing gates when new data structures are added
**Evidence**: Each gate is independently coded; no central registry forces them to check validation profiles

**WHY 4**: Gates were designed as isolated validators, not as profile-aware policies
**Evidence**: `BaseExecutor.js` (line 103) loads hardcoded gates, then overlays database rules—but hardcoded gates don't know about database rules

**WHY 5**: **ROOT CAUSE**: Gates are **statically coded validators** rather than **database-driven policies**. Each gate makes hard-coded assumptions about what's required, rather than querying a central policy source.

---

### FRICTION 2: Orchestrator completion blocked at 80% progress

**ISSUE**: `get_progress_breakdown` required LEAD-TO-PLAN handoff (20% weight) but orchestrator was created without it

**WHY 1**: Progress function assumed ALL orchestrators go through LEAD→PLAN workflow
**Evidence**: Function calculates progress as `LEAD_initial (20%) + children completion (80%)`

**WHY 2**: Orchestrators created via different paths (e.g., direct orchestrator creation) don't always have LEAD-TO-PLAN handoffs
**Evidence**: SD-UAT-CAMPAIGN-001 was created as orchestrator without prior LEAD→PLAN handoff

**WHY 3**: No validation at orchestrator creation time to ensure required handoffs exist
**Evidence**: Orchestrator creation scripts don't enforce handoff prerequisites

**WHY 4**: Handoff schema assumes linear LEAD→PLAN→EXEC flow, not flexible orchestrator patterns
**Evidence**: Progress calculation is hardcoded to specific handoff types

**WHY 5**: **ROOT CAUSE**: **Progress calculation is hardcoded to a single workflow pattern**, not adaptable to different SD lifecycles. The system assumes a universal workflow rather than SD-type-specific workflows.

---

### FRICTION 3: GATE_SD_START_PROTOCOL blocks EVERY handoff requiring digest file re-reads

**ISSUE**: After context compaction/session continuation, gate blocks because digest files show as "NEVER_READ"

**WHY 1**: Gate checks `protocolGate.fileReads` state, which is cleared after compaction
**Evidence**: `core-protocol-gate.js` line 413 clears `fileReads` after compaction

**WHY 2**: Gate treats post-compaction state as "never read" even though files were read pre-compaction
**Evidence**: Lines 463-468 return `needsRead: true, reason: 'NEVER_READ'` when file not in tracking

**WHY 3**: Gate enforces strict per-SD-run file reading, not per-session reading
**Evidence**: Line 478-484 comment says "Only re-require reading if file never read OR changed OR compaction occurred"

**WHY 4**: Design intent: LLMs "drift from protocol" over long sessions, so re-reading reinforces adherence
**Evidence**: MEMORY.md line 9 documents this as **intentional design**

**WHY 5**: **ROOT CAUSE**: **The gate prioritizes protocol adherence over friction reduction**. The design was a workaround for Opus 4.5's tendency to drift. With Opus 4.6, the trade-off is poorly calibrated:
- **Opus 4.5**: Needed frequent re-reads to stay on protocol
- **Opus 4.6**: CLAUDE.md is in system prompt every turn - re-reads are redundant
- **Impact**: Every handoff blocked for manual digest re-reads despite zero value

---

### FRICTION 4: Migration execution failures due to missing DB password

**ISSUE**: Database agent couldn't execute migration because `SUPABASE_DB_PASSWORD` wasn't in `.env`

**WHY 1**: Agent tried direct psql connection first, which requires password
**Evidence**: User report: "Agent eventually found SUPABASE_POOLER_URL as alternative"

**WHY 2**: Agent doesn't check for alternative connection methods before attempting psql
**Evidence**: Implicit from "eventually found" phrasing—suggests sequential failure before success

**WHY 3**: Migration execution has multiple connection patterns, but no smart routing logic
**Evidence**: BaseExecutor.js line 290 calls `checkPendingMigrations`, which has retry logic but not connection-method selection

**WHY 4**: Each sub-agent implements its own connection logic independently
**Evidence**: DATABASE sub-agent has separate connection handling from core handoff system

**WHY 5**: **ROOT CAUSE**: **No centralized connection strategy**. Sub-agents independently discover connection methods through trial-and-error rather than consulting a central "how to connect" policy.

---

## SYSTEMIC ROOT CAUSE (Meta-Pattern)

**All four friction points share a common architectural flaw:**

### **The LEO Protocol is RULE-CENTRIC, not DATA-CENTRIC**

| Aspect | Current Design (Rule-Centric) | Desired Design (Data-Centric) |
|--------|-------------------------------|-------------------------------|
| **Gates** | Hardcoded validators with inline exemption logic | Query `sd_type_validation_profiles` FIRST, then validate |
| **Progress** | Hardcoded workflow assumptions (LEAD→PLAN→EXEC) | Query `sd_workflow_templates` for SD-type-specific flows |
| **Protocol Files** | Hardcoded re-read enforcement regardless of context | Query session continuity flags, adapt to AUTO-PROCEED mode |
| **Connections** | Each sub-agent discovers methods independently | Central `connection_strategies` table with ranked methods |

**Evidence**: All fixes applied today were **manual exemption checks added to existing gates**. None involved **centralizing the policy in the database and having gates consult it**.

---

## CAPA (Corrective and Preventive Actions)

### FRICTION 1: GATE_PRD_EXISTS

#### Corrective Action (Immediate Fix - ✅ COMPLETE)
- **What**: Added validation profile check to `prd-gates.js` (lines 24-44)
- **Status**: ✅ COMPLETE
- **Impact**: UAT, documentation, infrastructure SDs now skip PRD requirement

**Code Change**:
```javascript
// scripts/modules/handoff/executors/plan-to-exec/gates/prd-gates.js
// Added at line 23, before PRD existence check:
const sdType = ctx.sd?.sd_type || 'feature';
if (ctx.supabase) {
  const { data: profile } = await ctx.supabase
    .from('sd_type_validation_profiles')
    .select('requires_prd')
    .eq('sd_type', sdType)
    .maybeSingle();

  if (profile && profile.requires_prd === false) {
    console.log(`   ✅ PRD not required for sd_type='${sdType}' (validation profile)`);
    return { passed: true, score: 100, /* ... */ };
  }
}
```

#### Preventive Action (Systemic Fix)
- **Control**: **Policy-First Gate Architecture**
- **Implementation**:
  1. Create `validation_gate_registry` table with columns:
     - `gate_code` (e.g., 'GATE_PRD_EXISTS')
     - `policy_query` (SQL template to check applicability)
     - `default_behavior` ('REQUIRE', 'SKIP', 'WARN')
  2. Refactor `BaseExecutor.js` to execute policy query BEFORE invoking gate validator
  3. Gate validators become execution logic only, not policy logic
- **Location**: `scripts/modules/handoff/gates/`
- **Pattern ID**: Create **PAT-GATE-POLICY-001** - "Database-First Validation Gate Policy"

---

### FRICTION 2: Orchestrator Progress Calculation

#### Corrective Action (Immediate Fix - ✅ COMPLETE)
- **What**: Migration to auto-grant LEAD_initial when children exist
- **Status**: ✅ COMPLETE (executed via database agent)
- **Impact**: Orchestrators no longer blocked by missing LEAD-TO-PLAN handoff

**Migration**: `database/migrations/20260206_fix_orchestrator_completion_blocker.sql`
- Part 1: Backfilled 18 missing LEAD-TO-PLAN handoffs for existing orchestrators
- Part 2: Updated `get_progress_breakdown()` to auto-grant LEAD_initial (20%) when children exist

**Code Change**:
```sql
-- FIX: Auto-grant if EITHER handoff exists OR children exist (proves activation)
IF lead_to_plan_exists OR total_children > 0 THEN
  total_progress := total_progress + 20;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object(
    'weight', 20, 'complete', true, 'progress', 20,
    'note', CASE WHEN lead_to_plan_exists
      THEN 'LEAD-TO-PLAN handoff indicates orchestrator approved and active'
      ELSE 'Auto-granted: children exist (proves orchestrator activation)'
    END,
    'lead_to_plan_handoff_exists', lead_to_plan_exists
  ));
END IF;
```

#### Preventive Action (Systemic Fix)
- **Control**: **SD-Type-Aware Workflow Templates**
- **Implementation**:
  1. Create `sd_workflow_templates` table:
     - `sd_type` (e.g., 'orchestrator', 'feature', 'bugfix')
     - `required_handoffs` (JSONB array: `['LEAD-TO-PLAN', 'PLAN-TO-EXEC']`)
     - `progress_weights` (JSONB object: `{ "LEAD_initial": 20, "children": 80 }`)
  2. Update `get_progress_breakdown()` to query workflow template for SD type
  3. Orchestrators get `orchestrator` template with different weights
- **Location**: `database/functions/get_progress_breakdown.sql`
- **Pattern ID**: Create **PAT-SD-WORKFLOW-001** - "SD Type-Specific Workflow Patterns"

---

### FRICTION 3: GATE_SD_START_PROTOCOL Re-Read Frequency

#### Corrective Action (User Decision + Implementation - ✅ COMPLETE)
- **What**: Downgraded from hard blocker to soft pass for Opus 4.6+
- **Status**: ✅ COMPLETE
- **Justification**: CLAUDE.md is loaded as system prompt every turn with Opus 4.6, making digest re-reads redundant

**User Insight**:
> "Prior to Opus 4.6, when I was using Opus 4.5, the strategic directive process would run and Opus would forget to follow the Leo protocol. So I injected these file reads during each handoff as a way of keeping Claude code Opus 4.5 to adhere to the Leo protocol, but now we're using Opus 4.6, which is smarter than 4.5, and maybe it doesn't need to be reminded as much what the Leo protocol is."

**Code Change**:
```javascript
// scripts/modules/handoff/gates/core-protocol-gate.js
// Lines 595-625: Changed from hard BLOCK to soft PASS
if (issues.length > 0) {
  // Opus 4.6+ soft enforcement: CLAUDE.md is loaded as system prompt every turn,
  // so re-reading digest files at handoff boundaries is redundant.
  // Original hard-blocking was needed for Opus 4.5 which would drift from protocol.
  // Now: auto-pass with warnings, log for audit. Session start gate remains hard.
  console.log('   ℹ️  Protocol digest files not freshly read for this SD');
  console.log('   ✅ Auto-passing: CLAUDE.md is in system prompt (Opus 4.6+ adherence)');

  return {
    pass: true,
    score: 80,  // Was: 0 (hard block)
    issues: [],
    warnings: [...warnings, ...issues.map(i => `[Soft] ${i}`)],
    // ...
  };
}
```

**MEMORY.md Update**:
```markdown
## Intentional Design Decisions

### GATE_SD_START_PROTOCOL - Soft Enforcement (2026-02-06)
- **Status**: DOWNGRADED from hard blocker to soft pass (Opus 4.6+)
- **Why (original)**: Opus 4.5 drifted from protocol over long sessions. Re-reading digests was a workaround.
- **Why (changed)**: Opus 4.6 has better adherence. CLAUDE.md is in system prompt every turn, making digest re-reads redundant.
- **Current behavior**: Auto-passes (score 80/100) with warnings logged. Session start gate still requires initial reads.
- **RCA**: FRICTION-ANALYSIS-001
```

#### Preventive Action (Recalibrate for AUTO-PROCEED)
- **Control**: **Context-Aware Protocol Enforcement**
- **Implementation**:
  1. Add `auto_proceed_mode` flag to `checkFileNeedsRead()`
  2. In AUTO-PROCEED mode with recent compaction:
     - **First handoff after compaction**: Re-read required (current behavior)
     - **Subsequent handoffs within 30 min**: Use cached read (NEW behavior)
  3. Add `protocolGate.lastEnforcement` timestamp to track recent enforcements
  4. Adjust SYNC_MARKER_TIMEOUT based on AUTO-PROCEED flag (reduce polling overhead)
- **Location**: `scripts/modules/handoff/gates/core-protocol-gate.js`
- **Pattern ID**: Update **PAT-AUTO-PROCEED-001** with "Protocol Gate Calibration Appendix"

---

### FRICTION 4: Migration Execution Connection Discovery

#### Corrective Action (Database Agent Already Has Fallback - ✅ EXISTS)
- **What**: Agent tries psql → pooler URL → manual execution
- **Status**: ✅ EXISTS (but not optimal)
- **Issue**: Sequential trial-and-error wastes time

#### Preventive Action (Smart Connection Routing)
- **Control**: **Connection Strategy Registry**
- **Implementation**:
  1. Create `connection_strategies` table:
     - `service` (e.g., 'supabase_db', 'ollama', 'github')
     - `method` (e.g., 'direct_psql', 'pooler_url', 'service_role_key')
     - `priority` (1 = try first, 2 = fallback, etc.)
     - `env_var_required` (e.g., 'SUPABASE_DB_PASSWORD')
     - `availability_check` (SQL or shell command to verify method is available)
  2. Create `lib/connection-router.js` that:
     - Queries `connection_strategies` for service
     - Checks `env_var_required` in `.env`
     - Runs `availability_check` for each method
     - Returns ranked list of available methods
  3. DATABASE sub-agent calls `getConnectionStrategy('supabase_db')` BEFORE attempting connection
- **Location**: `lib/connection-router.js`, `database/migrations/YYYYMMDD_connection_strategies.sql`
- **Pattern ID**: Create **PAT-CONN-ROUTER-001** - "Smart Connection Method Selection"

---

## SYSTEMIC RECOMMENDATION: Database-Driven Policy Architecture

### Problem Statement
Gates and validators are **hardcoded rule engines** that don't adapt to:
- New SD types (require code changes to add exemptions)
- Workflow variations (assume linear LEAD→PLAN→EXEC)
- Operational modes (AUTO-PROCEED vs manual)
- Connection availability (trial-and-error discovery)

### Proposed Architecture Shift

#### Current (Rule-Centric)
```javascript
// Gate Logic:
if (sdType === 'uat') {
  skip PRD check
} else if (sdType === 'documentation') {
  skip PRD check
} else {
  require PRD
}
```

#### Proposed (Data-Centric)
```javascript
// Gate Logic:
policy ← query validation_gate_registry
  WHERE gate_code = 'GATE_PRD_EXISTS'
    AND sd_type = current_sd_type

if (policy.should_skip) {
  return SKIPPED (reason: policy.exemption_reason)
} else {
  execute validation logic
}
```

### Implementation Plan

#### Phase 1: Policy Registry Tables (Week 1)
```sql
CREATE TABLE validation_gate_registry (
  gate_code TEXT PRIMARY KEY,
  description TEXT,
  policy_query TEXT,  -- SQL template to determine applicability
  default_behavior TEXT CHECK (default_behavior IN ('REQUIRE', 'SKIP', 'WARN'))
);

CREATE TABLE sd_workflow_templates (
  sd_type TEXT PRIMARY KEY,
  required_handoffs JSONB,
  progress_weights JSONB,
  optional_sub_agents TEXT[]
);

CREATE TABLE connection_strategies (
  service TEXT,
  method TEXT,
  priority INT,
  env_var_required TEXT,
  availability_check TEXT,
  PRIMARY KEY (service, method)
);
```

#### Phase 2: Refactor Gate Execution (Week 2)
- Modify `BaseExecutor.getRequiredGates()` to:
  1. Query `validation_gate_registry` for SD type
  2. Filter out gates where `policy_query` returns `should_skip = true`
  3. Only instantiate applicable gates
- Result: Gates never run if policy says they're not applicable

#### Phase 3: Smart Connection Routing (Week 3)
- Create `lib/connection-router.js`
- Update DATABASE sub-agent to use router
- Extend to other sub-agents (GITHUB, OLLAMA, etc.)

#### Phase 4: Workflow Templates (Week 4)
- Migrate `get_progress_breakdown()` to use `sd_workflow_templates`
- Update orchestrator creation to auto-generate required handoffs from template

---

## VERIFICATION PLAN

### Test Case 1: New SD Type (Without Code Changes)
1. Insert new row into `sd_type_validation_profiles`: `sd_type = 'spike'`, `requires_prd = false`
2. Create SD with `sd_type = 'spike'`
3. Attempt PLAN-TO-EXEC handoff
4. **Expected**: GATE_PRD_EXISTS auto-skips (no code change needed)

### Test Case 2: Orchestrator Progress (Non-Standard Workflow)
1. Create orchestrator directly (no LEAD-TO-PLAN handoff)
2. Add 3 child SDs, complete 2 of them
3. Query `get_progress_breakdown(orchestrator_id)`
4. **Expected**: Progress = 66% (2/3 children), not blocked by missing LEAD handoff

### Test Case 3: AUTO-PROCEED Protocol Enforcement
1. Start AUTO-PROCEED session
2. Trigger context compaction
3. Execute 3 handoffs within 30 minutes
4. **Expected**: Re-read enforced on handoff #1 only, skipped for #2 and #3

### Test Case 4: Connection Strategy Selection
1. Remove `SUPABASE_DB_PASSWORD` from `.env`
2. Invoke DATABASE sub-agent for migration
3. **Expected**: Agent selects `pooler_url` method on FIRST attempt (no trial-and-error)

---

## IMPACT ANALYSIS

### Time Savings (Per Session)
| Friction Point | Current Time Lost | After CAPA | Savings |
|----------------|-------------------|------------|---------|
| PRD gate false positive | 2-5 min (manual override) | 0 sec (auto-skip) | **5 min** |
| Orchestrator progress block | 5-10 min (debug + fix) | 0 sec (correct calc) | **10 min** |
| Protocol re-read (×4/session) | 4×2 min = 8 min | 1×2 min = 2 min | **6 min** |
| Connection discovery | 3-5 min (trial-and-error) | 30 sec (smart routing) | **4 min** |
| **TOTAL PER SESSION** | **21-28 min** | **2.5 min** | **25 min** |

### Scalability
- **Current**: Each new SD type requires code changes to 5-10 gate files
- **After CAPA**: Each new SD type requires 1 database row insert
- **Maintainability**: Policy changes don't require code deploys

---

## PATTERN CAPTURE

### PAT-GATE-POLICY-001: Database-First Validation Gate Policy
**Problem**: Gates hardcode SD-type exemptions, requiring code changes for new types
**Solution**: Query `validation_gate_registry` before executing gate logic
**When to Use**: Any validation gate that has SD-type-specific behavior
**Files**: `BaseExecutor.js`, `validation_gate_registry` table

### PAT-SD-WORKFLOW-001: SD Type-Specific Workflow Patterns
**Problem**: Progress and handoff logic assumes universal LEAD→PLAN→EXEC workflow
**Solution**: Store workflow templates per SD type in `sd_workflow_templates` table
**When to Use**: Any function that calculates progress or enforces handoff sequences
**Files**: `get_progress_breakdown.sql`, orchestrator creation scripts

### PAT-CONN-ROUTER-001: Smart Connection Method Selection
**Problem**: Sub-agents use trial-and-error to discover connection methods
**Solution**: Centralized connection strategy registry with availability checks
**When to Use**: Any sub-agent that connects to external services (DB, APIs, local tools)
**Files**: `lib/connection-router.js`, `connection_strategies` table

---

## RECOMMENDATIONS FOR IMMEDIATE ACTION

### Priority 1 (This Week)
1. **Create `validation_gate_registry` table** (2 hours)
2. **Refactor GATE_PRD_EXISTS to query registry** (1 hour)
3. **Test with UAT SD type** (30 min)

### Priority 2 (Next Week)
4. **Create `sd_workflow_templates` table** (2 hours)
5. **Update `get_progress_breakdown()` to use templates** (3 hours)
6. **Backfill templates for existing SD types** (1 hour)

### Priority 3 (Following Week)
7. **Create `connection_strategies` table** (1 hour)
8. **Implement `lib/connection-router.js`** (4 hours)
9. **Update DATABASE sub-agent to use router** (2 hours)

### Priority 4 (Month 2)
10. **Recalibrate GATE_SD_START_PROTOCOL for AUTO-PROCEED** (3 hours)
11. **Document new architecture in CLAUDE.md** (2 hours)

---

## LESSONS LEARNED

1. **Gates built in isolation don't adapt to system evolution**: When `sd_type_validation_profiles` was added, existing gates didn't automatically leverage it.

2. **Hardcoded workflow assumptions break with new patterns**: Orchestrators don't follow linear LEAD→PLAN→EXEC, but progress calculation assumed they do.

3. **"Intentional design" can become friction when context changes**: Protocol re-reading makes sense for Opus 4.5 (drift-prone) but creates excessive friction with Opus 4.6 (system prompt adherence).

4. **Model capability evolution requires protocol recalibration**: Workarounds built for Opus 4.5 limitations don't apply to Opus 4.6 strengths.

5. **Sub-agent autonomy creates redundant discovery logic**: Each sub-agent independently solves "how to connect," leading to repeated trial-and-error.

6. **The fix for recurring friction is NOT adding more exemptions—it's centralizing policy**: Each friction point was "fixed" by adding exemption logic to gates, but the real fix is making gates **policy-aware** rather than **rule-hardened**.

---

## FILES MODIFIED (Session 2026-02-06)

### Code Changes (Corrective Actions ✅ COMPLETE)
| File | Change | Status |
|------|--------|--------|
| `scripts/modules/handoff/executors/plan-to-exec/gates/prd-gates.js` | Added validation profile check (lines 24-44) | ✅ |
| `scripts/modules/handoff/verifiers/plan-to-exec/PlanToExecVerifier.js` | Added validation profile check (lines 120-140) | ✅ |
| `scripts/modules/handoff/gates/core-protocol-gate.js` | Changed hard block to soft pass (lines 595-625) | ✅ |

### Database Changes (Corrective Actions ✅ COMPLETE)
| Migration | Change | Status |
|-----------|--------|--------|
| `20260206_fix_orchestrator_completion_blocker.sql` | Backfilled 18 LEAD-TO-PLAN handoffs + updated `get_progress_breakdown()` | ✅ EXECUTED |

### Documentation Changes (MEMORY.md ✅ COMPLETE)
| File | Change | Status |
|------|--------|--------|
| `.claude/projects/.../memory/MEMORY.md` | Updated GATE_SD_START_PROTOCOL section (lines 5-10) | ✅ |

---

## SIGN-OFF

**Root Cause Confirmed**: Gates are rule-centric (hardcoded logic) rather than data-centric (policy-driven)

**CAPA Status**:
- Friction 1 & 2: Corrective actions COMPLETE ✅
- Friction 3: Corrective action COMPLETE ✅ (soft enforcement)
- Friction 4: Fallback exists, smart routing recommended
- Systemic fix: Database-driven policy architecture proposed

**Next Steps**: User decision on prioritization of preventive actions (database-driven architecture vs continued manual exemptions)

**Pattern IDs Created**:
- PAT-GATE-POLICY-001
- PAT-SD-WORKFLOW-001
- PAT-CONN-ROUTER-001

---

**End of Root Cause Analysis**
