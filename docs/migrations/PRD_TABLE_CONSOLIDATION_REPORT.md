# PRD Table Consolidation Analysis & Migration Plan

**Date**: 2025-10-16
**Status**: Ready for Execution
**Priority**: Medium (Technical Debt Cleanup)

---

## Executive Summary

The database currently has **two PRD-related tables** (`prds` and `product_requirements_v2`) that serve overlapping purposes. This creates confusion and maintenance overhead. This report analyzes both tables and provides a migration plan to consolidate to a single table.

**Recommendation**: Keep `product_requirements_v2`, drop `prds` (deprecated).

---

## Analysis Results

### 1. Tables Found

| Table Name | Record Count | Foreign Keys | Status |
|------------|--------------|--------------|---------|
| `prds` | 9 | 0 (none point TO it) | **DEPRECATED** |
| `product_requirements_v2` | 149 | 6 (actively referenced) | **ACTIVE** |
| `prd_reasoning_analytics` | N/A | N/A | Support table (keep) |
| `prd_research_audit_log` | N/A | N/A | Support table (keep) |
| `prd_ui_mappings` | N/A | N/A | Support table (keep) |
| `v_prd_acceptance` | N/A | N/A | View (keep) |
| `v_prd_sd_payload` | N/A | N/A | View (keep) |

### 2. Schema Comparison

#### `prds` Table (Deprecated - 12 columns)
```sql
- id (text) PRIMARY KEY
- title (text) NOT NULL
- content (text)
- status (text)
- strategic_directive_id (text)
- metadata (jsonb)
- created_at (timestamp with time zone)
- updated_at (timestamp with time zone)
- target_url (text)
- component_name (text)
- app_path (text)
- port (integer)
```

**Assessment**: Minimal schema, missing critical fields for LEO Protocol.

#### `product_requirements_v2` Table (Active - 50 columns)
```sql
- id (varchar) PRIMARY KEY
- directive_id (varchar)
- sd_id (varchar)
- sd_uuid (uuid)
- title (varchar) NOT NULL
- version (varchar)
- status (varchar)
- category (varchar)
- priority (varchar)
- phase (varchar)
- progress (integer)
- phase_progress (jsonb)

-- Content fields
- content (text)
- executive_summary (text)
- business_context (text)
- technical_context (text)
- implementation_approach (text)
- evidence_appendix (text)

-- Structured requirements
- functional_requirements (jsonb)
- non_functional_requirements (jsonb)
- technical_requirements (jsonb)
- ui_ux_requirements (jsonb)
- performance_requirements (jsonb)
- acceptance_criteria (jsonb)
- test_scenarios (jsonb)

-- Architecture & specs
- system_architecture (text)
- data_model (jsonb)
- api_specifications (jsonb)
- technology_stack (jsonb)
- dependencies (jsonb)

-- Checklists (LEO Protocol)
- plan_checklist (jsonb)
- exec_checklist (jsonb)
- validation_checklist (jsonb)
- backlog_items (jsonb)

-- Risk management
- risks (jsonb)
- constraints (jsonb)
- assumptions (jsonb)
- stakeholders (jsonb)

-- Analysis fields
- reasoning_analysis (jsonb)
- complexity_analysis (jsonb)
- reasoning_depth (varchar)
- confidence_score (integer)
- research_confidence_score (numeric)
- planning_section (jsonb)

-- Audit fields
- created_at (timestamp)
- updated_at (timestamp)
- created_by (varchar)
- updated_by (varchar)
- approved_by (varchar)
- approval_date (timestamp)
- planned_start (timestamp)
- planned_end (timestamp)
- actual_start (timestamp)
- actual_end (timestamp)
- metadata (jsonb)
```

**Assessment**: Comprehensive schema aligned with LEO Protocol requirements.

### 3. Data Comparison

**Orphaned Records** (in `prds` but NOT in `product_requirements_v2`):

| ID | Title | Status | Created |
|----|-------|--------|---------|
| `00ecb9a6-b3fb-4dc1-bc31-bca7b8db6d2f` | PRD: Venture Documents - Pragmatic File Management | active | 2025-10-04 |
| `49095549-e6a9-48a0-8ed9-c2a1208de63a` | PRD: Venture Timeline Tab - Gantt & Milestone Visualization | active | 2025-10-04 |
| `PRD-BACKEND-001` | SD-BACKEND-001: Critical UI Stub Completion - EVA Realtime Voice | approved | 2025-10-03 |
| `f6e61384-c51e-470d-978b-00283c7d5cba` | PRD-SD-UAT-020: Settings Section Implementation | approved | 2025-10-01 |
| `60352950-274f-473f-a7ff-5e22bbc885e4` | Navigation and UX Enhancement Implementation Plan | approved | 2025-10-01 |
| `PRD-SD-1B` | PRD – SD-1B: Stage-1 Emergent Ideation Engine Documentation Framework | approved | 2025-09-26 |

**Total orphaned**: 6 records (need migration before dropping `prds`)

### 4. Foreign Key Dependencies

**Tables referencing `product_requirements_v2`** (active dependencies):
- `exec_implementation_sessions.prd_id` → `product_requirements_v2.id`
- `governance_proposals.prd_id` → `product_requirements_v2.id`
- `leo_codebase_validations.prd_id` → `product_requirements_v2.id`
- `leo_subagent_handoffs.prd_id` → `product_requirements_v2.id`
- `test_plans.prd_id` → `product_requirements_v2.id`
- `user_stories.prd_id` → `product_requirements_v2.id`

**Tables referencing `prds`**: None (safe to drop)

### 5. Code Usage Analysis

**References to `prds` table**: 30 files
```
./lib/agents/plan-verification-tool.js
./pages/api/leo/gate-scores.ts
./pages/api/leo/metrics.ts
./pages/api/leo/sub-agent-reports.ts
./scripts/apply-gap-remediation.js
./scripts/apply-remediation-polish.js
./scripts/check-sd-051-status.js
./scripts/create-prd-retro-enhance-001.js
./scripts/create-prd-sd-047a-v2.js
./scripts/create-prd-sd-047a.js
./scripts/create-prd-sd-047b.js
./scripts/create-prd-sd-backend-001.js
./scripts/create-prd-sd-uat-020.js
./scripts/design-ui-ux-audit.js
./scripts/generate-comprehensive-retrospective.js
./scripts/generate-retrospective.js
./scripts/lead-approval-checklist.js
./scripts/update-prd-fields.js
./src/services/database-loader/index.ts
./tools/gates/lib/rules.ts
./tools/migrations/prd-filesystem-to-database.ts
./tools/subagents/scan.ts
./tools/validators/exec-checklist.ts
```

**References to `product_requirements_v2` table**: 271 files (active/preferred)

### 6. Recent Activity

**Git history analysis**:
- Last commit changing `prds` references: db24ffe (LEO Protocol consolidation)
- Pattern: Active migration away from `prds` to `product_requirements_v2`
- No recent commits adding NEW `prds` references (indicates deprecation)

---

## Decision Matrix

| Criterion | `prds` | `product_requirements_v2` | Winner |
|-----------|--------|---------------------------|--------|
| Record count | 9 | 149 | ✅ v2 |
| Schema completeness | 12 columns | 50 columns | ✅ v2 |
| Foreign keys pointing TO it | 0 | 6 | ✅ v2 |
| Code references | 30 | 271 | ✅ v2 |
| LEO Protocol alignment | ❌ No | ✅ Yes | ✅ v2 |
| Supports checklists | ❌ No | ✅ Yes | ✅ v2 |
| Recent usage | Declining | Active | ✅ v2 |
| Technical debt | High | Low | ✅ v2 |

**Clear Winner**: `product_requirements_v2`

---

## Migration Plan

### Phase 1: Data Migration (Automated)

**Script**: `scripts/migrate-prds-to-v2.js`

**Steps**:
1. ✅ Migrate 6 orphaned records from `prds` to `product_requirements_v2`
2. ✅ Map fields (with intelligent defaults):
   - `strategic_directive_id` → `directive_id` and `sd_id`
   - `status` → `status` + inferred `phase`
   - `content` → `content`
   - `metadata` → `metadata`
   - Status-based progress: approved=50%, active=25%, draft=0%
3. ✅ Verify migration (no orphans remain)
4. ✅ Create backup table: `prds_backup_20251016`
5. ✅ Drop `prds` table

**Safety**: Dry-run mode available (`--dry-run` flag)

### Phase 2: Code Update (Automated)

**Pattern**: Replace `from('prds')` with `from('product_requirements_v2')`

**Files to update**: 30 files (see list above)

**Script automation**: Yes (included in migration script)

### Phase 3: Verification (Manual)

**Checklist**:
- [ ] Run unit tests: `npm run test:unit`
- [ ] Run E2E tests: `npm run test:e2e`
- [ ] Manually test affected scripts
- [ ] Verify dashboard loads correctly
- [ ] Check gate scores API
- [ ] Verify retrospective generation

### Phase 4: Rollback Plan (If Needed)

**If migration fails**:
```sql
-- Restore from backup
CREATE TABLE prds AS SELECT * FROM prds_backup_20251016;

-- Revert code changes
git checkout -- <affected-files>
```

### Phase 5: Cleanup (30 days later)

**After verification period**:
```sql
-- Drop backup table
DROP TABLE prds_backup_20251016;
```

---

## Execution Commands

### Dry Run (Recommended First)
```bash
node scripts/migrate-prds-to-v2.js --dry-run
```

### Live Migration
```bash
# Full migration (data + code update)
node scripts/migrate-prds-to-v2.js

# Or, data migration only
node scripts/migrate-prds-to-v2.js --skip-code-update
```

### Manual SQL Migration (Alternative)
```bash
psql "$DATABASE_URL" < migrations/cleanup-deprecated-prds-table.sql
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during migration | Low | High | Automatic backup created |
| Code breaks after table drop | Medium | Medium | 30 files updated automatically |
| Foreign key constraints fail | Low | High | No FKs point to `prds` (verified) |
| Rollback needed | Low | Medium | Full rollback plan documented |
| Tests fail after migration | Medium | Low | Comprehensive verification checklist |

**Overall Risk**: **Low** (well-mitigated)

---

## Benefits

1. **Single Source of Truth**: One table for PRDs eliminates confusion
2. **Reduced Technical Debt**: Remove deprecated table and unused code paths
3. **Schema Consistency**: All PRDs use comprehensive v2 schema
4. **Improved Maintainability**: Less code to maintain (30 files updated)
5. **LEO Protocol Alignment**: v2 table designed for LEO workflow
6. **Database Clarity**: Remove unused tables from schema

---

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Analysis | 1 hour | ✅ Complete | ✅ Complete |
| Migration (dry-run) | 5 min | Pending | Pending |
| Migration (live) | 10 min | Pending | Pending |
| Code update | 2 min | Pending | Pending |
| Testing | 30 min | Pending | Pending |
| Verification | 1 week | Pending | Pending |
| Backup cleanup | 1 min | +30 days | +30 days |

**Total active time**: ~1 hour
**Total calendar time**: 30 days (includes verification period)

---

## Recommendation

**Proceed with migration** for the following reasons:

1. ✅ **Clear winner**: `product_requirements_v2` superior in every metric
2. ✅ **Low risk**: No foreign key dependencies on `prds`
3. ✅ **Automated**: Script handles migration + code update
4. ✅ **Reversible**: Full backup + rollback plan
5. ✅ **High value**: Eliminates confusion and technical debt
6. ✅ **LEO Protocol aligned**: v2 schema designed for workflow

**Action**: Run `node scripts/migrate-prds-to-v2.js --dry-run` to preview changes.

---

## Approval

- [ ] Technical review completed
- [ ] Dry-run executed successfully
- [ ] Rollback plan verified
- [ ] Backup strategy confirmed
- [ ] Ready for live migration

**Approved by**: _________________
**Date**: _________________

---

## Post-Migration Checklist

### Immediate (Day 1)
- [ ] Migration script executed successfully
- [ ] 6 orphaned records migrated
- [ ] 30 code files updated
- [ ] `prds` table dropped
- [ ] Backup table created (`prds_backup_20251016`)
- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Dashboard loads correctly

### Short-term (Week 1)
- [ ] Gate scores API verified
- [ ] Retrospective generation tested
- [ ] Sub-agent reports verified
- [ ] PRD creation workflow tested
- [ ] No errors in production logs

### Long-term (30 days)
- [ ] No rollback needed
- [ ] All systems stable
- [ ] Backup table dropped
- [ ] Documentation updated
- [ ] Lessons learned captured

---

**End of Report**
