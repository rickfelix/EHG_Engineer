# PRD Schema Audit Report


## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, unit, migration

**Date**: 2025-10-19
**Auditor**: Claude Code
**Purpose**: Verify all PRD creation scripts use correct fields matching database schema

## Executive Summary

**Status**: ❌ **CRITICAL ISSUES FOUND**

- **Scripts Audited**: 4 sample scripts + main template
- **Issues Found**: Multiple scripts using non-existent fields
- **Primary Issue**: `ui_components` and `ui_components_summary` fields don't exist in schema
- **Secondary Issue**: Missing `sd_uuid` field population (critical for handoff validation)
- **Impact**: Silent failures, data not persisting, handoff validation failures

---

## Actual Database Schema

### Confirmed Fields in `product_requirements_v2` Table

```
✅ acceptance_criteria (JSONB)
✅ actual_end (TIMESTAMP)
✅ actual_start (TIMESTAMP)
✅ api_specifications (JSONB)
✅ approval_date (TIMESTAMP)
✅ approved_by (VARCHAR)
✅ assumptions (JSONB)
✅ backlog_items (JSONB)
✅ business_context (TEXT)
✅ category (VARCHAR)
✅ complexity_analysis (TEXT/JSONB)
✅ confidence_score (NUMERIC)
✅ constraints (JSONB)
✅ content (TEXT)
✅ created_at (TIMESTAMP)
✅ created_by (VARCHAR)
✅ data_model (JSONB)
✅ dependencies (JSONB)
✅ directive_id (VARCHAR) - legacy field
✅ evidence_appendix (TEXT)
✅ exec_checklist (JSONB)
✅ executive_summary (TEXT)
✅ functional_requirements (JSONB)
✅ id (VARCHAR PRIMARY KEY)
✅ implementation_approach (TEXT)
✅ metadata (JSONB)
✅ non_functional_requirements (JSONB)
✅ performance_requirements (JSONB)
✅ phase (VARCHAR)
✅ phase_progress (JSONB)
✅ plan_checklist (JSONB)
✅ planned_end (TIMESTAMP)
✅ planned_start (TIMESTAMP)
✅ planning_section (TEXT/JSONB)
✅ priority (VARCHAR)
✅ progress (INTEGER)
✅ reasoning_analysis (TEXT/JSONB)
✅ reasoning_depth (VARCHAR)
✅ research_confidence_score (NUMERIC)
✅ risks (JSONB)
✅ sd_id (VARCHAR)
✅ sd_uuid (UUID) - CRITICAL: Foreign key to strategic_directives_v2
✅ stakeholders (JSONB)
✅ status (VARCHAR)
✅ system_architecture (TEXT)
✅ technical_context (TEXT)
✅ technical_requirements (JSONB)
✅ technology_stack (JSONB)
✅ test_scenarios (JSONB)
✅ title (VARCHAR)
✅ ui_ux_requirements (JSONB)
✅ updated_at (TIMESTAMP)
✅ updated_by (VARCHAR)
✅ validation_checklist (JSONB)
✅ version (VARCHAR)
```

### Fields That DO NOT Exist (But Scripts Try to Use)

```
❌ ui_components
❌ ui_components_summary
❌ strategic_directive_id
❌ prd_id
❌ problem_statement
❌ objectives
❌ user_stories
❌ technical_architecture
❌ database_changes
❌ test_strategy
❌ deployment_plan
❌ success_metrics
❌ estimated_effort_hours
❌ target_completion_date
❌ risks_and_mitigations
❌ documentation_requirements
```

---

## Critical Issues by Script

### 1. **add-prd-to-database.js** (Main Template) ❌ CRITICAL

**Location**: `/scripts/add-prd-to-database.js:213-219`

**Issue**: Attempts to update non-existent fields
```javascript
await supabase
  .from('product_requirements_v2')
  .update({
    ui_components: prdComponents.ui_components,              // ❌ Field doesn't exist
    ui_components_summary: prdComponents.ui_components_summary,  // ❌ Field doesn't exist
    updated_at: new Date().toISOString()
  })
  .eq('id', prdId);
```

**Impact**:
- Update silently fails or throws error
- Component recommendations not saved
- Feature partially broken

**Fix Required**:
- Remove ui_components and ui_components_summary updates
- OR add these fields to schema if needed
- Store component data in `metadata` JSONB field instead

---

### 2. **create-prd-sd-knowledge-001.js** ❌ HIGH SEVERITY

**Location**: `/scripts/create-prd-sd-knowledge-001.js`

**Issues**:
1. Uses `strategic_directive_id` instead of `sd_uuid` (line 22)
2. Uses many non-existent fields:
   - `problem_statement`
   - `objectives` (array)
   - `user_stories` (array)
   - `technical_architecture`
   - `database_changes` (object)
   - `test_strategy`
   - `deployment_plan`
   - `success_metrics` (array)

**Impact**:
- Data not saved to database
- PRD missing critical foreign key link
- Handoff validation will fail

**Fix Required**:
- Change `strategic_directive_id` to `sd_uuid`
- Map custom fields to existing schema:
  - `problem_statement` → `business_context` or `executive_summary`
  - `objectives` → Store in `metadata` JSONB
  - `user_stories` → Separate `user_stories` table (don't store in PRD)
  - `technical_architecture` → `system_architecture` (TEXT)
  - `database_changes` → Store in `metadata` or `planning_section`
  - `test_strategy` → `test_scenarios` (JSONB)
  - `deployment_plan` → Store in `metadata` or `planning_section`
  - `success_metrics` → Store in `metadata` or `acceptance_criteria`

---

### 3. **create-prd-retro-enhance-001.js** ❌ HIGH SEVERITY

**Location**: `/scripts/create-prd-retro-enhance-001.js:37-39`

**Issues**:
1. Uses `prd_id` field (doesn't exist, use `id` instead)
2. Uses `strategic_directive_id` instead of `sd_uuid`
3. Uses non-existent fields:
   - `estimated_effort_hours`
   - `target_completion_date`
   - `risks_and_mitigations` (should be `risks`)
   - `documentation_requirements`

**Impact**:
- Foreign key not populated
- Extra fields silently dropped
- Handoff validation failures

**Fix Required**:
- Remove `prd_id` field (just use `id`)
- Change `strategic_directive_id` to `sd_uuid`
- Rename `risks_and_mitigations` to `risks`
- Store `documentation_requirements` in `metadata` JSONB
- Store `estimated_effort_hours` and `target_completion_date` in `metadata`

---

### 4. **create-prd-vif-tier-001.js** ⚠️ MEDIUM SEVERITY

**Location**: `/scripts/create-prd-vif-tier-001.js`

**Issues**:
1. ✅ Correctly uses `directive_id`
2. ❌ Missing `sd_uuid` population (critical for handoffs!)
3. Uses `system_architecture` as object (should be TEXT)
4. Uses `implementation_approach` as object (should be TEXT)

**Impact**:
- PRD created but handoff validation will fail
- Schema type mismatch may cause errors

**Fix Required**:
- Add `sd_uuid` fetch and population (see add-prd-to-database.js:76-91)
- Convert `system_architecture` object to TEXT (JSON.stringify or markdown)
- Convert `implementation_approach` object to TEXT (JSON.stringify or markdown)

---

## Required Actions

### Immediate (Critical Priority)

1. **Fix add-prd-to-database.js**
   - Remove `ui_components` and `ui_components_summary` update
   - Store component data in `metadata` field instead
   - Ensure `sd_uuid` is always populated

2. **Add Migration for Missing Fields** (if needed)
   - Decide if `ui_components` and `ui_components_summary` should exist
   - If yes, create migration to add them
   - If no, remove all references from code

### High Priority

3. **Audit All PRD Scripts**
   - Run search for all scripts using non-existent fields
   - Update each script to use correct schema
   - Add `sd_uuid` population to all scripts

4. **Create Schema Validation**
   - Add pre-insert validation to catch schema mismatches
   - Warn developers when using non-existent fields
   - Provide helpful error messages

### Medium Priority

5. **Update Documentation**
   - Document official PRD schema fields
   - Provide field mapping guide (old → new)
   - Add examples for common patterns

6. **Create Migration Guide**
   - How to migrate custom fields to metadata
   - TEXT vs JSONB conversion patterns
   - sd_uuid population pattern

---

## Recommended Schema Mapping

For scripts using custom fields, map them as follows:

| Custom Field | Official Field | Notes |
|--------------|---------------|-------|
| `strategic_directive_id` | `sd_uuid` | Use UUID from strategic_directives_v2 |
| `prd_id` | `id` | Primary key, no separate prd_id needed |
| `problem_statement` | `business_context` | TEXT field |
| `objectives` | `metadata.objectives` | Store array in JSONB |
| `user_stories` | N/A | Use separate user_stories table |
| `technical_architecture` | `system_architecture` | TEXT field |
| `database_changes` | `metadata.database_changes` | Store in JSONB |
| `test_strategy` | `test_scenarios` | JSONB array |
| `deployment_plan` | `planning_section` | TEXT or JSONB |
| `success_metrics` | `metadata.success_metrics` | Store in JSONB |
| `estimated_effort_hours` | `metadata.estimated_hours` | Store in JSONB |
| `target_completion_date` | `planned_end` | TIMESTAMP field |
| `risks_and_mitigations` | `risks` | JSONB array |
| `documentation_requirements` | `metadata.docs` | Store in JSONB |
| `ui_components` | `metadata.ui_components` | Store in JSONB |
| `ui_components_summary` | `metadata.ui_summary` | Store in JSONB |

---

## Next Steps

1. Review this audit report
2. Decide on migration strategy for custom fields
3. Update add-prd-to-database.js (priority 1)
4. Create schema validation utility
5. Audit and fix remaining scripts
6. Add unit tests for schema compliance

---

## Summary Statistics

- **Total PRD Scripts Found**: 90+ files
- **Sample Scripts Audited**: 4
- **Scripts with Issues**: 4/4 (100%)
- **Critical Issues**: 2 (add-prd-to-database.js, create-prd-sd-knowledge-001.js)
- **High Severity Issues**: 2 (create-prd-retro-enhance-001.js, create-prd-vif-tier-001.js)
- **Fields Used but Don't Exist**: 16
- **Scripts Missing sd_uuid**: Likely 50%+

**Recommendation**: Immediate fix of add-prd-to-database.js, then systematic audit of all 90+ PRD scripts.
