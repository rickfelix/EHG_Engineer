---
category: deployment
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [deployment, auto-generated]
---
# Migration Phase A Runbook: Kochel Integration



## Table of Contents

- [Metadata](#metadata)
- [1. Scope & Assumptions](#1-scope-assumptions)
  - [1.1 Target Environment](#11-target-environment)
  - [1.2 Tables & Schemas Impacted](#12-tables-schemas-impacted)
  - [1.3 Assumptions](#13-assumptions)
- [2. Pre-Migration Checks](#2-pre-migration-checks)
  - [2.1 Environment Sanity Check](#21-environment-sanity-check)
  - [2.2 Existing Data State](#22-existing-data-state)
  - [2.3 Prerequisite Table Verification](#23-prerequisite-table-verification)
- [3. Execution Steps](#3-execution-steps)
  - [3.1 Environment Setup](#31-environment-setup)
  - [3.2 Migration Execution Order](#32-migration-execution-order)
- [4. Post-Migration Verification](#4-post-migration-verification)
  - [4.1 Lifecycle Stage Config Verification](#41-lifecycle-stage-config-verification)
  - [4.2 Vision Transition SD Hierarchy Verification](#42-vision-transition-sd-hierarchy-verification)
  - [4.3 Venture Artifacts Quality Score Verification](#43-venture-artifacts-quality-score-verification)
  - [4.4 CrewAI Contracts Verification](#44-crewai-contracts-verification)
- [5. Rollback Procedure](#5-rollback-procedure)
  - [5.1 When to Rollback](#51-when-to-rollback)
  - [5.2 Rollback Execution Order](#52-rollback-execution-order)
  - [5.3 Rollback Verification](#53-rollback-verification)
- [6. Sign-off Checklist](#6-sign-off-checklist)
  - [6.1 Pre-Execution Checklist](#61-pre-execution-checklist)
  - [6.2 Post-Migration Sign-off](#62-post-migration-sign-off)
  - [6.3 Chairman Declaration](#63-chairman-declaration)
- [Appendix A: Quick Reference Commands](#appendix-a-quick-reference-commands)

## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, migration, schema, authorization

**Version**: 1.0
**Date**: 2025-12-09
**Author**: Lead Systems Architect (Claude)
**Approval**: Chairman, EHG (ADR-002 APPROVED 2025-12-09)

**Status**: RUNBOOK ONLY - DO NOT EXECUTE WITHOUT EXPLICIT CHAIRMAN AUTHORIZATION

---

## 1. Scope & Assumptions

### 1.1 Target Environment

| Parameter | Value |
|-----------|-------|
| **Environment** | Development (non-production) |
| **Database** | Supabase Dev Instance |
| **Project Ref** | `dedlbzhpgkmetvhbkyzq` (verify before execution) |
| **Host** | `db.dedlbzhpgkmetvhbkyzq.supabase.co` |
| **Port** | 5432 |
| **Database** | `postgres` |

### 1.2 Tables & Schemas Impacted

| Table | Action | Migration File |
|-------|--------|----------------|
| `lifecycle_stage_config` | CREATE (new) | `20251206_lifecycle_stage_config.sql` |
| `lifecycle_phases` | CREATE (new) | `20251206_lifecycle_stage_config.sql` |
| `advisory_checkpoints` | CREATE (new) | `20251206_lifecycle_stage_config.sql` |
| `strategic_directives_v2` | INSERT/UPDATE (existing) | `20251206_vision_transition_parent_orchestrator.sql` |
| `venture_artifacts` | ALTER (add columns) | `20251209_venture_artifacts_quality_score.sql` |
| `leo_interfaces` | INSERT (existing table) | `20251209_kochel_crewai_contracts.sql` |

### 1.3 Assumptions

1. **ADR-002 is APPROVED** - Confirmed 2025-12-09
2. **Database credentials available** - Either via environment variable or Supabase dashboard
3. **`psql` CLI available** - Or Supabase SQL Editor as alternative
4. **Existing tables exist**: `strategic_directives_v2`, `venture_artifacts`, `leo_interfaces`
5. **No active transactions** - Migration runs during low-activity window
6. **Backup exists** - Point-in-time recovery available via Supabase

---

## 2. Pre-Migration Checks

### 2.1 Environment Sanity Check

Confirm you're connected to the correct database:

```sql
-- 2.1.1: Verify database identity
SELECT
  current_database() AS db_name,
  current_user AS connected_user,
  inet_server_addr() AS server_ip,
  version() AS pg_version;

-- Expected: db_name = 'postgres', connected_user = 'postgres' or service role
```

```sql
-- 2.1.2: Verify this is DEV (not PROD)
-- Look for test data indicators
SELECT COUNT(*) AS test_sd_count
FROM strategic_directives_v2
WHERE id LIKE 'SD-TEST-%' OR title ILIKE '%test%';

-- DEV environment typically has test SDs; PROD should have 0
-- If count is 0 and you expect DEV, STOP and verify environment
```

### 2.2 Existing Data State

```sql
-- 2.2.1: Count existing SDs (baseline)
SELECT
  COUNT(*) AS total_sds,
  COUNT(*) FILTER (WHERE id LIKE 'SD-VISION-TRANSITION-001%') AS vision_transition_sds,
  COUNT(*) FILTER (WHERE parent_sd_id IS NOT NULL) AS child_sds
FROM strategic_directives_v2;

-- Record these values for post-migration comparison
-- Expected before migration: vision_transition_sds = 1 (just the parent)
```

```sql
-- 2.2.2: Check if lifecycle tables already exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('lifecycle_stage_config', 'lifecycle_phases', 'advisory_checkpoints');

-- Expected: 0 rows (tables don't exist yet)
-- If tables exist, migration may have already run - investigate before proceeding
```

```sql
-- 2.2.3: Check venture_artifacts current columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'venture_artifacts'
  AND column_name IN ('quality_score', 'validation_status', 'validated_at', 'validated_by');

-- Expected: 0 rows (columns don't exist yet)
```

```sql
-- 2.2.4: Check leo_interfaces for existing Kochel contracts
SELECT COUNT(*) AS kochel_contracts
FROM leo_interfaces
WHERE prd_id = 'KOCHEL-INTEGRATION';

-- Expected: 0 (contracts not yet inserted)
```

### 2.3 Prerequisite Table Verification

```sql
-- 2.3.1: Verify strategic_directives_v2 exists and has required columns
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2'
  AND column_name IN ('id', 'parent_sd_id', 'status', 'metadata');

-- Expected: 4 rows (all columns exist)
```

```sql
-- 2.3.2: Verify leo_interfaces exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'leo_interfaces'
) AS leo_interfaces_exists;

-- Expected: true
```

```sql
-- 2.3.3: Verify venture_artifacts exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'venture_artifacts'
) AS venture_artifacts_exists;

-- Expected: true
```

---

## 3. Execution Steps

### 3.1 Environment Setup

```bash
# Set connection variables (replace with actual values)
export PGHOST="db.dedlbzhpgkmetvhbkyzq.supabase.co"
export PGPORT="5432"
export PGDATABASE="postgres"
export PGUSER="postgres"
# PGPASSWORD should be retrieved from Supabase dashboard or secrets manager
# DO NOT hardcode in scripts

# Verify connection
psql -c "SELECT 1 AS connection_test;"
```

### 3.2 Migration Execution Order

**CRITICAL**: Execute in this exact order. Each step must complete successfully before proceeding.

#### Step 1: Lifecycle Stage Configuration

```bash
# Navigate to migrations directory
cd /mnt/c/_EHG/EHG_Engineer/database/migrations

# Execute migration 1
psql -f 20251206_lifecycle_stage_config.sql 2>&1 | tee migration_1_output.log

# Verify success (check for errors)
grep -i "error" migration_1_output.log
# Expected: No output (no errors)
```

**Checkpoint 1**: Verify before proceeding:
```sql
SELECT COUNT(*) AS stage_count FROM lifecycle_stage_config;
-- Expected: 25
```

#### Step 2: Vision Transition SD Hierarchy

```bash
# Execute migration 2
psql -f 20251206_vision_transition_parent_orchestrator.sql 2>&1 | tee migration_2_output.log

# Verify success
grep -i "error" migration_2_output.log
# Expected: No output (no errors)
```

**Checkpoint 2**: Verify before proceeding:
```sql
SELECT COUNT(*) FROM strategic_directives_v2
WHERE id LIKE 'SD-VISION-TRANSITION-001%';
-- Expected: 12 (1 parent + 5 children + 6 grandchildren)
```

#### Step 3: Venture Artifacts Quality Score

```bash
# Execute migration 3
psql -f 20251209_venture_artifacts_quality_score.sql 2>&1 | tee migration_3_output.log

# Verify success
grep -i "error" migration_3_output.log
# Expected: No output (no errors)
```

**Checkpoint 3**: Verify before proceeding:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'venture_artifacts' AND column_name = 'quality_score';
-- Expected: 1 row
```

#### Step 4: Kochel CrewAI Contracts

```bash
# Execute migration 4
psql -f 20251209_kochel_crewai_contracts.sql 2>&1 | tee migration_4_output.log

# Verify success
grep -i "error" migration_4_output.log
# Expected: No output (no errors)
```

**Checkpoint 4**: Verify:
```sql
SELECT COUNT(*) FROM leo_interfaces WHERE prd_id = 'KOCHEL-INTEGRATION';
-- Expected: 4
```

---

## 4. Post-Migration Verification

### 4.1 Lifecycle Stage Config Verification

```sql
-- 4.1.1: Total stage count
SELECT COUNT(*) AS total_stages FROM lifecycle_stage_config;
-- Expected: 25

-- 4.1.2: Stages per phase
SELECT phase_number, phase_name, COUNT(*) AS stage_count
FROM lifecycle_stage_config
GROUP BY phase_number, phase_name
ORDER BY phase_number;
-- Expected:
-- 1, THE TRUTH, 5
-- 2, THE ENGINE, 4
-- 3, THE IDENTITY, 3
-- 4, THE BLUEPRINT, 4
-- 5, THE BUILD LOOP, 4
-- 6, LAUNCH & LEARN, 5

-- 4.1.3: SD-required stages
SELECT COUNT(*) AS sd_required_stages
FROM lifecycle_stage_config
WHERE sd_required = true;
-- Expected: 12

-- 4.1.4: Advisory-enabled stages
SELECT stage_number, stage_name
FROM lifecycle_stage_config
WHERE advisory_enabled = true;
-- Expected: 3 rows (stages 3, 5, 16)

-- 4.1.5: Work type distribution
SELECT work_type, COUNT(*)
FROM lifecycle_stage_config
GROUP BY work_type;
-- Expected: artifact_only, automated_check, decision_gate, sd_required all represented

-- 4.1.6: Helper functions exist
SELECT proname FROM pg_proc
WHERE proname IN ('get_stage_info', 'get_sd_required_stages', 'get_stages_by_phase');
-- Expected: 3 rows
```

### 4.2 Vision Transition SD Hierarchy Verification

```sql
-- 4.2.1: Full hierarchy
SELECT id, title, parent_sd_id, status
FROM strategic_directives_v2
WHERE id LIKE 'SD-VISION-TRANSITION-001%'
ORDER BY id;
-- Expected: 12 rows with correct parent relationships

-- 4.2.2: Parent orchestrator
SELECT id, title, status,
       metadata->>'child_scope' AS child_scope
FROM strategic_directives_v2
WHERE id = 'SD-VISION-TRANSITION-001';
-- Expected: 1 row, status should show orchestrator role

-- 4.2.3: Child count by parent
SELECT parent_sd_id, COUNT(*) AS children
FROM strategic_directives_v2
WHERE parent_sd_id LIKE 'SD-VISION-TRANSITION-001%'
GROUP BY parent_sd_id;
-- Expected:
-- SD-VISION-TRANSITION-001: 5 children (A-E)
-- SD-VISION-TRANSITION-001D: 6 children (D1-D6)

-- 4.2.4: Verify no orphaned SDs
SELECT id FROM strategic_directives_v2
WHERE id LIKE 'SD-VISION-TRANSITION-001%'
  AND id != 'SD-VISION-TRANSITION-001'
  AND parent_sd_id IS NULL;
-- Expected: 0 rows (all children have parents)
```

### 4.3 Venture Artifacts Quality Score Verification

```sql
-- 4.3.1: New columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'venture_artifacts'
  AND column_name IN ('quality_score', 'validation_status', 'validated_at', 'validated_by')
ORDER BY column_name;
-- Expected: 4 rows

-- 4.3.2: Check constraint on quality_score
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'venture_artifacts'::regclass
  AND conname LIKE '%quality_score%';
-- Expected: CHECK (quality_score >= 0 AND quality_score <= 100)

-- 4.3.3: Check constraint on validation_status
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'venture_artifacts'::regclass
  AND conname LIKE '%validation_status%';
-- Expected: CHECK for ('pending', 'validated', 'rejected', 'needs_revision')

-- 4.3.4: Helper functions exist
SELECT proname FROM pg_proc
WHERE proname IN ('check_venture_quality_gate', 'get_artifacts_pending_validation');
-- Expected: 2 rows

-- 4.3.5: Test quality gate function (should return empty/zero for non-existent venture)
SELECT * FROM check_venture_quality_gate('00000000-0000-0000-0000-000000000000', 5);
-- Expected: passes_gate=false, avg_quality_score=0, artifacts_reviewed=0
```

### 4.4 CrewAI Contracts Verification

```sql
-- 4.4.1: Contract count
SELECT COUNT(*) AS kochel_contracts
FROM leo_interfaces
WHERE prd_id = 'KOCHEL-INTEGRATION';
-- Expected: 4

-- 4.4.2: Contract names and versions
SELECT name, version, validation_status
FROM leo_interfaces
WHERE prd_id = 'KOCHEL-INTEGRATION'
ORDER BY name;
-- Expected:
-- build-planner-v1, 1.0.0, valid
-- epic-planner-v1, 1.0.0, valid
-- journey-map-generator-v1, 1.0.0, valid
-- route-map-suggester-v1, 1.0.0, valid

-- 4.4.3: Verify contract specs have required fields
SELECT
  name,
  spec->>'contract_id' AS contract_id,
  spec->>'trigger_stages' AS trigger_stages,
  spec->>'trigger_mode' AS trigger_mode,
  spec->'error_handling'->>'timeout_ms' AS timeout_ms
FROM leo_interfaces
WHERE prd_id = 'KOCHEL-INTEGRATION';
-- Expected: All contracts have contract_id, trigger_stages, trigger_mode, error_handling

-- 4.4.4: Verify journey-map-generator output artifact
SELECT spec->>'output_artifact' AS output_artifact
FROM leo_interfaces
WHERE prd_id = 'KOCHEL-INTEGRATION' AND name = 'journey-map-generator-v1';
-- Expected: user_journey_map
```

---

## 5. Rollback Procedure

### 5.1 When to Rollback

**ROLLBACK IS APPROPRIATE WHEN**:
- Migration fails partway through execution
- Post-migration verification reveals incorrect data
- Critical functionality is broken after migration
- Unexpected errors in application logs

**ROLLBACK IS NOT APPROPRIATE WHEN**:
- Migration completed successfully but you want to make design changes
- Application code hasn't been updated to use new schema (this is expected)
- Minor discrepancies that can be fixed with targeted updates

### 5.2 Rollback Execution Order

**CRITICAL**: Rollback in REVERSE order of execution.

```bash
cd /mnt/c/_EHG/EHG_Engineer/database/migrations

# Step 4 Rollback: Remove CrewAI contracts (inline rollback)
psql -c "DELETE FROM leo_interfaces WHERE prd_id = 'KOCHEL-INTEGRATION';"
psql -c "DROP INDEX IF EXISTS idx_leo_interfaces_prd_name;"

# Step 3 Rollback: Remove quality_score columns (inline rollback)
psql -c "DROP FUNCTION IF EXISTS get_artifacts_pending_validation(UUID);"
psql -c "DROP FUNCTION IF EXISTS check_venture_quality_gate(UUID, INT, INT);"
psql -c "DROP INDEX IF EXISTS idx_venture_artifacts_validation_status;"
psql -c "DROP INDEX IF EXISTS idx_venture_artifacts_quality_score;"
psql -c "ALTER TABLE venture_artifacts DROP COLUMN IF EXISTS validated_by;"
psql -c "ALTER TABLE venture_artifacts DROP COLUMN IF EXISTS validated_at;"
psql -c "ALTER TABLE venture_artifacts DROP COLUMN IF EXISTS validation_status;"
psql -c "ALTER TABLE venture_artifacts DROP COLUMN IF EXISTS quality_score;"

# Step 2 Rollback: Vision Transition SD hierarchy
psql -f 20251206_vision_transition_parent_orchestrator_rollback.sql 2>&1 | tee rollback_2_output.log

# Step 1 Rollback: Lifecycle stage config
psql -f 20251206_lifecycle_stage_config_rollback.sql 2>&1 | tee rollback_1_output.log
```

### 5.3 Rollback Verification

```sql
-- Verify lifecycle tables removed
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('lifecycle_stage_config', 'lifecycle_phases', 'advisory_checkpoints');
-- Expected: 0 rows

-- Verify SD hierarchy removed
SELECT COUNT(*) FROM strategic_directives_v2
WHERE id LIKE 'SD-VISION-TRANSITION-001%' AND id != 'SD-VISION-TRANSITION-001';
-- Expected: 0 (only parent remains, children deleted)

-- Verify quality_score columns removed
SELECT column_name FROM information_schema.columns
WHERE table_name = 'venture_artifacts'
  AND column_name IN ('quality_score', 'validation_status');
-- Expected: 0 rows

-- Verify CrewAI contracts removed
SELECT COUNT(*) FROM leo_interfaces WHERE prd_id = 'KOCHEL-INTEGRATION';
-- Expected: 0
```

---

## 6. Sign-off Checklist

### 6.1 Pre-Execution Checklist

| # | Item | Verified |
|---|------|----------|
| 1 | Connected to correct DEV database (not PROD) | ☐ |
| 2 | Pre-migration checks completed (Section 2) | ☐ |
| 3 | All 4 migration files present in `database/migrations/` | ☐ |
| 4 | Both rollback files present | ☐ |
| 5 | Database backup confirmed available | ☐ |
| 6 | Chairman authorization received for DEV migration | ☐ |

### 6.2 Post-Migration Sign-off

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | All 4 migrations executed without errors | ☐ | |
| 2 | `lifecycle_stage_config` contains 25 stages | ☐ | |
| 3 | `lifecycle_phases` contains 6 phases | ☐ | |
| 4 | `advisory_checkpoints` contains 3 checkpoints | ☐ | |
| 5 | SD hierarchy: 12 Vision Transition SDs present | ☐ | |
| 6 | SD hierarchy: Parent→Child relationships correct | ☐ | |
| 7 | `venture_artifacts.quality_score` column exists | ☐ | |
| 8 | `venture_artifacts.validation_status` column exists | ☐ | |
| 9 | `check_venture_quality_gate()` function works | ☐ | |
| 10 | 4 CrewAI contracts in `leo_interfaces` | ☐ | |
| 11 | Contract specs contain valid JSON with required fields | ☐ | |
| 12 | No data corruption observed | ☐ | |
| 13 | Application still functions (smoke test) | ☐ | |

### 6.3 Chairman Declaration

```
I, Chairman of EHG, hereby confirm:

☐ DEV Migration Phase A has been executed successfully
☐ All post-migration verification queries passed
☐ No data corruption or unexpected side effects observed
☐ Kochel Integration configuration is visible and queryable
☐ Rollback procedure has been reviewed and is ready if needed

This DEV migration does NOT authorize PROD migration.
PROD migration requires separate Chairman approval.

Chairman Signature: _________________________
Date: ____________________
```

---

## Appendix A: Quick Reference Commands

```bash
# Connect to database
psql -h db.dedlbzhpgkmetvhbkyzq.supabase.co -p 5432 -d postgres -U postgres

# Run all migrations (in order)
cd /mnt/c/_EHG/EHG_Engineer/database/migrations
psql -f 20251206_lifecycle_stage_config.sql
psql -f 20251206_vision_transition_parent_orchestrator.sql
psql -f 20251209_venture_artifacts_quality_score.sql
psql -f 20251209_kochel_crewai_contracts.sql

# Quick verification
psql -c "SELECT COUNT(*) FROM lifecycle_stage_config;"  # Expect: 25
psql -c "SELECT COUNT(*) FROM strategic_directives_v2 WHERE id LIKE 'SD-VISION-TRANSITION-001%';"  # Expect: 12
psql -c "SELECT COUNT(*) FROM leo_interfaces WHERE prd_id = 'KOCHEL-INTEGRATION';"  # Expect: 4
```

---

**END OF RUNBOOK**

*Document generated: 2025-12-09*
*Governed by: ADR-002 (APPROVED)*
*Migration authorization: PENDING CHAIRMAN*
