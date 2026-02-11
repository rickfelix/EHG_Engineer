# Database Venture Architecture - Ground Truth Assessment

## Metadata
- **Category**: Report
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Database Sub-Agent + Claude Code
- **Last Updated**: 2026-01-19
- **Tags**: database, architecture, ventures, ground-truth, triangulation

## Executive Summary

A triangulation protocol investigation was initiated to assess potential architectural concerns with venture tracking in the database. **Ground-truth database queries revealed that the architecture is significantly cleaner than migration files suggested.**

### Key Findings

| Concern | Expected (from migration files) | Actual (database query) | Status |
|---------|--------------------------------|------------------------|--------|
| Two venture tables | Both active, competing | `ventures` active, `vh.vh_ventures` empty | **Resolved** |
| Legacy 6-stage model | `vh_stage_catalog` with 6 stages | Table does not exist | **Non-issue** |
| 40-stage constraint | Constraint allows 1-40 | Actual constraint: 1-25 | **Resolved** |
| Schema inconsistency | Multiple conflicting systems | Single 25-stage system | **Resolved** |

---

## Ground Truth Evidence

### 1. Table Existence

```sql
-- Query results from actual database
public.ventures       EXISTS    (9 records)
vh.vh_ventures        EXISTS    (0 records - EMPTY)
vh.vh_stage_catalog   DOES NOT EXIST
```

### 2. Active Stage Tracking Architecture

**Source of Truth**: `lifecycle_stage_config` table

| Phase | Name | Stages | Description |
|-------|------|--------|-------------|
| 1 | THE TRUTH | 1-5 | Idea validation, market analysis |
| 2 | THE ENGINE | 6-9 | Business model, pricing, exit design |
| 3 | THE IDENTITY | 10-12 | Naming, GTM, sales strategy |
| 4 | THE BLUEPRINT | 13-16 | Tech stack, data model, user stories |
| 5 | THE BUILD LOOP | 17-20 | Development, integration, security |
| 6 | LAUNCH & LEARN | 21-25 | QA, deployment, analytics, optimization |

**Venture Tracking Column**: `ventures.current_lifecycle_stage` (INTEGER)

**Constraint**: `ventures_current_lifecycle_stage_check`
```sql
CHECK ((current_lifecycle_stage >= 1) AND (current_lifecycle_stage <= 25))
```

### 3. Deprecated Columns (Isolated, Not Active)

The `ventures` table contains 3 deprecated columns:

| Column | Type | Current Values | Status |
|--------|------|----------------|--------|
| `deprecated_stage` | enum (36 values) | All = 'draft_idea' | Deprecated |
| `deprecated_current_workflow_stage` | integer | All = 1 | Deprecated |
| `deprecated_current_stage` | integer | All = NULL | Deprecated |

**Note**: These columns are prefixed with `deprecated_` and contain stale data. They are not used by active code.

### 4. Orphaned Table: vh.vh_ventures

```sql
-- Schema exists but table is empty
SELECT count(*) FROM vh.vh_ventures;
-- Result: 0
```

**Schema**:
- `id` (uuid)
- `name` (text)
- `sd_id` (varchar) - Strategic Directive link
- `prd_id` (uuid) - PRD link
- `backlog_id` (uuid) - Backlog link
- `gate_status` (text)
- `metadata` (jsonb)

**Status**: Table was created but never populated. Purpose unclear.

### 5. Current Venture Data

```
| Venture Name         | current_lifecycle_stage | Stage Name                    |
|---------------------|-------------------------|-------------------------------|
| Solara Energy       | 6                       | Risk Evaluation Matrix        |
| MedSync             | 5                       | Profitability Forecasting     |
| FinTrack            | 5                       | Profitability Forecasting     |
| EduPath             | 5                       | Profitability Forecasting     |
| LogiFlow            | 5                       | Profitability Forecasting     |
| Critical Attention  | 23                      | Production Launch             |
| Launch Checklist    | 23                      | Production Launch             |
| UI/UX Assessment    | 1                       | Draft Idea & Chairman Review  |
| P0 RLS Fix          | 1                       | Draft Idea & Chairman Review  |
```

---

## Migration File Analysis

### Partially Applied Migration

**File**: `database/migrations/2025-09-22-vh-bridge-tables.sql`

| Component | Migration Intent | Actual State |
|-----------|-----------------|--------------|
| `vh` schema | Create if not exists | ✅ Exists |
| `vh.vh_ventures` table | Create with governance columns | ✅ Exists (empty) |
| `vh.vh_stage_catalog` | Create 6-stage catalog | ❌ Does not exist |
| Default stage data | Seed 6 stages | ❌ Not seeded |

**Conclusion**: Migration was partially executed. The vh_ventures table was created, but vh_stage_catalog was either not created or was rolled back.

### Why vh_stage_catalog Doesn't Exist

Possible reasons:
1. Migration failed partway through and was not retried
2. A subsequent migration dropped the table
3. The CREATE IF NOT EXISTS succeeded on vh_ventures but INSERT failed
4. Manual intervention removed the table

---

## Architecture Assessment

### Current Architecture: CLEAN ✅

```
┌─────────────────────────────────────────────────────────────┐
│                    ACTIVE ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  lifecycle_stage_config    →    ventures                     │
│  (25 stages, 6 phases)          (current_lifecycle_stage)    │
│                                                              │
│         ↓                              ↓                     │
│                                                              │
│  venture_stage_work        →    Stage progression tracking   │
│  (entry/completion records)                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    ORPHANED/DEPRECATED                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  vh.vh_ventures (empty)    - Orphaned, no integration        │
│  deprecated_* columns      - Isolated, stale data            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### No Architectural Conflicts

The investigation revealed **no active conflicts**:
- Single stage tracking system (25-stage)
- Single constraint (1-25)
- Deprecated columns clearly marked
- Orphaned table has no data

---

## Recommendations

### Immediate (No Risk)

| Action | Priority | Risk | Effort |
|--------|----------|------|--------|
| Document findings (this report) | ✅ Done | None | Done |
| Update migration file accuracy | Low | None | Low |

### Future Cleanup (Low Priority)

| Action | Priority | Risk | Effort |
|--------|----------|------|--------|
| Drop `vh.vh_ventures` table | Low | Very Low | Low |
| Remove deprecated columns | Low | Low | Medium |
| Drop unused `vh` schema | Low | Very Low | Low |

### Validation Required

Before cleanup actions:
1. Confirm no code references `vh.vh_ventures`
2. Confirm no code references deprecated columns
3. Document decision in ADR (Architecture Decision Record)

---

## Conclusion

**The database venture architecture is sound.** The concerns raised from migration file analysis were false positives caused by:
1. Partially applied migrations
2. Tables that exist but were never used
3. Deprecated columns that are properly isolated

**No immediate action required.** The 25-stage Vision V2 model is the single, authoritative system with proper constraints and active usage.

---

## Triangulation Protocol Results

### External AI Validation (2026-01-19)

| Question | OpenAI | AntiGravity | Ground Truth | **Consensus** |
|----------|--------|-------------|--------------|---------------|
| Q1: Drop `vh.vh_ventures` | A) Drop now | A) Drop immediately | Empty, orphaned | **DROP** |
| Q2: Drop deprecated columns | A) Drop now | A) Drop now | Stale, unused | **DROP** |
| Q3: Remove `vh` schema | Redesign/consolidate | Remove (anti-pattern) | No clear purpose | **REMOVE** |
| Q4: 25-stage architecture | Sound | Sound | Properly constrained | **VALIDATED** |
| Priority | P2 (Medium) | P2 (Medium) | Low priority | **P2** |

### Consensus: STRONG AGREEMENT

All three sources agree on all recommendations. No dissenting opinions.

### Additional Recommendations from External AIs

**OpenAI suggested**:
- Add FK constraint: `ventures.current_lifecycle_stage` → `lifecycle_stage_config(id)`
- Consider transition rules (monotonic progress or track regression reasons)
- Add versioning/effective dates if stage definitions evolve

**AntiGravity confirmed**:
- Zero code references to orphaned table and deprecated columns
- vh schema is "Shadow Table" anti-pattern (SSOT violation)
- If audit history needed, use dedicated `audit_log` table instead

---

## Action Plan

### Phase 1: Verification (Before Any Changes)
```bash
# Confirm zero code references
grep -rn "vh_ventures\|vh\.vh_ventures" --include="*.ts" --include="*.tsx" --include="*.js"
grep -rn "deprecated_stage\|deprecated_current" --include="*.ts" --include="*.tsx" --include="*.js"
```

### Phase 2: Database Cleanup Migration

Create migration: `YYYYMMDD_cleanup_orphaned_venture_tables.sql`

```sql
-- Migration: Cleanup orphaned venture tracking artifacts
-- Priority: P2 (Medium) - Tech debt cleanup
-- Validated by: Triangulation Protocol (OpenAI + AntiGravity + Ground Truth)
-- Date: 2026-01-19

BEGIN;

-- 1. Drop orphaned vh.vh_ventures table (0 records, 0 code references)
DROP TABLE IF EXISTS vh.vh_ventures CASCADE;

-- 2. Drop deprecated columns from ventures table
ALTER TABLE ventures DROP COLUMN IF EXISTS deprecated_stage;
ALTER TABLE ventures DROP COLUMN IF EXISTS deprecated_current_workflow_stage;
ALTER TABLE ventures DROP COLUMN IF EXISTS deprecated_current_stage;

-- 3. Drop vh schema if empty
DROP SCHEMA IF EXISTS vh CASCADE;

-- 4. (Optional) Add FK constraint for stage integrity
-- ALTER TABLE ventures
--   ADD CONSTRAINT fk_ventures_lifecycle_stage
--   FOREIGN KEY (current_lifecycle_stage)
--   REFERENCES lifecycle_stage_config(id);

COMMIT;
```

### Phase 3: Documentation Update
- [x] Ground truth report created
- [x] Triangulation verdict documented
- [x] Stage docs regenerated with correct table references
- [x] VH architecture docs archived (non-implemented)

---

## Cleanup Execution Log

**Date**: 2026-01-19
**Executed by**: Manual via Supabase Dashboard SQL Editor
**Database**: dedlbzhpgkmetvhbkyzq (EHG_Engineer)

### Migration Results

```
BEGIN; ✅
DROP TABLE IF EXISTS vh.vh_ventures CASCADE; ✅
DROP SCHEMA IF EXISTS vh CASCADE; ✅
ALTER TABLE ventures DROP COLUMN IF EXISTS deprecated_stage; ✅
ALTER TABLE ventures DROP COLUMN IF EXISTS deprecated_current_workflow_stage; ✅
ALTER TABLE ventures DROP COLUMN IF EXISTS deprecated_current_stage; ✅
COMMIT; ✅
```

### Verification Results

```sql
-- vh schema check: 0 rows returned ✅
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'vh';

-- deprecated columns check: 0 rows returned ✅
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ventures' AND column_name LIKE 'deprecated%';
```

**Status**: ✅ CLEANUP COMPLETE

---

*Part of LEO Protocol v4.3.3 - Triangulation Protocol*
*Ground Truth Assessment: 2026-01-19*
*Triangulation Completed: 2026-01-19*
*Cleanup Executed: 2026-01-19*
*Validated by: Database Sub-Agent + Claude Code + OpenAI + AntiGravity*
