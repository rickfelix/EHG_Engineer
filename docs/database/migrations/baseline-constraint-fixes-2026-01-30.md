---
category: database
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [database, auto-generated]
---
# Baseline Constraint Fixes - January 30, 2026


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Strategic Directive](#strategic-directive)
- [Issue Summary](#issue-summary)
- [Migrations Applied](#migrations-applied)
  - [1. BL-INF-2337A: Sub-Agent Verdict Constraint](#1-bl-inf-2337a-sub-agent-verdict-constraint)
  - [2. BL-INF-2337B: Risk Assessments Phase Constraint](#2-bl-inf-2337b-risk-assessments-phase-constraint)
  - [3. BL-INF-2337C: Retrospectives Metadata Column](#3-bl-inf-2337c-retrospectives-metadata-column)
  - [4. BL-INF-2337D: Classification Model Change](#4-bl-inf-2337d-classification-model-change)
- [Verification](#verification)
  - [Migration Verification Script](#migration-verification-script)
  - [Manual Verification Queries](#manual-verification-queries)
- [Execution History](#execution-history)
- [Impact Assessment](#impact-assessment)
  - [Tables Affected](#tables-affected)
  - [Backward Compatibility](#backward-compatibility)
  - [Performance Impact](#performance-impact)
- [Root Cause Analysis](#root-cause-analysis)
- [Related Documentation](#related-documentation)
- [Follow-Up Actions](#follow-up-actions)

## Metadata
- **Category**: Database
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Opus 4.5 (EXEC Agent)
- **Last Updated**: 2026-01-30
- **Tags**: migrations, constraints, baseline-fixes, sub-agents

## Overview

This document records database constraint fixes applied on 2026-01-30 to resolve four baseline issues (BL-INF-2337A through BL-INF-2337D) identified during sub-agent orchestration operations.

## Strategic Directive

- **SD**: SD-LEO-INFRA-DATABASE-CONSTRAINT-SCHEMA-001
- **Title**: Database Constraint Schema Compliance Fixes
- **Type**: infrastructure
- **PR**: https://github.com/rickfelix/EHG_Engineer/pull/698

## Issue Summary

| Issue ID | Table | Problem | Impact |
|----------|-------|---------|--------|
| BL-INF-2337A | `sub_agent_execution_results` | verdict constraint only allowed 5 values | Sub-agents without automation couldn't emit MANUAL_REQUIRED |
| BL-INF-2337B | `risk_assessments` | phase constraint only accepted detailed phases | Code passing standard LEO phases (LEAD, PLAN, EXEC) failed |
| BL-INF-2337C | `retrospectives` | Missing metadata column | Inconsistent with other core tables |
| BL-INF-2337D | N/A (code only) | gpt-5-mini doesn't support temperature parameter | Classification API calls failed with 400 error |

## Migrations Applied

### 1. BL-INF-2337A: Sub-Agent Verdict Constraint

**File**: `database/migrations/20260130_fix_sub_agent_verdict_constraint.sql`

**Changes**:
- Dropped existing `valid_verdict` constraint
- Added new constraint accepting 8 verdict values:
  - Existing: PASS, FAIL, BLOCKED, CONDITIONAL_PASS, WARNING
  - Added: MANUAL_REQUIRED, PENDING, ERROR

**SQL**:
```sql
ALTER TABLE sub_agent_execution_results
DROP CONSTRAINT IF EXISTS valid_verdict;

ALTER TABLE sub_agent_execution_results
ADD CONSTRAINT valid_verdict
CHECK (verdict IN (
  'PASS',
  'FAIL',
  'BLOCKED',
  'CONDITIONAL_PASS',
  'WARNING',
  'MANUAL_REQUIRED',  -- New: When sub-agent has no automation module
  'PENDING',          -- New: When execution is pending
  'ERROR'             -- New: When execution errors occur
));
```

**Reason**: Sub-agents without automation modules (like MANUAL_REQUIRED) need to record their verdict. Also supports async execution states (PENDING) and error handling (ERROR).

---

### 2. BL-INF-2337B: Risk Assessments Phase Constraint

**File**: `database/migrations/20260130_fix_risk_assessments_phase_constraint.sql`

**Changes**:
- Dropped existing `risk_assessments_phase_check` constraint
- Expanded constraint to accept both detailed and standard LEO phase names

**SQL**:
```sql
ALTER TABLE risk_assessments
DROP CONSTRAINT IF EXISTS risk_assessments_phase_check;

ALTER TABLE risk_assessments
ADD CONSTRAINT risk_assessments_phase_check
CHECK (phase IN (
  -- Detailed phase names (original)
  'LEAD_PRE_APPROVAL',
  'PLAN_PRD',
  'EXEC_IMPL',
  'PLAN_VERIFY',
  -- Standard LEO phase names (added)
  'LEAD',
  'LEAD_APPROVAL',
  'PLAN',
  'EXEC',
  'VERIFY',
  'PLAN_VERIFICATION'
));
```

**Reason**: Code may pass standard LEO phase names (LEAD, PLAN, EXEC, VERIFY) instead of detailed phase names (LEAD_PRE_APPROVAL, PLAN_PRD, etc.). Constraint needs to accept both formats.

---

### 3. BL-INF-2337C: Retrospectives Metadata Column

**File**: `database/migrations/20260130_add_metadata_to_retrospectives.sql`

**Changes**:
- Added `metadata` JSONB column with default `'{}'::jsonb`
- Created GIN index `idx_retrospectives_metadata` for efficient JSON querying
- Added column comment documenting purpose and date

**SQL**:
```sql
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_retrospectives_metadata
ON retrospectives USING GIN (metadata);

COMMENT ON COLUMN retrospectives.metadata IS
'Flexible JSONB storage for retrospective metadata. Added 2026-01-30 per RCA BL-INF-2337C for consistency with other core tables.';
```

**Reason**: Core tables like `strategic_directives_v2`, `execution_sequences_v2`, and `hap_blocks_v2` all have metadata columns. The `retrospectives` table was inconsistent.

---

### 4. BL-INF-2337D: Classification Model Change

**File**: `lib/config/model-config.js`

**Changes**:
- Changed `classification` purpose model from `gpt-5-mini` to `gpt-5.2`

**Code**:
```javascript
const MODEL_DEFAULTS = {
  openai: {
    validation: 'gpt-5.2',
    classification: 'gpt-5.2',  // Changed from 'gpt-5-mini'
    generation: 'gpt-5.2',
    fast: 'gpt-5-mini',
    vision: 'gpt-4o',
  },
  // ...
};
```

**Reason**: `gpt-5-mini` doesn't support the `temperature` parameter (only supports `temperature=1`). The SD type classifier uses `temperature: 0` for deterministic output, causing 400 errors. `gpt-5.2` supports custom temperature values.

## Verification

### Migration Verification Script

**File**: `scripts/verify-migrations-20260130.js`

Verifies all three database migrations were applied correctly:
- Checks verdict constraint values
- Checks phase constraint values
- Checks retrospectives metadata column exists with GIN index

### Manual Verification Queries

```sql
-- Verify verdict constraint
SELECT con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
WHERE con.conname = 'valid_verdict';

-- Verify phase constraint
SELECT con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
WHERE con.conname = 'risk_assessments_phase_check';

-- Verify metadata column
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'retrospectives' AND column_name = 'metadata';

-- Verify GIN index
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'retrospectives' AND indexname = 'idx_retrospectives_metadata';
```

## Execution History

| Migration | Execution Date | Method | Status |
|-----------|----------------|--------|--------|
| 20260130_fix_sub_agent_verdict_constraint.sql | 2026-01-30 | database-agent | ✅ SUCCESS |
| 20260130_fix_risk_assessments_phase_constraint.sql | 2026-01-30 | database-agent | ✅ SUCCESS |
| 20260130_add_metadata_to_retrospectives.sql | 2026-01-30 | database-agent | ✅ SUCCESS |
| lib/config/model-config.js | 2026-01-30 | direct edit | ✅ SUCCESS |

## Impact Assessment

### Tables Affected
- `sub_agent_execution_results` - 1 constraint modified
- `risk_assessments` - 1 constraint modified
- `retrospectives` - 1 column added, 1 index added

### Backward Compatibility
- ✅ **Fully backward compatible** - All changes expand allowed values or add optional columns
- ✅ No breaking changes to existing data
- ✅ Existing code continues to work without modification

### Performance Impact
- **Minimal** - Constraint checks are O(1) operations
- **GIN Index** - Improves JSONB query performance on retrospectives.metadata

## Root Cause Analysis

**Systemic Issue**: Lack of contract validation between code and external systems (database, APIs)

The constraint violations occurred because:
1. Code evolved to emit new verdict values (`MANUAL_REQUIRED`, `PENDING`, `ERROR`) without updating database constraints
2. Code used both detailed and standard phase names without unified constraint support
3. Schema inconsistency (metadata column missing) went undetected

**CAPA (Corrective and Preventive Actions)**:
1. ✅ **Corrective**: Applied all four fixes (migrations + code change)
2. 🔄 **Preventive**: Create SD-LEO-INFRA-POST-COMPLETION-SEQUENCE-001 to document SD-type-aware post-completion sequences (prevents similar documentation gaps)

## Related Documentation

- **RCA Document**: (internal conversation - not stored)
- **PR**: https://github.com/rickfelix/EHG_Engineer/pull/698
- **Verification Script**: `scripts/verify-migrations-20260130.js`
- **Migration Files**: `database/migrations/20260130_*.sql`

## Follow-Up Actions

- [x] Migrations executed in production
- [x] Verification script created and run
- [x] Code change deployed (model-config.js)
- [x] PR merged to main
- [ ] Create SD-LEO-INFRA-POST-COMPLETION-SEQUENCE-001 (to fix documentation gap)
- [ ] Monitor sub-agent executions for next 7 days to ensure no related issues

---

*Migration notes version: 1.0.0*
*Last verified: 2026-01-30*
*Part of LEO Protocol v4.3.3*
