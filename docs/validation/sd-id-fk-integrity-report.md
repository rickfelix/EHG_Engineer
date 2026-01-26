# SD-ID Foreign Key Integrity Report


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, testing, e2e, unit

**Generated**: 2025-12-17
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Scope**: All tables with sd_id column
**Status**: ISSUES IDENTIFIED - Migration Required

---

## Executive Summary

Comprehensive FK integrity analysis of 88 tables with sd_id columns revealed:

- **38 tables** (43%) have proper FK constraints ✅
- **50 tables** (57%) missing FK constraints ⚠️
- **5,378 orphaned records** across 12 tables ❌
- **19 legacy_id values** need UUID migration 🔄

### Critical Findings

1. **4,070 orphaned records** in `sub_agent_execution_results` (largest issue)
2. **412 orphaned records** in `handoff_audit_log`
3. **285 orphaned records** in `retro_notifications`
4. Most orphaned records are **legacy SD-IDs** that should reference UUIDs
5. Views (v_*) incorrectly flagged as needing FK constraints (they inherit from base tables)

---

## Detailed Analysis

### Tables WITH FK Constraints (38)

All these tables have proper referential integrity:

| Table | Constraint Name | Reference |
|-------|----------------|-----------|
| agent_artifacts | agent_artifacts_sd_id_fkey | strategic_directives_v2.id |
| agent_learning_outcomes | agent_learning_outcomes_sd_id_fkey | strategic_directives_v2.id |
| agent_task_contracts | agent_task_contracts_sd_id_fkey | strategic_directives_v2.id |
| exec_handoff_preparations | exec_handoff_preparations_sd_id_fkey | strategic_directives_v2.id |
| exec_implementation_sessions | exec_implementation_sessions_sd_id_fkey | strategic_directives_v2.id |
| exec_quality_checkpoints | exec_quality_checkpoints_sd_id_fkey | strategic_directives_v2.id |
| exec_sub_agent_activations | exec_sub_agent_activations_sd_id_fkey | strategic_directives_v2.id |
| governance_proposals | governance_proposals_sd_id_fkey | strategic_directives_v2.id |
| lead_evaluations | lead_evaluations_sd_id_fkey | strategic_directives_v2.id |
| leo_codebase_validations | leo_codebase_validations_sd_id_fkey | strategic_directives_v2.id |
| leo_handoff_executions | leo_handoff_executions_sd_id_fkey | strategic_directives_v2.id |
| leo_protocol_file_audit | leo_protocol_file_audit_sd_id_fkey | strategic_directives_v2.id |
| leo_subagent_handoffs | leo_subagent_handoffs_sd_id_fkey | strategic_directives_v2.id |
| plan_quality_gates | plan_quality_gates_sd_id_fkey | strategic_directives_v2.id |
| plan_sub_agent_executions | plan_sub_agent_executions_sd_id_fkey | strategic_directives_v2.id |
| plan_technical_validations | plan_technical_validations_sd_id_fkey | strategic_directives_v2.id |
| prd_research_audit_log | prd_research_audit_log_sd_id_fkey | strategic_directives_v2.id |
| product_requirements_v2 | fk_prd_sd_id, prd_sd_fk | strategic_directives_v2.id |
| retrospectives | retrospectives_sd_id_fkey | strategic_directives_v2.id |
| risk_assessments | risk_assessments_sd_id_fkey | strategic_directives_v2.id |
| root_cause_reports | root_cause_reports_sd_id_fkey | strategic_directives_v2.id |
| sd_backlog_map | sd_backlog_map_sd_id_fkey | strategic_directives_v2.id |
| sd_business_evaluations | sd_business_evaluations_sd_id_fkey | strategic_directives_v2.id |
| sd_contract_exceptions | sd_contract_exceptions_sd_id_fkey | strategic_directives_v2.id |
| sd_contract_violations | sd_contract_violations_sd_id_fkey | strategic_directives_v2.id |
| sd_exec_file_operations | sd_exec_file_operations_sd_id_fkey | strategic_directives_v2.id |
| sd_phase_handoffs | sd_phase_handoffs_sd_id_fkey | strategic_directives_v2.id |
| sd_phase_tracking | sd_phase_tracking_sd_id_fkey | strategic_directives_v2.id |
| sd_scope_deliverables | sd_scope_deliverables_sd_id_fkey | strategic_directives_v2.id |
| sd_testing_status | sd_testing_status_sd_id_fkey | strategic_directives_v2.id |
| subagent_activations | subagent_activations_sd_id_fkey | strategic_directives_v2.id |
| subagent_requirements | subagent_requirements_sd_id_fkey | strategic_directives_v2.id |
| tech_stack_references | tech_stack_references_sd_id_fkey | strategic_directives_v2.id |
| test_plans | test_plans_sd_id_fkey | strategic_directives_v2.id |
| test_runs | test_runs_sd_id_fkey | strategic_directives_v2.id |
| user_stories | user_stories_sd_id_fkey | strategic_directives_v2.id |
| venture_stage_work | venture_stage_work_sd_id_fkey | strategic_directives_v2.id |
| working_sd_sessions | working_sd_sessions_sd_id_fkey | strategic_directives_v2.id |

### Tables WITHOUT FK Constraints (24 Base Tables)

**Note**: Excluded 26 views (v_*) which inherit constraints from base tables.

| Table | Reason | Action Required |
|-------|--------|----------------|
| active_github_operations | Missing FK | Add constraint |
| agent_coordination_state | Missing FK | Add constraint |
| agent_events | Missing FK + test data | Add constraint + cleanup |
| claude_sessions | Missing FK | Add constraint |
| github_operations | Missing FK | Add constraint |
| handoff_audit_log | Missing FK + orphans | Add constraint + migrate |
| handoff_readiness_dashboard | Missing FK | Add constraint |
| handoff_verification_gates | Missing FK | Add constraint |
| leo_mandatory_validations | Missing FK + orphans | Add constraint + cleanup |
| leo_reasoning_sessions | Missing FK | Add constraint |
| model_usage_log | Missing FK + orphans | Add constraint + cleanup |
| plan_verification_results | Missing FK | Add constraint |
| retro_notifications | Missing FK + orphans | Add constraint + migrate |
| sd_baseline_items | Missing FK + orphans | Add constraint + migrate |
| sd_capabilities | Missing FK | Add constraint |
| sd_claims | Missing FK + orphans | Add constraint + cleanup |
| sd_execution_actuals | Missing FK + orphans | Add constraint + migrate |
| sd_execution_timeline | Missing FK + orphans | Add constraint + cleanup |
| sd_session_activity | Missing FK | Add constraint |
| strategic_directives_backlog | Missing FK | Add constraint |
| sub_agent_execution_results | Missing FK + orphans | Add constraint + migrate |
| ui_validation_results | Missing FK | Add constraint |
| ui_validation_summary | Missing FK | Add constraint |

### Orphaned Records Breakdown

| Table | Orphaned Count | Primary Issue |
|-------|---------------|---------------|
| sub_agent_execution_results | 4,070 | Legacy SD-IDs not migrated |
| handoff_audit_log | 412 | Legacy SD-IDs not migrated |
| retro_notifications | 285 | Legacy SD-IDs not migrated |
| model_usage_log | 163 | Test data + STANDALONE entries |
| sd_baseline_items | 50 | Legacy SD-IDs not migrated |
| sd_execution_actuals | 50 | Legacy SD-IDs not migrated |
| agent_events | 7 | Test data (test-sd-123) |
| sd_execution_timeline | 3 | Legacy SD-IDs not migrated |
| leo_mandatory_validations | 2 | Legacy SD-IDs not migrated |
| sd_claims | 1 | Legacy SD-IDs not migrated |
| v_pending_retro_notifications | 285 | View of retro_notifications |
| v_sd_execution_status | 50 | View of baseline/actuals |

**Total Orphaned**: 5,378 records

### Legacy ID to UUID Migration Needed

19 orphaned sd_id values match strategic_directives_v2.legacy_id and need migration:

| Legacy ID | UUID | Status |
|-----------|------|--------|
| SD-ARTIFACT-INTEGRATION-001 | SD-ARTIFACT-INTEGRATION-001 | Needs migration |
| SD-FOUNDATION-V3-001 | SD-FOUNDATION-V3-001 | Needs migration |
| SD-LEO-GEMINI-001 | SD-LEO-GEMINI-001 | Needs migration |
| SD-TECHDEBT-ESLINT-001 | 35db1a87-664b-4957-af5a-5d5a56c77261 | Needs migration |
| SD-VISION-V2-000 | SD-VISION-V2-000 | Needs migration |
| SD-VISION-V2-001 | SD-VISION-V2-001 | Needs migration |
| SD-VISION-V2-002 | SD-VISION-V2-002 | Needs migration |
| SD-VISION-V2-003 | SD-VISION-V2-003 | Needs migration |
| SD-VISION-V2-004 | SD-VISION-V2-004 | Needs migration |
| SD-VISION-V2-005 | SD-VISION-V2-005 | Needs migration |
| SD-VISION-V2-006 | SD-VISION-V2-006 | Needs migration |
| SD-VISION-V2-007 | SD-VISION-V2-007 | Needs migration |
| SD-VISION-V2-008 | SD-VISION-V2-008 | Needs migration |
| SD-VISION-V2-009 | 6710ce94-52a6-4f7a-a1ab-4fe80e193c9d | Needs migration |
| SD-VISION-V2-010 | 52038e49-7612-4e98-bb9f-c8b5b97a9266 | Needs migration |
| SD-VISION-V2-011 | 0cbf032c-ddff-4ea3-9892-2871eeaff1a7 | Needs migration |
| SD-VISION-V2-012 | SD-VISION-V2-012 | Needs migration |
| SD-VISION-V2-013 | e354273d-e841-4926-8788-c2f9a15e91c7 | Needs migration |
| SD-VISION-V2-P2-000 | 85c7b51d-d713-4a34-adc5-15b2c624ae23 | Needs migration |

### Sample Orphaned SD-IDs by Category

**Legacy IDs** (most common - need UUID migration):
- SD-VWC-PHASE1-001 (266 records)
- SD-VISION-TRANSITION-001F (251 records)
- SD-FOUND-SAFETY-002 (187 records)
- SD-EVA-CIRCUIT-001 (134 records)
- SD-A11Y-FEATURE-BRANCH-001 (128 records)
- SD-STAGE-XX-001 series (multiple records)

**UUID Format** (deleted SDs?):
- 7a33e6f8-a4be-4b60-a071-8d810279f648 (143 records)
- f1bb88ae-04c1-48fd-b3dc-72aec0fbba54 (2 records)

**Test Data** (should be deleted):
- test-sd-123 (4 records)
- QUERY (various records)
- MIGRATION (various records)
- OVERRIDE-TEST-001 (various records)

**Unknown Format**:
- STANDALONE (20 records in model_usage_log)
- vision-transition-001 (3 records)

---

## Migration Strategy

### Phase 1: Preparation (SAFE - No Data Changes)

1. Review migration script: `database/migrations/20251217_fix_sd_id_fk_integrity.sql`
2. Backup database before executing
3. Test in staging environment first

### Phase 2: Test Data Cleanup (LOW RISK)

```sql
-- Delete test records from agent_events
DELETE FROM agent_events
WHERE sd_id IN ('test-sd-123', 'QUERY', 'MIGRATION');

-- Mark STANDALONE model usage as NULL (not SD-specific)
UPDATE model_usage_log
SET sd_id = NULL
WHERE sd_id IN ('STANDALONE', 'QUERY', 'MIGRATION');
```

**Impact**: Removes development artifacts (~30 records)

### Phase 3: Legacy ID Migration (MEDIUM RISK)

```sql
-- Migrate legacy_id to UUID for all affected tables
UPDATE sub_agent_execution_results
SET sd_id = sd.id
FROM strategic_directives_v2 sd
WHERE sub_agent_execution_results.sd_id = sd.legacy_id
  AND sub_agent_execution_results.sd_id != sd.id;

-- Repeat for other tables...
```

**Impact**: Migrates ~4,500 records to use proper UUID references

### Phase 4: Add FK Constraints (HIGH RISK)

```sql
-- Add FK constraints to base tables only (not views)
ALTER TABLE sub_agent_execution_results
  ADD CONSTRAINT fk_sub_agent_execution_results_sd_id
  FOREIGN KEY (sd_id)
  REFERENCES strategic_directives_v2(id)
  ON DELETE CASCADE;

-- Repeat for 23 other base tables...
```

**Impact**: Enforces referential integrity, prevents future orphans

### Phase 5: Review Remaining Orphans (MANUAL)

After migration, query `v_remaining_orphaned_sd_ids` view to identify records that still need attention. These may be:
- Historical records from deleted SDs
- Data requiring manual SD reassignment
- Invalid data to be purged

---

## Recommendations

### Immediate Actions

1. **Execute Migration Script** (phased approach)
   - File: `database/migrations/20251217_fix_sd_id_fk_integrity.sql`
   - Test in staging first
   - Execute phases sequentially with validation between each

2. **Prevent Future Orphans**
   - FK constraints will automatically prevent new orphaned records
   - Consider soft-delete pattern for strategic_directives_v2

### Code Changes Required

1. **Update Scripts to Use UUID**
   - All scripts currently using legacy_id should migrate to UUID
   - Update lookups: `WHERE sd.id = ?` instead of `WHERE sd.legacy_id = ?`

2. **Add Validation to Insert Operations**
   - Verify sd_id exists before INSERT
   - Use FK constraints as safety net

3. **Consider Soft-Delete Pattern**
   ```sql
   ALTER TABLE strategic_directives_v2 ADD COLUMN deleted_at TIMESTAMPTZ;
   CREATE INDEX idx_strategic_directives_v2_deleted ON strategic_directives_v2(deleted_at)
     WHERE deleted_at IS NULL;
   ```

### Monitoring

1. **Track Orphaned Records**
   - Use `v_remaining_orphaned_sd_ids` view
   - Alert if count > 0

2. **Verify FK Constraints**
   - Regularly query information_schema for missing constraints
   - Add to validation suite

---

## Migration Execution Checklist

- [ ] Backup production database
- [ ] Test migration in staging environment
- [ ] Review orphaned records manually
- [ ] Execute Phase 1: Test data cleanup
- [ ] Validate Phase 1 results
- [ ] Execute Phase 2: Legacy ID migration
- [ ] Validate Phase 2 results (query v_remaining_orphaned_sd_ids)
- [ ] Execute Phase 3: Add FK constraints
- [ ] Validate Phase 3 results (verify all constraints created)
- [ ] Document any remaining orphans requiring manual review
- [ ] Update application code to use UUIDs consistently
- [ ] Add FK constraint checks to CI/CD validation

---

## Scripts and Tools

### Analysis Scripts

- `/mnt/c/_EHG/EHG_Engineer/scripts/verify-sd-id-fk-integrity.js`
  - Comprehensive FK integrity check
  - Identifies orphaned records
  - Generates recommendations

- `/mnt/c/_EHG/EHG_Engineer/scripts/analyze-orphaned-sd-ids.js`
  - Detailed orphaned record analysis
  - Categorizes by type (legacy, test, deleted)
  - Identifies legacy_id matches

### Migration Script

- `/mnt/c/_EHG/EHG_Engineer/database/migrations/20251217_fix_sd_id_fk_integrity.sql`
  - Phased migration approach
  - Test data cleanup
  - Legacy ID migration
  - FK constraint creation
  - Validation queries

### Post-Migration View

```sql
-- Query this view after migration to see remaining orphans
SELECT * FROM v_remaining_orphaned_sd_ids
ORDER BY record_count DESC;
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data loss during migration | LOW | HIGH | Backup before execution, test in staging |
| FK constraint blocks valid inserts | MEDIUM | MEDIUM | Validate all sd_id values before migration |
| Performance impact of CASCADE | LOW | LOW | Indexes exist on sd_id columns |
| Remaining orphans after migration | MEDIUM | LOW | Manual review process defined |
| Legacy code breaks with UUID-only | HIGH | MEDIUM | Update code before adding constraints |

---

## Appendix: Views with sd_id Column

**Note**: These inherit FK constraints from their base tables and do NOT need separate FK constraints:

- v_active_sessions
- v_business_evaluation_history
- v_ehg_backlog
- v_ehg_engineer_backlog
- v_exec_implementation_summary
- v_handoff_chain
- v_latest_test_evidence
- v_lead_evaluation_summary
- v_pending_action_items
- v_pending_retro_notifications
- v_plan_validation_summary
- v_prd_acceptance
- v_prd_sd_payload
- v_problematic_handoffs
- v_protocol_improvements_analysis
- v_sd_e2e_readiness
- v_sd_execution_status
- v_sd_keys
- v_sd_next_candidates
- v_sd_parallel_opportunities
- v_sd_release_gate
- v_sd_test_readiness
- v_story_e2e_compliance
- v_story_test_coverage
- v_story_verification_status
- v_subagent_compliance

---

**Generated by**: Database Agent
**Date**: 2025-12-17
**SD Context**: SD-VISION-V2-011
**Phase**: EXEC
