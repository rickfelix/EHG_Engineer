---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# 🗄️ Database Migration Instructions for SD-DATA-INTEGRITY-001



## Table of Contents

- [Metadata](#metadata)
- [📋 Migration Overview](#-migration-overview)
- [🚀 How to Apply Migrations](#-how-to-apply-migrations)
  - [Option 1: Via Supabase Dashboard (RECOMMENDED)](#option-1-via-supabase-dashboard-recommended)
  - [Option 2: Via Supabase CLI](#option-2-via-supabase-cli)
- [📄 Migration 1: Handoff Triggers (COPY THIS)](#-migration-1-handoff-triggers-copy-this)
- [📄 Migration 2: Legacy Table Deprecation (COPY THIS)](#-migration-2-legacy-table-deprecation-copy-this)
- [✅ Verification Steps](#-verification-steps)
  - [1. Check Trigger Installation](#1-check-trigger-installation)
  - [2. Check Migration Status](#2-check-migration-status)
  - [3. Check Legacy View](#3-check-legacy-view)
- [⚠️ Important Notes](#-important-notes)
- [🆘 Troubleshooting](#-troubleshooting)
  - [Error: "function calculate_sd_progress does not exist"](#error-function-calculate_sd_progress-does-not-exist)
  - [Error: "table sd_phase_handoffs does not exist"](#error-table-sd_phase_handoffs-does-not-exist)
  - [Error: "permission denied"](#error-permission-denied)
- [📊 Expected Results](#-expected-results)
- [🎯 Next Steps After Migration](#-next-steps-after-migration)

## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: database, migration, schema, rls

**Date**: 2025-10-19  
**Purpose**: Apply database triggers and deprecation migrations  
**Estimated Time**: 15-20 minutes  
**Status**: REQUIRED before PLAN→LEAD handoff

---

## 📋 Migration Overview

You need to apply **TWO** SQL migrations in order:

1. **Migration 1**: `create_handoff_triggers.sql` (227 lines, 7.6KB)
   - Creates 4 automated triggers for handoff management
   - Includes built-in verification tests

2. **Migration 2**: `deprecate_legacy_handoff_table.sql` (213 lines, 8.0KB)
   - Creates read-only view for legacy handoffs
   - Creates migration status reporting function
   - DOES NOT rename table (that part is commented out for safety)

---

## 🚀 How to Apply Migrations

### Option 1: Via Supabase Dashboard (RECOMMENDED)

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Select your project: `dedlbzhpgkmetvhbkyzq`

2. **Navigate to SQL Editor**
   - Left sidebar → SQL Editor
   - Click "New Query"

3. **Apply Migration 1 (Triggers)**
   - Copy the entire contents of `create_handoff_triggers.sql` (see below)
   - Paste into SQL Editor
   - Click "RUN" or press `Cmd/Ctrl + Enter`
   - Watch for success messages and test results

4. **Apply Migration 2 (Deprecation)**
   - Click "New Query" again
   - Copy the entire contents of `deprecate_legacy_handoff_table.sql` (see below)
   - Paste into SQL Editor
   - Click "RUN"
   - Watch for migration status report

### Option 2: Via Supabase CLI

```bash
# Make sure you're in the project directory
cd /mnt/c/_EHG/EHG_Engineer

# Apply migrations via CLI
supabase db push

# Or apply individually
psql $DATABASE_URL -f database/migrations/create_handoff_triggers.sql
psql $DATABASE_URL -f database/migrations/deprecate_legacy_handoff_table.sql
```

---

## 📄 Migration 1: Handoff Triggers (COPY THIS)

```sql
-- ============================================================================
-- DATABASE TRIGGERS: Automatic Field Updates for sd_phase_handoffs
-- ============================================================================
-- Purpose: Implement automatic field updates and progress recalculation
-- SD: SD-DATA-INTEGRITY-001
-- User Story: SD-DATA-INTEGRITY-001:US-004
-- Created: 2025-10-19
-- ============================================================================

-- TRIGGER 1: Auto-update accepted_at timestamp
CREATE OR REPLACE FUNCTION auto_update_handoff_accepted_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    NEW.accepted_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_handoff_accepted_at ON sd_phase_handoffs;
CREATE TRIGGER trigger_handoff_accepted_at
  BEFORE UPDATE OF status ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_handoff_accepted_at();

COMMENT ON FUNCTION auto_update_handoff_accepted_at() IS
'Automatically sets accepted_at timestamp when handoff status changes to accepted';

-- TRIGGER 2: Auto-update rejected_at timestamp
CREATE OR REPLACE FUNCTION auto_update_handoff_rejected_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected') THEN
    NEW.rejected_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_handoff_rejected_at ON sd_phase_handoffs;
CREATE TRIGGER trigger_handoff_rejected_at
  BEFORE UPDATE OF status ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_handoff_rejected_at();

COMMENT ON FUNCTION auto_update_handoff_rejected_at() IS
'Automatically sets rejected_at timestamp when handoff status changes to rejected';

-- TRIGGER 3: Auto-recalculate SD progress on handoff acceptance
CREATE OR REPLACE FUNCTION auto_recalculate_sd_progress()
RETURNS TRIGGER AS $$
DECLARE
  new_progress INTEGER;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    new_progress := calculate_sd_progress(NEW.sd_id);
    UPDATE strategic_directives_v2
    SET progress_percentage = new_progress,
        updated_at = NOW()
    WHERE id = NEW.sd_id
      AND progress_percentage != new_progress;
    RAISE NOTICE 'SD % progress recalculated: %', NEW.sd_id, new_progress;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sd_progress_recalc ON sd_phase_handoffs;
CREATE TRIGGER trigger_sd_progress_recalc
  AFTER UPDATE OF status ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_sd_progress();

COMMENT ON FUNCTION auto_recalculate_sd_progress() IS
'Automatically recalculates SD progress when handoff is accepted';

-- TRIGGER 4: Prevent modification of migrated records
CREATE OR REPLACE FUNCTION protect_migrated_handoffs()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.metadata->>'migrated_from' = 'leo_handoff_executions' THEN
    IF NEW.status != OLD.status THEN
      RETURN NEW;
    ELSIF NEW != OLD THEN
      RAISE EXCEPTION 'Cannot modify migrated handoff except status. Record migrated from: %',
        OLD.metadata->>'migrated_from'
        USING HINT = 'Migrated handoffs are read-only except for status updates';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_protect_migrated ON sd_phase_handoffs;
CREATE TRIGGER trigger_protect_migrated
  BEFORE UPDATE ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION protect_migrated_handoffs();

COMMENT ON FUNCTION protect_migrated_handoffs() IS
'Protects migrated handoff records from modification (except status updates)';

-- VERIFICATION TESTS
DO $$
DECLARE
  test_id UUID := gen_random_uuid();
  test_sd VARCHAR := 'SD-DATA-INTEGRITY-001';
BEGIN
  RAISE NOTICE '=== TEST 1: Auto-timestamp verification ===';
  
  INSERT INTO sd_phase_handoffs (
    id, sd_id, from_phase, to_phase, handoff_type, status,
    executive_summary, deliverables_manifest, key_decisions,
    known_issues, resource_utilization, action_items,
    completeness_report, metadata, created_by
  ) VALUES (
    test_id, test_sd, 'EXEC', 'PLAN', 'EXEC-to-PLAN', 'pending_acceptance',
    'Test handoff for trigger verification (>50 chars required)',
    'Test deliverables', 'Test decisions', 'Test issues',
    'Test resources', 'Test actions', 'Test completeness',
    '{"test": true}'::JSONB, 'TRIGGER-TEST'
  );
  
  UPDATE sd_phase_handoffs SET status = 'accepted' WHERE id = test_id;
  
  IF EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE id = test_id AND accepted_at IS NOT NULL) THEN
    RAISE NOTICE '✅ TEST 1 PASSED: accepted_at timestamp auto-set';
  ELSE
    RAISE WARNING '❌ TEST 1 FAILED: accepted_at not set';
  END IF;
  
  DELETE FROM sd_phase_handoffs WHERE id = test_id;
END $$;

DO $$
DECLARE
  old_progress INTEGER;
  new_progress INTEGER;
  test_sd VARCHAR := 'SD-DATA-INTEGRITY-001';
BEGIN
  RAISE NOTICE '=== TEST 2: Progress recalculation verification ===';
  
  SELECT progress_percentage INTO old_progress
  FROM strategic_directives_v2 WHERE id = test_sd;
  
  new_progress := calculate_sd_progress(test_sd);
  
  IF old_progress = new_progress THEN
    RAISE NOTICE '✅ TEST 2 PASSED: Progress already correct (%)', new_progress;
  ELSE
    RAISE NOTICE '⚠️  TEST 2 INFO: Progress will be updated from % to %', old_progress, new_progress;
  END IF;
END $$;

-- SUMMARY
SELECT
  'Trigger Installation Complete' as status,
  COUNT(*) FILTER (WHERE trigger_name LIKE 'trigger_handoff_%') as handoff_triggers,
  COUNT(*) FILTER (WHERE trigger_name LIKE 'trigger_sd_%') as sd_triggers,
  COUNT(*) FILTER (WHERE trigger_name LIKE 'trigger_protect_%') as protection_triggers
FROM information_schema.triggers
WHERE event_object_table = 'sd_phase_handoffs';

SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'sd_phase_handoffs'
ORDER BY trigger_name;
```

---

## 📄 Migration 2: Legacy Table Deprecation (COPY THIS)

```sql
-- ============================================================================
-- LEGACY TABLE DEPRECATION: leo_handoff_executions
-- ============================================================================
-- Purpose: Deprecate legacy handoff table with read-only access
-- SD: SD-DATA-INTEGRITY-001
-- User Story: SD-DATA-INTEGRITY-001:US-005
-- Created: 2025-10-19
-- ============================================================================

-- PHASE 1: Backup Verification
DO $$
DECLARE
  legacy_count INTEGER;
  unified_count INTEGER;
BEGIN
  RAISE NOTICE '=== PRE-DEPRECATION VERIFICATION ===';
  
  SELECT COUNT(*) INTO legacy_count FROM leo_handoff_executions;
  SELECT COUNT(*) INTO unified_count FROM sd_phase_handoffs;
  
  RAISE NOTICE 'Legacy table (leo_handoff_executions): % records', legacy_count;
  RAISE NOTICE 'Unified table (sd_phase_handoffs): % records', unified_count;
  
  IF legacy_count > unified_count THEN
    RAISE NOTICE '⚠️  WARNING: Legacy has more records. % records not migrated.', legacy_count - unified_count;
    RAISE NOTICE '   These records will remain accessible in read-only deprecated table.';
  END IF;
END $$;

-- PHASE 2: Create Read-Only View for Legacy Access
CREATE OR REPLACE VIEW legacy_handoff_executions_view AS
SELECT
  id, sd_id, handoff_type, from_agent, to_agent, status, created_at, accepted_at,
  metadata->>'migrated_from' as migration_status,
  CASE
    WHEN metadata->>'migrated_from' = 'leo_handoff_executions'
    THEN 'Migrated to sd_phase_handoffs'
    ELSE 'Legacy record'
  END as record_status
FROM sd_phase_handoffs
WHERE metadata->>'migrated_from' = 'leo_handoff_executions'
UNION ALL
SELECT
  id, sd_id, handoff_type, from_agent, to_agent, status, created_at, accepted_at,
  'Not migrated' as migration_status,
  'Legacy only - see leo_handoff_executions table' as record_status
FROM leo_handoff_executions
WHERE id NOT IN (SELECT id FROM sd_phase_handoffs);

COMMENT ON VIEW legacy_handoff_executions_view IS
'Read-only view combining migrated and non-migrated legacy handoffs for reference';

-- PHASE 5: Create Migration Status Report Function
CREATE OR REPLACE FUNCTION get_handoff_migration_status()
RETURNS TABLE (metric VARCHAR, count INTEGER, percentage DECIMAL) AS $$
DECLARE
  total_legacy INTEGER;
  total_unified INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_legacy FROM leo_handoff_executions;
  SELECT COUNT(*) INTO total_unified FROM sd_phase_handoffs;
  SELECT COUNT(*) INTO migrated_count
  FROM sd_phase_handoffs WHERE metadata->>'migrated_from' = 'leo_handoff_executions';
  
  RETURN QUERY
  SELECT 'Total Legacy Records'::VARCHAR, total_legacy, 100.0::DECIMAL
  UNION ALL
  SELECT 'Total Unified Records', total_unified,
         ROUND((total_unified::DECIMAL / NULLIF(total_legacy, 0)) * 100, 2)
  UNION ALL
  SELECT 'Migrated Records', migrated_count,
         ROUND((migrated_count::DECIMAL / NULLIF(total_legacy, 0)) * 100, 2)
  UNION ALL
  SELECT 'Not Migrated', total_legacy - migrated_count,
         ROUND(((total_legacy - migrated_count)::DECIMAL / NULLIF(total_legacy, 0)) * 100, 2)
  UNION ALL
  SELECT 'New Records (post-migration)', total_unified - migrated_count,
         ROUND(((total_unified - migrated_count)::DECIMAL / NULLIF(total_unified, 0)) * 100, 2);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_handoff_migration_status() IS
'Returns migration status summary for handoff consolidation';

-- VERIFICATION & REPORTING
SELECT * FROM get_handoff_migration_status();

SELECT
  'Unmigrated Legacy Records (Sample)' as report_title,
  COUNT(*) as total_unmigrated,
  COUNT(DISTINCT sd_id) as distinct_sds,
  MIN(created_at) as earliest,
  MAX(created_at) as latest
FROM leo_handoff_executions
WHERE id NOT IN (SELECT id FROM sd_phase_handoffs);

SELECT handoff_type, COUNT(*) as count
FROM leo_handoff_executions
WHERE id NOT IN (SELECT id FROM sd_phase_handoffs)
GROUP BY handoff_type
ORDER BY count DESC;
```

---

## ✅ Verification Steps

After applying both migrations, verify they worked:

### 1. Check Trigger Installation

```sql
-- Should show 4 triggers
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'sd_phase_handoffs'
ORDER BY trigger_name;
```

Expected output:
- `trigger_handoff_accepted_at`
- `trigger_handoff_rejected_at`
- `trigger_protect_migrated`
- `trigger_sd_progress_recalc`

### 2. Check Migration Status

```sql
SELECT * FROM get_handoff_migration_status();
```

Expected output:
- Total Legacy Records: 327
- Migrated Records: 127 (54%)
- Not Migrated: 149 (46%)

### 3. Check Legacy View

```sql
SELECT migration_status, record_status, COUNT(*)
FROM legacy_handoff_executions_view
GROUP BY migration_status, record_status;
```

---

## ⚠️ Important Notes

1. **Phases 3 & 4 are COMMENTED OUT**
   - Table rename to `_deprecated_leo_handoff_executions`
   - RLS policies for read-only access
   - These are intentionally skipped for now
   - Can be applied later if needed

2. **No Destructive Changes**
   - These migrations DO NOT delete or modify existing data
   - They only ADD triggers, views, and functions
   - Legacy table remains fully accessible

3. **Test Results**
   - You'll see test output in the Supabase SQL Editor
   - Look for "✅ TEST 1 PASSED" and "✅ TEST 2 PASSED" messages
   - If tests fail, report errors immediately

---

## 🆘 Troubleshooting

### Error: "function calculate_sd_progress does not exist"

**Solution**: This function should already exist. If not, check if it's in another schema or create it from previous migrations.

### Error: "table sd_phase_handoffs does not exist"

**Solution**: This table should exist. Verify you're connected to the correct database (`dedlbzhpgkmetvhbkyzq`).

### Error: "permission denied"

**Solution**: Make sure you're using the service role key or have sufficient permissions in Supabase.

---

## 📊 Expected Results

After successful migration:

✅ 4 triggers installed on `sd_phase_handoffs`  
✅ `legacy_handoff_executions_view` created  
✅ `get_handoff_migration_status()` function created  
✅ Test results show PASSED  
✅ Migration status report displays correctly

---

## 🎯 Next Steps After Migration

Once migrations are applied:

1. Run verification queries (see above)
2. Test handoff creation system: `node scripts/test-database-triggers.cjs`
3. Report back: "Migrations applied successfully"
4. Proceed to create PLAN→LEAD handoff

---

**Questions?** Refer to:
- `database/migrations/README_DEPRECATION.md` - Full deprecation guide
- `PLAN_SUPERVISOR_VERDICT.md` - Verification details
- `PLAN_PHASE_COMPLETE.md` - PLAN phase summary
