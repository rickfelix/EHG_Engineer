# Implementation Plan: Infrastructure Hardening for Synergy Scale

**SD**: SD-LEO-INFRA-HARDENING-001
**Created**: 2026-01-29
**Status**: Approved for implementation
**Priority**: Critical

---

## Executive Summary

Resolve 11 critical infrastructure issues identified in Technical Feasibility Audit before enabling Synergy Roadmap skill chaining. This SD is a prerequisite for all Aesthetic Design System and Synergy Roadmap work.

---

## Phase 0: Critical Blockers (Must Fix First)

### 1. Atomic Handoffs

**Problem**: `exec-to-plan/index.js` lines 162-169 has 3 independent awaits with no transaction wrapper.

```javascript
// CURRENT (Non-Atomic)
await transitionUserStoriesToValidated(this.supabase, sdId);
await transitionPrdToVerification(this.supabase, prdForTransition);
await transitionSDToExecComplete(this.supabase, sdId);
```

**Solution**: PostgreSQL RPC with explicit transaction

**Files to Create**:
- `database/migrations/20260130_atomic_handoff_transitions.sql`
- `scripts/modules/handoff/executors/exec-to-plan/atomic-transitions.js`

**Files to Modify**:
- `scripts/modules/handoff/executors/exec-to-plan/index.js`
- `scripts/modules/handoff/executors/lead-to-plan/index.js`
- `scripts/modules/handoff/executors/plan-to-exec/index.js`
- `scripts/modules/handoff/executors/plan-to-lead/index.js`

**RPC Function**: `fn_atomic_exec_to_plan_transition(p_sd_id, p_prd_id, p_session_id, p_transition_context)`

---

### 2. Parallelization Mandate

**Problem**: `phase-subagent-orchestrator/index.js:172-196` executes sub-agents in sequential `for` loop.

**Current Performance**: 5 agents × 30s each = 150s
**Target Performance**: Promise.all() = 30s (max of all agents)

**Solution**:
```javascript
// Group independent agents
const independentAgents = agents.filter(a => !a.dependsOn);
const results = await Promise.all(
  independentAgents.map(agent => executeSubAgent(agent, sdId, options))
);
```

---

### 3. SD-Type Threshold Enforcement

**Problem**: `ValidationOrchestrator.js` calculates `normalizedScore` but never compares against SD-type-specific thresholds.

**Location**: `scripts/modules/handoff/validation/ValidationOrchestrator.js`

**Current**:
```javascript
if (!gateResults.passed) { BLOCK }  // Boolean only
```

**Target**:
```javascript
const threshold = THRESHOLD_PROFILES[sd.sd_type]?.gateThreshold || 85;
if (gateResults.normalizedScore < threshold) { BLOCK }
```

**Thresholds** (from `sd-type-checker.js`):
| SD Type | Threshold |
|---------|-----------|
| feature | 85% |
| security | 90% |
| infrastructure | 80% |
| documentation | 60% |
| orchestrator | 70% |

---

### 4. Context Deep-Copy

**Problem**: `BaseExecutor.js:91-99` passes object references, not copies.

**Current**:
```javascript
const validationContext = {
  sd,      // Direct reference
  prd,     // Direct reference
  options  // Direct reference
};
```

**Solution**:
```javascript
const validationContext = {
  sd: structuredClone(sd),
  prd: structuredClone(prd),
  options: structuredClone(options)
};
```

---

## Phase 1: High Risk (Before Full Automation)

### 5. Timeout Wrappers

**Location**: `lib/sub-agent-executor/executor.js:44`

**Solution**: Add 60-second timeout with `Promise.race()`

```javascript
const result = await Promise.race([
  realExecuteSubAgent(code, sdId, options),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Sub-agent timeout')), 60000)
  )
]);
```

---

### 6. Idempotency Keys

**Location**: `scripts/modules/phase-subagent-orchestrator/execution.js:125`

**Problem**: Generates new UUID on every call, retries create duplicates.

**Solution**: Use deterministic key based on `sd_id + phase + agent_code + timestamp_bucket`

---

### 7. Gate Result Schema Validation

**Location**: `scripts/modules/handoff/validation/ValidationOrchestrator.js`

**Solution**: Validate gate returns `{ passed: boolean, score: number, maxScore: number, issues: array }`

---

### 8. Centralized SD-Type Skip Conditions

**Location**: `scripts/modules/sd-type-checker.js`

**Solution**: Add `shouldSkipGate(gateName, sdType)` utility function

---

## Concurrency Safety Architecture

### Three-Layer Protection

1. **Session-Level**: Existing `session-conflict-checker.mjs` prevents multi-session claims
2. **Transaction-Level**: `pg_try_advisory_xact_lock(hashtext(sd_id))` prevents mid-transition races
3. **Optimistic Locking**: `transition_version` column catches missed conflicts

---

## Error Integrity Architecture

### Audit Table: `sd_transition_audit`

```sql
CREATE TABLE sd_transition_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID NOT NULL,
  transition_type VARCHAR(50) NOT NULL,
  session_id TEXT,
  pre_state JSONB,
  post_state JSONB,
  status VARCHAR(20) DEFAULT 'in_progress',
  error_details JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### Spartan Error Log Format

```json
{
  "error_code": "23503",
  "error_message": "Foreign key violation",
  "failed_step": "4b. Transition PRD",
  "pre_state": { "sd_phase": "EXEC", "prd_status": "draft" },
  "partial_state": { "user_stories_updated": 3, "prd_updated": false },
  "recovery_action": "Re-run handoff after fixing PRD constraint"
}
```

---

## Success Criteria

1. Sub-agent execution completes in <30s for 5 parallel agents
2. State transitions are atomic - PRD failure rolls back User Stories
3. Security SDs block at 89.9% score (90% threshold enforced)
4. Chained skills produce identical results on repeated execution
5. No duplicate records created on retry operations

---

## Verification Plan

1. **Unit Test**: Atomic transition rollback on simulated failure
2. **Integration Test**: Full handoff with parallel sub-agents
3. **Spartan Test**: Query `sd_transition_audit` after handoff to verify pre/post state capture

---

## Dependencies

- None (this is the root prerequisite)

## Blocks

- SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001
- SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001
- SD-LEO-ORCH-SYNERGY-ROADMAP-META-001 (pending creation)

---

## Estimated Effort

| Phase | Items | Hours |
|-------|-------|-------|
| Phase 0 | 4 blockers | 10h |
| Phase 1 | 4 high-risk | 10h |
| Testing | Verification | 5h |
| **Total** | | **25h** |

---

*Plan approved 2026-01-29. Ready for LEAD-TO-PLAN handoff.*
