---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Vision V2 Strategic Directives - Update Report



## Table of Contents

- [Metadata](#metadata)
- [Summary](#summary)
- [Updated Strategic Directives](#updated-strategic-directives)
  - [SD-VISION-V2-000: Chairman's Operating System Foundation](#sd-vision-v2-000-chairmans-operating-system-foundation)
  - [SD-VISION-V2-001: Database Schema Foundation](#sd-vision-v2-001-database-schema-foundation)
  - [SD-VISION-V2-002: API Contracts for Chairman Operations](#sd-vision-v2-002-api-contracts-for-chairman-operations)
  - [SD-VISION-V2-003: EVA Orchestration Layer](#sd-vision-v2-003-eva-orchestration-layer)
  - [SD-VISION-V2-004: Agent Registry & Hierarchy](#sd-vision-v2-004-agent-registry-hierarchy)
  - [SD-VISION-V2-005: Venture CEO Runtime & Factory](#sd-vision-v2-005-venture-ceo-runtime-factory)
  - [SD-VISION-V2-006: Chairman's Dashboard UI](#sd-vision-v2-006-chairmans-dashboard-ui)
  - [SD-VISION-V2-007: Integration Verification](#sd-vision-v2-007-integration-verification)
  - [SD-VISION-V2-008: Technical Debt Cleanup](#sd-vision-v2-008-technical-debt-cleanup)
- [Overall Impact](#overall-impact)
  - [Quantitative Changes](#quantitative-changes)
  - [Qualitative Improvements](#qualitative-improvements)
- [Database Schema](#database-schema)
- [Verification](#verification)
  - [Success Criteria Counts](#success-criteria-counts)
  - [Sample Verifications Performed](#sample-verifications-performed)
- [Next Steps](#next-steps)
- [Scripts Created](#scripts-created)

## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: database, api, testing, unit

**Date**: 2025-12-12
**Updated By**: database-agent:vision-v2-update
**Status**: ✅ Successfully Completed

## Summary

All 9 Vision V2 Strategic Directives have been successfully updated based on OpenAI Codex feedback. Updates include enhanced descriptions, expanded scope definitions, and additional success criteria focused on production safety, security, and architectural non-negotiables.

## Updated Strategic Directives

### SD-VISION-V2-000: Chairman's Operating System Foundation
**Updates Applied**:
- ✅ Added "Non-Negotiables" section to Architecture Principle
  - Production Safety: No service_role in browser
  - Stage 0: No automatic 0→1 advancement
  - Decision Gates: Stages 3, 5, 13, 16, 23, 25
  - Traceability: correlation_id + Idempotency-Key
  - Deal Flow: Blueprints must not auto-create ventures
- ✅ Added 2 new success criteria:
  - Correlation-id traceability end-to-end
  - No service_role key in browser

**Metrics**:
- Success Criteria: 5 → 7 items (+2)
- Description: 1628 → 2149 chars (+521)

---

### SD-VISION-V2-001: Database Schema Foundation
**Updates Applied**:
- ✅ Replaced "Tables to Create" section with comprehensive list:
  - Stage 0 artifacts + promote function (atomic/idempotent)
  - Governance tables (chairman_directives, directive_delegations, agent_task_contracts)
  - Token ledger + circuit_breaker_events
  - Artifact versioning tables
  - Opportunity blueprint persistence
  - Venture budget settings
- ✅ Added to In Scope:
  - Prototype vs production RLS posture rules
  - Service-role safety guidance
- ✅ Added 2 new success criteria:
  - No permissive RLS on venture/portfolio scoped tables
  - service_role key never exposed to client

**Metrics**:
- Success Criteria: 4 → 6 items (+2)
- Description: 1075 → 995 chars (refined -80)
- Scope: 316 → 417 chars (+101)

---

### SD-VISION-V2-002: API Contracts for Chairman Operations
**Updates Applied**:
- ✅ Expanded endpoints list with complete API surface:
  - POST /api/ventures (create venture)
  - POST /api/ventures/:id/promote (Stage 0→1, atomic/idempotent)
  - Budget endpoints (CRUD)
  - Blueprints endpoints
  - Artifacts endpoints
  - POST /api/crews/dispatch
  - Assumptions update endpoints
  - GET /api/realtime/* (SSE)
- ✅ Added Header Requirements section:
  - X-Correlation-Id propagation
  - Idempotency-Key for mutations
  - No service_role in browser
- ✅ Added 2 new success criteria:
  - Idempotency-Key honored on mutating endpoints
  - X-Correlation-Id echoed in all responses

**Metrics**:
- Success Criteria: 4 → 6 items (+2)
- Description: 856 → 1483 chars (+627)

---

### SD-VISION-V2-003: EVA Orchestration Layer
**Priority**: Poor alignment → Enhanced

**Updates Applied**:
- ✅ Replaced Token Budget System section:
  - Budget profiles: exploratory, standard, deep_diligence
  - Phase allocations with per-stage budgets
  - Enforcement via venture_token_ledger
- ✅ Replaced Circuit Breaker section with detailed configuration:
  - Hard Cap: Blocks/pauses operations
  - Burn Rate Limit: Rate-limiting
  - Anomaly Threshold: Statistical deviation warnings
  - Soft Cap Percent (85%): Chairman warnings
  - Cooldown Period: Recovery time
  - All events logged to circuit_breaker_events
- ✅ Added to In Scope:
  - Stage 0 constraints (no auto-advance 0→1)
  - Deal-flow blueprint loop boundaries
  - Four Buckets enforcement
  - Graceful degradation behaviors
- ✅ Added 3 new success criteria:
  - No Stage 0 auto-advance
  - Blueprints never auto-create ventures
  - Briefing aggregation parallelized

**Metrics**:
- Success Criteria: 4 → 7 items (+3)
- Description: 973 → 1386 chars (+413)
- Scope: 286 → 439 chars (+153)

---

### SD-VISION-V2-004: Agent Registry & Hierarchy
**Updates Applied**:
- ✅ Replaced Tool Access Model section:
  - Direct and inherited grants (grant_type field)
  - Inheritance rules (explicit > inherited)
  - Validity windows enforced
  - Revocation cascades
  - venture_tool_quotas for per-venture limits
  - tool_usage_ledger for consumption tracking
- ✅ Added to In Scope:
  - venture_tool_quotas table
  - tool_usage_ledger table
  - Gateway quota enforcement behavior

**Metrics**:
- Success Criteria: 4 items (unchanged, no additions specified)
- Description: 1046 → 1249 chars (+203)
- Scope: 263 → 358 chars (+95)

---

### SD-VISION-V2-005: Venture CEO Runtime & Factory
**Priority**: Insulation incomplete → Complete

**Updates Applied**:
- ✅ Extended Insulation Requirements with complete 11-point list:
  1. READ-ONLY queries to venture_stage_work
  2. Stage transitions ONLY via fn_advance_venture_stage()
  3. Respects existing gate types
  4. No direct crew dispatch - delegates to VPs only
  5. Existing stage triggers/functions/policies UNCHANGED
  6. Idempotency + correlation-id required
  7. Claim-with-lease / advisory lock (no double-processing)
  8. Deadline watchdog escalates overdue work
  9. Poison/failed tasks handled per spec
  10. Handoff package validated before commit
  11. Clear state ownership - CEO observes, functions mutate
- ✅ Added 3 new success criteria:
  - Single-message processing (no double-claim)
  - Deadline escalation triggers correctly
  - Handoff package completeness validated

**Metrics**:
- Success Criteria: 5 → 8 items (+3)
- Description: 1217 → 1981 chars (+764)

---

### SD-VISION-V2-006: Chairman's Dashboard UI
**Priority**: Poor alignment → Enhanced

**Updates Applied**:
- ✅ Added Production UI Requirements (Non-Negotiable):
  - Client/server auth boundary (no service_role in browser)
  - Refresh strategy: Polling with SSE fallback
  - States: Loading, Empty, Error for all components
  - Deep-link contract: /ventures/:id?stage=N
  - Accessibility: Keyboard operability required
- ✅ Added Additional Components Required:
  - OpportunityInbox (deal flow)
  - BlueprintGenerationProgress
  - BoardReviewVisualization
  - TelemetryPanel (SSE with polling fallback)
  - Stage 0 inception + promote UX flow
- ✅ Added 4 new success criteria:
  - Deep-link /ventures/:id?stage=N works
  - Keyboard navigation for all actions
  - Loading/Empty/Error states for all components
  - No service_role key in client bundle

**Metrics**:
- Success Criteria: 4 → 8 items (+4)
- Description: 1109 → 1777 chars (+668)

---

### SD-VISION-V2-007: Integration Verification
**Updates Applied**:
- ✅ Expanded Test Scenarios with Must-Pass Integration Tests:
  1. Stage 0 → 1 promotion atomic + idempotent
  2. Blueprint generation never auto-creates ventures
  3. Blueprint generation never auto-promotes stages
  4. Correlation-id threaded through DB traces/ledgers/events
  5. UI polling/SSE fallback behaves per spec
  6. Deep-link navigation works correctly
  7. RLS: service_role isolation verified
  8. Idempotency-Key prevents duplicate mutations
- ✅ Added 2 new success criteria:
  - Stage 0 promote is atomic + idempotent (retry test)
  - Correlation-id in all audit trails

**Metrics**:
- Success Criteria: 4 → 6 items (+2)
- Description: 711 → 1191 chars (+480)

---

### SD-VISION-V2-008: Technical Debt Cleanup
**Updates Applied**:
- ✅ Replaced Cleanup Targets with concrete Kill List:
  - Ghost routes: Legacy API endpoints
  - Zombie components: Unreferenced React components
  - Legacy stage components: Stage>25 artifacts
  - VenturesManager.jsx: Hardcoded 7-stage labels
  - DB cleanup: Rows where stage_number > 25
  - Deprecated handlers: Old event handlers
- ✅ Added Archive Cleanup section:
  - Remove FK references to archived SDs
  - Purge orphaned PRD records
  - Clean governance_archive (1 year retention)
- ✅ Added 2 new acceptance criteria:
  - Grep audit confirms zero Stage>25 references
  - VenturesManager.jsx 7-stage labels removed

**Metrics**:
- Success Criteria: 6 → 8 items (+2)
- Description: 941 → 1463 chars (+522)

---

## Overall Impact

### Quantitative Changes
- **Total SDs Updated**: 9/9 (100%)
- **Success Criteria Added**: 20 new criteria across all SDs
- **Description Enhancements**: Average +493 chars per SD
- **Scope Enhancements**: 4 SDs received scope additions

### Qualitative Improvements

#### 1. Production Safety & Security
- Explicit service_role isolation requirements (5 SDs)
- RLS policy audit requirements
- Client/server auth boundary enforcement

#### 2. Architectural Non-Negotiables
- Stage 0 constraints (no auto-advance)
- Decision gate requirements (stages 3, 5, 13, 16, 23, 25)
- Blueprint/venture creation boundaries

#### 3. Traceability & Observability
- Correlation-id propagation (3 SDs)
- Idempotency-Key requirements
- Circuit breaker event logging

#### 4. Testing & Verification
- Atomic + idempotent operation tests
- Concurrency tests (double-claim prevention)
- Integration test requirements expanded

#### 5. User Experience
- Accessibility requirements (keyboard navigation)
- Deep-link support (/ventures/:id?stage=N)
- Loading/Empty/Error state handling
- SSE with polling fallback

## Database Schema

All updates were applied to the `strategic_directives_v2` table:

```sql
UPDATE strategic_directives_v2
SET description = [enhanced_description],
    scope = [enhanced_scope],
    success_criteria = [enhanced_criteria_jsonb],
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'database-agent:vision-v2-update'
WHERE id IN ('SD-VISION-V2-000', ..., 'SD-VISION-V2-008');
```

**Updated At**: 2025-12-13 00:02:56-00:02:57 GMT-0500
**Updated By**: database-agent:vision-v2-update

## Verification

### Success Criteria Counts
- SD-VISION-V2-000: 7 criteria ✅
- SD-VISION-V2-001: 6 criteria ✅
- SD-VISION-V2-002: 6 criteria ✅
- SD-VISION-V2-003: 7 criteria ✅
- SD-VISION-V2-004: 4 criteria ✅
- SD-VISION-V2-005: 8 criteria ✅
- SD-VISION-V2-006: 8 criteria ✅
- SD-VISION-V2-007: 6 criteria ✅
- SD-VISION-V2-008: 8 criteria ✅

### Sample Verifications Performed
1. ✅ SD-VISION-V2-000: Non-Negotiables section present
2. ✅ SD-VISION-V2-003: Circuit Breaker Configuration updated
3. ✅ All SDs: updated_by = 'database-agent:vision-v2-update'
4. ✅ All SDs: updated_at timestamp recent (2025-12-13)

## Next Steps

1. **Review Phase**: Human review of updated SDs in Supabase dashboard
2. **LEAD Approval**: Submit parent SD (SD-VISION-TRANSITION-001) for LEAD approval
3. **PRD Creation**: Begin PLAN phase for highest-priority child SDs
4. **Implementation**: Execute child SDs in dependency order

## Scripts Created

Two new utility scripts were created as part of this update:

1. **`scripts/update-vision-v2-sds.js`**
   - Updates all 9 Vision V2 SDs based on feedback
   - Supports --dry-run mode for validation
   - Smart description/scope/criteria merging

2. **`scripts/vision-v2-update-summary.js`**
   - Generates summary report of updates
   - Shows metrics (criteria count, description length, etc.)
   - Useful for verification and auditing

---

**Report Generated**: 2025-12-12
**Status**: ✅ All Updates Successfully Applied
