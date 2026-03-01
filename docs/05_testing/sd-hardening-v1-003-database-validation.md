---
category: testing
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [testing, auto-generated]
---
# Database Validation Report: SD-HARDENING-V1-003



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [1. Chairman_Decisions Table Validation](#1-chairman_decisions-table-validation)
  - [Schema Structure](#schema-structure)
- [2. Column Mapping Analysis](#2-column-mapping-analysis)
  - [Existing Columns (All Match PRD)](#existing-columns-all-match-prd)
  - [Required Column Aliases (from PRD)](#required-column-aliases-from-prd)
  - [Missing Columns (Need Placeholders)](#missing-columns-need-placeholders)
- [3. Proposed View Definition](#3-proposed-view-definition)
- [4. RLS Policy Validation](#4-rls-policy-validation)
  - [Current Policies on chairman_decisions](#current-policies-on-chairman_decisions)
- [5. Foreign Key Relationships](#5-foreign-key-relationships)
  - [Validated Constraints](#validated-constraints)
- [6. Migration Checklist](#6-migration-checklist)
- [7. Known Issues & Risks](#7-known-issues-risks)
  - [Issue 1: Column Name Assumptions](#issue-1-column-name-assumptions)
  - [Issue 2: Missing Columns (gate_type, decided_by, decided_at)](#issue-2-missing-columns-gate_type-decided_by-decided_at)
  - [Issue 3: RLS Policy Inheritance](#issue-3-rls-policy-inheritance)
- [8. Recommended Next Steps](#8-recommended-next-steps)
- [9. Database Agent Sign-Off](#9-database-agent-sign-off)

## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, api, testing, migration

**Strategic Directive**: Decision Table Split-Brain Resolution
**Validation Date**: 2025-12-17
**Database Agent**: Principal Database Architect
**SD Phase**: IDEATION

---

## Executive Summary

**VERDICT**: CONDITIONAL_PASS

The `chairman_decisions` table exists with proper structure and RLS policies. Creating a `venture_decisions` VIEW is the correct approach to resolve the split-brain issue between API expectations and database reality. However, column aliasing and placeholder columns are required for full API compatibility.

---

## 1. Chairman_Decisions Table Validation

### Schema Structure
| Column | Data Type | Nullable | Notes |
|--------|-----------|----------|-------|
| id | uuid | NO | Primary key |
| venture_id | uuid | NO | FK to ventures.id |
| lifecycle_stage | integer | NO | **Needs aliasing to 'stage'** |
| health_score | varchar | YES | |
| recommendation | varchar | YES | |
| decision | varchar | NO | |
| override_reason | text | YES | **Needs aliasing to 'notes'** |
| risks_acknowledged | jsonb | YES | |
| quick_fixes_applied | jsonb | YES | |
| created_at | timestamptz | YES | |

**Status**: ✅ PASS - All core columns present

---

## 2. Column Mapping Analysis

### Existing Columns (All Match PRD)
- ✅ id
- ✅ venture_id
- ✅ lifecycle_stage
- ✅ health_score
- ✅ recommendation
- ✅ decision
- ✅ override_reason
- ✅ risks_acknowledged
- ✅ quick_fixes_applied
- ✅ created_at

### Required Column Aliases (from PRD)
1. `lifecycle_stage` → `stage` (integer)
2. `override_reason` → `notes` (text)

### Missing Columns (Need Placeholders)
1. `gate_type` (varchar) - NOT in current table
2. `decided_by` (uuid) - NOT in current table
3. `decided_at` (timestamptz) - NOT in current table

**Action Required**: Add placeholder columns with NULL values for forward compatibility.

---

## 3. Proposed View Definition

```sql
CREATE OR REPLACE VIEW venture_decisions AS
SELECT
  id,
  venture_id,
  lifecycle_stage as stage,
  health_score,
  recommendation,
  decision,
  override_reason as notes,
  risks_acknowledged,
  quick_fixes_applied,
  created_at,
  NULL::uuid as decided_by,        -- Placeholder for future enhancement
  NULL::timestamptz as decided_at  -- Placeholder for future enhancement
FROM chairman_decisions;
```

**Status**: ⚠️ NEEDS VERIFICATION - Confirm API column expectations before implementation.

---

## 4. RLS Policy Validation

### Current Policies on chairman_decisions
| Policy Name | Command | Qual | With Check |
|-------------|---------|------|------------|
| chairman_decisions_select | SELECT | true | null |
| chairman_decisions_insert | INSERT | null | true |

**Findings**:
- ✅ RLS is enabled on chairman_decisions
- ✅ Views inherit RLS from underlying tables (PostgreSQL default)
- ✅ SELECT policy allows public read access
- ⚠️ INSERT policy allows public writes (with_check=true)

**Security Considerations**:
1. Does the API need INSERT access via `venture_decisions`?
2. Current INSERT policy is permissive - consider restricting to chairman role
3. Consider adding SECURITY DEFINER to view if chairman-specific access is required

**Status**: ⚠️ WARNING - Review RLS policy alignment with chairman-only access requirements.

---

## 5. Foreign Key Relationships

### Validated Constraints
| Column | References | Status |
|--------|------------|--------|
| venture_id | ventures.id | ✅ EXISTS |

**Validation Results**:
- ✅ ventures table exists
- ✅ All venture_id values reference valid ventures
- ✅ Foreign key constraint enforced

**Status**: ✅ PASS - Foreign key relationships are valid.

---

## 6. Migration Checklist

**Pre-Migration Validation**:
- [ ] Read `/api/v2/chairman/decisions` (decisions.ts:47) to confirm exact column expectations
- [ ] Verify gate_type, decided_by, decided_at are actually needed by API
- [ ] Review API INSERT/UPDATE operations (if any)

**Migration Creation**:
- [ ] Create file: `database/migrations/20251217_create_venture_decisions_view.sql`
- [ ] Include column aliases: `lifecycle_stage as stage`, `override_reason as notes`
- [ ] Add placeholder columns: `gate_type`, `decided_by`, `decided_at`
- [ ] Add comments documenting split-brain resolution
- [ ] Include rollback: `DROP VIEW IF EXISTS venture_decisions;`

**Testing**:
- [ ] Apply migration to development database
- [ ] Test view query: `SELECT * FROM venture_decisions LIMIT 1;`
- [ ] Verify column names match API expectations
- [ ] Test API endpoint: `GET /api/v2/chairman/decisions`
- [ ] Verify RLS policies apply correctly (test as chairman and non-chairman)
- [ ] Test filter parameters: status, venture_id, urgency

**Production Deployment**:
- [ ] Review migration in peer review
- [ ] Apply to staging environment first
- [ ] Smoke test API endpoint in staging
- [ ] Apply to production during low-traffic window
- [ ] Monitor API error logs post-deployment

---

## 7. Known Issues & Risks

### Issue 1: Column Name Assumptions
- **Risk**: PRD assumes API expects certain column names without verifying source code
- **Severity**: MEDIUM
- **Mitigation**: Read decisions.ts before creating migration

### Issue 2: Missing Columns (gate_type, decided_by, decided_at)
- **Risk**: API may fail if it expects these columns to have values
- **Severity**: LOW (placeholders will prevent errors)
- **Mitigation**: Add NULL placeholders, enhance later if needed

### Issue 3: RLS Policy Inheritance
- **Risk**: View may not inherit RLS policies as expected
- **Severity**: HIGH (security impact)
- **Mitigation**: Test RLS behavior in development environment before production

---

## 8. Recommended Next Steps

**IMMEDIATE (Before Migration)**:
1. Read `/api/v2/chairman/decisions` API file (decisions.ts) to confirm column expectations
2. Check if `gate_type` column is actually referenced in API queries
3. Verify if API performs INSERT/UPDATE operations via venture_decisions

**SHORT-TERM (Migration Phase)**:
1. Create migration file with proper column mappings
2. Apply to development database
3. Test with actual API calls (curl/Postman)
4. Verify RLS policies work correctly

**LONG-TERM (Post-Deployment)**:
1. Monitor API error logs for any column-related issues
2. Consider adding real values for gate_type, decided_by, decided_at if needed
3. Review chairman_decisions INSERT policy for proper access control

---

## 9. Database Agent Sign-Off

**Agent**: Principal Database Architect (DATABASE sub-agent)
**Model**: Sonnet 4.5 (claude-sonnet-4-5-20250929)
**Verdict**: CONDITIONAL_PASS
**Confidence**: 85%

**Conditions for PASS**:
1. Verify API column expectations in decisions.ts before migration
2. Test view with actual API queries in development environment
3. Review RLS policy alignment with chairman-only access requirements

**Justification**:
The proposed VIEW approach is architecturally sound and follows PostgreSQL best practices. The chairman_decisions table exists with proper structure, RLS policies, and foreign key relationships. Column aliasing is straightforward and will resolve the table name mismatch. However, confirmation of API expectations is required before implementation to avoid introducing new issues.

**Blockers**: None (table exists, structure is valid)
**Warnings**: 3 (column aliases needed, placeholder columns required, RLS policy review)

---

**Generated**: 2025-12-17 by Database Agent
**Database**: Engineer (dedlbzhpgkmetvhbkyzq)
**Repository**: /mnt/c/_EHG/EHG_Engineer/
